// Demostración pública (/demo/): el mismo SPA del sitio real en modo demo, con perfiles ficticios.
// La genera app/scripts/build-demo.py (llama a build-sitio.py --demo) en app/public/demo/:
//   index.html                          cáscara chica (marca <!--SR:DEMO-->), siempre revalidada
//   assets/app.<hash>.js|css, i18n.<hash>.js, assets/fonts/*.woff2   caché de un año (el nombre cambia con el contenido)
//   estado.<hash>.json                   los datos ficticios (lo que en el sitio real da /api/sitio/estado)
//   media/<hash>.svg                     imágenes abstractas (no hay fotos de personas en la demo)
// Las direcciones van con # (/demo/#/perfil/valentina), así que el servidor solo entrega /demo/ y esos archivos.
// Si en la carpeta queda la demo vieja (un solo HTML sin la marca), sigue de largo y la sirve server.js como antes.
//
// Uso en server.js (antes de "Páginas HTML"):
//   import { createDemoSitioRouter } from './routes/demo-sitio.js';
//   app.use(createDemoSitioRouter({ config, log }));
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { paquete, enviar } from '../lib/compresion.js';
import { cspSitio } from './spa-sitio.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MARCA = '<!--SR:DEMO-->';
const ARCHIVO_RE = /^(?:assets\/(?:app|i18n)\.[0-9a-f]{8,64}\.(?:js|css)|assets\/fonts\/[a-z0-9-]{1,60}\.[0-9a-f]{8,64}\.woff2|media\/[0-9a-f]{8,64}\.svg|estado\.[0-9a-f]{8,64}\.json)$/;
const TIPOS = { js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', woff2: 'font/woff2', svg: 'image/svg+xml', json: 'application/json; charset=utf-8' };

export function createDemoSitioRouter({ config = {}, log = () => {}, dir } = {}) {
  const base = path.resolve(dir || config.demoDir || process.env.DEMO_DIR || path.join(config.publicDir || path.join(HERE, '..', 'public'), 'demo'));
  const shellFile = path.join(base, 'index.html');
  const shell = { pq: null, mtimeMs: -1, size: -1, nueva: false };
  const archivos = new Map();

  async function leerShell() {
    let st;
    try { st = await fs.stat(shellFile); } catch { shell.pq = null; shell.mtimeMs = -1; return null; }
    if (st.mtimeMs === shell.mtimeMs && st.size === shell.size) return shell.nueva ? shell.pq : null;
    const html = await fs.readFile(shellFile, 'utf8');
    shell.mtimeMs = st.mtimeMs; shell.size = st.size;
    shell.nueva = html.includes(MARCA);
    shell.pq = shell.nueva ? paquete(html) : null;
    if (shell.nueva) log('demo: ' + shellFile);
    return shell.pq;
  }
  async function leerArchivo(rel) {
    const hit = archivos.get(rel); if (hit) return hit;
    let buf; try { buf = await fs.readFile(path.join(base, rel)); } catch { return null; }
    const ext = rel.split('.').pop();
    const p = ext === 'woff2' ? Object.assign(paquete(buf), { cod: () => null }) : paquete(buf);
    if (ext !== 'woff2') p.preparar().catch(() => {});
    const a = { p, type: TIPOS[ext] };
    if (archivos.size > 500) archivos.clear();
    archivos.set(rel, a);
    return a;
  }

  const r = express.Router({ caseSensitive: true });
  r.use(async (req, res, next) => {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      const p = req.path;
      if (p !== '/demo/' && p !== '/demo/index.html' && !p.startsWith('/demo/')) return next();
      const pq = await leerShell();
      if (!pq) return next(); // sin demo nueva: la vieja (server.js)
      const comunes = { 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff' };
      if (p === '/demo/' || p === '/demo/index.html') {
        if (p === '/demo/index.html') return res.redirect(301, '/demo/');
        return enviar(req, res, pq, { ...comunes, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'Content-Security-Policy': cspSitio(null, '') });
      }
      const rel = p.slice('/demo/'.length);
      if (!ARCHIVO_RE.test(rel)) return next();
      const a = await leerArchivo(rel);
      if (!a) return next();
      const h = { ...comunes, 'Content-Type': a.type, 'Cache-Control': 'public, max-age=31536000, immutable' };
      // Una imagen SVG abierta sola no puede correr nada
      if (rel.endsWith('.svg')) h['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
      return enviar(req, res, a.p, h);
    } catch (e) { return next(e); }
  });
  return r;
}
