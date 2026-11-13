// API de ubicaciones para el panel de la acompañante (elegir dónde está): /api/ubicaciones/...
//   GET provincias                     → { items: [{ id, nombre }] }  provincias activas (incluye Capital Federal)
//   GET buscar?provincia=<id>&q=<texto> → { items: [{ id, nombre, tipo, camino, detalle? }] } hasta 10 localidades
//                                          de esa provincia (sin acentos; primero las que empiezan con lo escrito)
//   GET barrios                        → { items: [{ id, nombre }] }  barrios de Capital Federal (CABA)
// Son datos públicos (nombres de lugares); van con límite por IP. El sitio público no usa esta API: el selector del
// inicio trabaja con los lugares que vienen en /api/sitio/estado (solo los que tienen perfiles).
import express from 'express';
import { cargarCatalogos, buscarUbicaciones } from '../lib/catalogos.js';
import { CABA_ID } from '../lib/georef.js';

const enOrden = (a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });

export function createUbicacionesRouter({ pool, rl, ipHash, state }) {
  const r = express.Router();
  const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  r.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (state && !state.dbReady) return res.status(503).json({ ok: false, error: 'El servicio no está disponible en este momento.' });
    const key = 'ubic:' + ipHash(req);
    if (!rl.allowed(key, 300, 60 * 1000)) return res.status(429).json({ ok: false, error: 'Demasiadas búsquedas seguidas. Probá de nuevo en un minuto.' });
    rl.hit(key);
    next();
  });
  const activa = (cat, u) => { let cur = u; let g = 0; while (cur && g++ < 10) { if (!cur.activa) return false; cur = cur.padre ? cat.ubic.get(cur.padre) : null; } return true; };

  r.get('/provincias', ah(async (req, res) => {
    const cat = await cargarCatalogos(pool);
    const items = cat.ubicaciones.filter((u) => u.tipo === 'provincia' && activa(cat, u)).map((u) => ({ id: u.id, nombre: u.nombre })).sort(enOrden);
    res.json({ ok: true, items });
  }));

  r.get('/buscar', ah(async (req, res) => {
    const provincia = String(req.query.provincia || '').slice(0, 80);
    const q = String(req.query.q || '').slice(0, 60);
    const cat = await cargarCatalogos(pool);
    const p = cat.ubic.get(provincia);
    if (!p || p.tipo !== 'provincia' || !activa(cat, p)) return res.status(400).json({ ok: false, error: 'Elegí primero la provincia.' });
    res.json({ ok: true, items: buscarUbicaciones(cat.indiceUbic, provincia, q, 10) });
  }));

  r.get('/barrios', ah(async (req, res) => {
    const cat = await cargarCatalogos(pool);
    const items = cat.ubicaciones.filter((u) => u.tipo === 'barrio' && u.padre === CABA_ID && activa(cat, u)).map((u) => ({ id: u.id, nombre: u.nombre })).sort(enOrden);
    res.json({ ok: true, items });
  }));

  return r;
}
