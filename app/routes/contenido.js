// Venta de contenido: rutas del sitio y notificaciones de Mercado Pago (ver lib/contenido.js).
//   /api/sitio  GET  /contenido/perfil/:slug      → { disponible, items: [{id, titulo, descripcion, precio}], pedidos }
//               POST /contenido/:id/comprar       → { url (Checkout Pro), token } (mismo origen + X-SR: 1; cliente con
//                                                    sesión y email confirmado, lib/clientes.js)
//               GET  /compra/:token[?payment_id=] → { estado, titulo, monto, vendedora, link (solo aprobada) } (solo su dueño)
//   /api/mp     POST /webhook?venta=<id>&data.id=<pago>&type=payment   (firmado con x-signature)
import express from 'express';
import { ContenidoError } from '../lib/contenido.js';
import { sameOrigin } from '../lib/auth.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOUR = 60 * 60 * 1000;

const errores = (log, nombre) => (err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err instanceof ContenidoError) return res.status(err.status).json({ ok: false, error: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ ok: false, error: 'Formato de datos inválido.' });
  log('error: ' + nombre + ':', err.code || '', err.message);
  return res.status(500).json({ ok: false, error: 'Ocurrió un error. Probá de nuevo en unos minutos.' });
};

export function createContenidoSitioRouter({ contenido, authCli, rl, ipHash, state, log = () => {} }) {
  const r = express.Router();
  const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  r.use(['/contenido', '/compra'], (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (state && !state.dbReady) return res.status(503).json({ ok: false, error: 'El servicio no está disponible en este momento.' });
    next();
  });

  r.get('/contenido/perfil/:slug', ah(async (req, res) => {
    if (!/^[a-z0-9-]{1,80}$/.test(req.params.slug)) return res.status(404).json({ ok: false, error: 'Perfil no encontrado.' });
    res.json(await contenido.itemsPublicos(req.params.slug));
  }));

  r.post('/contenido/:id/comprar', (req, res, next) => {
    if (!sameOrigin(req) || req.get('x-sr') !== '1') return res.status(403).json({ ok: false, error: 'Origen no permitido.' });
    next();
  }, authCli.requireCliente, authCli.requireVerificado, ah(async (req, res) => {
    if (!UUID_RE.test(req.params.id)) return res.status(404).json({ ok: false, error: 'Este contenido ya no está a la venta.' });
    const h = ipHash(req); const key = 'compra:' + h;
    if (!rl.allowed(key, 20, HOUR)) return res.status(429).json({ ok: false, error: 'Demasiados intentos desde tu conexión. Probá más tarde.' });
    rl.hit(key);
    res.json(await contenido.comprar(req.params.id, { ipHash: h, clienteId: req.cliente.id }));
  }));

  r.get('/compra/:token', authCli.requireCliente, ah(async (req, res) => {
    const key = 'vercompra:' + ipHash(req);
    if (!rl.allowed(key, 300, HOUR)) return res.status(429).json({ ok: false, error: 'Demasiados intentos. Probá más tarde.' });
    rl.hit(key);
    res.json(await contenido.compra(req.params.token, { paymentId: req.query.payment_id || req.query.collection_id || null, clienteId: req.cliente.id }));
  }));

  r.use(['/contenido', '/compra'], errores(log, 'contenido (sitio)'));
  return r;
}

export function createMpWebhookRouter({ contenido, log = () => {} }) {
  const r = express.Router();
  const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  r.post('/webhook', express.json({ limit: '20kb', type: () => true }), ah(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const h = { 'x-signature': req.get('x-signature') || '', 'x-request-id': req.get('x-request-id') || '' };
    const out = await contenido.webhook({ query: req.query || {}, headers: h, body: req.body && typeof req.body === 'object' ? req.body : {} });
    res.status(out.status).json({ ok: out.status === 200, resultado: out.resultado });
  }));
  r.use(errores(log, 'webhook de Mercado Pago'));
  return r;
}
