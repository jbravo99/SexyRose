// SEO del sitio público en el servidor: para cada dirección del SPA arma título, descripción, canonical, hreflang
// (es/en/pt), robots, og:* y el código HTTP (404 si el perfil, el lugar o el tipo de salida no existe), con los
// mismos datos que ve el SPA (/api/sitio/estado) y las mismas reglas que mvp/src/urls.js y mvp/src/seo.js
// (plantillas por defecto, slugs, "indexable con al menos N perfiles"). También arma /sitemap.xml.
//
// Las plantillas y los nombres de lugares salen de app/sitio-spa/seo-datos.json, que genera
// app/scripts/build-sitio.py desde mvp/src/seo.js y urls.js (así no hay dos copias de los textos).
// Si cambian las reglas de urls.js/seo.js (slugs, qué es indexable), cambiarlas también acá.
import fs from 'node:fs/promises';

const LANGS = ['es', 'en', 'pt'];
const WORDS = {
  perfil: { es: 'perfil', en: 'profile', pt: 'perfil' },
  cerca: { es: 'cerca', en: 'near-me', pt: 'perto-de-mim' },
  registro: { es: 'registro', en: 'sign-up', pt: 'cadastro' },
  login: { es: 'ingresar', en: 'login', pt: 'entrar' },
};
const STATIC = ['inicio', 'swipe', 'shorts', 'stars', 'links', 'panel', 'admin', 'cuenta', 'chat', '404', 'favoritos', 'compra', 'cliente'];
const GENDER = { key: 'hombres', gender: 'hombre', words: { es: 'hombres', en: 'men', pt: 'homens' } };
const VISIBLES = new Set(['mujer', 'trans']); // lo que ve un visitante nuevo (y Google) sin elegir nada
const NO_INDEX_NO_FOLLOW = new Set(['panel', 'admin', 'cuenta', 'chat', 'favoritos', 'registro', 'login', 'compra', 'cliente']);
const NO_INDEX = new Set(['swipe', 'shorts', 'cerca', 'links', '404']);
const LOCALE = { es: 'es_AR', en: 'en_US', pt: 'pt_BR' };
const HTML_LANG = { es: 'es-AR', en: 'en', pt: 'pt-BR' };
const NO_ENCONTRADA = { es: 'Página no encontrada', en: 'Page not found', pt: 'Página não encontrada' };
const PERFIL_NO = { es: 'Perfil no encontrado', en: 'Profile not found', pt: 'Perfil não encontrado' };
const STARS = { es: 'Stars: perfiles destacados por provincia', en: 'Stars: featured profiles by region', pt: 'Stars: perfis em destaque por região' };
const REGISTRO = {
  title: { es: 'Publicá tu perfil de acompañante', en: 'Publish your companion profile', pt: 'Publique seu perfil' },
  description: { es: 'Publicá tu perfil para salidas en SexyRose: verificación automática, planes mensuales y contacto directo con tus clientes por WhatsApp.', en: 'Publish your profile for outings on SexyRose: automatic verification, monthly plans and direct contact with your clients on WhatsApp.', pt: 'Publique seu perfil para passeios no SexyRose: verificação automática, planos mensais e contato direto com seus clientes pelo WhatsApp.' },
};

