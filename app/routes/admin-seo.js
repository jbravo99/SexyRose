// Admin → SEO: títulos y descripciones para Google (portada, país, lugar, hombres y perfil, en es/en/pt), el texto
// de presentación de las páginas de lugar, el bloque al pie de la portada y el mínimo de perfiles para indexar.
// Se guardan en ajustes (clave `seo`, lib/seo-ajustes.js) y pisan las plantillas por defecto del sitio
// (app/sitio-spa/seo-datos.json) en el servidor y en el navegador. Montado bajo `${A}/api` (mismo acceso del admin):
//   GET    /seo  → { valor (lo guardado o null), defaults: { home, tpl, minProfiles }, actualizado, reglas }
//   PUT    /seo  → { valor }  guarda (valida todo; campos vacíos = texto por defecto)
//   DELETE /seo  → todo vuelve a los textos por defecto
import fs from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import { invalidarCatalogos } from '../lib/catalogos.js';
import { invalidarSitio } from './sitio.js';
import { CLAVE_SEO, validarSeo, SEO_VARS, SEO_LARGO, SEO_TIPOS, SEO_HOME_CAMPOS, SEO_CAMPOS_TIPO, SEO_MIN_PROFILES } from '../lib/seo-ajustes.js';

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; this.expose = true; } }

export function createAdminSeoRouter({ pool, apiPost, datosPath, siteUrl = '' }) {
  const r = express.Router();
  const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  const invalidar = () => { invalidarCatalogos(); invalidarSitio(); };
  // Plantillas por defecto: las mismas que usa el sitio (seo-datos.json que arma build-sitio.py)
  let cache = { mtimeMs: -1, v: null };
  async function defaults() {
    let st; try { st = await fs.stat(datosPath); } catch { return null; }
    if (cache.v && st.mtimeMs === cache.mtimeMs) return cache.v;
    try {
      const d = JSON.parse(await fs.readFile(datosPath, 'utf8')).defaults || {};
      cache = { mtimeMs: st.mtimeMs, v: { home: d.home || {}, tpl: d.tpl || {}, minProfiles: Math.max(1, Number(d.minProfiles) || 1), siteUrl: String(siteUrl || d.siteUrl || '').replace(/\/$/, '') } };
    } catch { return null; }
    return cache.v;
  }
  const reglas = { vars: SEO_VARS, largo: SEO_LARGO, tipos: SEO_TIPOS, home: SEO_HOME_CAMPOS, campos: SEO_CAMPOS_TIPO, minProfiles: SEO_MIN_PROFILES };
  const leer = async () => {
    const { rows } = await pool.query('SELECT valor, actualizado FROM ajustes WHERE clave = $1', [CLAVE_SEO]);
    return { valor: rows[0] ? rows[0].valor : null, actualizado: rows[0] ? rows[0].actualizado : null, defaults: await defaults(), reglas };
  };
  r.get('/seo', ah(async (req, res) => { res.set('Cache-Control', 'no-store'); res.json(await leer()); }));
  r.put('/seo', apiPost, ah(async (req, res) => {
    const b = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    if (!('valor' in b)) throw new HttpError(400, 'Falta el valor.');
    const v = validarSeo(b.valor);
    if (v.error) throw new HttpError(400, v.error);
    if (Object.keys(v.valor).length) {
      await pool.query(
        'INSERT INTO ajustes (clave, valor, actualizado) VALUES ($1, $2::jsonb, now()) ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado = now()',
        [CLAVE_SEO, JSON.stringify(v.valor)]);
    } else {
      await pool.query('DELETE FROM ajustes WHERE clave = $1', [CLAVE_SEO]); // todo vacío = todo por defecto
    }
    invalidar();
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, ...(await leer()) });
  }));
  r.delete('/seo', apiPost, ah(async (req, res) => {
    await pool.query('DELETE FROM ajustes WHERE clave = $1', [CLAVE_SEO]);
    invalidar();
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, ...(await leer()) });
  }));
  r.use((e, req, res, next) => {
    if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
    next(e);
  });
  return r;
}

export const datosSeoDe = (archivoSpa) => path.join(path.dirname(archivoSpa), 'seo-datos.json');
