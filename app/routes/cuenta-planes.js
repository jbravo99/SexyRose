// API de planes, créditos, Destacado y notificaciones para la acompañante (Planes v2). Se monta bajo /api/cuenta:
//   api.use('/cuenta', createCuentaPlanesRouter({ planes, requireCuenta, privado, sameOrigin, pool, log }));
// requireCuenta tiene que dejar la cuenta en req.cuenta (con .id) o el id en req.cuentaId, o responder 401.
// Contrato completo: FASE1-CONTRATO.md → "Planes v2, créditos y destacado".
//
//   GET  /planes                          → planes, precios, plan efectivo, plan mensual, saldo, pausa, cupo Star
//   GET  /plan/cotizar?plan=&periodo=     → cuánto cuesta y qué pasa (alta, renovación anticipada, subida, semana)
//   POST /plan/comprar {plan, periodo}    → paga con créditos
//   PUT  /plan/renovacion {activa}        → renovación automática on/off (también POST)
//   PUT  /plan/cambio {plan|null}         → bajar de plan en el próximo ciclo ('E' = no renovar) (también POST)
//   GET  /creditos                        → saldo, movimientos, packs, pedidos de créditos, contacto disponible
//   POST /creditos/pedidos {packId|creditos, lang}   → pedido SR-#### + whatsappUrl/telegramUrl
//   POST /creditos/pedidos/:id/comprobante (multipart: comprobante + nota) → { ok, pedido }
//   POST /creditos/pedidos/:id/cancelar   → { ok, pedido }
//   GET  /destacado  ·  POST /destacado {dias: 1|7, desde?}
//   GET  /notificaciones  ·  POST /notificaciones/leer {ids?}
//   POST /pedidos                         → 410 (los planes ya no se pagan por transferencia)
//   POST /pedidos/:id/informar|cancelar   → solo para pedidos viejos que quedaron abiertos
// Los POST/PUT exigen mismo origen + cabecera X-SR: 1 + JSON (o multipart en comprobante/informar).
import express from 'express';
import multer from 'multer';
import { PLAN_NOMBRE, PLAN_CODIGOS, PLANES_SEMANA, PLANES_DESTACADO, PlanError, CUPO_STAR } from '../lib/planes.js';
import { MIN_CARGA, MAX_CARGA, HORAS_PEDIDO, montoJson, CreditoError } from '../lib/creditos.js';
import { limitesDe, PLANES_PREVIEW } from '../lib/planes-ref.js';
import { tipoPorFirma } from '../lib/privado.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_COMPROBANTE = 8 * 1024 * 1024;
const LANGS = ['es', 'en', 'pt'];

