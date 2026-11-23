// Admin → Mensajería (antes Admin → Asistente): el asistente de cuenta por WhatsApp (pestañas Conversaciones y
// WhatsApp). Se monta bajo `${A}/api` (Basic Auth del admin; lo que modifica, con apiPost: JSON + X-SR-Admin: 1 +
// mismo origen). La captación tiene su propio router (routes/admin-captacion.js).
//   GET  /asistente                                     → ajustes, estado de WhatsApp (QR en SVG si espera escaneo), IA,
//                                                         número que usa el botón de comprar créditos (botonCreditos),
//                                                         cuentas para las transferencias { ARS: [...], USD: [...] }
//   PUT  /asistente/ajustes            {activo}  (prendido/apagado; alias/titular viejos se ignoran)
//   Cuentas para las transferencias (Créditos → Banco, 18/11/2026; lib/cuentas-transferencia.js). Todas → estado():
//   POST   /asistente/cuentas              {moneda: 'ARS'|'USD', alias, titular, activo?}
//   PUT    /asistente/cuentas/:id          {alias?, titular?, activo?} (editar, pausar/reanudar)
//   POST   /asistente/cuentas/:id/mover    {dir: 'arriba'|'abajo'}
//   DELETE /asistente/cuentas/:id          (los pedidos que ya la recibieron la conservan)
//   POST /asistente/desvincular {chip?}                 → el agente cierra la sesión de ese chip (pide QR nuevo)
//   Varios chips (19/11/2026, lib/chips.js). Todas → estado():
//   POST   /asistente/chips            {rol}                    agrega un chip (letra siguiente); el agente pide su QR
//   PUT    /asistente/chips/:id        {rol?, pausado?, porDia?}
//   DELETE /asistente/chips/:id        (no el A): el agente lo cierra y se borra su sesión; sus chats quedan
//   POST   /asistente/chips/:id/recuperar {desde}  (20/11/2026) responder lo que llegó sin conexión desde esa fecha:
//                                                    desvincula el chip; al escanear el QR, el historial que manda
//                                                    WhatsApp se contesta (db/340-recuperar-mensajes.sql)
//   GET  /asistente/conversaciones?estado=bot|humano|captacion&q= → lista (teléfono enmascarado, cuenta, último mensaje,
//                                                         estado, captación)
//   GET  /asistente/conversaciones/:id                  → chat completo + pedidos nombrados
//   GET  /asistente/conversaciones/:id/mensajes/:mid/archivo → el comprobante (privado, no-store)
//   POST /asistente/conversaciones/:id/humano {humano: true|false} → "Pasar a humano" / "Devolver al asistente"
import express from 'express';
import QRCode from 'qrcode';
import { LATIDO_VIVO_MS, leerAjustes, telefonoOculto, validarAjustes } from '../lib/asistente-comun.js';
import { borrarCuenta, crearCuenta, cuentasDePedidos, editarCuenta, listarCuentas, moverCuenta } from '../lib/cuentas-transferencia.js';
import { listarChips, numeroCreditos, MAX_CHIPS, ROLES_CHIP } from '../lib/chips.js';
import { borrarAuth } from '../lib/asistente-whatsapp.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const QR_VIGENTE_MS = 60 * 1000;
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; this.expose = true; } }
const he = (s, m) => new HttpError(s, m);

