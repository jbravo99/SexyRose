/* ============================================================
   SexyRose — prod-prelanzamiento.js (solo sitio real)
   Home provisoria (decisión de Juan, 13/11/2026): mientras está prendida en Admin → Ajustes, el servidor manda
   /api/sitio/estado sin perfiles ni lugares y ajustes.prelanzamiento = true (app/lib/prelanzamiento.js). Entonces:
   - el inicio muestra solo una portada para acompañantes: "Publicá tu perfil" (registro) y "Ya tengo cuenta" (ingreso);
   - lugares, perfiles, Cerca, Swipe, Shorts, Stars, favoritos y links vuelven al inicio (el servidor ya responde 302
     a esas direcciones; esto cubre la navegación dentro del sitio);
   - el encabezado queda con el logo, el idioma, Ingresar y Publicá tu perfil; sin barra inferior;
   - el registro de interesados no se ofrece (las cuentas que ya existen ingresan igual).
   Siguen abiertos: registro, ingreso, panel y cuenta de la acompañante, la vuelta de una compra, el ingreso de
   interesados y las páginas legales. Apagada (o en la demo, que nunca la trae), no cambia nada.
   ============================================================ */
(function () {
  'use strict';
  if (window.HH_PROD !== 'sitio' || !window.HH || window.HH_DEMO) return;
  const esc = HH.esc, icon = HH.icon;
  const activo = () => !!(HH.db && HH.db._ajustes && HH.db._ajustes.prelanzamiento === true);

  // Título y descripción de la portada: los mismos que arma el servidor (app/lib/prelanzamiento.js, SEO_PRELANZAMIENTO)
  const SEO = {
    es: { title: 'Escorts y acompañantes en Argentina | SexyRose', description: 'SexyRose: avisos de acompañantes y escorts en Argentina. Abrimos muy pronto: si sos acompañante, ya podés crear tu perfil.' },
    en: { title: 'Escorts and companions in Argentina | SexyRose', description: 'SexyRose: companion and escort ads in Argentina. Opening very soon: if you are a companion, you can already create your profile.' },
    pt: { title: 'Acompanhantes e escorts na Argentina | SexyRose', description: 'SexyRose: anúncios de acompanhantes e escorts na Argentina. Abrimos muito em breve: se você é acompanhante, já pode criar seu perfil.' },
  };
  // Textos nuevos en inglés y portugués ("Publicá tu perfil", "Ya tengo cuenta" e "Ir a mi panel" ya están en el diccionario)
  Object.assign(HH.I18N = HH.I18N || {}, {
    'Muy pronto': ['Coming soon', 'Em breve'],
    'Acompañantes y escorts en': ['Companions and escorts in', 'Acompanhantes e escorts na'],
    'Estamos por abrir. Si sos acompañante, ya podés crear tu perfil y dejarlo listo.': ["We're about to open. If you're a companion, you can already create your profile and have it ready.", 'Estamos quase abrindo. Se você é acompanhante, já pode criar seu perfil e deixá-lo pronto.'],
  });

  // Qué se ve con la home provisoria: inicio, registro e ingreso, panel y cuenta de la acompañante, la vuelta de una
  // compra y la cuenta de interesados (menos su registro). Lo demás vuelve al inicio.
  const ABIERTA = /^(inicio|registro|login|panel|cuenta|compra|cliente|404)(\.|$)/;
  const oculta = (key) => !ABIERTA.test(key) || /^cliente\.registro(\.|$)/.test(key);

  function vista() {
    const worker = !!(HH.me && HH.me());
    const principal = worker
      ? `<a class="btn lg" href="#panel" data-go="#panel">${icon('dashboard')} <span>Ir a mi panel</span></a>`
      : `<a class="btn lg" href="#registro" data-go="#registro">${icon('user')} <span>Publicá tu perfil</span></a>
         <a class="btn secondary lg" href="#login" data-go="#login"><span>Ya tengo cuenta</span></a>`;
    return `
    <section class="hero sr-pre">
      <span class="blob" style="width:420px;height:420px;left:-140px;top:-120px;background:var(--pink)"></span>
      <span class="blob" style="width:380px;height:380px;right:-120px;bottom:-140px;background:var(--berry-tint)"></span>
      <div class="container sr-pre-in">
        <span class="sr-pre-mark" aria-hidden="true">${icon('heart')}</span>
        <span class="eyebrow">Muy pronto</span>
        <h1>Acompañantes y escorts en <em>Argentina</em>.</h1>
        <p class="lead">Estamos por abrir. Si sos acompañante, ya podés crear tu perfil y dejarlo listo.</p>
        <div class="sr-pre-btns">${principal}</div>
      </div>
    </section>
    ${HH.pubFooter ? HH.pubFooter() : ''}`;
  }

  // Mismos pasos que HH.render (core.js) para una vista propia
  function pintar(forcePath) {
    HH.current = { path: 'inicio', params: {}, name: 'inicio' };
    const app = document.getElementById('app');
    app.innerHTML = vista();
    if (HH.linkify) HH.linkify(app);
    app.classList.remove('fade-in'); void app.offsetWidth; app.classList.add('fade-in');
    if (!forcePath) window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    HH.renderShell();
    document.dispatchEvent(new CustomEvent('hh:rendered', { detail: HH.current }));
  }

  const render0 = HH.render;
  HH.render = function (forcePath) {
    const on = activo();
    document.documentElement.toggleAttribute('data-prelanzamiento', on);
    if (!on) return render0.apply(this, arguments);
    if (!forcePath && HH.syncLangFromUrl) HH.syncLangFromUrl();
    const key = forcePath || HH.currentHash() || 'inicio';
    if (oculta(key)) { HH.go('#inicio', { replace: true }); return; }
    if (/^inicio(\.|$)/.test(key)) { pintar(forcePath); return; }
    return render0.apply(this, arguments);
  };

  // Encabezado: logo, idioma, Ingresar y Publicá tu perfil (con sesión, Mi panel). Sin barra inferior.
  const shell0 = HH.renderShell;
  HH.renderShell = function () {
    shell0.apply(this, arguments);
    if (!activo()) return;
    const hi = document.getElementById('headerInner');
    if (hi) {
      hi.querySelectorAll('.topnav a').forEach((a) => { if (a.getAttribute('data-go') !== '#panel') a.remove(); });
      const g = hi.querySelector('.hdr-genders'); if (g) g.replaceWith(Object.assign(document.createElement('span'), { className: 'hdr-spacer' }));
      hi.querySelectorAll('.sp-hdr-user').forEach((a) => a.remove());
    }
    const bn = document.getElementById('bottomNav'); if (bn) bn.innerHTML = '';
  };

  // SEO de la portada provisoria (título, descripción, indexable)
  const seoMeta0 = HH.seoMeta;
  if (seoMeta0) {
    HH.seoMeta = function (key) {
      const m = seoMeta0.apply(this, arguments);
      if (m && activo() && /^inicio(\.|$)/.test(key || 'inicio')) Object.assign(m, SEO[m.lang] || SEO.es, { robots: 'index,follow' });
      return m;
    };
  }

  // Sin registro de interesados: se quita el enlace "Creala gratis" del ingreso de interesados
  document.addEventListener('hh:rendered', () => {
    if (!activo()) return;
    document.querySelectorAll('#app a[data-go="#cliente.registro"], #app a[href$="/cliente/registro"]').forEach((a) => { const p = a.closest('p, .sp-esp-card'); (p || a).remove(); });
  });
})();
