// Admin: moderación de pedidos personalizados y chats, interesados (clientes), créditos de todas y lo que falta en la
// ficha de cada acompañante (destacadas, packs, Mercado Pago, pedidos). Se monta bajo `${A}/api` (mismo Basic Auth;
// las mutaciones con apiPost: JSON + X-SR-Admin: 1 + mismo origen). Cada acción de moderación queda en admin_acciones.
//
//   GET    /solicitudes?estado=            → pedidos personalizados (todos los estados o uno)
//   GET    /solicitudes/:id                → pedido + chat completo + contenidos bloqueados + acciones del admin
//   GET    /solicitudes/items/:item/archivo[?preview=1] → archivo privado (solo con la sesión del panel)
//   POST   /solicitudes/:id/cerrar {motivo} → cierra el pedido (solo lectura); el motivo queda registrado
//   DELETE /solicitudes/:id/mensajes/:mid  → borra un mensaje (si lleva un contenido, también el contenido y sus archivos)
//   DELETE /solicitudes/items/:item        → borra un contenido bloqueado y sus archivos
//   GET    /clientes?q=                    → interesados con cuenta · GET /clientes/:id → compras y pedidos
//   POST   /clientes/:id/bloquear {motivo} · POST /clientes/:id/desbloquear · POST /clientes/:id/reenviar-verificacion
//   GET    /creditos-resumen?dias=30       → créditos emitidos y consumidos en el período + último movimiento de cada una
//   GET    /acompanantes/:id/extra         → destacadas, packs, conexión con Mercado Pago y pedidos personalizados
//   DELETE /acompanantes/:id/destacadas/:did · DELETE /acompanantes/:id/destacadas/items/:iid
//   DELETE /acompanantes/:id/packs/:pid
//   GET    /acciones?tipo=&id=             → registro de acciones del admin
import express from 'express';
import { sha256, tokenAleatorio } from '../lib/auth.js';
import { plantillas, sendMail, urlSitio } from '../lib/mail.js';
import { montoJson } from '../lib/creditos.js';
import { pesos } from '../lib/contenido.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ESTADOS_SOL = ['pendiente', 'aceptada', 'rechazada', 'cerrada'];
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; this.expose = true; } }
const he = (s, m) => new HttpError(s, m);

