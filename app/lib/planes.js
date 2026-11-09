// Planes pagos (Fase 2, agente B): precios, pedidos por transferencia, suscripciones, plan efectivo, cupo Star y vencimientos.
//
// Códigos del MVP: S Star, A Diamante, B Platino, C Oro, D Plata, E Bronce (gratis: nunca es un pedido ni una suscripción).
// Plan efectivo = el de mayor rango entre las suscripciones activas con desde <= ahora < hasta; sin ninguna, E.
// Así una semana de Diamante sobre un Platino mensual sube 7 días y después vuelve sola a Platino.
//
// Uso:
//   import { createPlanes } from './lib/planes.js';
//   const planes = createPlanes({ pool, sendMail, log, siteUrl });
//   sendMail({ to, subject, text, html }) → Promise (lib/mail.js del agente A). Si falla, se loguea y se sigue.
//   planes.setInvalidarSitio(fn) → se llama después de cada cambio que mueve un plan efectivo (caché de /api/sitio/estado).
import crypto from 'node:crypto';

export const PLAN_CODIGOS = ['E', 'D', 'C', 'B', 'A', 'S'];
export const PLANES_PAGOS = ['D', 'C', 'B', 'A', 'S'];
export const PLANES_SEMANA = ['B', 'A', 'S'];
export const PLAN_NOMBRE = { S: 'Star', A: 'Diamante', B: 'Platino', C: 'Oro', D: 'Plata', E: 'Bronce' };
export const RANGO = { E: 1, D: 2, C: 3, B: 4, A: 5, S: 6 };
export const PRECIOS_DEFAULT = Object.freeze({
  mes: Object.freeze({ E: 0, D: 20, C: 45, B: 70, A: 150, S: 350 }),
  semana: Object.freeze({ B: 21, A: 45, S: 105 }),
});
export const CUPO_STAR = 10;
export const DIAS_PERIODO = { mes: 30, semana: 7 };
const DAY = 24 * 60 * 60 * 1000;
// Sin 0/O, 1/I/L: se dicta y se escribe en el concepto de la transferencia.
const REF_ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export class PlanError extends Error {
  constructor(status, message) { super(message); this.status = status; this.expose = true; }
}
const err = (status, msg) => new PlanError(status, msg);

const rangoSql = "array_position(ARRAY['E','D','C','B','A','S'], plan)";

export function nuevaReferencia() {
  const b = crypto.randomBytes(4);
  let s = '';
  for (let i = 0; i < 4; i++) s += REF_ALFABETO[b[i] % REF_ALFABETO.length];
  return 'SR-' + s;
}

const num = (v) => (v === null || v === undefined ? null : Number(v));

// Precios guardados (ajustes.precios) sobre los de defecto. Valida forma; lo inválido se ignora.
export function mezclarPrecios(valor) {
  const out = { mes: { ...PRECIOS_DEFAULT.mes }, semana: { ...PRECIOS_DEFAULT.semana } };
  if (valor && typeof valor === 'object') {
    for (const p of ['mes', 'semana']) {
      const src = valor[p];
      if (!src || typeof src !== 'object') continue;
      for (const k of Object.keys(out[p])) {
        const n = Number(src[k]);
        if (src[k] !== undefined && src[k] !== null && Number.isFinite(n) && n >= 0) out[p][k] = Math.round(n * 100) / 100;
      }
    }
  }
  return out;
}

// Valida un PUT de precios del admin. Devuelve { valor } o { error }.
export function validarPrecios(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { error: 'Formato de precios inválido.' };
  const out = { mes: {}, semana: {} };
  for (const [p, claves] of [['mes', PLAN_CODIGOS], ['semana', PLANES_SEMANA]]) {
    const src = v[p];
    if (!src || typeof src !== 'object' || Array.isArray(src)) return { error: `Faltan los precios por ${p}.` };
    for (const k of Object.keys(src)) if (!claves.includes(k)) return { error: `Plan desconocido en precios por ${p}: ${k}.` };
    for (const k of claves) {
      const n = Number(src[k]);
      if (src[k] === undefined || src[k] === null || src[k] === '' || !Number.isFinite(n) || n < 0 || n > 100000) {
        return { error: `Precio inválido: ${PLAN_NOMBRE[k]} por ${p}.` };
      }
      out[p][k] = Math.round(n * 100) / 100;
    }
  }
  return { valor: out };
}

