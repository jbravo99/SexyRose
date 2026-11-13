// Catálogos (ubicaciones, categorías, intereses) y ajustes, con caché corta en memoria.
// El admin llama invalidarCatalogos() después de editarlos.
import { norm, slugify, sinPrefijo } from './georef.js';

let cache = null;
let cacheAt = 0;
const TTL = 60 * 1000;

export function invalidarCatalogos() { cache = null; }

/* Slug de la dirección pública de cada lugar (/argentina/<slug>). Siempre fue slugify(nombre); con Georef hay
   muchos nombres repetidos (Santa Rosa, San José…), así que si dos lugares dan el mismo slug, se lo queda el que
   tiene ese mismo id (el cargado primero / a mano) y los demás usan su id, que es único (santa-rosa-mendoza).
   Así no cambia ninguna dirección que ya existía. → Map(id → slug) */
export function slugsPublicos(rows) {
  const grupos = new Map();
  for (const r of rows) { const s = slugify(r.nombre); if (!grupos.has(s)) grupos.set(s, []); grupos.get(s).push(r); }
  const out = new Map(); const usados = new Set();
  for (const [s, g] of grupos) {
    if (g.length === 1) { out.set(g[0].id, s); usados.add(s); continue; }
    const dueno = g.find((r) => r.id === s) || g.find((r) => r.fuente !== 'georef') || g.slice().sort((a, b) => (a.id < b.id ? -1 : 1))[0];
    out.set(dueno.id, s); usados.add(s);
  }
  for (const r of rows) {
    if (out.has(r.id)) continue;
    let s = r.id; let n = 2;
    while (usados.has(s) || grupos.has(s)) s = `${r.id}-${n++}`;
    out.set(r.id, s); usados.add(s);
  }
  return out;
}

/* Índice para buscar localidades dentro de una provincia (panel de la acompañante): por cada lugar activo de tipo
   ciudad o barrio, su provincia, el nombre sin acentos y el camino que se muestra ("Oberá, Misiones"). */
export function indiceUbicaciones(rows) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const prov = (r) => { let cur = r; let g = 0; while (cur && g++ < 10) { if (cur.tipo === 'provincia') return cur; cur = cur.padre ? byId.get(cur.padre) : null; } return null; };
  const activo = (r) => { let cur = r; let g = 0; while (cur && g++ < 10) { if (!cur.activa) return false; cur = cur.padre ? byId.get(cur.padre) : null; } return true; };
  const lugares = [];
  for (const r of rows) {
    if ((r.tipo !== 'ciudad' && r.tipo !== 'barrio') || !activo(r)) continue;
    const p = prov(r); if (!p) continue;
    const camino = [];
    let cur = r.padre ? byId.get(r.padre) : null; let g = 0;
    while (cur && cur.tipo !== 'pais' && g++ < 10) { camino.push(cur.tipo === 'provincia' ? sinPrefijo(cur.nombre) : cur.nombre); cur = cur.padre ? byId.get(cur.padre) : null; }
    lugares.push({ id: r.id, nombre: r.nombre, tipo: r.tipo, provincia: p.id, departamento: r.departamento || null, n: norm(r.nombre), camino: [r.nombre, ...camino].join(', ') });
  }
  return lugares;
}

/* Búsqueda: sin acentos ni mayúsculas; primero los que empiezan con lo escrito, después los que tienen una palabra
   que empieza así, después los que lo contienen; a igualdad, el nombre más corto y en orden alfabético. */
export function buscarUbicaciones(indice, provinciaId, q, max = 10) {
  const k = norm(q);
  if (!k) return [];
  const res = [];
  for (const l of indice) {
    if (provinciaId && l.provincia !== provinciaId) continue;
    let rango = -1;
    if (l.n.startsWith(k)) rango = 0;
    else if (l.n.includes(' ' + k)) rango = 1;
    else if (l.n.includes(k)) rango = 2;
    if (rango >= 0) res.push([rango, l]);
  }
  res.sort((a, b) => a[0] - b[0] || a[1].n.length - b[1].n.length || (a[1].n < b[1].n ? -1 : a[1].n > b[1].n ? 1 : 0));
  const top = res.slice(0, max).map((x) => x[1]);
  // Mismo nombre dos veces en la lista: se agrega el departamento para distinguirlos
  const veces = new Map(); top.forEach((l) => veces.set(l.n, (veces.get(l.n) || 0) + 1));
  return top.map((l) => ({ id: l.id, nombre: l.nombre, tipo: l.tipo, camino: l.camino, ...(veces.get(l.n) > 1 && l.departamento ? { detalle: l.departamento } : {}) }));
}

export async function cargarCatalogos(pool) {
  if (cache && Date.now() - cacheAt < TTL) return cache;
  const [u, c, i, a] = await Promise.all([
    pool.query('SELECT id, nombre, tipo, padre, lat, lng, activa, orden, fuente, georef_id, departamento FROM ubicaciones ORDER BY orden, nombre'),
    pool.query('SELECT id, nombre, icono, orden, activa FROM categorias ORDER BY orden, nombre'),
    pool.query('SELECT id, nombre, nombre_en, nombre_pt, orden FROM intereses ORDER BY orden, nombre'),
    pool.query('SELECT clave, valor FROM ajustes'),
  ]);
  let indice = null;
  cache = {
    ubicaciones: u.rows,
    ubic: new Map(u.rows.map((r) => [r.id, r])),
    slugs: slugsPublicos(u.rows),
    get indiceUbic() { if (!indice) indice = indiceUbicaciones(u.rows); return indice; },
    categoriasLista: c.rows,
    categorias: new Set(c.rows.filter((r) => r.activa).map((r) => r.id)),
    interesesLista: i.rows,
    intereses: new Set(i.rows.map((r) => r.id)),
    ajustes: Object.fromEntries(a.rows.map((r) => [r.clave, r.valor])),
  };
  cacheAt = Date.now();
  return cache;
}
