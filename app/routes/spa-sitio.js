// Sitio público real (Fase 1): sirve el SPA del MVP en modo "sitio" (app/sitio-spa/index.html, lo genera
// app/scripts/build-sitio.py) en las direcciones reales del sitio: /, /en/, /pt/, /<país>/…, /perfil/<slug>,
// /swipe, /cerca, /stars, /links/<slug>, /registro, /ingresar, /panel/…, /cuenta/… (y sus versiones en inglés y portugués).
//
// No tapa nada más: /api, /media, /demo, el admin (ADMIN_PATH), las páginas legales (/terminos, /privacidad,
// /contenido, /trata, /denunciar), robots.txt, sitemap.xml, archivos estáticos y cualquier dirección desconocida
// (sigue de largo y termina en la 404 del servidor).
//
// Uso en server.js (después del admin y antes de "Páginas HTML"):
//   import { createSpaSitioRouter } from './routes/spa-sitio.js';
//   app.use(createSpaSitioRouter({ config, log, pool }));
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SPA = path.join(HERE, '..', 'sitio-spa', 'index.html');

// Primera palabra de cada sección del SPA (es / en / pt). Shorts y chat no existen en el lanzamiento.
const WORDS = new Set([
  'perfil', 'profile', 'cerca', 'near-me', 'perto-de-mim', 'registro', 'sign-up', 'cadastro', 'ingresar', 'login', 'entrar',
  'swipe', 'stars', 'links', 'panel', 'cuenta',
]);
// Secciones privadas: no se indexan
const PRIVATE = new Set(['panel', 'cuenta', 'ingresar', 'login', 'entrar', 'registro', 'sign-up', 'cadastro']);

export const slugify = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export function cspSitio(nonce, mediaOrigin) {
  const media = mediaOrigin ? ' ' + mediaOrigin : '';
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    `img-src 'self' data: blob:${media}`,
    `media-src 'self' data: blob:${media}`,
    "connect-src 'self'",
    "manifest-src 'self'",
    "base-uri 'none'",
    "form-action 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

const originOf = (u) => { try { return u ? new URL(u).origin : ''; } catch { return ''; } };

export function createSpaSitioRouter({ config = {}, log = () => {}, pool = null, spaPath } = {}) {
  const file = path.resolve(spaPath || config.sitioSpaPath || process.env.SITIO_SPA_PATH || DEFAULT_SPA);
  const publicDir = config.publicDir || path.join(HERE, '..', 'public');
  const adminPath = config.adminPath || '';
  const mediaOrigin = config.storage === 'bunny' ? originOf(config.bunnyCdnUrl) : '';
  const spa = { html: null, mtimeMs: -1, size: -1 };
  let warned = false;

  async function leerSpa() {
    let st;
    try { st = await fs.stat(file); } catch { spa.html = null; spa.mtimeMs = -1; return null; }
    if (spa.html !== null && st.mtimeMs === spa.mtimeMs && st.size === spa.size) return spa.html;
    spa.html = await fs.readFile(file, 'utf8');
    spa.mtimeMs = st.mtimeMs; spa.size = st.size;
    return spa.html;
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
      if (adminPath && (p === adminPath || p.startsWith(adminPath + '/'))) return next();
      if (/^\/(api|media|demo|healthz)(\/|$)/.test(p) || p === '/robots.txt' || p === '/sitemap.xml') return next();
      let segs;
      try { segs = p.split('/').filter(Boolean).map((s) => decodeURIComponent(s).toLowerCase()); } catch { return next(); }
      if (segs.some((s) => s.includes('.') || s.includes('\\'))) return next(); // archivos estáticos (/css/site.css, /favicon.svg) y rarezas
      if (segs[0] === 'en' || segs[0] === 'pt') segs.shift();
      if (segs.length > 4) return next();
      let ok = false;
      if (!segs.length) ok = true;
      else if (WORDS.has(segs[0])) ok = true;
      else if (segs.length === 1 && (await esPaginaServidor(segs[0]))) ok = false;
      else ok = await esPais(segs[0]);
      if (!ok) return next();

      const html = await leerSpa();
      if (html === null) {
        if (!warned) { warned = true; log('AVISO: falta el sitio (' + file + '): python3 app/scripts/build-sitio.py. Se sirve la portada vieja.'); }
        return next();
      }
      const nonce = crypto.randomBytes(16).toString('base64');
      res.setHeader('Content-Security-Policy', cspSitio(nonce, mediaOrigin));
      res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self), payment=(), usb=()');
      res.setHeader('Cache-Control', 'no-cache');
      if (segs.length && PRIVATE.has(segs[0])) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      res.type('html');
      const out = html.replace(/<script\b/gi, `<script nonce="${nonce}"`);
      if (req.method === 'HEAD') { res.setHeader('Content-Length', Buffer.byteLength(out)); return res.status(200).end(); }
      return res.status(200).send(out);
    } catch (e) { return next(e); }
  });
  return r;
}
