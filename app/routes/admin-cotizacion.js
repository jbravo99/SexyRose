// Admin → Ajustes → Cotización (dólar blue automático o valor manual). Se monta ANTES de admin-fase1 bajo `${A}/api`:
//   PUT  /ajustes/cotizacion       {valor: {modo:'auto'|'manual', valor:'venta'|'compra', arsPorUsd, nota}}
//                                   (formato viejo {arsPorUsd, nota} sin modo = manual). Pasar a 'auto' actualiza al toque.
//   POST /cotizacion/actualizar    consulta DolarApi/Bluelytics ahora (máximo una vez cada 5 minutos).
// La lectura sigue en GET /ajustes (clave cotizacion). Mismo Basic Auth; POST/PUT con apiPost.
import express from 'express';
import { validarCotizacionV2 } from '../lib/cotizacion.js';

export function createAdminCotizacionRouter({ cotizacion, apiPost, log = () => {} }) {
  const r = express.Router();
  const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  r.use(['/cotizacion', '/ajustes/cotizacion'], (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  r.put('/ajustes/cotizacion', apiPost, ah(async (req, res) => {
    const b = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    if (!('valor' in b)) return res.status(400).json({ error: 'Falta el valor.' });
    const v = validarCotizacionV2(b.valor);
    if (v.error) return res.status(400).json({ error: v.error });
    const c = await cotizacion.aplicarAdmin(v.valor);
    res.json({ ok: true, clave: 'cotizacion', valor: c });
  }));

  r.post('/cotizacion/actualizar', apiPost, ah(async (req, res) => {
    try {
      const out = await cotizacion.actualizarManual();
      res.json({ ok: !out.error, actualizada: out.actualizada, error: out.error || null, alerta: out.alerta || null, cotizacion: out.cotizacion });
    } catch (e) {
      if (e.status === 429) return res.status(429).json({ error: e.message });
      log('cotización: error en actualizar ahora:', e.code || e.message);
      throw e;
    }
  }));
  return r;
}
