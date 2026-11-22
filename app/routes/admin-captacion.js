// Admin → Mensajería → Captación (16/11/2026, decisión de Juan). Se monta bajo `${A}/api` (Basic Auth del admin; lo
// que modifica, con apiPost: JSON + X-SR-Admin: 1 + mismo origen; la planilla, con las mismas cabeceras y el archivo
// como application/octet-stream). Ver lib/captacion.js y FASE1-CONTRATO.md → "Mensajería" → "Captación".
//   GET  /captacion?chip=<id>              → números (por estado, enviados hoy y esta semana, respuestas, registros),
//                                            ajustes {mensaje, mensajes, porDia}, los chips de captación (cupo de cada
//                                            uno hoy), la cola de hoy del chip elegido y los de "revisar". Varios chips
//                                            (19/11/2026): sin chip (o uno pausado), el que tiene más cupo libre (rota).
//   GET  /captacion/contactos?estado=&q=   → toda la lista (hasta 200, teléfono enmascarado)
//   POST /captacion/importar?nombre=x.xlsx → importa la planilla (.xlsx hoja "Contactos" o .csv); une sin duplicar
//   POST /captacion/:id/abierto {chip?}    → Juan tocó "Abrir chat" (solo pendiente/abierto), con el chip elegido
//   POST /captacion/:id/estado {estado}    → enviado (marcar a mano) | revisado (es mayor de edad → pendiente) |
//                                            descartado | no_escribir | no_disponible (el número ya no tiene
//                                            WhatsApp) | pendiente (deshacer abierto/enviado/no_disponible)
//   PUT  /captacion/ajustes {mensaje?, porDia?}
//   POST /captacion/vaciar {confirmar: true} → borra todos los contactos que no se registraron
import express from 'express';
import { sameOrigin } from '../lib/auth.js';
import { telefonoOculto } from '../lib/asistente-comun.js';
import {
  ESTADOS, MENSAJE_DEFAULT, POR_DIA_DEFAULT, contactosDeFilas, importarContactos, leerAjustesCaptacion, validarAjustesCaptacion,
} from '../lib/captacion.js';
import { MAX_ARCHIVO, leerPlanilla } from '../lib/xlsx-lector.js';
import { listarChips } from '../lib/chips.js';
import { invitacionDe } from '../lib/captacion.js';
import { LATIDO_VIVO_MS } from '../lib/asistente-comun.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TZ = 'America/Argentina/Buenos_Aires';
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; this.expose = true; } }
const he = (s, m) => new HttpError(s, m);

