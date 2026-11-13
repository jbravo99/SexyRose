// Ubicaciones oficiales de Argentina (Georef, datos.gob.ar) — 13/11/2026.
//
// Qué hace: baja la base completa de Georef (provincias, departamentos y localidades) y los 48 barrios oficiales de
// la Ciudad de Buenos Aires, y los agrega a la tabla `ubicaciones` sin tocar lo que ya existe:
//   - Provincias: se emparejan con las nuestras por código INDEC (tabla PROVINCIAS) o por nombre; conservan su id.
//   - Localidades: tipo 'ciudad', hijas de su provincia. Las de los 24 partidos del conurbano (tabla GBA) van dentro
//     de Zona Norte / Oeste / Sur (GBA). Si ya había una ciudad cargada a mano con el mismo nombre en la misma
//     provincia, se vincula esa (mismo id, mismo nombre) en vez de crear otra.
//   - Barrios de CABA: tipo 'barrio', hijos de 'ciudad-de-buenos-aires' (Capital Federal).
//   - Coordenadas: el centroide del área (nunca una dirección).
//   - Nunca borra, nunca renombra, nunca reactiva ni mueve un lugar existente (lo que Juan editó en el admin queda).
//     Se puede correr las veces que haga falta: lo que ya está vinculado (georef_id) se saltea.
//
// Fuentes (confirmadas en el código de datosgobar/georef-ar-api y georef-ar-etl, rama master, 13/11/2026):
//   https://infra.datos.gob.ar/georef/provincias.json      { cantidad, total, inicio, parametros, provincias: [...] }
//   https://infra.datos.gob.ar/georef/departamentos.json   { ..., departamentos: [...] }
//   https://infra.datos.gob.ar/georef/localidades.json     { ..., localidades: [...] }
//   Cada elemento: { id, nombre, centroide: { lat, lon }, provincia: { id, nombre }, departamento: { id, nombre },
//   municipio: { id, nombre }, localidad_censal: { id, nombre }, categoria, fuente }. Los nombres de localidades
//   vienen en MAYÚSCULAS (BAHRA: 'VILLA RAFFO'); los de provincias y departamentos, con mayúsculas y acentos normales.
//   En CABA Georef tiene una sola localidad (sin barrios): los barrios salen del dataset del Gobierno de la Ciudad
//   (URL y formato SIN CONFIRMAR: no se pudo abrir desde el entorno de desarrollo). Si no baja o no se entiende, se
//   usan los 48 nombres oficiales de la tabla BARRIOS_CABA con un centro aproximado de cada barrio.
//
// Uso: server.js crea la instancia y llama iniciarTarea() (importa al arrancar si nunca se importó bien y revisa una
// vez por semana); el admin tiene "Importar ahora"; a mano: `node scripts/importar-georef.js` (ver ese archivo).
import fs from 'node:fs/promises';
import path from 'node:path';

export const URLS = {
  provincias: 'https://infra.datos.gob.ar/georef/provincias.json',
  departamentos: 'https://infra.datos.gob.ar/georef/departamentos.json',
  localidades: 'https://infra.datos.gob.ar/georef/localidades.json',
  barrios: 'https://cdn.buenosaires.gob.ar/datosabiertos/datasets/ministerio-de-educacion/barrios/barrios.geojson',
};

// Código INDEC de cada provincia (los ids de Georef) → nuestro id (seed 010-cuentas.sql)
export const PROVINCIAS = {
  '02': 'ciudad-de-buenos-aires', '06': 'provincia-de-buenos-aires', '10': 'provincia-de-catamarca', '14': 'provincia-de-cordoba',
  '18': 'provincia-de-corrientes', '22': 'provincia-de-chaco', '26': 'provincia-de-chubut', '30': 'provincia-de-entre-rios',
  '34': 'provincia-de-formosa', '38': 'provincia-de-jujuy', '42': 'provincia-de-la-pampa', '46': 'provincia-de-la-rioja',
  '50': 'provincia-de-mendoza', '54': 'provincia-de-misiones', '58': 'provincia-de-neuquen', '62': 'provincia-de-rio-negro',
  '66': 'provincia-de-salta', '70': 'provincia-de-san-juan', '74': 'provincia-de-san-luis', '78': 'provincia-de-santa-cruz',
  '82': 'provincia-de-santa-fe', '86': 'provincia-de-santiago-del-estero', '90': 'provincia-de-tucuman', '94': 'provincia-de-tierra-del-fuego',
};
export const CABA_ID = 'ciudad-de-buenos-aires';
const PBA_CODIGO = '06';

