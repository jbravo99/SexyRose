// Admin → SEO: textos para Google que Juan edita sin tocar código. Se guardan en ajustes (clave `seo`) y pisan las
// plantillas por defecto (mvp/src/seo.js → app/sitio-spa/seo-datos.json) en el servidor (lib/seo-sitio.js: <title>,
// meta description, sitemap) y en el sitio (mvp/src/prod-sitio-seo.js: la misma lectura en el navegador).
// Formato (el mismo que HH.settings().seo de mvp/src/seo.js):
//   { minProfiles?: n,
//     home?: { es|en|pt: { title?, description?, blockTitle?, blockText? } },
//     tpl?:  { es|en|pt: { country|place|countryMen|placeMen: { title?, description?, intro? }, profile: { title?, description? } } } }
// Un campo vacío o ausente usa el texto por defecto. Solo variables conocidas en cada plantilla.

export const CLAVE_SEO = 'seo';
export const SEO_LANGS = ['es', 'en', 'pt'];
export const SEO_HOME_CAMPOS = ['title', 'description', 'blockTitle', 'blockText'];
export const SEO_TIPOS = ['country', 'place', 'countryMen', 'placeMen', 'profile'];
const CAMPOS_TIPO = { country: ['title', 'description', 'intro'], place: ['title', 'description', 'intro'], countryMen: ['title', 'description', 'intro'], placeMen: ['title', 'description', 'intro'], profile: ['title', 'description'] };
export const SEO_CAMPOS_TIPO = CAMPOS_TIPO;
// Variables que entiende cada plantilla (las mismas que completa lib/seo-sitio.js)
const VARS_LUGAR = ['pais', 'lugar', 'ciudad', 'cantidad'];
export const SEO_VARS = { home: [], country: VARS_LUGAR, place: VARS_LUGAR, countryMen: VARS_LUGAR, placeMen: VARS_LUGAR, profile: ['nombre', 'edad', 'lugar', 'ciudad', 'pais', 'bio'] };
// Largo recomendado (lo que Google suele mostrar) y máximo que se acepta
export const SEO_LARGO = { title: { rec: 70, max: 90 }, description: { rec: 160, max: 300 }, intro: { rec: 300, max: 800 }, blockTitle: { rec: 80, max: 100 }, blockText: { rec: 1200, max: 2000 } };
export const SEO_MIN_PROFILES = { min: 1, max: 20 };

const IDIOMA = { es: 'español', en: 'inglés', pt: 'portugués' };
const NOMBRE_TIPO = { home: 'Portada', country: 'Página de país', place: 'Página de lugar', countryMen: 'Página de hombres por país', placeMen: 'Página de hombres por lugar', profile: 'Perfil' };
const NOMBRE_CAMPO = { title: 'el título', description: 'la descripción', intro: 'el texto de presentación', blockTitle: 'el título del bloque al pie', blockText: 'el texto del bloque al pie' };
const linea = (s) => s.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
const parrafo = (s) => s.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
const esObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);

function campo(valor, tipo, nombre, lang) {
  const donde = `${NOMBRE_TIPO[tipo]} (${IDIOMA[lang]}): ${NOMBRE_CAMPO[nombre]}`;
  if (valor == null) return { valor: '' };
  if (typeof valor !== 'string') return { error: `${donde} tiene que ser texto.` };
  const s = nombre === 'blockText' ? parrafo(valor) : linea(valor);
  const max = SEO_LARGO[nombre].max;
  if (s.length > max) return { error: `${donde} puede tener hasta ${max} caracteres (tiene ${s.length}).` };
  const vars = SEO_VARS[tipo];
  for (const m of s.matchAll(/\{([^{}]*)\}/g)) {
    if (!vars.includes(m[1])) {
      return { error: vars.length ? `${donde}: {${m[1]}} no es una variable de esta plantilla. Se pueden usar ${vars.map((v) => '{' + v + '}').join(', ')}.` : `${donde}: acá no se pueden usar variables como {${m[1]}}.` };
    }
  }
  if (/[{}]/.test(s.replace(/\{[^{}]*\}/g, ''))) return { error: `${donde}: hay una llave { o } suelta.` };
  return { valor: s };
}

