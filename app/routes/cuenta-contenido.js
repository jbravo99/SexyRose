// Venta de contenido: API de la acompañante. Se monta bajo /api/cuenta (ver lib/contenido.js):
//   GET    /contenido                       → { disponible, comisionPct, conexion, items, ventas, max }
//   POST   /contenido/mp/conectar           → { url } (dirección de autorización de Mercado Pago)
//   GET    /contenido/mp/callback?code&state → vuelve de Mercado Pago y redirige a /panel/contenido?mp=ok|error|cancelado|en_uso
//   POST   /contenido/mp/desconectar        → { ok }
//   POST   /contenido/items {titulo, descripcion, precio, link}  · PUT /contenido/items/:id · DELETE /contenido/items/:id
// Los POST/PUT/DELETE exigen mismo origen + X-SR: 1 (+ JSON en los que llevan datos).
import express from 'express';
import { ContenidoError } from '../lib/contenido.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createCuentaContenidoRouter({ contenido, requireCuenta, sameOrigin, log = () => {} }) {
  const r = express.Router();
  const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  const fail = (res, status, error) => res.status(status).json({ error });
  const cid = (req) => (req.cuenta && req.cuenta.id) || req.cuentaId;
  const guard = (req, res, next) => {
    if (!sameOrigin(req)) return fail(res, 403, 'Solicitud rechazada: origen no válido.');
    if (req.get('x-sr') !== '1') return fail(res, 403, 'Solicitud rechazada.');
    next();
  };
  const json = [guard, (req, res, next) => (req.is('application/json') ? next() : fail(res, 415, 'Formato de datos no admitido.')), express.json({ limit: '10kb', strict: true })];

  r.use('/contenido', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  // Vuelta de Mercado Pago (navegación de arriba: la cookie de sesión viaja con SameSite=Lax)
  r.get('/contenido/mp/callback', requireCuenta, ah(async (req, res) => {
    const q = req.query || {};
    if (q.error) return res.redirect(303, '/panel/contenido?mp=cancelado');
    try {
      await contenido.completarOAuth(cid(req), { estado: String(q.state || ''), code: String(q.code || '') });
      return res.redirect(303, '/panel/contenido?mp=ok');
    } catch (e) {
      log('mercado pago: no se pudo conectar una cuenta (' + (e.code || e.message) + ')');
      return res.redirect(303, '/panel/contenido?mp=' + (e.code === 'mp_en_uso' ? 'en_uso' : 'error'));
    }
  }));

  r.use('/contenido', requireCuenta);
  r.get('/contenido', ah(async (req, res) => res.json(await contenido.panel(cid(req)))));
  r.post('/contenido/mp/conectar', guard, ah(async (req, res) => res.json(await contenido.iniciarOAuth(cid(req)))));
  r.post('/contenido/mp/desconectar', guard, ah(async (req, res) => res.json(await contenido.desconectar(cid(req)))));
  r.post('/contenido/items', json, ah(async (req, res) => res.status(201).json({ ok: true, item: await contenido.crearItem(cid(req), req.body) })));
  r.put('/contenido/items/:id', json, ah(async (req, res) => {
    if (!UUID_RE.test(req.params.id)) return fail(res, 404, 'No encontramos ese contenido.');
    res.json({ ok: true, item: await contenido.editarItem(cid(req), req.params.id, req.body) });
  }));
  r.delete('/contenido/items/:id', guard, ah(async (req, res) => {
    if (!UUID_RE.test(req.params.id)) return fail(res, 404, 'No encontramos ese contenido.');
    res.json(await contenido.borrarItem(cid(req), req.params.id));
  }));

  // eslint-disable-next-line no-unused-vars
  r.use('/contenido', (err, req, res, next) => {
    if (err instanceof ContenidoError) return fail(res, err.status, err.message);
    if (err.type === 'entity.parse.failed') return fail(res, 400, 'Formato de datos inválido.');
    if (err.type === 'entity.too.large') return fail(res, 413, 'Los datos enviados son demasiado grandes.');
    log('error: contenido (cuenta):', err.code || '', err.message);
    return fail(res, err.status >= 400 && err.status < 600 && err.name === 'MpError' ? 502 : 500, 'Ocurrió un error. Probá de nuevo en unos minutos.');
  });
  return r;
}