// Los 24 partidos del Gran Buenos Aires (definición del INDEC) y la zona del sitio donde van sus localidades.
// Se buscan por el nombre del departamento de Georef (sin acentos ni mayúsculas). Pilar y Escobar NO son parte de
// los 24: sus localidades quedan en la provincia (la ciudad 'Pilar' cargada a mano sigue en Zona Norte).
export const GBA = {
  'zona-norte-gba': ['Vicente López', 'San Isidro', 'San Fernando', 'Tigre', 'General San Martín', 'San Miguel', 'Malvinas Argentinas', 'José C. Paz'],
  'zona-oeste-gba': ['La Matanza', 'Morón', 'Hurlingham', 'Ituzaingó', 'Tres de Febrero', 'Merlo', 'Moreno'],
  'zona-sur-gba': ['Avellaneda', 'Lanús', 'Lomas de Zamora', 'Quilmes', 'Berazategui', 'Florencio Varela', 'Almirante Brown', 'Esteban Echeverría', 'Ezeiza'],
};

// Los 48 barrios oficiales de la Ciudad (comuna y un centro aproximado del barrio, para cuando no baja el dataset)
export const BARRIOS_CABA = [
  ['Retiro', 1, -34.5895, -58.377], ['San Nicolás', 1, -34.6037, -58.3816], ['Puerto Madero', 1, -34.614, -58.363], ['San Telmo', 1, -34.6215, -58.3725],
  ['Monserrat', 1, -34.6125, -58.382], ['Constitución', 1, -34.6275, -58.385], ['Recoleta', 2, -34.5875, -58.3975], ['Balvanera', 3, -34.6095, -58.404],
  ['San Cristóbal', 3, -34.6235, -58.402], ['La Boca', 4, -34.6345, -58.363], ['Barracas', 4, -34.645, -58.382], ['Parque Patricios', 4, -34.6375, -58.401],
  ['Nueva Pompeya', 4, -34.65, -58.418], ['Almagro', 5, -34.606, -58.421], ['Boedo', 5, -34.6295, -58.4185], ['Caballito', 6, -34.618, -58.441],
  ['Flores', 7, -34.633, -58.464], ['Parque Chacabuco', 7, -34.6365, -58.438], ['Villa Soldati', 8, -34.664, -58.443], ['Villa Riachuelo', 8, -34.6905, -58.47],
  ['Villa Lugano', 8, -34.676, -58.472], ['Liniers', 9, -34.643, -58.52], ['Mataderos', 9, -34.656, -58.503], ['Parque Avellaneda', 9, -34.648, -58.48],
  ['Villa Real', 10, -34.62, -58.525], ['Monte Castro', 10, -34.62, -58.508], ['Versalles', 10, -34.631, -58.521], ['Floresta', 10, -34.63, -58.483],
  ['Vélez Sarsfield', 10, -34.632, -58.492], ['Villa Luro', 10, -34.638, -58.503], ['Villa General Mitre', 11, -34.611, -58.468], ['Villa Devoto', 11, -34.601, -58.513],
  ['Villa del Parque', 11, -34.605, -58.49], ['Villa Santa Rita', 11, -34.616, -58.482], ['Coghlan', 12, -34.56, -58.475], ['Saavedra', 12, -34.554, -58.488],
  ['Villa Urquiza', 12, -34.572, -58.488], ['Villa Pueyrredón', 12, -34.581, -58.504], ['Núñez', 13, -34.545, -58.46], ['Belgrano', 13, -34.562, -58.456],
  ['Colegiales', 13, -34.574, -58.45], ['Palermo', 14, -34.578, -58.425], ['Chacarita', 15, -34.588, -58.454], ['Villa Crespo', 15, -34.599, -58.438],
  ['La Paternal', 15, -34.598, -58.468], ['Villa Ortúzar', 15, -34.58, -58.468], ['Agronomía', 15, -34.592, -58.49], ['Parque Chas', 15, -34.585, -58.478],
];

/* ---------------------------------------------------------------- Texto ---------------------------------------------------------------- */

// Sin acentos, minúsculas, solo letras y números separados por un espacio ("José C. Paz" → "jose c paz")
export const norm = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9ñ]+/g, ' ').trim();
export const slugify = (s) => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
// Nombre de provincia sin "Provincia de" (para comparar y para los caminos "Oberá, Misiones")
export const sinPrefijo = (s) => String(s || '').replace(/^\s*provincia\s+de(l)?\s+/i, '');
const MINUSCULAS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'en', 'al', 'a', 'o']);
const ROMANO = /^(i{1,3}|iv|v|vi{1,3}|ix|x{1,3})$/i;

