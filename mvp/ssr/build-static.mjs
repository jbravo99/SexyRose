// SexyRose · Genera el sitio estático para producción (dist/)
// Uso: node build-static.mjs --site https://tudominio.com
// Crea una carpeta por dirección (dist/argentina/buenos-aires/cena/index.html) en los tres idiomas, más
// sitemap.xml, robots.txt, 404.html, app.html (secciones privadas) y /assets. Sirve en cualquier servidor web (nginx).
// Correrlo de nuevo cuando cambian perfiles, ubicaciones o textos de SEO (en producción lo dispara la API).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRenderer } from './render.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : d; };
const site = arg('site', process.env.SITE_URL || 'http://localhost:8080');
const out = path.resolve(here, arg('out', 'dist'));

const t0 = Date.now();
const r = await createRenderer({ site });
fs.rmSync(out, { recursive: true, force: true });
const write = (rel, content) => { const f = path.join(out, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, content); };

const urls = r.sitemap().flatMap((e) => Object.values(e.urls));
let n = 0;
for (const u of urls) {
  const res = r.renderUrl(u);
  if (res.status !== 200) { console.warn('aviso:', u, '→', res.status); continue; }
  write(path.join(decodeURIComponent(u), 'index.html'), res.html); n++;
}
const nf = r.renderUrl('/404'); write('404.html', nf.html);
write('app.html', r.shell());
const a = r.assets(); write('assets/app.js', a['app.js']); write('assets/app.css', a['app.css']);
write('sitemap.xml', r.sitemapXml()); write('robots.txt', r.robotsTxt());
console.log(`ok: ${n} páginas en ${path.relative(process.cwd(), out) || '.'} (${((Date.now() - t0) / 1000).toFixed(1)} s) · sitio ${site}`);
