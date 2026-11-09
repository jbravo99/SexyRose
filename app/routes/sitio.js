// API pública del sitio: /api/sitio/...
//   GET  estado         → todo lo que el sitio público necesita (perfiles publicados, historias activas, catálogos).
//   GET  perfil/:slug   → un perfil publicado.
//   POST reporte        → denuncia sobre un perfil (misma tabla que /api/denuncia).
// El estado se arma una vez cada 30 s como máximo; invalidarSitio() fuerza recalcularlo (lo llaman cuenta y admin).
import express from 'express';
import { cargarCatalogos } from '../lib/catalogos.js';
import { perfilPublico } from '../lib/perfiles.js';
import { limitesDe, planesEfectivos } from '../lib/planes-ref.js';
import { sameOrigin } from '../lib/auth.js';

const TTL = 30 * 1000;
let cache = null;
let cacheAt = 0;
let pending = null;

export function invalidarSitio() { cache = null; }

export async function armarEstado(pool, planesInst) {
  const cat = await cargarCatalogos(pool);
  const { rows: perfiles } = await pool.query(
    `SELECT p.cuenta_id, p.slug, p.datos, p.actualizado, p.publicado_en
       FROM perfiles p JOIN cuentas c ON c.id = p.cuenta_id
      WHERE p.estado = 'publicado' AND p.verificacion = 'verificada' AND NOT p.oculto AND c.estado = 'activa'
      ORDER BY p.publicado_en DESC NULLS LAST, p.cuenta_id`,
  );
  const ids = perfiles.map((p) => p.cuenta_id);
  const [fotos, historias, planes] = await Promise.all([
    ids.length ? pool.query('SELECT cuenta_id, url, url_mini, ancho, alto FROM fotos WHERE cuenta_id = ANY($1) ORDER BY cuenta_id, orden, creado', [ids]) : { rows: [] },
    ids.length ? pool.query(
      'SELECT id, cuenta_id, url, url_mini, texto, creado, expira FROM historias WHERE cuenta_id = ANY($1) AND expira > now() ORDER BY creado',
      [ids],
    ) : { rows: [] },
    planesEfectivos(ids, planesInst),
  ]);
  const fotosDe = new Map();
  for (const f of fotos.rows) { if (!fotosDe.has(f.cuenta_id)) fotosDe.set(f.cuenta_id, []); fotosDe.get(f.cuenta_id).push(f); }
  const lista = perfiles.map((p) => {
    const plan = planes.get(p.cuenta_id) || 'E';
    // Si bajó de plan, se muestran solo las primeras fotos que entran en el límite (el resto queda guardado).
    const fs = (fotosDe.get(p.cuenta_id) || []).slice(0, limitesDe(plan).fotos);
    return perfilPublico({ cuentaId: p.cuenta_id, slug: p.slug, datos: p.datos, fotos: fs, plan, actualizado: p.actualizado, publicadoEn: p.publicado_en }, cat.ubic);
  });
  const aj = cat.ajustes;
  return {
    ahora: new Date().toISOString(),
    ajustes: { portada: aj.portada ?? null, promo: aj.promo ?? '', precios: aj.precios ?? null },
    ubicaciones: cat.ubicaciones.filter((u) => u.activa).map((u) => ({ id: u.id, nombre: u.nombre, tipo: u.tipo, padre: u.padre, lat: u.lat, lng: u.lng, orden: u.orden })),
    categorias: cat.categoriasLista.filter((c) => c.activa).map((c) => ({ id: c.id, nombre: c.nombre, icono: c.icono, orden: c.orden })),
    intereses: cat.interesesLista.map((i) => ({ id: i.id, nombre: i.nombre, nombreEn: i.nombre_en, nombrePt: i.nombre_pt, orden: i.orden })),
    perfiles: lista,
    historias: historias.rows.map((h) => ({ id: h.id, cuentaId: h.cuenta_id, url: h.url, urlMini: h.url_mini || h.url, texto: h.texto, creado: h.creado, expira: h.expira })),
  };
}

export async function estadoSitio(pool, planesInst) {
  if (cache && Date.now() - cacheAt < TTL) return cache;
  if (!pending) {
    pending = armarEstado(pool, planesInst).then((e) => { cache = e; cacheAt = Date.now(); return e; }).finally(() => { pending = null; });
  }
  return pending;
}

export function createSitioRouter(ctx) {
  const { pool, rl, ipHash, validateDenuncia, notify, config, state } = ctx;
  const r = express.Router();
  const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  r.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (state && !state.dbReady) return res.status(503).json({ ok: false, error: 'El servicio no está disponible en este momento.' });
    next();
  });

  r.get('/estado', ah(async (req, res) => {
    const e = await estadoSitio(pool, ctx.planes);
    res.set('Cache-Control', 'public, max-age=15');
    res.json(e);
  }));

  r.get('/perfil/:slug', ah(async (req, res) => {
    const e = await estadoSitio(pool, ctx.planes);
    const p = e.perfiles.find((x) => x.slug === req.params.slug);
    if (!p) return res.status(404).json({ ok: false, error: 'Perfil no encontrado.' });
    res.json(p);
  }));

  r.post('/reporte', express.json({ limit: '10kb' }), ah(async (req, res) => {
    if (!sameOrigin(req) || req.headers['x-sr'] !== '1') return res.status(403).json({ ok: false, error: 'Origen no permitido.' });
    if (!req.is('application/json') || !req.body || typeof req.body !== 'object') return res.status(415).json({ ok: false, error: 'Enviá los datos en formato JSON.' });
    const key = 'rep:' + ipHash(req);
    if (!rl.allowed(key, 10, 60 * 60 * 1000)) return res.status(429).json({ ok: false, error: 'Recibimos demasiados reportes desde tu conexión. Probá más tarde.' });
    const slug = String(req.body.slug || '');
    if (!/^[a-z0-9-]{1,50}$/.test(slug)) return res.status(400).json({ ok: false, error: 'Perfil inválido.' });
    const v = validateDenuncia({
      categoria: req.body.categoria || 'otro',
      url: `${config.siteUrl}/perfil/${slug}`,
      descripcion: req.body.descripcion,
      email: req.body.email || '',
    });
    if (v.error) return res.status(400).json({ ok: false, error: v.error });
    const d = v.value;
    const { rows } = await pool.query(
      'INSERT INTO denuncias (categoria, url, descripcion, email, ip_hash) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [d.categoria, d.url, d.descripcion, d.email, ipHash(req)],
    );
    rl.hit(key);
    res.status(201).json({ ok: true, id: rows[0].id });
    if (d.categoria !== 'otro' && notify) notify(`Reporte urgente sobre un perfil\nID: ${rows[0].id}\nRevisar en el panel de admin.`);
  }));

  return r;
}
