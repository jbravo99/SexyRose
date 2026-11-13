// Planes (Planes v2, 11/11/2026): 4 planes pagados con créditos, renovación automática, subidas, Destacado y cupo Star.
//
// Códigos: E Bronce (gratis: nunca es una suscripción), D Plata, C Oro, S Star. Platino (B) y Diamante (A) ya no
// existen (db/050-planes-v2.sql frena el arranque si quedaba alguno activo).
// Plan efectivo = el de mayor rango entre las suscripciones activas con desde <= ahora < hasta; sin ninguna, E.
//
// Plan mensual ("cadena base"): suscripciones activas por 'mes' o 'manual'. Sobre ella se apilan las semanas
// (solo Oro y Star) para subir 7 días a un plan superior; al terminar la semana vuelve sola al plan mensual.
//
// Todo se paga con créditos (lib/creditos.js). Los pedidos por transferencia (tabla pedidos) quedan solo como
// historial: ya no se crean nuevos, pero los abiertos se pueden seguir confirmando o rechazando desde el admin.
//
// Uso:
//   const creditos = createCreditos({ pool, log, sendMail, siteUrl });
//   const planes = createPlanes({ pool, sendMail, log, siteUrl, creditos });
//   planes.setInvalidarSitio(fn) → se llama después de cada cambio que mueve un plan efectivo o un Destacado.
import crypto from 'node:crypto';
import { createCreditos, aCentavos, fmtCreditos, montoJson, textoAHtml } from './creditos.js';

export { textoAHtml };
export const PLAN_CODIGOS = ['E', 'D', 'C', 'S'];
export const PLANES_PAGOS = ['D', 'C', 'S'];
export const PLANES_SEMANA = ['C', 'S'];
export const PLANES_DESTACADO = ['E', 'D', 'C'];
export const PLAN_NOMBRE = { S: 'Star', C: 'Oro', D: 'Plata', E: 'Bronce' };
export const RANGO = { E: 1, D: 2, C: 3, S: 4 };
export const PRECIOS_DEFAULT = Object.freeze({
  mes: Object.freeze({ E: 0, D: 35, C: 90, S: 350 }),
  semana: Object.freeze({ C: 27, S: 105 }),
});
export const DESTACADO_DEFAULT = Object.freeze({
  E: Object.freeze({ dia: 1, semana: 5 }),
  D: Object.freeze({ dia: 2, semana: 9 }),
  C: Object.freeze({ dia: 4, semana: 20 }),
});
export const CUPO_STAR = 10;
export const CUPO_DESTACADO_PCT = 20;
export const DIAS_PERIODO = { mes: 30, semana: 7 };
export const MAX_RESERVA_DIAS = 60;
const DAY = 24 * 60 * 60 * 1000;
const VENTANA_RENOVACION_MIN = 15;   // se cobra la renovación hasta 15 min antes de que termine el ciclo
// Sin 0/O, 1/I/L (pedidos viejos por transferencia).
const REF_ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export class PlanError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.expose = true; Object.assign(this, extra); }
}
const err = (status, msg, extra) => new PlanError(status, msg, extra);

const rangoSql = "array_position(ARRAY['E','D','C','S'], plan) DESC NULLS LAST";
const rango = (p) => RANGO[p] || 0;

export function nuevaReferencia() {
  const b = crypto.randomBytes(4);
  let s = '';
  for (let i = 0; i < 4; i++) s += REF_ALFABETO[b[i] % REF_ALFABETO.length];
  return 'SR-' + s;
}

const num = (v) => (v === null || v === undefined ? null : Number(v));
const esObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

// Semana calculada sola (Juan, 13/11/2026): semana = mes / 4 × (1 + recargo %), con 2 decimales. Se prende desde
// Admin → Ajustes. Sin precios guardados, prendida con 20 % (da los mismos valores de PRECIOS_DEFAULT); con precios
// guardados de antes (sin semanaAuto), apagada: quedan las semanas que Juan escribió a mano.
export const SEMANA_AUTO_DEFAULT = Object.freeze({ activo: true, recargo: 20 });
export const semanaDeMes = (mes, recargo) => Math.round((Number(mes) / 4) * (1 + Number(recargo) / 100) * 100) / 100;
function aplicarSemanaAuto(out) {
  if (!out.semanaAuto.activo) return out;
  for (const k of PLANES_SEMANA) out.semana[k] = semanaDeMes(out.mes[k], out.semanaAuto.recargo);
  return out;
}
const leerSemanaAuto = (v) => {
  if (!esObj(v)) return null;
  const r = Number(v.recargo);
  return { activo: v.activo === true, recargo: Number.isFinite(r) && r >= 0 && r <= 200 ? Math.round(r * 100) / 100 : SEMANA_AUTO_DEFAULT.recargo };
};

// Precios guardados (ajustes.precios) sobre los de defecto. Lo inválido (o B/A viejos) se ignora.
export function mezclarPrecios(valor) {
  const out = { mes: { ...PRECIOS_DEFAULT.mes }, semana: { ...PRECIOS_DEFAULT.semana } };
  out.semanaAuto = esObj(valor) ? (leerSemanaAuto(valor.semanaAuto) || { activo: false, recargo: SEMANA_AUTO_DEFAULT.recargo }) : { ...SEMANA_AUTO_DEFAULT };
  if (esObj(valor)) {
    for (const p of ['mes', 'semana']) {
      const src = valor[p];
      if (!esObj(src)) continue;
      for (const k of Object.keys(out[p])) {
        const n = Number(src[k]);
        if (src[k] !== undefined && src[k] !== null && Number.isFinite(n) && n >= 0) out[p][k] = Math.round(n * 100) / 100;
      }
    }
  }
  out.mes.E = 0;
  return aplicarSemanaAuto(out);
}

// Valida un PUT de precios del admin. Devuelve { valor } o { error }.
export function validarPrecios(v) {
  if (!esObj(v)) return { error: 'Formato de precios inválido.' };
  const out = { mes: {}, semana: {} };
  let auto = { activo: false, recargo: SEMANA_AUTO_DEFAULT.recargo };
  if (v.semanaAuto !== undefined) {
    const sa = v.semanaAuto; const r = Number(esObj(sa) ? sa.recargo : NaN);
    if (!esObj(sa) || typeof sa.activo !== 'boolean') return { error: 'Formato inválido de la semana calculada: {activo, recargo}.' };
    if (sa.activo && !(Number.isFinite(r) && r >= 0 && r <= 200)) return { error: 'El recargo de la semana tiene que estar entre 0 y 200 %.' };
    auto = { activo: sa.activo, recargo: Number.isFinite(r) && r >= 0 && r <= 200 ? Math.round(r * 100) / 100 : SEMANA_AUTO_DEFAULT.recargo };
  }
  // Con la semana calculada, lo que venga en "semana" no importa: se calcula del mes
  if (auto.activo && esObj(v.mes)) v = { ...v, semana: Object.fromEntries(PLANES_SEMANA.map((k) => [k, semanaDeMes(v.mes[k], auto.recargo)])) };
  for (const [p, claves] of [['mes', PLAN_CODIGOS], ['semana', PLANES_SEMANA]]) {
    const src = v[p];
    if (!esObj(src)) return { error: `Faltan los precios por ${p}.` };
    for (const k of Object.keys(src)) if (!claves.includes(k)) return { error: `Plan desconocido en precios por ${p}: ${k}.` };
    for (const k of claves) {
      const n = Number(src[k]);
      if (src[k] === undefined || src[k] === null || src[k] === '' || !Number.isFinite(n) || n < 0 || n > 100000) {
        return { error: `Precio inválido: ${PLAN_NOMBRE[k]} por ${p}.` };
      }
      out[p][k] = Math.round(n * 100) / 100;
    }
  }
  if (out.mes.E !== 0) return { error: 'Bronce es gratis: su precio tiene que ser 0.' };
  if (!(out.mes.D > 0 && out.mes.D < out.mes.C && out.mes.C < out.mes.S)) return { error: 'Los precios por mes tienen que subir con el plan: Plata < Oro < Star (y Plata mayor a 0).' };
  if (!(out.semana.C > 0 && out.semana.S > 0)) return { error: 'Las semanas de Oro y Star tienen que costar más de 0.' };
  out.semanaAuto = auto;
  return { valor: out };
}

export function mezclarDestacado(valor) {
  const out = {};
  for (const p of PLANES_DESTACADO) {
    out[p] = { ...DESTACADO_DEFAULT[p] };
    const src = esObj(valor) ? valor[p] : null;
    if (!esObj(src)) continue;
    for (const k of ['dia', 'semana']) {
      const n = Number(src[k]);
      if (src[k] !== undefined && src[k] !== null && Number.isFinite(n) && n >= 0) out[p][k] = Math.round(n * 100) / 100;
    }
  }
  return out;
}

