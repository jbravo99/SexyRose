// SexyRose · Render del lado del servidor
// Usa el mismo código de la web (build/full.html) dentro de un DOM de Node (jsdom) para entregar cada página ya armada:
// HTML completo, <title>, descripción, canonical, hreflang y datos estructurados. Después el navegador carga /assets/app.js
// y la página sigue funcionando igual que la demo, con direcciones reales (/argentina/buenos-aires/cena).
//
// En producción, `db` llega desde la API (Postgres): perfiles publicados, ubicaciones, categorías y ajustes de SEO.
// En la demo se usan los datos de ejemplo (seed).
import { JSDOM, VirtualConsole } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const BUILD = path.resolve(here, '..', 'build', 'full.html');

export async function createRenderer({ site, db, html } = {}) {
  site = String(site || 'http://localhost:8080').replace(/\/$/, '');
  html = html || fs.readFileSync(BUILD, 'utf8');
  const vc = new VirtualConsole();
  vc.on('error', (...a) => console.error('[ssr]', ...a));
  vc.on('jsdomError', (e) => { if (!/Not implemented|Could not load link|Could not parse CSS/.test(e.message)) console.error('[ssr]', e.message); });
  const dom = new JSDOM(html.replace(/<html(\s|>)/, '<html data-routing="path"$1'), {
    url: site + '/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(w) {
      w.HH_SSR = true;
      w.scrollTo = () => {};
      w.matchMedia = w.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
      w.IntersectionObserver = w.IntersectionObserver || class { observe() {} unobserve() {} disconnect() {} };
      Object.defineProperty(w.navigator, 'languages', { value: ['es-AR', 'es'] });
    },
  });
  const w = dom.window;
  await new Promise((r) => (w.document.readyState === 'loading' ? w.document.addEventListener('DOMContentLoaded', () => setTimeout(r, 0)) : setTimeout(r, 0)));
  const HH = w.HH;
  if (!HH || !HH._booted) throw new Error('La web no arrancó dentro del render (revisá build/full.html)');
  if (db) { HH.db = db; }
  HH.settings().seo = Object.assign({}, HH.settings().seo || {}, { siteUrl: site });

  // Recursos estáticos: el código y los estilos van en archivos aparte (se guardan en caché en el navegador)
  const doc = w.document;
  const bundle = [...doc.querySelectorAll('script:not([src]):not([type])')].map((s) => s.textContent).find((t) => t.includes('===== core.js'));
  const css = () => [...doc.querySelectorAll('style')].map((s) => s.textContent).join('\n');

  function renderUrl(url) {
    const u = new URL(url, site + '/');
    // Las mayúsculas y la barra final no cuentan: se redirige a la dirección principal
    let pathname = u.pathname;
    w.history.replaceState(null, '', pathname);
    if (HH.closeModal) HH.closeModal();
    HH.render();
    if (HH.lang !== 'es' && HH.translateNode) HH.translateNode(doc.body);
    const m = HH.seoCurrent || HH.seoMeta(HH.current.path);
    const want = HH.urlOf(HH.current.path, HH.lang);
    if (m.status === 200 && want !== pathname && decodeURIComponent(want) !== decodeURIComponent(pathname)) return { status: 301, location: want + u.search };
    // Copia del documento, sin el código en línea ni los estilos (van por /assets/)
    const clone = doc.documentElement.cloneNode(true);
    clone.querySelectorAll('script:not([src]):not([type="application/ld+json"])').forEach((s) => s.remove());
    clone.querySelectorAll('style').forEach((s) => s.remove());
    clone.querySelectorAll('#supFab,#supPanel,#hhLangHint').forEach((s) => s.remove());
    const appEl = clone.querySelector('#app'); if (appEl) appEl.classList.remove('fade-in'); // sin animación de entrada: el contenido se ve apenas llega
    const head = clone.querySelector('head');
    // <title>, <meta> y <link> del armado de un solo archivo quedan en el body: van al <head>
    clone.querySelectorAll('body > title, body > meta, body > link').forEach((el) => head.appendChild(el));
    const t = head.querySelector('title'); if (t) head.insertBefore(t, head.querySelector('meta[name="description"]') || null);
    const link = doc.createElement('link'); link.rel = 'stylesheet'; link.href = '/assets/app.css'; head.appendChild(link);
    const vp = head.querySelector('meta[name="viewport"]'); if (!vp) { const v = doc.createElement('meta'); v.name = 'viewport'; v.content = 'width=device-width, initial-scale=1, viewport-fit=cover'; head.prepend(v); }
    const sc = doc.createElement('script'); sc.src = '/assets/app.js'; sc.defer = true; clone.querySelector('body').appendChild(sc);
    return { status: m.status, key: HH.current.path, lang: HH.lang, meta: { title: m.title, robots: m.robots, canonical: m.canonical }, html: '<!doctype html>\n' + clone.outerHTML };
  }
  return {
    HH, window: w, renderUrl,
    assets: () => ({ 'app.js': bundle, 'app.css': css() }),
    sitemapXml: () => HH.seoSitemapXml(site),
    robotsTxt: () => HH.seoRobotsTxt(site),
    sitemap: () => HH.seoSitemap(),
    // Página vacía para secciones privadas (panel, admin, cuenta, chat): las arma el navegador
    shell: () => { const r = renderUrl('/'); return r.html.replace(/<main id="app"[^>]*>[\s\S]*?<\/main>/, '<main id="app" aria-live="polite"></main>').replace(/<meta name="robots" content="[^"]*">/, '<meta name="robots" content="noindex,nofollow">'); },
  };
}
