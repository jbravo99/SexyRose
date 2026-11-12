// Admin → venta de contenido (Mercado Pago). Se monta bajo `${A}/api` (mismo Basic Auth; PUT con apiPost):
//   GET /contenido/resumen          → cuentas de comisión configuradas, cuál está activa, vendedoras conectadas a cada una
//   PUT /contenido/cuenta-activa    {cuenta} → cambia la cuenta que recibe la comisión
//   GET /contenido/ventas?estado=   → ventas (sin los pagos que nunca se iniciaron) y totales de las aprobadas
// La comisión (%) es el ajuste "comision" de siempre (PUT /ajustes/comision).
import express from 'express';
import { ContenidoError } from '../lib/contenido.js';

export function createAdminContenidoRouter({ contenido, apiPost, log = () => {} }) {
  const r = express.Router();
  const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  r.use('/contenido', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  r.get('/contenido/resumen', ah(async (req, res) => res.json(await contenido.resumenAdmin())));
  r.put('/contenido/cuenta-activa', apiPost, ah(async (req, res) => {
    const b = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    res.json({ ok: true, ...(await contenido.elegirCuenta(String(b.cuenta || ''))) });
  }));
  r.get('/contenido/ventas', ah(async (req, res) => res.json(await contenido.ventasAdmin({ estado: req.query.estado || null }))));
  // eslint-disable-next-line no-unused-vars
  r.use('/contenido', (err, req, res, next) => {
    if (err instanceof ContenidoError) return res.status(err.status).json({ error: err.message });
    log('error: contenido (admin):', err.code || '', err.message);
    res.status(500).json({ error: 'Ocurrió un error. Probá de nuevo en unos minutos.' });
  });
  return r;
}