// Igual que HH.slugify (core.js)
export const slugify = (s) => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const fill = (t, v) => String(t || '').replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : m)).replace(/\s+/g, ' ').replace(/\s([.,:;])/g, '$1').trim();
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const low = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…'; };
const dia = (v) => { if (!v) return ''; const d = new Date(v); return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10); };
const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Modelo armado una vez por cada estado nuevo (el estado se recalcula como máximo cada 30 s)
function modelo(estado, datos) {
  const t = (text, lang) => {
    if (!lang || lang === 'es' || text == null) return text;
    const hit = datos.dict[String(text).replace(/\s+/g, ' ').trim()];
    return (hit && hit[lang === 'en' ? 0 : 1]) || text;
  };
  const locs = (estado.ubicaciones || []).filter((u) => u.activa !== false).map((u) => ({
    id: u.id, name: u.nombre, padre: u.padre || null,
    level: u.tipo === 'pais' ? 'country' : u.tipo === 'provincia' ? (/^Ciudad (de|Autónoma)/i.test(u.nombre) ? 'city' : 'region') : u.tipo === 'zona' ? 'zone' : 'city',
  }));
  const byId = new Map(locs.map((l) => [l.id, l]));
  const pathOf = (loc) => { const out = []; let cur = loc; let g = 0; while (cur && g++ < 8) { out.unshift(cur); cur = cur.padre ? byId.get(cur.padre) : null; } return out; };
  const cfgOf = (loc) => (datos.lugares || {})[loc.name] || {};
  const locSlug = (loc) => (loc ? cfgOf(loc).slug || slugify(loc.name) : '');
  const locSeoName = (loc, lang) => { if (!loc) return ''; const n = cfgOf(loc).name || loc.name; return t(n, lang); };
  const countrySlug = (loc, lang) => (!lang || lang === 'es' ? locSlug(loc) : slugify(locSeoName(loc, lang)));
  const countries = locs.filter((l) => l.level === 'country');
  const countryBySlug = (s, lang) => countries.find((c) => locSlug(c) === s || (lang && countrySlug(c, lang) === s) || LANGS.some((l) => countrySlug(c, l) === s)) || null;
  const locBySlug = (country, s) => {
    if (!country || !s) return null;
    const inside = locs.filter((l) => l.id !== country.id && pathOf(l)[0] && pathOf(l)[0].id === country.id);
    return inside.find((l) => locSlug(l) === s) || inside.find((l) => slugify(l.name) === s) || null;
  };
  const acts = (estado.categorias || []).filter((c) => c.activa !== false).map((c) => ({ id: c.id, label: c.nombre }));
  const actById = new Map(acts.map((a) => [a.id, a]));
  const actSlug = (a, lang) => (!lang || lang === 'es' ? a.id : slugify(t(a.label, lang)) || a.id);
  const actBySlug = (s, lang) => acts.find((a) => a.id === s || actSlug(a, lang) === s || LANGS.some((l) => actSlug(a, l) === s)) || null;
  const actLabel = (id, lang) => { const a = actById.get(id); return a ? t(a.label, lang) : ''; };

  const perfiles = (estado.perfiles || []).map((p) => {
    const ids = p.ubicacionIds || {};
    const loc = byId.get(ids.ciudad) || byId.get(ids.provincia) || null;
    return { ...p, loc, dentro: new Set(loc ? pathOf(loc).map((l) => l.id) : []), cityName: p.ciudad || p.provincia || '' };
  });
  const bySlug = new Map(perfiles.map((p) => [p.slug, p]));
  const placeProfiles = (loc, actId, g) => perfiles.filter((p) => (g ? (p.genero || 'mujer') === g : VISIBLES.has(p.genero || 'mujer'))
    && p.dentro.has(loc.id) && (!actId || (p.salidas || []).includes(actId)));
  const minProfiles = Math.max(1, Number(datos.defaults.minProfiles) || 1);
  const indexable = (loc, actId, g) => {
    const list = placeProfiles(loc, actId, g);
    if (list.length < minProfiles) return false;
    if (loc.level === 'country' || loc.level === 'city') return true;
    return new Set(list.map((p) => p.cityName)).size >= 2;
  };
  const placeKey = (loc, actId, g) => {
    const country = pathOf(loc)[0];
    if (g) return (loc.level === 'country' ? 'pais.' + locSlug(loc) : 'lugar.' + locSlug(country) + '.' + locSlug(loc)) + '.' + GENDER.key;
    if (loc.level === 'country') return 'pais.' + locSlug(loc);
    return 'lugar.' + locSlug(country) + '.' + locSlug(loc) + (actId ? '.' + actId : '');
  };
  const urlOf = (key, lang) => {
    const pre = lang === 'es' ? '' : '/' + lang;
    const parts = key.split('.'); const enc = encodeURIComponent;
    if (key === 'inicio') return pre + '/';
    if (parts[0] === 'pais' || parts[0] === 'lugar') {
      const c = countryBySlug(parts[1]); let out = pre + '/' + enc(c ? countrySlug(c, lang) : parts[1]);
      if (parts[0] === 'pais' && parts[2] === GENDER.key) out += '/' + GENDER.words[lang];
      if (parts[0] === 'lugar') {
        out += '/' + enc(parts[2] || '');
        if (parts[3] === GENDER.key) out += '/' + GENDER.words[lang];
        else if (parts[3]) { const a = actById.get(parts[3]); out += '/' + enc(a ? actSlug(a, lang) : parts[3]); }
      }
      return out;
    }
    const w = WORDS[parts[0]] ? WORDS[parts[0]][lang] : parts[0];
    return pre + '/' + [w].concat(parts.slice(1).map(enc)).join('/');
  };
  // Dirección → { key, lang } (como HH.parseUrl del SPA, con /favoritos de prod-sitio.js)
  const parse = (pathname) => {
    let segs = String(pathname || '/').split('/').filter(Boolean).map((x) => { try { return decodeURIComponent(x); } catch { return x; } });
    let lang = 'es';
    if (segs[0] && (segs[0].toLowerCase() === 'en' || segs[0].toLowerCase() === 'pt')) lang = segs.shift().toLowerCase();
    if (!segs.length) return { key: 'inicio', lang };
    const first = segs[0].toLowerCase();
    if (segs.length === 1 && (first === 'favoritos' || first === 'favorites')) return { key: 'favoritos', lang };
    const word = Object.keys(WORDS).find((k) => WORDS[k][lang] === first) || Object.keys(WORDS).find((k) => LANGS.some((l) => WORDS[k][l] === first));
    if (word) return { key: [word].concat(segs.slice(1)).join('.'), lang };
    if (STATIC.includes(first)) return { key: [first].concat(segs.slice(1)).join('.'), lang };
    const country = countryBySlug(first, lang);
    if (!country) return { key: '404', lang };
    const isG = (s) => LANGS.some((l) => GENDER.words[l] === String(s || '').toLowerCase());
    if (segs.length === 1) return { key: placeKey(country), lang };
    if (segs.length === 2 && isG(segs[1])) return { key: placeKey(country, null, GENDER.gender), lang };
    const loc = locBySlug(country, segs[1].toLowerCase());
    if (!loc || segs.length > 3) return { key: '404', lang };
    if (segs[2] && isG(segs[2])) return { key: placeKey(loc, null, GENDER.gender), lang };
    let act = null;
    if (segs[2]) { act = actBySlug(segs[2].toLowerCase(), lang); if (!act) return { key: '404', lang }; }
    return { key: placeKey(loc, act && act.id), lang };
  };
  const placeOf = (key) => {
    const parts = key.split('.');
    let g = null;
    if (parts[parts.length - 1] === GENDER.key && parts.length === (parts[0] === 'pais' ? 3 : 4)) { g = GENDER.gender; parts.pop(); }
    if (parts[0] === 'pais' && parts.length > 2) return null;
    const country = countryBySlug(parts[1]); if (!country) return null;
    const loc = parts[0] === 'pais' ? country : locBySlug(country, parts[2]); if (!loc) return null;
    const act = parts[0] === 'lugar' && parts[3] ? actById.get(parts[3]) : null;
    if (parts[3] && !act) return null;
    return { loc, act, g };
  };
  return { t, locs, countries, pathOf, perfiles, bySlug, acts, actLabel, locSeoName, placeProfiles, indexable, placeKey, urlOf, parse, placeOf };
}