export function createAdminAsistenteRouter({ pool, privado, apiPost, log = () => {} }) {
  const r = express.Router();
  const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  const body = (req) => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {});
  const uuid = (v) => { if (!UUID_RE.test(String(v || ''))) throw he(404, 'No encontrado.'); return v; };
  r.use('/asistente', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  // Estado de un chip para el admin (sin latido reciente el agente no está corriendo: "desconectado")
  async function chipJson(w) {
    const vivo = Boolean(w.latido && Date.now() - new Date(w.latido).getTime() < LATIDO_VIVO_MS);
    let qrSvg = null;
    if (vivo && w.estado === 'esperando_qr' && w.qr && w.qr_creado && Date.now() - new Date(w.qr_creado).getTime() < QR_VIGENTE_MS) {
      const svg = await QRCode.toString(w.qr, { type: 'svg', margin: 2, errorCorrectionLevel: 'L', color: { dark: '#000000', light: '#ffffff' } });
      qrSvg = 'data:image/svg+xml;base64,' + Buffer.from(svg, 'utf8').toString('base64');
    }
    return {
      id: Number(w.id), letra: w.letra || String.fromCharCode(64 + Number(w.id)), rol: w.rol || 'captacion', pausado: Boolean(w.pausado), porDia: w.por_dia || 30,
      estado: vivo ? w.estado : 'desconectado', agente: vivo, numero: w.numero ? telefonoOculto(w.numero) : null,
      error: w.error || null, qrSvg, actualizado: w.actualizado || null, latido: w.latido || null,
      // Responder lo que llegó sin conexión: pedido en curso (o el último) y desde cuándo conviene (lo último que vio)
      recuperar: w.recuperar_desde ? { desde: w.recuperar_desde, hasta: w.recuperar_hasta, vigente: Boolean(w.recuperar_hasta && new Date(w.recuperar_hasta) > new Date()), respondidos: w.recuperados || 0 } : null,
      ultimoVisto: w.ultimo_visto || null,
    };
  }
  async function estado() {
    const [aj, filas0, cuentas, vistos] = await Promise.all([leerAjustes(pool), listarChips(pool), listarCuentas(pool),
      pool.query(`SELECT c.chip, max(m.creado) AS visto FROM asistente_mensajes m JOIN asistente_conversaciones c ON c.id = m.conversacion_id
        WHERE m.dir = 'in' GROUP BY c.chip`)]);
    const vistoDe = new Map(vistos.rows.map((x) => [Number(x.chip), x.visto]));
    const filas = filas0.map((x) => ({ ...x, ultimo_visto: vistoDe.get(Number(x.id)) || null }));
    const chips = await Promise.all(filas.map(chipJson));
    const w = filas.find((x) => Number(x.id) === 1) || { estado: 'desconectado' };
    const uno = chips.find((x) => x.id === 1) || { estado: 'desconectado', agente: false, numero: null, error: null, qrSvg: null };
    const vivo = uno.agente; const qrSvg = uno.qrSvg;
    const n = await pool.query("SELECT count(*)::int AS total, count(*) FILTER (WHERE estado = 'humano')::int AS humano, count(*) FILTER (WHERE captacion_id IS NOT NULL)::int AS captacion FROM asistente_conversaciones");
    // Botón "comprar créditos" del panel: el número del chip vinculado; hasta vincularlo, el que estaba cargado a mano.
    const ct = await pool.query("SELECT valor FROM ajustes WHERE clave = 'contacto'");
    const guardado = String((ct.rows[0] && ct.rows[0].valor && ct.rows[0].valor.whatsapp) || '').replace(/\D/g, '');
    const vinculado = await numeroCreditos(pool);
    return {
      ajustes: aj,
      cuentas,
      chips,
      whatsapp: {
        // Sin latido reciente el agente no está corriendo: se muestra "desconectado" aunque la fila diga otra cosa.
        estado: vivo ? w.estado : 'desconectado',
        agente: vivo,
        numero: w.numero ? telefonoOculto(w.numero) : null,
        error: w.error || null,
        qrSvg,
        actualizado: w.actualizado,
        latido: w.latido || null,
      },
      ia: { configurada: Boolean(w.ia), modelo: w.modelo || null },
      conversaciones: n.rows[0],
      botonCreditos: {
        vinculado: vinculado ? '+' + vinculado : null,
        guardado: guardado ? '+' + guardado : null,
        usa: vinculado ? 'vinculado' : guardado ? 'guardado' : null,
      },
    };
  }

  r.get('/asistente', ah(async (req, res) => res.json(await estado())));

  r.put('/asistente/ajustes', apiPost, ah(async (req, res) => {
    // Solo {activo}. Se suma a lo guardado: las claves viejas (alias, titular…) quedan como estaban por si hubiera que
    // volver a la versión anterior; las cuentas se cargan en sus listas (abajo).
    const v = validarAjustes(body(req));
    if (v.error) throw he(400, v.error);
    await pool.query(
      `INSERT INTO ajustes (clave, valor, actualizado) VALUES ('asistente', $1::jsonb, now())
       ON CONFLICT (clave) DO UPDATE SET valor = ajustes.valor || EXCLUDED.valor, actualizado = now()`, [JSON.stringify(v.valor)]);
    res.json(await estado());
  }));

  // ---------- Cuentas para las transferencias (dos listas: pesos y dólares; el asistente rota entre las activas) ----------
  r.post('/asistente/cuentas', apiPost, ah(async (req, res) => {
    await crearCuenta(pool, body(req));
    log('asistente: cuenta para transferencias agregada');
    res.json(await estado());
  }));
  r.put('/asistente/cuentas/:id', apiPost, ah(async (req, res) => {
    await editarCuenta(pool, uuid(req.params.id), body(req));
    res.json(await estado());
  }));
  r.post('/asistente/cuentas/:id/mover', apiPost, ah(async (req, res) => {
    await moverCuenta(pool, uuid(req.params.id), body(req).dir);
    res.json(await estado());
  }));
  r.delete('/asistente/cuentas/:id', apiPost, ah(async (req, res) => {
    await borrarCuenta(pool, uuid(req.params.id));
    log('asistente: cuenta para transferencias borrada');
    res.json(await estado());
  }));

  r.post('/asistente/desvincular', apiPost, ah(async (req, res) => {
    const chip = Number(body(req).chip) || 1;
    const { rows } = await pool.query('SELECT id FROM asistente_whatsapp WHERE id = $1', [chip]);
    if (!rows[0]) throw he(404, 'Ese chip no existe.');
    await pool.query("INSERT INTO asistente_salida (destino, tipo, datos) VALUES ('whatsapp', 'desvincular', $1)", [JSON.stringify({ chip })]);
    log(`asistente: desvincular pedido desde el admin (chip ${String.fromCharCode(64 + chip)})`);
    res.json(await estado());
  }));

  // ---------- Chips ----------
  const validarChip = (b, parcial) => {
    const out = {};
    if (b.rol !== undefined || !parcial) {
      if (!ROLES_CHIP.includes(b.rol)) throw he(400, 'Rol: captacion o creditos.');
      out.rol = b.rol;
    }
    if (b.pausado !== undefined) { if (typeof b.pausado !== 'boolean') throw he(400, 'Pausado: true o false.'); out.pausado = b.pausado; }
    if (b.porDia !== undefined) {
      const n = Number(b.porDia);
      if (!Number.isInteger(n) || n < 1 || n > 200) throw he(400, 'Por día: un número entero de 1 a 200.');
      out.porDia = n;
    }
    return out;
  };
  r.post('/asistente/chips', apiPost, ah(async (req, res) => {
    const v = validarChip(body(req), false);
    // La letra siguiente a la más alta (una letra quitada no se reusa: sus chats viejos quedan con ella)
    const { rows } = await pool.query(`SELECT GREATEST(
        (SELECT COALESCE(max(id), 0) FROM asistente_whatsapp), (SELECT COALESCE(max(chip), 0) FROM asistente_conversaciones),
        (SELECT COALESCE(max(chip), 0) FROM captacion_contactos)) + 1 AS id`);
    const id = Number(rows[0].id);
    if (id > MAX_CHIPS) throw he(409, `Hasta ${MAX_CHIPS} chips.`);
    await borrarAuth(pool, id); // por las dudas: nunca una sesión vieja con esa letra
    await pool.query('INSERT INTO asistente_whatsapp (id, rol, pausado, por_dia) VALUES ($1, $2, $3, $4)', [id, v.rol, v.pausado || false, v.porDia || 30]);
    log(`asistente: chip ${String.fromCharCode(64 + id)} agregado (${v.rol})`);
    res.status(201).json(await estado());
  }));
  r.put('/asistente/chips/:id', apiPost, ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1 || id > MAX_CHIPS) throw he(404, 'Ese chip no existe.');
    const v = validarChip(body(req), true);
    const { rowCount } = await pool.query(
      `UPDATE asistente_whatsapp SET rol = COALESCE($2, rol), pausado = COALESCE($3, pausado), por_dia = COALESCE($4, por_dia), actualizado = now()
        WHERE id = $1`, [id, v.rol ?? null, v.pausado ?? null, v.porDia ?? null]);
    if (!rowCount) throw he(404, 'Ese chip no existe.');
    res.json(await estado());
  }));
  r.post('/asistente/chips/:id/recuperar', apiPost, ah(async (req, res) => {
    const id = Number(req.params.id);
    const desde = new Date(String(body(req).desde || ''));
    if (Number.isNaN(desde.getTime())) throw he(400, 'Elegí desde cuándo.');
    if (desde > new Date()) throw he(400, 'La fecha no puede ser futura.');
    if (Date.now() - desde.getTime() > 7 * 24 * 3600 * 1000) throw he(400, 'Como mucho, los últimos 7 días.');
    const { rowCount } = await pool.query(
      "UPDATE asistente_whatsapp SET recuperar_desde = $2, recuperar_hasta = now() + interval '2 hours', recuperados = 0, actualizado = now() WHERE id = $1", [id, desde]);
    if (!rowCount) throw he(404, 'Ese chip no existe.');
    await pool.query("INSERT INTO asistente_salida (destino, tipo, datos) VALUES ('whatsapp', 'desvincular', $1)", [JSON.stringify({ chip: id })]);
    log(`asistente: recuperar mensajes del chip ${String.fromCharCode(64 + id)} desde ${desde.toISOString()} (se desvincula para volver a escanear)`);
    res.json(await estado());
  }));
  r.delete('/asistente/chips/:id', apiPost, ah(async (req, res) => {
    const id = Number(req.params.id);
    if (id === 1) throw he(409, 'El chip A no se puede quitar: es el de siempre. Podés pausarlo.');
    const { rowCount } = await pool.query('DELETE FROM asistente_whatsapp WHERE id = $1', [id]);
    if (!rowCount) throw he(404, 'Ese chip no existe.');
    await borrarAuth(pool, id); // el agente lo cierra en la próxima supervisión
    log(`asistente: chip ${String.fromCharCode(64 + id)} quitado`);
    res.json(await estado());
  }));

  const conversacionJson = (x) => ({
    id: x.id, telefono: x.telefono ? telefonoOculto(x.telefono) : 'Número oculto',
    cuenta: x.cuenta_id ? { id: x.cuenta_id, nombre: x.nombre || '', email: x.email || '' } : null,
    identificadoPor: x.identificado_por || null,
    estado: x.estado, motivoHumano: x.motivo_humano || null,
    silenciadoHasta: x.silenciado_hasta && new Date(x.silenciado_hasta) > new Date() ? x.silenciado_hasta : null,
    idioma: x.idioma, creado: x.creado, ultimoMensaje: x.ultimo_mensaje,
    chip: String.fromCharCode(64 + (Number(x.chip) || 1)),
    captacion: x.cap_estado ? { id: x.captacion_id, estado: x.cap_estado } : null,
    ultimo: x.u_creado ? { texto: x.u_texto ? String(x.u_texto).slice(0, 140) : null, tipo: x.u_tipo, dir: x.u_dir, origen: x.u_origen, creado: x.u_creado } : null,
  });
  const SELECT_CONV = `SELECT c.*, p.datos->>'displayName' AS nombre, cu.email, cc.estado AS cap_estado,
      u.texto AS u_texto, u.tipo AS u_tipo, u.dir AS u_dir, u.origen AS u_origen, u.creado AS u_creado
    FROM asistente_conversaciones c
    LEFT JOIN perfiles p ON p.cuenta_id = c.cuenta_id LEFT JOIN cuentas cu ON cu.id = c.cuenta_id
    LEFT JOIN captacion_contactos cc ON cc.id = c.captacion_id
    LEFT JOIN LATERAL (SELECT texto, tipo, dir, origen, creado FROM asistente_mensajes m WHERE m.conversacion_id = c.id ORDER BY m.id DESC LIMIT 1) u ON true`;

  r.get('/asistente/conversaciones', ah(async (req, res) => {
    const args = []; const conds = [];
    const est = String(req.query.estado || '');
    if (est === 'humano') conds.push("(c.estado = 'humano' OR c.silenciado_hasta > now())");
    else if (est === 'bot') conds.push("c.estado = 'bot' AND (c.silenciado_hasta IS NULL OR c.silenciado_hasta <= now())");
    else if (est === 'captacion') conds.push('c.captacion_id IS NOT NULL');
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 60) : '';
    if (q) {
      args.push('%' + q.replace(/[\\%_]/g, (ch) => '\\' + ch) + '%');
      const dig = q.replace(/\D/g, '');
      args.push(dig.length >= 4 ? '%' + dig : null);
      conds.push(`(p.datos->>'displayName' ILIKE $1 OR cu.email ILIKE $1 OR ($2::text IS NOT NULL AND c.telefono LIKE $2))`);
    }
    const { rows } = await pool.query(`${SELECT_CONV} ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''}
      ORDER BY c.ultimo_mensaje DESC NULLS LAST, c.creado DESC LIMIT 300`, args);
    res.json({ items: rows.map(conversacionJson), total: rows.length });
  }));

  r.get('/asistente/conversaciones/:id', ah(async (req, res) => {
    const id = uuid(req.params.id);
    const { rows } = await pool.query(`${SELECT_CONV} WHERE c.id = $1`, [id]);
    if (!rows[0]) throw he(404, 'Conversación no encontrada.');
    const [m, p] = await Promise.all([
      pool.query('SELECT id, dir, origen, tipo, texto, media_ruta, creado FROM asistente_mensajes WHERE conversacion_id = $1 ORDER BY id DESC LIMIT 300', [id]),
      pool.query(`SELECT pc.id, pc.codigo, pc.pack_nombre, pc.estado, pc.creado, pc.comprobante_ruta IS NOT NULL AS comprobante, pc.moneda_asistente
                  FROM asistente_conv_pedidos cp JOIN pedidos_creditos pc ON pc.id = cp.pedido_id WHERE cp.conversacion_id = $1 ORDER BY pc.creado DESC`, [id]),
    ]);
    const cuentasP = await cuentasDePedidos(pool, p.rows.map((x) => x.id));
    res.json({
      conversacion: conversacionJson(rows[0]),
      mensajes: m.rows.reverse().map((x) => ({ id: String(x.id), dir: x.dir, origen: x.origen, tipo: x.tipo, texto: x.texto, archivo: Boolean(x.media_ruta), creado: x.creado })),
      // cuenta = la que se le pasó para transferir en la moneda elegida (pesos si no se le preguntó); null = ninguna
      pedidos: p.rows.map((x) => {
        const c = cuentasP.get(x.id) || {};
        const k = c[x.moneda_asistente || 'ARS'] || null;
        return { id: x.id, codigo: x.codigo, pack: x.pack_nombre, estado: x.estado, creado: x.creado, comprobante: x.comprobante, moneda: x.moneda_asistente || null,
          cuenta: k ? { moneda: k.moneda, alias: k.alias, titular: k.titular } : null };
      }),
    });
  }));

  r.get('/asistente/conversaciones/:id/mensajes/:mid/archivo', ah(async (req, res) => {
    const id = uuid(req.params.id);
    if (!/^\d{1,18}$/.test(String(req.params.mid))) throw he(404, 'No encontrado.');
    const { rows } = await pool.query('SELECT media_ruta FROM asistente_mensajes WHERE id = $1 AND conversacion_id = $2', [req.params.mid, id]);
    const f = rows[0] && rows[0].media_ruta ? await privado.abrir(rows[0].media_ruta) : null;
    if (!f) throw he(404, 'Archivo no encontrado.');
    res.set({
      'Content-Type': f.tipo, 'Content-Length': String(f.size), 'Cache-Control': 'no-store, private', 'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    });
    f.stream.on('error', () => res.destroy());
    f.stream.pipe(res);
  }));

  r.post('/asistente/conversaciones/:id/humano', apiPost, ah(async (req, res) => {
    const id = uuid(req.params.id);
    const humano = body(req).humano;
    if (typeof humano !== 'boolean') throw he(400, 'Falta humano: true o false.');
    const { rows } = await pool.query(
      humano
        ? "UPDATE asistente_conversaciones SET estado = 'humano', motivo_humano = 'Desde el admin', actualizado = now() WHERE id = $1 RETURNING id"
        : "UPDATE asistente_conversaciones SET estado = 'bot', motivo_humano = NULL, silenciado_hasta = NULL, actualizado = now() WHERE id = $1 RETURNING id",
      [id]);
    if (!rows[0]) throw he(404, 'Conversación no encontrada.');
    const c = await pool.query(`${SELECT_CONV} WHERE c.id = $1`, [id]);
    res.json({ ok: true, conversacion: conversacionJson(c.rows[0]) });
  }));

  // "Agente responda último mensaje" (22/11/2026, pedido de Juan): para retomar un chat que contestó él (o que quedó con
  // una persona). Vuelve al asistente (sin silencio) y el agente contesta YA el último mensaje de la otra persona,
  // leyendo todo el chat (también lo que escribió Juan) y aunque parezca una despedida. Se le pide por la base
  // (asistente_salida, tipo 'responder'). Solo si el último mensaje es de la otra persona y el chip está conectado.
  // Pide al agente que responda ya el chat (lo usan el botón y "lo que dijo en el audio"). Error si no se puede.
  async function pedirRespuesta(id) {
    const { rows } = await pool.query('SELECT id, chip FROM asistente_conversaciones WHERE id = $1', [id]);
    if (!rows[0]) throw he(404, 'Conversación no encontrada.');
    const chip = Number(rows[0].chip) || 1;
    const letra = String.fromCharCode(64 + chip);
    const u = await pool.query('SELECT id, dir FROM asistente_mensajes WHERE conversacion_id = $1 ORDER BY id DESC LIMIT 1', [id]);
    if (!u.rows[0] || u.rows[0].dir !== 'in') throw he(409, 'El último mensaje del chat es nuestro: no hay nada para responder.');
    if (!(await leerAjustes(pool)).activo) throw he(409, 'El asistente está apagado (Mensajería → WhatsApp).');
    const w = (await pool.query('SELECT estado, latido FROM asistente_whatsapp WHERE id = $1', [chip])).rows[0];
    const vivo = w && w.latido && Date.now() - new Date(w.latido).getTime() < LATIDO_VIVO_MS;
    if (!vivo || w.estado !== 'conectado') throw he(409, `El chip ${letra} no está conectado.`);
    await pool.query("UPDATE asistente_conversaciones SET estado = 'bot', motivo_humano = NULL, silenciado_hasta = NULL, actualizado = now() WHERE id = $1", [id]);
    // Una sola vez por mensaje (dos toques seguidos no responden dos veces)
    await pool.query(
      "INSERT INTO asistente_salida (destino, tipo, conversacion_id, clave) VALUES ('whatsapp', 'responder', $1, $2) ON CONFLICT (clave) DO NOTHING",
      [id, `responder:${id}:${u.rows[0].id}`]);
    log(`asistente: chip ${letra}: el admin pidió que el agente responda un chat`);
  }
  const convJson = async (id) => conversacionJson((await pool.query(`${SELECT_CONV} WHERE c.id = $1`, [id])).rows[0]);

  r.post('/asistente/conversaciones/:id/responder', apiPost, ah(async (req, res) => {
    const id = uuid(req.params.id);
    await pedirRespuesta(id);
    res.json({ ok: true, conversacion: await convJson(id) });
  }));

  // Audio (23/11/2026, pedido de Juan): el chat pasó a él; escribe lo que dijo la persona debajo del audio y el agente le
  // responde con eso (el texto queda guardado en el mensaje del audio y la IA lo lee como lo que dijo). Si no se puede
  // pedir la respuesta (chip desconectado, el último mensaje ya es nuestro), el texto igual queda guardado.
  r.post('/asistente/conversaciones/:id/mensajes/:mid/audio', apiPost, ah(async (req, res) => {
    const id = uuid(req.params.id);
    if (!/^\d{1,18}$/.test(String(req.params.mid))) throw he(404, 'No encontrado.');
    const texto = String(body(req).texto || '').trim();
    if (!texto) throw he(400, 'Escribí lo que dijo en el audio.');
    if (texto.length > 2000) throw he(400, 'Como máximo 2000 caracteres.');
    const { rowCount } = await pool.query(
      "UPDATE asistente_mensajes SET texto = $3 WHERE id = $1 AND conversacion_id = $2 AND dir = 'in' AND tipo = 'audio'", [req.params.mid, id, texto]);
    if (!rowCount) throw he(404, 'Audio no encontrado.');
    let responde = true; let aviso = null;
    try { await pedirRespuesta(id); } catch (e) { if (!e.expose) throw e; responde = false; aviso = e.message; }
    res.json({ ok: true, responde, aviso, conversacion: await convJson(id) });
  }));

  r.use('/asistente', (e, req, res, next) => {
    if (e.type === 'entity.parse.failed') return res.status(400).json({ error: 'Formato de datos inválido.' });
    if (e.expose) return res.status(e.status || 400).json({ error: e.message });
    log('error admin-asistente:', req.method, req.path, e.code || '', e.message);
    next(e);
  });
  return r;
}
