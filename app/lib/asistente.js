// Asistente de cuenta por WhatsApp: el núcleo (corre en el contenedor "agente", app/agente.js).
// Recibe los mensajes ya traducidos de WhatsApp (lib/asistente-whatsapp.js) y responde con enviar(jid, texto).
//
// Primero lo determinístico (sin IA): código de pedido SR-1234 → datos para transferir (con cuenta en dólares cargada,
// antes pregunta "¿pesos o dólares?" y toma la respuesta); foto/PDF → comprobante adjunto
// al pedido + aviso a Juan por Telegram con botones; código de 6 números → identificación por email. Lo demás va a
// Claude (lib/asistente-llm.js), que solo actúa con herramientas cuyos permisos se controlan acá:
//   - chat sin identificar: precios, ayuda y SOLO los pedidos cuyo código se escribió en este chat;
//   - chat identificado (teléfono del perfil o código por email): además estado de la cuenta y pedidos nuevos.
// Los créditos NUNCA los acredita el asistente: solo Juan (botón "Acreditar" de Telegram o el admin).
// Logs sin datos personales (ni teléfonos, ni textos, ni emails).
import crypto from 'node:crypto';
import {
  CODIGO_EMAIL_INTENTOS, LIMITE_HORA, MAX_MEDIA, SILENCIO_JUAN_HORAS, hashCodigo, hashToken, leerAjustes, sinContacto, telefonoComparable,
} from './asistente-comun.js';
import { texto, presentacion, detectarIdioma, preguntaSiEsBot, codigoEnTexto, monedaEnTexto, esCierre } from './asistente-textos.js';
import { textoAyuda } from './asistente-ayuda.js';
import { promptSistema, limpiarRespuesta, HERRAMIENTAS, HERRAMIENTA_NO_CONTACTAR } from './asistente-llm.js';
import { creditosEnOtroChip, letraDe } from './chips.js';
// Herramientas de la compra de créditos: en un chip de captación, si hay chip de créditos, no se ofrecen
const SOLO_CHIP_CREDITOS = ['crear_pedido', 'datos_transferencia'];
import {
  RESPUESTA_NO_ESCRIBIR, RESPUESTA_ORIGEN, contactoPorTelefono, esMensajeCaptacion, leerAjustesCaptacion, respuestaInvitada,
} from './captacion.js';
import { tipoPorFirma } from './privado.js';
import { asignarCuenta, cuentaDelPedido, hayCuentaActiva } from './cuentas-transferencia.js';
import { arsSugerido, fmtCreditos } from './creditos.js';
import { PLAN_NOMBRE } from './planes.js';
import { ventaContenidoDisponible } from './contenido.js';
import { prelanzamientoEn } from './prelanzamiento.js';

const EMAIL_RE = /^[^\s@<>()[\]",;:\\]+@[^\s@<>()[\]",;:\\]+\.[^\s@<>()[\]",;:\\]{2,}$/;
const EXT_OK = ['jpg', 'png', 'webp', 'pdf', 'heic'];
const fmtNum = (n) => { const x = Math.round(Number(n) * 100) / 100; return Number.isInteger(x) ? String(x) : x.toFixed(2); };
const fmtArs = (n) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n);
const fmtFecha = (d) => (d ? new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: 'numeric', month: 'numeric', year: 'numeric' }).format(new Date(d)) : null);
const ESTADO_PERFIL = { borrador: 'Borrador (le falta completar algo; pasa solo a revisión cuando esté completo)', en_revision: 'En revisión', publicado: 'Publicado', rechazado: 'Rechazado', pausado: 'Pausado', suspendido: 'Suspendido' };
const ESTADO_VERIF = { sin_enviar: 'Sin enviar', pendiente: 'Enviada, en revisión', verificada: 'Verificada', rechazada: 'Rechazada' };
const SIN_IA_CADA_MS = 30 * 60 * 1000;
const MAX_RESPUESTA_MONEDA = 80; // "en pesos", "mejor en dólares": más largo (o ambiguo) lo resuelve la IA

export class NoConectado extends Error { constructor() { super('WhatsApp no está conectado'); this.code = 'NO_CONECTADO'; } }

