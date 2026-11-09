// Puente hacia la instancia de lib/planes.js (createPlanes) que arma server.js. Sin instancia, todas las cuentas
// tienen el plan E (Bronce, gratis).
//
// Límites por plan (valores del MVP, HH.LEVELS): fotos de la galería e historias por día (null = ilimitadas).
export const LIMITES = {
  S: { fotos: 1000, historiasDia: null },
  A: { fotos: 500, historiasDia: null },
  B: { fotos: 50, historiasDia: null },
  C: { fotos: 30, historiasDia: null },
  D: { fotos: 15, historiasDia: 3 },
  E: { fotos: 8, historiasDia: 1 },
};
export const PLANES = ['S', 'A', 'B', 'C', 'D', 'E'];
export const limitesDe = (plan) => LIMITES[plan] || LIMITES.E;

// El servidor crea UNA instancia de lib/planes.js (createPlanes) y la pasa en ctx.planes.
// Sin instancia (p. ej. un router de pruebas aislado) todas las cuentas quedan en E (Bronce).

export async function planEfectivo(cuentaId, planes) {
  if (planes && typeof planes.planEfectivo === 'function') {
    const p = await planes.planEfectivo(cuentaId);
    return PLANES.includes(p) ? p : 'E';
  }
  return 'E';
}

// Map cuentaId → código de plan.
export async function planesEfectivos(ids, planes) {
  const out = new Map(ids.map((id) => [id, 'E']));
  if (!ids.length || !planes || typeof planes.planesEfectivos !== 'function') return out;
  const r = await planes.planesEfectivos(ids);
  const entries = r instanceof Map ? [...r.entries()] : Object.entries(r || {});
  for (const [id, p] of entries) if (out.has(id) && PLANES.includes(p)) out.set(id, p);
  return out;
}

export async function resumenPlan(cuentaId, planes) {
  if (planes && typeof planes.resumenPlan === 'function') return planes.resumenPlan(cuentaId);
  return { efectivo: await planEfectivo(cuentaId, planes), suscripciones: [], pedidos: [] };
}