export function validarDestacado(v) {
  if (!esObj(v)) return { error: 'Formato inválido: {E: {dia, semana}, D: {…}, C: {…}}.' };
  for (const k of Object.keys(v)) if (!PLANES_DESTACADO.includes(k)) return { error: `El Destacado es solo para Bronce, Plata y Oro (no ${k}).` };
  const out = {};
  for (const p of PLANES_DESTACADO) {
    const src = v[p];
    if (!esObj(src)) return { error: `Faltan los precios de Destacado de ${PLAN_NOMBRE[p]}.` };
    out[p] = {};
    for (const k of ['dia', 'semana']) {
      const n = Number(src[k]);
      if (src[k] === undefined || src[k] === null || src[k] === '' || !Number.isFinite(n) || n <= 0 || n > 10000) {
        return { error: `Precio de Destacado inválido: ${PLAN_NOMBRE[p]} por ${k === 'dia' ? 'día' : '7 días'}.` };
      }
      out[p][k] = Math.round(n * 100) / 100;
    }
  }
  return { valor: out };
}

const pedidoJson = (r) => ({
  id: r.id, cuentaId: r.cuenta_id, plan: r.plan, planNombre: PLAN_NOMBRE[r.plan] || r.plan, periodo: r.periodo,
  montoUsd: num(r.monto_usd), estado: r.estado, referencia: r.referencia, nota: r.nota, motivo: r.motivo,
  tieneComprobante: Boolean(r.comprobante_ruta), provinciaStar: r.provincia_star,
  creado: r.creado, informado: r.informado, confirmado: r.confirmado,
});
const suscripcionJson = (r, ahora = Date.now()) => ({
  id: r.id, cuentaId: r.cuenta_id, pedidoId: r.pedido_id, plan: r.plan, planNombre: PLAN_NOMBRE[r.plan] || r.plan, periodo: r.periodo,
  desde: r.desde, hasta: r.hasta, estado: r.estado, nota: r.nota, creado: r.creado,
  vigente: r.estado === 'activa' && new Date(r.desde).getTime() <= ahora && new Date(r.hasta).getTime() > ahora,
  renovacionAuto: Boolean(r.renovacion_auto), cambioProgramado: r.cambio_programado || null, origen: r.origen || 'pedido',
  costo: r.centavos === null || r.centavos === undefined ? null : montoJson(r.centavos),
});
const destacadoJson = (r, ahora = Date.now()) => ({
  id: r.id, cuentaId: r.cuenta_id, plan: r.plan, planNombre: PLAN_NOMBRE[r.plan] || r.plan, provincia: r.provincia, dias: r.dias,
  desde: r.desde, hasta: r.hasta, estado: r.estado, costo: montoJson(r.centavos), creado: r.creado,
  vigente: ['activo', 'programado'].includes(r.estado) && new Date(r.desde).getTime() <= ahora && new Date(r.hasta).getTime() > ahora,
});
export { pedidoJson, suscripcionJson, destacadoJson };

// Máximo de destacados simultáneos dentro de [a, b). items: [{desde, hasta}] (Date o string).
export function maxSolape(items, a, b) {
  const ms = (x) => new Date(x).getTime();
  const A = ms(a); const B = ms(b);
  const its = items.map((i) => [ms(i.desde), ms(i.hasta)]).filter(([d, h]) => h > A && d < B);
  const puntos = [A, ...its.map(([d]) => d).filter((d) => d > A && d < B)];
  let max = 0;
  for (const t of puntos) max = Math.max(max, its.filter(([d, h]) => d <= t && h > t).length);
  return max;
}
// Primer momento ≥ desde en el que entra un Destacado de `dur` ms sin pasar el cupo.
export function proximaLibre(items, cupo, desde, dur) {
  const A = new Date(desde).getTime();
  const cands = [A, ...items.map((i) => new Date(i.hasta).getTime()).filter((h) => h > A)].sort((x, y) => x - y);
  for (const t of cands) if (maxSolape(items, t, t + dur) < cupo) return new Date(t);
  return new Date(cands[cands.length - 1]);
}

