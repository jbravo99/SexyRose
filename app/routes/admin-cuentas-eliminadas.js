// Admin: eliminar la cuenta de una acompañante y lista de cuentas eliminadas (lib/cuentas-eliminadas.js).
// Se monta bajo `${A}/api` (mismo Basic Auth; la eliminación con apiPost: JSON + X-SR-Admin: 1 + mismo origen).
//
//   POST /acompanantes/:id/eliminar {motivo}  → elimina todo (no se puede deshacer); motivo de 10 a 500 caracteres
//   GET  /cuentas-eliminadas?q=               → registro, la más nueva primero (busca por email, WhatsApp o nombre)
import express from 'express';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createAdminCuentasEliminadasRouter({ eliminadas, apiPost, adminUser = 'admin', log = () => {} }) {
  const r = express.Router();
  const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  r.use('/cuentas-eliminadas', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  r.post('/acompanantes/:id/eliminar', apiPost, ah(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'Cuenta no encontrada.' });
    const b = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const r2 = await eliminadas.eliminar(req.params.id, { motivo: b.motivo, por: adminUser });
    res.json({ ok: true, ...r2 });
  }));

  r.get('/cuentas-eliminadas', ah(async (req, res) => {
    res.json(await eliminadas.listar({ q: typeof req.query.q === 'string' ? req.query.q : '' }));
  }));

  r.use((e, req, res, next) => {
    if (e.type === 'entity.parse.failed') return res.status(400).json({ error: 'Formato de datos inválido.' });
    if (e.expose) return res.status(e.status || 400).json({ error: e.message });
    log('error admin-cuentas-eliminadas:', req.method, req.path, e.code || '', e.message);
    next(e);
  });
  return r;
}
