/* ============================================================
   SexyRose — prod-shorts.js (sitio real y demo): sección Shorts.
   Pantalla completa vertical con todos los videos públicos de las acompañantes: los de su galería y sus historias en
   video activas (videosDePerfil(), pura). Se desliza de a uno (scroll-snap):
   - Solo se reproduce el video que está en pantalla (sin sonido hasta que se toca); el siguiente se precarga.
   - Los que quedan lejos sueltan el video (vuelve la portada) para no gastar memoria ni datos.
   - Orden: los más recientes primero, de a uno por acompañante (nadie acapara el feed). shortsOrden() es pura.
   Los datos son los del estado del sitio (HH.db): no hace falta otro pedido al servidor.
   ============================================================ */
(function () {
  'use strict';
  // FNV-1a con mezcla final: cambiar la semilla reordena de verdad (un hash *31 solo sumaría una constante)
  const hashStr = (s) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return h >>> 0;
  };
  const DIA = 864e5;
  /* Orden de los shorts (pura, la prueban los tests de app/):
     items: [{ key, perfilId, fecha }] → los mismos objetos en orden de feed.
     - Cada acompañante: sus videos del más nuevo al más viejo.
     - Star primero (lo promete la página de Stars): en cada vuelta van primero las Star, entre ellas mezcladas con la
       semilla (rotan en cada visita); después el resto, por la fecha de su video más nuevo (por día) y, dentro del
       mismo día, mezcladas con la semilla. items[].star = true marca a las Star.
     - Se reparte en vueltas: el primero de cada una, después el segundo de cada una… */
  function shortsOrden(items, semilla) {
    const t = (x) => { const v = Date.parse(x && x.fecha); return Number.isFinite(v) ? v : 0; };
    const grupos = new Map();
    (items || []).forEach((it) => { if (!it || !it.perfilId) return; if (!grupos.has(it.perfilId)) grupos.set(it.perfilId, []); grupos.get(it.perfilId).push(it); });
    const lista = [...grupos.entries()].map(([id, arr]) => {
      arr.sort((a, b) => t(b) - t(a) || String(a.key).localeCompare(String(b.key)));
      return { id, arr, star: arr.some((x) => x.star), dia: Math.floor(t(arr[0]) / DIA), mezcla: hashStr(String(semilla || '') + id) };
    });
    lista.sort((a, b) => (b.star - a.star) || (a.star ? 0 : b.dia - a.dia) || a.mezcla - b.mezcla || (a.id < b.id ? -1 : 1));
    const out = [];
    for (let vuelta = 0; ; vuelta++) {
      let alguno = false;
      lista.forEach((g) => { if (g.arr[vuelta]) { out.push(g.arr[vuelta]); alguno = true; } });
      if (!alguno) break;
    }
    return out;
  }
  /* Videos de una acompañante para Shorts (pura, la prueban los tests de app/):
     p.videos (galería) + sus historias en video que no vencieron (stories: [{ id, workerId, video, src, poster, w, h,
     createdAt, expiresAt }]). Sin repetidos (mismo archivo) y solo con portada. → [{ id, src, poster, w, h, createdAt }] */
  function videosDePerfil(p, stories, ahora) {
    const vistos = new Set();
    const hist = (stories || []).filter((st) => st && st.video && st.src && st.poster && st.workerId === p.userId && Date.parse(st.expiresAt) > ahora)
      .map((st) => ({ id: 'h-' + st.id, src: st.src, poster: st.poster, w: st.w, h: st.h, createdAt: st.createdAt }));
    return [...((p && p.videos) || []).filter((v) => v && v.src && v.poster), ...hist]
      .filter((v) => (vistos.has(v.src) ? false : (vistos.add(v.src), true)));
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { shortsOrden, hashMezcla: hashStr, videosDePerfil };
  if (typeof window === 'undefined' || window.HH_PROD !== 'sitio' || !window.HH) return;
  const HH = window.HH;
  HH.shortsOrden = shortsOrden;
  HH.hashMezcla = hashStr; // también la rotación de las destacadas (prod-sitio.js)
  const esc = HH.esc, icon = HH.icon;
  const LOTE = 8;          // videos que se agregan por tanda
  const SEMILLA = Math.floor(Math.random() * 1e9).toString(36); // nueva en cada visita: cambia el orden dentro del día
  const S = { lista: null, firma: '', n: 0, muted: true, actual: -1, io: null, aviso: '' };
  const REELS = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><path d="M10 8.6v6.8l5.6-3.4z" fill="currentColor"/></svg>';
  HH.iconShorts = () => REELS;
  const SND_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg>';
  const SND_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="m22 9-6 6M16 9l6 6"/></svg>';

  // Videos públicos de los perfiles visibles para quien mira (tipo de perfil elegido y, si hay, su ubicación):
  // los de la galería y las historias en video activas.
  function shortsItems() {
    const perfiles = (HH.publishedProfiles ? HH.publishedProfiles() : []).filter((p) => !HH.genderOk || HH.genderOk(p));
    const ahora = Date.now();
    const de = (ps) => ps.flatMap((p) => videosDePerfil(p, HH.db.stories, ahora)
      .map((v) => ({ key: p.userId + ':' + v.id, perfilId: p.userId, star: !!(HH.isStar && HH.isStar(p.userId)), fecha: v.createdAt || p.updatedAt || p.createdAt, p, v })));
    const lugar = HH.currentPlace ? HH.currentPlace() : '';
    let items = lugar ? de(perfiles.filter((p) => HH.inCity(p, lugar))) : de(perfiles);
    S.aviso = '';
    if (lugar && !items.length) { items = de(perfiles); if (items.length) S.aviso = lugar; }
    return shortsOrden(items, SEMILLA);
  }

  function itemHtml(it, i) {
    const p = it.p, v = it.v;
    const lugar = p.zone || p.city || '';
    const horizontal = v.w && v.h && v.w > v.h * 1.05;
    const fav = HH.spFavs ? HH.spFavs().includes(p.userId) : false;
    const ver = `#perfil.${esc(p.slug)}`;
    return `<article class="sh-item${horizontal ? ' sh-h' : ''}" data-i="${i}" aria-label="Video de ${esc(p.displayName)}">
      <img class="sh-bg" src="${esc(v.poster)}" alt="" aria-hidden="true" ${i < 2 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">
      <video class="sh-vid" playsinline muted loop preload="none" disablepictureinpicture disableremoteplayback controlslist="nodownload noplaybackrate" poster="${esc(v.poster)}" data-src="${esc(v.src)}"></video>
      <button type="button" class="sh-tap" data-action="shSonido" aria-label="${S.muted ? 'Activar sonido' : 'Silenciar'}"></button>
      <span class="sh-snd" aria-hidden="true">${S.muted ? SND_OFF : SND_ON}</span>
      <div class="sh-info">
        <a class="sh-who" href="${ver}" data-go="${ver}">${HH.avatar(p, 38)}<span class="sh-name" data-noi18n>${esc(p.displayName)}</span>${p.verified === 'verified' ? `<span class="sh-ver" title="Verificada">${icon('check')}</span>` : ''}</a>
        <div class="sh-meta">${p.age ? `<span>${esc(String(p.age))} años</span>` : ''}${p.age && lugar ? '<span aria-hidden="true">·</span>' : ''}${lugar ? `<span data-noi18n>${esc(lugar)}</span>` : ''}</div>
        <a class="btn sm sh-perfil" href="${ver}" data-go="${ver}">Ver perfil</a>
      </div>
      <div class="sh-side">
        <button type="button" class="sh-act" data-action="pubInterest" data-id="${esc(p.userId)}" aria-label="Me interesa ${esc(p.displayName)}">${icon('heart')}<span>Me interesa</span></button>
        <button type="button" class="sh-act sh-fav${fav ? ' on' : ''}" data-action="spFav" data-id="${esc(p.userId)}" aria-pressed="${fav}" aria-label="${fav ? 'Sacar de favoritos' : 'Guardar en favoritos'}">${icon('star')}<span>Favorito</span></button>
      </div>
      <div class="sh-prog" aria-hidden="true"><i></i></div>
    </article>`;
  }
  const finHtml = () => `<article class="sh-item sh-promo sh-fin" aria-label="Fin">
      <div class="sh-promo-in">${REELS}<h3>Viste todos los videos</h3><p>Volvé más tarde: se suman videos nuevos todo el tiempo.</p>
        <div class="row" style="gap:8px;justify-content:center;flex-wrap:wrap"><button type="button" class="btn" data-action="shInicio">Volver al principio</button><a class="btn secondary" href="#inicio" data-go="#inicio">Explorar perfiles</a></div></div>
    </article>`;
  // Tanda de videos
  function tanda(desde, hasta) {
    let out = '';
    for (let k = desde; k < hasta && k < S.lista.length; k++) out += itemHtml(S.lista[k], k);
    return out;
  }

  function view() {
    const firma = HH.db ? (HH.db.profiles || []).length + '|' + (HH.currentPlace ? HH.currentPlace() : '') + '|' + (HH.genderSet ? HH.genderSet().join(',') : '') : '';
    if (!S.lista || S.firma !== firma || HH.db !== S.db) { S.lista = shortsItems(); S.firma = firma; S.db = HH.db; }
    S.n = Math.min(LOTE, S.lista.length); S.actual = -1;
    if (!S.lista.length) {
      return `<div class="container section"><div class="empty sh-vacio">${REELS}<h4>Pronto vas a ver videos acá</h4><p class="small">Cuando las acompañantes suban videos, aparecen en Shorts.</p><a class="btn" href="#inicio" data-go="#inicio">Explorar perfiles</a></div></div>`;
    }
    return `<div class="sh-page">
      ${S.aviso ? `<div class="sh-aviso" role="status"><span>Todavía no hay videos en ${esc(S.aviso)}: te mostramos los de todas las ubicaciones.</span></div>` : ''}
      <div class="sh-feed" id="shFeed" tabindex="0" role="feed" aria-label="Shorts" aria-busy="false">${tanda(0, S.n)}${S.n >= S.lista.length ? finHtml() : ''}</div>
    </div>`;
  }

  /* ---------- Reproducción ---------- */
  const vidDe = (el) => el && el.querySelector('video.sh-vid');
  function cargar(v, pre) { if (v && !v.getAttribute('src') && v.dataset.src) { v.preload = pre; v.src = v.dataset.src; } }
  function soltar(v) { if (v && v.getAttribute('src')) { v.pause(); v.removeAttribute('src'); try { v.load(); } catch (e) { /* */ } } }
  function activar(item) {
    const feed = document.getElementById('shFeed'); if (!feed) return;
    const items = [...feed.querySelectorAll('.sh-item')];
    const idx = items.indexOf(item); if (idx < 0) return;
    S.actual = idx;
    items.forEach((el, j) => {
      const v = vidDe(el); if (!v) return;
      if (j === idx) {
        cargar(v, 'auto'); v.muted = S.muted;
        const pr = v.play(); if (pr && pr.catch) pr.catch(() => { if (!v.muted) { v.muted = true; S.muted = true; pintarSonido(); const p2 = v.play(); if (p2 && p2.catch) p2.catch(() => {}); } });
        el.classList.add('on');
      } else {
        el.classList.remove('on');
        if (j === idx + 1) cargar(v, 'metadata');   // el siguiente queda listo
        else if (Math.abs(j - idx) > 2) soltar(v);   // lejos: vuelve la portada
        else v.pause();
      }
    });
    // Cerca del final: otra tanda
    const vistos = item.dataset.i && /^\d+$/.test(item.dataset.i) ? Number(item.dataset.i) : -1;
    if (vistos >= S.n - 3 && S.n < S.lista.length) mas(feed);
  }
  function mas(feed) {
    const desde = S.n; S.n = Math.min(S.n + LOTE, S.lista.length);
    const t = document.createElement('template'); t.innerHTML = tanda(desde, S.n) + (S.n >= S.lista.length ? finHtml() : '');
    const nuevos = [...t.content.children];
    if (HH.linkify) nuevos.forEach((n) => HH.linkify(n));
    nuevos.forEach((n) => { feed.appendChild(n); if (S.io) S.io.observe(n); });
  }
  function pintarSonido() {
    document.querySelectorAll('#shFeed .sh-snd').forEach((s) => { s.innerHTML = S.muted ? SND_OFF : SND_ON; });
    document.querySelectorAll('#shFeed .sh-tap').forEach((b) => b.setAttribute('aria-label', HH.t(S.muted ? 'Activar sonido' : 'Silenciar')));
  }
  function montar() {
    const feed = document.getElementById('shFeed');
    if (S.io) { S.io.disconnect(); S.io = null; }
    document.documentElement.classList.toggle('sh-on', !!(HH.current && HH.current.name === 'shorts'));
    if (!feed || feed.dataset.mounted) return; feed.dataset.mounted = '1';
    ajustarAlto();
    if (!('IntersectionObserver' in window)) { const first = feed.querySelector('.sh-item'); if (first) activar(first); return; }
    S.io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting && en.intersectionRatio >= 0.6) activar(en.target); });
    }, { root: feed, threshold: [0, 0.6] });
    feed.querySelectorAll('.sh-item').forEach((el) => S.io.observe(el));
    // Barra de progreso del video actual
    feed.addEventListener('timeupdate', (ev) => {
      const v = ev.target; if (!v.classList || !v.classList.contains('sh-vid') || !v.duration) return;
      const bar = v.parentElement && v.parentElement.querySelector('.sh-prog i'); if (bar) bar.style.transform = `scaleX(${Math.min(1, v.currentTime / v.duration)})`;
    }, true);
    feed.addEventListener('playing', (ev) => { const it = ev.target.closest && ev.target.closest('.sh-item'); if (it) it.classList.add('playing'); }, true);
    if (window.matchMedia && window.matchMedia('(min-width: 900px)').matches) { try { feed.focus({ preventScroll: true }); } catch (e) { /* */ } }
  }
  // Alto exacto del feed: lo que queda de la ventana debajo del encabezado y de cualquier barra de aviso
  // (idioma, demo). El CSS ya da un alto aproximado desde el primer dibujo; esto lo corrige sin saltos visibles.
  function ajustarAlto() {
    const feed = document.getElementById('shFeed'); if (!feed) return;
    const desk = window.matchMedia && window.matchMedia('(min-width: 900px)').matches;
    const top = feed.getBoundingClientRect().top + (window.scrollY || 0);
    const h = Math.max(320, Math.floor(window.innerHeight - top - (desk ? 14 : 0)));
    feed.style.height = h + 'px';
    const page = feed.closest('.sh-page'); if (page) page.style.maxWidth = desk ? Math.min(460, Math.floor(h * 9 / 16)) + 'px' : '';
  }
  let rz = 0;
  window.addEventListener('resize', () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(ajustarAlto); });
  document.addEventListener('click', (ev) => { if (ev.target.closest && ev.target.closest('#hhLangHint')) setTimeout(ajustarAlto, 50); }, true);
  document.addEventListener('hh:rendered', () => setTimeout(montar, 0));
  document.addEventListener('visibilitychange', () => {
    const feed = document.getElementById('shFeed'); if (!feed) return;
    const it = feed.querySelectorAll('.sh-item')[S.actual]; const v = vidDe(it);
    if (!v) return;
    if (document.hidden) v.pause(); else { const pr = v.play(); if (pr && pr.catch) pr.catch(() => {}); }
  });

  Object.assign(HH.actions, {
    shSonido(el) {
      S.muted = !S.muted;
      const it = el.closest('.sh-item'); const v = vidDe(it);
      if (v) { v.muted = S.muted; if (v.paused) { const pr = v.play(); if (pr && pr.catch) pr.catch(() => {}); } }
      pintarSonido();
      if (it) { it.classList.remove('sh-flash'); void it.offsetWidth; it.classList.add('sh-flash'); }
    },
    shInicio() { const feed = document.getElementById('shFeed'); if (feed) feed.scrollTo({ top: 0, behavior: 'smooth' }); },
  });
  HH.spShorts = { view, items: shortsItems, reset: () => { S.lista = null; } };

  Object.assign(HH.I18N, {
    'Shorts': ['Shorts', 'Shorts'],
    'Pronto vas a ver videos acá': ['Videos will show up here soon', 'Em breve você vai ver vídeos aqui'],
    'Cuando las acompañantes suban videos, aparecen en Shorts.': ['When companions upload videos, they show up in Shorts.', 'Quando as acompanhantes enviarem vídeos, eles aparecem em Shorts.'],
    'Ver perfil': ['View profile', 'Ver perfil'],
    'Me interesa': ['I\'m interested', 'Tenho interesse'],
    'Favorito': ['Favorite', 'Favorito'],
    'Activar sonido': ['Turn sound on', 'Ativar som'],
    'Silenciar': ['Mute', 'Silenciar'],
    'Viste todos los videos': ['You have seen all the videos', 'Você viu todos os vídeos'],
    'Volvé más tarde: se suman videos nuevos todo el tiempo.': ['Come back later: new videos are added all the time.', 'Volte mais tarde: novos vídeos chegam o tempo todo.'],
    'Volver al principio': ['Back to the start', 'Voltar ao início'],
    'Todavía no hay videos en {x}: te mostramos los de todas las ubicaciones.': ['There are no videos in {x} yet: we are showing videos from all locations.', 'Ainda não há vídeos em {x}: mostramos os de todas as localizações.'],
    'Tu espacio': ['Your space', 'Seu espaço'],
  });
})();