const pedidoJson = (r) => ({
  id: r.id, cuentaId: r.cuenta_id, plan: r.plan, planNombre: PLAN_NOMBRE[r.plan], periodo: r.periodo,
  montoUsd: num(r.monto_usd), estado: r.estado, referencia: r.referencia, nota: r.nota, motivo: r.motivo,
  tieneComprobante: Boolean(r.comprobante_ruta), provinciaStar: r.provincia_star,
  creado: r.creado, informado: r.informado, confirmado: r.confirmado,
});
const suscripcionJson = (r, ahora = Date.now()) => ({
  id: r.id, cuentaId: r.cuenta_id, pedidoId: r.pedido_id, plan: r.plan, planNombre: PLAN_NOMBRE[r.plan], periodo: r.periodo,
  desde: r.desde, hasta: r.hasta, estado: r.estado, nota: r.nota, creado: r.creado,
  vigente: r.estado === 'activa' && new Date(r.desde).getTime() <= ahora && new Date(r.hasta).getTime() > ahora,
});
export { pedidoJson, suscripcionJson };

export function createPlanes({ pool, sendMail = null, log = () => {}, siteUrl = 'https://sexyrose.net' } = {}) {
  let invalidarSitio = () => {};
  let timer = null;
  const url = String(siteUrl || 'https://sexyrose.net').replace(/\/+$/, '');

  const mail = async (cuentaId, subject, text) => {
    if (!sendMail) return false;
    try {
      const { rows } = await pool.query("SELECT email FROM cuentas WHERE id = $1 AND estado <> 'baja'", [cuentaId]);
      if (!rows[0]) return false;
      await sendMail({ to: rows[0].email, subject, text, html: textoAHtml(text) });
      return true;
    } catch (e) {
      log('planes: no se pudo enviar el email:', e.code || e.message);
      return false;
    }
  };
  const invalidar = () => { try { invalidarSitio(); } catch { /* */ } };

  async function precios(db = pool) {
    const { rows } = await db.query("SELECT valor FROM ajustes WHERE clave = 'precios'");
    return mezclarPrecios(rows[0] && rows[0].valor);
  }

  async function planEfectivo(cuentaId, db = pool) {
    const { rows } = await db.query(
      `SELECT plan FROM suscripciones WHERE cuenta_id = $1 AND estado = 'activa' AND desde <= now() AND hasta > now()
       ORDER BY ${rangoSql} DESC LIMIT 1`, [cuentaId]);
    return rows[0] ? rows[0].plan : 'E';
  }

  async function planesEfectivos(ids, db = pool) {
    const out = new Map();
    const lista = [...new Set((ids || []).filter(Boolean))];
    for (const id of lista) out.set(id, 'E');
    if (!lista.length) return out;
    const { rows } = await db.query(
      `SELECT DISTINCT ON (cuenta_id) cuenta_id, plan FROM suscripciones
       WHERE cuenta_id = ANY($1::uuid[]) AND estado = 'activa' AND desde <= now() AND hasta > now()
       ORDER BY cuenta_id, ${rangoSql} DESC`, [lista]);
    for (const r of rows) out.set(r.cuenta_id, r.plan);
    return out;
  }

  async function resumenPlan(cuentaId) {
    const [efectivo, s, p] = await Promise.all([
      planEfectivo(cuentaId),
      pool.query("SELECT * FROM suscripciones WHERE cuenta_id = $1 AND (estado = 'activa' OR hasta > now() - interval '60 days') ORDER BY hasta DESC LIMIT 20", [cuentaId]),
      pool.query('SELECT * FROM pedidos WHERE cuenta_id = $1 ORDER BY creado DESC LIMIT 20', [cuentaId]),
    ]);
    const ahora = Date.now();
    return { efectivo, suscripciones: s.rows.map((r) => suscripcionJson(r, ahora)), pedidos: p.rows.map(pedidoJson) };
  }

  async function provinciaDe(cuentaId, db = pool) {
    const { rows } = await db.query("SELECT NULLIF(btrim(datos->>'provincia'), '') AS provincia FROM perfiles WHERE cuenta_id = $1", [cuentaId]);
    return rows[0] ? rows[0].provincia : null;
  }

  // Stars vigentes en una provincia (por la provincia actual del perfil). excluir: cuenta que no cuenta (renovación).
  async function cupoStar(provincia, { excluir = null, db = pool } = {}) {
    if (!provincia) return { provincia: null, ocupadas: 0, libres: 0, total: CUPO_STAR };
    const { rows } = await db.query(
      `SELECT count(DISTINCT s.cuenta_id)::int AS n FROM suscripciones s JOIN perfiles p ON p.cuenta_id = s.cuenta_id
       WHERE s.plan = 'S' AND s.estado = 'activa' AND s.desde <= now() AND s.hasta > now()
         AND lower(btrim(p.datos->>'provincia')) = lower(btrim($1)) AND ($2::uuid IS NULL OR s.cuenta_id <> $2::uuid)`,
      [provincia, excluir]);
    const ocupadas = rows[0].n;
    return { provincia, ocupadas, libres: Math.max(0, CUPO_STAR - ocupadas), total: CUPO_STAR };
  }

  async function crearPedido(cuentaId, { plan, periodo } = {}) {
    if (plan === 'E') throw err(400, 'Bronce es gratis: no hace falta pagarlo.');
    if (!PLANES_PAGOS.includes(plan)) throw err(400, 'Elegí un plan válido.');
    if (!['mes', 'semana'].includes(periodo)) throw err(400, 'Elegí si pagás por mes o por semana.');
    if (periodo === 'semana' && !PLANES_SEMANA.includes(plan)) throw err(400, `${PLAN_NOMBRE[plan]} no se puede pagar por semana: solo Platino, Diamante y Star.`);
    const c = await pool.query("SELECT c.estado, p.cuenta_id AS tiene_perfil FROM cuentas c LEFT JOIN perfiles p ON p.cuenta_id = c.id WHERE c.id = $1", [cuentaId]);
    if (!c.rows[0]) throw err(404, 'Cuenta no encontrada.');
    if (c.rows[0].estado !== 'activa') throw err(403, 'Tu cuenta no está activa.');
    let provinciaStar = null;
    if (plan === 'S') {
      provinciaStar = await provinciaDe(cuentaId);
      if (!provinciaStar) throw err(400, 'Para Star tenés que tener cargada tu provincia en el perfil.');
      const cupo = await cupoStar(provinciaStar, { excluir: cuentaId });
      if (cupo.libres <= 0) throw err(409, `No quedan lugares Star en ${provinciaStar}: el cupo es de ${CUPO_STAR} por provincia.`);
    }
    const monto = (await precios())[periodo][plan];
    for (let i = 0; i < 6; i++) {
      try {
        const { rows } = await pool.query(
          `INSERT INTO pedidos (cuenta_id, plan, periodo, monto_usd, referencia, provincia_star)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [cuentaId, plan, periodo, monto, nuevaReferencia(), provinciaStar]);
        return pedidoJson(rows[0]);
      } catch (e) {
        if (e.code === '23505' && /pedidos_abierto_uk/.test(e.constraint || e.message)) {
          throw err(409, `Ya tenés un pedido abierto de ${PLAN_NOMBRE[plan]} por ${periodo}: informá el pago o cancelalo.`);
        }
        if (e.code === '23505') continue; // referencia repetida: otra
        throw e;
      }
    }
    throw err(500, 'No se pudo generar la referencia del pago. Probá de nuevo.');
  }

  async function pedidoDe(cuentaId, id) {
    const { rows } = await pool.query('SELECT * FROM pedidos WHERE id = $1 AND cuenta_id = $2', [id, cuentaId]);
    if (!rows[0]) throw err(404, 'Pedido no encontrado.');
    return rows[0];
  }

  // La acompañante avisa que transfirió (con comprobante opcional, ya guardado: comprobanteRuta relativa a privado/).
  async function informar(cuentaId, id, { nota = null, comprobanteRuta = null } = {}) {
    const p = await pedidoDe(cuentaId, id);
    if (!['pendiente', 'informado'].includes(p.estado)) throw err(409, 'Este pedido ya no se puede informar.');
    const { rows } = await pool.query(
      `UPDATE pedidos SET estado = 'informado', informado = now(), nota = COALESCE($3, nota),
         comprobante_ruta = COALESCE($4, comprobante_ruta)
       WHERE id = $1 AND cuenta_id = $2 RETURNING *`,
      [id, cuentaId, nota, comprobanteRuta]);
    return pedidoJson(rows[0]);
  }

  async function cancelar(cuentaId, id) {
    const p = await pedidoDe(cuentaId, id);
    if (!['pendiente', 'informado'].includes(p.estado)) throw err(409, 'Este pedido ya no se puede cancelar.');
    const { rows } = await pool.query("UPDATE pedidos SET estado = 'cancelado' WHERE id = $1 RETURNING *", [id]);
    return pedidoJson(rows[0]);
  }

  // Inserta una suscripción apilada: empieza cuando termina la última activa del MISMO plan (o ahora).
  async function apilar(db, { cuentaId, plan, periodo, dias, pedidoId = null, nota = null }) {
    const { rows: u } = await db.query(
      "SELECT max(hasta) AS hasta FROM suscripciones WHERE cuenta_id = $1 AND plan = $2 AND estado = 'activa' AND hasta > now()",
      [cuentaId, plan]);
    const { rows } = await db.query(
      `INSERT INTO suscripciones (cuenta_id, pedido_id, plan, periodo, desde, hasta, nota)
       VALUES ($1, $2, $3, $4, GREATEST(now(), COALESCE($5::timestamptz, now())),
               GREATEST(now(), COALESCE($5::timestamptz, now())) + make_interval(days => $6::int), $7)
       RETURNING *`,
      [cuentaId, pedidoId, plan, periodo, u[0].hasta, dias, nota]);
    return rows[0];
  }

  async function enTransaccion(fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const r = await fn(client);
      await client.query('COMMIT');
      return r;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  // Admin confirma el pago: crea la suscripción (30 días mes / 7 semana), re-chequea el cupo Star y avisa por email.
  async function confirmar(id, { por = 'admin' } = {}) {
    const res = await enTransaccion(async (db) => {
      const { rows } = await db.query('SELECT * FROM pedidos WHERE id = $1 FOR UPDATE', [id]);
      const p = rows[0];
      if (!p) throw err(404, 'Pedido no encontrado.');
      if (!['pendiente', 'informado'].includes(p.estado)) throw err(409, `El pedido ya está ${p.estado}.`);
      if (p.plan === 'S') {
        // Serializa las confirmaciones Star (dos admins o dos pestañas a la vez no pasan el cupo).
        await db.query("SELECT pg_advisory_xact_lock(hashtext('sexyrose-cupo-star'))");
        const provincia = (await provinciaDe(p.cuenta_id, db)) || p.provincia_star;
        const cupo = await cupoStar(provincia, { excluir: p.cuenta_id, db });
        if (!provincia || cupo.libres <= 0) throw err(409, `No hay lugar Star libre en ${provincia || 'su provincia'} (cupo ${CUPO_STAR}). Rechazá el pedido o liberá un lugar.`);
      }
      const s = await apilar(db, { cuentaId: p.cuenta_id, plan: p.plan, periodo: p.periodo, dias: DIAS_PERIODO[p.periodo], pedidoId: p.id });
      const { rows: up } = await db.query(
        "UPDATE pedidos SET estado = 'confirmado', confirmado = now(), confirmado_por = $2 WHERE id = $1 RETURNING *", [id, por]);
      return { pedido: up[0], suscripcion: s };
    });
    invalidar();
    const p = res.pedido;
    const hasta = fmtFecha(res.suscripcion.hasta);
    await mail(p.cuenta_id, `Recibimos tu pago: plan ${PLAN_NOMBRE[p.plan]} activo`,
      `Hola:\n\nConfirmamos tu pago (referencia ${p.referencia}). Tu plan ${PLAN_NOMBRE[p.plan]} por ${p.periodo === 'mes' ? '30 días' : '7 días'} `
      + `está activo hasta el ${hasta}.\n\nPodés ver tu plan en ${url}/panel/plan\n\nSexyRose`);
    return { pedido: pedidoJson(res.pedido), suscripcion: suscripcionJson(res.suscripcion) };
  }

  async function rechazar(id, { motivo = '', por = 'admin' } = {}) {
    const m = String(motivo || '').trim().slice(0, 500);
    const { rows } = await pool.query(
      `UPDATE pedidos SET estado = 'rechazado', motivo = $2, confirmado_por = $3
       WHERE id = $1 AND estado IN ('pendiente', 'informado') RETURNING *`, [id, m || null, por]);
    if (!rows[0]) {
      const ex = await pool.query('SELECT estado FROM pedidos WHERE id = $1', [id]);
      if (!ex.rows[0]) throw err(404, 'Pedido no encontrado.');
      throw err(409, `El pedido ya está ${ex.rows[0].estado}.`);
    }
    const p = rows[0];
    await mail(p.cuenta_id, `Tu pago de ${PLAN_NOMBRE[p.plan]} no se pudo confirmar`,
      `Hola:\n\nNo pudimos confirmar el pago con referencia ${p.referencia}.${m ? `\nMotivo: ${m}` : ''}\n\n`
      + `Si ya transferiste, respondé este email con el comprobante. Podés ver tus pedidos en ${url}/panel/plan\n\nSexyRose`);
    return pedidoJson(p);
  }

  // Plan asignado a mano por el admin (regalo, compensación, acuerdo). Se apila igual que un pago.
  async function asignarManual(cuentaId, { plan, dias, nota = null, por = 'admin' } = {}) {
    if (!PLANES_PAGOS.includes(plan)) throw err(400, 'Plan inválido.');
    const d = Number(dias);
    if (!Number.isInteger(d) || d < 1 || d > 366) throw err(400, 'Los días tienen que ser un número entre 1 y 366.');
    const c = await pool.query('SELECT 1 FROM cuentas WHERE id = $1', [cuentaId]);
    if (!c.rows[0]) throw err(404, 'Cuenta no encontrada.');
    const s = await enTransaccion(async (db) => {
      if (plan === 'S') {
        await db.query("SELECT pg_advisory_xact_lock(hashtext('sexyrose-cupo-star'))");
        const provincia = await provinciaDe(cuentaId, db);
        const cupo = await cupoStar(provincia, { excluir: cuentaId, db });
        if (!provincia) throw err(400, 'Para Star la acompañante tiene que tener cargada su provincia.');
        if (cupo.libres <= 0) throw err(409, `No hay lugar Star libre en ${provincia} (cupo ${CUPO_STAR}).`);
      }
      const notaFinal = [String(nota || '').trim().slice(0, 300), `asignado por ${por}`].filter(Boolean).join(' · ');
      return apilar(db, { cuentaId, plan, periodo: 'manual', dias: d, nota: notaFinal });
    });
    invalidar();
    await mail(cuentaId, `Tenés el plan ${PLAN_NOMBRE[plan]} activo`,
      `Hola:\n\nTe activamos el plan ${PLAN_NOMBRE[plan]} hasta el ${fmtFecha(s.hasta)}.\n\nSexyRose`);
    return suscripcionJson(s);
  }

  async function cancelarSuscripcion(id) {
    const { rows } = await pool.query("UPDATE suscripciones SET estado = 'cancelada' WHERE id = $1 AND estado = 'activa' RETURNING *", [id]);
    if (!rows[0]) throw err(404, 'Suscripción activa no encontrada.');
    invalidar();
    return suscripcionJson(rows[0]);
  }

  // Tarea de vencimientos: idempotente; cada aviso se manda una sola vez (avisos_plan).
  async function ejecutarVencimientos() {
    const out = { vencidas: 0, pedidosVencidos: 0, avisosVence3: 0, avisosVencio: 0 };
    // 1) Aviso "vence en 3 días": activas que terminan en <= 3 días y no tienen una renovación del mismo plan apilada.
    const { rows: prox } = await pool.query(
      `SELECT s.* FROM suscripciones s
       WHERE s.estado = 'activa' AND s.desde <= now() AND s.hasta > now() AND s.hasta <= now() + interval '3 days'
         AND NOT EXISTS (SELECT 1 FROM suscripciones r WHERE r.cuenta_id = s.cuenta_id AND r.plan = s.plan AND r.id <> s.id
                         AND r.estado = 'activa' AND r.hasta > s.hasta)
         AND NOT EXISTS (SELECT 1 FROM avisos_plan a WHERE a.suscripcion_id = s.id AND a.tipo = 'vence3')`);
    for (const s of prox) {
      const ins = await pool.query("INSERT INTO avisos_plan (suscripcion_id, tipo) VALUES ($1, 'vence3') ON CONFLICT DO NOTHING", [s.id]);
      if (!ins.rowCount) continue;
      out.avisosVence3++;
      await mail(s.cuenta_id, `Tu plan ${PLAN_NOMBRE[s.plan]} vence el ${fmtFecha(s.hasta)}`,
        `Hola:\n\nTu plan ${PLAN_NOMBRE[s.plan]} vence el ${fmtFecha(s.hasta)}. Para no perder tu lugar, renovalo desde ${url}/panel/plan\n\nSexyRose`);
    }
    // 2) Vencidas.
    const { rows: venc } = await pool.query(
      "UPDATE suscripciones SET estado = 'vencida' WHERE estado = 'activa' AND hasta <= now() RETURNING *");
    out.vencidas = venc.length;
    if (venc.length) invalidar();
    for (const s of venc) {
      const ins = await pool.query("INSERT INTO avisos_plan (suscripcion_id, tipo) VALUES ($1, 'vencio') ON CONFLICT DO NOTHING", [s.id]);
      if (!ins.rowCount) continue;
      // Si hay una renovación del mismo plan que sigue (apilada), no es un vencimiento real: no se avisa.
      const sigue = await pool.query(
        `SELECT 1 FROM suscripciones WHERE cuenta_id = $1 AND plan = $2 AND id <> $3 AND estado = 'activa'
         AND desde <= $4::timestamptz + interval '1 minute' AND hasta > now() LIMIT 1`, [s.cuenta_id, s.plan, s.id, s.hasta]);
      if (sigue.rowCount) continue;
      out.avisosVencio++;
      const ahora = await planEfectivo(s.cuenta_id);
      await mail(s.cuenta_id, `Tu plan ${PLAN_NOMBRE[s.plan]} venció`,
        `Hola:\n\nTu plan ${PLAN_NOMBRE[s.plan]} venció el ${fmtFecha(s.hasta)}. Ahora tu perfil está en ${PLAN_NOMBRE[ahora]}.`
        + `\n\nPodés renovarlo desde ${url}/panel/plan\n\nSexyRose`);
    }
    // 3) Pedidos pendientes (sin informar) de más de 7 días.
    const pv = await pool.query("UPDATE pedidos SET estado = 'vencido' WHERE estado = 'pendiente' AND creado < now() - interval '7 days'");
    out.pedidosVencidos = pv.rowCount;
    return out;
  }

  function iniciarTarea({ intervaloMs = 10 * 60 * 1000, listo = () => true } = {}) {
    detenerTarea();
    const correr = () => {
      if (!listo()) return;
      ejecutarVencimientos().catch((e) => log('planes: tarea de vencimientos falló:', e.code || e.message));
    };
    timer = setInterval(correr, intervaloMs);
    timer.unref?.();
    const t0 = setTimeout(correr, 5000);
    t0.unref?.();
    return timer;
  }
  function detenerTarea() { if (timer) clearInterval(timer); timer = null; }

  return {
    precios, planEfectivo, planesEfectivos, resumenPlan, cupoStar, provinciaDe,
    crearPedido, informar, cancelar, confirmar, rechazar, asignarManual, cancelarSuscripcion,
    ejecutarVencimientos, iniciarTarea, detenerTarea,
    setInvalidarSitio(fn) { invalidarSitio = typeof fn === 'function' ? fn : () => {}; },
    invalidar,
    mail,
  };
}

const fmt = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: 'numeric', month: 'long', year: 'numeric' });
export function fmtFecha(d) { return d ? fmt.format(new Date(d)) : ''; }

export function textoAHtml(text) {
  const esc = String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  return `<div style="font:15px/1.5 system-ui,sans-serif;color:#222">${esc.replace(/(https:\/\/[^\s<]+)/g, '<a href="$1">$1</a>').replace(/\n/g, '<br>')}</div>`;
}