// Diccionario de acentos armado con los nombres oficiales que sí vienen bien escritos (provincias, departamentos,
// municipios, localidades censales): nombre entero sin acentos → nombre bien escrito, y palabra → palabra acentuada
// (solo si la forma con acento aparece más que la sin acento).
export function diccionario(nombres) {
  const enteros = new Map(); const palabras = new Map();
  for (const n0 of nombres) {
    const n = String(n0 || '').replace(/\s+/g, ' ').trim();
    if (!n || n === n.toUpperCase()) continue; // solo los que vienen con mayúsculas y minúsculas normales
    const k = norm(n); if (k && !enteros.has(k)) enteros.set(k, n);
    for (const w of n.split(/[\s-]+/)) {
      const f = norm(w); if (!f || f.includes(' ')) continue;
      const e = palabras.get(f) || { sin: 0, con: new Map() };
      if (/[^\x00-\x7f]/.test(w)) { const lw = w.toLowerCase(); e.con.set(lw, (e.con.get(lw) || 0) + 1); } else e.sin += 1;
      palabras.set(f, e);
    }
  }
  const acento = new Map();
  for (const [f, e] of palabras) {
    let mejor = null; let n = 0;
    for (const [w, c] of e.con) if (c > n) { mejor = w; n = c; }
    if (mejor && n > e.sin) acento.set(f, mejor);
  }
  return { enteros, acento };
}

// 'SAN MARTIN DE LOS ANDES' → 'San Martín de los Andes'. Si ya viene con minúsculas, se respeta tal cual.
export function nombreLindo(crudo, dic = { enteros: new Map(), acento: new Map() }) {
  const s = String(crudo || '').replace(/\s+/g, ' ').trim();
  if (!s) return s;
  if (s !== s.toUpperCase()) return s;
  const entero = dic.enteros.get(norm(s));
  if (entero) return entero;
  let i = 0;
  return s.toLowerCase().split(' ').map((w) => {
    const primera = i++ === 0;
    if (!primera && MINUSCULAS.has(w)) return w;
    if (ROMANO.test(w) && w.length <= 4 && !primera) return w.toUpperCase();
    return w.split('-').map((p) => {
      const conAcento = dic.acento.get(norm(p)) || p;
      return conAcento.charAt(0).toUpperCase() + conAcento.slice(1);
    }).join('-');
  }).join(' ');
}

/* ---------------------------------------------------------------- Lectura de archivos ---------------------------------------------------------------- */

// JSON de Georef ({ <entidad>: [...] }), un arreglo, o NDJSON (la primera línea de NDJSON son metadatos)
export function leerEntidades(texto, clave) {
  const t = String(texto || '').trim();
  if (!t) return [];
  try {
    const j = JSON.parse(t);
    if (Array.isArray(j)) return j;
    if (j && Array.isArray(j[clave])) return j[clave];
    const arr = j && Object.values(j).find((v) => Array.isArray(v) && v.length && typeof v[0] === 'object');
    if (arr) return arr;
    throw new Error(`no tiene la lista "${clave}"`);
  } catch (e) {
    if (!t.includes('\n')) throw e;
    const out = [];
    for (const linea of t.split('\n')) {
      const l = linea.trim(); if (!l) continue;
      const o = JSON.parse(l);
      if (o && o.id != null && o.nombre != null) out.push(o);
    }
    return out;
  }
}

// Centroide (por área) de un Polygon/MultiPolygon de GeoJSON → [lat, lng]
function centroide(geom) {
  if (!geom) return null;
  const polis = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : null;
  if (!polis) return null;
  let A = 0; let cx = 0; let cy = 0;
  for (const p of polis) {
    const r = p && p[0]; if (!Array.isArray(r)) continue;
    for (let i = 0; i < r.length - 1; i++) {
      const [x0, y0] = r[i]; const [x1, y1] = r[i + 1];
      const f = x0 * y1 - x1 * y0; A += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
    }
  }
  if (!A) return null;
  return [cy / (3 * A), cx / (3 * A)];
}

