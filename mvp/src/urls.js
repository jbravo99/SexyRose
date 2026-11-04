/* SexyRose · Direcciones reales (SEO)
   - Cada sección tiene una dirección legible por idioma:
       /                                  /en/                         /pt/
       /argentina                         /en/argentina                /pt/argentina
       /argentina/buenos-aires            /en/argentina/buenos-aires   …
       /argentina/buenos-aires/cena       /en/argentina/buenos-aires/dinner   /pt/argentina/buenos-aires/jantar
       /perfil/valentina                  /en/profile/valentina        /pt/perfil/valentina
   - Internamente las vistas siguen usando claves con puntos ("perfil.valentina", "lugar.argentina.buenos-aires.cena").
   - Modo "path" (servidor, <html data-routing="path">): la barra de direcciones muestra /argentina/… y el servidor entrega
     cada página ya armada. Modo "hash" (demo en un solo archivo): las mismas direcciones van después de "#" (#/argentina/…).
   - Las claves viejas (#perfil.valentina) siguen funcionando. */
(function () {
  const LANGS = ['es', 'en', 'pt'];
  // Primera palabra de la dirección por idioma (las que no están quedan igual que la clave)
  const WORDS = {
    perfil: { es: 'perfil', en: 'profile', pt: 'perfil' },
    cerca: { es: 'cerca', en: 'near-me', pt: 'perto-de-mim' },
    registro: { es: 'registro', en: 'sign-up', pt: 'cadastro' },
    login: { es: 'ingresar', en: 'login', pt: 'entrar' },
  };
  // Nombre de ubicación más corto para direcciones y títulos (editable en Admin → SEO → Lugares)
  HH.SEO_PLACE_DEFAULTS = { 'Ciudad de Buenos Aires': { slug: 'buenos-aires', name: 'Buenos Aires' }, 'Ciudad de México': { name: 'Ciudad de México' } };
  const slug = (s) => HH.slugify(s || '');
  const seoPlaces = () => ((HH.db && HH.settings().seo) || {}).places || {};

  /* ---------- Ubicaciones y actividades ↔ slugs ---------- */
  const locs = () => (HH.db && HH.db.locations) || [];
  const placeCfg = (loc) => Object.assign({}, HH.SEO_PLACE_DEFAULTS[loc.name] || {}, seoPlaces()[loc.id] || {});
  HH.locSlug = (loc) => (loc ? placeCfg(loc).slug || slug(loc.name) : '');
  HH.locSeoName = (loc, lang) => { if (!loc) return ''; const c = placeCfg(loc); const n = c.name || loc.name; return lang && lang !== 'es' && HH.t ? HH.t(n, lang) : n; };
  HH.countryLocs = () => locs().filter(l => l.level === 'country' && HH.isActiveLoc(l));
  const countrySlug = (loc, lang) => (!lang || lang === 'es') ? HH.locSlug(loc) : slug(HH.locSeoName(loc, lang));
  HH.countryBySlug = (s, lang) => HH.countryLocs().find(c => HH.locSlug(c) === s || (lang && countrySlug(c, lang) === s) || LANGS.some(l => countrySlug(c, l) === s)) || null;
  // Cualquier lugar (provincia, zona o ciudad) dentro de un país, por su slug actual o uno anterior
  HH.locBySlug = (country, s) => {
    if (!country || !s) return null;
    const inside = locs().filter(l => l.id !== country.id && HH.isActiveLoc(l) && HH.locPath(l)[0] && HH.locPath(l)[0].id === country.id);
    return inside.find(l => HH.locSlug(l) === s) || inside.find(l => (placeCfg(l).oldSlugs || []).includes(s) || slug(l.name) === s) || null;
  };
  // Páginas propias de hombres (v56): /argentina/hombres, /argentina/buenos-aires/hombres (en: men, pt: homens).
  // Clave interna: "pais.argentina.hombres" / "lugar.argentina.buenos-aires.hombres".
  HH.GENDER_PAGE = { key: 'hombres', gender: 'hombre', words: { es: 'hombres', en: 'men', pt: 'homens' } };
  const isGenderWord = (s) => LANGS.some(l => HH.GENDER_PAGE.words[l] === String(s || '').toLowerCase());
  HH.isGenderWord = isGenderWord;
  HH.actSlug = (a, lang) => { const act = typeof a === 'string' ? HH.activity(a) : a; if (!act) return ''; return (!lang || lang === 'es') ? act.id : slug(HH.t ? HH.t(act.label, lang) : act.label) || act.id; };
  HH.actBySlug = (s, lang) => HH.ACTIVITIES.find(a => a.id === s || HH.actSlug(a, lang) === s || LANGS.some(l => HH.actSlug(a, l) === s)) || null;
  // Clave interna de la página de un lugar (con actividad opcional)
  // g = 'hombre' arma la clave de la página de hombres (sin tipo de salida)
  HH.placeKey = (loc, act, g) => {
    if (!loc) return 'inicio';
    const path = HH.locPath(loc); const country = path[0];
    if (g) return (loc.level === 'country' ? 'pais.' + HH.locSlug(loc) : 'lugar.' + HH.locSlug(country) + '.' + HH.locSlug(loc)) + '.' + HH.GENDER_PAGE.key;
    if (loc.level === 'country') return act ? 'inicio' : 'pais.' + HH.locSlug(loc);
    return 'lugar.' + HH.locSlug(country) + '.' + HH.locSlug(loc) + (act ? '.' + (typeof act === 'string' ? act : act.id) : '');
  };

  /* ---------- Clave ↔ dirección ---------- */
  HH.urlOf = function (key, lang) {
    lang = lang || HH.lang || 'es'; const pre = lang === 'es' ? '' : '/' + lang;
    const k = String(key || 'inicio').replace(/^#/, ''); const parts = k.split('.');
    const enc = (s) => encodeURIComponent(s);
    if (k === 'inicio' || k === '') return pre + '/';
    if (parts[0] === 'pais' || parts[0] === 'lugar') {
      const c = HH.countryBySlug(parts[1]); const cs = c ? countrySlug(c, lang) : parts[1];
      let out = pre + '/' + enc(cs);
      const gw = HH.GENDER_PAGE.words[lang] || HH.GENDER_PAGE.key;
      if (parts[0] === 'pais' && parts[2] === HH.GENDER_PAGE.key) out += '/' + gw;
      if (parts[0] === 'lugar') { out += '/' + enc(parts[2] || ''); if (parts[3] === HH.GENDER_PAGE.key) out += '/' + gw; else if (parts[3]) out += '/' + enc(HH.actSlug(parts[3], lang) || parts[3]); }
      return out;
    }
    if (k === '404') return pre + '/404';
    const w = WORDS[parts[0]] ? WORDS[parts[0]][lang] : parts[0];
    return pre + '/' + [w].concat(parts.slice(1).map(enc)).join('/');
  };
  // Dirección → { key, lang, canonical } ; canonical=false cuando la dirección es válida pero no es la principal (slug viejo, idioma mezclado)
  HH.parseUrl = function (url) {
    let s = String(url || '/').split('#')[0].split('?')[0];
    let segs = s.split('/').filter(Boolean).map(x => { try { return decodeURIComponent(x); } catch (e) { return x; } });
    let lang = 'es';
    if (segs[0] && (segs[0].toLowerCase() === 'en' || segs[0].toLowerCase() === 'pt')) { lang = segs.shift().toLowerCase(); }
    if (!segs.length) return { key: 'inicio', lang };
    const first = segs[0].toLowerCase();
    const word = Object.keys(WORDS).find(k => WORDS[k][lang] === first) || Object.keys(WORDS).find(k => LANGS.some(l => WORDS[k][l] === first));
    if (word) return { key: [word].concat(segs.slice(1)).join('.'), lang };
    const STATIC = ['inicio', 'swipe', 'shorts', 'stars', 'links', 'panel', 'admin', 'cuenta', 'chat', '404'];
    if (STATIC.includes(first)) return { key: [first].concat(segs.slice(1)).join('.'), lang };
    const country = HH.db ? HH.countryBySlug(first, lang) : null;
    if (!country) return { key: '404', lang };
    if (segs.length === 1) return { key: 'pais.' + HH.locSlug(country), lang };
    if (segs.length === 2 && isGenderWord(segs[1])) return { key: HH.placeKey(country, null, HH.GENDER_PAGE.gender), lang };
    const loc = HH.locBySlug(country, segs[1].toLowerCase());
    if (!loc || segs.length > 3) return { key: '404', lang };
    if (segs[2] && isGenderWord(segs[2])) return { key: HH.placeKey(loc, null, HH.GENDER_PAGE.gender), lang };
    let act = null;
    if (segs[2]) { act = HH.actBySlug(segs[2].toLowerCase(), lang); if (!act) return { key: '404', lang }; }
    const key = HH.placeKey(loc, act);
    return { key, lang };
  };
  HH.keyOf = function (t) {
    t = String(t == null ? '' : t).trim();
    if (!t || t === '#' || t === '#/') return 'inicio';
    if (t.startsWith('#/')) return HH.parseUrl(t.slice(1)).key;
    if (t.startsWith('/')) return HH.parseUrl(t).key;
    return t.replace(/^#/, '') || 'inicio';
  };
  // Dirección que se ve en la barra (sin el #)
  HH.locationUrl = () => HH.ROUTING === 'path' ? location.pathname : (location.hash.startsWith('#/') ? location.hash.slice(1) : null);
  HH.keyFromLocation = function () {
    const u = HH.locationUrl();
    if (u != null) return HH.parseUrl(u).key;
    return (location.hash || '#inicio').replace(/^#/, '') || 'inicio';
  };
  HH.urlLang = () => { const u = HH.locationUrl(); return u == null ? null : HH.parseUrl(u).lang; };
  // El idioma de la dirección manda (así Google ve cada versión en su idioma)
  HH.syncLangFromUrl = function () {
    const l = HH.urlLang(); if (!l || l === HH.lang || !HH.LANGS || !HH.LANGS[l]) return false;
    HH.lang = l; document.documentElement.lang = l; return true;
  };
  HH.href = (target, lang) => { const u = HH.urlOf(HH.keyOf(target), lang); return HH.ROUTING === 'path' ? u : '#' + u; };
  // Dirección completa para compartir (perfil, links)
  HH.absUrl = (target, lang) => {
    const site = ((HH.db && HH.settings().seo) || {}).siteUrl;
    if (HH.ROUTING === 'path') return (site || location.origin).replace(/\/$/, '') + HH.urlOf(HH.keyOf(target), lang);
    return location.href.split('#')[0] + '#' + HH.urlOf(HH.keyOf(target), lang);
  };
  // Todos los enlaces internos con dirección real (los buscadores siguen href, no data-go)
  HH.linkify = (root) => { if (!root || !root.querySelectorAll) return; root.querySelectorAll('a[data-go]').forEach(a => { try { a.setAttribute('href', HH.href(a.getAttribute('data-go'))); } catch (e) { /* */ } }); };
  if (HH.ROUTING === 'path') window.addEventListener('popstate', () => HH.render());
})();