// pausaRecuperar: espera entre un chat y otro al responder lo que llegó sin conexión (para no mandar todo de golpe)
export function createAsistente({ pool, creditos, planes, privado, telegram, llm = null, siteUrl = 'https://sexyrose.net', log = () => {}, enviar = null,
  pausaRecuperar = () => new Promise((r) => setTimeout(r, 40000 + Math.floor(Math.random() * 35000))) }) {
  const url = String(siteUrl || 'https://sexyrose.net').replace(/\/+$/, '');
  let enviarWa = enviar;
  const colas = new Map();

  // Un chat a la vez (los mensajes de un mismo número se procesan en orden).
  function enCola(clave, fn) {
    const previa = colas.get(clave) || Promise.resolve();
    const p = previa.catch(() => {}).then(fn);
    const fin = p.catch(() => {}).finally(() => { if (colas.get(clave) === fin) colas.delete(clave); });
    colas.set(clave, fin);
    return p;
  }

  // ---------- Conversaciones y mensajes ----------
  // lid: dirección `…@lid` del mismo chat cuando ya se sabe su teléfono. Si el chat empezó cuando WhatsApp todavía no
  // daba el teléfono (quedó guardado con el LID), pasa a guardarse con el teléfono: mismo historial, y se identifica.
  // Varios chips (19/11/2026): cada conversación es de un chip (chip + jid); el mismo teléfono puede tener un chat con cada uno.
  async function conversacion(jid, telefono, lid = null, chip = 1) {
    if (lid && lid !== jid) {
      await pool.query(
        `UPDATE asistente_conversaciones SET jid = $1, telefono = COALESCE(telefono, $3), actualizado = now()
          WHERE chip = $4 AND jid = $2 AND NOT EXISTS (SELECT 1 FROM asistente_conversaciones WHERE chip = $4 AND jid = $1)`, [jid, lid, telefono || null, chip]);
    }
    const { rows } = await pool.query(
      `INSERT INTO asistente_conversaciones (jid, telefono, chip) VALUES ($1, $2, $3)
       ON CONFLICT (chip, jid) DO UPDATE SET telefono = COALESCE(asistente_conversaciones.telefono, EXCLUDED.telefono)
       RETURNING *`, [jid, telefono || null, chip]);
    return rows[0];
  }
  const claveChat = (chip, jid) => `${Number(chip) || 1}:${jid}`;
  const releer = async (id) => (await pool.query('SELECT * FROM asistente_conversaciones WHERE id = $1', [id])).rows[0] || null;
  async function guardarMensaje(conv, { dir, origen, tipo = 'texto', texto: t = null, mediaRuta = null, waId = null }) {
    const { rows } = await pool.query(
      `INSERT INTO asistente_mensajes (conversacion_id, dir, origen, tipo, texto, media_ruta, wa_id) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (conversacion_id, wa_id) WHERE wa_id IS NOT NULL DO NOTHING RETURNING *`,
      [conv.id, dir, origen, tipo, t === null ? null : String(t).slice(0, 4000), mediaRuta, waId]);
    if (rows[0]) await pool.query('UPDATE asistente_conversaciones SET ultimo_mensaje = now(), actualizado = now() WHERE id = $1', [conv.id]);
    return rows[0] || null;
  }
  const silenciado = (c) => !c || c.estado === 'humano' || (c.silenciado_hasta && new Date(c.silenciado_hasta) > new Date());

  async function nombreCuenta(cuentaId) {
    if (!cuentaId) return '';
    const { rows } = await pool.query("SELECT datos->>'displayName' AS n FROM perfiles WHERE cuenta_id = $1", [cuentaId]);
    return (rows[0] && rows[0].n) || '';
  }

  // Responde en el chat. La primera respuesta de cada sesión (sin respuestas del bot en 24 h) empieza con la
  // presentación como IA. forzar = mandar aunque el chat ya esté en "humano" (aviso de que pasa a una persona).
  async function responder(conv, t, { forzar = false } = {}) {
    const c = await releer(conv.id);
    if (!c || (!forzar && silenciado(c))) return false;
    if (!enviarWa) throw new NoConectado();
    const { rows } = await pool.query(
      "SELECT 1 FROM asistente_mensajes WHERE conversacion_id = $1 AND origen = 'bot' AND creado > now() - interval '24 hours' LIMIT 1", [c.id]);
    const final = rows[0] ? String(t) : `${presentacion(c.idioma)}\n\n${t}`;
    const waId = await enviarWa(c.jid, final, Number(c.chip) || 1);
    await guardarMensaje(c, { dir: 'out', origen: 'bot', texto: final, waId: waId || null });
    return true;
  }
  const decir = (conv, clave, datos, op) => responder(conv, texto(conv.idioma, clave, { url, ...(datos || {}) }), op);

  // ---------- Avisos a Juan (Telegram, nunca con datos de contacto) ----------
  async function avisarJuan(conv, titulo, motivo, tipo) {
    const nombre = await nombreCuenta(conv.cuenta_id);
    const t = `${titulo}\n${motivo ? `Motivo: ${sinContacto(motivo).slice(0, 300)}\n` : ''}Cuenta: ${nombre || (conv.cuenta_id ? 'sin nombre artístico' : 'sin identificar')}\n`
      + `Chip ${letraDe(conv.chip)}. Respondé desde el teléfono de ese chip. Para devolver el chat al asistente: Admin → Mensajería.`;
    if (telegram) await telegram.enviar({ texto: t, tipo });
  }
  async function derivar(conv, motivo) {
    await decir(conv, 'derivado', {}, { forzar: false }).catch((e) => log('asistente: no se pudo avisar la derivación:', e.code || e.message));
    await pool.query("UPDATE asistente_conversaciones SET estado = 'humano', motivo_humano = $2, actualizado = now() WHERE id = $1", [conv.id, String(motivo || '').slice(0, 200)]);
    await avisarJuan(conv, 'Asistente: un chat de WhatsApp pasa a vos.', motivo, 'asistente_derivacion');
    log('asistente: chat derivado a una persona');
  }
  async function alertar(conv, tipo, motivo) {
    await decir(conv, 'alertaNeutral').catch((e) => log('asistente: no se pudo responder la alerta:', e.code || e.message));
    await pool.query("UPDATE asistente_conversaciones SET estado = 'humano', motivo_humano = $2, actualizado = now() WHERE id = $1", [conv.id, ('Alerta: ' + (tipo || 'otro')).slice(0, 200)]);
    await avisarJuan(conv, `ALERTA URGENTE del asistente (${tipo || 'otro'}). El chat quedó en pausa para que lo atiendas vos.`, motivo, 'asistente_alerta');
    log('asistente: alerta urgente enviada');
  }
  async function sinIa(conv, motivo) {
    const c = await releer(conv.id);
    if (c.aviso_sin_ia && Date.now() - new Date(c.aviso_sin_ia).getTime() < SIN_IA_CADA_MS) return;
    await pool.query('UPDATE asistente_conversaciones SET aviso_sin_ia = now() WHERE id = $1', [c.id]);
    await decir(c, 'sinIa');
    await avisarJuan(c, `Asistente sin IA (${motivo}): hay una consulta de WhatsApp para responder.`, null, 'asistente_derivacion');
  }

  // ---------- Pedidos ----------
  async function pedidoPorCodigo(codigo) {
    const { rows } = await pool.query(
      "SELECT * FROM pedidos_creditos WHERE codigo = $1 ORDER BY (estado = 'pendiente') DESC, creado DESC LIMIT 1", [codigo]);
    return rows[0] || null;
  }
  const asociar = (conv, pedidoId) => pool.query(
    'INSERT INTO asistente_conv_pedidos (conversacion_id, pedido_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [conv.id, pedidoId]);
  async function autorizado(conv, p) {
    if (!p) return false;
    const c = await releer(conv.id);
    if (c.cuenta_id && c.cuenta_id === p.cuenta_id) return true;
    const { rows } = await pool.query('SELECT 1 FROM asistente_conv_pedidos WHERE conversacion_id = $1 AND pedido_id = $2', [conv.id, p.id]);
    return Boolean(rows[0]);
  }
  async function pendientesAutorizados(conv) {
    const c = await releer(conv.id);
    const { rows } = await pool.query(
      `SELECT pc.* FROM pedidos_creditos pc WHERE pc.estado = 'pendiente'
         AND (pc.cuenta_id = $2 OR EXISTS (SELECT 1 FROM asistente_conv_pedidos cp WHERE cp.conversacion_id = $1 AND cp.pedido_id = pc.id))
       ORDER BY pc.creado`, [c.id, c.cuenta_id]);
    return rows;
  }
  const packDe = (p, lang) => (p.pack_id ? p.pack_nombre : texto(lang, 'cargaMedida'));
  const creditosDe = (p) => fmtNum((Number(p.base_centavos) + Number(p.bonus_centavos)) / 100);

  const basePedido = (conv, p) => ({ codigo: p.codigo, pack: packDe(p, conv.idioma), creditos: creditosDe(p) });
  // moneda 'USD' = cuenta en dólares (monto = lo que paga en USD); si no, la de pesos con el monto pasado a pesos.
  // La cuenta sale de la lista de esa moneda, por turno entre las activas (lib/cuentas-transferencia.js), y el pedido
  // se queda con ella: pedirlos de nuevo devuelve la misma, aunque después se pause o se borre. A la acompañante solo
  // le llegan el alias y el titular de su pedido.
  async function textoDatos(conv, p, moneda) {
    const base = basePedido(conv, p);
    const enUnRato = (motivo) => ({ completo: false, motivo, texto: texto(conv.idioma, 'datosEnUnRato', base) });
    if (moneda === 'USD') {
      const c = await asignarCuenta(pool, p.id, 'USD');
      if (!c) return enUnRato('No hay ninguna cuenta activa en dólares (Admin → Créditos → Banco).');
      return { completo: true, texto: texto(conv.idioma, 'datosPedidoUsd', { ...base, usd: fmtNum(p.paga_usd), alias: c.alias, titular: c.titular }) };
    }
    const cot = await creditos.cotizacion();
    const ars = arsSugerido(p.paga_usd, cot.arsPorUsd);
    if (!ars) return enUnRato('Falta la cotización del dólar (Admin → Precios).');
    const c = await asignarCuenta(pool, p.id, 'ARS');
    if (!c) return enUnRato('No hay ninguna cuenta activa en pesos (Admin → Créditos → Banco).');
    return { completo: true, texto: texto(conv.idioma, 'datosPedido', { ...base, ars: fmtArs(ars), usd: fmtNum(p.paga_usd), alias: c.alias, titular: c.titular }) };
  }
  async function mandarDatos(conv, p, moneda = 'ARS') {
    const d = await textoDatos(conv, p, moneda);
    await responder(conv, d.texto);
    if (!d.completo) {
      await avisarJuan(conv, `Asistente: no pude pasar los datos para transferir del pedido ${p.codigo}.`,
        `${d.motivo} Pasale el monto y los datos vos.`, 'asistente_derivacion');
    }
    return d.completo;
  }
  // Se puede transferir en dólares: hay alguna cuenta activa en dólares, o a este pedido ya se le pasó una (la conserva).
  const usdPosible = async (p) => (await hayCuentaActiva(pool, 'USD')) || Boolean(await cuentaDelPedido(pool, p.id, 'USD'));
  // Datos para pagar un pedido pendiente. Sin cuenta en dólares: los de pesos, como siempre (no se guarda moneda).
  // Con cuenta en dólares: la moneda pedida o la que ya eligió para ese pedido; si no hay ninguna, pregunta
  // "¿Vas a transferir en pesos o en dólares?" y queda esperando la respuesta. Devuelve 'pregunta' | 'datos'.
  async function ofrecerPago(conv, p, { moneda = null } = {}) {
    if (!(await usdPosible(p))) { await mandarDatos(conv, p, 'ARS'); return 'datos'; }
    const m = moneda === 'ARS' || moneda === 'USD' ? moneda : (p.moneda_asistente || null);
    if (!m) {
      await pool.query('UPDATE asistente_conversaciones SET pago_pedido_id = $2, pago_esperando_moneda = true, actualizado = now() WHERE id = $1', [conv.id, p.id]);
      await decir(conv, 'preguntaMoneda', basePedido(conv, p));
      return 'pregunta';
    }
    await elegirMoneda(conv, p, m);
    return 'datos';
  }
  async function elegirMoneda(conv, p, m) {
    await pool.query("UPDATE pedidos_creditos SET moneda_asistente = $2 WHERE id = $1 AND estado = 'pendiente'", [p.id, m]);
    await pool.query('UPDATE asistente_conversaciones SET pago_pedido_id = $2, pago_esperando_moneda = false, actualizado = now() WHERE id = $1', [conv.id, p.id]);
    log('asistente: moneda elegida para un pedido');
    return mandarDatos(conv, { ...p, moneda_asistente: m }, m);
  }
  // Respuesta "pesos" / "dólares" (sin código de pedido): a la pregunta de la moneda, o para cambiarla después
  // ("mejor en dólares"). Solo con cuenta en dólares y el pedido del chat todavía pendiente. Devuelve true si la tomó.
  async function respuestaMoneda(conv, txt) {
    if (txt.length > MAX_RESPUESTA_MONEDA) return false;
    const m = monedaEnTexto(txt);
    if (m !== 'ARS' && m !== 'USD') return false;
    const c = await releer(conv.id);
    if (!c.pago_pedido_id) return false;
    const { rows } = await pool.query('SELECT * FROM pedidos_creditos WHERE id = $1', [c.pago_pedido_id]);
    const p = rows[0];
    if (!p || p.estado !== 'pendiente' || p.comprobante_ruta || !(await autorizado(c, p))) return false;
    if (!(await usdPosible(p))) return false;
    // Ya eligió esa misma moneda y no se le preguntó nada: no repite los datos (lo charla la IA)
    if (!c.pago_esperando_moneda && p.moneda_asistente === m) return false;
    await elegirMoneda(c, p, m);
    return true;
  }

  async function manejarCodigo(conv, codigo) {
    const p = await pedidoPorCodigo(codigo);
    if (!p) return decir(conv, 'pedidoNoEncontrado', { codigo });
    await asociar(conv, p.id);
    const c = await releer(conv.id);
    if (c.comprobante_pendiente && p.estado === 'pendiente') {
      const { rows } = await pool.query('SELECT media_ruta FROM asistente_mensajes WHERE id = $1 AND conversacion_id = $2', [c.comprobante_pendiente, c.id]);
      const ruta = rows[0] && rows[0].media_ruta;
      const buf = ruta ? await leerPrivado(ruta) : null;
      if (buf) return adjuntar(c, p, { ruta, buf, ext: ruta.split('.').pop() });
    }
    if (p.estado === 'pendiente') return ofrecerPago(c, p);
    if (p.estado === 'confirmado') return decir(c, 'pedidoConfirmado', { codigo });
    if (p.estado === 'vencido') return decir(c, 'pedidoVencido', { codigo });
    if (p.estado === 'rechazado') return decir(c, 'pedidoRechazadoYa', { codigo });
    return decir(c, 'pedidoCancelado', { codigo });
  }

  async function leerPrivado(ruta) {
    const f = await privado.abrir(ruta);
    if (!f) return null;
    const partes = [];
    for await (const ch of f.stream) partes.push(ch);
    return Buffer.concat(partes);
  }

  // ---------- Comprobantes ----------
  async function adjuntar(conv, p, { ruta, buf, ext }) {
    await creditos.adjuntarComprobante(p.cuenta_id, p.id, { comprobanteRuta: ruta });
    await pool.query('UPDATE asistente_conversaciones SET comprobante_pendiente = NULL WHERE id = $1', [conv.id]);
    await decir(conv, 'comprobanteRecibido', { codigo: p.codigo });
    await avisarComprobante(p, { buf, ext }).catch((e) => log('asistente: no se pudo avisar el comprobante por Telegram:', e.code || e.message));
    log('asistente: comprobante adjuntado a un pedido');
  }
  async function avisarComprobante(p, { buf, ext }) {
    if (!telegram) return;
    const ta = crypto.randomBytes(16).toString('base64url');
    const tr = crypto.randomBytes(16).toString('base64url');
    await pool.query("INSERT INTO asistente_tg_acciones (token_hash, pedido_id, accion) VALUES ($1, $3, 'acreditar'), ($2, $3, 'rechazar')",
      [hashToken(ta), hashToken(tr), p.id]);
    const cot = await creditos.cotizacion();
    const ars = arsSugerido(p.paga_usd, cot.arsPorUsd);
    const nombre = await nombreCuenta(p.cuenta_id);
    const cuentas = await cuentaDelPedido(pool, p.id);
    // Con moneda elegida por el asistente, el monto en esa moneda; si no (sin cuenta en dólares), como siempre.
    const monto = p.moneda_asistente === 'USD' ? `en dólares: USD ${fmtNum(p.paga_usd)}`
      : p.moneda_asistente === 'ARS' ? `en pesos: ${ars ? `ARS ${fmtArs(ars)} (USD ${fmtNum(p.paga_usd)})` : `USD ${fmtNum(p.paga_usd)}, sin cotización para pasarlo a pesos`}`
        : `USD ${fmtNum(p.paga_usd)}${ars ? ` · ARS ${fmtArs(ars)}` : ''}`;
    const caption = `Comprobante recibido por WhatsApp\nPedido ${p.codigo} · ${packDe(p, 'es')}\n${creditosDe(p)} créditos · ${monto}\n`
      + `Cuenta: ${nombre || 'sin nombre artístico'}\n${lineaCuentaTransferencia(cuentas, p.moneda_asistente)}\n`
      + 'Acreditá solo cuando el pago esté en tu cuenta.';
    await telegram.enviar({
      texto: caption, tipo: 'asistente_comprobante',
      botones: [[{ text: 'Acreditar', callback_data: 'sr:a:' + ta }, { text: 'Rechazar', callback_data: 'sr:r:' + tr }]],
      archivo: { buffer: buf, ext, nombre: `comprobante-${p.codigo}.${ext}` },
    });
  }
  // Para el aviso de Telegram: a qué cuenta tenía que transferir (la de la moneda elegida; si cambió, también la otra)
  function lineaCuentaTransferencia(c, moneda) {
    const usa = moneda || 'ARS';
    const otra = usa === 'ARS' ? 'USD' : 'ARS';
    const fmt = (x) => `${x.alias} · ${x.titular}`;
    if (!c[usa] && !c[otra]) return 'Alias que se le pasó: ninguno (no recibió los datos por el asistente)';
    if (!c[usa]) return `Alias que se le pasó (en ${otra === 'USD' ? 'dólares' : 'pesos'}): ${fmt(c[otra])}`;
    return `Alias que se le pasó: ${fmt(c[usa])}${c[otra] ? ` (antes, en ${otra === 'USD' ? 'dólares' : 'pesos'}: ${fmt(c[otra])})` : ''}`;
  }
  async function manejarArchivo(conv, ev, msg) {
    const mime = String((ev.media && ev.media.mime) || '').toLowerCase();
    const tipoOk = ev.tipo === 'imagen' ? /^image\/(jpeg|jpg|png|webp|heic|heif)$/.test(mime) : (mime === 'application/pdf' || /^image\/(jpeg|jpg|png|webp|heic|heif)$/.test(mime));
    if (!tipoOk) return decir(conv, 'soloComprobantes');
    if (Number(ev.media.tamano) > MAX_MEDIA) return decir(conv, 'archivoGrande');
    let buf = null;
    try { buf = await ev.media.descargar(); } catch (e) { log('asistente: no se pudo bajar un archivo de WhatsApp:', e.code || e.message); }
    if (!buf || !buf.length) return decir(conv, 'archivoError');
    if (buf.length > MAX_MEDIA) return decir(conv, 'archivoGrande');
    const ext = tipoPorFirma(buf);
    if (!EXT_OK.includes(ext)) return decir(conv, 'soloComprobantes');
    const ruta = await privado.guardar('comprobantes', buf, ext);
    await pool.query('UPDATE asistente_mensajes SET media_ruta = $2 WHERE id = $1', [msg.id, ruta]);
    const codigo = codigoEnTexto(ev.texto);
    let p = null;
    if (codigo) {
      p = await pedidoPorCodigo(codigo);
      if (!p) return decir(conv, 'pedidoNoEncontrado', { codigo });
      await asociar(conv, p.id);
      if (p.estado !== 'pendiente') return decir(conv, 'comprobanteNoPendiente', { codigo });
    } else {
      const pend = await pendientesAutorizados(conv);
      if (pend.length === 1) p = pend[0];
      else {
        await pool.query('UPDATE asistente_conversaciones SET comprobante_pendiente = $2 WHERE id = $1', [conv.id, msg.id]);
        if (!pend.length) return decir(conv, 'comprobanteSinPedido');
        return decir(conv, 'comprobanteCual', { lista: pend.map((x) => `${x.codigo} (${packDe(x, conv.idioma)})`).join(', ') });
      }
    }
    return adjuntar(conv, p, { ruta, buf, ext });
  }

  // ---------- Identificación ----------
  async function identificarPorTelefono(conv) {
    const tel = telefonoComparable(conv.telefono);
    if (tel.length < 8) return conv;
    const { rows } = await pool.query(
      `SELECT c.id FROM cuentas c JOIN perfiles p ON p.cuenta_id = c.id
       WHERE c.estado = 'activa' AND COALESCE(p.datos->>'whatsapp', '') <> ''
         AND regexp_replace(regexp_replace(p.datos->>'whatsapp', '\\D', '', 'g'), '^549', '54') = $1 LIMIT 2`, [tel]);
    if (rows.length !== 1) return conv;
    const { rows: up } = await pool.query(
      "UPDATE asistente_conversaciones SET cuenta_id = $2, identificado_por = 'telefono', identificado = now() WHERE id = $1 RETURNING *", [conv.id, rows[0].id]);
    log('asistente: chat identificado por el teléfono del perfil');
    return up[0];
  }
  async function codigoActivo(conv) {
    const { rows } = await pool.query(
      "SELECT * FROM asistente_codigos_email WHERE conversacion_id = $1 AND usado IS NULL AND creado > now() - interval '1 day' ORDER BY creado DESC LIMIT 1", [conv.id]);
    return rows[0] || null;
  }
  async function verificarCodigo(conv, digitos, fila) {
    if (new Date(fila.expira) <= new Date()) {
      await pool.query('UPDATE asistente_codigos_email SET usado = now() WHERE id = $1', [fila.id]);
      return decir(conv, 'codigoVencido');
    }
    const { rows } = await pool.query('UPDATE asistente_codigos_email SET intentos = intentos + 1 WHERE id = $1 RETURNING intentos', [fila.id]);
    const intentos = rows[0].intentos;
    const ok = Boolean(fila.cuenta_id && fila.codigo_hash) && crypto.timingSafeEqual(hashCodigo(fila.id, digitos), Buffer.from(fila.codigo_hash));
    if (ok) {
      await pool.query('UPDATE asistente_codigos_email SET usado = now() WHERE id = $1', [fila.id]);
      await pool.query("UPDATE asistente_conversaciones SET cuenta_id = $2, identificado_por = 'email', identificado = now() WHERE id = $1", [conv.id, fila.cuenta_id]);
      log('asistente: chat identificado por código de email');
      const nombre = await nombreCuenta(fila.cuenta_id);
      return nombre ? decir(conv, 'identificada', { nombre }) : decir(conv, 'identificadaSinNombre');
    }
    if (intentos >= CODIGO_EMAIL_INTENTOS) {
      await pool.query('UPDATE asistente_codigos_email SET usado = now() WHERE id = $1', [fila.id]);
      return decir(conv, 'codigoAgotado');
    }
    return decir(conv, 'codigoIncorrecto', { quedan: CODIGO_EMAIL_INTENTOS - intentos });
  }

  // ---------- Captación (lib/captacion.js) ----------
  const CAP_ACTIVOS = ['abierto', 'enviado', 'respondio'];
  const capPorId = async (id) => (id ? (await pool.query('SELECT * FROM captacion_contactos WHERE id = $1', [id])).rows[0] || null : null);
  // Contexto de captación: el chat nació de una invitación y el contacto sigue "abierto", "enviado" o "respondió".
  async function capDe(conv) {
    const c = await capPorId(conv.captacion_id);
    return c && CAP_ACTIVOS.includes(c.estado) ? c : null;
  }
  // Mensaje que Juan manda desde WhatsApp Web / el teléfono. Si es la invitación (o cualquier mensaje a un contacto
  // de la lista que estaba "pendiente" o "abierto"), el contacto pasa a "enviado" y el bot NO se silencia. Si no, null
  // (se aplica el silencio de 12 h de siempre).
  async function salienteCaptacion(conv, ev) {
    const aj = await leerAjustesCaptacion(pool);
    const esInvitacion = ev.tipo === 'texto' && esMensajeCaptacion(ev.texto, aj.mensajes);
    let c = await capPorId(conv.captacion_id);
    if (!c && conv.telefono) c = await contactoPorTelefono(pool, conv.telefono);
    if (!c && esInvitacion && !conv.telefono) {
      // Chat @lid (WhatsApp no informa el número): el único "Abrir chat" de los últimos 20 minutos
      const { rows } = await pool.query("SELECT * FROM captacion_contactos WHERE estado = 'abierto' AND abierto > now() - interval '20 minutes' LIMIT 2");
      if (rows.length === 1) c = rows[0];
    }
    const enCola = c && (c.estado === 'pendiente' || c.estado === 'abierto');
    const reenvio = c && esInvitacion && (c.estado === 'enviado' || c.estado === 'respondio');
    if (!enCola && !reenvio && !(esInvitacion && !c)) return null;
    if (c) {
      if (enCola) {
        // El chip que la mandó (varios chips, 19/11/2026): cuenta para el cupo del día de ese chip
        await pool.query("UPDATE captacion_contactos SET estado = 'enviado', enviado = COALESCE(enviado, now()), chip = $2, actualizado = now() WHERE id = $1", [c.id, Number(conv.chip) || 1]);
        log('asistente: invitación de captación enviada');
      }
      await pool.query('UPDATE asistente_conversaciones SET captacion_id = $2, actualizado = now() WHERE id = $1', [conv.id, c.id]);
    }
    await guardarMensaje(conv, { dir: 'out', origen: 'captacion', tipo: ev.tipo, texto: ev.texto || null, waId: ev.waId });
    return { captacion: enCola ? 'enviado' : 'invitacion' };
  }
  // Mensaje entrante: si es de un contacto invitado, queda vinculado al chat y pasa a "respondió".
  async function entranteCaptacion(conv) {
    let c = await capPorId(conv.captacion_id);
    if (!c && conv.telefono) {
      c = await contactoPorTelefono(pool, conv.telefono);
      if (c && !CAP_ACTIVOS.includes(c.estado)) c = null;
      if (c) await pool.query('UPDATE asistente_conversaciones SET captacion_id = $2 WHERE id = $1', [conv.id, c.id]);
    }
    if (!c) return { conv, cap: null };
    if (c.estado === 'abierto' || c.estado === 'enviado') {
      c = (await pool.query("UPDATE captacion_contactos SET estado = 'respondio', respondio = COALESCE(respondio, now()), actualizado = now() WHERE id = $1 RETURNING *", [c.id])).rows[0];
      log('asistente: respondió una invitada de captación');
    }
    return { conv: await releer(conv.id), cap: c };
  }
  // "No me interesa", "no me escriban", insultos, "¿quién te dio mi número?": una sola respuesta amable y "no escribir"
  // (nunca vuelve a la cola de captación).
  async function noEscribir(conv, tipo) {
    const t = tipo === 'origen' ? `${RESPUESTA_ORIGEN} ${RESPUESTA_NO_ESCRIBIR}` : RESPUESTA_NO_ESCRIBIR;
    await pool.query("UPDATE captacion_contactos SET estado = 'no_escribir', no_escribir = now(), actualizado = now() WHERE id = $1", [conv.captacion_id]);
    await responder(conv, t);
    log('asistente: invitada de captación pidió que no le escriban');
  }

  // ---------- Herramientas de la IA (los permisos se controlan acá) ----------
  const NO_IDENTIFICADO = { error: 'chat_no_identificado', instruccion: 'El chat no está identificado: pedile el email de su cuenta y usá enviar_codigo_email.' };
  async function herramienta(convId, nombre, input) {
    const conv = await releer(convId);
    const lang = conv.idioma;
    switch (nombre) {
      case 'precios': {
        const [pr, pk, dst, cot] = await Promise.all([planes.precios(), creditos.packs({ soloActivos: true }), planes.preciosDestacado(), creditos.cotizacion()]);
        // Montos en pesos (Juan, 19/11/2026): USD × la cotización en uso (Admin → Precios), redondeado hacia arriba a la
        // centena como en los pedidos. Sin cotización cargada, null (el asistente da solo USD).
        const ars = (usd) => {
          const n = usd ? arsSugerido(usd, cot.arsPorUsd) : null;
          return n ? '$' + n.toLocaleString('es-AR') : null;
        };
        return {
          resultado: {
            creditoEnUsd: 1,
            planes: ['E', 'D', 'C', 'S'].map((k) => ({
              nombre: PLAN_NOMBRE[k], mes: pr.mes[k] ?? null, semana: pr.semana[k] ?? null,
              mesPesos: ars(pr.mes[k]), semanaPesos: ars(pr.semana[k]),
            })),
            packs: pk.map((p) => ({ id: p.id, nombre: p.nombre, pagaUsd: p.pagaUsd, pagaPesos: ars(p.pagaUsd), recibeCreditos: p.recibe })),
            cargaAMedida: { minimo: 10, maximo: 10000 },
            destacado: ['E', 'D', 'C'].map((k) => ({
              plan: PLAN_NOMBRE[k], semana: dst[k] ? dst[k].semana : null, mes: dst[k] ? dst[k].mes : null,
              semanaPesos: dst[k] ? ars(dst[k].semana) : null, mesPesos: dst[k] ? ars(dst[k].mes) : null,
            })),
            destacadoStar: 'Con Star no hace falta: ya aparece arriba.',
            cotizacion: cot.arsPorUsd ? { pesosPorDolar: cot.arsPorUsd, fecha: fmtFecha(cot.fecha) } : null,
          },
        };
      }
      case 'ayuda': {
        const tema = String(input.tema || '');
        // "contenido": "próximamente" o cómo empezar, según lo que publicó el app en la base (lib/contenido.js)
        const contenidoDisponible = tema === 'contenido' ? await ventaContenidoDisponible(pool) : false;
        // "apertura" y "como_funciona": "a partir de diciembre" mientras la home provisoria está prendida (lib/prelanzamiento.js)
        const prelanzamiento = tema === 'apertura' || tema === 'como_funciona' ? await prelanzamientoEn(pool) : true;
        const t = textoAyuda(tema, url, { contenidoDisponible, prelanzamiento });
        return { resultado: t ? { texto: t } : { error: 'Tema desconocido.' } };
      }
      case 'pedido_por_codigo': {
        const codigo = codigoEnTexto(input.codigo);
        const p = codigo ? await pedidoPorCodigo(codigo) : null;
        if (!p || !(await autorizado(conv, p))) return { resultado: { error: 'No hay un pedido con ese código en este chat. Pedile que escriba el código tal como aparece en su panel.' } };
        return { resultado: { codigo: p.codigo, pack: packDe(p, lang), creditos: creditosDe(p), pagaUsd: Number(p.paga_usd), estado: p.estado, vence: fmtFecha(p.vence), tieneComprobante: Boolean(p.comprobante_ruta) } };
      }
      case 'datos_transferencia': {
        const codigo = codigoEnTexto(input.codigo);
        const p = codigo ? await pedidoPorCodigo(codigo) : null;
        if (!p || !(await autorizado(conv, p))) return { resultado: { error: 'No hay un pedido con ese código en este chat.' } };
        if (p.estado !== 'pendiente') return { resultado: { error: `El pedido está ${p.estado}: no se paga.` } };
        const moneda = input.moneda === 'USD' || input.moneda === 'ARS' ? input.moneda : null;
        if (moneda === 'USD' && !(await usdPosible(p))) return { resultado: { error: 'No hay una cuenta en dólares: por ahora solo se puede transferir en pesos.' } };
        const r = await ofrecerPago(conv, p, { moneda });
        if (r === 'pregunta') return { resultado: { enviado: true, nota: 'Ya se le preguntó en un mensaje aparte si va a transferir en pesos o en dólares. No repitas la pregunta.' } };
        return { resultado: { enviado: true, nota: 'Ya se le mandaron los datos en un mensaje aparte. No los repitas.' } };
      }
      case 'enviar_codigo_email': {
        const email = String(input.email || '').trim().toLowerCase();
        if (!EMAIL_RE.test(email) || email.length > 254) return { resultado: { error: 'Ese email no parece válido. Pedile que lo revise.' } };
        const n = await pool.query("SELECT count(*)::int AS n FROM asistente_codigos_email WHERE conversacion_id = $1 AND creado > now() - interval '1 hour'", [conv.id]);
        if (n.rows[0].n >= 3) return { resultado: { error: 'Ya se mandaron 3 códigos en la última hora. Que espere un rato o ofrecé pasar el chat a una persona.' } };
        const c = await pool.query("SELECT id FROM cuentas WHERE email = $1 AND estado = 'activa'", [email]);
        await pool.query('UPDATE asistente_codigos_email SET usado = now() WHERE conversacion_id = $1 AND usado IS NULL', [conv.id]);
        const { rows } = await pool.query('INSERT INTO asistente_codigos_email (conversacion_id, cuenta_id) VALUES ($1, $2) RETURNING id', [conv.id, c.rows[0] ? c.rows[0].id : null]);
        // El email lo manda el app (tiene el servicio de emails); acá solo queda el pedido.
        if (c.rows[0]) await pool.query("INSERT INTO asistente_salida (destino, tipo, conversacion_id, datos) VALUES ('app', 'codigo_email', $1, $2)", [conv.id, JSON.stringify({ codigoId: rows[0].id })]);
        await decir(conv, 'codigoEnviado');
        return { resultado: { enviado: true, nota: 'Ya se le avisó en un mensaje aparte (sin confirmar si el email existe). No repitas el aviso.' } };
      }
      case 'estado_cuenta': {
        if (!conv.cuenta_id) return { resultado: NO_IDENTIFICADO };
        const id = conv.cuenta_id;
        const [pf, efectivo, base, saldo, peds] = await Promise.all([
          pool.query("SELECT estado, verificacion, oculto, pausado_por, motivo_rechazo, verificacion_limite, datos->>'displayName' AS nombre FROM perfiles WHERE cuenta_id = $1", [id]),
          planes.planEfectivo(id), planes.baseJson(id), creditos.saldo(id),
          pool.query('SELECT * FROM pedidos_creditos WHERE cuenta_id = $1 ORDER BY creado DESC LIMIT 5', [id]),
        ]);
        const p = pf.rows[0] || {};
        return {
          resultado: {
            nombreArtistico: p.nombre || null,
            perfil: ESTADO_PERFIL[p.estado] || p.estado || 'Sin perfil',
            ...(p.estado === 'pausado' && p.pausado_por === 'sin_saldo' ? { pausa: 'Pausado porque no alcanzaron los créditos para renovar el plan.' } : {}),
            ...(p.estado === 'pausado' && p.pausado_por === 'sin_verificacion' ? { pausa: 'Pausado porque no mandó la verificación de identidad dentro de los 7 días. Vuelve a verse solo apenas la manda.' } : {}),
            // Publicado sin verificar (19/11/2026): hasta cuándo tiene para mandarla
            ...(p.estado === 'publicado' && ['sin_enviar', 'rechazada'].includes(p.verificacion) && p.verificacion_limite ? { verificacionHasta: fmtFecha(p.verificacion_limite) } : {}),
            ...(p.estado === 'rechazado' && p.motivo_rechazo ? { motivoRechazo: p.motivo_rechazo } : {}),
            oculto: Boolean(p.oculto),
            verificacion: ESTADO_VERIF[p.verificacion] || p.verificacion || null,
            planActual: PLAN_NOMBRE[efectivo] || efectivo,
            planMensual: base ? { plan: base.planNombre, hasta: fmtFecha(base.hasta), renovacionAutomatica: base.renovacionAuto } : null,
            saldoCreditos: fmtCreditos(saldo),
            pedidos: peds.rows.map((x) => ({ codigo: x.codigo, pack: packDe(x, lang), creditos: creditosDe(x), estado: x.estado, vence: x.estado === 'pendiente' ? fmtFecha(x.vence) : null })),
          },
        };
      }
      case 'crear_pedido': {
        if (!conv.cuenta_id) return { resultado: NO_IDENTIFICADO };
        let pedido;
        try {
          pedido = await creditos.crearPedido(conv.cuenta_id, input.pack_id ? { packId: String(input.pack_id), lang } : { creditos: Number(input.creditos), lang });
        } catch (e) {
          if (e.expose) return { resultado: { error: e.message } };
          throw e;
        }
        await asociar(conv, pedido.id);
        const { rows } = await pool.query('SELECT * FROM pedidos_creditos WHERE id = $1', [pedido.id]);
        const r = await ofrecerPago(conv, rows[0]);
        log('asistente: pedido de créditos creado por chat');
        return { resultado: { ok: true, codigo: pedido.codigo, nota: r === 'pregunta' ? 'Ya se le preguntó en un mensaje aparte si va a transferir en pesos o en dólares. No repitas la pregunta.' : 'Ya se le mandaron los datos para pagar en un mensaje aparte. No los repitas.' } };
      }
      case 'motivo_eliminacion': {
        // Solo por el número de ESTE chat (nunca un dato que escriba la persona) y solo fecha y motivo: ni email ni
        // nombres. La más reciente si hubo más de una con ese número.
        const tel = telefonoComparable(conv.telefono);
        const { rows } = tel.length >= 8
          ? await pool.query(
            `SELECT fecha, motivo FROM cuentas_eliminadas
              WHERE whatsapp IS NOT NULL AND regexp_replace(regexp_replace(whatsapp, '\\D', '', 'g'), '^549', '54') = $1
              ORDER BY fecha DESC, id DESC LIMIT 1`, [tel])
          : { rows: [] };
        if (!rows[0]) return { resultado: { encontrado: false, instruccion: 'Desde este chat no se puede ver ese dato: decíselo y usá derivar_a_juan.' } };
        log('asistente: se informó el motivo de una cuenta eliminada');
        return { resultado: { encontrado: true, fecha: fmtFecha(rows[0].fecha), motivo: rows[0].motivo } };
      }
      case 'derivar_a_juan':
        await derivar(conv, String(input.motivo || 'Pidió hablar con una persona'));
        return { resultado: { ok: true }, detener: true };
      case 'alerta':
        await alertar(conv, String(input.tipo || 'otro'), String(input.motivo || ''));
        return { resultado: { ok: true }, detener: true };
      case 'no_contactar': {
        if (!(await capDe(conv))) return { resultado: { error: 'Este chat no es de una invitación de captación.' } };
        await noEscribir(conv, 'rechazo');
        return { resultado: { ok: true }, detener: true };
      }
      default:
        return { resultado: { error: 'Herramienta desconocida.' } };
    }
  }

  async function historial(conv) {
    const { rows } = await pool.query(
      'SELECT dir, origen, tipo, texto FROM asistente_mensajes WHERE conversacion_id = $1 ORDER BY id DESC LIMIT 20', [conv.id]);
    const out = [];
    for (const m of rows.reverse()) {
      const role = m.dir === 'in' ? 'user' : 'assistant';
      let t = m.texto || '';
      if (m.tipo !== 'texto') t = `[${m.tipo === 'imagen' || m.tipo === 'documento' ? 'archivo' : m.tipo}]${t ? ' ' + t : ''}`;
      if (m.origen === 'juan') t = '(Escribió una persona del equipo) ' + t;
      if (m.origen === 'captacion') t = '(Invitación que le mandó el equipo) ' + t;
      if (!t.trim()) continue;
      const ult = out[out.length - 1];
      if (ult && ult.role === role) ult.content += '\n' + t; else out.push({ role, content: t });
    }
    while (out.length && out[0].role !== 'user') out.shift();
    return out;
  }

  async function turnoIa(conv) {
    if (!llm || !llm.disponible) return sinIa(conv, 'falta ANTHROPIC_API_KEY');
    const mensajes = await historial(conv);
    if (!mensajes.length || mensajes[mensajes.length - 1].role !== 'user') return;
    const c = await releer(conv.id);
    const captacion = Boolean(await capDe(c));
    // Varios chips (19/11/2026): en un chip de captación, si hay un chip de créditos, las compras se hacen allá
    const { rows: rc } = await pool.query('SELECT rol FROM asistente_whatsapp WHERE id = $1', [Number(c.chip) || 1]);
    const numCred = rc[0] && rc[0].rol === 'captacion' ? await creditosEnOtroChip(pool, c.chip) : '';
    const creditosEn = numCred ? `https://wa.me/${numCred}` : '';
    let herrs = captacion ? [...HERRAMIENTAS, HERRAMIENTA_NO_CONTACTAR] : HERRAMIENTAS;
    if (creditosEn) herrs = herrs.filter((h) => !SOLO_CHIP_CREDITOS.includes(h.name));
    let r;
    try {
      r = await llm.conversar({
        system: promptSistema({ siteUrl: url, identificado: Boolean(c.cuenta_id), nombre: await nombreCuenta(c.cuenta_id), idioma: c.idioma, captacion, creditosEn, demorado: demorados.has(c.id) }),
        mensajes, ejecutar: (nombre, input) => (creditosEn && SOLO_CHIP_CREDITOS.includes(nombre)
          ? { resultado: { error: `En este número no se compran créditos: pasale este link ${creditosEn}` } }
          : herramienta(c.id, nombre, input)),
        herramientas: herrs,
      });
    } catch (e) {
      log('asistente: la IA no respondió:', e.message);
      return sinIa(c, 'la IA no respondió');
    }
    if (r.detenido) return;
    const t = limpiarRespuesta(r.texto);
    if (t) await responder(c, t);
  }

  // ---------- Entrada ----------
  // ev = { jid (teléfono@s.whatsapp.net o, si no se sabe, …@lid), lid (…@lid si jid es el teléfono), telefono, waId, deMi, porBot, tipo: texto|imagen|documento|audio|video|otro, texto, media: { mime, tamano, descargar } }
  async function procesar(ev) {
    let conv = await conversacion(ev.jid, ev.telefono, ev.lid || null, Number(ev.chip) || 1);
    if (ev.deMi) {
      if (ev.porBot) return { ignorado: 'bot' };
      // La invitación de captación (o un mensaje a un contacto de la cola) no silencia al bot: marca "enviado".
      const cap = await salienteCaptacion(conv, ev);
      if (cap) return cap;
      // Juan escribió desde el teléfono del asistente: el bot calla en ese chat por 12 h.
      await guardarMensaje(conv, { dir: 'out', origen: 'juan', tipo: ev.tipo, texto: ev.texto || null, waId: ev.waId });
      await pool.query(`UPDATE asistente_conversaciones SET silenciado_hasta = now() + interval '${SILENCIO_JUAN_HORAS} hours', actualizado = now() WHERE id = $1`, [conv.id]);
      return { juan: true };
    }
    const msg = await guardarMensaje(conv, { dir: 'in', origen: 'usuario', tipo: ev.tipo, texto: ev.texto || null, waId: ev.waId });
    if (!msg) return { ignorado: 'repetido' };
    const ec = await entranteCaptacion(conv);
    conv = ec.conv;
    if (silenciado(conv)) return { ignorado: 'silencio' };
    // Ya pidió que no le escriban: otro "no" no se contesta (una pregunta de verdad sí, como cualquier chat)
    if (ec.cap && ec.cap.estado === 'no_escribir' && ev.tipo === 'texto' && respuestaInvitada(ev.texto)) return { ignorado: 'no_escribir' };
    const n = await pool.query("SELECT count(*)::int AS n FROM asistente_mensajes WHERE conversacion_id = $1 AND dir = 'in' AND creado > now() - interval '1 hour'", [conv.id]);
    if (n.rows[0].n > LIMITE_HORA) { await derivar(conv, `Más de ${LIMITE_HORA} mensajes en una hora`); return { derivado: 'limite' }; }
    const idioma = detectarIdioma(ev.texto, conv.idioma);
    if (idioma !== conv.idioma) conv = (await pool.query('UPDATE asistente_conversaciones SET idioma = $2 WHERE id = $1 RETURNING *', [conv.id, idioma])).rows[0];
    if (!conv.cuenta_id && conv.telefono) conv = await identificarPorTelefono(conv);

    if (ev.tipo === 'imagen' || ev.tipo === 'documento') { await manejarArchivo(conv, ev, msg); return { archivo: true }; }
    if (ev.tipo !== 'texto') { await decir(conv, 'soloComprobantes'); return { otro: true }; }
    const txt = String(ev.texto || '').trim();
    if (!txt) return { vacio: true };
    if (ec.cap && CAP_ACTIVOS.includes(ec.cap.estado)) {
      const rechazo = respuestaInvitada(txt);
      if (rechazo) { await noEscribir(conv, rechazo); return { captacion: 'no_escribir' }; }
    }
    const seis = /^\D{0,20}(\d{6})\D{0,20}$/.exec(txt);
    if (seis) {
      const fila = await codigoActivo(conv);
      if (fila) { await verificarCodigo(conv, seis[1], fila); return { codigoEmail: true }; }
    }
    const codigo = codigoEnTexto(txt);
    if (codigo) { await manejarCodigo(conv, codigo); return { pedido: codigo }; }
    if (await respuestaMoneda(conv, txt)) return { moneda: true };
    if (preguntaSiEsBot(txt)) { await decir(conv, 'botOPersona'); return { bot: true }; }
    // Cierre de la charla (21/11/2026): "listo", "gracias", "igualmente", "❤"… no se contesta si nuestro último mensaje
    // no era una pregunta. Si era una pregunta ("¿Te paso los precios?"), un "sí" o un "dale" es la respuesta. La
    // primera respuesta a una invitación de captación siempre se contesta.
    if (esCierre(txt)) {
      const { rows: u } = await pool.query("SELECT texto, origen FROM asistente_mensajes WHERE conversacion_id = $1 AND dir = 'out' ORDER BY id DESC LIMIT 1", [conv.id]);
      const ult = u[0];
      if (ult && ult.origen !== 'captacion' && !/[?¿]/.test(String(ult.texto || ''))) return { ignorado: 'cierre' };
    }
    await turnoIa(conv);
    return { ia: true };
  }

  async function recibir(ev) {
    const aj = await leerAjustes(pool);
    if (!aj.activo) return { ignorado: 'apagado' };
    return enCola(claveChat(ev.chip, ev.jid), () => procesar(ev));
  }

  // ---------- Lo que llegó sin conexión (20/11/2026) ----------
  // chats = [{ jid, eventos: [ev…] }] (mensajes sin responder de cada chat, en orden; lib/asistente-whatsapp.js →
  // alHistorial). De a un chat, espaciados: los mensajes anteriores se guardan y el último se procesa como siempre (con
  // la disculpa por la demora si contesta la IA). Si en ese chat ya hay algo nuestro más nuevo, se saltea.
  const demorados = new Set();
  let recuperando = Promise.resolve();
  function recuperar(chats, chip = 1) {
    recuperando = recuperando.catch(() => {}).then(async () => {
      const aj = await leerAjustes(pool);
      if (!aj.activo) return;
      let n = 0;
      for (const ch of chats || []) {
        const evs = (ch.eventos || []).filter((e) => !e.deMi);
        if (!evs.length) continue;
        const ult = evs[evs.length - 1];
        try {
          const hecho = await enCola(claveChat(chip, ult.jid), async () => {
            const conv = await conversacion(ult.jid, ult.telefono, ult.lid || null, chip);
            if (await mensajeGuardado(conv, ult.waId)) return false; // ya lo vimos (otro pedazo del historial)
            const { rows } = await pool.query(
              "SELECT 1 FROM asistente_mensajes WHERE conversacion_id = $1 AND dir = 'out' AND creado > $2 LIMIT 1", [conv.id, new Date(ult.ts || 0)]);
            if (rows[0]) return false; // ya se le respondió después
            for (const e of evs.slice(0, -1)) {
              await guardarMensaje(conv, { dir: 'in', origen: 'usuario', tipo: e.tipo, texto: e.texto || null, waId: e.waId });
            }
            demorados.add(conv.id);
            try { await procesar({ ...ult, chip }); } finally { demorados.delete(conv.id); }
            return true;
          });
          if (hecho) {
            n++;
            await pool.query('UPDATE asistente_whatsapp SET recuperados = recuperados + 1 WHERE id = $1', [chip]).catch(() => {});
            await pausaRecuperar();
          }
        } catch (e) { log('asistente: no se pudo responder un mensaje recuperado:', e.code || e.message); }
      }
      if (n && telegram) {
        await telegram.enviar({ texto: `Asistente: chip ${letraDe(chip)}: respondí ${n} ${n === 1 ? 'chat que había' : 'chats que habían'} quedado sin respuesta mientras estaba desconectado.`, tipo: 'asistente_alerta' }).catch(() => {});
      }
      log(`asistente: chip ${letraDe(chip)}: ${n} chat(s) recuperado(s) respondido(s)`);
    });
    return recuperando;
  }
  const mensajeGuardado = async (conv, waId) => (waId ? Boolean((await pool.query('SELECT 1 FROM asistente_mensajes WHERE conversacion_id = $1 AND wa_id = $2', [conv.id, waId])).rows[0]) : false);

  // ---------- Bandeja de salida (avisos que manda el app: créditos acreditados o pedido rechazado) ----------
  async function procesarSalida({ desvincular = async () => {}, conectado = () => true } = {}) {
    const aj = await leerAjustes(pool);
    const { rows } = await pool.query("SELECT * FROM asistente_salida WHERE destino = 'whatsapp' AND procesado IS NULL ORDER BY id LIMIT 20");
    for (const r of rows) {
      const marcar = (error = null) => pool.query('UPDATE asistente_salida SET procesado = now(), error = $2 WHERE id = $1', [r.id, error]);
      if (r.tipo === 'desvincular') {
        try { await desvincular(Number(r.datos && r.datos.chip) || 1); await marcar(); } catch (e) { log('asistente: desvincular falló:', e.message); await marcar('falló: ' + e.message); }
        continue;
      }
      if (r.tipo !== 'mensaje') { await marcar('tipo desconocido'); continue; }
      if (Date.now() - new Date(r.creado).getTime() > 24 * 3600 * 1000) { await marcar('vencido'); continue; }
      if (!aj.activo) continue; // queda para cuando se prenda
      const conv = r.conversacion_id ? await releer(r.conversacion_id) : null;
      if (!conv) { await marcar('sin chat'); continue; }
      if (!conectado(Number(conv.chip) || 1)) continue; // queda para cuando ese chip se conecte
      if (silenciado(conv)) { await marcar('chat atendido por una persona'); continue; }
      try {
        await enCola(claveChat(conv.chip, conv.jid), () => responder(conv, String((r.datos && r.datos.texto) || '')));
        await marcar();
      } catch (e) {
        if (e.code === 'NO_CONECTADO') continue;
        const { rows: x } = await pool.query('UPDATE asistente_salida SET intentos = intentos + 1, error = $2 WHERE id = $1 RETURNING intentos', [r.id, String(e.message).slice(0, 200)]);
        if (x[0].intentos >= 5) await marcar('no se pudo enviar');
        log('asistente: no se pudo mandar un aviso por WhatsApp:', e.code || e.message);
      }
    }
  }

  return {
    recibir, recuperar, procesarSalida, herramienta, historial,
    setEnviar(fn) { enviarWa = typeof fn === 'function' ? fn : null; },
    async esperar() { await Promise.all([...colas.values()]); },
    esperarRecuperar: () => recuperando.catch(() => {}),
  };
}
