// Sitio público real (Fase 1): sirve el SPA del MVP en modo "sitio" (app/sitio-spa/index.html, lo genera
// app/scripts/build-sitio.py) en las direcciones reales del sitio: /, /en/, /pt/, /<país>/…, /perfil/<slug>,
// /swipe, /cerca, /stars, /links/<slug>, /registro, /ingresar, /panel/…, /cuenta/… (y sus versiones en inglés y portugués).
//
// No tapa nada más: /api, /media, /demo, el admin (ADMIN_PATH), las páginas legales (/terminos, /privacidad,
// /contenido, /trata, /denunciar), robots.txt, archivos estáticos y cualquier dirección desconocida
// (sigue de largo y termina en la 404 del servidor).
//
// SEO en el servidor (lib/seo-sitio.js): cada página sale con su título, descripción, canonical, hreflang, robots y
// og:*; un perfil, lugar o tipo de salida que no existe responde 404 (con la misma cáscara: el SPA muestra su
// página de "no encontrado"). También arma el mapa del sitio (router.sitemap(), lo usa /sitemap.xml de server.js)
// y sirve las fuentes (/assets/fonts/).
//
// Home provisoria (lib/prelanzamiento.js, Admin → Ajustes): mientras está prendida, todo lo que mostraría perfiles o
// lugares responde 302 a la portada (en su idioma) y la portada sale con su propio título y descripción.
//
// Uso en server.js (después del admin y antes de "Páginas HTML"):
//   import { createSpaSitioRouter } from './routes/spa-sitio.js';
//   app.use(createSpaSitioRouter({ config, log, pool, planes }));
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import * as storage from '../lib/storage.js';
import { paquete, enviar } from '../lib/compresion.js';
import { createSeoSitio } from '../lib/seo-sitio.js';
import { estadoSitio } from './sitio.js';
import { mapaConfig, mapaOrigenes } from '../lib/mapa.js';
import { prelanzamientoEn, ocultaEnPrelanzamiento, SEO_PRELANZAMIENTO } from '../lib/prelanzamiento.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SPA = path.join(HERE, '..', 'sitio-spa', 'index.html');

// Primera palabra de cada sección del SPA (es / en / pt). El chat no existe en el lanzamiento.
const WORDS = new Set([
  'perfil', 'profile', 'cerca', 'near-me', 'perto-de-mim', 'registro', 'sign-up', 'cadastro', 'ingresar', 'login', 'entrar',
  'swipe', 'shorts', 'stars', 'links', 'panel', 'cuenta', 'favoritos', 'favorites', 'compra', 'cliente',
]);
// Secciones privadas: no se indexan
const PRIVATE = new Set(['favoritos', 'favorites', 'panel', 'cuenta', 'ingresar', 'login', 'entrar', 'registro', 'sign-up', 'cadastro', 'compra', 'cliente']);