// Barrios oficiales: de un GeoJSON (propiedad BARRIO/barrio/nombre) o un CSV (columna BARRIO/barrio/nombre y,
// si tiene, WKT o lat/lng). Solo se aceptan los 48 nombres de BARRIOS_CABA; los que no vienen usan el centro fijo.
export function leerBarrios(texto) {
  const oficiales = new Map(BARRIOS_CABA.map(([n, c, lat, lng]) => [norm(n), { nombre: n, comuna: c, lat, lng }]));
  const alias = new Map([['montserrat', 'monserrat'], ['villa gral mitre', 'villa general mitre'], ['boca', 'la boca'], ['paternal', 'la paternal'], ['nunez', 'nunez']]);
  const encontrados = new Map();
  const t = String(texto || '').trim();
  if (t) {
    let feats = null;
    try { const j = JSON.parse(t); feats = Array.isArray(j.features) ? j.features : null; } catch { feats = null; }
    if (feats) {
      for (const f of feats) {
        const p = f.properties || {};
        const n0 = p.BARRIO || p.barrio || p.nombre || p.NOMBRE || p.Barrio;
        let k = norm(n0); k = alias.get(k) || k;
        if (!oficiales.has(k)) continue;
        const c = centroide(f.geometry);
        if (c && c[0] < -34.5 && c[0] > -34.8 && c[1] < -58.3 && c[1] > -58.6) encontrados.set(k, { lat: c[0], lng: c[1] });
        else encontrados.set(k, null);
      }
    }
  }
  return BARRIOS_CABA.map(([n]) => {
    const o = oficiales.get(norm(n)); const e = encontrados.get(norm(n));
    return { nombre: o.nombre, comuna: o.comuna, lat: e ? e.lat : o.lat, lng: e ? e.lng : o.lng, delDataset: !!e };
  });
}

/* ---------------------------------------------------------------- Plan de importación (puro, sin base) ---------------------------------------------------------------- */

const r4 = (x) => (x == null || !Number.isFinite(Number(x)) ? null : Math.round(Number(x) * 1e4) / 1e4);

/* existentes: filas actuales de ubicaciones { id, nombre, tipo, padre, lat, lng, georef_id, fuente }
   datos: { provincias, departamentos, localidades, barrios } (barrios: salida de leerBarrios)
   → { nuevos: [fila], vinculos: [{ id, georef_id, departamento, lat, lng }], conteos, avisos } */