export function createAdminModeracionRouter({ pool, storage, contenido, destacadas, apiPost, adminUser = 'admin', invalidar = () => {}, log = () => {} }) {
  const r = express.Router();
  const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  const id = (v) => { if (!UUID_RE.test(String(v || ''))) throw he(404, 'No encontrado.'); return v; };
  const body = (req) => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {});
  r.use(['/solicitudes', '/clientes', '/creditos-resumen', '/acompanantes', '/acciones'], (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  const registrar = (db, accion, tipo, objId, detalle = {}) => db.query(
    'INSERT INTO admin_acciones (por, accion, objeto_tipo, objeto_id, detalle) VALUES ($1, $2, $3, $4, $5::jsonb)',
    [adminUser, accion, tipo, String(objId), JSON.stringify(detalle)]);
  const accionJson = (a) => ({ id: Number(a.id), creado: a.creado, por: a.por, accion: a.accion, tipo: a.objeto_tipo, objetoId: a.objeto_id, detalle: a.detalle || {} });

  async function borrarArchivosItem(i) {
    for (const rel of [i.ruta, i.ruta_preview]) {
      if (!rel) continue;
      try { await storage.borrarPrivado(rel); } catch (e) { log('admin: no se pudo borrar un archivo privado', rel, e.code || e.message); }
    }
  }

  // ---------- Pedidos personalizados ----------
  r.get('/solicitudes', ah(async (req, res) => {
    const estado = ESTADOS_SOL.includes(req.query.estado) ? req.query.estado : null;
    const { rows } = await pool.query(
      `SELECT s.id, s.estado, s.texto, s.creado, s.actividad, s.cerrada_por, s.cuenta_id, s.cliente_id,
              p.slug, p.datos->>'displayName' AS nombre, c.usuario, c.estado AS cliente_estado,
              m.texto AS ult_texto, m.autor AS ult_autor, m.item_id AS ult_item, m.creado AS ult_creado,
              (SELECT count(*)::int FROM solicitud_items i WHERE i.solicitud_id = s.id) AS items,
              (SELECT count(*)::int FROM ventas_contenido v JOIN solicitud_items i ON i.id = v.solicitud_item_id
                 WHERE i.solicitud_id = s.id AND v.estado = 'aprobada') AS pagados,
              (SELECT COALESCE(sum(v.monto_centavos), 0)::bigint FROM ventas_contenido v JOIN solicitud_items i ON i.id = v.solicitud_item_id
                 WHERE i.solicitud_id = s.id AND v.estado = 'aprobada') AS monto_pagado
         FROM solicitudes s
         JOIN clientes c ON c.id = s.cliente_id
         LEFT JOIN perfiles p ON p.cuenta_id = s.cuenta_id
         LEFT JOIN LATERAL (SELECT texto, autor, item_id, creado FROM solicitud_mensajes WHERE solicitud_id = s.id AND autor <> 'sistema' ORDER BY id DESC LIMIT 1) m ON true
        WHERE $1::text IS NULL OR s.estado = $1
        ORDER BY s.actividad DESC LIMIT 500`, [estado]);
    const { rows: [n] } = await pool.query(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE estado = 'pendiente')::int AS pendiente,
              count(*) FILTER (WHERE estado = 'aceptada')::int AS aceptada, count(*) FILTER (WHERE estado = 'rechazada')::int AS rechazada,
              count(*) FILTER (WHERE estado = 'cerrada')::int AS cerrada FROM solicitudes`);
    res.json({
      items: rows.map((x) => ({
        id: x.id, estado: x.estado, texto: x.texto, creado: x.creado, actividad: x.actividad, cerradaPor: x.cerrada_por || null,
        acompanante: { id: x.cuenta_id, nombre: x.nombre || '', slug: x.slug || null },
        cliente: { id: x.cliente_id, usuario: x.usuario, bloqueado: x.cliente_estado === 'suspendida' },
        ultimoMensaje: x.ult_creado ? { autor: x.ult_autor, texto: x.ult_item ? null : x.ult_texto, contenido: !!x.ult_item, creado: x.ult_creado } : null,
        items: x.items, pagados: x.pagados, montoPagado: pesos(x.monto_pagado),
      })),
      conteo: n,
    });
  }));

  r.get('/solicitudes/items/:item/archivo', ah(async (req, res) => {
    const { rows: [i] } = await pool.query('SELECT ruta, ruta_preview, estado, borrado FROM solicitud_items WHERE id = $1', [id(req.params.item)]);
    if (!i) throw he(404, 'Archivo no encontrado.');
    if (i.borrado || i.estado === 'vencido') throw he(410, 'Este contenido venció o fue borrado.');
    const rel = req.query.preview === '1' ? i.ruta_preview : i.ruta;
    if (!rel) throw he(404, 'Archivo no encontrado.');
    await storage.enviarPrivadoRango(req, res, rel);
  }));

  r.get('/solicitudes/:id', ah(async (req, res) => {
    const sid = id(req.params.id);
    const { rows: [s] } = await pool.query(
      `SELECT s.*, p.slug, p.datos->>'displayName' AS nombre, c.usuario, c.email, c.estado AS cliente_estado
         FROM solicitudes s JOIN clientes c ON c.id = s.cliente_id LEFT JOIN perfiles p ON p.cuenta_id = s.cuenta_id WHERE s.id = $1`, [sid]);
    if (!s) throw he(404, 'No encontramos ese pedido.');
    const [{ rows: ms }, { rows: its }, { rows: acc }] = await Promise.all([
      pool.query('SELECT * FROM solicitud_mensajes WHERE solicitud_id = $1 ORDER BY id', [sid]),
      pool.query(
        `SELECT i.*, (SELECT v.estado FROM ventas_contenido v WHERE v.solicitud_item_id = i.id ORDER BY (v.estado = 'aprobada') DESC, v.creado DESC LIMIT 1) AS venta_estado
           FROM solicitud_items i WHERE i.solicitud_id = $1 ORDER BY i.creado`, [sid]),
      pool.query("SELECT * FROM admin_acciones WHERE objeto_tipo = 'solicitud' AND objeto_id = $1 ORDER BY id DESC LIMIT 100", [sid]),
    ]);
    res.json({
      solicitud: {
        id: s.id, estado: s.estado, texto: s.texto, creado: s.creado, respondida: s.respondida, cerrada: s.cerrada,
        cerradaPor: s.cerrada_por || null, motivoCierre: s.motivo_cierre || null,
        acompanante: { id: s.cuenta_id, nombre: s.nombre || '', slug: s.slug || null },
        cliente: { id: s.cliente_id, usuario: s.usuario, email: s.email, bloqueado: s.cliente_estado === 'suspendida' },
      },
      mensajes: ms.map((m) => ({ id: Number(m.id), autor: m.autor, texto: m.texto, itemId: m.item_id || null, creado: m.creado })),
      items: its.map((i) => {
        const vencido = i.estado === 'vencido' || !!i.borrado;
        return {
          id: i.id, tipo: i.tipo, estado: vencido ? 'vencido' : i.estado, precio: pesos(i.precio_centavos), error: i.error || null,
          segundos: i.segundos == null ? null : Number(i.segundos), ancho: i.ancho, alto: i.alto, creado: i.creado,
          pagado: i.venta_estado === 'aprobada', venta: i.venta_estado || null, vence: i.vence, archivo: !vencido && i.estado === 'listo' && !!i.ruta,
        };
      }),
      acciones: acc.map(accionJson),
    });
  }));

  r.post('/solicitudes/:id/cerrar', apiPost, ah(async (req, res) => {
    const sid = id(req.params.id);
    const motivo = str(body(req).motivo, 500);
    if (!motivo) throw he(400, 'Escribí el motivo del cierre: queda registrado.');
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      const { rows: [s] } = await db.query('SELECT estado FROM solicitudes WHERE id = $1 FOR UPDATE', [sid]);
      if (!s) throw he(404, 'No encontramos ese pedido.');
      if (s.estado === 'cerrada' || s.estado === 'rechazada') throw he(409, 'Este pedido ya está cerrado.');
      await db.query("UPDATE solicitudes SET estado = 'cerrada', cerrada = now(), cerrada_por = 'admin', motivo_cierre = $2, actividad = now() WHERE id = $1", [sid, motivo]);
      await db.query("INSERT INTO solicitud_mensajes (solicitud_id, autor, texto) VALUES ($1, 'sistema', 'cerrada:admin')", [sid]);
      await registrar(db, 'cerrar_pedido', 'solicitud', sid, { motivo, estadoAnterior: s.estado });
      await db.query('COMMIT');
    } catch (e) { await db.query('ROLLBACK').catch(() => {}); throw e; } finally { db.release(); }
    res.json({ ok: true, estado: 'cerrada' });
  }));

  // Borra un contenido bloqueado: archivos privados, los mensajes que lo llevan y la fila (las ventas quedan, sin el vínculo).
  async function borrarItem(itemId, extra = {}) {
    const { rows: [i] } = await pool.query('SELECT * FROM solicitud_items WHERE id = $1', [itemId]);
    if (!i) throw he(404, 'No encontramos ese contenido.');
    await borrarArchivosItem(i);
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query('DELETE FROM solicitud_mensajes WHERE item_id = $1', [i.id]);
      await db.query('DELETE FROM solicitud_items WHERE id = $1', [i.id]);
      await registrar(db, 'borrar_contenido', 'solicitud', i.solicitud_id, { itemId: i.id, tipo: i.tipo, precio: pesos(i.precio_centavos), ...extra });
      await db.query('COMMIT');
    } catch (e) { await db.query('ROLLBACK').catch(() => {}); throw e; } finally { db.release(); }
    return i;
  }
  r.delete('/solicitudes/items/:item', apiPost, ah(async (req, res) => {
    await borrarItem(id(req.params.item), { motivo: str(body(req).motivo, 300) || undefined });
    res.json({ ok: true });
  }));
  r.delete('/solicitudes/:id/mensajes/:mid', apiPost, ah(async (req, res) => {
    const sid = id(req.params.id);
    const mid = Number(req.params.mid);
    if (!Number.isSafeInteger(mid) || mid <= 0) throw he(404, 'No encontramos ese mensaje.');
    const { rows: [m] } = await pool.query('SELECT * FROM solicitud_mensajes WHERE id = $1 AND solicitud_id = $2', [mid, sid]);
    if (!m) throw he(404, 'No encontramos ese mensaje.');
    if (m.autor === 'sistema') throw he(400, 'Los avisos del sistema no se borran.');
    if (m.item_id) { await borrarItem(m.item_id, { mensajeId: mid, autor: m.autor }); return res.json({ ok: true }); }
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query('DELETE FROM solicitud_mensajes WHERE id = $1', [mid]);
      await registrar(db, 'borrar_mensaje', 'solicitud', sid, { mensajeId: mid, autor: m.autor, texto: String(m.texto || '').slice(0, 300) });
      await db.query('COMMIT');
    } catch (e) { await db.query('ROLLBACK').catch(() => {}); throw e; } finally { db.release(); }
    res.json({ ok: true });
  }));

  // ---------- Interesados (clientes) ----------
  r.get('/clientes', ah(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : '';
    const args = []; let where = '';
    if (q) { args.push('%' + q.replace(/[\\%_]/g, (c) => '\\' + c) + '%'); where = 'WHERE c.usuario ILIKE $1 OR c.email ILIKE $1'; }
    const { rows } = await pool.query(
      `SELECT c.id, c.usuario, c.email, c.email_verificado, c.estado, c.creado, c.ultimo_login, c.bloqueado, c.motivo_bloqueo,
              (SELECT count(*)::int FROM ventas_contenido v WHERE v.cliente_id = c.id AND v.estado = 'aprobada') AS compras,
              (SELECT COALESCE(sum(v.monto_centavos), 0)::bigint FROM ventas_contenido v WHERE v.cliente_id = c.id AND v.estado = 'aprobada') AS gastado,
              (SELECT count(*)::int FROM solicitudes s WHERE s.cliente_id = c.id) AS pedidos
         FROM clientes c ${where} ORDER BY c.creado DESC LIMIT 1000`, args);
    const { rows: [n] } = await pool.query(
      "SELECT count(*)::int AS total, count(*) FILTER (WHERE estado = 'suspendida')::int AS bloqueados, count(*) FILTER (WHERE email_verificado IS NULL)::int AS sin_verificar FROM clientes");
    res.json({
      items: rows.map((c) => ({
        id: c.id, usuario: c.usuario, email: c.email, emailVerificado: !!c.email_verificado, estado: c.estado, bloqueado: c.estado === 'suspendida',
        creado: c.creado, ultimoLogin: c.ultimo_login, compras: c.compras, gastado: pesos(c.gastado), pedidos: c.pedidos,
      })),
      conteo: { total: n.total, bloqueados: n.bloqueados, sinVerificar: n.sin_verificar },
    });
  }));

  r.get('/clientes/:id', ah(async (req, res) => {
    const cid = id(req.params.id);
    const { rows: [c] } = await pool.query('SELECT * FROM clientes WHERE id = $1', [cid]);
    if (!c) throw he(404, 'No encontramos ese interesado.');
    const [{ rows: vs }, { rows: ss }, { rows: acc }] = await Promise.all([
      pool.query(
        `SELECT v.id, v.tipo, v.titulo, v.monto_centavos, v.estado, v.creado, v.pagado, v.cuenta_id, p.datos->>'displayName' AS nombre
           FROM ventas_contenido v LEFT JOIN perfiles p ON p.cuenta_id = v.cuenta_id
          WHERE v.cliente_id = $1 AND v.estado <> 'pendiente' ORDER BY v.creado DESC LIMIT 300`, [cid]),
      pool.query(
        `SELECT s.id, s.estado, s.texto, s.creado, s.actividad, s.cuenta_id, p.datos->>'displayName' AS nombre
           FROM solicitudes s LEFT JOIN perfiles p ON p.cuenta_id = s.cuenta_id WHERE s.cliente_id = $1 ORDER BY s.actividad DESC LIMIT 300`, [cid]),
      pool.query("SELECT * FROM admin_acciones WHERE objeto_tipo = 'cliente' AND objeto_id = $1 ORDER BY id DESC LIMIT 100", [cid]),
    ]);
    res.json({
      cliente: {
        id: c.id, usuario: c.usuario, email: c.email, emailVerificado: !!c.email_verificado, estado: c.estado, bloqueado: c.estado === 'suspendida',
        bloqueadoDesde: c.bloqueado, motivoBloqueo: c.motivo_bloqueo, creado: c.creado, ultimoLogin: c.ultimo_login,
        aceptoTerminos: c.acepto_terminos, mayorEdadDeclarada: c.mayor_edad_declarada,
      },
      compras: vs.map((v) => ({ id: v.id, tipo: v.tipo || 'pack', titulo: v.titulo, monto: pesos(v.monto_centavos), estado: v.estado, creado: v.creado, pagado: v.pagado, acompanante: { id: v.cuenta_id, nombre: v.nombre || '' } })),
      pedidos: ss.map((s) => ({ id: s.id, estado: s.estado, texto: s.texto, creado: s.creado, actividad: s.actividad, acompanante: { id: s.cuenta_id, nombre: s.nombre || '' } })),
      acciones: acc.map(accionJson),
    });
  }));

  r.post('/clientes/:id/bloquear', apiPost, ah(async (req, res) => {
    const cid = id(req.params.id);
    const motivo = str(body(req).motivo, 500);
    if (!motivo) throw he(400, 'Escribí el motivo del bloqueo: queda registrado.');
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      const { rows: [c] } = await db.query('SELECT estado FROM clientes WHERE id = $1 FOR UPDATE', [cid]);
      if (!c) throw he(404, 'No encontramos ese interesado.');
      if (c.estado === 'baja') throw he(409, 'Esa cuenta está dada de baja.');
      if (c.estado === 'suspendida') throw he(409, 'Ese interesado ya está bloqueado.');
      await db.query("UPDATE clientes SET estado = 'suspendida', bloqueado = now(), motivo_bloqueo = $2 WHERE id = $1", [cid, motivo]);
      await db.query('DELETE FROM sesiones_clientes WHERE cliente_id = $1', [cid]); // sale de todas las sesiones
      await registrar(db, 'bloquear_cliente', 'cliente', cid, { motivo });
      await db.query('COMMIT');
    } catch (e) { await db.query('ROLLBACK').catch(() => {}); throw e; } finally { db.release(); }
    res.json({ ok: true, estado: 'suspendida' });
  }));

  r.post('/clientes/:id/desbloquear', apiPost, ah(async (req, res) => {
    const cid = id(req.params.id);
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      const { rows: [c] } = await db.query('SELECT estado FROM clientes WHERE id = $1 FOR UPDATE', [cid]);
      if (!c) throw he(404, 'No encontramos ese interesado.');
      if (c.estado !== 'suspendida') throw he(409, 'Ese interesado no está bloqueado.');
      await db.query("UPDATE clientes SET estado = 'activa', bloqueado = NULL, motivo_bloqueo = NULL WHERE id = $1", [cid]);
      await registrar(db, 'desbloquear_cliente', 'cliente', cid, {});
      await db.query('COMMIT');
    } catch (e) { await db.query('ROLLBACK').catch(() => {}); throw e; } finally { db.release(); }
    res.json({ ok: true, estado: 'activa' });
  }));

  r.post('/clientes/:id/reenviar-verificacion', apiPost, ah(async (req, res) => {
    const cid = id(req.params.id);
    const { rows: [c] } = await pool.query('SELECT id, usuario, email, email_verificado, estado FROM clientes WHERE id = $1', [cid]);
    if (!c) throw he(404, 'No encontramos ese interesado.');
    if (c.email_verificado) throw he(409, 'Ese email ya está confirmado.');
    if (c.estado !== 'activa') throw he(409, 'La cuenta no está activa.');
    const token = tokenAleatorio(32);
    await pool.query("UPDATE tokens_email_clientes SET usado = now() WHERE cliente_id = $1 AND tipo = 'verificar' AND usado IS NULL", [c.id]);
    await pool.query("INSERT INTO tokens_email_clientes (token_hash, cliente_id, tipo, expira) VALUES ($1, $2, 'verificar', now() + interval '48 hours')", [sha256(token), c.id]);
    await sendMail({ to: c.email, ...plantillas.verificarCliente({ usuario: c.usuario, url: urlSitio('/cliente/verificar?token=' + token) }) });
    await registrar(pool, 'reenviar_verificacion', 'cliente', c.id, {});
    res.json({ ok: true });
  }));

  // ---------- Créditos: totales del período y último movimiento de cada una ----------
  r.get('/creditos-resumen', ah(async (req, res) => {
    const d = Number(req.query.dias);
    const dias = Number.isInteger(d) && d >= 1 && d <= 3650 ? d : 30;
    const [{ rows: [t] }, { rows: ult }, { rows: [tot] }] = await Promise.all([
      pool.query(
        `SELECT COALESCE(sum(centavos) FILTER (WHERE centavos > 0), 0)::bigint AS emitidos,
                COALESCE(-sum(centavos) FILTER (WHERE centavos < 0), 0)::bigint AS consumidos,
                COALESCE(sum(centavos) FILTER (WHERE tipo IN ('compra', 'pack_bonus')), 0)::bigint AS comprados,
                COALESCE(sum(centavos) FILTER (WHERE tipo = 'ajuste_admin'), 0)::bigint AS ajustes,
                count(*)::int AS movimientos
           FROM creditos_movimientos WHERE creado > now() - make_interval(days => $1)`, [dias]),
      pool.query(
        `SELECT DISTINCT ON (cuenta_id) cuenta_id, tipo, centavos, creado FROM creditos_movimientos ORDER BY cuenta_id, id DESC`),
      pool.query('SELECT COALESCE(sum(centavos), 0)::bigint AS saldo, count(*) FILTER (WHERE centavos > 0)::int AS con_saldo FROM creditos_cuentas'),
    ]);
    res.json({
      dias,
      periodo: { emitidos: montoJson(t.emitidos), consumidos: montoJson(t.consumidos), comprados: montoJson(t.comprados), ajustes: montoJson(t.ajustes), movimientos: t.movimientos },
      saldoTotal: montoJson(tot.saldo), conSaldo: tot.con_saldo,
      ultimos: Object.fromEntries(ult.map((u) => [u.cuenta_id, { tipo: u.tipo, centavos: montoJson(u.centavos), creado: u.creado }])),
    });
  }));

  // ---------- Ficha de la acompañante: destacadas, packs, Mercado Pago y pedidos ----------
  const cuentaExiste = async (cid) => {
    const { rows: [c] } = await pool.query('SELECT id FROM cuentas WHERE id = $1', [cid]);
    if (!c) throw he(404, 'Cuenta no encontrada.');
  };
  r.get('/acompanantes/:id/extra', ah(async (req, res) => {
    const cid = id(req.params.id);
    await cuentaExiste(cid);
    const [dest, panel, resumen, { rows: con }, { rows: [ped] }] = await Promise.all([
      destacadas ? destacadas.listar(cid) : null,
      contenido ? contenido.panel(cid) : null,
      contenido ? contenido.resumenAdmin() : null,
      pool.query('SELECT app_id, estado, conectada, expira FROM mp_conexiones WHERE cuenta_id = $1 ORDER BY conectada DESC NULLS LAST', [cid]),
      pool.query(
        `SELECT count(*)::int AS total, count(*) FILTER (WHERE estado IN ('pendiente', 'aceptada'))::int AS abiertos FROM solicitudes WHERE cuenta_id = $1`, [cid]),
    ]);
    const nombreCuenta = (appId) => { const c = resumen && (resumen.cuentas || []).find((x) => x.id === appId); return c ? c.nombre : appId; };
    res.json({
      destacadas: dest,
      packs: panel ? { max: panel.max, items: (panel.items || []).map((x) => ({ id: x.id, titulo: x.titulo, precio: x.precio, link: x.link, creado: x.creado, aLaVenta: x.aLaVenta })) } : null,
      mercadoPago: {
        disponible: panel ? !!panel.disponible : false,
        estado: panel && panel.disponible ? panel.conexion.estado : 'sin_conectar',
        desde: panel && panel.conexion ? panel.conexion.desde : null,
        cuentaActiva: resumen && resumen.activa ? nombreCuenta(resumen.activa) : null,
        conexiones: con.map((x) => ({ cuenta: nombreCuenta(x.app_id), estado: x.estado, conectada: x.conectada, vence: x.expira })),
      },
      pedidos: { total: ped.total, abiertos: ped.abiertos },
    });
  }));

  r.delete('/acompanantes/:id/destacadas/items/:iid', apiPost, ah(async (req, res) => {
    const cid = id(req.params.id); const iid = id(req.params.iid);
    if (!destacadas) throw he(503, 'No disponible.');
    await destacadas.borrarItem(cid, iid);
    await registrar(pool, 'borrar_destacada_item', 'acompanante', cid, { itemId: iid });
    res.json({ ok: true });
  }));
  r.delete('/acompanantes/:id/destacadas/:did', apiPost, ah(async (req, res) => {
    const cid = id(req.params.id); const did = id(req.params.did);
    if (!destacadas) throw he(503, 'No disponible.');
    const { rows: [d] } = await pool.query('SELECT titulo FROM destacadas WHERE id = $1 AND cuenta_id = $2', [did, cid]);
    await destacadas.borrar(cid, did);
    await registrar(pool, 'borrar_destacada', 'acompanante', cid, { destacadaId: did, titulo: d ? d.titulo : null });
    res.json({ ok: true });
  }));
  r.delete('/acompanantes/:id/packs/:pid', apiPost, ah(async (req, res) => {
    const cid = id(req.params.id); const pid = id(req.params.pid);
    if (!contenido) throw he(503, 'No disponible.');
    const { rows: [p] } = await pool.query('SELECT titulo FROM contenido_items WHERE id = $1 AND cuenta_id = $2', [pid, cid]);
    await contenido.borrarItem(cid, pid);
    await registrar(pool, 'borrar_pack', 'acompanante', cid, { packId: pid, titulo: p ? p.titulo : null });
    invalidar();
    res.json({ ok: true });
  }));

  r.get('/acciones', ah(async (req, res) => {
    const tipo = str(req.query.tipo, 40); const oid = str(req.query.id, 80);
    const { rows } = tipo && oid
      ? await pool.query('SELECT * FROM admin_acciones WHERE objeto_tipo = $1 AND objeto_id = $2 ORDER BY id DESC LIMIT 200', [tipo, oid])
      : await pool.query('SELECT * FROM admin_acciones ORDER BY id DESC LIMIT 200');
    res.json({ items: rows.map(accionJson) });
  }));

  r.use((e, req, res, next) => {
    if (e.type === 'entity.parse.failed') return res.status(400).json({ error: 'Formato de datos inválido.' });
    if (e.expose || (e.status && e.status < 500 && e.message)) return res.status(e.status || 400).json({ error: e.message });
    log('error admin-moderacion:', req.method, req.path, e.code || '', e.message);
    next(e);
  });

  async function contadores() {
    const [{ rows: [s] }, { rows: [c] }] = await Promise.all([
      pool.query("SELECT count(*) FILTER (WHERE estado IN ('pendiente', 'aceptada'))::int AS abiertos, count(*) FILTER (WHERE estado = 'pendiente')::int AS pendientes FROM solicitudes"),
      pool.query("SELECT count(*)::int AS total, count(*) FILTER (WHERE estado = 'suspendida')::int AS bloqueados FROM clientes"),
    ]);
    return { pedidosPersonalizados: { abiertos: s.abiertos, pendientes: s.pendientes }, clientes: { total: c.total, bloqueados: c.bloqueados } };
  }

  return { router: r, contadores };
}
