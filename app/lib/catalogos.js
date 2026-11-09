// Catálogos (ubicaciones, categorías, intereses) y ajustes, con caché corta en memoria.
// El admin llama invalidarCatalogos() después de editarlos.
let cache = null;
let cacheAt = 0;
const TTL = 60 * 1000;

export function invalidarCatalogos() { cache = null; }

export async function cargarCatalogos(pool) {
  if (cache && Date.now() - cacheAt < TTL) return cache;
  const [u, c, i, a] = await Promise.all([
    pool.query('SELECT id, nombre, tipo, padre, lat, lng, activa, orden FROM ubicaciones ORDER BY orden, nombre'),
    pool.query('SELECT id, nombre, icono, orden, activa FROM categorias ORDER BY orden, nombre'),
    pool.query('SELECT id, nombre, nombre_en, nombre_pt, orden FROM intereses ORDER BY orden, nombre'),
    pool.query('SELECT clave, valor FROM ajustes'),
  ]);
  cache = {
    ubicaciones: u.rows,
    ubic: new Map(u.rows.map((r) => [r.id, r])),
    categoriasLista: c.rows,
    categorias: new Set(c.rows.filter((r) => r.activa).map((r) => r.id)),
    interesesLista: i.rows,
    intereses: new Set(i.rows.map((r) => r.id)),
    ajustes: Object.fromEntries(a.rows.map((r) => [r.clave, r.valor])),
  };
  cacheAt = Date.now();
  return cache;
}