export function createCuentaPlanesRouter({ planes, requireCuenta, privado, sameOrigin, pool, log = () => {}, notify = () => {} }) {
  const r = express.Router();
  const cred = planes.creditos;
  const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  const fail = (res, status, error, extra = {}) => res.status(status).json({ error, ...extra });
  const cid = (req) => (req.cuenta && req.cuenta.id) || req.cuentaId;
  const body = (req) => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {});

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
  const jsonOMultipart = (req, res, next) => {
    if (req.is('application/json')) return json(req, res, next);
    upload(req, res, (e) => {
      if (!e) return next();
      if (e.code === 'LIMIT_FILE_SIZE') return fail(res, 413, 'El comprobante supera los 8 MB.');
      return fail(res, 400, 'No se pudo leer el comprobante.');
    });
  };
  const guardarComprobante = async (req) => {
    if (!req.file) return null;
    const ext = tipoPorFirma(req.file.buffer);
    if (!['jpg', 'png', 'webp', 'pdf', 'heic'].includes(ext)) {
      throw new PlanError(400, 'El comprobante tiene que ser una imagen (JPG, PNG, WebP) o un PDF.');
    }
    return privado.guardar('comprobantes', req.file.buffer, ext);
  };
  const nota = (b) => (typeof b.nota === 'string' && b.nota.trim() ? b.nota.trim().slice(0, 500) : null);

  r.use(['/planes', '/plan', '/pedidos', '/creditos', '/destacado', '/notificaciones'],
    (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, requireCuenta);

  // ---------- Planes ----------
  r.get('/planes', ah(async (req, res) => {
    const id = cid(req);
    const [precios, prD, resumen, provincia, saldo, pend] = await Promise.all([
      planes.precios(), planes.preciosDestacado(), planes.resumenPlan(id), planes.provinciaDe(id), cred.saldo(id),
      pool.query(`SELECT rp.plan, rp.creado, p.estado, p.pausado_por FROM renovaciones_pendientes rp
                  LEFT JOIN perfiles p ON p.cuenta_id = rp.cuenta_id WHERE rp.cuenta_id = $1`, [id]),
    ]);
    const base = await planes.baseJson(id, precios);
    const cupo = provincia ? await planes.cupoStar(provincia, { excluir: id }) : { provincia: null, ocupadas: 0, libres: 0, total: CUPO_STAR };
    const ahora = Date.now();
    const p = pend.rows[0];
    res.json({
      precios,
      planes: PLAN_CODIGOS.map((c) => ({
        codigo: c, nombre: PLAN_NOMBRE[c], mes: precios.mes[c], semana: PLANES_SEMANA.includes(c) ? precios.semana[c] : null,
        limites: limitesDe(c), preview: PLANES_PREVIEW.has(c),
        destacado: PLANES_DESTACADO.includes(c) ? prD[c] : null, cupoProvincia: c === 'S' ? CUPO_STAR : null,
      })),
      efectivo: resumen.efectivo,
      base,
      semanas: resumen.suscripciones.filter((s) => s.periodo === 'semana' && s.estado === 'activa' && new Date(s.hasta).getTime() > ahora),
      saldo: montoJson(saldo),
      pausa: p ? {
        plan: p.plan, planNombre: PLAN_NOMBRE[p.plan], desde: p.creado, costo: montoJson(Math.round(precios.mes[p.plan] * 100)),
        perfilPausado: p.estado === 'pausado' && p.pausado_por === 'sin_saldo',
      } : null,
      suscripciones: resumen.suscripciones,
      pedidos: resumen.pedidos,
      cupoStar: { provincia: cupo.provincia, libres: cupo.libres, total: cupo.total },
    });
  }));

  r.get('/plan/cotizar', ah(async (req, res) => {
    res.json(await planes.cotizar(cid(req), { plan: String(req.query.plan || ''), periodo: String(req.query.periodo || '') }));
  }));

  r.post('/plan/comprar', guardPost, json, ah(async (req, res) => {
    const b = body(req);
    res.status(201).json({ ok: true, ...(await planes.comprar(cid(req), { plan: b.plan, periodo: b.periodo })) });
  }));

  const renovacion = ah(async (req, res) => res.json({ ok: true, ...(await planes.setRenovacion(cid(req), body(req).activa)) }));
  r.put('/plan/renovacion', guardPost, json, renovacion);
  r.post('/plan/renovacion', guardPost, json, renovacion);
  const cambio = ah(async (req, res) => res.json({ ok: true, ...(await planes.setCambio(cid(req), body(req).plan)) }));
  r.put('/plan/cambio', guardPost, json, cambio);
  r.post('/plan/cambio', guardPost, json, cambio);

  // ---------- Créditos ----------
  r.get('/creditos', ah(async (req, res) => {
    const id = cid(req);
    const [saldo, movs, precios, pedidos, contacto] = await Promise.all([
      cred.saldo(id), cred.movimientos(id, { limite: req.query.limite, antesDe: req.query.antesDe }), planes.precios(),
      cred.pedidosDeCuenta(id), cred.contacto(),
    ]);
    res.json({
      saldo: montoJson(saldo),
      movimientos: movs.items, siguiente: movs.siguiente,
      packs: (await cred.packs({ soloActivos: true, precios })).map((p) => ({
        id: p.id, nombre: p.nombre, pagaUsd: p.pagaUsd, recibe: p.recibe, bonus: p.bonus, alcanzaPara: p.alcanzaPara, masElegido: p.masElegido,
      })),
      cargaMinima: MIN_CARGA, cargaMaxima: MAX_CARGA, horasPedido: HORAS_PEDIDO,
      pedidos,
      canales: { whatsapp: Boolean(contacto.whatsapp), telegram: Boolean(contacto.telegramActivo && contacto.telegram) },
    });
  }));

  r.post('/creditos/pedidos', guardPost, json, ah(async (req, res) => {
    const b = body(req);
    const lang = LANGS.includes(b.lang) ? b.lang : 'es';
    const pedido = await cred.crearPedido(cid(req), {
      packId: b.packId ? String(b.packId).slice(0, 40) : null,
      creditos: b.packId ? null : b.creditos, lang,
    });
    res.status(201).json({ ok: true, pedido });
    // Aviso interno (Telegram): solo el código y el pack, sin datos de la acompañante
    Promise.resolve(notify(`Pedido de créditos nuevo: ${pedido.codigo}\nPack: ${pedido.packNombre}\nConfirmalo en Admin → Pedidos cuando te paguen.`, 'pedido_creditos')).catch(() => {});
  }));

  r.post('/creditos/pedidos/:id/comprobante', guardPost, (req, res, next) => {
    if (!UUID_RE.test(req.params.id)) return fail(res, 404, 'Pedido no encontrado.');
    return jsonOMultipart(req, res, next);
  }, ah(async (req, res) => {
    const b = body(req);
    const comprobanteRuta = await guardarComprobante(req);
    if (!comprobanteRuta && !nota(b)) return fail(res, 400, 'Adjuntá el comprobante (o escribí una nota).');
    res.json({ ok: true, pedido: await cred.adjuntarComprobante(cid(req), req.params.id, { comprobanteRuta, nota: nota(b) }) });
  }));

  r.post('/creditos/pedidos/:id/cancelar', guardPost, json, ah(async (req, res) => {
    if (!UUID_RE.test(req.params.id)) return fail(res, 404, 'Pedido no encontrado.');
    res.json({ ok: true, pedido: await cred.cancelarPedido(cid(req), req.params.id) });
  }));

  // ---------- Destacado ----------
  r.get('/destacado', ah(async (req, res) => res.json(await planes.infoDestacado(cid(req)))));
  r.post('/destacado', guardPost, json, ah(async (req, res) => {
    const b = body(req);
    res.status(201).json({ ok: true, ...(await planes.comprarDestacado(cid(req), { dias: b.dias, desde: b.desde ?? null })) });
  }));

  // ---------- Notificaciones ----------
  r.get('/notificaciones', ah(async (req, res) => res.json(await cred.notificaciones(cid(req), { limite: req.query.limite }))));
  r.post('/notificaciones/leer', guardPost, json, ah(async (req, res) => {
    const b = body(req);
    res.json({ ok: true, noLeidas: await cred.marcarLeidas(cid(req), Array.isArray(b.ids) ? b.ids : null) });
  }));

  // ---------- Pedidos viejos por transferencia ----------
  r.post('/pedidos', guardPost, json, ah(async () => planes.crearPedido()));

  r.post('/pedidos/:id/informar', guardPost, (req, res, next) => {
    if (!UUID_RE.test(req.params.id)) return fail(res, 404, 'Pedido no encontrado.');
    return jsonOMultipart(req, res, next);
  }, ah(async (req, res) => {
    const comprobanteRuta = await guardarComprobante(req);
    res.json({ ok: true, pedido: await planes.informar(cid(req), req.params.id, { nota: nota(body(req)), comprobanteRuta }) });
  }));

  r.post('/pedidos/:id/cancelar', guardPost, json, ah(async (req, res) => {
    if (!UUID_RE.test(req.params.id)) return fail(res, 404, 'Pedido no encontrado.');
    res.json({ ok: true, pedido: await planes.cancelar(cid(req), req.params.id) });
  }));

  // eslint-disable-next-line no-unused-vars
  r.use((e, req, res, next) => {
    if (e.type === 'entity.parse.failed') return fail(res, 400, 'Formato de datos inválido.');
    if (e.type === 'entity.too.large') return fail(res, 413, 'Los datos enviados son demasiado grandes.');
    if (e instanceof PlanError || e instanceof CreditoError || e.expose) {
      const extra = {};
      for (const k of ['codigo', 'faltan', 'saldo', 'proximaFechaLibre', 'cupo', 'activos']) if (e[k] !== undefined) extra[k] = e[k];
      return fail(res, e.status || 400, e.message, extra);
    }
    log('error cuenta-planes:', req.method, req.path, e.code || '', e.message);
    return fail(res, 500, 'Ocurrió un error. Probá de nuevo en unos minutos.');
  });
  return r;
}