export function createPlanes({ pool, sendMail = null, log = () => {}, siteUrl = 'https://sexyrose.net', creditos = null } = {}) {
  let invalidarSitio = () => {};
  let timer = null;
  const url = String(siteUrl || 'https://sexyrose.net').replace(/\/+$/, '');
  const cred = creditos || createCreditos({ pool, log, sendMail, siteUrl });

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
  const notificar = (cuentaId, tipo, texto, db) => cred.notificar(cuentaId, tipo, texto, db).catch((e) => log('planes: notificación falló:', e.message));
  const invalidar = () => { try { invalidarSitio(); } catch { /* */ } };
  const lockCuenta = (db, cuentaId) => db.query("SELECT pg_advisory_xact_lock(hashtext('sr-plan:' || $1::text))", [cuentaId]);

  async function precios(db = pool) {
    const { rows } = await db.query("SELECT valor FROM ajustes WHERE clave = 'precios'");
    return mezclarPrecios(rows[0] && rows[0].valor);
  }
  async function preciosDestacado(db = pool) {
    const { rows } = await db.query("SELECT valor FROM ajustes WHERE clave = 'destacado'");
    return mezclarDestacado(rows[0] && rows[0].valor);
  }

  async function planEfectivo(cuentaId, db = pool) {
    const { rows } = await db.query(
      `SELECT plan FROM suscripciones WHERE cuenta_id = $1 AND estado = 'activa' AND desde <= now() AND hasta > now()
       ORDER BY ${rangoSql} LIMIT 1`, [cuentaId]);
    return rows[0] && RANGO[rows[0].plan] ? rows[0].plan : 'E';
  }

  async function planesEfectivos(ids, db = pool) {
    const out = new Map();
    const lista = [...new Set((ids || []).filter(Boolean))];
    for (const id of lista) out.set(id, 'E');
    if (!lista.length) return out;
    const { rows } = await db.query(
      `SELECT DISTINCT ON (cuenta_id) cuenta_id, plan FROM suscripciones
       WHERE cuenta_id = ANY($1::uuid[]) AND estado = 'activa' AND desde <= now() AND hasta > now()
       ORDER BY cuenta_id, ${rangoSql}`, [lista]);
    for (const r of rows) if (RANGO[r.plan]) out.set(r.cuenta_id, r.plan);
    return out;
  }

  // Cadena base: plan mensual (o asignado a mano) vigente; si no hay vigente pero hay uno futuro, ese.
  async function cadenaBase(cuentaId, db = pool) {
    const { rows } = await db.query(
      `SELECT * FROM suscripciones WHERE cuenta_id = $1 AND estado = 'activa' AND periodo IN ('mes', 'manual') AND hasta > now()
       ORDER BY hasta DESC`, [cuentaId]);
    const filas = rows.filter((r) => RANGO[r.plan]);
    if (!filas.length) return null;
    const ahora = Date.now();
    const vig = filas.filter((r) => new Date(r.desde).getTime() <= ahora);
    const plan = (vig.length ? vig : filas).reduce((a, r) => (rango(r.plan) > rango(a) ? r.plan : a), 'E');
    const delPlan = filas.filter((r) => r.plan === plan);
    return { plan, hasta: delPlan[0].hasta, ultima: delPlan[0], filas: delPlan };
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
  // Dentro de una transacción: serializa las altas de Star y verifica el cupo de su provincia.
  async function chequearCupoStar(db, cuentaId) {
    await db.query("SELECT pg_advisory_xact_lock(hashtext('sexyrose-cupo-star'))");
    const provincia = await provinciaDe(cuentaId, db);
    if (!provincia) throw err(400, 'Para Star tenés que tener cargada tu provincia en el perfil.');
    const cupo = await cupoStar(provincia, { excluir: cuentaId, db });
    if (cupo.libres <= 0) throw err(409, `No quedan lugares Star en tu provincia: el cupo es de ${CUPO_STAR}.`, { codigo: 'cupo_star' });
    return provincia;
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

  // ---------- Perfil pausado por falta de saldo ----------
  async function reanudarPerfil(db, cuentaId) {
    const r = await db.query(
      `UPDATE perfiles SET estado = 'publicado', pausado_por = NULL, actualizado = now()
       WHERE cuenta_id = $1 AND estado = 'pausado' AND pausado_por = 'sin_saldo'`, [cuentaId]);
    return r.rowCount > 0;
  }

  // ---------- Comprar con créditos ----------
  // Qué pasaría si compra `plan` por `periodo` ahora. No toca nada.
  async function planificar(db, cuentaId, plan, periodo, pr) {
    if (plan === 'E') throw err(400, 'Bronce es gratis: no hace falta pagarlo.');
    if (!PLANES_PAGOS.includes(plan)) throw err(400, 'Elegí un plan válido: Plata, Oro o Star.');
    if (!['mes', 'semana'].includes(periodo)) throw err(400, 'Elegí si pagás por mes o por semana.');
    if (periodo === 'semana' && !PLANES_SEMANA.includes(plan)) throw err(400, `${PLAN_NOMBRE[plan]} no se puede pagar por semana: solo Oro y Star.`);
    const base = await cadenaBase(cuentaId, db);
    const planBase = base ? base.plan : 'E';
    const ahora = new Date();
    const nombre = PLAN_NOMBRE[plan];
    if (periodo === 'mes') {
      const precio = aCentavos(pr.mes[plan]);
      if (!base) {
        return { tipo: 'nuevo', plan, periodo, planAnterior: 'E', centavos: precio, desde: ahora, hasta: new Date(+ahora + 30 * DAY),
          movTipo: 'renovacion_plan', motivo: `Plan ${nombre} · 30 días`, base };
      }
      if (plan === planBase) {
        const desde = new Date(base.hasta);
        return { tipo: 'renovacion_anticipada', plan, periodo, planAnterior: planBase, centavos: precio, desde, hasta: new Date(+desde + 30 * DAY),
          movTipo: 'renovacion_plan', motivo: `Plan ${nombre} · 30 días más (desde el ${fmtFecha(desde)})`, base };
      }
      if (rango(plan) > rango(planBase)) {
        const ms = Math.max(0, new Date(base.hasta).getTime() - ahora.getTime());
        const dias = ms / DAY;
        const dif = aCentavos(pr.mes[plan]) - aCentavos(pr.mes[planBase]);
        const costo = Math.max(0, Math.ceil((dif * dias) / 30));
        return { tipo: 'subida', plan, periodo, planAnterior: planBase, centavos: costo, desde: ahora, hasta: new Date(base.hasta),
          diasRestantes: Math.ceil(dias), movTipo: 'renovacion_plan',
          motivo: `Subida de ${PLAN_NOMBRE[planBase]} a ${nombre}: ${Math.ceil(dias)} días (se paga la diferencia)`, base };
      }
      throw err(409, `Tenés ${PLAN_NOMBRE[planBase]} hasta el ${fmtFecha(base.hasta)}. Para pasar a ${nombre}, programá el cambio: se aplica cuando termine tu ciclo.`,
        { codigo: 'usar_cambio_programado' });
    }
    if (rango(plan) <= rango(planBase)) {
      throw err(409, `Ya tenés ${PLAN_NOMBRE[planBase]} por mes: la semana sirve para subir 7 días a un plan superior.`, { codigo: 'semana_no_sube' });
    }
    const { rows: u } = await db.query(
      "SELECT max(hasta) AS hasta FROM suscripciones WHERE cuenta_id = $1 AND plan = $2 AND estado = 'activa' AND hasta > now()", [cuentaId, plan]);
    const desde = u[0].hasta ? new Date(Math.max(new Date(u[0].hasta).getTime(), +ahora)) : ahora;
    const tipo = planBase === 'E' ? 'semana' : 'subida_temporal';
    return { tipo, plan, periodo, planAnterior: planBase, centavos: aCentavos(pr.semana[plan]), desde, hasta: new Date(+desde + 7 * DAY),
      movTipo: tipo, motivo: planBase === 'E' ? `Semana de ${nombre} (7 días)` : `Subida temporal a ${nombre} (7 días)`, base };
  }

  const cotizacionJson = (p, saldoC) => ({
    tipo: p.tipo, plan: p.plan, planNombre: PLAN_NOMBRE[p.plan], periodo: p.periodo, planAnterior: p.planAnterior,
    costo: montoJson(p.centavos), desde: p.desde, hasta: p.hasta, diasRestantes: p.diasRestantes ?? null, detalle: p.motivo,
    saldo: montoJson(saldoC), alcanza: saldoC >= p.centavos, faltan: montoJson(Math.max(0, p.centavos - saldoC)),
  });

  async function cotizar(cuentaId, { plan, periodo } = {}) {
    const pr = await precios();
    const p = await planificar(pool, cuentaId, plan, periodo, pr);
    if (plan === 'S') {
      const provincia = await provinciaDe(cuentaId);
      if (!provincia) throw err(400, 'Para Star tenés que tener cargada tu provincia en el perfil.');
      const cupo = await cupoStar(provincia, { excluir: cuentaId });
      if (cupo.libres <= 0) throw err(409, `No quedan lugares Star en tu provincia: el cupo es de ${CUPO_STAR}.`, { codigo: 'cupo_star' });
    }
    return cotizacionJson(p, await cred.saldo(cuentaId));
  }

  // Devuelve (en créditos) lo que queda de los Destacados de otro plan: el Destacado está atado al plan con el que se
  // compró, así que al subir de plan para siempre se cancela y se devuelve la parte no usada.
  async function devolverDestacados(db, cuentaId, planNuevo, motivo) {
    const { rows } = await db.query(
      `SELECT * FROM destacados WHERE cuenta_id = $1 AND plan <> $2 AND estado IN ('activo', 'programado') AND hasta > now() FOR UPDATE`,
      [cuentaId, planNuevo]);
    let total = 0;
    for (const d of rows) {
      const ahora = Date.now();
      const ini = new Date(d.desde).getTime(); const fin = new Date(d.hasta).getTime();
      const dev = ini >= ahora ? Number(d.centavos) : Math.floor((Number(d.centavos) * (fin - ahora)) / (fin - ini));
      await db.query("UPDATE destacados SET estado = 'cancelado' WHERE id = $1", [d.id]);
      if (dev > 0) {
        await cred.mover(db, { cuentaId, tipo: 'destacado', centavos: dev, refTipo: 'destacado', refId: d.id, motivo: `Devolución: Destacado de ${PLAN_NOMBRE[d.plan]} (${motivo})`, por: 'sistema' });
        total += dev;
      }
    }
    return total;
  }

  async function comprar(cuentaId, { plan, periodo } = {}) {
    const c = await pool.query('SELECT estado FROM cuentas WHERE id = $1', [cuentaId]);
    if (!c.rows[0]) throw err(404, 'Cuenta no encontrada.');
    if (c.rows[0].estado !== 'activa') throw err(403, 'Tu cuenta no está activa.');
    const pr = await precios();
    const res = await cred.enTransaccion(async (db) => {
      await lockCuenta(db, cuentaId);
      const p = await planificar(db, cuentaId, plan, periodo, pr);
      if (plan === 'S') await chequearCupoStar(db, cuentaId);
      const ult = p.base ? p.base.ultima : null;
      let renov = false; let cambio = null;
      if (periodo === 'mes') {
        renov = !ult || ult.origen !== 'creditos' ? true : Boolean(ult.renovacion_auto);
        if (p.tipo === 'renovacion_anticipada' && ult) cambio = ult.cambio_programado || null;
      }
      if (p.tipo === 'subida') {
        await db.query(
          "UPDATE suscripciones SET estado = 'cancelada', nota = concat_ws(' · ', nota, $2::text) WHERE id = ANY($1::uuid[])",
          [p.base.filas.map((f) => f.id), `pasó a ${PLAN_NOMBRE[plan]} el ${fmtFecha(new Date())}`]);
      }
      const { rows } = await db.query(
        `INSERT INTO suscripciones (cuenta_id, plan, periodo, desde, hasta, renovacion_auto, cambio_programado, centavos, origen, nota)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'creditos', $9) RETURNING *`,
        [cuentaId, plan, periodo, p.desde, p.hasta, renov, cambio, p.centavos, p.motivo]);
      const sus = rows[0];
      let mov = null;
      if (p.centavos > 0) {
        mov = await cred.mover(db, { cuentaId, tipo: p.movTipo, centavos: -p.centavos, refTipo: 'suscripcion', refId: sus.id, motivo: p.motivo, por: 'acompanante' });
      }
      let reanudado = false; let devuelto = 0;
      if (periodo === 'mes') {
        await db.query('DELETE FROM renovaciones_pendientes WHERE cuenta_id = $1', [cuentaId]);
        reanudado = await reanudarPerfil(db, cuentaId);
      }
      if (p.tipo === 'subida') devuelto = await devolverDestacados(db, cuentaId, plan, `pasaste a ${PLAN_NOMBRE[plan]}`);
      return { p, sus, mov, reanudado, devuelto };
    });
    invalidar();
    const { p, sus } = res;
    const texto = {
      nuevo: `Activaste ${PLAN_NOMBRE[plan]} hasta el ${fmtFecha(sus.hasta)}.`,
      renovacion_anticipada: `Sumaste 30 días de ${PLAN_NOMBRE[plan]}: ahora llega hasta el ${fmtFecha(sus.hasta)}.`,
      subida: `Pasaste a ${PLAN_NOMBRE[plan]} hasta el ${fmtFecha(sus.hasta)}.`,
      semana: `Activaste una semana de ${PLAN_NOMBRE[plan]}: del ${fmtFecha(sus.desde)} al ${fmtFecha(sus.hasta)}.`,
      subida_temporal: `Subiste a ${PLAN_NOMBRE[plan]} por 7 días: del ${fmtFecha(sus.desde)} al ${fmtFecha(sus.hasta)}.`,
    }[p.tipo];
    await notificar(cuentaId, 'plan_comprado', `${texto} Se descontaron ${fmtCreditos(p.centavos)} créditos.`
      + (res.devuelto ? ` Te devolvimos ${fmtCreditos(res.devuelto)} créditos del Destacado de tu plan anterior.` : ''));
    return {
      tipo: p.tipo, suscripcion: suscripcionJson(sus), costo: montoJson(p.centavos), movimiento: res.mov,
      saldo: montoJson(await cred.saldo(cuentaId)), plan: await planEfectivo(cuentaId), reanudado: res.reanudado,
      devueltoDestacado: montoJson(res.devuelto),
    };
  }

  // ---------- Renovación automática y cambio programado ----------
  async function setRenovacion(cuentaId, activa) {
    if (typeof activa !== 'boolean') throw err(400, 'Indicá si la renovación automática queda activa (true o false).');
    let reanudado = false;
    const base = await cadenaBase(cuentaId);
    if (!base) {
      const pend = await pool.query('SELECT plan FROM renovaciones_pendientes WHERE cuenta_id = $1', [cuentaId]);
      if (!pend.rows[0]) throw err(409, 'No tenés un plan mensual activo.');
      if (!activa) {
        // Pausada por falta de saldo y elige no renovar: vuelve a verse con Bronce.
        await cred.enTransaccion(async (db) => {
          await db.query('DELETE FROM renovaciones_pendientes WHERE cuenta_id = $1', [cuentaId]);
          reanudado = await reanudarPerfil(db, cuentaId);
        });
        invalidar();
      }
      return { renovacionAuto: activa, base: null, reanudado };
    }
    await pool.query('UPDATE suscripciones SET renovacion_auto = $2 WHERE id = $1', [base.ultima.id, activa]);
    return { renovacionAuto: activa, base: await baseJson(cuentaId), reanudado };
  }

  async function setCambio(cuentaId, plan) {
    const base = await cadenaBase(cuentaId);
    if (!base) throw err(409, 'No tenés un plan mensual activo.');
    let valor = plan === null || plan === undefined || plan === '' ? null : String(plan);
    if (valor !== null) {
      if (!PLAN_CODIGOS.includes(valor)) throw err(400, 'Plan inválido.');
      if (valor === base.plan) valor = null;
      else if (rango(valor) > rango(base.plan)) throw err(409, `Para subir a ${PLAN_NOMBRE[valor]} no hace falta esperar: comprá la subida y pagás solo la diferencia.`, { codigo: 'usar_subida' });
    }
    await pool.query('UPDATE suscripciones SET cambio_programado = $2 WHERE id = $1', [base.ultima.id, valor]);
    return { cambioProgramado: valor, base: await baseJson(cuentaId) };
  }

  async function baseJson(cuentaId, pr = null) {
    const base = await cadenaBase(cuentaId);
    if (!base) return null;
    const u = base.ultima;
    const precs = pr || await precios();
    const proximo = u.cambio_programado || base.plan;
    const renueva = Boolean(u.renovacion_auto) && proximo !== 'E';
    const costo = renueva ? aCentavos(precs.mes[proximo]) : 0;
    const saldoC = await cred.saldo(cuentaId);
    return {
      plan: base.plan, planNombre: PLAN_NOMBRE[base.plan], hasta: base.hasta, suscripcionId: u.id,
      renovacionAuto: Boolean(u.renovacion_auto), cambioProgramado: u.cambio_programado || null,
      proximaRenovacion: renueva ? { fecha: base.hasta, plan: proximo, planNombre: PLAN_NOMBRE[proximo], costo: montoJson(costo), alcanza: saldoC >= costo, faltan: montoJson(Math.max(0, costo - saldoC)) } : null,
    };
  }

  // Cobra la renovación de la última suscripción de la cadena base. Devuelve 'renovada' | 'esperando' | 'pausada'.
  async function renovarSuscripcion(s, pr) {
    const planNuevo = s.cambio_programado || s.plan;
    if (planNuevo === 'E' || !RANGO[planNuevo]) return 'no_renueva';
    const costo = aCentavos(pr.mes[planNuevo]);
    let sus;
    try {
      sus = await cred.enTransaccion(async (db) => {
        await lockCuenta(db, s.cuenta_id);
        const { rows: cur } = await db.query(
          `SELECT s.* FROM suscripciones s WHERE s.id = $1 AND s.estado = 'activa' AND s.renovacion_auto
             AND NOT EXISTS (SELECT 1 FROM suscripciones r WHERE r.cuenta_id = s.cuenta_id AND r.id <> s.id AND r.estado = 'activa'
                             AND r.periodo IN ('mes', 'manual') AND r.hasta > s.hasta)`, [s.id]);
        if (!cur[0]) return null; // ya se renovó o la desactivó
        const desde = new Date(Math.max(new Date(cur[0].hasta).getTime(), Date.now() - DAY));
        const { rows } = await db.query(
          `INSERT INTO suscripciones (cuenta_id, plan, periodo, desde, hasta, renovacion_auto, centavos, origen, nota)
           VALUES ($1, $2, 'mes', $3, $3::timestamptz + interval '30 days', true, $4, 'creditos', $5) RETURNING *`,
          [s.cuenta_id, planNuevo, desde, costo, `Renovación automática${s.cambio_programado ? ` (cambio de ${PLAN_NOMBRE[s.plan]})` : ''}`]);
        if (costo > 0) {
          await cred.mover(db, { cuentaId: s.cuenta_id, tipo: 'renovacion_plan', centavos: -costo, refTipo: 'suscripcion', refId: rows[0].id,
            motivo: `Renovación automática: ${PLAN_NOMBRE[planNuevo]} · 30 días`, por: 'sistema' });
        }
        return rows[0];
      });
    } catch (e) {
      if (e.codigo !== 'saldo_insuficiente') throw e;
      if (new Date(s.hasta).getTime() > Date.now()) return 'esperando';
      await pausarSinSaldo(s, planNuevo, costo);
      return 'pausada';
    }
    if (!sus) return 'nada';
    invalidar();
    const saldoC = await cred.saldo(s.cuenta_id);
    const txt = `Renovamos tu plan ${PLAN_NOMBRE[planNuevo]} hasta el ${fmtFecha(sus.hasta)}. Se descontaron ${fmtCreditos(costo)} créditos; te quedan ${fmtCreditos(saldoC)}.`;
    await notificar(s.cuenta_id, 'plan_renovado', txt);
    await mail(s.cuenta_id, `Renovamos tu plan ${PLAN_NOMBRE[planNuevo]}`,
      `Hola:\n\n${txt}\n\nPodés ver tu plan y desactivar la renovación automática en ${url}/panel/plan\n\nSexyRose`);
    return 'renovada';
  }

  async function pausarSinSaldo(s, planNuevo, costo) {
    let pausado = false;
    await cred.enTransaccion(async (db) => {
      await db.query(
        `INSERT INTO renovaciones_pendientes (cuenta_id, plan) VALUES ($1, $2)
         ON CONFLICT (cuenta_id) DO UPDATE SET plan = EXCLUDED.plan, creado = now()`, [s.cuenta_id, planNuevo]);
      const r = await db.query(
        "UPDATE perfiles SET estado = 'pausado', pausado_por = 'sin_saldo', actualizado = now() WHERE cuenta_id = $1 AND estado = 'publicado'",
        [s.cuenta_id]);
      pausado = r.rowCount > 0;
    });
    invalidar();
    const ins = await pool.query("INSERT INTO avisos_plan (suscripcion_id, tipo) VALUES ($1, 'pausa') ON CONFLICT DO NOTHING", [s.id]);
    if (!ins.rowCount) return;
    const saldoC = await cred.saldo(s.cuenta_id);
    const txt = `No pudimos renovar tu plan ${PLAN_NOMBRE[planNuevo]}: cuesta ${fmtCreditos(costo)} créditos y tenés ${fmtCreditos(saldoC)}.`
      + (pausado ? ' Tu perfil quedó pausado y vuelve a verse solo apenas cargues créditos.' : ' Se renueva solo apenas cargues créditos.');
    await notificar(s.cuenta_id, 'perfil_pausado', txt);
    await mail(s.cuenta_id, pausado ? 'Tu perfil quedó pausado: no alcanzaron los créditos' : `No pudimos renovar tu plan ${PLAN_NOMBRE[planNuevo]}`,
      `Hola:\n\n${txt}\n\nCargá créditos desde ${url}/panel/creditos. Si preferís seguir gratis con Bronce, desactivá la renovación automática en ${url}/panel/plan y tu perfil vuelve a verse.\n\nSexyRose`);
  }

  // Se llama cuando entran créditos (pedido confirmado o ajuste positivo): si tenía una renovación pendiente, se cobra
  // y el perfil se reanuda solo.
  async function reintentarRenovacion(cuentaId) {
    const { rows } = await pool.query('SELECT plan FROM renovaciones_pendientes WHERE cuenta_id = $1', [cuentaId]);
    if (!rows[0]) return null;
    const plan = rows[0].plan;
    const costo = aCentavos((await precios()).mes[plan]);
    let res;
    try {
      res = await cred.enTransaccion(async (db) => {
        await lockCuenta(db, cuentaId);
        const pend = await db.query('SELECT plan FROM renovaciones_pendientes WHERE cuenta_id = $1 FOR UPDATE', [cuentaId]);
        if (!pend.rows[0]) return null;
        if (plan === 'S') await chequearCupoStar(db, cuentaId);
        const { rows: s } = await db.query(
          `INSERT INTO suscripciones (cuenta_id, plan, periodo, desde, hasta, renovacion_auto, centavos, origen, nota)
           VALUES ($1, $2, 'mes', now(), now() + interval '30 days', true, $3, 'creditos', 'Renovación al cargar créditos') RETURNING *`,
          [cuentaId, plan, costo]);
        if (costo > 0) {
          await cred.mover(db, { cuentaId, tipo: 'renovacion_plan', centavos: -costo, refTipo: 'suscripcion', refId: s[0].id,
            motivo: `Renovación: ${PLAN_NOMBRE[plan]} · 30 días`, por: 'sistema' });
        }
        await db.query('DELETE FROM renovaciones_pendientes WHERE cuenta_id = $1', [cuentaId]);
        const reanudado = await reanudarPerfil(db, cuentaId);
        return { sus: s[0], reanudado };
      });
    } catch (e) {
      if (e.codigo === 'saldo_insuficiente') {
        await notificar(cuentaId, 'renovacion_pendiente', `Todavía faltan ${e.faltan.creditos} créditos para renovar ${PLAN_NOMBRE[plan]} (${fmtCreditos(costo)}).`);
        return 'faltan';
      }
      if (e.codigo === 'cupo_star') {
        await notificar(cuentaId, 'renovacion_pendiente', 'No quedan lugares Star libres en tu provincia. Elegí otro plan desde tu panel para que tu perfil vuelva a verse.');
        return 'sin_cupo';
      }
      throw e;
    }
    if (!res) return null;
    invalidar();
    const txt = `Renovamos tu plan ${PLAN_NOMBRE[plan]} hasta el ${fmtFecha(res.sus.hasta)} (${fmtCreditos(costo)} créditos).`
      + (res.reanudado ? ' Tu perfil ya se ve de nuevo en el sitio.' : '');
    await notificar(cuentaId, 'plan_renovado', txt);
    await mail(cuentaId, res.reanudado ? 'Tu perfil volvió a publicarse' : `Renovamos tu plan ${PLAN_NOMBRE[plan]}`, `Hola:\n\n${txt}\n\nSexyRose`);
    return 'renovada';
  }
  cred.setAlAcreditar(reintentarRenovacion);

  // ---------- Destacado ----------
  // Perfiles visibles de ese plan en la provincia → cupo = 20 % redondeado hacia arriba, mínimo 1.
  async function cupoDestacado(plan, provincia, db = pool) {
    const { rows } = await db.query(
      `SELECT p.cuenta_id FROM perfiles p JOIN cuentas c ON c.id = p.cuenta_id
       WHERE p.estado = 'publicado' AND p.verificacion = 'verificada' AND NOT p.oculto AND c.estado = 'activa'
         AND lower(btrim(p.datos->>'provincia')) = lower(btrim($1))`, [provincia]);
    const efect = await planesEfectivos(rows.map((r) => r.cuenta_id), db);
    const activos = [...efect.values()].filter((p) => p === plan).length;
    return { activos, cupo: Math.max(1, Math.ceil((activos * CUPO_DESTACADO_PCT) / 100)) };
  }
  async function destacadosZona(plan, provincia, db = pool) {
    const { rows } = await db.query(
      `SELECT * FROM destacados WHERE plan = $1 AND lower(btrim(provincia)) = lower(btrim($2))
         AND estado IN ('activo', 'programado') AND hasta > now() ORDER BY desde`, [plan, provincia]);
    return rows;
  }

  async function comprarDestacado(cuentaId, { dias, desde = null } = {}) {
    const d = Number(dias);
    if (d !== 1 && d !== 7) throw err(400, 'El Destacado es por 1 día o por 7 días.');
    const { rows: pf } = await pool.query("SELECT estado, NULLIF(btrim(datos->>'provincia'), '') AS provincia FROM perfiles WHERE cuenta_id = $1", [cuentaId]);
    if (!pf[0] || pf[0].estado !== 'publicado') throw err(409, 'Tu perfil tiene que estar publicado para destacarlo.');
    const provincia = pf[0].provincia;
    if (!provincia) throw err(400, 'Cargá tu provincia en el perfil.');
    let pedido = null;
    if (desde !== null && desde !== undefined && desde !== '') {
      pedido = new Date(desde);
      if (Number.isNaN(pedido.getTime())) throw err(400, 'Fecha de inicio inválida.');
      if (pedido.getTime() < Date.now() - 10 * 60 * 1000) throw err(400, 'La fecha de inicio tiene que ser de ahora en adelante.');
      if (pedido.getTime() > Date.now() + MAX_RESERVA_DIAS * DAY) throw err(400, `Se puede reservar hasta ${MAX_RESERVA_DIAS} días antes.`);
      if (pedido.getTime() < Date.now()) pedido = new Date();
    }
    const prD = await preciosDestacado();
    const res = await cred.enTransaccion(async (db) => {
      await lockCuenta(db, cuentaId);
      const plan = await planEfectivo(cuentaId, db);
      if (plan === 'S') throw err(409, 'Con Star ya aparecés arriba de todo: el Destacado es para Bronce, Plata y Oro.');
      await db.query("SELECT pg_advisory_xact_lock(hashtext('sr-destacado:' || $1 || ':' || lower(btrim($2))))", [plan, provincia]);
      const precio = aCentavos(prD[plan][d === 1 ? 'dia' : 'semana']);
      const mios = (await db.query(
        "SELECT desde, hasta FROM destacados WHERE cuenta_id = $1 AND plan = $2 AND estado IN ('activo', 'programado') AND hasta > now() ORDER BY hasta DESC",
        [cuentaId, plan])).rows;
      let ini;
      if (pedido) {
        ini = pedido;
        if (maxSolape(mios, ini, new Date(+ini + d * DAY)) > 0) throw err(409, 'Ya tenés un Destacado en esas fechas.');
      } else {
        // Sin fecha: si ya tiene uno, el nuevo empieza cuando termina (se encadena).
        ini = mios[0] ? new Date(Math.max(new Date(mios[0].hasta).getTime(), Date.now())) : new Date();
      }
      const fin = new Date(+ini + d * DAY);
      const { cupo, activos } = await cupoDestacado(plan, provincia, db);
      const zona = await destacadosZona(plan, provincia, db);
      if (maxSolape(zona, ini, fin) >= cupo) {
        const prox = proximaLibre(zona, cupo, ini, d * DAY);
        throw err(409, `El Destacado de ${PLAN_NOMBRE[plan]} en tu provincia está completo (${cupo} ${cupo === 1 ? 'lugar' : 'lugares'}). `
          + `La próxima fecha libre es el ${fmtFechaHora(prox)}: podés reservarla.`, { codigo: 'cupo_lleno', proximaFechaLibre: prox.toISOString(), cupo, activos });
      }
      const { rows } = await db.query(
        `INSERT INTO destacados (cuenta_id, plan, provincia, dias, desde, hasta, centavos, estado)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [cuentaId, plan, provincia, d, ini, fin, precio, ini.getTime() <= Date.now() + 1000 ? 'activo' : 'programado']);
      if (precio > 0) {
        await cred.mover(db, { cuentaId, tipo: 'destacado', centavos: -precio, refTipo: 'destacado', refId: rows[0].id,
          motivo: `Destacado ${d === 1 ? '1 día' : '7 días'} (${PLAN_NOMBRE[plan]}) desde el ${fmtFechaHora(ini)}`, por: 'acompanante' });
      }
      return rows[0];
    });
    invalidar();
    await notificar(cuentaId, 'destacado', res.estado === 'activo'
      ? `Tu perfil está Destacado hasta el ${fmtFechaHora(res.hasta)}.`
      : `Reservaste Destacado del ${fmtFechaHora(res.desde)} al ${fmtFechaHora(res.hasta)}.`);
    return { destacado: destacadoJson(res), saldo: montoJson(await cred.saldo(cuentaId)) };
  }

  async function infoDestacado(cuentaId) {
    const [plan, prD, pf, mios] = await Promise.all([
      planEfectivo(cuentaId), preciosDestacado(),
      pool.query("SELECT estado, NULLIF(btrim(datos->>'provincia'), '') AS provincia FROM perfiles WHERE cuenta_id = $1", [cuentaId]),
      pool.query("SELECT * FROM destacados WHERE cuenta_id = $1 AND (estado IN ('activo', 'programado') OR hasta > now() - interval '30 days') ORDER BY desde DESC LIMIT 20", [cuentaId]),
    ]);
    const provincia = pf.rows[0] ? pf.rows[0].provincia : null;
    let motivo = null;
    if (plan === 'S') motivo = 'Con Star ya aparecés arriba de todo.';
    else if (!pf.rows[0] || pf.rows[0].estado !== 'publicado') motivo = 'Tu perfil tiene que estar publicado.';
    else if (!provincia) motivo = 'Cargá tu provincia en el perfil.';
    const ahora = Date.now();
    const out = {
      plan, planNombre: PLAN_NOMBRE[plan], provincia, disponible: !motivo, motivo,
      precios: Object.fromEntries(PLANES_DESTACADO.map((p) => [p, { dia: montoJson(aCentavos(prD[p].dia)), semana: montoJson(aCentavos(prD[p].semana)) }])),
      precio: plan === 'S' ? null : { dia: montoJson(aCentavos(prD[plan].dia)), semana: montoJson(aCentavos(prD[plan].semana)) },
      cupo: null, proximaFechaLibre: null,
      mios: mios.rows.map((r) => destacadoJson(r, ahora)),
      saldo: montoJson(await cred.saldo(cuentaId)),
    };
    if (plan !== 'S' && provincia) {
      const [{ cupo, activos }, zona] = await Promise.all([cupoDestacado(plan, provincia), destacadosZona(plan, provincia)]);
      const ahoraD = new Date();
      out.cupo = { cupo, activos, ocupadosAhora: maxSolape(zona, ahoraD, new Date(+ahoraD + 1000)), porcentaje: CUPO_DESTACADO_PCT };
      out.proximaFechaLibre = {
        dia: proximaLibre(zona, cupo, ahoraD, DAY).toISOString(),
        semana: proximaLibre(zona, cupo, ahoraD, 7 * DAY).toISOString(),
      };
    }
    return out;
  }

  // Para el listado público: Map cuentaId → { plan, provincia, hasta } de los destacados vigentes ahora.
  async function destacadosVigentes(ids) {
    const out = new Map();
    const lista = [...new Set((ids || []).filter(Boolean))];
    if (!lista.length) return out;
    const { rows } = await pool.query(
      `SELECT cuenta_id, plan, provincia, max(hasta) AS hasta FROM destacados
       WHERE cuenta_id = ANY($1::uuid[]) AND estado IN ('activo', 'programado') AND desde <= now() AND hasta > now()
       GROUP BY cuenta_id, plan, provincia`, [lista]);
    for (const r of rows) {
      if (!out.has(r.cuenta_id)) out.set(r.cuenta_id, []);
      out.get(r.cuenta_id).push({ plan: r.plan, provincia: r.provincia, hasta: r.hasta });
    }
    return out;
  }

  async function destacadosAdmin({ estado = 'vigentes' } = {}) {
    const cond = estado === 'todos' ? 'TRUE' : "d.estado IN ('activo', 'programado') AND d.hasta > now()";
    const { rows } = await pool.query(
      `SELECT d.*, c.email, p.slug, p.datos->>'displayName' AS display_name FROM destacados d
       JOIN cuentas c ON c.id = d.cuenta_id LEFT JOIN perfiles p ON p.cuenta_id = d.cuenta_id
       WHERE ${cond} ORDER BY d.desde DESC LIMIT 500`);
    const ahora = Date.now();
    const grupos = new Map();
    for (const r of rows) {
      if (!['activo', 'programado'].includes(r.estado) || new Date(r.hasta).getTime() <= ahora) continue;
      const k = r.plan + '|' + String(r.provincia).trim().toLowerCase();
      if (!grupos.has(k)) grupos.set(k, { plan: r.plan, planNombre: PLAN_NOMBRE[r.plan], provincia: r.provincia });
    }
    const zonas = [];
    for (const g of grupos.values()) {
      const [{ cupo, activos }, zona] = await Promise.all([cupoDestacado(g.plan, g.provincia), destacadosZona(g.plan, g.provincia)]);
      zonas.push({ ...g, cupo, activos, ocupadosAhora: maxSolape(zona, new Date(), new Date(Date.now() + 1000)), reservas: zona.length });
    }
    return {
      items: rows.map((r) => ({ ...destacadoJson(r, ahora), cuenta: { email: r.email, slug: r.slug, displayName: r.display_name || '' } })),
      zonas, porcentaje: CUPO_DESTACADO_PCT,
    };
  }

  async function cancelarDestacado(id, { devolver = false, por = 'admin' } = {}) {
    const res = await cred.enTransaccion(async (db) => {
      const { rows } = await db.query('SELECT * FROM destacados WHERE id = $1 FOR UPDATE', [id]);
      const d = rows[0];
      if (!d) throw err(404, 'Destacado no encontrado.');
      if (!['activo', 'programado'].includes(d.estado) || new Date(d.hasta).getTime() <= Date.now()) throw err(409, 'Ese Destacado ya terminó.');
      await db.query("UPDATE destacados SET estado = 'cancelado' WHERE id = $1", [id]);
      let dev = 0;
      if (devolver) {
        const ahora = Date.now(); const ini = new Date(d.desde).getTime(); const fin = new Date(d.hasta).getTime();
        dev = ini >= ahora ? Number(d.centavos) : Math.floor((Number(d.centavos) * (fin - ahora)) / (fin - ini));
        if (dev > 0) await cred.mover(db, { cuentaId: d.cuenta_id, tipo: 'destacado', centavos: dev, refTipo: 'destacado', refId: d.id, motivo: 'Devolución: Destacado cancelado por el admin', por });
      }
      return { d, dev };
    });
    invalidar();
    await notificar(res.d.cuenta_id, 'destacado', `Cancelamos tu Destacado.${res.dev ? ` Te devolvimos ${fmtCreditos(res.dev)} créditos.` : ''}`);
    return { destacado: destacadoJson({ ...res.d, estado: 'cancelado' }), devuelto: montoJson(res.dev) };
  }

  // ---------- Pedidos viejos por transferencia (historial) ----------
  async function crearPedido() {
    throw err(410, 'Los planes ahora se pagan con créditos: cargá créditos desde tu panel y pagá el plan desde ahí.');
  }

  async function pedidoDe(cuentaId, id) {
    const { rows } = await pool.query('SELECT * FROM pedidos WHERE id = $1 AND cuenta_id = $2', [id, cuentaId]);
    if (!rows[0]) throw err(404, 'Pedido no encontrado.');
    return rows[0];
  }

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
  async function apilar(db, { cuentaId, plan, periodo, dias, pedidoId = null, nota = null, origen = 'pedido' }) {
    const { rows: u } = await db.query(
      "SELECT max(hasta) AS hasta FROM suscripciones WHERE cuenta_id = $1 AND plan = $2 AND estado = 'activa' AND hasta > now()",
      [cuentaId, plan]);
    const { rows } = await db.query(
      `INSERT INTO suscripciones (cuenta_id, pedido_id, plan, periodo, desde, hasta, nota, origen)
       VALUES ($1, $2, $3, $4, GREATEST(now(), COALESCE($5::timestamptz, now())),
               GREATEST(now(), COALESCE($5::timestamptz, now())) + make_interval(days => $6::int), $7, $8)
       RETURNING *`,
      [cuentaId, pedidoId, plan, periodo, u[0].hasta, dias, nota, origen]);
    return rows[0];
  }

  const enTransaccion = (fn) => cred.enTransaccion(fn);

  // Admin confirma un pedido viejo por transferencia (los abiertos antes de Planes v2).
  async function confirmar(id, { por = 'admin' } = {}) {
    const res = await enTransaccion(async (db) => {
      const { rows } = await db.query('SELECT * FROM pedidos WHERE id = $1 FOR UPDATE', [id]);
      const p = rows[0];
      if (!p) throw err(404, 'Pedido no encontrado.');
      if (!['pendiente', 'informado'].includes(p.estado)) throw err(409, `El pedido ya está ${p.estado}.`);
      if (!PLANES_PAGOS.includes(p.plan) || (p.periodo === 'semana' && !PLANES_SEMANA.includes(p.plan))) {
        throw err(409, 'Este pedido es de un plan que ya no existe: rechazalo y que compre con créditos.');
      }
      if (p.plan === 'S') {
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
    await mail(p.cuenta_id, `Recibimos tu pago: plan ${PLAN_NOMBRE[p.plan]} activo`,
      `Hola:\n\nConfirmamos tu pago (referencia ${p.referencia}). Tu plan ${PLAN_NOMBRE[p.plan]} por ${p.periodo === 'mes' ? '30 días' : '7 días'} `
      + `está activo hasta el ${fmtFecha(res.suscripcion.hasta)}.\n\nDesde ahora los planes se pagan con créditos: podés activar la renovación automática en ${url}/panel/plan\n\nSexyRose`);
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
    await mail(p.cuenta_id, `Tu pago de ${PLAN_NOMBRE[p.plan] || 'plan'} no se pudo confirmar`,
      `Hola:\n\nNo pudimos confirmar el pago con referencia ${p.referencia}.${m ? `\nMotivo: ${m}` : ''}\n\n`
      + `Ahora los planes se pagan con créditos: cargalos desde ${url}/panel/creditos\n\nSexyRose`);
    return pedidoJson(p);
  }

  // Plan asignado a mano por el admin (regalo, compensación, acuerdo). Se apila igual que un pago; no se renueva solo.
  async function asignarManual(cuentaId, { plan, dias, nota = null, por = 'admin' } = {}) {
    if (!PLANES_PAGOS.includes(plan)) throw err(400, 'Plan inválido: Plata (D), Oro (C) o Star (S).');
    const d = Number(dias);
    if (!Number.isInteger(d) || d < 1 || d > 366) throw err(400, 'Los días tienen que ser un número entre 1 y 366.');
    const c = await pool.query('SELECT 1 FROM cuentas WHERE id = $1', [cuentaId]);
    if (!c.rows[0]) throw err(404, 'Cuenta no encontrada.');
    const s = await enTransaccion(async (db) => {
      await lockCuenta(db, cuentaId);
      if (plan === 'S') {
        await db.query("SELECT pg_advisory_xact_lock(hashtext('sexyrose-cupo-star'))");
        const provincia = await provinciaDe(cuentaId, db);
        const cupo = await cupoStar(provincia, { excluir: cuentaId, db });
        if (!provincia) throw err(400, 'Para Star la acompañante tiene que tener cargada su provincia.');
        if (cupo.libres <= 0) throw err(409, `No hay lugar Star libre en ${provincia} (cupo ${CUPO_STAR}).`);
      }
      const notaFinal = [String(nota || '').trim().slice(0, 300), `asignado por ${por}`].filter(Boolean).join(' · ');
      const sus = await apilar(db, { cuentaId, plan, periodo: 'manual', dias: d, nota: notaFinal, origen: 'manual' });
      await db.query('DELETE FROM renovaciones_pendientes WHERE cuenta_id = $1', [cuentaId]);
      await reanudarPerfil(db, cuentaId);
      return sus;
    });
    invalidar();
    await notificar(cuentaId, 'plan_asignado', `Te activamos el plan ${PLAN_NOMBRE[plan]} hasta el ${fmtFecha(s.hasta)}.`);
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

  // ---------- Tarea periódica: renovaciones, avisos, vencimientos, pedidos y destacados ----------
  // Idempotente; cada aviso se manda una sola vez (avisos_plan).
  async function ejecutarVencimientos() {
    const out = {
      renovadas: 0, pausadas: 0, avisosSaldo7: 0, avisosSaldo2: 0, avisosVence3: 0, vencidas: 0, avisosVencio: 0,
      pedidosVencidos: 0, pedidosCreditosVencidos: 0, destacadosActivados: 0, destacadosVencidos: 0,
    };
    const pr = await precios();
    const ultimaDeCadena = `NOT EXISTS (SELECT 1 FROM suscripciones r WHERE r.cuenta_id = s.cuenta_id AND r.id <> s.id AND r.estado = 'activa'
                             AND r.periodo IN ('mes', 'manual') AND r.hasta > s.hasta)`;
    const renueva = "s.periodo IN ('mes', 'manual') AND s.renovacion_auto AND COALESCE(s.cambio_programado, '') <> 'E'";

    // 1) Renovaciones automáticas que vencen en los próximos minutos (o ya vencieron y siguen activas).
    const { rows: aRenovar } = await pool.query(
      `SELECT s.* FROM suscripciones s WHERE s.estado = 'activa' AND ${renueva}
         AND s.hasta <= now() + make_interval(mins => $1) AND ${ultimaDeCadena} ORDER BY s.hasta`, [VENTANA_RENOVACION_MIN]);
    for (const s of aRenovar) {
      try {
        const r = await renovarSuscripcion(s, pr);
        if (r === 'renovada') out.renovadas++;
        if (r === 'pausada') out.pausadas++;
      } catch (e) {
        log('planes: renovación falló:', s.id, e.code || e.message);
      }
    }

    // 2) Avisos de saldo insuficiente 7 y 2 días antes de la renovación.
    const { rows: proxRen } = await pool.query(
      `SELECT s.* FROM suscripciones s WHERE s.estado = 'activa' AND ${renueva}
         AND s.hasta > now() AND s.hasta <= now() + interval '7 days' AND ${ultimaDeCadena}`);
    for (const s of proxRen) {
      const planNuevo = s.cambio_programado || s.plan;
      if (!RANGO[planNuevo]) continue;
      const costo = aCentavos(pr.mes[planNuevo]);
      const saldoC = await cred.saldo(s.cuenta_id);
      if (saldoC >= costo) continue;
      const tipo = new Date(s.hasta).getTime() <= Date.now() + 2 * DAY ? 'saldo2' : 'saldo7';
      const ins = await pool.query('INSERT INTO avisos_plan (suscripcion_id, tipo) VALUES ($1, $2) ON CONFLICT DO NOTHING', [s.id, tipo]);
      if (!ins.rowCount) continue;
      if (tipo === 'saldo2') out.avisosSaldo2++; else out.avisosSaldo7++;
      const faltan = fmtCreditos(costo - saldoC);
      const txt = `Tu plan ${PLAN_NOMBRE[planNuevo]} se renueva el ${fmtFecha(s.hasta)} y cuesta ${fmtCreditos(costo)} créditos: te faltan ${faltan}.`;
      await notificar(s.cuenta_id, 'saldo_insuficiente', `${txt} Si no cargás, tu perfil se pausa.`);
      await mail(s.cuenta_id, `Te faltan ${faltan} créditos para renovar tu plan ${PLAN_NOMBRE[planNuevo]}`,
        `Hola:\n\n${txt}\n\nSi no alcanzan los créditos el día de la renovación, tu perfil se pausa hasta que cargues. `
        + `Cargá créditos desde ${url}/panel/creditos\n\nSexyRose`);
    }

    // 3) Aviso "vence en 3 días" para lo que NO se renueva solo.
    const { rows: prox } = await pool.query(
      `SELECT s.* FROM suscripciones s
       WHERE s.estado = 'activa' AND s.desde <= now() AND s.hasta > now() AND s.hasta <= now() + interval '3 days'
         AND NOT (${renueva})
         AND NOT EXISTS (SELECT 1 FROM suscripciones r WHERE r.cuenta_id = s.cuenta_id AND r.plan = s.plan AND r.id <> s.id
                         AND r.estado = 'activa' AND r.hasta > s.hasta)
         AND NOT EXISTS (SELECT 1 FROM avisos_plan a WHERE a.suscripcion_id = s.id AND a.tipo = 'vence3')`);
    for (const s of prox) {
      const ins = await pool.query("INSERT INTO avisos_plan (suscripcion_id, tipo) VALUES ($1, 'vence3') ON CONFLICT DO NOTHING", [s.id]);
      if (!ins.rowCount) continue;
      out.avisosVence3++;
      const que = s.periodo === 'semana' ? `Tu semana de ${PLAN_NOMBRE[s.plan] || s.plan}` : `Tu plan ${PLAN_NOMBRE[s.plan] || s.plan}`;
      await notificar(s.cuenta_id, 'plan_vence', `${que} termina el ${fmtFecha(s.hasta)}.`);
      await mail(s.cuenta_id, `${que} vence el ${fmtFecha(s.hasta)}`,
        `Hola:\n\n${que} vence el ${fmtFecha(s.hasta)}. Para no perder tu lugar, renovalo con créditos desde ${url}/panel/plan `
        + '(o activá la renovación automática).\n\nSexyRose');
    }

    // 4) Vencidas.
    const { rows: venc } = await pool.query(
      "UPDATE suscripciones SET estado = 'vencida' WHERE estado = 'activa' AND hasta <= now() RETURNING *");
    out.vencidas = venc.length;
    if (venc.length) invalidar();
    for (const s of venc) {
      const ins = await pool.query("INSERT INTO avisos_plan (suscripcion_id, tipo) VALUES ($1, 'vencio') ON CONFLICT DO NOTHING", [s.id]);
      if (!ins.rowCount) continue;
      // Si sigue otra suscripción (renovación, cambio programado o apilada), no es un vencimiento real: no se avisa.
      const sigue = await pool.query(
        `SELECT 1 FROM suscripciones WHERE cuenta_id = $1 AND id <> $3 AND estado = 'activa' AND hasta > now()
           AND ((plan = $2 AND desde <= $4::timestamptz + interval '1 minute')
             OR ($5 IN ('mes', 'manual') AND periodo IN ('mes', 'manual')
                 AND desde BETWEEN $4::timestamptz - interval '1 minute' AND $4::timestamptz + interval '1 minute')) LIMIT 1`,
        [s.cuenta_id, s.plan, s.id, s.hasta, s.periodo]);
      if (sigue.rowCount) continue;
      const pend = await pool.query('SELECT 1 FROM renovaciones_pendientes WHERE cuenta_id = $1', [s.cuenta_id]);
      if (pend.rowCount) continue; // ya se avisó la pausa
      out.avisosVencio++;
      const ahora = await planEfectivo(s.cuenta_id);
      const que = s.periodo === 'semana' ? `Tu semana de ${PLAN_NOMBRE[s.plan] || s.plan}` : `Tu plan ${PLAN_NOMBRE[s.plan] || s.plan}`;
      await notificar(s.cuenta_id, 'plan_vencio', `${que} terminó. Ahora tu perfil está en ${PLAN_NOMBRE[ahora]}.`);
      await mail(s.cuenta_id, `${que} venció`,
        `Hola:\n\n${que} venció el ${fmtFecha(s.hasta)}. Ahora tu perfil está en ${PLAN_NOMBRE[ahora]}.`
        + `\n\nPodés renovarlo con créditos desde ${url}/panel/plan\n\nSexyRose`);
    }

    // 5) Pedidos viejos pendientes (sin informar) de más de 7 días y pedidos de créditos sin pagar de más de 48 h.
    const pv = await pool.query("UPDATE pedidos SET estado = 'vencido' WHERE estado = 'pendiente' AND creado < now() - interval '7 days'");
    out.pedidosVencidos = pv.rowCount;
    out.pedidosCreditosVencidos = await cred.vencerPedidos();

    // 6) Destacados: programados que empiezan y los que terminan.
    const da = await pool.query("UPDATE destacados SET estado = 'activo' WHERE estado = 'programado' AND desde <= now() AND hasta > now()");
    const dv = await pool.query("UPDATE destacados SET estado = 'vencido' WHERE estado IN ('activo', 'programado') AND hasta <= now()");
    out.destacadosActivados = da.rowCount;
    out.destacadosVencidos = dv.rowCount;
    if (da.rowCount || dv.rowCount) invalidar();
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

  // ---------- Admin: listados ----------
  async function vencenPronto({ dias = 7 } = {}) {
    const d = Math.min(60, Math.max(1, Number(dias) || 7));
    const pr = await precios();
    const { rows } = await pool.query(
      `SELECT s.*, c.email, p.slug, p.datos->>'displayName' AS display_name, COALESCE(cc.centavos, 0) AS saldo
       FROM suscripciones s JOIN cuentas c ON c.id = s.cuenta_id LEFT JOIN perfiles p ON p.cuenta_id = s.cuenta_id
       LEFT JOIN creditos_cuentas cc ON cc.cuenta_id = s.cuenta_id
       WHERE s.estado = 'activa' AND s.hasta > now() AND s.hasta <= now() + make_interval(days => $1)
         AND NOT EXISTS (SELECT 1 FROM suscripciones r WHERE r.cuenta_id = s.cuenta_id AND r.id <> s.id AND r.estado = 'activa'
                         AND r.hasta > s.hasta AND (r.plan = s.plan OR (s.periodo IN ('mes', 'manual') AND r.periodo IN ('mes', 'manual'))))
       ORDER BY s.hasta`, [d]);
    return rows.map((r) => {
      const proximo = r.cambio_programado || r.plan;
      const renueva = ['mes', 'manual'].includes(r.periodo) && r.renovacion_auto && proximo !== 'E' && RANGO[proximo];
      const costo = renueva ? aCentavos(pr.mes[proximo]) : null;
      return {
        ...suscripcionJson(r), cuenta: { email: r.email, slug: r.slug, displayName: r.display_name || '' },
        saldo: montoJson(r.saldo), renueva: Boolean(renueva), costoRenovacion: costo === null ? null : montoJson(costo),
        alcanza: costo === null ? null : Number(r.saldo) >= costo,
      };
    });
  }

  async function pausadasSinSaldo() {
    const pr = await precios();
    const { rows } = await pool.query(
      `SELECT rp.cuenta_id, rp.plan, rp.creado, c.email, p.slug, p.estado, p.pausado_por, p.datos->>'displayName' AS display_name,
              COALESCE(cc.centavos, 0) AS saldo
       FROM renovaciones_pendientes rp JOIN cuentas c ON c.id = rp.cuenta_id LEFT JOIN perfiles p ON p.cuenta_id = rp.cuenta_id
       LEFT JOIN creditos_cuentas cc ON cc.cuenta_id = rp.cuenta_id ORDER BY rp.creado`);
    return rows.map((r) => ({
      cuentaId: r.cuenta_id, plan: r.plan, planNombre: PLAN_NOMBRE[r.plan], desde: r.creado,
      perfilEstado: r.estado, pausado: r.estado === 'pausado' && r.pausado_por === 'sin_saldo',
      cuenta: { email: r.email, slug: r.slug, displayName: r.display_name || '' },
      saldo: montoJson(r.saldo), costo: montoJson(aCentavos(pr.mes[r.plan])),
      faltan: montoJson(Math.max(0, aCentavos(pr.mes[r.plan]) - Number(r.saldo))),
    }));
  }

  return {
    precios, preciosDestacado, planEfectivo, planesEfectivos, resumenPlan, cupoStar, provinciaDe, cadenaBase, baseJson,
    cotizar, comprar, setRenovacion, setCambio, reintentarRenovacion,
    comprarDestacado, infoDestacado, destacadosVigentes, destacadosAdmin, cancelarDestacado, cupoDestacado,
    crearPedido, informar, cancelar, confirmar, rechazar, asignarManual, cancelarSuscripcion,
    ejecutarVencimientos, iniciarTarea, detenerTarea, vencenPronto, pausadasSinSaldo,
    setInvalidarSitio(fn) { invalidarSitio = typeof fn === 'function' ? fn : () => {}; },
    invalidar,
    mail,
    creditos: cred,
  };
}

const fmt = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: 'numeric', month: 'long', year: 'numeric' });
const fmtH = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: false });
export function fmtFecha(d) { return d ? fmt.format(new Date(d)) : ''; }
export function fmtFechaHora(d) { return d ? `${fmtH.format(new Date(d))} h` : ''; }