export const slugify = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// nonce: solo para la cáscara vieja con JS en línea. La nueva (JS y CSS en /assets) usa script-src 'self'.
export function cspSitio(nonce, mediaOrigin, mapaOrigenes = []) {
  const media = mediaOrigin ? ' ' + mediaOrigin : '';
  // Vista Mapa de Cerca: el .pmtiles (y glyphs/sprite) se piden con fetch a bunny.net (lib/mapa.js)
  const mapa = (mapaOrigenes || []).filter((o) => /^https?:\/\/[a-z0-9.[\]:-]+$/i.test(o)).map((o) => ' ' + o).join('');
  return [
    "default-src 'none'",
    nonce ? `script-src 'nonce-${nonce}'` : "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    `img-src 'self' data: blob:${media}`,
    `media-src 'self' data: blob:${media}`,
    `connect-src 'self'${mapa}`,
    "manifest-src 'self'",
    "base-uri 'none'",
    "form-action 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

const originOf = (u) => { try { return u ? new URL(u).origin : ''; } catch { return ''; } };

// Cáscara del sitio (y a su lado seo-datos.json): la misma dirección para este router y para Admin → SEO
export const archivoSpaSitio = (config = {}, spaPath) => path.resolve(spaPath || config.sitioSpaPath || process.env.SITIO_SPA_PATH || DEFAULT_SPA);

export function createSpaSitioRouter({ config = {}, log = () => {}, pool = null, planes = null, spaPath } = {}) {
  const file = archivoSpaSitio(config, spaPath);
  const publicDir = config.publicDir || path.join(HERE, '..', 'public');
  const adminPath = config.adminPath || '';
  // Mismo origen de medios que el resto del sitio (lib/storage.js ya validó la configuración de bunny.net).
  const mediaOrigin = storage.mediaOrigin() || (config.storage === 'bunny' ? originOf(config.bunnyCdnUrl) : '');
  const mapaOrig = mapaOrigenes(mapaConfig());
  const spa = { html: null, mtimeMs: -1, size: -1, pq: null, pqI18n: null, inline: false };
  let warned = false;
  // JS y CSS del sitio (app/sitio-spa/assets/app.<hash>.js|css): el nombre cambia con el contenido, así que se
  // guardan en caché un año. Se leen una vez y se comprimen en segundo plano (brotli/gzip).
  const assetsDir = path.join(path.dirname(file), 'assets');
  const ASSET_RE = /^(?:(app|i18n|fuentes|mapa|mapa-worker)\.[0-9a-f]{8,64}\.(js|css)|fonts\/[a-z0-9-]{1,60}\.[0-9a-f]{8,64}\.woff2)$/;
  const TIPOS = { js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', woff2: 'font/woff2' };
  const assets = new Map();
  async function leerAsset(name) {
    const hit = assets.get(name); if (hit) return hit;
    let buf; try { buf = await fs.readFile(path.join(assetsDir, name)); } catch { return null; }
    const ext = name.split('.').pop();
    // woff2 ya viene comprimido: no se vuelve a comprimir
    const a = { p: ext === 'woff2' ? Object.assign(paquete(buf), { cod: () => null }) : paquete(buf), type: TIPOS[ext] };
    if (ext !== 'woff2') a.p.preparar().catch(() => {});
    assets.set(name, a);
    return a;
  }
  // Al arrancar, dejar comprimidos los assets que haya (sin bloquear)
  fs.readdir(assetsDir).then((ls) => ls.filter((n) => ASSET_RE.test(n)).forEach((n) => { leerAsset(n).catch(() => {}); })).catch(() => {});

  // Hoja de fuentes propias para las páginas del servidor (/terminos, /privacidad…): assets/fuentes.<hash>.css.
  // Se busca una vez por minuto; sin build no hay hoja y esas páginas usan las fuentes del sistema.
  const fuentes = { href: null, at: 0 };
  async function fuentesHref() {
    if (Date.now() - fuentes.at < 60 * 1000) return fuentes.href;
    fuentes.at = Date.now();
    try { const n = (await fs.readdir(assetsDir)).find((x) => /^fuentes\.[0-9a-f]{8,64}\.css$/.test(x)); fuentes.href = n ? '/assets/' + n : null; } catch { fuentes.href = null; }
    return fuentes.href;
  }

  async function leerSpa() {
    let st;
    try { st = await fs.stat(file); } catch { spa.html = null; spa.mtimeMs = -1; return null; }
    if (spa.html !== null && st.mtimeMs === spa.mtimeMs && st.size === spa.size) return spa.html;
    let html = await fs.readFile(file, 'utf8');
    // Cáscara nueva: sin <script> en línea. Se le agrega el preconnect al CDN de fotos y queda lista comprimida.
    spa.inline = /<script(?![^>]*\bsrc=)[^>]*>/i.test(html);
    html = html.replace('<!--SR:PRECONNECT-->', mediaOrigin ? `<link rel="preconnect" href="${mediaOrigin}" crossorigin><link rel="dns-prefetch" href="${mediaOrigin}">` : '');
    // Diccionario inglés/portugués: en /en/… y /pt/… se pide junto con el JS (preload); en español no se baja
    const i18n = html.match(/<!--SR:I18N (\/assets\/i18n\.[0-9a-f]+\.js)-->\n?/);
    const conI18n = i18n ? html.replace(i18n[0], `<link rel="preload" href="${i18n[1]}" as="script">\n`) : html;
    if (i18n) html = html.replace(i18n[0], '');
    spa.html = html;
    spa.pq = spa.inline ? null : paquete(html);
    spa.pqI18n = spa.inline ? null : paquete(conI18n);
    spa.mtimeMs = st.mtimeMs; spa.size = st.size;
    return spa.html;
  }

  // SEO en el servidor: con la base y app/sitio-spa/seo-datos.json (si falta alguno, la cáscara sale como siempre)
  const seo = pool ? createSeoSitio({ datosPath: path.join(path.dirname(file), 'seo-datos.json'), siteUrl: config.siteUrl || '', estado: () => estadoSitio(pool, planes) }) : null;
  // Cáscaras ya armadas por página (título y etiquetas propias), comprimidas; las últimas 300
  const porPagina = new Map();
  function paquetePagina(html) {
    const k = crypto.createHash('sha1').update(html).digest('base64');
    let pq = porPagina.get(k);
    if (pq) { porPagina.delete(k); porPagina.set(k, pq); return pq; }
    pq = paquete(html, { calidadBr: 5 });
    porPagina.set(k, pq);
    if (porPagina.size > 300) porPagina.delete(porPagina.keys().next().value);
    return pq;
  }

  // Países activos (slug del nombre e id), con caché de 5 minutos. Sin base: solo "argentina".
  const paises = { set: new Set(['argentina']), at: 0 };
  async function esPais(seg) {
    if (pool && Date.now() - paises.at > 5 * 60 * 1000) {
      paises.at = Date.now();
      try {
        const { rows } = await pool.query("SELECT id, nombre FROM ubicaciones WHERE tipo = 'pais' AND activa IS NOT FALSE");
        if (rows.length) paises.set = new Set(rows.flatMap((r) => [String(r.id), slugify(r.nombre)]));
      } catch (e) { /* la tabla puede no existir todavía: queda la lista anterior */ }
    }
    return paises.set.has(seg);
  }
  // ¿Existe una página HTML del servidor con ese nombre? (/terminos, /privacidad, …): esas no se tocan
  const paginas = new Map();
  async function esPaginaServidor(seg) {
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(seg)) return false;
    const hit = paginas.get(seg); if (hit && Date.now() - hit.at < 60 * 1000) return hit.v;
    let v = false; try { await fs.access(path.join(publicDir, seg + '.html')); v = true; } catch { /* */ }
    paginas.set(seg, { v, at: Date.now() });
    return v;
  }

  const r = express.Router();
  r.use(async (req, res, next) => {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      const p = req.path;
      if (p.startsWith('/assets/')) {
        const name = p.slice(8);
        if (!ASSET_RE.test(name)) return next();
        const a = await leerAsset(name);
        if (!a) return next();
        return enviar(req, res, a.p, { 'Content-Type': a.type, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
      }
      if (adminPath && (p === adminPath || p.startsWith(adminPath + '/'))) return next();
      if (/^\/(api|media|demo|healthz)(\/|$)/.test(p) || p === '/robots.txt' || p === '/sitemap.xml') return next();
      let segs;
      try { segs = p.split('/').filter(Boolean).map((s) => decodeURIComponent(s).toLowerCase()); } catch { return next(); }
      if (segs.some((s) => s.includes('.') || s.includes('\\'))) return next(); // archivos estáticos (/css/site.css, /favicon.svg) y rarezas
      const otroIdioma = segs[0] === 'en' || segs[0] === 'pt';
      const idioma = otroIdioma ? segs.shift() : 'es';
      if (segs.length > 4) return next();
      let ok = false;
      if (!segs.length) ok = true;
      else if (WORDS.has(segs[0])) ok = true;
      else if (segs.length === 1 && (await esPaginaServidor(segs[0]))) ok = false;
      else ok = await esPais(segs[0]);
      if (!ok) return next();
      // Home provisoria (lib/prelanzamiento.js): lugares, perfiles, Cerca, Swipe, Shorts, Stars, favoritos, links y el
      // registro de interesados van a la portada en el mismo idioma (302, sin caché: al apagarla vuelven solos)
      const pre = await prelanzamientoEn(pool);
      if (pre && ocultaEnPrelanzamiento(segs)) { res.set('Cache-Control', 'no-store'); return res.redirect(302, idioma === 'es' ? '/' : `/${idioma}/`); }

      const html = await leerSpa();
      if (html === null) {
        if (!warned) { warned = true; log('AVISO: falta el sitio (' + file + '): python3 app/scripts/build-sitio.py. Se sirve la portada vieja.'); }
        return next();
      }
      res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self), payment=(), usb=()');
      if (segs.length && PRIVATE.has(segs[0])) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      if (spa.pq) {
        // Cáscara chica, siempre revalidada (no-cache + ETag → 304), comprimida; con el <head> de esa página
        const headers = { 'Content-Security-Policy': cspSitio(null, mediaOrigin, mapaOrig), 'Cache-Control': 'no-cache', 'Content-Type': 'text/html; charset=utf-8' };
        let m = seo ? await seo.meta(p).catch((e) => { log('seo: ' + e.message); return null; }) : null;
        // Home provisoria: <html data-prelanzamiento> desde la cáscara, así la ventana de +18 no aparece ni antes de que
        // llegue /api/sitio/estado (agegate.js y gateTemprano en prod-sitio.js lo miran)
        const marcar = (t) => (pre ? t.replace(/<html\b/i, '<html data-prelanzamiento') : t);
        if (!m) return enviar(req, res, pre ? paquetePagina(marcar((otroIdioma ? spa.pqI18n : spa.pq).buf.toString('utf8'))) : (otroIdioma ? spa.pqI18n : spa.pq), headers);
        // Portada provisoria: título y descripción propios, indexable
        if (pre && !segs.length && m.status === 200) m = { ...m, ...(SEO_PRELANZAMIENTO[m.lang] || SEO_PRELANZAMIENTO.es), robots: 'index,follow' };
        // Dirección vieja de lugar + actividad: 301 a la página del lugar (las actividades ya no se muestran)
        if (m.status === 301 && m.location) { const q = req.originalUrl.indexOf('?'); return res.redirect(301, m.location + (q >= 0 ? req.originalUrl.slice(q) : '')); }
        if (m.status === 404) headers['X-Robots-Tag'] = 'noindex';
        return enviar(req, res, paquetePagina(marcar(seo.aplicar((otroIdioma ? spa.pqI18n : spa.pq).buf.toString('utf8'), m))), headers, m.status);
      }
      const nonce = crypto.randomBytes(16).toString('base64');
      res.setHeader('Content-Security-Policy', cspSitio(nonce, mediaOrigin, mapaOrig));
      res.setHeader('Cache-Control', 'no-cache');
      res.type('html');
      let out = html.replace(/<script\b/gi, `<script nonce="${nonce}"`);
      if (pre) out = out.replace(/<html\b/i, '<html data-prelanzamiento');
      if (req.method === 'HEAD') { res.setHeader('Content-Length', Buffer.byteLength(out)); return res.status(200).end(); }
      return res.status(200).send(out);
    } catch (e) { return next(e); }
  });
  // Mapa del sitio con los datos reales (lo sirve server.js en /sitemap.xml; extras = páginas legales ya armadas)
  r.sitemap = (extras) => (seo ? seo.sitemap(extras) : Promise.resolve(null));
  r.fuentesHref = fuentesHref;
  return r;
}
