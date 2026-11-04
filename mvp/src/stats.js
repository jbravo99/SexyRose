/* SexyRose · Estadísticas para las acompañantes
   Registra por día: apariciones en listados, visitas al perfil (y de dónde llegan), "Me interesa",
   clics a WhatsApp y Telegram, fotos y videos abiertos y veces que se compartió el perfil.
   En el MVP se guarda en el navegador; en producción es una tabla de eventos en la base (sin costo extra). */
(function () {
  const KEEP_DAYS = 120;
  const KINDS = ['imp', 'views', 'interest', 'wa', 'tg', 'opens', 'shares'];
  const SOURCES = { inicio: 'Inicio', swipe: 'Swipe', cerca: 'Cerca de mí', shorts: 'Shorts', stars: 'Stars', otro: 'Link directo o compartido' };
  HH.STATS_SOURCES = SOURCES;
  const day = () => HH.localDay();
  function bucket(p, ymd) {
    if (!p.statsDaily) p.statsDaily = {};
    if (!p.statsDaily[ymd]) p.statsDaily[ymd] = {};
    return p.statsDaily[ymd];
  }
  function prune(p) {
    const keys = Object.keys(p.statsDaily || {}).sort(); const cut = HH.localDay(HH.daysFromNow(-KEEP_DAYS));
    keys.filter(k => k < cut).forEach(k => delete p.statsDaily[k]);
  }
  HH.track = function (workerId, kind, src) {
    if (HH.SSR) return;
    const p = HH.profileOf(workerId); if (!p || !KINDS.includes(kind)) return;
    const me = HH.me && HH.me(); if (me && me.id === workerId) return; // ella misma no cuenta
    const b = bucket(p, day()); b[kind] = (b[kind] || 0) + 1;
    if (kind === 'views') { const s = SOURCES[src] ? src : 'otro'; b.src = b.src || {}; b.src[s] = (b.src[s] || 0) + 1; }
    prune(p); HH.save();
  };

  // De dónde llega cada visita: la sección anterior a abrir el perfil
  let prevPath = '';
  document.addEventListener('hh:rendered', (e) => {
    if (HH.SSR) return;
    const path = (e.detail && e.detail.path) || '';
    if (!/^perfil\./.test(path)) prevPath = path;
    // Apariciones: cada tarjeta visible en un listado, una vez por perfil, visitante y día
    const seen = HH._impSeen || (HH._impSeen = new Set());
    const ids = new Set([...document.querySelectorAll('#app [data-imp]')].map(x => x.dataset.imp));
    const viewer = (HH.viewerId && HH.viewerId()) || 'anon';
    let changed = false;
    ids.forEach(id => { const k = viewer + '|' + id + '|' + day(); if (seen.has(k)) return; seen.add(k); const p = HH.profileOf(id); if (!p) return; const b = bucket(p, day()); b.imp = (b.imp || 0) + 1; changed = true; });
    if (changed) HH.save();
  });
  const srcOf = (path) => { const top = String(path || '').split('.')[0]; return SOURCES[top] && top !== 'otro' ? top : 'otro'; };
  const _view = HH.view;
  HH.view = function (workerId) { _view.apply(this, arguments); HH.track(workerId, 'views', srcOf(prevPath)); };
  const _swipe = HH.swipe;
  HH.swipe = function (clientId, workerId, dir) { _swipe.apply(this, arguments); if (dir === 'right') HH.track(workerId, 'interest'); };
  // Clics a WhatsApp / Telegram (links externos: no se cancela el click)
  document.addEventListener('click', (ev) => { const el = ev.target.closest('[data-track]'); if (el) HH.track(el.dataset.trackId, el.dataset.track); }, true);
  if (HH.actions && HH.actions.pubShare) { const _sh = HH.actions.pubShare; HH.actions.pubShare = function (el) { const p = HH.profileBySlug(el.dataset.slug); if (p) HH.track(p.userId, 'shares'); return _sh.apply(this, arguments); }; }

  // Historial de ejemplo para la demo (solo si el perfil no tiene datos)
  function demoHistory(p, k) {
    const seed = (p.stats && p.stats.views) || 300; const base = Math.max(3, Math.round(seed / 120));
    for (let i = 89; i >= 0; i--) {
      const ymd = HH.localDay(HH.daysFromNow(-i)); if (p.statsDaily && p.statsDaily[ymd] && i > 0) continue;
      const wd = new Date(Date.now() - i * 864e5).getDay(); const wk = wd === 5 || wd === 6 ? 1.5 : wd === 0 ? 1.2 : 1;
      const wave = 1 + 0.35 * Math.sin((i + k * 3) / 6) + (89 - i) / 180;
      const v = Math.max(0, Math.round((base * wk * wave + ((i * 7 + k * 13) % 5) - 2) * (i === 0 ? 0.45 : 1)));
      const b = bucket(p, ymd); if (i === 0 && b.views) continue;
      b.views = v; b.imp = Math.round(v * (6 + (i + k) % 4)); b.interest = Math.round(v * 0.22); b.wa = Math.round(v * 0.12); b.tg = Math.round(v * 0.03); b.opens = Math.round(v * 1.8); b.shares = (i + k) % 9 === 0 ? 1 : 0;
      b.src = { inicio: Math.round(v * 0.38), swipe: Math.round(v * 0.27), cerca: Math.round(v * 0.14), shorts: Math.round(v * 0.09), stars: Math.round(v * 0.06) }; b.src.otro = Math.max(0, v - Object.values(b.src).reduce((a, x) => a + x, 0));
    }
  }
  HH.statsEnsureDemo = function () { if (!HH.db || HH.db._statsDemo) return; (HH.db.profiles || []).forEach((p, k) => { if (!p.statsDaily || Object.keys(p.statsDaily).length < 5) demoHistory(p, k); }); HH.db._statsDemo = true; HH.save(); };

  // Resumen para un período: totales, período anterior y serie diaria
  HH.statsSummary = function (p, days) {
    const sum = (from, to) => { const t = { src: {} }; KINDS.forEach(k => { t[k] = 0; }); for (let i = from; i < to; i++) { const b = (p.statsDaily || {})[HH.localDay(HH.daysFromNow(-i))]; if (!b) continue; KINDS.forEach(k => { t[k] += b[k] || 0; }); Object.entries(b.src || {}).forEach(([s, n]) => { t.src[s] = (t.src[s] || 0) + n; }); } return t; };
    const cur = sum(0, days), prev = sum(days, days * 2);
    const series = []; for (let i = days - 1; i >= 0; i--) { const ymd = HH.localDay(HH.daysFromNow(-i)); const b = (p.statsDaily || {})[ymd] || {}; series.push({ ymd, views: b.views || 0, wa: (b.wa || 0) + (b.tg || 0), imp: b.imp || 0 }); }
    const byWeekday = [0, 0, 0, 0, 0, 0, 0]; Object.entries(p.statsDaily || {}).forEach(([ymd, b]) => { const [y, m, d] = ymd.split('-').map(Number); byWeekday[new Date(y, m - 1, d).getDay()] += b.views || 0; });
    return { cur, prev, series, byWeekday };
  };
})();
