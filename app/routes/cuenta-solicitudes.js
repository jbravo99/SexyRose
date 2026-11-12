// Pedidos personalizados: lado de la acompañante. Se monta bajo /api/cuenta (ver lib/solicitudes.js).
// (/api/cuenta/pedidos ya existe para los pedidos viejos de créditos por transferencia: por eso acá es "solicitudes").
//   GET  /solicitudes                     → { items, noLeidos }
//   GET  /solicitudes/:id?since=<id>      → detalle + mensajes nuevos (el chat lo consulta cada ~4 s)
//   POST /solicitudes/:id/aceptar · /rechazar · /cerrar · /mensajes {texto}
//   POST /solicitudes/:id/items           multipart: archivo (foto o video hasta 60 s) + precio → contenido bloqueado
//   GET  /solicitudes/items/:item/archivo[?preview=1]
// Mutaciones: mismo origen + X-SR: 1.
import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import express from 'express';
import multer from 'multer';
import { SolicitudError } from '../lib/solicitudes.js';
import { ContenidoError } from '../lib/contenido.js';
import { MAX_BYTES } from '../lib/imagenes.js';
import { MAX_BYTES_SUBIDA, contenedorPorFirma, leerFirma } from '../lib/videos.js';
import * as storage from '../lib/storage.js';

export function createCuentaSolicitudesRouter({ solicitudes, requireCuenta, sameOrigin, rl, tmpDir, log = () => {} }) {
  const r = express.Router();
  const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  const fail = (res, status, error) => res.status(status).json({ ok: false, error });
  const cid = (req) => (req.cuenta && req.cuenta.id) || req.cuentaId;
  const guard = (req, res, next) => {
    if (!sameOrigin(req)) return fail(res, 403, 'Solicitud rechazada: origen no válido.');
    if (req.get('x-sr') !== '1') return fail(res, 403, 'Solicitud rechazada.');
    next();
  };
  const json = [guard, (req, res, next) => (!Number(req.headers['content-length'] || 0) || req.is('application/json') ? next() : fail(res, 415, 'Formato de datos no admitido.')), express.json({ limit: '16kb', strict: true })];
  const body = (req) => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {});

  r.use('/solicitudes', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, requireCuenta);
  r.get('/solicitudes', ah(async (req, res) => res.json(await solicitudes.listar('acompanante', cid(req)))));
  r.get('/solicitudes/items/:item/archivo', ah(async (req, res) => {
    const rel = await solicitudes.archivo('acompanante', cid(req), req.params.item, { preview: req.query.preview === '1' });
    await storage.enviarPrivadoRango(req, res, rel);
  }));
  r.get('/solicitudes/:id', ah(async (req, res) => res.json(await solicitudes.detalle('acompanante', cid(req), req.params.id, { since: req.query.since }))));
  r.post('/solicitudes/:id/aceptar', json, ah(async (req, res) => res.json(await solicitudes.aceptar(cid(req), req.params.id))));
  r.post('/solicitudes/:id/rechazar', json, ah(async (req, res) => res.json(await solicitudes.rechazar(cid(req), req.params.id))));
  r.post('/solicitudes/:id/cerrar', json, ah(async (req, res) => res.json(await solicitudes.cerrar('acompanante', cid(req), req.params.id))));
  r.post('/solicitudes/:id/mensajes', json, ah(async (req, res) => {
    const key = 'acmp-msg:' + cid(req);
    if (rl && !rl.allowed(key, 30, 60 * 1000)) return fail(res, 429, 'Estás mandando mensajes muy rápido. Esperá un momento.');
    if (rl) rl.hit(key);
    res.status(201).json(await solicitudes.mensaje('acompanante', cid(req), req.params.id, body(req).texto));
  }));

  // Contenido bloqueado: un archivo (foto hasta 12 MB o video hasta 95 MB) + precio.
  const subida = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, tmpDir),
      filename: (req, file, cb) => { req.itemId = crypto.randomUUID(); cb(null, `${req.itemId}.subida`); },
    }),
    limits: { fileSize: MAX_BYTES_SUBIDA, files: 1, fields: 3, fieldSize: 64, parts: 5, fieldNameSize: 30 },
  });
  const borrarTemp = (req) => (req.file && req.file.path ? fsp.rm(req.file.path, { force: true }).catch(() => {}) : Promise.resolve());
  r.post('/solicitudes/:id/items', guard, (req, res, next) => {
    const key = 'acmp-item:' + cid(req);
    if (rl && !rl.allowed(key, 30, 60 * 60 * 1000)) return fail(res, 429, 'Mandaste mucho contenido en poco tiempo. Probá más tarde.');
    if (rl) rl.hit(key);
    if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('multipart/form-data')) return fail(res, 415, 'Enviá el archivo como multipart/form-data.');
    subida.single('archivo')(req, res, (err) => {
      if (!err) return next();
      borrarTemp(req);
      if (err.code === 'LIMIT_FILE_SIZE') return fail(res, 413, 'El archivo pesa más de 95 MB.');
      if (err instanceof multer.MulterError) return fail(res, 400, 'No pudimos leer el archivo enviado.');
      next(err);
    });
  }, ah(async (req, res) => {
    const f = req.file;
    if (!f) return fail(res, 400, 'Elegí una foto o un video.');
    try {
      const firma = await leerFirma(f.path).catch(() => null);
      const esVideo = !!contenedorPorFirma(firma);
      const precio = (req.body && req.body.precio) || '';
      if (esVideo) {
        const out = await solicitudes.subirItem(cid(req), req.params.id, { tipo: 'video', precio, archivo: f.path, itemId: req.itemId });
        return res.status(202).json(out);
      }
      if (f.size > MAX_BYTES) { await borrarTemp(req); return fail(res, 413, 'La foto pesa más de 12 MB.'); }
      const buffer = await fsp.readFile(f.path);
      await borrarTemp(req);
      return res.status(201).json(await solicitudes.subirItem(cid(req), req.params.id, { tipo: 'foto', precio, buffer }));
    } catch (e) {
      await borrarTemp(req);
      throw e;
    }
  }));

  // eslint-disable-next-line no-unused-vars
  r.use('/solicitudes', (err, req, res, next) => {
    if (err instanceof SolicitudError || err instanceof ContenidoError) return fail(res, err.status, err.message);
    if (err.type === 'entity.parse.failed') return fail(res, 400, 'Formato de datos inválido.');
    log('error: pedidos (cuenta):', err.code || '', err.message);
    return fail(res, 500, 'Ocurrió un error. Probá de nuevo en unos minutos.');
  });
  return r;
}