export function createSeoSitio({ datosPath, siteUrl = '', estado }) {
  const datos = { v: null, mtimeMs: -1 };
  async function leerDatos() {
    let st; try { st = await fs.stat(datosPath); } catch { datos.v = null; return null; }
    if (datos.v && st.mtimeMs === datos.mtimeMs) return datos.v;
    try { datos.v = JSON.parse(await fs.readFile(datosPath, 'utf8')); datos.mtimeMs = st.mtimeMs; } catch { datos.v = null; }
    return datos.v;
  }
  let cacheM = { estado: null, datos: null, m: null };
  async function actual() {
    const [e, d] = await Promise.all([estado(), leerDatos()]);
    if (!d || !e) return null;
    if (cacheM.estado !== e || cacheM.datos !== d) cacheM = { estado: e, datos: d, m: modelo(e, d) };
    return { m: cacheM.m, d };
  }
  const site = (d) => String(siteUrl || d.defaults.siteUrl || '').replace(/\/$/, '');
  const get = (d, path, lang) => {
    const parts = path.split('.');
    return parts[0] === 'home' ? ((d.defaults.home || {})[lang] || {})[parts[1]] || '' : (((d.defaults.tpl || {})[lang] || {})[parts[1]] || {})[parts[2]] || '';
  };

  // Metadatos de una dirección. null = sin datos (seo-datos.json o la base no están): se sirve la cáscara tal cual.
  async function meta(pathname) {
    const a = await actual(); if (!a) return null;
    const { m: M, d } = a;
    const { key, lang } = M.parse(pathname);
    const top = key.split('.')[0]; const base = site(d);
    const abs = (k, l) => base + M.urlOf(k, l);
    const alts = (k) => { const o = {}; LANGS.forEach((l) => { o[l] = abs(k, l); }); o['x-default'] = abs(k, 'es'); return o; };
    const r = { key, lang, status: 200, title: 'SexyRose', description: get(d, 'home.description', lang), robots: 'index,follow', canonical: abs(key, lang), alternates: null, type: 'website', image: null };
    const no = (titulo) => Object.assign(r, { status: 404, robots: 'noindex,follow', title: titulo[lang] + ' | SexyRose', canonical: null, alternates: null });
    if (top === 'inicio') {
      Object.assign(r, { title: get(d, 'home.title', lang), alternates: alts('inicio') });
    } else if (top === 'pais' || top === 'lugar') {
      const pl = M.placeOf(key);
      if (!pl) return no(NO_ENCONTRADA);
      const n = M.placeProfiles(pl.loc, pl.act && pl.act.id, pl.g).length;
      const type = pl.g ? (pl.loc.level === 'country' ? 'countryMen' : 'placeMen') : pl.act ? 'placeAct' : pl.loc.level === 'country' ? 'country' : 'place';
      const country = M.pathOf(pl.loc)[0] || pl.loc; const al = pl.act ? M.actLabel(pl.act.id, lang) : '';
      const v = { pais: M.locSeoName(country, lang), lugar: M.locSeoName(pl.loc, lang), ciudad: M.locSeoName(pl.loc, lang), actividad: low(al), Actividad: cap(al), cantidad: n };
      r.title = fill(get(d, 'tpl.' + type + '.title', lang), v);
      r.description = clip(fill(get(d, 'tpl.' + type + '.description', lang), v), 160);
      r.alternates = alts(key);
      if (!M.indexable(pl.loc, pl.act && pl.act.id, pl.g)) r.robots = 'noindex,follow';
    } else if (top === 'perfil') {
      const p = M.bySlug.get(key.split('.')[1]);
      if (!p) return no(PERFIL_NO);
      const lugar = p.loc ? M.locSeoName(p.loc, lang) : p.cityName;
      const country = p.loc ? M.pathOf(p.loc)[0] : null;
      const v = { nombre: p.displayName, edad: p.edad || '', lugar, ciudad: lugar, pais: country ? M.locSeoName(country, lang) : (p.pais || ''), salidas: (p.salidas || []).map((x) => low(M.actLabel(x, lang))).filter(Boolean).join(', '), bio: clip(lang === 'en' && p.bioEn ? p.bioEn : p.bio, 110) };
      r.title = fill(get(d, 'tpl.profile.title', lang), v);
      r.description = clip(fill(get(d, 'tpl.profile.description', lang), v), 160);
      r.alternates = alts(key); r.type = 'profile';
      const f = (p.fotos || [])[0]; r.image = f ? (f.urlMini || f.url) : null;
    } else if (top === 'stars') {
      Object.assign(r, { title: STARS[lang] + ' | SexyRose', alternates: alts('stars') });
    } else if (top === 'registro') {
      Object.assign(r, { title: REGISTRO.title[lang] + ' | SexyRose', description: REGISTRO.description[lang], robots: 'noindex,nofollow', alternates: alts('registro') });
    } else if (top === '404') {
      return no(NO_ENCONTRADA);
    } else if (NO_INDEX_NO_FOLLOW.has(top)) {
      Object.assign(r, { robots: 'noindex,nofollow', canonical: null });
    } else if (NO_INDEX.has(top)) {
      r.robots = 'noindex,follow';
      if (top === 'swipe') r.title = 'Swipe | SexyRose';
      if (top === 'shorts') r.title = 'Shorts | SexyRose';
    }
    return r;
  }

  // Etiquetas para el <head> (todo escapado)
  function etiquetas(m) {
    const out = [];
    out.push(`<meta name="description" content="${escAttr(m.description || '')}">`);
    out.push(`<meta name="robots" content="${escAttr(m.robots)}">`);
    if (m.canonical) out.push(`<link rel="canonical" href="${escAttr(m.canonical)}">`);
    if (m.alternates) Object.entries(m.alternates).forEach(([l, u]) => out.push(`<link rel="alternate" hreflang="${l}" href="${escAttr(u)}">`));
    out.push(`<meta property="og:title" content="${escAttr(m.title)}">`);
    out.push(`<meta property="og:description" content="${escAttr(m.description || '')}">`);
    out.push(`<meta property="og:type" content="${m.type}">`);
    out.push('<meta property="og:site_name" content="SexyRose">');
    out.push(`<meta property="og:locale" content="${LOCALE[m.lang]}">`);
    if (m.canonical) out.push(`<meta property="og:url" content="${escAttr(m.canonical)}">`);
    if (m.image && /^https?:\/\//.test(m.image)) out.push(`<meta property="og:image" content="${escAttr(m.image)}">`);
    out.push(`<meta name="twitter:card" content="${m.image ? 'summary_large_image' : 'summary'}">`);
    return out.join('\n');
  }
  // Cáscara con el <head> de esa página: idioma, título y etiquetas en el marcador <!--SR:SEO-->
  function aplicar(html, m) {
    let out = html.replace(/<html lang="[^"]*"/, `<html lang="${HTML_LANG[m.lang]}"`)
      .replace(/<title>[\s\S]*?<\/title>/, `<title>${escXml(m.title)}</title>`)
      .replace(/<meta name="description"[^>]*>/, '');
    out = out.includes('<!--SR:SEO-->') ? out.replace('<!--SR:SEO-->', etiquetas(m)) : out.replace('</head>', etiquetas(m) + '\n</head>');
    return out;
  }

  // Mapa del sitio: portada, países, páginas de hombres, lugares y lugar × salida con perfiles suficientes,
  // perfiles publicados; cada dirección en los tres idiomas con sus alternativas. Caché de 10 minutos.
  let sm = { xml: null, at: 0 };
  async function sitemap(extras = []) {
    if (sm.xml && Date.now() - sm.at < 10 * 60 * 1000) return sm.xml;
    const a = await actual(); if (!a) return null;
    const { m: M, d } = a; const base = site(d);
    const hoy = new Date().toISOString().slice(0, 10);
    const ultimo = (list) => list.map((p) => dia(p.actualizado)).filter(Boolean).sort().pop() || hoy;
    const filas = [];
    const add = (key, lastmod, prio) => {
      const urls = Object.fromEntries(LANGS.map((l) => [l, base + M.urlOf(key, l)]));
      const alt = LANGS.map((o) => `<xhtml:link rel="alternate" hreflang="${o}" href="${escXml(urls[o])}"/>`).join('') + `<xhtml:link rel="alternate" hreflang="x-default" href="${escXml(urls.es)}"/>`;
      LANGS.forEach((l) => filas.push(`  <url><loc>${escXml(urls[l])}</loc><lastmod>${lastmod || hoy}</lastmod><priority>${prio}</priority>${alt}</url>`));
    };
    const pub = M.perfiles;
    add('inicio', ultimo(pub), '1.0');
    for (const x of extras) filas.push(x);
    for (const c of M.countries) {
      if (M.indexable(c)) add(M.placeKey(c), ultimo(M.placeProfiles(c)), '0.8');
      if (M.indexable(c, null, GENDER.gender)) add(M.placeKey(c, null, GENDER.gender), ultimo(M.placeProfiles(c, null, GENDER.gender)), '0.7');
    }
    for (const l of M.locs) {
      if (l.level === 'country' || !M.pathOf(l)[0] || M.pathOf(l)[0].level !== 'country') continue;
      if (M.indexable(l, null, GENDER.gender)) add(M.placeKey(l, null, GENDER.gender), ultimo(M.placeProfiles(l, null, GENDER.gender)), '0.7');
      if (!M.indexable(l)) continue;
      add(M.placeKey(l), ultimo(M.placeProfiles(l)), '0.8');
      for (const act of M.acts) if (M.indexable(l, act.id)) add(M.placeKey(l, act.id), ultimo(M.placeProfiles(l, act.id)), '0.6');
    }
    for (const p of pub) add('perfil.' + p.slug, dia(p.actualizado) || hoy, '0.7');
    sm = { xml: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${filas.join('\n')}\n</urlset>\n`, at: Date.now() };
    return sm.xml;
  }
  return { meta, aplicar, etiquetas, sitemap, invalidar: () => { sm = { xml: null, at: 0 }; } };
}
