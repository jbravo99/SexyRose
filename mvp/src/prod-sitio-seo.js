/* ============================================================
   SexyRose — prod-sitio-seo.js (sitio real y demo)
   Lo que Juan edita en Admin → SEO llega en /api/sitio/estado → ajustes.seo (app/lib/seo-ajustes.js) y pisa las
   plantillas por defecto de seo.js, igual que en el servidor (app/lib/seo-sitio.js): título y descripción de cada
   página, texto de presentación de país y lugar, bloque al pie de la portada y mínimo de perfiles para indexar.
   seo.js ya lee HH.settings().seo: acá solo se le entrega lo guardado.
   ============================================================ */
(function () {
  'use strict';
  if (window.HH_PROD !== 'sitio') return;
  const settings0 = HH.settings;
  HH.settings = function () {
    const st = settings0.apply(this, arguments);
    const aj = HH.db && HH.db._ajustes;
    const seo = aj && aj.seo && typeof aj.seo === 'object' ? aj.seo : null;
    // HH.db se arma de nuevo con cada estado (prod-sitio.js), así que sin ajuste quedan las plantillas por defecto
    if (seo) st.seo = seo;
    return st;
  };
})();
