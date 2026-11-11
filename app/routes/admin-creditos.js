// API del admin para Planes v2: créditos por acompañante, ajustes manuales, pedidos de créditos por WhatsApp,
// planes que vencen, perfiles pausados por saldo y Destacados. Se monta igual que admin-fase1 (bajo `${A}/api`):
//   const creditosAdmin = createAdminCreditosRouter({ pool, planes, privado, apiPost, adminUser, log });
//   admin.use('/api', creditosAdmin.router);
// Mismo Basic Auth; POST con apiPost (JSON + X-SR-Admin: 1 + mismo origen). Errores: { error } en castellano.
// Contrato: FASE1-CONTRATO.md → "Planes v2, créditos y destacado".
import express from 'express';
import { montoJson, aCentavos } from '../lib/creditos.js';
import { PLAN_NOMBRE } from '../lib/planes.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; this.expose = true; } }
const he = (s, m) => new HttpError(s, m);

export function createAdminCreditosRouter({ pool, planes, privado, apiPost, adminUser = 'admin', log = () => {} }) {
  const r = express.Router();
  const cred = planes.creditos;
  r.use(['/creditos', '/pedidos-creditos', '/planes', '/destacados'], (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  const uuid = (req) => { if (!UUID_RE.test(req.params.id)) throw he(404, 'No encontrado.'); return req.params.id; };
  const body = (req) => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {});

  // ---------- Créditos por acompañante ----------
  r.get('/creditos', ah(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : '';
    const args = []; let where = '';
    if (q) {
      args.push('%' + q.replace(/[\\%_]/g, (c) => '\\' + c) + '%');
      where = "WHERE c.email ILIKE $1 OR p.slug ILIKE $1 OR p.datos->>'displayName' ILIKE $1";
    }
    const { rows } = await pool.query(
      `SELECT c.id, c.email, p.slug, p.estado, p.pausado_por, p.datos->>'displayName' AS display_name,
              COALESCE(cc.centavos, 0) AS saldo, cc.actualizado
       FROM cuentas c LEFT JOIN perfiles p ON p.cuenta_id = c.id LEFT JOIN creditos_cuentas cc ON cc.cuenta_id = c.id
       ${where} ORDER BY COALESCE(cc.centavos, 0) DESC, c.creado DESC LIMIT 500`, args);
    const efect = await planes.planesEfectivos(rows.map((x) => x.id));
    res.json({
      items: rows.map((x) => ({
        cuentaId: x.id, email: x.email, slug: x.slug, displayName: x.display_name || '', perfilEstado: x.estado,
        pausadoPorSaldo: x.estado === 'pausado' && x.pausado_por === 'sin_saldo',
        plan: efect.get(x.id) || 'E', saldo: montoJson(x.saldo), actualizado: x.actualizado,
      })),
      total: rows.length,
    });
  }));

  r.get('/creditos/:id', ah(async (req, res) => {
    const id = uuid(req);
    const c = await pool.query(
      "SELECT c.email, p.slug, p.datos->>'displayName' AS display_name FROM cuentas c LEFT JOIN perfiles p ON p.cuenta_id = c.id WHERE c.id = $1", [id]);
    if (!c.rows[0]) throw he(404, 'Cuenta no encontrada.');
    const [saldo, movs, base, efectivo, pedidos] = await Promise.all([
      cred.saldo(id), cred.movimientos(id, { limite: req.query.limite || 100, antesDe: req.query.antesDe }),
      planes.baseJson(id), planes.planEfectivo(id), cred.pedidosDeCuenta(id, { limite: 50 }),
    ]);
    res.json({
      cuentaId: id, cuenta: { email: c.rows[0].email, slug: c.rows[0].slug, displayName: c.rows[0].display_name || '' },
      saldo: montoJson(saldo), plan: efectivo, base, movimientos: movs.items, siguiente: movs.siguiente, pedidos,
    });
  }));

  // Ajuste manual: { creditos: "-5.50" | 10 } o { centavos: -550 }, con motivo (obligatorio).
  r.post('/creditos/:id/ajuste', apiPost, ah(async (req, res) => {
    const id = uuid(req);
    const b = body(req);
    let centavos = null;
    if (b.centavos !== undefined && b.centavos !== null && b.centavos !== '') centavos = Number(b.centavos);
    else if (b.creditos !== undefined && b.creditos !== null && b.creditos !== '') centavos = aCentavos(String(b.creditos).replace(',', '.'));
    if (!Number.isInteger(centavos) || !centavos) throw he(400, 'Indicá cuántos créditos sumar o restar (distinto de 0, hasta 2 decimales).');
    const mov = await cred.ajusteAdmin(id, { centavos, motivo: str(b.motivo, 300), por: adminUser });
    res.json({ ok: true, movimiento: mov, saldo: montoJson(await cred.saldo(id)) });
  }));

  // ---------- Pedidos de créditos (WhatsApp) ----------
  r.get('/pedidos-creditos', ah(async (req, res) => {
    res.json(await cred.pedidosAdmin({
      estado: typeof req.query.estado === 'string' ? req.query.estado : '',
      q: typeof req.query.q === 'string' ? req.query.q : '',
    }));
  }));

  r.get('/pedidos-creditos/:id/comprobante', ah(async (req, res) => {
    const id = uuid(req);
    const { rows } = await pool.query('SELECT comprobante_ruta, codigo FROM pedidos_creditos WHERE id = $1', [id]);
    if (!rows[0]) throw he(404, 'Pedido no encontrado.');
    const f = rows[0].comprobante_ruta ? await privado.abrir(rows[0].comprobante_ruta) : null;
    if (!f) throw he(404, 'Archivo no encontrado.');
    res.set({
      'Content-Type': f.tipo, 'Content-Length': String(f.size), 'Cache-Control': 'no-store, private',
      'Content-Disposition': `inline; filename="comprobante-${rows[0].codigo}"`, 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    });
    f.stream.on('error', () => res.destroy());
    f.stream.pipe(res);
  }));

  r.post('/pedidos-creditos/:id/confirmar', apiPost, ah(async (req, res) => {
    res.json({ ok: true, ...(await cred.confirmarPedido(uuid(req), { por: adminUser })) });
  }));
  r.post('/pedidos-creditos/:id/rechazar', apiPost, ah(async (req, res) => {
    res.json({ ok: true, pedido: await cred.rechazarPedido(uuid(req), { motivo: str(body(req).motivo, 300), por: adminUser }) });
  }));
  r.post('/pedidos-creditos/:id/reabrir', apiPost, ah(async (req, res) => {
    res.json({ ok: true, pedido: await cred.reabrirPedido(uuid(req)) });
  }));

  // ---------- Planes: vencen pronto y pausadas por saldo ----------
  r.get('/planes/vencen', ah(async (req, res) => {
    const items = await planes.vencenPronto({ dias: req.query.dias || 7 });
    res.json({ items, total: items.length, sinSaldo: items.filter((x) => x.renueva && !x.alcanza).length });
  }));
  r.get('/planes/pausadas', ah(async (req, res) => {
    const items = await planes.pausadasSinSaldo();
    res.json({ items, total: items.length });
  }));

  // ---------- Destacados ----------
  r.get('/destacados', ah(async (req, res) => {
    res.json(await planes.destacadosAdmin({ estado: req.query.estado === 'todos' ? 'todos' : 'vigentes' }));
  }));
  r.post('/destacados/:id/cancelar', apiPost, ah(async (req, res) => {
    res.json({ ok: true, ...(await planes.cancelarDestacado(uuid(req), { devolver: body(req).devolver === true, por: adminUser })) });
  }));

  r.use((e, req, res, next) => {
    if (e.type === 'entity.parse.failed') return res.status(400).json({ error: 'Formato de datos inválido.' });
    if (e.expose) {
      const extra = {};
      for (const k of ['codigo', 'faltan', 'saldo']) if (e[k] !== undefined) extra[k] = e[k];
      return res.status(e.status || 400).json({ error: e.message, ...extra });
    }
    log('error admin-creditos:', req.method, req.path, e.code || '', e.message);
    next(e);
  });

  async function contadores() {
    const [pc, pa, ve] = await Promise.all([
      pool.query("SELECT count(*) FILTER (WHERE estado = 'pendiente')::int AS pendientes, count(*) FILTER (WHERE estado = 'pendiente' AND comprobante_ruta IS NOT NULL)::int AS con_comprobante FROM pedidos_creditos"),
      pool.query("SELECT count(*)::int AS n FROM renovaciones_pendientes"),
      planes.vencenPronto({ dias: 7 }),
    ]);
    return {
      pedidosCreditos: { pendientes: pc.rows[0].pendientes, conComprobante: pc.rows[0].con_comprobante },
      pausadasSinSaldo: pa.rows[0].n,
      vencen7: { total: ve.length, sinSaldo: ve.filter((x) => x.renueva && !x.alcanza).length },
    };
  }

  return { router: r, contadores, planesNombres: PLAN_NOMBRE };
}
