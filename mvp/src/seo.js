/* SexyRose · SEO
   - Páginas por país y lugar (provincia, zona o ciudad), con H1, texto, perfiles y enlaces internos. Sin páginas por
     actividad: el sitio es de anuncios y no menciona qué se ofrece (las direcciones viejas lugar + actividad van al lugar).
   - Título, descripción, canonical, hreflang (es/en/pt), robots y datos estructurados en cada página.
   - Bloque SEO al pie de la portada (texto + enlaces a ciudades y búsquedas frecuentes).
   - Admin → SEO: textos de la portada y plantillas por idioma, nombre/slug/texto propio por lugar, mapa del sitio.
   - HH.seoSitemap() y HH.seoMeta() los usa también el servidor (ssr/) para entregar cada página ya armada. */
(function () {
  const esc = HH.esc, icon = HH.icon;
  const LANGS = ['es', 'en', 'pt'];
  const L = (es, en, pt) => ({ es, en, pt })[HH.lang] || es;
  const menLabel = (lang) => ({ es: 'Hombres', en: 'Men', pt: 'Homens' })[lang || HH.lang] || 'Hombres';

  /* ---------- Textos por defecto (editables en Admin → SEO) ---------- */
  HH.SEO_DEFAULTS = {
    siteUrl: 'https://sexyrose.net', minProfiles: 1,
    home: {
      es: {"title": "Escorts y acompañantes en Argentina | SexyRose", "description": "Avisos de escorts y acompañantes en Capital Federal, GBA y todo el país. Contacto directo con cada anunciante por WhatsApp o Telegram.", "h1": "", "blockTitle": "Avisos de escorts y acompañantes en tu ciudad", "blockText": "SexyRose es un sitio de avisos de escorts y acompañantes. Cada anunciante publica su aviso con su ciudad, sus idiomas y su tarifa, y es responsable de lo que publica. El contacto es directo con cada anunciante por WhatsApp o Telegram; SexyRose no interviene.\n\nBuscá por ciudad: Capital Federal y sus barrios, Zona Norte, Zona Oeste y Zona Sur del GBA y el resto del país. Si estás de viaje, también aparecen quienes están de visita."},
      en: {"title": "Escorts and companions in Argentina | SexyRose", "description": "Escort and companion ads in Buenos Aires and across Argentina. Contact each advertiser directly on WhatsApp or Telegram.", "h1": "Companions in your *city*.", "blockTitle": "Escort and companion ads in your city", "blockText": "SexyRose is an escort and companion ads site. Each advertiser publishes their own ad with their city, languages and rates, and is responsible for what they publish. You contact each advertiser directly on WhatsApp or Telegram; SexyRose does not take part.\n\nSearch by city: Buenos Aires (Capital Federal) and its neighborhoods, Greater Buenos Aires (North, West and South) and the rest of the country. If you are traveling, people who are visiting show up too."},
      pt: {"title": "Acompanhantes e escorts na Argentina | SexyRose", "description": "Anúncios de acompanhantes e escorts em Buenos Aires e em toda a Argentina. Contato direto com cada anunciante pelo WhatsApp ou Telegram.", "h1": "Acompanhantes na sua *cidade*.", "blockTitle": "Anúncios de acompanhantes e escorts na sua cidade", "blockText": "O SexyRose é um site de anúncios de acompanhantes e escorts. Cada anunciante publica o seu anúncio com a cidade, os idiomas e o valor, e é responsável pelo que publica. O contato é direto com cada anunciante pelo WhatsApp ou Telegram; o SexyRose não intervém.\n\nBusque por cidade: Buenos Aires (Capital Federal) e seus bairros, a Grande Buenos Aires (zonas Norte, Oeste e Sul) e o resto do país. Se estiver viajando, quem está de visita também aparece."},
    },
    tpl: {
      es: {
        country: {"title": "Escorts y acompañantes en {pais} | SexyRose", "description": "Avisos de escorts y acompañantes en {pais}: {cantidad} perfiles con fotos y contacto directo por WhatsApp o Telegram. Buscá por ciudad.", "h1": "Escorts y acompañantes en {pais}", "intro": "Avisos de escorts y acompañantes en {pais}. Elegí una ciudad, mirá los perfiles y contactá directo a quien elijas por WhatsApp o Telegram."},
        place: {"title": "Escorts y acompañantes en {lugar} | SexyRose", "description": "Avisos de escorts y acompañantes en {lugar}: {cantidad} perfiles con fotos y contacto directo por WhatsApp o Telegram.", "h1": "Escorts y acompañantes en {lugar}", "intro": "Avisos de escorts y acompañantes en {lugar}. Mirá los perfiles y contactá directo a quien elijas por WhatsApp o Telegram."},
        countryMen: {"title": "Escorts hombres y acompañantes en {pais} | SexyRose", "description": "Avisos de escorts hombres y acompañantes en {pais}: {cantidad} perfiles con fotos y contacto directo por WhatsApp o Telegram. Buscá por ciudad.", "h1": "Escorts hombres y acompañantes en {pais}", "intro": "Avisos de escorts hombres y acompañantes en {pais}. Mirá los perfiles y contactá directo a quien elijas por WhatsApp o Telegram."},
        placeMen: {"title": "Escorts hombres y acompañantes en {lugar} | SexyRose", "description": "Avisos de escorts hombres y acompañantes en {lugar}: {cantidad} perfiles con fotos y contacto directo por WhatsApp o Telegram.", "h1": "Escorts hombres y acompañantes en {lugar}", "intro": "Avisos de escorts hombres y acompañantes en {lugar}. Mirá los perfiles y contactá directo a quien elijas por WhatsApp o Telegram."},
        profile: {"title": "{nombre}, escort en {lugar} | SexyRose", "description": "{nombre}, {edad} años, escort y acompañante en {lugar}. {bio}"},
      },
      en: {
        country: {"title": "Escorts and companions in {pais} | SexyRose", "description": "Escort and companion ads in {pais}: {cantidad} profiles with photos and direct contact on WhatsApp or Telegram. Search by city.", "h1": "Escorts and companions in {pais}", "intro": "Escort and companion ads in {pais}. Choose a city, browse the profiles and contact whoever you choose directly on WhatsApp or Telegram."},
        place: {"title": "Escorts and companions in {lugar} | SexyRose", "description": "Escort and companion ads in {lugar}: {cantidad} profiles with photos and direct contact on WhatsApp or Telegram.", "h1": "Escorts and companions in {lugar}", "intro": "Escort and companion ads in {lugar}. Browse the profiles and contact whoever you choose directly on WhatsApp or Telegram."},
        countryMen: {"title": "Male escorts and companions in {pais} | SexyRose", "description": "Male escort and companion ads in {pais}: {cantidad} profiles with photos and direct contact on WhatsApp or Telegram. Search by city.", "h1": "Male escorts and companions in {pais}", "intro": "Male escort and companion ads in {pais}. Browse the profiles and contact whoever you choose directly on WhatsApp or Telegram."},
        placeMen: {"title": "Male escorts and companions in {lugar} | SexyRose", "description": "Male escort and companion ads in {lugar}: {cantidad} profiles with photos and direct contact on WhatsApp or Telegram.", "h1": "Male escorts and companions in {lugar}", "intro": "Male escort and companion ads in {lugar}. Browse the profiles and contact whoever you choose directly on WhatsApp or Telegram."},
        profile: {"title": "{nombre}, escort in {lugar} | SexyRose", "description": "{nombre}, {edad}, escort and companion in {lugar}. {bio}"},
      },
      pt: {
        country: {"title": "Acompanhantes e escorts na {pais} | SexyRose", "description": "Anúncios de acompanhantes e escorts na {pais}: {cantidad} perfis com fotos e contato direto pelo WhatsApp ou Telegram. Busque por cidade.", "h1": "Acompanhantes e escorts na {pais}", "intro": "Anúncios de acompanhantes e escorts na {pais}. Escolha uma cidade, veja os perfis e fale direto com quem escolher pelo WhatsApp ou Telegram."},
        place: {"title": "Acompanhantes e escorts em {lugar} | SexyRose", "description": "Anúncios de acompanhantes e escorts em {lugar}: {cantidad} perfis com fotos e contato direto pelo WhatsApp ou Telegram.", "h1": "Acompanhantes e escorts em {lugar}", "intro": "Anúncios de acompanhantes e escorts em {lugar}. Veja os perfis e fale direto com quem escolher pelo WhatsApp ou Telegram."},
        countryMen: {"title": "Acompanhantes homens e escorts na {pais} | SexyRose", "description": "Anúncios de acompanhantes homens e escorts na {pais}: {cantidad} perfis com fotos e contato direto pelo WhatsApp ou Telegram. Busque por cidade.", "h1": "Acompanhantes homens e escorts na {pais}", "intro": "Anúncios de acompanhantes homens e escorts na {pais}. Veja os perfis e fale direto com quem escolher pelo WhatsApp ou Telegram."},
        placeMen: {"title": "Acompanhantes homens e escorts em {lugar} | SexyRose", "description": "Anúncios de acompanhantes homens e escorts em {lugar}: {cantidad} perfis com fotos e contato direto pelo WhatsApp ou Telegram.", "h1": "Acompanhantes homens e escorts em {lugar}", "intro": "Anúncios de acompanhantes homens e escorts em {lugar}. Veja os perfis e fale direto com quem escolher pelo WhatsApp ou Telegram."},
        profile: {"title": "{nombre}, acompanhante em {lugar} | SexyRose", "description": "{nombre}, {edad} anos, acompanhante e escort em {lugar}. {bio}"},
      },
    },
  };
  HH.SEO_VARS = ['{pais}', '{lugar}', '{cantidad}', '{nombre}', '{edad}', '{bio}'];
  const cfg = () => { const st = HH.settings(); if (!st.seo) st.seo = {}; return st.seo; };
  const get = (path, lang) => {
    // path: 'home.title' o 'tpl.place.h1'; lo guardado gana, si está vacío se usa el texto por defecto
    const parts = path.split('.'); const saved = parts[0] === 'home' ? (cfg().home || {})[lang] : ((cfg().tpl || {})[lang] || {})[parts[1]];
    const v = saved ? saved[parts[parts.length - 1]] : undefined;
    if (typeof v === 'string' && v.trim()) return v;
    return parts[0] === 'home' ? (HH.SEO_DEFAULTS.home[lang] || {})[parts[1]] || '' : ((HH.SEO_DEFAULTS.tpl[lang] || {})[parts[1]] || {})[parts[2]] || '';
  };
  HH.seoGet = get;
  HH.seoSite = () => String(cfg().siteUrl == null ? HH.SEO_DEFAULTS.siteUrl : cfg().siteUrl).trim().replace(/\/$/, '');
  HH.seoMin = () => Math.max(1, Number(cfg().minProfiles) || HH.SEO_DEFAULTS.minProfiles);
  // "1 perfiles" → "1 perfil" (las plantillas dicen "{cantidad} perfiles"); igual en app/lib/seo-sitio.js
  const UNO = { perfiles: 'perfil', perfis: 'perfil', profiles: 'profile', avisos: 'aviso', 'anúncios': 'anúncio', ads: 'ad' };
  const uno = (s) => s.replace(/(^|[^\d.,])1 (perfiles|perfis|profiles|avisos|anúncios|ads)(?![\wáéíóúñ])/g, (m, a, w) => a + '1 ' + UNO[w]);
  const fill = (t, v) => uno(String(t || '').replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : m)).replace(/\s+/g, ' ').replace(/\s([.,:;])/g, '$1').trim());
  const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  const low = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
  const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…'; };
  HH.seoFill = fill;

  /* ---------- Datos ---------- */
  const locs = () => HH.db.locations || [];
  const countryOf = (loc) => HH.locPath(loc)[0] || loc;
  // g = 'hombre' en las páginas de hombres; sin g, los tipos que ve el visitante (por defecto mujeres y trans; así las ve Google)
  const byGender = (g) => g ? HH.rankList(HH.publishedProfiles().filter(p => (p.gender || 'mujer') === g)) : HH.rankedProfiles();
  HH.placeProfiles = (loc, actId, g) => byGender(g).filter(p => HH.inCity(p, loc.name));
  // Una provincia o zona con perfiles en una sola ciudad repetiría la página de esa ciudad: queda fuera de Google
  HH.seoIndexable = (loc, actId, g) => {
    const list = HH.placeProfiles(loc, actId, g);
    if (list.length < HH.seoMin()) return false;
    if (loc.level === 'country' || loc.level === 'city') return true;
    const cities = new Set(list.map(p => { const t = HH.upcomingTrip(p); return t && HH.placeContains(loc.name, t.city) && !HH.placeContains(loc.name, p.city) ? t.city : p.city; }));
    return cities.size >= 2;
  };
  const countAll = (loc, actId, g) => HH.placeProfiles(loc, actId, g).length;
  const varsFor = (loc, act, n, lang) => ({ pais: HH.locSeoName(countryOf(loc), lang), lugar: HH.locSeoName(loc, lang), ciudad: HH.locSeoName(loc, lang), cantidad: n });
  const placeIntro = (loc, lang) => { const pc = (cfg().places || {})[loc.id]; return pc && pc.intro && pc.intro[lang] && pc.intro[lang].trim() ? pc.intro[lang] : ''; };
  // Lugar de una clave "pais.x" / "lugar.x.y" (una clave vieja "lugar.x.y.actividad" devuelve el lugar con old: true)
  HH.seoPlaceOf = (key) => {
    const parts = String(key || '').split('.');
    if (parts[0] !== 'pais' && parts[0] !== 'lugar') return null;
    let g = null;
    if (parts[parts.length - 1] === HH.GENDER_PAGE.key && parts.length === (parts[0] === 'pais' ? 3 : 4)) { g = HH.GENDER_PAGE.gender; parts.pop(); }
    if (parts[0] === 'pais' && parts.length > 2) return null;
    const country = HH.countryBySlug(parts[1]); if (!country) return null;
    const loc = parts[0] === 'pais' ? country : HH.locBySlug(country, parts[2]); if (!loc) return null;
    return { country, loc, act: null, g, old: !!(parts[0] === 'lugar' && parts[3]) };
  };

  /* ---------- Metadatos de cada página ---------- */
  const PRIVATE = ['panel', 'admin', 'cuenta', 'chat', 'favoritos', 'compra', 'cliente'];
  const NOINDEX = ['swipe', 'shorts', 'cerca', 'links', 'login', '404'];
  HH.seoMeta = function (key, lang) {
    lang = lang || HH.lang || 'es'; key = key || 'inicio';
    const top = key.split('.')[0]; const site = HH.seoSite();
    const abs = (k, l) => site + HH.urlOf(k, l);
    const m = { key, lang, title: 'SexyRose', description: get('home.description', lang), robots: 'index,follow', status: 200, canonical: abs(key, lang), alternates: null, ld: [], type: 'website' };
    const alts = (k) => { const o = {}; LANGS.forEach(l => { o[l] = abs(k, l); }); o['x-default'] = abs(k, 'es'); return o; };
    const crumbsLd = (items) => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: it.url })) });
    const homeName = { es: 'Inicio', en: 'Home', pt: 'Início' }[lang];
    if (top === 'inicio') {
      m.title = get('home.title', lang); m.description = get('home.description', lang); m.alternates = alts('inicio');
      // Sin SearchAction: el sitio no tiene una dirección de búsqueda por texto
      m.ld.push({ '@context': 'https://schema.org', '@type': 'WebSite', name: 'SexyRose', url: abs('inicio', lang), inLanguage: lang, description: m.description, publisher: { '@type': 'Organization', name: 'SexyRose', url: abs('inicio', 'es') } });
      m.ld.push({ '@context': 'https://schema.org', '@type': 'Organization', name: 'SexyRose', url: abs('inicio', 'es'), logo: site + '/icon-512.png' });
    } else if (top === 'pais' || top === 'lugar') {
      const pl = HH.seoPlaceOf(key);
      if (!pl) { m.status = 404; m.robots = 'noindex,follow'; m.title = { es: 'Página no encontrada', en: 'Page not found', pt: 'Página não encontrada' }[lang] + ' | SexyRose'; return m; }
      if (pl.old) { m.status = 301; m.robots = 'noindex,follow'; m.canonical = abs(HH.placeKey(pl.loc), lang); return m; }
      const n = countAll(pl.loc, null, pl.g); const type = pl.g ? (pl.loc.level === 'country' ? 'countryMen' : 'placeMen') : pl.loc.level === 'country' ? 'country' : 'place';
      const v = varsFor(pl.loc, pl.act, n, lang);
      m.title = fill(get('tpl.' + type + '.title', lang), v); m.description = clip(fill(get('tpl.' + type + '.description', lang), v), 160);
      m.alternates = alts(key); if (!HH.seoIndexable(pl.loc, null, pl.g)) m.robots = 'noindex,follow';
      const path = HH.locPath(pl.loc);
      m.ld.push(crumbsLd([{ name: homeName, url: abs('inicio', lang) }].concat(path.map(l => ({ name: HH.locSeoName(l, lang), url: abs(HH.placeKey(l), lang) }))).concat(pl.g ? [{ name: menLabel(lang), url: abs(key, lang) }] : [])));
      const list = HH.placeProfiles(pl.loc, null, pl.g).slice(0, 24);
      if (list.length) m.ld.push({ '@context': 'https://schema.org', '@type': 'ItemList', name: fill(get('tpl.' + type + '.h1', lang), v), numberOfItems: list.length, itemListElement: list.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: abs('perfil.' + p.slug, lang), name: p.displayName })) });
    } else if (top === 'perfil') {
      const p = HH.profileBySlug(key.split('.')[1]);
      const pub = p && HH.publishedProfiles().includes(p);
      if (!p) { m.status = 404; m.robots = 'noindex,follow'; m.title = { es: 'Perfil no encontrado', en: 'Profile not found', pt: 'Perfil não encontrado' }[lang] + ' | SexyRose'; return m; }
      const loc = HH.locByName(p.homeCity || p.city) || HH.locByName(p.city);
      const v = { nombre: p.displayName, edad: p.age || '', lugar: loc ? HH.locSeoName(loc, lang) : p.city, ciudad: loc ? HH.locSeoName(loc, lang) : p.city, pais: loc ? HH.locSeoName(countryOf(loc), lang) : (p.country || ''), bio: clip(HH.pText ? (lang === 'en' && p.bioEn ? p.bioEn : p.bio) : p.bio, 110) };
      m.title = fill(get('tpl.profile.title', lang), v); m.description = clip(fill(get('tpl.profile.description', lang), v), 160);
      m.alternates = alts(key); m.type = 'profile'; if (!pub) { m.robots = 'noindex,follow'; m.status = 404; }
      const path = loc ? HH.locPath(loc).filter(HH.isActiveLoc) : [];
      const foto = (p.photos || []).find(x => /^https?:\/\//.test(String(x || ''))) || undefined;
      m.ld.push({ '@context': 'https://schema.org', '@type': 'ProfilePage', url: abs(key, lang), name: m.title, inLanguage: lang, dateModified: p.updatedAt || undefined, mainEntity: { '@type': 'Person', name: p.displayName, image: foto, homeLocation: loc ? { '@type': 'Place', name: HH.locSeoName(loc, lang) } : undefined, knowsLanguage: p.languages || undefined } });
      m.ld.push(crumbsLd([{ name: homeName, url: abs('inicio', lang) }].concat(path.map(l => ({ name: HH.locSeoName(l, lang), url: abs(HH.placeKey(l), lang) }))).concat([{ name: p.displayName, url: abs(key, lang) }])));
    } else if (top === 'stars') {
      m.title = { es: 'Stars: perfiles destacados por provincia', en: 'Stars: featured profiles by region', pt: 'Stars: perfis em destaque por região' }[lang] + ' | SexyRose'; m.alternates = alts('stars');
    } else if (top === 'registro') {
      m.robots = 'noindex,nofollow'; // como en el servidor (lib/seo-sitio.js)
      m.title = { es: 'Publicá tu perfil de acompañante', en: 'Publish your companion profile', pt: 'Publique seu perfil' }[lang] + ' | SexyRose';
      m.description = { es: 'Publicá tu aviso en SexyRose: planes mensuales y contacto directo por WhatsApp o Telegram.', en: 'Publish your ad on SexyRose: monthly plans and direct contact on WhatsApp or Telegram.', pt: 'Publique seu anúncio no SexyRose: planos mensais e contato direto pelo WhatsApp ou Telegram.' }[lang];
      m.alternates = alts('registro');
    } else if (PRIVATE.includes(top)) { m.robots = 'noindex,nofollow'; m.canonical = null; }
    else if (NOINDEX.includes(top)) { m.robots = 'noindex,follow'; if (top === '404') { m.status = 404; m.title = { es: 'Página no encontrada', en: 'Page not found', pt: 'Página não encontrada' }[lang] + ' | SexyRose'; } if (top === 'swipe') m.title = 'Swipe | SexyRose'; if (top === 'shorts') m.title = 'Shorts | SexyRose'; }
    return m;
  };
  // Aplica los metadatos al <head>
  const setMeta = (attr, name, content) => { let el = document.head.querySelector(`meta[${attr}="${name}"]`); if (content == null || content === '') { if (el) el.remove(); return; } if (!el) { el = document.createElement('meta'); el.setAttribute(attr, name); document.head.appendChild(el); } el.setAttribute('content', content); };
  HH.applySeoHead = function (m) {
    document.title = m.title; document.documentElement.lang = m.lang;
    setMeta('name', 'description', m.description); setMeta('name', 'robots', m.robots);
    setMeta('property', 'og:title', m.title); setMeta('property', 'og:description', m.description); setMeta('property', 'og:type', m.type); setMeta('property', 'og:site_name', 'SexyRose');
    setMeta('property', 'og:locale', { es: 'es_AR', en: 'en_US', pt: 'pt_BR' }[m.lang]); setMeta('property', 'og:url', m.canonical && /^https?:/.test(m.canonical) ? m.canonical : null);
    document.head.querySelectorAll('link[rel="canonical"],link[rel="alternate"][hreflang],script[data-hh-ld]').forEach(x => x.remove());
    // canonical y hreflang solo con dirección absoluta (en la demo, cuando se carga la URL del sitio en Admin → SEO)
    if (m.canonical && /^https?:/.test(m.canonical)) { const c = document.createElement('link'); c.rel = 'canonical'; c.href = m.canonical; document.head.appendChild(c); }
    if (m.alternates && /^https?:/.test(m.alternates.es)) Object.entries(m.alternates).forEach(([l, u]) => { const a = document.createElement('link'); a.rel = 'alternate'; a.hreflang = l; a.href = u; document.head.appendChild(a); });
    (m.ld || []).forEach(o => { const s = document.createElement('script'); s.type = 'application/ld+json'; s.setAttribute('data-hh-ld', ''); s.textContent = JSON.stringify(o).replace(/</g, '\\u003c'); document.head.appendChild(s); });
  };
  let firstPaint = true;
  document.addEventListener('hh:rendered', () => {
    // Con el servidor real: si la persona ya eligió idioma antes, se la lleva a esa versión (Google nunca tiene uno guardado)
    if (firstPaint) { firstPaint = false; if (HH.ROUTING === 'path' && !HH.SSR) { let saved = null; try { saved = localStorage.getItem('hh_lang'); } catch (e) { /* */ } if (saved && saved !== HH.lang && HH.LANGS[saved]) { HH.setLang(saved); return; } } }
    try {
      const key = HH.current && HH.current.path || 'inicio'; const m = HH.seoMeta(key);
      HH.applySeoHead(m); HH.seoCurrent = m;
      // Dirección vieja (slug anterior) → reemplaza por la actual
      const u = HH.locationUrl && HH.locationUrl(); const want = HH.urlOf(key);
      if (u != null && m.status === 200 && /^(pais|lugar)\./.test(key) && u.replace(/\/$/, '') !== want.replace(/\/$/, '')) { if (HH.ROUTING === 'path') history.replaceState(null, '', want); else history.replaceState(null, '', '#' + want); }
      langHint();
    } catch (e) { console.error(e); }
  });

  /* ---------- Sugerencia de idioma (solo en el servidor real: nunca se redirige solo, así Google ve cada versión) ---------- */
  function langHint() {
    const old = document.getElementById('hhLangHint'); if (old) old.remove();
    if (HH.ROUTING !== 'path' || HH.SSR) return;
    let saved = null, dismissed = null; try { saved = localStorage.getItem('hh_lang'); dismissed = sessionStorage.getItem('hh_lang_hint'); } catch (e) { /* */ }
    if (saved || dismissed) return;
    const nav = (navigator.languages || [navigator.language || '']).map(x => String(x).slice(0, 2).toLowerCase()).find(x => LANGS.includes(x));
    if (!nav || nav === HH.lang) return;
    const txt = { es: 'Ver esta página en español', en: 'View this page in English', pt: 'Ver esta página em português' }[nav];
    const bar = document.createElement('div'); bar.id = 'hhLangHint'; bar.className = 'lang-hint'; bar.setAttribute('data-noi18n', '');
    bar.innerHTML = `<div class="container row between nowrap" style="gap:8px"><a href="${HH.href(HH.currentHash(), nav)}" data-lang-to="${nav}">${icon('languages')} ${txt}</a><button type="button" class="icon-btn sm" data-action="seoHintClose" aria-label="Cerrar">${icon('x')}</button></div>`;
    const app = document.getElementById('app'); app.parentNode.insertBefore(bar, app);
  }
  document.addEventListener('click', (ev) => { const a = ev.target.closest('[data-lang-to]'); if (!a) return; ev.preventDefault(); HH.setLang(a.dataset.langTo); });

  /* ---------- Páginas de país y lugar ---------- */
  const S = HH.ui.seoView = HH.ui.seoView || {};
  const crumbsHtml = (loc, act, g) => {
    const items = [`<a href="#inicio" data-go="#inicio">${L('Inicio', 'Home', 'Início')}</a>`];
    HH.locPath(loc).forEach((l, i, arr) => { const last = i === arr.length - 1 && !act && !g; items.push(last ? `<span aria-current="page">${esc(HH.locSeoName(l, HH.lang))}</span>` : `<a href="#${HH.placeKey(l)}" data-go="#${HH.placeKey(l)}">${esc(HH.locSeoName(l, HH.lang))}</a>`); });
    if (g) items.push(`<span aria-current="page">${esc(menLabel(HH.lang))}</span>`);
    return `<nav class="pf-crumbs" aria-label="${L('Ubicación', 'Location', 'Localização')}" data-noi18n>${items.join(icon('chevronRight'))}</nav>`;
  };
  const linkChip = (key, label, n, on) => `<a class="chip${on ? ' active' : ''}" href="#${key}" data-go="#${key}"${on ? ' aria-current="page"' : ''}>${esc(label)}${n != null ? ` <span class="num muted">${n}</span>` : ''}</a>`;
  function landing(key) {
    const pl = HH.seoPlaceOf(key); const lang = HH.lang;
    if (!pl) return notFound();
    // Dirección vieja de lugar + actividad: se reemplaza por la del lugar (ya no hay páginas por actividad)
    if (pl.old) { setTimeout(() => HH.go('#' + HH.placeKey(pl.loc), { replace: true }), 0); return ''; }
    const { loc, g } = pl; const act = null;
    const all = HH.placeProfiles(loc, null, g); const n = all.length;
    const type = g ? (loc.level === 'country' ? 'countryMen' : 'placeMen') : loc.level === 'country' ? 'country' : 'place';
    const v = varsFor(loc, null, countAll(loc, null, g), lang);
    const h1 = fill(get('tpl.' + type + '.h1', lang), v); const intro = (!g && placeIntro(loc, lang)) || fill(get('tpl.' + type + '.intro', lang), v);
    if (S.key !== key) { S.key = key; S.shown = 24; }
    const shown = all.slice(0, S.shown);
    // Lugares dentro: una provincia o zona con una sola ciudad se reemplaza por esa ciudad (es la página que está en Google)
    const expand = (l) => (l.level === 'city' || HH.seoIndexable(l, null, g)) ? [l] : locs().filter(x => x.parentId === l.id && HH.isActiveLoc(x)).flatMap(expand);
    const kids = [...new Map(locs().filter(l => l.parentId === loc.id && HH.isActiveLoc(l)).flatMap(expand).map(l => [l.id, l])).values()].map(l => ({ l, n: countAll(l, null, g) })).filter(x => x.n).sort((a, b) => b.n - a.n || a.l.name.localeCompare(b.l.name));
    const parent = HH.locParent(loc);
    const sibs = parent ? [...new Map(locs().filter(l => l.parentId === parent.id && l.id !== loc.id && HH.isActiveLoc(l)).flatMap(expand).filter(l => l.id !== loc.id).map(l => [l.id, l])).values()].map(l => ({ l, n: countAll(l, null, g) })).filter(x => x.n).sort((a, b) => b.n - a.n).slice(0, 12) : [];
    // Enlace entre la página general y la de hombres del mismo lugar
    const otherN = g ? countAll(loc) : countAll(loc, null, HH.GENDER_PAGE.gender);
    const otherHtml = !otherN ? '' : `<div class="seo-sub" data-noi18n><div class="chips">${g ? linkChip(HH.placeKey(loc), L('Mujeres y trans en ', 'Women and trans in ', 'Mulheres e trans em ') + HH.locSeoName(loc, lang), otherN) : linkChip(HH.placeKey(loc, null, HH.GENDER_PAGE.gender), menLabel(lang) + L(' en ', ' in ', ' em ') + HH.locSeoName(loc, lang), otherN)}</div></div>`;
    const placeName = HH.locSeoName(loc, lang);
    return `<div class="container seo-page stack-lg">
      ${crumbsHtml(loc, act, g)}
      <header class="seo-head" data-noi18n><h1>${esc(h1)}</h1><p class="lead">${esc(intro)}</p><p class="small muted">${n} ${n === 1 ? L('perfil', 'profile', 'perfil') : L('perfiles', 'profiles', 'perfis')} · ${L('incluye a quienes están de visita', 'includes visitors', 'inclui quem está de visita')}</p></header>
      ${otherHtml}
      ${n ? `<section aria-label="${L('Perfiles', 'Profiles', 'Perfis')}"><div class="tier-grid lg">${shown.map(p => HH.pcard(p)).join('')}</div>${n > shown.length ? `<div class="row" style="justify-content:center;margin-top:12px"><button type="button" class="btn ghost sm" data-action="seoMore" data-noi18n>${L('Ver más', 'Show more', 'Ver mais')} <span class="small muted num">${shown.length} / ${n}</span></button></div>` : ''}</section>`
        : `<div class="empty" data-noi18n>${icon('search')}<h4>${L('Todavía no hay perfiles acá', 'No profiles here yet', 'Ainda não há perfis aqui')}</h4>${parent ? `<a class="btn secondary sm" href="#${HH.placeKey(parent, null, g)}" data-go="#${HH.placeKey(parent, null, g)}">${L('Ver ', 'See ', 'Ver ') + esc(HH.locSeoName(parent, lang))}</a>` : ''}</div>`}
      ${kids.length ? `<div class="seo-sub" data-noi18n><h2 class="seo-h2">${L('Lugares en ', 'Places in ', 'Lugares em ') + esc(placeName)}</h2><div class="chips">${kids.map(x => linkChip(HH.placeKey(x.l, null, g), HH.locSeoName(x.l, lang), x.n)).join('')}</div></div>` : ''}
      ${sibs.length ? `<div class="seo-sub" data-noi18n><h2 class="seo-h2">${L('Más lugares en ', 'More places in ', 'Mais lugares em ') + esc(HH.locSeoName(parent, lang))}</h2><div class="chips">${sibs.map(x => linkChip(HH.placeKey(x.l, null, g), HH.locSeoName(x.l, lang), x.n)).join('')}</div></div>` : ''}
      <aside class="card seo-recruit" data-noi18n><div class="grow"><strong>${L('¿Sos escort o acompañante en ', 'Are you an escort or companion in ', 'Você é acompanhante ou escort em ') + esc(placeName)}?</strong><p class="small muted">${L('Publicá tu aviso: contacto directo con quien te escribe, sin intermediarios.', 'Publish your ad: direct contact with whoever writes to you, no middlemen.', 'Publique seu anúncio: contato direto com quem escreve para você, sem intermediários.')}</p></div><a class="btn sm" href="#registro" data-go="#registro">${L('Publicar mi perfil', 'Publish my profile', 'Publicar meu perfil')}</a></aside>
    </div>${HH.seoHubFooter ? HH.seoHubFooter() : ''}${HH.pubFooter ? HH.pubFooter() : ''}`;
  }
  function notFound() {
    return `<div class="container section"><div class="empty" data-noi18n>${icon('search')}<h4>${L('No encontramos esa página', 'Page not found', 'Página não encontrada')}</h4><p class="small">${L('Puede que la dirección haya cambiado.', 'The address may have changed.', 'O endereço pode ter mudado.')}</p><a class="btn" href="#inicio" data-go="#inicio">${L('Ir al inicio', 'Go to home', 'Ir para o início')}</a></div></div>`;
  }
  HH.route('pais.:c', ({ c }) => landing('pais.' + c));
  HH.route('pais.:c.:g', ({ c, g }) => landing('pais.' + c + '.' + g));
  HH.route('lugar.:c.:l', ({ c, l }) => landing('lugar.' + c + '.' + l));
  HH.route('lugar.:c.:l.:a', ({ c, l, a }) => landing('lugar.' + c + '.' + l + '.' + a));
  HH.route('404', () => notFound());

  /* ---------- Enlaces internos: ciudades y búsquedas frecuentes ---------- */
  HH.seoHubData = function () {
    const countries = HH.countryLocs().map(c => ({ c, n: countAll(c), men: countAll(c, null, HH.GENDER_PAGE.gender) })).filter(x => x.n || x.men).sort((a, b) => b.n - a.n);
    return countries.map(({ c, n, men }) => {
      const inside = locs().filter(l => l.level === 'city' && HH.isActiveLoc(l) && countryOf(l).id === c.id).map(l => ({ l, n: countAll(l) })).filter(x => x.n).sort((a, b) => b.n - a.n || a.l.name.localeCompare(b.l.name));
      return { c, n, men, cities: inside.slice(0, 12) };
    });
  };
  HH.seoTopCombos = () => []; // sin páginas por actividad

  const hubLinks = () => {
    const lang = HH.lang; const data = HH.seoHubData();
    return `<div class="seo-hub-grid">
      ${data.map(d => `<div><h3 class="seo-h3"><a href="#${HH.placeKey(d.c)}" data-go="#${HH.placeKey(d.c)}">${esc(HH.locSeoName(d.c, lang))}</a></h3><ul class="seo-links">${d.cities.map(x => `<li><a href="#${HH.placeKey(x.l)}" data-go="#${HH.placeKey(x.l)}">${esc(HH.locSeoName(x.l, lang))}</a></li>`).join('')}${d.men ? `<li><a href="#${HH.placeKey(d.c, null, HH.GENDER_PAGE.gender)}" data-go="#${HH.placeKey(d.c, null, HH.GENDER_PAGE.gender)}">${esc(menLabel(lang) + L(' en ', ' in ', ' em ') + HH.locSeoName(d.c, lang))}</a></li>` : ''}</ul></div>`).join('')}
    </div>`;
  };
  // Pie de la portada: título, texto y enlaces (todo editable en Admin → SEO)
  HH.seoHomeBlock = function () {
    const lang = HH.lang; const paras = get('home.blockText', lang).split(/\n\s*\n/).map(t => t.trim()).filter(Boolean);
    return `<section class="section seo-hub" aria-labelledby="seoHubT" data-noi18n><div class="container stack-lg">
      <div class="seo-hub-text"><h2 id="seoHubT">${esc(get('home.blockTitle', lang))}</h2>${paras.map(t => `<p>${esc(t)}</p>`).join('')}</div>
      ${hubLinks()}
    </div></section>`;
  };
  HH.seoHubFooter = () => `<section class="section seo-hub" data-noi18n><div class="container stack">${hubLinks()}</div></section>`;
  // H1 de la portada por idioma: en español es el título de Apariencia; en inglés y portugués, el de SEO
  HH.seoH1 = (def) => (HH.lang !== 'es' ? get('home.h1', HH.lang) : '') || def;

  /* ---------- Mapa del sitio ---------- */
  HH.seoSitemap = function () {
    const out = []; const today = HH.localDay ? HH.localDay() : new Date().toISOString().slice(0, 10);
    const last = (list) => list.map(p => String(p.updatedAt || '').slice(0, 10)).filter(Boolean).sort().pop() || today;
    const add = (key, mod, prio) => out.push({ key, lastmod: mod || today, priority: prio, urls: Object.fromEntries(LANGS.map(l => [l, HH.urlOf(key, l)])) });
    const pub = HH.publishedProfiles();
    add('inicio', last(pub), '1.0');
    const MEN = HH.GENDER_PAGE.gender;
    HH.countryLocs().forEach(c => { const list = pub.filter(p => HH.inCity(p, c.name)); if (HH.seoIndexable(c)) add(HH.placeKey(c), last(list), '0.8'); if (HH.seoIndexable(c, null, MEN)) add(HH.placeKey(c, null, MEN), last(HH.placeProfiles(c, null, MEN)), '0.7'); });
    locs().filter(l => l.level !== 'country' && HH.isActiveLoc(l)).forEach(l => {
      if (HH.seoIndexable(l, null, MEN)) add(HH.placeKey(l, null, MEN), last(HH.placeProfiles(l, null, MEN)), '0.7');
      const list = pub.filter(p => HH.inCity(p, l.name)); if (!HH.seoIndexable(l)) return;
      add(HH.placeKey(l), last(list), '0.8');
    });
    pub.forEach(p => add('perfil.' + p.slug, String(p.updatedAt || '').slice(0, 10) || today, '0.7'));
    add('stars', today, '0.4'); add('registro', today, '0.5');
    return out;
  };
  HH.seoSitemapXml = function (site) {
    site = (site || HH.seoSite() || '').replace(/\/$/, '');
    const x = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const rows = HH.seoSitemap().map(e => LANGS.map(l => `  <url><loc>${x(site + e.urls[l])}</loc><lastmod>${e.lastmod}</lastmod><priority>${e.priority}</priority>${LANGS.map(o => `<xhtml:link rel="alternate" hreflang="${o}" href="${x(site + e.urls[o])}"/>`).join('')}<xhtml:link rel="alternate" hreflang="x-default" href="${x(site + e.urls.es)}"/></url>`).join('\n')).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${rows}\n</urlset>\n`;
  };
  HH.seoRobotsTxt = function (site) {
    site = (site || HH.seoSite() || '').replace(/\/$/, '');
    const priv = ['panel', 'admin', 'cuenta', 'chat'];
    return ['User-agent: *', ...priv.flatMap(p => ['', '/en', '/pt'].map(pre => `Disallow: ${pre}/${p}`)), '', `Sitemap: ${site}/sitemap.xml`, ''].join('\n');
  };

  /* ---------- Admin → SEO ---------- */
  if (HH.adminTabs) {
    HH.adminTabs.push({ id: 'seo', label: 'SEO', icon: 'search' });
    const A = HH.ui.admSeo = HH.ui.admSeo || {};
    const LN = { es: 'Español', en: 'English', pt: 'Português' };
    const langChips = () => `<div class="chips" role="group" aria-label="Idioma de los textos">${LANGS.map(l => `<button type="button" class="chip${(A.lang || 'es') === l ? ' active' : ''}" data-action="seoLang" data-l="${l}" aria-pressed="${(A.lang || 'es') === l}">${LN[l]}</button>`).join('')}</div>`;
    const counter = (id, max) => `<span class="tiny muted num" data-seo-count="${id}" data-max="${max}"></span>`;
    const serp = (id, url, t, d) => `<div class="serp" id="${id}"><div class="serp-u">${esc(url)}</div><div class="serp-t">${esc(t)}</div><div class="serp-d">${esc(d)}</div></div>`;
    const prettyUrl = (u) => ((HH.seoSite() || 'https://tudominio.com') + u).replace(/^https?:\/\//, '').replace(/\/$/, '').split('/').join(' › ');
    const exampleLoc = () => { const l = locs().find(x => x.level === 'city' && HH.isActiveLoc(x) && countAll(x)); return l ? { l } : null; };
    HH.adminViews.seo = function (me) {
      const lang = A.lang || 'es'; const c = cfg(); const hero = Object.assign({}, HH.DEFAULT_SETTINGS.hero, HH.settings().hero || {});
      const sm = HH.seoSitemap();
      const val = (path) => { const parts = path.split('.'); const saved = parts[0] === 'home' ? (c.home || {})[lang] : ((c.tpl || {})[lang] || {})[parts[1]]; const v = saved ? saved[parts[parts.length - 1]] : ''; return v && v.trim() ? v : get(path, lang); };
      const site = `<form class="card stack" data-submit="seoSiteSave"><div class="card-title">${icon('globe')} Sitio</div>
        <div class="grid-2" style="align-items:start"><div class="field"><label for="seoSite">Dirección del sitio</label><input class="input" id="seoSite" name="siteUrl" type="url" placeholder="https://tudominio.com" value="${esc(HH.seoSite())}"><span class="hint">Se usa en canonical, hreflang y el mapa del sitio.</span></div>
        <div class="field"><label for="seoMin">Mínimo de perfiles para indexar una página</label><select class="select" id="seoMin" name="minProfiles">${[1, 2, 3, 5].map(n => `<option value="${n}"${HH.seoMin() === n ? ' selected' : ''}>${n}</option>`).join('')}</select><span class="hint">Las páginas con menos quedan visibles pero fuera de Google (noindex). Una provincia o zona con perfiles en una sola ciudad también, para no repetir la página de esa ciudad.</span></div></div>
        <div class="row between" style="gap:8px"><span class="small muted">Páginas en el mapa del sitio: <strong>${sm.length * 3}</strong> (${sm.length} × 3 idiomas)</span><span class="row" style="gap:8px"><button type="button" class="btn ghost sm" data-action="seoMap">${icon('list')} Ver mapa del sitio</button><button class="btn sm" type="submit">${icon('check')} Guardar</button></span></div></form>`;
      const home = `<form class="card stack" data-submit="seoHomeSave"><div class="row between" style="gap:8px"><div class="card-title">${icon('home')} Portada</div>${langChips()}</div>
        <div class="field"><label for="seoHT">Título (pestaña y Google)</label><input class="input" id="seoHT" name="title" maxlength="90" value="${esc(val('home.title'))}" data-input="seoPrev" data-prev="seoPrevH" data-part="t">${counter('seoHT', 60)}</div>
        <div class="field"><label for="seoHD">Descripción</label><textarea class="textarea" id="seoHD" name="description" rows="2" maxlength="300" data-input="seoPrev" data-prev="seoPrevH" data-part="d">${esc(val('home.description'))}</textarea>${counter('seoHD', 160)}</div>
        ${serp('seoPrevH', prettyUrl(HH.urlOf('inicio', lang)), val('home.title'), val('home.description'))}
        <div class="field"><label for="seoH1">H1 de la portada</label>${lang === 'es' ? `<div class="row nowrap" style="gap:8px"><input class="input" id="seoH1" value="${esc(String(hero.title || '').replace(/\*/g, ''))}" readonly><a class="btn ghost sm" href="#admin.apariencia" data-go="#admin.apariencia" style="flex:none">Editar en Apariencia</a></div><span class="hint">En español, el H1 es el título de la portada.</span>` : `<input class="input" id="seoH1" name="h1" maxlength="120" value="${esc(val('home.h1'))}"><span class="hint">Entre asteriscos va en rosa, como en Apariencia.</span>`}</div>
        <div class="field"><label for="seoBT">Título del bloque al pie</label><input class="input" id="seoBT" name="blockTitle" maxlength="100" value="${esc(val('home.blockTitle'))}"></div>
        <div class="field"><label for="seoBX">Texto del bloque al pie</label><textarea class="textarea" id="seoBX" name="blockText" rows="6" maxlength="2000">${esc(val('home.blockText'))}</textarea><span class="hint">Una línea en blanco separa párrafos. Debajo se agregan solos los enlaces a ciudades y búsquedas frecuentes.</span></div>
        <div class="row" style="justify-content:flex-end"><button class="btn" type="submit">${icon('check')} Guardar portada</button></div></form>`;
      const ex = exampleLoc();
      const TYPES = [['countryMen', 'Página de hombres por país', ''], ['placeMen', 'Página de hombres por lugar', ''], ['country', 'Página de país', 'argentina'], ['place', 'Página de lugar (provincia, zona o ciudad)', ''], ['profile', 'Perfil', '']];
      const exVars = (type) => { if (!ex) return {}; const loc = type === 'country' || type === 'countryMen' ? countryOf(ex.l) : ex.l; const act = null; const g = /Men$/.test(type) ? HH.GENDER_PAGE.gender : null; const v = varsFor(loc, act, countAll(loc, act && act.id, g), lang); return Object.assign(v, { nombre: 'Valentina', edad: 27, bio: '' }); };
      const exUrl = (type) => { if (!ex) return '/'; if (type === 'countryMen') return HH.urlOf(HH.placeKey(countryOf(ex.l), null, HH.GENDER_PAGE.gender), lang); if (type === 'placeMen') return HH.urlOf(HH.placeKey(ex.l, null, HH.GENDER_PAGE.gender), lang); return type === 'country' ? HH.urlOf(HH.placeKey(countryOf(ex.l)), lang) : type === 'place' ? HH.urlOf(HH.placeKey(ex.l), lang) : HH.urlOf('perfil.valentina', lang); };
      const tpl = `<form class="card stack" data-submit="seoTplSave"><div class="row between" style="gap:8px"><div class="card-title">${icon('edit')} Plantillas</div>${langChips()}</div>
        <div class="small muted">Se completan solas en cada página. Variables: ${HH.SEO_VARS.map(x => `<code>${x}</code>`).join(' ')}. <code>{lugar}</code> también acepta <code>{ciudad}</code>.</div>
        ${TYPES.map(([t, label]) => `<details class="seo-tpl"${A.open === t ? ' open' : ''} data-t="${t}"><summary><strong>${label}</strong>${icon('chevronDown')}</summary><div class="stack" style="gap:10px;padding-top:10px">
          <div class="field"><label for="seoT_${t}_title">Título</label><input class="input" id="seoT_${t}_title" name="${t}.title" maxlength="120" value="${esc(val('tpl.' + t + '.title'))}" data-input="seoPrev" data-prev="seoPrev_${t}" data-part="t" data-vars="${t}">${counter('seoT_' + t + '_title', 60)}</div>
          <div class="field"><label for="seoT_${t}_description">Descripción</label><textarea class="textarea" id="seoT_${t}_description" name="${t}.description" rows="2" maxlength="300" data-input="seoPrev" data-prev="seoPrev_${t}" data-part="d" data-vars="${t}">${esc(val('tpl.' + t + '.description'))}</textarea></div>
          ${t !== 'profile' ? `<div class="field"><label for="seoT_${t}_h1">H1</label><input class="input" id="seoT_${t}_h1" name="${t}.h1" maxlength="120" value="${esc(val('tpl.' + t + '.h1'))}"></div><div class="field"><label for="seoT_${t}_intro">Texto de presentación</label><textarea class="textarea" id="seoT_${t}_intro" name="${t}.intro" rows="3" maxlength="600">${esc(val('tpl.' + t + '.intro'))}</textarea></div>` : ''}
          ${serp('seoPrev_' + t, prettyUrl(exUrl(t)), fill(val('tpl.' + t + '.title'), exVars(t)), clip(fill(val('tpl.' + t + '.description'), exVars(t)), 160))}
        </div></details>`).join('')}
        <div class="row" style="justify-content:flex-end"><button class="btn" type="submit">${icon('check')} Guardar plantillas</button></div></form>`;
      const places = locs().filter(l => HH.isActiveLoc(l)).map(l => ({ l, n: countAll(l) })).filter(x => x.n || (c.places || {})[x.l.id]).sort((a, b) => HH.locPath(a.l).map(x => x.name).join('/').localeCompare(HH.locPath(b.l).map(x => x.name).join('/')));
      const pc = (l) => Object.assign({}, HH.SEO_PLACE_DEFAULTS[l.name] || {}, (c.places || {})[l.id] || {});
      const placesCard = `<div class="card stack"><div class="card-title">${icon('pin')} Lugares</div><div class="small muted">Nombre corto y dirección de cada página, y un texto propio si querés que no use la plantilla. Si cambiás la dirección, la anterior redirige a la nueva.</div>
        <div class="list">${places.map(({ l, n }) => `<details class="seo-place"><summary class="list-item"><span class="grow" style="min-width:0;padding-left:${(HH.locPath(l).length - 1) * 14}px"><span class="title ellipsis">${esc(l.name)}</span><span class="sub ellipsis">${esc(HH.urlOf(HH.placeKey(l), lang))} · ${n} ${HH.plural(n, 'perfil', 'perfiles')}${HH.seoIndexable(l) ? '' : ' · fuera de Google'}</span></span>${icon('chevronDown')}</summary>
          <form class="stack" style="gap:10px;padding:4px 12px 14px" data-submit="seoPlaceSave" data-id="${l.id}">
            <div class="grid-2" style="align-items:start"><div class="field"><label for="seoPN_${l.id}">Nombre para títulos</label><input class="input" id="seoPN_${l.id}" name="name" maxlength="60" value="${esc(pc(l).name || l.name)}"></div>
            <div class="field"><label for="seoPS_${l.id}">Dirección</label><div class="input-group"><span class="addon">/${esc(l.level === 'country' ? '' : HH.locSlug(countryOf(l)) + '/')}</span><input class="input" id="seoPS_${l.id}" name="slug" maxlength="60" value="${esc(HH.locSlug(l))}" pattern="[a-z0-9-]+"></div></div></div>
            <div class="field"><label for="seoPI_${l.id}">Texto propio (${LN[lang]})</label><textarea class="textarea" id="seoPI_${l.id}" name="intro" rows="3" maxlength="800" placeholder="Vacío: usa la plantilla">${esc((pc(l).intro || {})[lang] || '')}</textarea></div>
            <div class="row between" style="gap:8px"><a class="small" href="#${HH.placeKey(l)}" data-go="#${HH.placeKey(l)}">Ver página</a><button class="btn sm" type="submit">${icon('check')} Guardar</button></div>
          </form></details>`).join('')}</div></div>`;
      return HH.adminLayout(me, 'seo', `${HH.adminHead('SEO', '', 'Textos para Google de la portada y de las páginas de país, lugar y perfil, en los tres idiomas.')}<div class="stack" style="gap:16px">${site}${home}${tpl}${placesCard}</div>`);
    };
    const updCounters = () => document.querySelectorAll('[data-seo-count]').forEach(s => { const el = document.getElementById(s.dataset.seoCount); if (!el) return; const n = el.value.length, max = Number(s.dataset.max); s.textContent = n + ' / ' + max + (n > max ? ' · Google lo puede cortar' : ''); s.style.color = n > max ? 'var(--warn)' : ''; });
    document.addEventListener('hh:rendered', () => { if (/^admin\.seo/.test(HH.current.path || '')) updCounters(); });
    Object.assign(HH.actions, {
      seoLang(el) { A.lang = el.dataset.l; const open = document.querySelector('details.seo-tpl[open]'); A.open = open ? open.dataset.t : null; HH.save(); HH.refresh(); },
      seoPrev(el) {
        const box = document.getElementById(el.dataset.prev); if (!box) return; const t = el.dataset.vars; const ex = exampleLoc();
        let v = {}; if (t && ex) { const loc = t === 'country' ? countryOf(ex.l) : ex.l; v = Object.assign(varsFor(loc, null, countAll(loc), A.lang || 'es'), { nombre: 'Valentina', edad: 27, bio: '' }); }
        const txt = t ? fill(el.value, v) : el.value; box.querySelector(el.dataset.part === 't' ? '.serp-t' : '.serp-d').textContent = el.dataset.part === 'd' ? clip(txt, 160) : txt; updCounters();
      },
      seoSiteSave(form, ev, v) { const u = String(v.siteUrl || '').trim().replace(/\/$/, ''); if (u && !/^https:\/\/[^/]+\.[^/]+$/.test(u)) { HH.toast('Usá la dirección completa, por ejemplo https://tudominio.com', { type: 'warn' }); return; } const c = cfg(); c.siteUrl = u; c.minProfiles = Number(v.minProfiles) || 1; HH.save(); HH.toast('Sitio guardado', { type: 'ok' }); HH.refresh(); },
      seoHomeSave(form, ev, v) { const c = cfg(); const lang = A.lang || 'es'; c.home = c.home || {}; c.home[lang] = Object.assign({}, c.home[lang] || {}, { title: String(v.title || '').trim(), description: String(v.description || '').trim(), blockTitle: String(v.blockTitle || '').trim(), blockText: String(v.blockText || '').trim() }, lang !== 'es' ? { h1: String(v.h1 || '').trim() } : {}); HH.save(); HH.toast('Portada guardada (' + LN[lang] + ')', { type: 'ok' }); HH.refresh(); },
      seoTplSave(form, ev, v) { const c = cfg(); const lang = A.lang || 'es'; c.tpl = c.tpl || {}; c.tpl[lang] = c.tpl[lang] || {}; Object.entries(v).forEach(([k, val]) => { const [t, f] = k.split('.'); if (!t || !f) return; c.tpl[lang][t] = c.tpl[lang][t] || {}; c.tpl[lang][t][f] = String(val || '').trim(); }); const open = form.querySelector('details.seo-tpl[open]'); A.open = open ? open.dataset.t : null; HH.save(); HH.toast('Plantillas guardadas (' + LN[lang] + ')', { type: 'ok' }); HH.refresh(); },
      seoPlaceSave(form, ev, v) {
        const c = cfg(); const lang = A.lang || 'es'; const loc = HH.locById(form.dataset.id); if (!loc) return;
        const s = HH.slugify(v.slug || ''); if (s.length < 2) { HH.toast('La dirección necesita al menos 2 letras', { type: 'warn' }); return; }
        const country = countryOf(loc);
        if (HH.isGenderWord && HH.isGenderWord(s)) { HH.toast('Esa dirección está reservada para las páginas de hombres', { type: 'warn' }); return; }
        const clash = loc.level === 'country' ? HH.countryLocs().some(x => x.id !== loc.id && HH.locSlug(x) === s) : locs().some(x => x.id !== loc.id && x.level !== 'country' && countryOf(x).id === country.id && HH.locSlug(x) === s);
        if (clash) { HH.toast('Esa dirección ya la usa otro lugar', { type: 'warn' }); return; }
        c.places = c.places || {}; const pc = c.places[loc.id] = Object.assign({}, c.places[loc.id] || {});
        const prev = HH.locSlug(loc); if (prev !== s) pc.oldSlugs = [...new Set([...(pc.oldSlugs || []), prev])].filter(x => x !== s);
        pc.slug = s; pc.name = String(v.name || '').trim() || loc.name; pc.intro = Object.assign({}, pc.intro || {}, { [lang]: String(v.intro || '').trim() });
        HH.save(); HH.toast('Guardado: ' + HH.urlOf(HH.placeKey(loc), lang), { type: 'ok' }); HH.refresh();
      },
      seoMap() {
        const sm = HH.seoSitemap(); const lang = A.lang || 'es';
        HH.modal({ title: 'Mapa del sitio', wide: true, body: `<div class="small muted">Cada dirección existe en español, inglés y portugués (${sm.length * 3} en total). Se muestra en ${LN[lang]}.</div><div class="seo-map">${sm.map(e => `<div class="row between nowrap" style="gap:8px"><a class="ellipsis" href="#${e.key}" data-go="#${e.key}" data-action="closeModal">${esc(e.urls[lang])}</a><span class="tiny muted num" style="flex:none">${e.lastmod}</span></div>`).join('')}</div><div class="notice">${icon('info')}<span>En el servidor se publica como /sitemap.xml y /robots.txt (ver ssr/).</span></div>` });
      },
      seoMore() { S.shown = (S.shown || 24) + 24; HH.refresh(); },
      seoHintClose() { try { sessionStorage.setItem('hh_lang_hint', '1'); } catch (e) { /* */ } const b = document.getElementById('hhLangHint'); if (b) b.remove(); },
    });
  }

  /* ---------- Estilos ---------- */
  const css = `
  .seo-page{padding-top:14px;padding-bottom:28px}
  .seo-head{display:grid;gap:8px;max-width:780px}
  .seo-head h1{font-size:clamp(26px,5vw,38px);line-height:1.1}
  .seo-h2{font-size:17px;margin-bottom:8px}
  .seo-sub .chips{flex-wrap:wrap}
  .seo-sub .chip .num{font-size:12px;margin-left:2px}.seo-sub .chip.active .num{color:inherit;opacity:.8}
  .seo-recruit{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
  .seo-recruit p{margin-top:4px}
  .seo-hub{border-top:1px solid var(--line)}
  .seo-hub-text{max-width:780px;display:grid;gap:10px}.seo-hub-text h2{font-size:22px}.seo-hub-text p{color:var(--fg-2);line-height:1.6}
  .seo-hub-grid{display:grid;gap:18px 20px;grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}
  .seo-h3{font-size:14px;margin-bottom:6px}.seo-h3 a{color:var(--fg)}
  .seo-links{list-style:none;margin:0;padding:0;display:grid;gap:4px;font-size:13px}.seo-links a{color:var(--fg-2)}.seo-links a:hover{color:var(--berry)}
  .serp{border:1px solid var(--line);border-radius:12px;padding:12px 14px;background:var(--surface-2);display:grid;gap:3px;overflow-wrap:anywhere}
  .serp-u{font-size:12px;color:var(--muted)}.serp-t{font-size:17px;color:#8ab4f8;line-height:1.3}.serp-d{font-size:13px;color:var(--fg-2);line-height:1.45}
  .seo-tpl{border:1px solid var(--line);border-radius:12px;padding:10px 12px}
  .seo-tpl summary,.seo-place summary{display:flex;align-items:center;justify-content:space-between;gap:8px;cursor:pointer;list-style:none}
  .seo-tpl summary::-webkit-details-marker,.seo-place summary::-webkit-details-marker{display:none}
  .seo-tpl[open] summary svg,.seo-place[open] summary > svg{transform:rotate(180deg)}
.seo-place .title,.seo-place .sub{display:block}
  .seo-map{display:grid;gap:4px;max-height:52vh;overflow:auto;font-size:13px}
  .lang-hint{background:var(--surface-2);border-bottom:1px solid var(--line);padding:6px 0;font-size:13px}.lang-hint a{display:inline-flex;gap:6px;align-items:center;font-weight:700}.lang-hint svg{width:15px;height:15px}
  `;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
})();
