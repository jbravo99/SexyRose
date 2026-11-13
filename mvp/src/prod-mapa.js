/* ============================================================
   SexyRose — prod-mapa.js (sitio real y demo): vista "Mapa" de Cerca de mí (13/11/2026).
   El mapa (MapLibre GL + PMTiles de Argentina guardado en bunny.net) es un paquete aparte que se baja SOLO al abrir
   la vista Mapa: assets/mapa.<hash>.js + .css + el worker (build-sitio.py → window.HH_MAPA). La dirección del mapa
   viene del servidor (MAP_TILES_URL → /api/sitio/estado → mapa) o, en la demo, del build (window.HH_DEMO_MAPA).
   Sin las dos cosas no hay vista Mapa (Cerca queda solo con el radar).
   Las acompañantes van en su ubicación aproximada (HH.profileCoords); la del visitante nunca sale del navegador.
   ============================================================ */
(function () {
  if (typeof window === 'undefined' || window.HH_PROD !== 'sitio' || !window.HH) return;
  const HH = window.HH;
  const cfg = () => {
    const c = HH.MAPA_CFG || window.HH_DEMO_MAPA || null;
    return c && c.tiles ? c : null;
  };
  HH.mapaDisponible = () => !!(window.HH_MAPA && window.HH_MAPA.js && cfg());

  let carga = null;
  function cargar() {
    if (window.SRMapa) return Promise.resolve();
    if (carga) return carga;
    carga = new Promise((ok, mal) => {
      const a = window.HH_MAPA;
      if (a.css && !document.querySelector('link[data-sr-mapa]')) {
        const l = document.createElement('link');
        l.rel = 'stylesheet'; l.href = a.css; l.setAttribute('data-sr-mapa', '');
        document.head.appendChild(l);
      }
      const s = document.createElement('script');
      s.src = a.js; s.async = true;
      s.onload = () => (window.SRMapa ? ok() : mal(new Error('mapa')));
      s.onerror = () => { carga = null; mal(new Error('mapa')); };
      document.head.appendChild(s);
    });
    return carga;
  }

  let actual = null; // { el, api }
  HH.mapaMontar = function (el, puntos, o) {
    if (!el || !HH.mapaDisponible()) return;
    if (actual && actual.el === el && actual.api) { actual.api.actualizar(puntos, o); return; }
    if (actual && actual.api && !actual.el.isConnected) { try { actual.api.quitar(); } catch (e) { /* */ } actual = null; }
    const yo = { el, api: null };
    actual = yo;
    cargar().then(() => {
      if (!el.isConnected || actual !== yo) return;
      const c = cfg();
      el.innerHTML = '';
      yo.api = window.SRMapa.montar(el, {
        tiles: c.tiles, glyphs: c.glyphs || '', sprite: c.sprite || '',
        worker: window.HH_MAPA.worker, lang: HH.lang || 'es', maxZoom: 14, t: (x) => (HH.t ? HH.t(x) : x),
      }, puntos, o);
    }).catch(() => {
      if (el.isConnected) el.innerHTML = '<div class="nr-mapa-load">No se pudo cargar el mapa. Probá de nuevo más tarde.</div>';
    });
  };
})();
