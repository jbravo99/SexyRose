// Vista Mapa de Cerca de mí (13/11/2026): el mapa de Argentina es un archivo .pmtiles (Protomaps) que Juan sube a
// bunny.net (infra/mapa/README.md). El servidor solo pasa las direcciones al sitio (/api/sitio/estado → mapa) y las
// suma a la CSP (connect-src). Sin MAP_TILES_URL no hay vista Mapa: Cerca queda solo con el radar.
//   MAP_TILES_URL   https://…/mapa/argentina.pmtiles
//   MAP_GLYPHS_URL  https://…/mapa/fonts/{fontstack}/{range}.pbf   (opcional: con glyphs y sprite el mapa lleva nombres)
//   MAP_SPRITE_URL  https://…/mapa/sprites/v4/dark                  (opcional, sin extensión)
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/;

function url(raw, { plantilla = false } = {}) {
  const s = String(raw || '').trim();
  if (!s) return '';
  // Las plantillas de glyphs llevan {fontstack} y {range}: se validan sin ellas
  const probar = plantilla ? s.replace('{fontstack}', 'f').replace('{range}', 'r') : s;
  let u;
  try { u = new URL(probar); } catch { return ''; }
  if (u.username || u.password) return '';
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && LOCAL.test(u.hostname))) return '';
  if (plantilla && !(s.includes('{fontstack}') && s.includes('{range}'))) return '';
  return s;
}

export function mapaConfig(env = process.env) {
  const tiles = url(env.MAP_TILES_URL);
  if (!tiles || !/\.pmtiles$/i.test(new URL(tiles).pathname)) return null;
  const glyphs = url(env.MAP_GLYPHS_URL, { plantilla: true });
  const sprite = url(env.MAP_SPRITE_URL);
  // Nombres de calles y lugares solo con las dos cosas (el estilo las necesita juntas)
  return glyphs && sprite ? { tiles, glyphs, sprite } : { tiles, glyphs: '', sprite: '' };
}

// Orígenes que el navegador tiene que poder pedir con fetch (connect-src)
export function mapaOrigenes(cfg) {
  if (!cfg) return [];
  const out = new Set();
  for (const v of [cfg.tiles, cfg.glyphs, cfg.sprite]) {
    if (!v) continue;
    try { out.add(new URL(v.replace('{fontstack}', 'f').replace('{range}', 'r')).origin); } catch { /* */ }
  }
  return [...out];
}