// Valida y normaliza. Devuelve { valor } (sin campos vacíos) o { error } en castellano.
export function validarSeo(v) {
  if (!esObj(v)) return { error: 'Formato inválido: { minProfiles, home, tpl }.' };
  const extra = Object.keys(v).filter((k) => !['minProfiles', 'home', 'tpl'].includes(k));
  if (extra.length) return { error: `Campo desconocido: ${extra[0]}.` };
  const out = {};
  if (v.minProfiles != null && v.minProfiles !== '') {
    const n = Number(v.minProfiles);
    if (!Number.isInteger(n) || n < SEO_MIN_PROFILES.min || n > SEO_MIN_PROFILES.max) return { error: `El mínimo de perfiles para indexar tiene que ser un número entero entre ${SEO_MIN_PROFILES.min} y ${SEO_MIN_PROFILES.max}.` };
    out.minProfiles = n;
  }
  for (const grupo of ['home', 'tpl']) {
    const g = v[grupo];
    if (g == null) continue;
    if (!esObj(g)) return { error: `Formato inválido en ${grupo}.` };
    const malos = Object.keys(g).filter((k) => !SEO_LANGS.includes(k));
    if (malos.length) return { error: `Idioma desconocido: ${malos[0]}. Solo es, en y pt.` };
    for (const lang of SEO_LANGS) {
      const t = g[lang];
      if (t == null) continue;
      if (!esObj(t)) return { error: `Formato inválido en ${grupo} (${IDIOMA[lang]}).` };
      if (grupo === 'home') {
        const ext = Object.keys(t).filter((k) => !SEO_HOME_CAMPOS.includes(k));
        if (ext.length) return { error: `Portada (${IDIOMA[lang]}): campo desconocido ${ext[0]}.` };
        const o = {};
        for (const c of SEO_HOME_CAMPOS) { const r = campo(t[c], 'home', c, lang); if (r.error) return r; if (r.valor) o[c] = r.valor; }
        if (Object.keys(o).length) { out.home = out.home || {}; out.home[lang] = o; }
      } else {
        const ext = Object.keys(t).filter((k) => !SEO_TIPOS.includes(k));
        if (ext.length) return { error: `Plantillas (${IDIOMA[lang]}): tipo de página desconocido ${ext[0]}.` };
        for (const tipo of SEO_TIPOS) {
          const x = t[tipo];
          if (x == null) continue;
          if (!esObj(x)) return { error: `${NOMBRE_TIPO[tipo]} (${IDIOMA[lang]}): formato inválido.` };
          const ext2 = Object.keys(x).filter((k) => !CAMPOS_TIPO[tipo].includes(k));
          if (ext2.length) return { error: `${NOMBRE_TIPO[tipo]} (${IDIOMA[lang]}): campo desconocido ${ext2[0]}.` };
          const o = {};
          for (const c of CAMPOS_TIPO[tipo]) { const r = campo(x[c], tipo, c, lang); if (r.error) return r; if (r.valor) o[c] = r.valor; }
          if (Object.keys(o).length) { out.tpl = out.tpl || {}; out.tpl[lang] = out.tpl[lang] || {}; out.tpl[lang][tipo] = o; }
        }
      }
    }
  }
  return { valor: out };
}

// Texto de un campo: lo guardado gana; vacío o ausente → el de las plantillas por defecto (seo-datos.json).
// path: 'home.title' o 'tpl.place.description'
export function seoTexto(defaults, guardado, path, lang) {
  const parts = path.split('.');
  const g = guardado || {};
  const v = parts[0] === 'home' ? ((g.home || {})[lang] || {})[parts[1]] : (((g.tpl || {})[lang] || {})[parts[1]] || {})[parts[2]];
  if (typeof v === 'string' && v.trim()) return v;
  const d = defaults || {};
  return parts[0] === 'home' ? ((d.home || {})[lang] || {})[parts[1]] || '' : (((d.tpl || {})[lang] || {})[parts[1]] || {})[parts[2]] || '';
}
export const seoMinProfiles = (defaults, guardado) => Math.max(1, Number((guardado && guardado.minProfiles) || (defaults && defaults.minProfiles)) || 1);
