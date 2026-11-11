// Puente hacia la instancia de lib/planes.js (createPlanes) que arma server.js. Sin instancia, todas las cuentas
// tienen el plan E (Bronce, gratis).
//
// Límites por plan (Planes v2, 11/11/2026; null = ilimitado):
//   fotos y videos de la galería, historias por día y destacadas (historias destacadas que quedan fijas en el perfil).
export const LIMITES = {
  S: { fotos: 1000, videos: 500, historiasDia: null, destacadas: null },
  C: { fotos: 500, videos: 200, historiasDia: null, destacadas: 10 },
  D: { fotos: 30, videos: 10, historiasDia: 3, destacadas: 4 },
  E: { fotos: 8, videos: 2, historiasDia: 1, destacadas: 1 },
};
export const PLANES = ['S', 'C', 'D', 'E'];
// Clip de 5 s en la tarjeta: desde Plata.
export const PLANES_PREVIEW = new Set(['D', 'C', 'S']);
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

// Destacados vigentes (Map cuentaId → { hasta }) para el listado público. Sin instancia: ninguno.
export async function destacadosVigentes(ids, planes) {
  if (planes && typeof planes.destacadosVigentes === 'function') return planes.destacadosVigentes(ids);
  return new Map();
}
