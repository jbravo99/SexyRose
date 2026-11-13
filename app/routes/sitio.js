// API pública del sitio: /api/sitio/...
//   GET  estado         → todo lo que el sitio público necesita (perfiles publicados con sus destacadas, historias activas, catálogos).
//   GET  perfil/:slug   → un perfil publicado.
//   POST reporte        → denuncia sobre un perfil (misma tabla que /api/denuncia).
// El estado se arma una vez cada 30 s como máximo; invalidarSitio() fuerza recalcularlo (lo llaman cuenta y admin).
import { paquete, enviar } from '../lib/compresion.js';
import express from 'express';
import { cargarCatalogos } from '../lib/catalogos.js';
import { perfilPublico } from '../lib/perfiles.js';
import { limitesDe, planesEfectivos, destacadosVigentes, PLANES_PREVIEW } from '../lib/planes-ref.js';
import { sameOrigin } from '../lib/auth.js';
import { mezclarPrecios, mezclarDestacado } from '../lib/planes.js';

const TTL = 30 * 1000;
let cache = null;
let cacheAt = 0;
let pending = null;

export function invalidarSitio() { cache = null; }

// Historias destacadas (lib/destacadas.js): server.js pasa la instancia al arrancar.
let destacadasInst = null;
export function configurarDestacadas(d) { destacadasInst = d; }

export async function armarEstado(pool, planesInst) {
  const cat = await cargarCatalogos(pool);
  const { rows: perfiles } = await pool.query(
    `SELECT p.cuenta_id, p.slug, p.datos, p.actualizado, p.publicado_en
       FROM perfiles p JOIN cuentas c ON c.id = p.cuenta_id
      WHERE p.estado = 'publicado' AND p.verificacion = 'verificada' AND NOT p.oculto AND c.estado = 'activa'
      ORDER BY p.publicado_en DESC NULLS LAST, p.cuenta_id`,
  );
  const ids = perfiles.map((p) => p.cuenta_id);
  const [fotos, historias, planes, videos, previews, destacados] = await Promise.all([
    ids.length ? pool.query('SELECT cuenta_id, url, url_mini, ancho, alto FROM fotos WHERE cuenta_id = ANY($1) ORDER BY cuenta_id, orden, creado', [ids]) : { rows: [] },
    ids.length ? pool.query(
      "SELECT id, cuenta_id, tipo, url, url_mini, texto, segundos, ancho, alto, creado, expira FROM historias WHERE cuenta_id = ANY($1) AND estado = 'listo' AND expira > now() ORDER BY creado",
      [ids],
    ) : { rows: [] },
    planesEfectivos(ids, planesInst),
    ids.length ? pool.query(
      "SELECT id, cuenta_id, url, url_poster, segundos, ancho, alto, creado FROM videos WHERE cuenta_id = ANY($1) AND estado = 'listo' ORDER BY cuenta_id, orden, creado",
      [ids],
    ) : { rows: [] },
    ids.length ? pool.query("SELECT cuenta_id, url FROM previews WHERE cuenta_id = ANY($1) AND estado = 'listo' AND url IS NOT NULL", [ids]) : { rows: [] },
    destacadosVigentes(ids, planesInst),
  ]);
  // Destacadas: solo las que entran en el plan de cada una y con fotos o videos listos.
  const destacadasDe = destacadasInst ? await destacadasInst.publicas(ids, planes) : new Map();
  const previewDe = new Map(previews.rows.map((x) => [x.cuenta_id, x.url]));
  const videosDe = new Map();
  for (const v of videos.rows) { if (!videosDe.has(v.cuenta_id)) videosDe.set(v.cuenta_id, []); videosDe.get(v.cuenta_id).push(v); }
  const fotosDe = new Map();
  for (const f of fotos.rows) { if (!fotosDe.has(f.cuenta_id)) fotosDe.set(f.cuenta_id, []); fotosDe.get(f.cuenta_id).push(f); }
  const lista = perfiles.map((p) => {
    const plan = planes.get(p.cuenta_id) || 'E';
    // Si bajó de plan, se muestran solo las primeras fotos que entran en el límite (el resto queda guardado).
    const fs = (fotosDe.get(p.cuenta_id) || []).slice(0, limitesDe(plan).fotos);
    const vs = (videosDe.get(p.cuenta_id) || []).slice(0, limitesDe(plan).videos);
    // Clip de 5 s de la tarjeta: desde Plata (si baja a Bronce deja de verse; queda guardado).
    const preview = PLANES_PREVIEW.has(plan) && previewDe.get(p.cuenta_id) ? { url: previewDe.get(p.cuenta_id) } : null;
    // Destacado: atado al plan con el que se compró y a la provincia actual del perfil.
    const prov = String((p.datos && p.datos.provincia) || '').trim().toLowerCase();
    const destacado = (destacados.get(p.cuenta_id) || []).some((d) => d.plan === plan && String(d.provincia).trim().toLowerCase() === prov);
    const pub = perfilPublico({ cuentaId: p.cuenta_id, slug: p.slug, datos: p.datos, fotos: fs, videos: vs, preview, plan, destacado, actualizado: p.actualizado, publicadoEn: p.publicado_en }, cat.ubic);
    const hl = destacadasDe.get(p.cuenta_id);
    return hl ? { ...pub, destacadas: hl } : pub;
  });
  const aj = cat.ajustes;
  return {
    ahora: new Date().toISOString(),
    ajustes: { portada: aj.portada ?? null, promo: aj.promo ?? '', precios: mezclarPrecios(aj.precios ?? null), destacado: mezclarDestacado(aj.destacado ?? null), textos_sitio: aj.textos_sitio ?? null, seo: aj.seo ?? null },
    ubicaciones: cat.ubicaciones.filter((u) => u.activa).map((u) => ({ id: u.id, nombre: u.nombre, tipo: u.tipo, padre: u.padre, lat: u.lat, lng: u.lng, orden: u.orden })),
    // Las actividades (tabla categorias) no se publican: el sitio es de anuncios y no menciona qué se ofrece
    intereses: cat.interesesLista.map((i) => ({ id: i.id, nombre: i.nombre, nombreEn: i.nombre_en, nombrePt: i.nombre_pt, orden: i.orden })),
    perfiles: lista,
    historias: historias.rows.map((h) => ({
      id: h.id, cuentaId: h.cuenta_id, tipo: h.tipo || 'foto', url: h.url, urlMini: h.url_mini || h.url, texto: h.texto, creado: h.creado, expira: h.expira,
      // Video: url = MP4, urlMini = portada
      ...(h.tipo === 'video' ? { segundos: h.segundos == null ? null : Number(h.segundos), ancho: h.ancho, alto: h.alto } : {}),
    })),
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

  // El estado es lo único que el sitio pide al entrar: va comprimido (brotli/gzip), con ETag (304 si no cambió)
  // y caché corta en el navegador y en Cloudflare (se rearma cada 30 s o al cambiar algo).
  const paquetes = new WeakMap();
  r.get('/estado', ah(async (req, res) => {
    const e = await estadoSitio(pool, ctx.planes);
    let p = paquetes.get(e);
    if (!p) { p = paquete(JSON.stringify(e), { calidadBr: 5 }); paquetes.set(e, p); }
    return enviar(req, res, p, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=30, stale-while-revalidate=60' });
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
    if (d.categoria !== 'otro' && notify) notify(`Reporte urgente sobre un perfil\nID: ${rows[0].id}\nRevisar en el panel de admin.`, 'denuncia');
  }));

  return r;
}
