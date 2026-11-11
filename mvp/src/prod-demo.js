/* ============================================================
   SexyRose — prod-demo.js (la demostración pública en /demo/)
   Solo va en el paquete de la demo (app/scripts/build-sitio.py --demo → HH_SITIO_DEMO=1) y se activa con
   window.HH_DEMO = { estado: '/demo/estado.<hash>.json', real: 'https://sexyrose.net' }.
   Es el MISMO sitio que sexyrose.net (prod-sitio.js: tarjetas, historias, Destacado, barra inferior, idiomas),
   con estas diferencias:
   - Los datos salen de un JSON estático con perfiles ficticios (app/scripts/demo/perfiles.json); las fechas se
     corren a "ahora" para que las historias y los "nuevos" se vean vigentes.
   - No llama a /api: ni cuentas, ni panel, ni reportes. Publicar e ingresar llevan al sitio real.
   - WhatsApp y Telegram no se abren (los números no existen): avisa que es una demostración.
   - Direcciones con # (/demo/#/perfil/valentina): un solo archivo, sin tocar las rutas del sitio real.
   - Cartel arriba "Demostración: perfiles ficticios" + link al sitio real; noindex y canonical al sitio real.
   ============================================================ */
(function () {
  'use strict';
  const D = window.HH_DEMO;
  if (!D || window.HH_PROD !== 'sitio') return;
  HH.DEMO = true;
  const REAL = String(D.real || 'https://sexyrose.net').replace(/\/$/, '');
  const esc = HH.esc, icon = HH.icon;
  // Las imágenes de la demo (SVG abstractos) se sirven en /demo/media/
  const isImg0 = HH.isImgSrc;
  HH.isImgSrc = (x) => isImg0(x) || (typeof x === 'string' && x.startsWith('/demo/media/'));

  /* ---------- Textos propios de la demo (es / en / pt) ---------- */
  const T = {
    es: { banner: 'Demostración: perfiles ficticios.', real: 'Ver el sitio real', contacto: 'Es una demostración: los perfiles y teléfonos son ficticios. En sexyrose.net este botón abre el chat con la acompañante.', reporte: 'Es una demostración: los perfiles son ficticios y no se envían reportes. Para denunciar algo real, usá sexyrose.net/denunciar.' },
    en: { banner: 'Demo: fictional profiles.', real: 'See the real site', contacto: 'This is a demo: profiles and phone numbers are fictional. On sexyrose.net this button opens a chat with the companion.', reporte: 'This is a demo: profiles are fictional and reports are not sent. To report something real, use sexyrose.net/denunciar.' },
    pt: { banner: 'Demonstração: perfis fictícios.', real: 'Ver o site real', contacto: 'É uma demonstração: os perfis e telefones são fictícios. No sexyrose.net este botão abre a conversa com a acompanhante.', reporte: 'É uma demonstração: os perfis são fictícios e as denúncias não são enviadas. Para denunciar algo real, use sexyrose.net/denunciar.' },
  };
  const tx = (k) => (T[HH.lang] || T.es)[k] || T.es[k];
  // Vista de "Publicá / Ingresá" (se traduce con el diccionario del sitio, como el resto de las vistas)
  Object.assign(HH.I18N = HH.I18N || {}, {
    'Esto es una demostración': ['This is a demo', 'Isto é uma demonstração'],
    'Publicá tu perfil en SexyRose': ['Publish your profile on SexyRose', 'Publique seu perfil na SexyRose'],
    'Ingresá a tu cuenta': ['Log in to your account', 'Entre na sua conta'],
    'Los perfiles que ves acá son ficticios y en la demostración no se crean cuentas. Para publicar tu perfil, entrá al sitio real: el registro es gratis y tu perfil se publica cuando lo verificamos.': ['The profiles you see here are fictional and no accounts are created in the demo. To publish your profile, go to the real site: signing up is free and your profile goes live once we verify it.', 'Os perfis que você vê aqui são fictícios e na demonstração não se criam contas. Para publicar seu perfil, entre no site real: o cadastro é grátis e seu perfil é publicado quando o verificamos.'],
    'Los perfiles que ves acá son ficticios y en la demostración no hay cuentas. Para entrar a tu panel, usá el sitio real.': ['The profiles you see here are fictional and there are no accounts in the demo. To open your dashboard, use the real site.', 'Os perfis que você vê aqui são fictícios e na demonstração não há contas. Para entrar no seu painel, use o site real.'],
    'Ir a sexyrose.net': ['Go to sexyrose.net', 'Ir para sexyrose.net'],
    'Seguir viendo la demo': ['Keep browsing the demo', 'Continuar vendo a demo'],
  });

  /* ---------- Datos: JSON estático en lugar de /api ---------- */
  // Las fechas del JSON se corren para que "ahora" sea el momento de la visita (historias de hoy, perfiles nuevos).
  const FECHAS = new Set(['ahora', 'creado', 'expira', 'publicadoEn', 'actualizado']);
  function correr(o, dif) {
    if (Array.isArray(o)) { o.forEach((x) => correr(x, dif)); return; }
    if (!o || typeof o !== 'object') return;
    Object.keys(o).forEach((k) => {
      const v = o[k];
      if (FECHAS.has(k) && typeof v === 'string') { const t = Date.parse(v); if (!Number.isNaN(t)) o[k] = new Date(t + dif).toISOString(); } else if (v && typeof v === 'object') correr(v, dif);
    });
  }
  const json = (data, status) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  let estado = null;
  const fetch0 = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    let path = url;
    try { const u = new URL(url, location.href); if (u.origin === location.origin) path = u.pathname; } catch (e) { /* */ }
    if (!/^\/api(\/|$)/.test(path)) return fetch0(input, init);
    if (path === '/api/sitio/estado') {
      estado = estado || fetch0(D.estado, { credentials: 'same-origin' })
        .then((r) => { if (!r.ok) throw new Error('estado ' + r.status); return r.json(); })
        .then((e) => { correr(e, Date.now() - Date.parse(e.ahora || new Date().toISOString())); return e; })
        .catch((err) => { estado = null; throw err; });
      return estado.then((e) => json(JSON.parse(JSON.stringify(e)), 200), () => json({ ok: false, error: 'No hay conexión. Revisá internet y probá de nuevo.' }, 503));
    }
    // Cuentas, panel, reportes: nada sale de la demo
    return Promise.resolve(json({ ok: false, error: 'No disponible en la demostración.' }, 403));
  };

  /* ---------- Publicar / ingresar / panel → sitio real ---------- */
  const REAL_PATHS = {
    registro: { es: '/registro', en: '/en/sign-up', pt: '/pt/cadastro' },
    login: { es: '/ingresar', en: '/en/login', pt: '/pt/entrar' },
  };
  const realUrl = (cual) => REAL + ((REAL_PATHS[cual] || {})[HH.lang] || (REAL_PATHS[cual] || {}).es || '/');
  const CUENTA = /^(panel|login|registro|cuenta)(\.|$)/;
  function vistaCuenta(a) {
    const reg = a === 'registro';
    return `<div class="container"><div class="auth-wrap"><div class="auth-card sr-demo-card">
      <div><span class="eyebrow">Esto es una demostración</span><h2>${reg ? 'Publicá tu perfil en SexyRose' : 'Ingresá a tu cuenta'}</h2>
      <p class="small muted" style="margin-top:6px">${reg ? 'Los perfiles que ves acá son ficticios y en la demostración no se crean cuentas. Para publicar tu perfil, entrá al sitio real: el registro es gratis y tu perfil se publica cuando lo verificamos.' : 'Los perfiles que ves acá son ficticios y en la demostración no hay cuentas. Para entrar a tu panel, usá el sitio real.'}</p></div>
      <a class="btn lg block" href="${esc(realUrl(reg ? 'registro' : 'login'))}" rel="noopener">${icon(reg ? 'plus' : 'user')} Ir a sexyrose.net</a>
      <a class="btn ghost block" href="#inicio" data-go="#inicio">Seguir viendo la demo</a>
    </div></div></div>`;
  }
  const render1 = HH.render;
  HH.render = function (forcePath) {
    if (!forcePath && HH.syncLangFromUrl) HH.syncLangFromUrl();
    const key = forcePath || HH.currentHash();
    if (!HH.db || !CUENTA.test(key)) return render1.apply(this, arguments);
    const a = key.split('.')[0];
    HH.current = { path: key, params: {}, name: a };
    const app = document.getElementById('app');
    app.innerHTML = vistaCuenta(a);
    if (HH.linkify) HH.linkify(app);
    if (!forcePath) window.scrollTo(0, 0);
    HH.renderShell();
    document.dispatchEvent(new CustomEvent('hh:rendered', { detail: HH.current }));
    return undefined;
  };
  HH.requireRole = function () { HH.go('#registro'); return false; };

  /* ---------- Contacto y reportes: solo un aviso ---------- */
  document.addEventListener('click', (ev) => {
    const a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
    if (!a) return;
    const h = a.getAttribute('href') || '';
    if (/^https:\/\/wa\.me\/\d/.test(h) || /^https:\/\/(t\.me|telegram\.me)\//.test(h) || /^tel:/.test(h)) {
      ev.preventDefault(); ev.stopPropagation();
      HH.toast(tx('contacto'), { type: 'warn' });
    }
  }, true);
  HH.actions.pubReport = function () { HH.toast(tx('reporte'), { type: 'warn' }); };

  /* ---------- Cartel, título, robots y canonical ---------- */
  function cartel() {
    const b = document.getElementById('srDemoBanner'); if (!b) return;
    const t = b.querySelector('[data-k="banner"]'); const l = b.querySelector('a');
    if (t) t.textContent = tx('banner');
    if (l) { l.textContent = tx('real'); l.href = REAL + (HH.lang === 'es' ? '/' : '/' + HH.lang + '/'); }
  }
  function meta(sel, crear) {
    let m = document.head.querySelector(sel);
    if (!m) { m = crear(); document.head.appendChild(m); }
    return m;
  }
  document.addEventListener('hh:rendered', () => {
    cartel();
    setTimeout(() => {
      meta('meta[name="robots"]', () => Object.assign(document.createElement('meta'), { name: 'robots' })).content = 'noindex,nofollow';
      meta('link[rel="canonical"]', () => Object.assign(document.createElement('link'), { rel: 'canonical' })).href = REAL + '/';
      document.head.querySelectorAll('link[rel="alternate"][hreflang]').forEach((x) => x.remove());
      if (!/demo/i.test(document.title)) document.title = document.title.replace(/\s*$/, '') + ' · Demo';
    }, 0);
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', cartel); else cartel();
})();