export function planificar(existentes, datos) {
  const avisos = [];
  const byId = new Map(existentes.map((r) => [r.id, r]));
  const ids = new Set(existentes.map((r) => r.id));
  const vinculados = new Set(existentes.filter((r) => r.georef_id).map((r) => r.georef_id));
  const nuevos = []; const vinculos = [];
  const conteos = { provincias: 0, provinciasNuevas: 0, localidades: 0, localidadesNuevas: 0, localidadesVinculadas: 0, yaEstaban: 0, barrios: 0, barriosNuevos: 0, barriosVinculados: 0, barriosDelDataset: 0, gba: { 'zona-norte-gba': 0, 'zona-oeste-gba': 0, 'zona-sur-gba': 0 }, sinProvincia: 0 };

  const provinciaDe = (r) => { let cur = r; let g = 0; while (cur && g++ < 10) { if (cur.tipo === 'provincia') return cur.id; cur = cur.padre ? byId.get(cur.padre) : null; } return null; };
  const idLibre = (...partes) => {
    const base = slugify(partes[0]) || 'lugar';
    const cands = [base];
    for (let i = 1; i < partes.length; i++) if (partes[i]) cands.push(slugify(partes.slice(0, i + 1).join(' ')));
    for (const c of cands) if (c && !ids.has(c) && c.length <= 60) { ids.add(c); return c; }
    for (let n = 2; ; n++) { const c = `${cands[cands.length - 1].slice(0, 55).replace(/-+$/, '')}-${n}`; if (!ids.has(c)) { ids.add(c); return c; } }
  };
  const pais = existentes.find((r) => r.tipo === 'pais' && r.id === 'argentina') || existentes.find((r) => r.tipo === 'pais');

  // --- Provincias
  const provRows = existentes.filter((r) => r.tipo === 'provincia');
  const provDe = new Map(); // código Georef → nuestro id
  const provNombre = new Map(); // nuestro id → nombre corto ("Misiones")
  const resolverProvincia = (codigo, nombreGeoref) => {
    if (provDe.has(codigo)) return provDe.get(codigo);
    let r = provRows.find((x) => x.georef_id === codigo) || (PROVINCIAS[codigo] && byId.get(PROVINCIAS[codigo]));
    if (!r && nombreGeoref) {
      const k = norm(sinPrefijo(nombreGeoref));
      r = provRows.find((x) => { const n = norm(sinPrefijo(x.nombre)); return n === k || (k.length > 6 && (k.startsWith(n + ' ') || n.startsWith(k + ' '))); });
    }
    if (r && r.tipo !== 'provincia') r = null;
    provDe.set(codigo, r ? r.id : null);
    return r ? r.id : null;
  };
  const datosProv = new Map((datos.provincias || []).map((p) => [String(p.id), p]));
  const codigos = new Set([...datosProv.keys(), ...(datos.localidades || []).map((l) => String((l.provincia || {}).id || '')).filter(Boolean)]);
  for (const codigo of [...codigos].sort()) {
    const p = datosProv.get(codigo) || (datos.localidades || []).map((l) => l.provincia).find((x) => x && String(x.id) === codigo) || { id: codigo, nombre: '' };
    let id = resolverProvincia(codigo, p.nombre);
    if (!id && p.nombre && pais) {
      // Una provincia que no está (la borraron del admin, o un código nuevo): se crea
      const nombre = codigo === '02' ? 'Capital Federal (CABA)' : 'Provincia de ' + sinPrefijo(p.nombre).replace(/,.*$/, '');
      id = PROVINCIAS[codigo] && !ids.has(PROVINCIAS[codigo]) ? (ids.add(PROVINCIAS[codigo]), PROVINCIAS[codigo]) : idLibre(nombre);
      const c = p.centroide || {};
      const fila = { id, nombre, tipo: 'provincia', padre: pais.id, lat: r4(c.lat), lng: r4(c.lon), georef_id: codigo, fuente: 'georef', departamento: null };
      nuevos.push(fila); byId.set(id, fila); provRows.push(fila); provDe.set(codigo, id); vinculados.add(codigo);
      conteos.provinciasNuevas++;
    } else if (id) {
      const r = byId.get(id);
      if (!r.georef_id && !vinculados.has(codigo)) { vinculos.push({ id, georef_id: codigo, departamento: null, lat: r4((p.centroide || {}).lat), lng: r4((p.centroide || {}).lon) }); vinculados.add(codigo); r.georef_id = codigo; }
    }
    if (id) conteos.provincias++;
  }
  for (const r of provRows) provNombre.set(r.id, sinPrefijo(r.nombre));

  // Ciudades y barrios ya cargados (a mano o de otra importación) sin vincular, por provincia + nombre
  const sueltas = new Map();
  for (const r of existentes) {
    if ((r.tipo !== 'ciudad' && r.tipo !== 'barrio') || r.georef_id) continue;
    const k = provinciaDe(r) + '|' + norm(r.nombre);
    if (!sueltas.has(k)) sueltas.set(k, []);
    sueltas.get(k).push(r);
  }
  const tomarSuelta = (provId, nombre, lat, lng) => {
    const lista = sueltas.get(provId + '|' + norm(nombre));
    if (!lista || !lista.length) return null;
    let mejor = 0; let d = Infinity;
    lista.forEach((r, i) => { const di = r.lat == null || lat == null ? 1e9 : (r.lat - lat) ** 2 + (r.lng - lng) ** 2; if (di < d) { d = di; mejor = i; } });
    return lista.splice(mejor, 1)[0];
  };

  // --- Barrios de CABA (primero, así se quedan con los ids cortos: /argentina/palermo)
  const caba = byId.get(provDe.get('02') || CABA_ID);
  if (caba && datos.barrios) {
    for (const b of datos.barrios) {
      const gid = 'gcba:' + slugify(b.nombre);
      conteos.barrios++;
      if (b.delDataset) conteos.barriosDelDataset++;
      if (vinculados.has(gid)) { conteos.yaEstaban++; continue; }
      const suelta = tomarSuelta(caba.id, b.nombre, b.lat, b.lng);
      if (suelta) { vinculos.push({ id: suelta.id, georef_id: gid, departamento: 'Comuna ' + b.comuna, lat: r4(b.lat), lng: r4(b.lng) }); vinculados.add(gid); conteos.barriosVinculados++; continue; }
      const id = idLibre(b.nombre, 'caba');
      nuevos.push({ id, nombre: b.nombre, tipo: 'barrio', padre: caba.id, lat: r4(b.lat), lng: r4(b.lng), georef_id: gid, fuente: 'georef', departamento: 'Comuna ' + b.comuna });
      vinculados.add(gid); conteos.barriosNuevos++;
    }
  } else if (datos.barrios) avisos.push('No está Capital Federal (CABA) en ubicaciones: no se cargaron los barrios.');

  // --- Localidades
  const dic = diccionario([
    ...(datos.provincias || []).map((p) => p.nombre), ...(datos.departamentos || []).map((d) => d.nombre),
    ...(datos.localidades || []).flatMap((l) => [(l.departamento || {}).nombre, (l.municipio || {}).nombre, (l.localidad_censal || {}).nombre]),
  ]);
  const zonaDePartido = new Map(); const nombrePartido = new Map();
  for (const [zona, partidos] of Object.entries(GBA)) for (const p of partidos) { zonaDePartido.set(norm(p), zona); nombrePartido.set(norm(p), p); }
  if (datos.departamentos && datos.departamentos.length) {
    const deptosPba = new Set(datos.departamentos.filter((d) => String((d.provincia || {}).id) === PBA_CODIGO).map((d) => norm(d.nombre)));
    if (deptosPba.size) for (const k of zonaDePartido.keys()) if (!deptosPba.has(k)) avisos.push(`Partido del GBA no encontrado en los departamentos de Georef: ${nombrePartido.get(k)} (revisar la tabla GBA de lib/georef.js).`);
  }
  const cabecera = (l) => { const n = norm(l.nombre); return n === norm((l.departamento || {}).nombre) || n === norm((l.municipio || {}).nombre) || n === norm((l.localidad_censal || {}).nombre); };
  const locs = (datos.localidades || []).filter((l) => l && l.id != null && l.nombre && String((l.provincia || {}).id) !== '02')
    .slice().sort((a, b) => (cabecera(b) - cabecera(a)) || String(a.id).localeCompare(String(b.id)));
  for (const l of locs) {
    conteos.localidades++;
    const gid = String(l.id);
    if (vinculados.has(gid)) { conteos.yaEstaban++; continue; }
    const codigo = String((l.provincia || {}).id || '');
    const provId = resolverProvincia(codigo, (l.provincia || {}).nombre);
    if (!provId) { conteos.sinProvincia++; continue; }
    const c = l.centroide || {}; const lat = r4(c.lat); const lng = r4(c.lon);
    const depto = (l.departamento && l.departamento.nombre) ? String(l.departamento.nombre) : null;
    const nombre = nombreLindo(l.nombre, dic);
    const suelta = tomarSuelta(provId, nombre, lat, lng);
    if (suelta) { vinculos.push({ id: suelta.id, georef_id: gid, departamento: depto, lat, lng }); vinculados.add(gid); conteos.localidadesVinculadas++; continue; }
    let padre = provId;
    if (codigo === PBA_CODIGO && depto) {
      const z = zonaDePartido.get(norm(depto));
      if (z && byId.has(z)) { padre = z; conteos.gba[z]++; }
    }
    const id = idLibre(nombre, provNombre.get(provId), depto);
    nuevos.push({ id, nombre, tipo: 'ciudad', padre, lat, lng, georef_id: gid, fuente: 'georef', departamento: depto });
    vinculados.add(gid); conteos.localidadesNuevas++;
  }
  return { nuevos, vinculos, conteos, avisos };
}

