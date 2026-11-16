/* ============================================================
   SexyRose — prod-metricas.js (solo el sitio real; NO viaja a la demo ni al admin: ver mvp/build.py)
   Contadores de tráfico sin datos personales para Admin → Métricas (16/11/2026, decisión de Juan).
   Avisa al servidor (POST /api/sitio/evento) cuando se ve una página del sitio (inicio, país, lugar, perfil) y cuando se
   toca el botón de WhatsApp o Telegram de un perfil. No manda cookies ni ningún identificador: el servidor solo suma 1
   al contador del día. Una visita al mismo perfil en la misma pestaña cuenta una sola vez (sessionStorage).
   No cuenta: la demo (/demo/), la vista previa del propio perfil ni nada del panel de la acompañante.
   De dónde vienen (solo Admin → Métricas, 16/11/2026): al empezar la pestaña se clasifica la llegada en una categoría
   fija (buscadores, redes, mensajeria, otros, directo) y se guarda en sessionStorage; cada aviso lleva solo esa
   categoría, nunca la dirección ni el dominio de donde vino. La navegación dentro del sitio no cambia el origen.
   ============================================================ */
(function () {
  'use strict';
  /* ---------- Origen de la visita: solo la categoría ---------- */
  const ORIGEN = 'sr_origen';
  const ORIGENES = ['buscadores', 'redes', 'mensajeria', 'otros', 'directo'];
  // Dominios (y apps de Android, "android-app://<paquete>") por categoría. Se compara el final del nombre.
  const DOMINIOS = {
    buscadores: ['google', 'bing.com', 'duckduckgo.com', 'yahoo.com', 'yahoo.co.jp', 'yandex', 'ya.ru', 'ecosia.org', 'search.brave.com',
      'baidu.com', 'startpage.com', 'qwant.com', 'ask.com', 'aol.com', 'naver.com', 'seznam.cz', 'petalsearch.com', 'search.yahoo.com',
      'com.google.android.googlequicksearchbox'],
    redes: ['instagram.com', 'facebook.com', 'fb.com', 'fb.me', 'messenger.com', 'x.com', 'twitter.com', 't.co', 'tiktok.com', 'reddit.com',
      'threads.net', 'threads.com', 'linkedin.com', 'lnkd.in', 'pinterest.com', 'youtube.com', 'youtu.be', 'snapchat.com', 'tumblr.com',
      'bsky.app', 'onlyfans.com', 'com.instagram.android', 'com.facebook.katana', 'com.facebook.orca', 'com.twitter.android',
      'com.zhiliaoapp.musically', 'com.reddit.frontpage'],
    mensajeria: ['wa.me', 'whatsapp.com', 'whatsapp.net', 't.me', 'telegram.org', 'telegram.me', 'telegram.dog', 'com.whatsapp', 'com.whatsapp.w4b',
      'org.telegram.messenger', 'org.telegram.plus'],
  };
  // utm_source (sin dominio): nombres sueltos por categoría; cualquier otro valor → otros
  const UTM = {
    buscadores: ['google', 'bing', 'duckduckgo', 'ddg', 'yahoo', 'yandex', 'ecosia', 'brave', 'baidu', 'startpage', 'qwant', 'search', 'buscador', 'googleads', 'adwords'],
    redes: ['instagram', 'ig', 'facebook', 'fb', 'meta', 'messenger', 'twitter', 'x', 'tiktok', 'tt', 'reddit', 'threads', 'linkedin', 'pinterest', 'youtube', 'yt', 'snapchat', 'tumblr', 'bluesky', 'onlyfans', 'social', 'redes'],
    mensajeria: ['whatsapp', 'wa', 'telegram', 'tg'],
  };
  const termina = (host, d) => host === d || host.endsWith('.' + d) || (d === 'google' && /(^|\.)google\.[a-z.]+$/.test(host)) || (d === 'yandex' && /(^|\.)yandex\.[a-z.]+$/.test(host));
  const categoriaHost = (host) => {
    for (const k of ['buscadores', 'redes', 'mensajeria']) if (DOMINIOS[k].some((d) => termina(host, d))) return k;
    return 'otros';
  };
  // → una de ORIGENES, o null si la pestaña llegó desde el propio sitio sin origen guardado (no se sabe: "sin dato")
  function clasificar(landingUrl, referrer, propio) {
    let utm = '';
    try { utm = (new URL(landingUrl).searchParams.get('utm_source') || '').trim().toLowerCase(); } catch (e) { /* dirección rara */ }
    if (utm) {
      const limpio = utm.replace(/^www\./, '').replace(/[^a-z0-9.]+/g, ' ').trim();
      if (/\.[a-z]{2,}$/.test(limpio) && !/\s/.test(limpio)) return categoriaHost(limpio); // utm_source=instagram.com
      const palabra = limpio.split(' ')[0];
      for (const k of ['buscadores', 'redes', 'mensajeria']) if (UTM[k].includes(palabra)) return k;
      return 'otros';
    }
    const ref = String(referrer || '').trim();
    if (!ref) return 'directo';
    let u;
    try { u = new URL(ref); } catch (e) { return 'otros'; }
    const host = String(u.hostname || '').toLowerCase().replace(/\.$/, '');
    if (u.protocol === 'android-app:') return host ? categoriaHost(host) : 'otros';
    if (!/^https?:$/.test(u.protocol) || !host) return 'otros';
    const mio = String(propio || '').toLowerCase().replace(/^www\./, '');
    if (host.replace(/^www\./, '') === mio || host === 'sexyrose.net' || host.endsWith('.sexyrose.net')) return null; // navegación interna
    return categoriaHost(host);
  }
  // Origen de esta pestaña: el primero que se supo (sessionStorage); si no hay, se clasifica la llegada y se guarda.
  function origenDeLaPestana(win) {
    try { const o = win.sessionStorage.getItem(ORIGEN); if (ORIGENES.includes(o)) return o; } catch (e) { /* sin almacenamiento */ }
    const o = clasificar(win.location.href, win.document.referrer, win.location.hostname);
    if (o) { try { win.sessionStorage.setItem(ORIGEN, o); } catch (e) { /* sin almacenamiento: vale para esta carga */ } }
    return o;
  }
  if (window.HH) HH.origenTrafico = { clasificar, origenDeLaPestana };

  if (window.HH_PROD !== 'sitio' || HH.DEMO || window.HH_DEMO || /^\/demo(\/|$)/.test(location.pathname)) return;
  const URL_EV = '/api/sitio/evento';
  const VISTOS = 'sr_vistos';
  // Una vez al cargar: lo que pase después (navegación interna, cambios de dirección) no cambia el origen
  const origen = origenDeLaPestana(window);
  const prelanzamiento = () => !!(HH.db && HH.db._ajustes && HH.db._ajustes.prelanzamiento === true);
  const enviar = (cuerpo) => {
    if (prelanzamiento()) return;
    try {
      fetch(URL_EV, { method: 'POST', keepalive: true, credentials: 'omit', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'X-SR': '1' }, body: JSON.stringify(origen && cuerpo.tipo !== 'whatsapp' && cuerpo.tipo !== 'telegram' ? { ...cuerpo, origen } : cuerpo) })
        .catch(() => { /* sin conexión: no se cuenta */ });
    } catch (e) { /* navegador sin fetch: no se cuenta */ }
  };
  const propio = (p) => { const me = HH.me && HH.me(); return !!(me && p && me.id === p.userId); };
  // Perfiles ya contados en esta pestaña (si el navegador no deja guardar, se cuenta igual en cada visita)
  function yaVisto(slug) {
    try {
      const a = JSON.parse(sessionStorage.getItem(VISTOS) || '[]');
      const lista = Array.isArray(a) ? a : [];
      if (lista.includes(slug)) return true;
      lista.push(slug); sessionStorage.setItem(VISTOS, JSON.stringify(lista.slice(-300)));
    } catch (e) { /* sin almacenamiento */ }
    return false;
  }
  const esPagina = (k) => k === 'inicio' || /^(pais|lugar)\./.test(k) || /^perfil\./.test(k);
  let anterior = null;
  document.addEventListener('hh:rendered', (ev) => {
    if (!HH.db) return; // primer dibujo, antes de tener los perfiles y la sesión: se cuenta en el siguiente
    const k = String((ev.detail && ev.detail.path) || '');
    if (k === anterior) return; // se redibujó la misma página (filtros, pestañas): no es otra visita
    anterior = k;
    if (!esPagina(k)) return;
    if (/^perfil\./.test(k)) {
      const p = HH.profileBySlug && HH.profileBySlug(k.split('.')[1]);
      if (p && propio(p)) return; // ella mirando su propio perfil
      if (p && p.slug && !yaVisto(p.slug)) return enviar({ tipo: 'vista', perfil: p.slug });
    }
    enviar({ tipo: 'pagina' });
  });
  // Botones de contacto del perfil (hoja de WhatsApp/Telegram): data-track="wa" | "tg" + data-track-id (cuenta)
  document.addEventListener('click', (ev) => {
    const a = ev.target && ev.target.closest ? ev.target.closest('a[data-track="wa"], a[data-track="tg"]') : null;
    if (!a) return;
    const p = HH.profileOf && HH.profileOf(a.getAttribute('data-track-id'));
    if (!p || !p.slug || propio(p)) return;
    enviar({ tipo: a.getAttribute('data-track') === 'wa' ? 'whatsapp' : 'telegram', perfil: p.slug });
  }, true);
})();
