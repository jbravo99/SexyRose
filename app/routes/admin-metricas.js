// Admin → Métricas: GET ${A}/api/metricas?periodo=7d|30d|90d|12m → todas las series del período (lib/metricas.js).
// GET ${A}/api/metricas/exportar?periodo=… → el mismo período en una planilla de Excel (.xlsx, lib/metricas-excel.js).
// Mismo Basic Auth del panel (se monta bajo admin). Solo lectura.
import express from 'express';
import { metricasPeriodo, PERIODOS } from '../lib/metricas.js';
import { excelMetricas, nombreArchivo } from '../lib/metricas-excel.js';

export function createAdminMetricasRouter({ pool, planes, ahora = null }) {
  const r = express.Router();
  const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  const periodoDe = (req, res) => {
    const periodo = String(req.query.periodo || '30d');
    if (!PERIODOS[periodo]) { res.status(400).json({ error: 'Período inválido: 7d, 30d, 90d o 12m.' }); return null; }
    return periodo;
  };
  const datos = (periodo) => metricasPeriodo(pool, { periodo, ahora: typeof ahora === 'function' ? ahora() : ahora, planes });
  r.get('/metricas', ah(async (req, res) => {
    const periodo = periodoDe(req, res); if (!periodo) return;
    res.json(await datos(periodo));
  }));
  r.get('/metricas/exportar', ah(async (req, res) => {
    const periodo = periodoDe(req, res); if (!periodo) return;
    const d = await datos(periodo);
    const buf = excelMetricas(d);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nombreArchivo(d)}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(buf);
  }));
  return r;
}