/* ---------------------------------------------------------------- Instancia (base, red, tarea) ---------------------------------------------------------------- */

const DIA = 24 * 60 * 60 * 1000;
const SEMANA = 7 * DIA;

// minLocalidades: si la descarga trae menos, se considera rota y no se aplica (Georef tiene unas 4000)
export function createGeoref({ pool, log = () => {}, fetchImpl = globalThis.fetch, urls = {}, alCambiar = () => {}, timeoutMs = 120000, minLocalidades = 1000 } = {}) {
  const U = { ...URLS, ...urls };
  let corriendo = null; let timer = null; let arranque = null;

  async function bajar(url) {
    if (!fetchImpl) throw new Error('sin acceso a la red');
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), headers: { Accept: 'application/json, */*' } });
    if (!res.ok) throw new Error(`${url} respondió ${res.status}`);
    return res.text();
  }
  const leerArchivo = (p) => fs.readFile(p, 'utf8');

  // archivos: { provincias, departamentos, localidades, barrios } (rutas) o { dir } con provincias.json,
  // departamentos.json, localidades.json y barrios.geojson (los que falten se saltean, salvo localidades).
  async function obtener(archivos) {
    if (archivos) {
      const ruta = (k, nombre) => archivos[k] || (archivos.dir ? path.join(archivos.dir, nombre) : null);
      const leer = async (k, nombre, obligatorio) => {
        const p = ruta(k, nombre);
        if (!p) { if (obligatorio) throw new Error(`falta el archivo de ${k}`); return null; }
        try { return await leerArchivo(p); } catch (e) { if (obligatorio) throw new Error(`no se pudo leer ${p}: ${e.code || e.message}`); return null; }
      };
      return {
        origen: 'archivos',
        provincias: await leer('provincias', 'provincias.json', false),
        departamentos: await leer('departamentos', 'departamentos.json', false),
        localidades: await leer('localidades', 'localidades.json', true),
        barrios: await leer('barrios', 'barrios.geojson', false),
      };
    }
    const [provincias, departamentos, localidades] = await Promise.all([bajar(U.provincias), bajar(U.departamentos).catch((e) => { log('georef: departamentos no bajó (sigue sin ellos):', e.message); return null; }), bajar(U.localidades)]);
    const barrios = await bajar(U.barrios).catch((e) => { log('georef: barrios de CABA no bajó (se usan los 48 nombres oficiales con centro aproximado):', e.message); return null; });
    return { origen: 'red', provincias, departamentos, localidades, barrios };
  }

  async function aplicar(plan) {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const { rows: [lk] } = await c.query('SELECT pg_try_advisory_xact_lock(74210160) AS ok');
      if (!lk.ok) throw new Error('otra importación está corriendo');
      for (const v of plan.vinculos) {
        await c.query(`UPDATE ubicaciones SET georef_id = $2, departamento = COALESCE(departamento, $3), lat = COALESCE(lat, $4), lng = COALESCE(lng, $5)
                        WHERE id = $1 AND georef_id IS NULL
                          AND NOT EXISTS (SELECT 1 FROM ubicaciones x WHERE x.georef_id = $2)`, [v.id, v.georef_id, v.departamento, v.lat, v.lng]);
      }
      // Padres antes que hijos (provincias nuevas → barrios/localidades)
      const nivel = { pais: 0, provincia: 1, zona: 2, ciudad: 3, barrio: 3 };
      const lotes = [];
      for (const n of [0, 1, 2, 3]) {
        const filas = plan.nuevos.filter((f) => nivel[f.tipo] === n);
        for (let i = 0; i < filas.length; i += 500) lotes.push(filas.slice(i, i + 500));
      }
      let insertadas = 0;
      for (const lote of lotes) {
        const col = (k) => lote.map((f) => f[k]);
        const r = await c.query(
          `INSERT INTO ubicaciones (id, nombre, tipo, padre, lat, lng, georef_id, fuente, departamento, activa, orden)
           SELECT x.id, x.nombre, x.tipo, x.padre, x.lat, x.lng, x.georef_id, x.fuente, x.departamento, true, 0
             FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::float8[], $6::float8[], $7::text[], $8::text[], $9::text[])
                  AS x(id, nombre, tipo, padre, lat, lng, georef_id, fuente, departamento)
            WHERE EXISTS (SELECT 1 FROM ubicaciones p WHERE p.id = x.padre)
           ON CONFLICT DO NOTHING`,
          [col('id'), col('nombre'), col('tipo'), col('padre'), col('lat'), col('lng'), col('georef_id'), col('fuente'), col('departamento')]);
        insertadas += r.rowCount;
      }
      await c.query('COMMIT');
      return insertadas;
    } catch (e) {
      await c.query('ROLLBACK').catch(() => {});
      throw e;
    } finally { c.release(); }
  }

  // Importa (una a la vez). motivo: 'arranque' | 'semanal' | 'admin' | 'manual'. archivos: ver obtener().
  async function importar({ motivo = 'manual', archivos = null } = {}) {
    if (corriendo) return corriendo;
    corriendo = (async () => {
      const t0 = Date.now();
      const { rows: [reg] } = await pool.query('INSERT INTO georef_importaciones (motivo, origen) VALUES ($1, $2) RETURNING id', [motivo, archivos ? 'archivos' : 'red']);
      try {
        log(`georef: importando (${motivo}, ${archivos ? 'desde archivos' : 'desde datos.gob.ar'})…`);
        const crudo = await obtener(archivos);
        const datos = {
          provincias: crudo.provincias ? leerEntidades(crudo.provincias, 'provincias') : [],
          departamentos: crudo.departamentos ? leerEntidades(crudo.departamentos, 'departamentos') : [],
          localidades: leerEntidades(crudo.localidades, 'localidades'),
          barrios: leerBarrios(crudo.barrios),
        };
        if (datos.localidades.length < minLocalidades && !archivos) throw new Error(`la lista de localidades vino casi vacía (${datos.localidades.length})`);
        const { rows: existentes } = await pool.query('SELECT id, nombre, tipo, padre, lat, lng, georef_id, fuente FROM ubicaciones');
        const plan = planificar(existentes, datos);
        const insertadas = await aplicar(plan);
        const conteos = { ...plan.conteos, insertadas, vinculadas: plan.vinculos.length, avisos: plan.avisos.slice(0, 20), segundos: Math.round((Date.now() - t0) / 100) / 10 };
        await pool.query('UPDATE georef_importaciones SET fin = now(), ok = true, origen = $2, conteos = $3 WHERE id = $1', [reg.id, crudo.origen, JSON.stringify(conteos)]);
        for (const a of plan.avisos) log('georef: aviso:', a);
        log(`georef: listo en ${conteos.segundos} s — ${conteos.provincias} provincias, ${conteos.localidades} localidades `
          + `(${conteos.localidadesNuevas} nuevas, ${conteos.localidadesVinculadas} vinculadas con las cargadas a mano, ${conteos.yaEstaban} ya estaban), `
          + `${conteos.barrios} barrios de CABA (${conteos.barriosNuevos} nuevos, ${conteos.barriosDelDataset} con el contorno del dataset), `
          + `GBA: norte ${conteos.gba['zona-norte-gba']}, oeste ${conteos.gba['zona-oeste-gba']}, sur ${conteos.gba['zona-sur-gba']}; filas agregadas: ${insertadas}`);
        if (insertadas || plan.vinculos.length) alCambiar();
        return { ok: true, conteos };
      } catch (e) {
        const msg = String(e && e.message ? e.message : e).slice(0, 500);
        await pool.query('UPDATE georef_importaciones SET fin = now(), ok = false, error = $2 WHERE id = $1', [reg.id, msg]).catch(() => {});
        log('georef: la importación falló:', msg);
        return { ok: false, error: msg };
      }
    })().finally(() => { corriendo = null; });
    return corriendo;
  }

  // Última importación (y la última que salió bien) para el admin
  async function estado() {
    const { rows } = await pool.query(
      `(SELECT id, inicio, fin, ok, origen, motivo, conteos, error FROM georef_importaciones ORDER BY inicio DESC LIMIT 1)
       UNION ALL (SELECT id, inicio, fin, ok, origen, motivo, conteos, error FROM georef_importaciones WHERE ok ORDER BY inicio DESC LIMIT 1)`);
    const { rows: [n] } = await pool.query("SELECT count(*) FILTER (WHERE fuente = 'georef')::int AS georef, count(*) FILTER (WHERE georef_id IS NOT NULL)::int AS vinculadas, count(*)::int AS total FROM ubicaciones");
    const fila = (r) => (r ? { inicio: r.inicio, fin: r.fin, ok: r.ok, origen: r.origen, motivo: r.motivo, conteos: r.conteos, error: r.error || null } : null);
    return { corriendo: !!corriendo, ultima: fila(rows[0]), ultimaOk: fila(rows.find((r) => r.ok)), lugares: n };
  }

  // ¿Toca importar? Nunca salió bien, o la última buena tiene más de una semana. Tras un fallo espera 5 min, 30 min,
  // 2 h 30 y después 6 h entre intentos (para no insistir si datos.gob.ar no responde).
  async function toca(ahora = Date.now()) {
    const { rows } = await pool.query('SELECT inicio, ok FROM georef_importaciones ORDER BY inicio DESC LIMIT 20');
    const iOk = rows.findIndex((r) => r.ok);
    const ultimaOk = iOk >= 0 ? new Date(rows[iOk].inicio).getTime() : 0;
    if (ultimaOk && ahora - ultimaOk < SEMANA) return null;
    const fallos = iOk >= 0 ? iOk : rows.length;
    if (fallos) {
      const espera = [5, 30, 150, 360][Math.min(fallos, 4) - 1] * 60 * 1000;
      if (ahora - new Date(rows[0].inicio).getTime() < espera) return null;
    }
    return ultimaOk ? 'semanal' : 'arranque';
  }

  function iniciarTarea({ listo = () => true, cadaMs = 5 * 60 * 1000 } = {}) {
    if (!fetchImpl || timer) return;
    const tick = async () => {
      if (!listo() || corriendo) return;
      try { const m = await toca(); if (m) await importar({ motivo: m }); } catch (e) { log('georef: no se pudo revisar si toca importar:', e.code || e.message); }
    };
    // Primera revisión apenas la base esté lista (en segundo plano: el sitio ya atiende)
    arranque = setInterval(() => { if (listo()) { clearInterval(arranque); arranque = null; tick(); } }, 3000);
    arranque.unref?.();
    timer = setInterval(tick, cadaMs);
    timer.unref?.();
  }
  function detenerTarea() { if (arranque) clearInterval(arranque); if (timer) clearInterval(timer); arranque = null; timer = null; }

  return { importar, estado, toca, iniciarTarea, detenerTarea, get corriendo() { return !!corriendo; } };
}