export function createAdminCaptacionRouter({ pool, apiPost, log = () => {} }) {
  const r = express.Router();
  const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  const body = (req) => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {});
  const uuid = (v) => { if (!UUID_RE.test(String(v || ''))) throw he(404, 'No encontrado.'); return v; };
  r.use('/captacion', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  // La planilla: mismas cabeceras que apiPost, pero el cuerpo es el archivo
  const subir = [
    (req, res, next) => {
      if (req.get('x-sr-admin') !== '1') return res.status(403).json({ error: 'Solicitud rechazada: falta la cabecera del panel.' });
      if (!sameOrigin(req)) return res.status(403).json({ error: 'Solicitud rechazada: origen no válido.' });
      if (!req.is('application/octet-stream')) return res.status(415).json({ error: 'Mandá el archivo de la planilla (.xlsx o .csv).' });
      next();
    },
    express.raw({ type: 'application/octet-stream', limit: MAX_ARCHIVO + 1024 }),
  ];

  const nombresDe = (x) => ({ id: x.id, nombre: x.cuenta_nombre || '' });
  const contactoJson = (x, mensaje = null) => ({
    id: x.id, telefono: telefonoOculto(x.telefono), extranjero: !String(x.telefono).startsWith('+549'),
    nombres: x.nombres || [], ciudades: x.ciudades || [], categorias: x.categorias || [], sitios: x.sitios || [], urls: x.urls || [],
    avisos: x.avisos, fecha: x.fecha_aviso || null, nota: x.nota || null,
    estado: x.estado, motivo: x.estado === 'revisar' ? (x.motivo || 'Revisar') : null, tipoMotivo: x.estado === 'revisar' ? (x.tipo_motivo || null) : null, revisado: x.revisado || null,
    abierto: x.abierto, enviado: x.enviado, respondio: x.respondio, registrado: x.registrado, noEscribir: x.no_escribir,
    chip: x.chip ? String.fromCharCode(64 + Number(x.chip)) : null,
    cuenta: x.cuenta_id ? nombresDe({ id: x.cuenta_id, cuenta_nombre: x.cuenta_nombre }) : null,
    conversacion: x.conv_id || null,
    // El enlace con el número completo solo para lo que se puede invitar (nunca "revisar", "no escribir", etc.)
    // mensaje = ajustes de captación: la invitación que escribió la IA para este contacto, o una versión fija (sin link)
    waUrl: mensaje && (x.estado === 'pendiente' || x.estado === 'abierto')
      ? `https://wa.me/${String(x.telefono).replace(/\D/g, '')}?text=${encodeURIComponent(invitacionDe(x, mensaje))}` : null,
    invitacionIa: Boolean(mensaje && mensaje.ia !== false && x.mensaje),
  });
  const SELECT = `SELECT cc.*, p.datos->>'displayName' AS cuenta_nombre,
      (SELECT c.id FROM asistente_conversaciones c WHERE c.captacion_id = cc.id ORDER BY c.ultimo_mensaje DESC NULLS LAST LIMIT 1) AS conv_id
    FROM captacion_contactos cc LEFT JOIN perfiles p ON p.cuenta_id = cc.cuenta_id`;
  const ORDEN_COLA = "(cc.estado = 'abierto') DESC, cc.avisos DESC, lower(COALESCE(cc.ciudades[1], 'zzz')), cc.telefono";

  // Chips de captación activos (no pausados), con lo que mandó cada uno hoy (lo de antes de los chips cuenta para el 1)
  async function chipsCaptacion() {
    const [todos, hoy] = await Promise.all([
      listarChips(pool),
      pool.query(`SELECT COALESCE(chip, 1) AS chip, count(*)::int AS n FROM captacion_contactos
        WHERE enviado >= (date_trunc('day', now() AT TIME ZONE '${TZ}') AT TIME ZONE '${TZ}') GROUP BY 1`),
    ]);
    const n = new Map(hoy.rows.map((r) => [Number(r.chip), r.n]));
    return todos.filter((c) => c.rol === 'captacion' && !c.pausado).map((c) => {
      const vivo = Boolean(c.latido && Date.now() - new Date(c.latido).getTime() < LATIDO_VIVO_MS);
      const enviadosHoy = n.get(Number(c.id)) || 0;
      return { id: Number(c.id), letra: c.letra, porDia: c.por_dia, enviadosHoy, cupo: Math.max(0, c.por_dia - enviadosHoy), conectado: vivo && c.estado === 'conectado' };
    });
  }
  // El chip pedido (si es de captación y está activo) o el que tiene más cupo libre hoy (empate: la letra más baja)
  const elegirChip = (chips, pedido) => chips.find((c) => c.id === Number(pedido))
    || [...chips].sort((a, b) => b.cupo - a.cupo || a.id - b.id)[0] || null;

  async function resumen(chipPedido = null) {
    const aj = await leerAjustesCaptacion(pool);
    const chips = await chipsCaptacion();
    const elegido = elegirChip(chips, chipPedido);
    const [porEstado, n] = await Promise.all([
      pool.query('SELECT estado, count(*)::int AS n FROM captacion_contactos GROUP BY estado'),
      pool.query(`SELECT
          count(*) FILTER (WHERE enviado >= (date_trunc('day', now() AT TIME ZONE '${TZ}') AT TIME ZONE '${TZ}'))::int AS hoy,
          count(*) FILTER (WHERE enviado >= (date_trunc('week', now() AT TIME ZONE '${TZ}') AT TIME ZONE '${TZ}'))::int AS semana,
          count(*) FILTER (WHERE enviado IS NOT NULL OR estado IN ('enviado', 'respondio'))::int AS contactados,
          count(*) FILTER (WHERE respondio IS NOT NULL)::int AS respondieron,
          count(*) FILTER (WHERE estado = 'se_registro')::int AS registrados,
          count(*) FILTER (WHERE estado = 'se_registro' AND enviado IS NOT NULL)::int AS registradosInvitados,
          count(*)::int AS total
        FROM captacion_contactos`),
    ]);
    const estados = Object.fromEntries(ESTADOS.map((e) => [e, 0]));
    for (const x of porEstado.rows) estados[x.estado] = x.n;
    const s = n.rows[0];
    const cupo = elegido ? elegido.cupo : 0;
    const [cola, revisar] = await Promise.all([
      cupo ? pool.query(`${SELECT} WHERE cc.estado IN ('pendiente', 'abierto') ORDER BY ${ORDEN_COLA} LIMIT $1`, [cupo]) : { rows: [] },
      pool.query(`${SELECT} WHERE cc.estado = 'revisar' ORDER BY cc.tipo_motivo = 'joven' DESC, cc.avisos DESC, cc.telefono LIMIT 200`),
    ]);
    return {
      estados,
      numeros: {
        total: s.total, enviadosHoy: s.hoy, enviadosSemana: s.semana, contactados: s.contactados, respondieron: s.respondieron,
        tasaRespuesta: s.contactados ? Math.round((s.respondieron / s.contactados) * 1000) / 10 : null,
        registrados: s.registrados, registradosInvitados: s.registradosInvitados,
      },
      ajustes: { ...aj, mensajeDefault: MENSAJE_DEFAULT, porDiaDefault: POR_DIA_DEFAULT },
      chips,
      cola: {
        chip: elegido ? { id: elegido.id, letra: elegido.letra, conectado: elegido.conectado } : null,
        porDia: elegido ? elegido.porDia : 0, enviadosHoy: elegido ? elegido.enviadosHoy : 0, cupo,
        items: cola.rows.map((x) => contactoJson(x, aj)),
      },
      revisar: revisar.rows.map((x) => contactoJson(x)),
    };
  }

  r.get('/captacion', ah(async (req, res) => res.json(await resumen(req.query.chip || null))));

  r.get('/captacion/contactos', ah(async (req, res) => {
    const args = []; const conds = [];
    const est = String(req.query.estado || '');
    if (est && est !== 'todos') {
      if (!ESTADOS.includes(est)) throw he(400, 'Estado desconocido.');
      args.push(est); conds.push(`cc.estado = $${args.length}`);
    }
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 60) : '';
    if (q) {
      args.push('%' + q.replace(/[\\%_]/g, (ch) => '\\' + ch) + '%');
      const i = args.length;
      const dig = q.replace(/\D/g, '');
      args.push(dig.length >= 4 ? '%' + dig + '%' : null);
      conds.push(`(array_to_string(cc.nombres, ' ') ILIKE $${i} OR array_to_string(cc.ciudades, ' ') ILIKE $${i} OR array_to_string(cc.sitios, ' ') ILIKE $${i}
        OR ($${i + 1}::text IS NOT NULL AND cc.telefono LIKE $${i + 1}))`);
    }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
    const aj = await leerAjustesCaptacion(pool);
    const [{ rows }, tot] = await Promise.all([
      pool.query(`${SELECT} ${where} ORDER BY cc.actualizado DESC, ${ORDEN_COLA} LIMIT 200`, args),
      pool.query(`SELECT count(*)::int AS n FROM captacion_contactos cc ${where}`, args),
    ]);
    res.json({ items: rows.map((x) => contactoJson(x, aj)), total: tot.rows[0].n });
  }));

  r.post('/captacion/importar', subir, ah(async (req, res) => {
    const nombre = String(req.query.nombre || '').slice(0, 200);
    const p = leerPlanilla(Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0), nombre, { hoja: 'Contactos' });
    const c = contactosDeFilas(p.filas);
    if (c.error) throw he(400, c.error);
    if (!c.contactos.length) throw he(400, 'La planilla no tiene teléfonos para importar.');
    const r2 = await importarContactos(pool, c.contactos);
    log(`captación: planilla importada (${c.contactos.length} teléfonos)`);
    res.json({
      ok: true, tipo: p.tipo, hoja: p.hoja, filasLeidas: c.filasLeidas, telefonos: c.contactos.length, repetidosEnArchivo: c.repetidosEnArchivo,
      sinTelefono: c.sinTelefono, nuevos: r2.nuevos, actualizados: r2.actualizados, enSitio: r2.enSitio,
      revisar: c.contactos.filter((x) => x.estado === 'revisar').length,
      resumen: await resumen(),
    });
  }));

  r.post('/captacion/:id/abierto', apiPost, ah(async (req, res) => {
    const id = uuid(req.params.id);
    // Con qué chip se abrió (si es uno de captación activo); el asistente lo confirma cuando ve el envío
    const chips = await chipsCaptacion();
    const pedido = Number(body(req).chip);
    const chip = chips.some((c) => c.id === pedido) ? pedido : null;
    const { rows } = await pool.query(
      "UPDATE captacion_contactos SET estado = 'abierto', abierto = now(), chip = COALESCE($2, chip), actualizado = now() WHERE id = $1 AND estado IN ('pendiente', 'abierto') RETURNING id", [id, chip]);
    if (!rows[0]) throw he(409, 'Este contacto ya no está para invitar.');
    res.json({ ok: true });
  }));

  // Cambios de estado permitidos (los demás, "no se puede")
  const CAMBIOS = {
    enviado: { desde: ['pendiente', 'abierto'], sql: "estado = 'enviado', enviado = COALESCE(enviado, now())" },
    revisado: { desde: ['revisar'], sql: "estado = 'pendiente', revisado = now()" },
    descartado: { desde: ['pendiente', 'abierto', 'enviado', 'respondio', 'revisar', 'no_escribir', 'en_sitio', 'no_disponible'], sql: "estado = 'descartado'" },
    no_escribir: { desde: ['pendiente', 'abierto', 'enviado', 'respondio', 'revisar', 'descartado', 'en_sitio', 'no_disponible'], sql: "estado = 'no_escribir', no_escribir = now()" },
    // El número ya no tiene WhatsApp: sale de la cola; no cuenta como enviado (no le llegó nada) ni para el cupo del día
    no_disponible: { desde: ['pendiente', 'abierto', 'enviado'], sql: "estado = 'no_disponible', enviado = NULL, abierto = NULL" },
    pendiente: { desde: ['abierto', 'enviado', 'no_disponible'], sql: "estado = 'pendiente', enviado = NULL, abierto = NULL" },
  };
  r.post('/captacion/:id/estado', apiPost, ah(async (req, res) => {
    const id = uuid(req.params.id);
    const est = String(body(req).estado || '');
    const c = CAMBIOS[est];
    if (!c) throw he(400, 'Estado: enviado, revisado, descartado, no_escribir, no_disponible o pendiente.');
    const { rows } = await pool.query(
      `UPDATE captacion_contactos SET ${c.sql}, actualizado = now() WHERE id = $1 AND estado = ANY($2::text[]) RETURNING id`, [id, c.desde]);
    if (!rows[0]) {
      const ex = await pool.query('SELECT estado FROM captacion_contactos WHERE id = $1', [id]);
      if (!ex.rows[0]) throw he(404, 'Contacto no encontrado.');
      throw he(409, 'Ese cambio no se puede hacer desde el estado actual.');
    }
    const aj = await leerAjustesCaptacion(pool);
    const x = await pool.query(`${SELECT} WHERE cc.id = $1`, [id]);
    res.json({ ok: true, contacto: contactoJson(x.rows[0], aj) });
  }));

  r.put('/captacion/ajustes', apiPost, ah(async (req, res) => {
    const v = validarAjustesCaptacion(body(req), await leerAjustesCaptacion(pool));
    if (v.error) throw he(400, v.error);
    await pool.query(
      `INSERT INTO ajustes (clave, valor, actualizado) VALUES ('captacion', $1::jsonb, now())
       ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado = now()`, [JSON.stringify(v.valor)]);
    res.json(await resumen());
  }));

  r.post('/captacion/vaciar', apiPost, ah(async (req, res) => {
    if (body(req).confirmar !== true) throw he(400, 'Falta confirmar.');
    const { rowCount } = await pool.query("DELETE FROM captacion_contactos WHERE estado <> 'se_registro'");
    log(`captación: lista vaciada (${rowCount} contactos)`);
    res.json({ ok: true, borrados: rowCount, resumen: await resumen() });
  }));

  r.use('/captacion', (e, req, res, next) => {
    if (e.type === 'entity.parse.failed') return res.status(400).json({ error: 'Formato de datos inválido.' });
    if (e.type === 'entity.too.large') return res.status(413).json({ error: 'El archivo pesa más de 8 MB.' });
    if (e.expose) return res.status(e.status || 400).json({ error: e.message });
    log('error admin-captacion:', req.method, req.path, e.code || '', e.message);
    next(e);
  });
  return r;
}
