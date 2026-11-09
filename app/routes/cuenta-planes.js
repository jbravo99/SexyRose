// API de planes para la acompañante (Fase 2, agente B). Se monta bajo /api/cuenta:
//   api.use('/cuenta', createCuentaPlanesRouter({ planes, requireCuenta, privado, sameOrigin, pool, log }));
// requireCuenta (agente A) tiene que dejar la cuenta en req.cuenta (con .id) o el id en req.cuentaId, o responder 401.
//
//   GET  /planes                      → { precios, planes, efectivo, suscripciones, pedidos, transferencia, cupoStar }
//   POST /pedidos {plan, periodo}     → { ok, pedido }
//   POST /pedidos/:id/informar        → JSON {nota} o multipart (comprobante opcional + nota) → { ok, pedido }
//   POST /pedidos/:id/cancelar        → { ok, pedido }
// Los POST exigen mismo origen + cabecera X-SR: 1 + JSON (o multipart en informar).
import express from 'express';
import multer from 'multer';
import { PLAN_NOMBRE, PLAN_CODIGOS, PLANES_SEMANA, PlanError, CUPO_STAR } from '../lib/planes.js';
import { tipoPorFirma } from '../lib/privado.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_COMPROBANTE = 8 * 1024 * 1024;

export function createCuentaPlanesRouter({ planes, requireCuenta, privado, sameOrigin, pool, log = () => {} }) {
  const r = express.Router();
  const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  const fail = (res, status, error) => res.status(status).json({ error });
  const cid = (req) => (req.cuenta && req.cuenta.id) || req.cuentaId;

  const guardPost = (req, res, next) => {
    if (!sameOrigin(req)) return fail(res, 403, 'Solicitud rechazada: origen no válido.');
    if (req.get('x-sr') !== '1') return fail(res, 403, 'Solicitud rechazada.');
    if (!req.is('application/json') && !req.is('multipart/form-data')) return fail(res, 415, 'Formato de datos no admitido.');
    next();
  };
  const json = express.json({ limit: '20kb', strict: true });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_COMPROBANTE, files: 1, fields: 5, fieldSize: 2000, parts: 8 },
  }).single('comprobante');

  r.use(['/planes', '/pedidos'], (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, requireCuenta);

  r.get('/planes', ah(async (req, res) => {
    const id = cid(req);
    const [precios, resumen, transf, provincia] = await Promise.all([
      planes.precios(), planes.resumenPlan(id),
      pool.query("SELECT valor FROM ajustes WHERE clave = 'transferencia'"),
      planes.provinciaDe(id),
    ]);
    const cupo = provincia ? await planes.cupoStar(provincia, { excluir: id }) : { provincia: null, ocupadas: 0, libres: 0, total: CUPO_STAR };
    const t = transf.rows[0] ? transf.rows[0].valor : '';
    res.json({
      precios,
      planes: PLAN_CODIGOS.map((c) => ({ codigo: c, nombre: PLAN_NOMBRE[c], mes: precios.mes[c], semana: PLANES_SEMANA.includes(c) ? precios.semana[c] : null })),
      efectivo: resumen.efectivo,
      suscripciones: resumen.suscripciones,
      pedidos: resumen.pedidos,
      transferencia: typeof t === 'string' ? t : (t && t.texto) || '',
      cupoStar: { provincia: cupo.provincia, libres: cupo.libres, total: cupo.total },
    });
  }));

  r.post('/pedidos', guardPost, json, ah(async (req, res) => {
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    const pedido = await planes.crearPedido(cid(req), { plan: b.plan, periodo: b.periodo });
    res.status(201).json({ ok: true, pedido });
  }));

  r.post('/pedidos/:id/informar', guardPost, (req, res, next) => {
    if (!UUID_RE.test(req.params.id)) return fail(res, 404, 'Pedido no encontrado.');
    if (req.is('application/json')) return json(req, res, next);
    upload(req, res, (e) => {
      if (!e) return next();
      if (e.code === 'LIMIT_FILE_SIZE') return fail(res, 413, 'El comprobante supera los 8 MB.');
      return fail(res, 400, 'No se pudo leer el comprobante.');
    });
  }, ah(async (req, res) => {
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    const nota = typeof b.nota === 'string' && b.nota.trim() ? b.nota.trim().slice(0, 500) : null;
    let comprobanteRuta = null;
    if (req.file) {
      const ext = tipoPorFirma(req.file.buffer);
      if (!['jpg', 'png', 'webp', 'pdf', 'heic'].includes(ext)) return fail(res, 400, 'El comprobante tiene que ser una imagen (JPG, PNG, WebP) o un PDF.');
      comprobanteRuta = await privado.guardar('comprobantes', req.file.buffer, ext);
    }
    const pedido = await planes.informar(cid(req), req.params.id, { nota, comprobanteRuta });
    res.json({ ok: true, pedido });
  }));

  r.post('/pedidos/:id/cancelar', guardPost, json, ah(async (req, res) => {
    if (!UUID_RE.test(req.params.id)) return fail(res, 404, 'Pedido no encontrado.');
    res.json({ ok: true, pedido: await planes.cancelar(cid(req), req.params.id) });
  }));

  // eslint-disable-next-line no-unused-vars
  r.use((e, req, res, next) => {
    if (e instanceof PlanError || e.expose) return fail(res, e.status || 400, e.message);
    if (e.type === 'entity.parse.failed') return fail(res, 400, 'Formato de datos inválido.');
    if (e.type === 'entity.too.large') return fail(res, 413, 'Los datos enviados son demasiado grandes.');
    log('error cuenta-planes:', req.method, req.path, e.code || '', e.message);
    return fail(res, 500, 'Ocurrió un error. Probá de nuevo en unos minutos.');
  });
  return r;
}
