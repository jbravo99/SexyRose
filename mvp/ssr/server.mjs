// SexyRose · Servidor de prueba con render en el servidor
// Uso: node server.mjs [--port 8080] [--site http://localhost:8080]
// Cada pedido recibe la página ya armada (código 200, 301 si la dirección no es la principal, 404 si no existe).
// En producción esto vive dentro de la API (Node) detrás de nginx, con caché que se borra cuando cambia un perfil.
import http from 'node:http';
import { createRenderer } from './render.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : d; };
const port = Number(arg('port', process.env.PORT || 8080));
const site = arg('site', process.env.SITE_URL || `http://localhost:${port}`);
const r = await createRenderer({ site });
const assets = r.assets();
const PRIVATE = /^\/(en\/|pt\/)?(panel|admin|cuenta|chat)(\/|$)/;
const cache = new Map(); const TTL = 60_000;

const server = http.createServer((req, res) => {
  const u = new URL(req.url, site);
  const send = (status, type, body, extra = {}) => { res.writeHead(status, { 'content-type': type, 'cache-control': status === 200 && type.startsWith('text/html') ? 'public, max-age=60' : 'public, max-age=3600', ...extra }); res.end(body); };
  try {
    if (u.pathname === '/assets/app.js') return send(200, 'text/javascript; charset=utf-8', assets['app.js']);
    if (u.pathname === '/assets/app.css') return send(200, 'text/css; charset=utf-8', assets['app.css']);
    if (u.pathname === '/sitemap.xml') return send(200, 'application/xml; charset=utf-8', r.sitemapXml());
    if (u.pathname === '/robots.txt') return send(200, 'text/plain; charset=utf-8', r.robotsTxt());
    if (u.pathname === '/favicon.ico') return send(204, 'text/plain', '');
    if (PRIVATE.test(u.pathname)) return send(200, 'text/html; charset=utf-8', r.shell(), { 'x-robots-tag': 'noindex, nofollow' });
    const hit = cache.get(u.pathname);
    const out = hit && Date.now() - hit.at < TTL ? hit.out : r.renderUrl(u.pathname + u.search);
    if (!hit || hit.out !== out) cache.set(u.pathname, { at: Date.now(), out });
    if (out.status === 301) { res.writeHead(301, { location: out.location }); return res.end(); }
    send(out.status, 'text/html; charset=utf-8', out.html);
    console.log(out.status, u.pathname, '·', out.meta && out.meta.title);
  } catch (e) { console.error(e); send(500, 'text/plain; charset=utf-8', 'Error'); }
});
server.listen(port, () => console.log(`SexyRose con render en el servidor: ${site}  (mapa del sitio: ${site}/sitemap.xml)`));
