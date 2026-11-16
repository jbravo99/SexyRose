// Admin → Asistente (asistente de cuenta por WhatsApp). Se monta bajo `${A}/api` (Basic Auth del admin; lo que
// modifica, con apiPost: JSON + X-SR-Admin: 1 + mismo origen).
//   GET  /asistente                                     → ajustes, estado de WhatsApp (QR en SVG si espera escaneo), IA
//   PUT  /asistente/ajustes            {activo, alias, titular, aliasUsd?, titularUsd?} (sin los de dólares, quedan los guardados)
//   POST /asistente/desvincular                         → el agente cierra la sesión de WhatsApp (pide QR nuevo)
//   GET  /asistente/conversaciones?estado=bot|humano&q= → lista (teléfono enmascarado, cuenta, último mensaje, estado)
//   GET  /asistente/conversaciones/:id                  → chat completo + pedidos nombrados
//   GET  /asistente/conversaciones/:id/mensajes/:mid/archivo → el comprobante (privado, no-store)
//   POST /asistente/conversaciones/:id/humano {humano: true|false} → "Pasar a humano" / "Devolver al asistente"
import express from 'express';
import QRCode from 'qrcode';
import { LATIDO_VIVO_MS, leerAjustes, telefonoOculto, validarAjustes } from '../lib/asistente-comun.js';

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

  async function estado() {
    const [aj, wa] = await Promise.all([leerAjustes(pool), pool.query('SELECT * FROM asistente_whatsapp WHERE id = 1')]);
    const w = wa.rows[0] || { estado: 'desconectado' };
    const vivo = Boolean(w.latido && Date.now() - new Date(w.latido).getTime() < LATIDO_VIVO_MS);
    let qrSvg = null;
    if (vivo && w.estado === 'esperando_qr' && w.qr && w.qr_creado && Date.now() - new Date(w.qr_creado).getTime() < QR_VIGENTE_MS) {
      const svg = await QRCode.toString(w.qr, { type: 'svg', margin: 2, errorCorrectionLevel: 'L', color: { dark: '#000000', light: '#ffffff' } });
      qrSvg = 'data:image/svg+xml;base64,' + Buffer.from(svg, 'utf8').toString('base64');
    }
    const n = await pool.query("SELECT count(*)::int AS total, count(*) FILTER (WHERE estado = 'humano')::int AS humano FROM asistente_conversaciones");
    return {
      ajustes: aj,
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
    };
  }

  r.get('/asistente', ah(async (req, res) => res.json(await estado())));

  r.put('/asistente/ajustes', apiPost, ah(async (req, res) => {
    // Quien manda solo {activo, alias, titular} (como antes de la cuenta en dólares) no borra la cuenta en dólares.
    const b = body(req);
    const actual = (b.aliasUsd === undefined || b.titularUsd === undefined) ? await leerAjustes(pool) : null;
    const v = validarAjustes(actual ? { ...b, aliasUsd: b.aliasUsd ?? actual.aliasUsd, titularUsd: b.titularUsd ?? actual.titularUsd } : b);
    if (v.error) throw he(400, v.error);
    await pool.query(
      `INSERT INTO ajustes (clave, valor, actualizado) VALUES ('asistente', $1::jsonb, now())
       ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado = now()`, [JSON.stringify(v.valor)]);
    res.json(await estado());
  }));

  r.post('/asistente/desvincular', apiPost, ah(async (req, res) => {
    await pool.query("INSERT INTO asistente_salida (destino, tipo) VALUES ('whatsapp', 'desvincular')");
    log('asistente: desvincular pedido desde el admin');
    res.json(await estado());
  }));

  const conversacionJson = (x) => ({
    id: x.id, telefono: x.telefono ? telefonoOculto(x.telefono) : 'Número oculto',
    cuenta: x.cuenta_id ? { id: x.cuenta_id, nombre: x.nombre || '', email: x.email || '' } : null,
    identificadoPor: x.identificado_por || null,
    estado: x.estado, motivoHumano: x.motivo_humano || null,
    silenciadoHasta: x.silenciado_hasta && new Date(x.silenciado_hasta) > new Date() ? x.silenciado_hasta : null,
    idioma: x.idioma, creado: x.creado, ultimoMensaje: x.ultimo_mensaje,
    ultimo: x.u_creado ? { texto: x.u_texto ? String(x.u_texto).slice(0, 140) : null, tipo: x.u_tipo, dir: x.u_dir, origen: x.u_origen, creado: x.u_creado } : null,
  });
  const SELECT_CONV = `SELECT c.*, p.datos->>'displayName' AS nombre, cu.email,
      u.texto AS u_texto, u.tipo AS u_tipo, u.dir AS u_dir, u.origen AS u_origen, u.creado AS u_creado
    FROM asistente_conversaciones c
    LEFT JOIN perfiles p ON p.cuenta_id = c.cuenta_id LEFT JOIN cuentas cu ON cu.id = c.cuenta_id
    LEFT JOIN LATERAL (SELECT texto, tipo, dir, origen, creado FROM asistente_mensajes m WHERE m.conversacion_id = c.id ORDER BY m.id DESC LIMIT 1) u ON true`;

  r.get('/asistente/conversaciones', ah(async (req, res) => {
    const args = []; const conds = [];
    const est = String(req.query.estado || '');
    if (est === 'humano') conds.push("(c.estado = 'humano' OR c.silenciado_hasta > now())");
    else if (est === 'bot') conds.push("c.estado = 'bot' AND (c.silenciado_hasta IS NULL OR c.silenciado_hasta <= now())");
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
    res.json({
      conversacion: conversacionJson(rows[0]),
      mensajes: m.rows.reverse().map((x) => ({ id: String(x.id), dir: x.dir, origen: x.origen, tipo: x.tipo, texto: x.texto, archivo: Boolean(x.media_ruta), creado: x.creado })),
      pedidos: p.rows.map((x) => ({ id: x.id, codigo: x.codigo, pack: x.pack_nombre, estado: x.estado, creado: x.creado, comprobante: x.comprobante, moneda: x.moneda_asistente || null })),
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

  r.use('/asistente', (e, req, res, next) => {
    if (e.type === 'entity.parse.failed') return res.status(400).json({ error: 'Formato de datos inválido.' });
    if (e.expose) return res.status(e.status || 400).json({ error: e.message });
    log('error admin-asistente:', req.method, req.path, e.code || '', e.message);
    next(e);
  });
  return r;
}
