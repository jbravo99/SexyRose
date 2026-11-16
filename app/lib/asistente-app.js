// Asistente de cuenta: la parte que corre en el APP (server.js), no en el agente.
//   - Botones "Acreditar" / "Rechazar" de Telegram (el app es el único que lee getUpdates): solo del chat vinculado,
//     con un token al azar guardado en la base (hash) e idempotentes. Acreditar = creditos.confirmarPedido (por
//     'telegram'); rechazar = creditos.rechazarPedido.
//   - Pedido acreditado o rechazado (desde Telegram o desde el admin) → mensaje a la acompañante por WhatsApp
//     (fila en asistente_salida que lee el agente; NOTIFY la despierta al instante).
//   - Email con el código de 6 números para identificar el chat (lo pide el agente por asistente_salida).
//   - Limpieza: mensajes y archivos del chat de más de 90 días.
import crypto from 'node:crypto';
import { RETENCION_DIAS, CODIGO_EMAIL_MIN, escucharSalida, hashCodigo, hashToken, leerAjustes } from './asistente-comun.js';
import { texto } from './asistente-textos.js';

const fmtNum = (n) => { const x = Math.round(Number(n) * 100) / 100; return Number.isInteger(x) ? String(x) : x.toFixed(2); };

export function createAsistenteApp({ pool, creditos, telegram, privado, sendMail, emailBasico, siteUrl = 'https://sexyrose.net', databaseUrl = '', log = () => {}, escucharCadaMs = 30000 }) {
  const url = String(siteUrl || 'https://sexyrose.net').replace(/\/+$/, '');
  let escucha = null;

  // ---------- Botones de Telegram ----------
  async function alCallback(cq) {
    const m = /^sr:([ar]):([A-Za-z0-9_-]{16,64})$/.exec(String(cq.data || ''));
    if (!m) return { aviso: 'Botón no válido.' };
    const { rows } = await pool.query(
      'SELECT a.*, p.codigo FROM asistente_tg_acciones a JOIN pedidos_creditos p ON p.id = a.pedido_id WHERE a.token_hash = $1', [hashToken(m[2])]);
    const t = rows[0];
    if (!t || t.accion !== (m[1] === 'a' ? 'acreditar' : 'rechazar')) return { aviso: 'Botón vencido o no válido.' };
    const original = String((cq.message && (cq.message.caption || cq.message.text)) || '');
    let aviso; let final;
    try {
      if (t.accion === 'acreditar') {
        const r = await creditos.confirmarPedido(t.pedido_id, { por: 'telegram' });
        aviso = `Listo: ${fmtNum(r.total / 100)} créditos acreditados (${t.codigo}).`;
        final = `Acreditado desde Telegram (${fmtNum(r.total / 100)} créditos).`;
      } else {
        await creditos.rechazarPedido(t.pedido_id, { por: 'telegram' });
        aviso = `Pedido ${t.codigo} rechazado.`;
        final = 'Rechazado desde Telegram.';
      }
      log(`asistente: pedido ${t.accion === 'acreditar' ? 'acreditado' : 'rechazado'} desde Telegram`);
    } catch (e) {
      if (!e.expose) throw e;
      aviso = e.message; // ej. "El pedido ya está confirmado." (otro toque o el admin): no hace nada dos veces
      final = e.message;
    }
    await pool.query('UPDATE asistente_tg_acciones SET usado = COALESCE(usado, now()) WHERE pedido_id = $1', [t.pedido_id]);
    return { aviso, texto: `${original}\n\n${final}`.trim() };
  }

  // ---------- Aviso por WhatsApp cuando un pedido se acredita o se rechaza ----------
  async function pedidoCambio({ pedido, estado, total, motivo }) {
    if (!pedido || !['confirmado', 'rechazado'].includes(estado)) return null;
    const aj = await leerAjustes(pool);
    if (!aj.activo) return null;
    let { rows } = await pool.query(
      `SELECT c.* FROM asistente_conv_pedidos cp JOIN asistente_conversaciones c ON c.id = cp.conversacion_id
       WHERE cp.pedido_id = $1 ORDER BY c.ultimo_mensaje DESC NULLS LAST LIMIT 1`, [pedido.id]);
    if (!rows[0]) ({ rows } = await pool.query('SELECT * FROM asistente_conversaciones WHERE cuenta_id = $1 ORDER BY ultimo_mensaje DESC NULLS LAST LIMIT 1', [pedido.cuenta_id]));
    const conv = rows[0];
    if (!conv) return null;
    const tot = total != null ? total : Number(pedido.base_centavos) + Number(pedido.bonus_centavos);
    const t = estado === 'confirmado'
      ? texto(conv.idioma, 'acreditados', { creditos: fmtNum(tot / 100), codigo: pedido.codigo, url })
      : texto(conv.idioma, 'rechazado', { codigo: pedido.codigo, motivo: motivo || '' });
    const r = await pool.query(
      `INSERT INTO asistente_salida (destino, tipo, conversacion_id, datos, clave) VALUES ('whatsapp', 'mensaje', $1, $2, $3)
       ON CONFLICT (clave) DO NOTHING RETURNING id`, [conv.id, JSON.stringify({ texto: t }), `pedido:${pedido.id}:${estado}`]);
    return r.rows[0] ? r.rows[0].id : null;
  }

  // ---------- Bandeja de salida del app: email con el código ----------
  async function procesarSalidaApp() {
    const { rows } = await pool.query("SELECT * FROM asistente_salida WHERE destino = 'app' AND procesado IS NULL ORDER BY id LIMIT 20");
    for (const r of rows) {
      const marcar = (error = null) => pool.query('UPDATE asistente_salida SET procesado = now(), error = $2 WHERE id = $1 AND procesado IS NULL', [r.id, error]);
      if (r.tipo !== 'codigo_email') { await marcar('tipo desconocido'); continue; }
      const id = r.datos && r.datos.codigoId;
      const { rows: c } = await pool.query(
        `SELECT ce.id, c.email FROM asistente_codigos_email ce JOIN cuentas c ON c.id = ce.cuenta_id
         WHERE ce.id = $1 AND ce.usado IS NULL AND ce.enviado IS NULL AND ce.expira > now() AND c.estado = 'activa'`, [id]);
      if (!c[0]) { await marcar('sin código vigente'); continue; }
      // Marca primero (si hay dos lectores, solo uno manda el email)
      const tomado = await pool.query('UPDATE asistente_salida SET procesado = now() WHERE id = $1 AND procesado IS NULL RETURNING id', [r.id]);
      if (!tomado.rows[0]) continue;
      const codigo = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
      await pool.query('UPDATE asistente_codigos_email SET codigo_hash = $2, enviado = now() WHERE id = $1', [c[0].id, hashCodigo(c[0].id, codigo)]);
      try {
        await sendMail({
          to: c[0].email, subject: 'Tu código para el chat de SexyRose',
          ...emailBasico({
            titulo: 'Tu código para el chat de WhatsApp',
            parrafos: [`Tu código es: ${codigo}`, `Escribilo en el chat de WhatsApp de SexyRose. Vence en ${CODIGO_EMAIL_MIN} minutos.`, 'Si no lo pediste, ignorá este email: nadie puede entrar a tu cuenta con este código.'],
          }),
        });
        log('asistente: email con código enviado');
      } catch (e) {
        log('asistente: no se pudo mandar el email con el código:', e.code || e.message);
      }
    }
  }

  // ---------- Limpieza (a los 90 días) ----------
  async function purgar() {
    const { rows } = await pool.query(
      `DELETE FROM asistente_mensajes WHERE creado < now() - make_interval(days => $1) RETURNING media_ruta`, [RETENCION_DIAS]);
    let archivos = 0;
    for (const r of rows) {
      if (!r.media_ruta) continue;
      // Un comprobante adjunto a un pedido queda con el pedido (como los que se suben desde la web)
      const usado = await pool.query('SELECT 1 FROM pedidos_creditos WHERE comprobante_ruta = $1 LIMIT 1', [r.media_ruta]);
      if (!usado.rows[0] && privado && await privado.borrar(r.media_ruta)) archivos++;
    }
    const conv = await pool.query(
      `DELETE FROM asistente_conversaciones c WHERE COALESCE(c.ultimo_mensaje, c.creado) < now() - make_interval(days => $1)
         AND NOT EXISTS (SELECT 1 FROM asistente_mensajes m WHERE m.conversacion_id = c.id)`, [RETENCION_DIAS]);
    await pool.query("DELETE FROM asistente_codigos_email WHERE creado < now() - interval '2 days'");
    await pool.query("DELETE FROM asistente_salida WHERE procesado IS NOT NULL AND procesado < now() - interval '7 days'");
    await pool.query(`DELETE FROM asistente_tg_acciones a WHERE a.creado < now() - make_interval(days => $1)`, [RETENCION_DIAS]);
    if (rows.length || conv.rowCount) log(`asistente: limpieza de más de ${RETENCION_DIAS} días: ${rows.length} mensajes, ${archivos} archivos, ${conv.rowCount} chats`);
    return { mensajes: rows.length, archivos, chats: conv.rowCount };
  }

  function iniciar({ escuchar = true, listo = () => true } = {}) {
    if (telegram) {
      telegram.setAlCallback(alCallback);
      telegram.setContinuo(async () => listo() && (await leerAjustes(pool)).activo);
    }
    creditos.setAlCambiarPedido(pedidoCambio);
    if (escuchar) escucha = escucharSalida({ databaseUrl, destino: 'app', alAvisar: () => (listo() ? procesarSalidaApp() : null), log, cadaMs: escucharCadaMs });
  }
  async function cerrar() { if (escucha) await escucha.cerrar(); escucha = null; }

  return { alCallback, pedidoCambio, procesarSalidaApp, purgar, iniciar, cerrar };
}
