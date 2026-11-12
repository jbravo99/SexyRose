// Venta de contenido de las acompañantes con Mercado Pago (Checkout Pro, modelo marketplace).
//
// - La acompañante carga cada contenido con título, descripción, precio en pesos y SU link (donde ella lo tenga).
// - Conecta su cuenta de Mercado Pago (OAuth) a la "cuenta de comisión" activa: una aplicación de Mercado Pago de
//   SexyRose (MP_CUENTA_<n>_* en el .env). Los tokens quedan atados a esa aplicación.
// - El comprador paga en Mercado Pago: la preferencia se crea con el token de la vendedora y la comisión va como
//   marketplace_fee, que Mercado Pago acredita a la dueña de la aplicación activa. Desde el 12/11/2026 (Juan) el
//   comprador tiene que tener una cuenta de cliente con el email confirmado (lib/clientes.js): cada compra queda atada
//   a su cuenta (Tu espacio → Mis compras) y /compra/<token> solo la ve su dueño.
// - Ventas de dos tipos: 'pack' (packs del perfil, entregan el link de la vendedora) y 'pedido' (contenido bloqueado de
//   un pedido personalizado, lib/solicitudes.js: se desbloquea en el chat).
// - El pago se verifica solo: notificación firmada (webhook) + consulta del pago a Mercado Pago con el token de la
//   vendedora. Al aprobarse, /compra/<token> muestra el link. Nadie verifica pagos a mano.
// - Admin → Ajustes elige la cuenta de comisión activa. Si cambia, las vendedoras que no conectaron esa aplicación
//   ven "Volvé a conectar Mercado Pago" y sus contenidos no se pueden comprar hasta que reconecten.
// - Solo packs (y, más adelante, pedidos a medida). Cantidad de packs a la venta por plan: LIMITES[plan].packs (Juan
//   12/11: Bronce 0, Plata 1, Oro 5, Star ilimitados). Si baja de plan, los primeros que entran (por fecha de carga)
//   siguen a la venta; el resto queda guardado y no se puede comprar (en su panel figura así).
// - La comisión NO se descuenta de los créditos (Mercado Pago ya la retiene en el cobro): queda registrada en cada
//   venta (ventas_contenido.comision_centavos) solo para los reportes.
import crypto from 'node:crypto';
import { COMISION_DEFAULT } from './creditos.js';
import { cuentaCompleta, firmaValida, MpError } from './mercadopago.js';
import { limitesDe } from './planes-ref.js';

export const MIN_PRECIO = 100;            // pesos
export const MAX_PRECIO = 10000000;       // pesos
export const RENOVAR_ANTES_DIAS = 30;
// Pedidos personalizados: solo planes Oro (C) y Star (S) (recomendación de Claude, aceptada por Juan el 12/11/2026).
export const PLANES_PEDIDOS = ['C', 'S'];     // los tokens duran 180 días: se renuevan cuando faltan 30
const ESTADO_OAUTH_MIN = 15;
const VERIFICAR_CADA_MS = 10 * 1000;      // consulta del pago desde /compra/<token>: como mucho cada 10 s por venta
const HOUR = 60 * 60 * 1000;
// Resumen de la tarjeta del comprador: neutro (máx. 13 caracteres para que entre en cualquier emisor).
export const DESCRIPTOR_NEUTRO = 'CONT DIGITAL';

export class ContenidoError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const he = (s, m) => new ContenidoError(s, m);

const BIDI = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩﻿]/g;
const linea = (v) => (typeof v === 'string' ? v.normalize('NFC').replace(BIDI, '').replace(/\s+/g, ' ').trim() : '');
const texto = (v) => (typeof v === 'string' ? v.normalize('NFC').replace(/\r\n?/g, '\n').replace(BIDI, '').replace(/\n{3,}/g, '\n\n').trim() : '');
const largo = (s) => [...s].length;
export const pesos = (centavos) => ({ centavos: Number(centavos), pesos: (Number(centavos) / 100).toFixed(2) });

// Mapea el estado del pago de Mercado Pago al de la venta.
export function estadoVenta(status) {
  if (status === 'approved') return 'aprobada';
  if (['rejected', 'cancelled'].includes(status)) return 'rechazada';
  if (['refunded', 'charged_back'].includes(status)) return 'reembolsada';
  if (['pending', 'in_process', 'authorized', 'in_mediation'].includes(status)) return 'en_proceso';
  return null;
}

export function validarItem(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { error: 'Formato inválido.' };
  const titulo = linea(b.titulo);
  if (largo(titulo) < 3 || largo(titulo) > 80) return { error: 'El título tiene que tener entre 3 y 80 caracteres.' };
  const descripcion = texto(b.descripcion || '');
  if (largo(descripcion) > 300) return { error: 'La descripción admite hasta 300 caracteres.' };
  const precio = Number(typeof b.precio === 'string' ? b.precio.replace(',', '.') : b.precio);
  if (!Number.isFinite(precio) || precio < MIN_PRECIO || precio > MAX_PRECIO) return { error: `El precio tiene que ser de entre $ ${MIN_PRECIO} y $ ${MAX_PRECIO.toLocaleString('es-AR')}.` };
  const centavos = Math.round(precio * 100);
  if (Math.abs(centavos - precio * 100) > 1e-6) return { error: 'El precio admite hasta 2 decimales.' };
  const link = linea(b.link);
  let u;
  try { u = new URL(link); } catch { return { error: 'El link tiene que ser una dirección completa que empiece con https://' }; }
  if (u.protocol !== 'https:' || !u.hostname.includes('.') || u.username || u.password || link.length > 500) return { error: 'El link tiene que ser una dirección completa que empiece con https://' };
  return { valor: { titulo, descripcion, precioCentavos: centavos, link: u.toString() } };
}

// Cifrado de los tokens de Mercado Pago: AES-256-GCM con una clave derivada del secreto de cada aplicación.
const clave = (cuenta) => Buffer.from(crypto.hkdfSync('sha256', Buffer.from(cuenta.clientSecret, 'utf8'), Buffer.from('sexyrose-mp-tokens'), Buffer.from(String(cuenta.id)), 32));
export function cifrar(cuenta, plano) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', clave(cuenta), iv);
  const enc = Buffer.concat([c.update(String(plano), 'utf8'), c.final()]);
  return 'v1:' + Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
}
export function descifrar(cuenta, guardado) {
  if (!guardado || !cuenta || !cuenta.clientSecret || !String(guardado).startsWith('v1:')) return null;
  try {
    const b = Buffer.from(String(guardado).slice(3), 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', clave(cuenta), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
  } catch { return null; }
}

export function createContenido({ pool, mp, cuentas = [], siteUrl = '', log = () => {}, invalidar = () => {}, now = () => Date.now(), planDe = async () => 'E' }) {
  // Packs que puede tener a la venta según su plan (null = ilimitados).
  const limitePacks = async (cuentaId) => { const l = limitesDe(await planDe(cuentaId)).packs; return l === undefined ? 0 : l; };
  const enVenta = (i, lim) => lim === null || i < lim;
  const SITE = String(siteUrl || '').replace(/\/+$/, '');
  const redirectUri = SITE + '/api/cuenta/contenido/mp/callback';
  const porId = (id) => cuentas.find((c) => c.id === id) || null;

  const leerAjuste = async (claveAj, db = pool) => {
    const { rows } = await db.query('SELECT valor FROM ajustes WHERE clave = $1', [claveAj]);
    return rows[0] ? rows[0].valor : null;
  };
  // Cuenta de comisión activa: la elegida en Admin → Ajustes (si sigue configurada) o la primera del .env.
  async function cuentaActiva(db = pool) {
    const aj = await leerAjuste('venta_contenido', db);
    const elegida = aj && typeof aj === 'object' ? porId(aj.cuenta) : null;
    return elegida || cuentas[0] || null;
  }
  async function disponible(db = pool) { return cuentaCompleta(await cuentaActiva(db)); }
  async function comisionPct(db = pool) {
    const c = await leerAjuste('comision', db);
    const p = Number(c && typeof c === 'object' && c.porcentaje != null ? c.porcentaje : COMISION_DEFAULT.porcentaje);
    return Number.isFinite(p) && p >= 0 && p <= 90 ? p : COMISION_DEFAULT.porcentaje;
  }

  // ---------- Conexión de la vendedora con Mercado Pago ----------
  async function conexion(cuentaId, appId, db = pool) {
    const { rows } = await db.query('SELECT * FROM mp_conexiones WHERE cuenta_id = $1 AND app_id = $2', [cuentaId, appId]);
    return rows[0] || null;
  }
  // Token de acceso utilizable (activa, sin vencer y descifrable) o null.
  async function tokenDe(cuentaId, appId, db = pool) {
    const cuenta = porId(appId); const c = await conexion(cuentaId, appId, db);
    if (!cuenta || !c || c.estado !== 'activa' || new Date(c.expira).getTime() <= now()) return null;
    return descifrar(cuenta, c.access_cifrado);
  }
  async function estadoConexion(cuentaId) {
    const activa = await cuentaActiva();
    const { rows } = await pool.query('SELECT app_id, estado, conectada, expira FROM mp_conexiones WHERE cuenta_id = $1', [cuentaId]);
    const deActiva = activa ? rows.find((x) => x.app_id === activa.id) : null;
    const ok = deActiva && deActiva.estado === 'activa' && new Date(deActiva.expira).getTime() > now() && !!(await tokenDe(cuentaId, activa.id));
    if (ok) return { estado: 'conectada', desde: deActiva.conectada };
    // Tenía otra conexión (otra cuenta de comisión) o la de ahora se cortó: tiene que volver a conectar
    if (rows.length) return { estado: 'reconectar', desde: null };
    return { estado: 'sin_conectar', desde: null };
  }
  async function iniciarOAuth(cuentaId) {
    const activa = await cuentaActiva();
    if (!cuentaCompleta(activa)) throw he(409, 'La venta de contenido todavía no está disponible.');
    const estado = crypto.randomBytes(24).toString('hex');
    await pool.query("DELETE FROM mp_oauth_estados WHERE creado < now() - interval '1 day'");
    await pool.query('INSERT INTO mp_oauth_estados (estado, cuenta_id, app_id) VALUES ($1, $2, $3)', [estado, cuentaId, activa.id]);
    return { url: mp.urlAutorizacion({ clientId: activa.clientId, redirectUri, estado }) };
  }
  async function guardarTokens(cuentaId, cuenta, t, db = pool, { nueva = true } = {}) {
    if (!t || !t.access_token) throw new MpError('Mercado Pago no devolvió el token.');
    const seg = Number(t.expires_in) > 0 ? Number(t.expires_in) : 180 * 24 * 3600;
    const expira = new Date(now() + seg * 1000).toISOString();
    await db.query(
      `INSERT INTO mp_conexiones (cuenta_id, app_id, mp_user_id, access_cifrado, refresh_cifrado, expira, estado, conectada, renovada, error)
       VALUES ($1, $2, $3, $4, $5, $6, 'activa', now(), NULL, NULL)
       ON CONFLICT (cuenta_id, app_id) DO UPDATE SET mp_user_id = CASE WHEN $7 THEN COALESCE(EXCLUDED.mp_user_id, mp_conexiones.mp_user_id) ELSE mp_conexiones.mp_user_id END,
         access_cifrado = EXCLUDED.access_cifrado, refresh_cifrado = COALESCE(EXCLUDED.refresh_cifrado, mp_conexiones.refresh_cifrado),
         expira = EXCLUDED.expira, estado = 'activa', error = NULL,
         conectada = CASE WHEN $7 THEN now() ELSE mp_conexiones.conectada END, renovada = CASE WHEN $7 THEN NULL ELSE now() END`,
      [cuentaId, cuenta.id, t.user_id == null ? null : String(t.user_id), cifrar(cuenta, t.access_token), t.refresh_token ? cifrar(cuenta, t.refresh_token) : null, expira, nueva]);
  }
  const enUso = () => { const e = he(409, 'Esa cuenta de Mercado Pago ya está conectada a otra acompañante.'); e.code = 'mp_en_uso'; return e; };
  async function completarOAuth(cuentaId, { estado, code }) {
    if (!estado || !/^[0-9a-f]{48}$/.test(estado)) throw he(400, 'Autorización inválida.');
    const { rows } = await pool.query(
      `DELETE FROM mp_oauth_estados WHERE estado = $1 AND cuenta_id = $2 AND creado > now() - ($3::int * interval '1 minute') RETURNING app_id`,
      [estado, cuentaId, ESTADO_OAUTH_MIN]);
    if (!rows[0]) throw he(400, 'La autorización venció o no es tuya. Probá de nuevo desde tu panel.');
    const cuenta = porId(rows[0].app_id);
    if (!cuentaCompleta(cuenta)) throw he(409, 'La venta de contenido todavía no está disponible.');
    if (!code || typeof code !== 'string' || code.length > 300) throw he(400, 'Mercado Pago no devolvió la autorización.');
    const t = await mp.canjearCodigo({ clientId: cuenta.clientId, clientSecret: cuenta.clientSecret, code, redirectUri });
    // Una sola cuenta de Mercado Pago por acompañante: si ya está conectada a otra (en cualquier aplicación), no se acepta.
    if (t && t.user_id != null) {
      const { rows: otra } = await pool.query('SELECT 1 FROM mp_conexiones WHERE mp_user_id = $1 AND cuenta_id <> $2 LIMIT 1', [String(t.user_id), cuentaId]);
      if (otra[0]) throw enUso();
    }
    try {
      await guardarTokens(cuentaId, cuenta, t);
    } catch (e) {
      if (e && e.code === '23505') throw enUso(); // índice único (app_id, mp_user_id): carrera entre dos acompañantes
      throw e;
    }
    invalidar();
    return { ok: true };
  }
  async function desconectar(cuentaId) {
    const r = await pool.query('DELETE FROM mp_conexiones WHERE cuenta_id = $1', [cuentaId]);
    invalidar();
    return { ok: true, borradas: r.rowCount };
  }

  // Renueva los tokens que vencen en menos de RENOVAR_ANTES_DIAS. Si Mercado Pago rechaza el refresh (la vendedora
  // revocó el permiso), la conexión queda "revocada" y la vendedora ve "Volvé a conectar Mercado Pago".
  async function renovarTokens() {
    const { rows } = await pool.query(
      `SELECT * FROM mp_conexiones WHERE estado = 'activa' AND expira < now() + ($1::int * interval '1 day') ORDER BY expira LIMIT 200`, [RENOVAR_ANTES_DIAS]);
    let ok = 0, revocadas = 0;
    for (const c of rows) {
      const cuenta = porId(c.app_id);
      const refresh = cuenta ? descifrar(cuenta, c.refresh_cifrado) : null;
      if (!cuentaCompleta(cuenta) || !refresh) {
        if (new Date(c.expira).getTime() <= now()) { await pool.query("UPDATE mp_conexiones SET estado = 'revocada', error = 'sin renovación' WHERE cuenta_id = $1 AND app_id = $2", [c.cuenta_id, c.app_id]); revocadas++; }
        continue;
      }
      try {
        const t = await mp.renovar({ clientId: cuenta.clientId, clientSecret: cuenta.clientSecret, refreshToken: refresh });
        await guardarTokens(c.cuenta_id, cuenta, t, pool, { nueva: false });
        ok++;
      } catch (e) {
        if (e.status >= 400 && e.status < 500) {
          await pool.query("UPDATE mp_conexiones SET estado = 'revocada', error = $3 WHERE cuenta_id = $1 AND app_id = $2", [c.cuenta_id, c.app_id, String(e.code || e.status).slice(0, 100)]);
          revocadas++;
        } else log('mercado pago: no se pudo renovar un token (' + (e.code || e.message) + '); se reintenta más tarde');
      }
    }
    if (revocadas) invalidar();
    if (ok || revocadas) log(`mercado pago: tokens renovados ${ok}, conexiones cortadas ${revocadas}`);
    return { ok, revocadas };
  }

  // ---------- Contenidos de la vendedora ----------
  const itemJson = (x, aLaVenta = true) => ({ id: x.id, titulo: x.titulo, descripcion: x.descripcion, precio: pesos(x.precio_centavos), link: x.link, creado: x.creado, actualizado: x.actualizado, aLaVenta });
  async function items(cuentaId, lim) {
    const { rows } = await pool.query('SELECT * FROM contenido_items WHERE cuenta_id = $1 AND borrado IS NULL ORDER BY creado, id', [cuentaId]);
    return rows.map((x, i) => itemJson(x, enVenta(i, lim)));
  }
  async function crearItem(cuentaId, b) {
    const v = validarItem(b); if (v.error) throw he(400, v.error);
    const lim = await limitePacks(cuentaId);
    if (lim === 0) throw he(409, 'Tu plan no incluye la venta de packs.');
    const d = v.valor;
    // El cupo se controla en la misma consulta: dos pedidos simultáneos no pueden pasarlo.
    const { rows } = await pool.query(
      `INSERT INTO contenido_items (cuenta_id, titulo, descripcion, precio_centavos, link)
       SELECT $1, $2, $3, $4, $5
        WHERE $6::int IS NULL OR (SELECT count(*) FROM contenido_items WHERE cuenta_id = $1 AND borrado IS NULL) < $6::int
       RETURNING *`,
      [cuentaId, d.titulo, d.descripcion, d.precioCentavos, d.link, lim]);
    if (!rows[0]) throw he(409, `Tu plan permite ${lim} ${lim === 1 ? 'pack' : 'packs'} a la venta.`);
    invalidar();
    return itemJson(rows[0]);
  }
  async function editarItem(cuentaId, id, b) {
    const v = validarItem(b); if (v.error) throw he(400, v.error);
    const d = v.valor;
    const { rows } = await pool.query(
      `UPDATE contenido_items SET titulo = $3, descripcion = $4, precio_centavos = $5, link = $6, actualizado = now()
        WHERE id = $1 AND cuenta_id = $2 AND borrado IS NULL RETURNING *`,
      [id, cuentaId, d.titulo, d.descripcion, d.precioCentavos, d.link]);
    if (!rows[0]) throw he(404, 'No encontramos ese pack.');
    invalidar();
    const lim = await limitePacks(cuentaId);
    const { rows: [pos] } = await pool.query(
      "SELECT count(*)::int AS n FROM contenido_items WHERE cuenta_id = $1 AND borrado IS NULL AND (creado, id) < ($2, $3)", [cuentaId, rows[0].creado, rows[0].id]);
    return itemJson(rows[0], enVenta(pos.n, lim));
  }
  async function borrarItem(cuentaId, id) {
    const r = await pool.query('UPDATE contenido_items SET borrado = now() WHERE id = $1 AND cuenta_id = $2 AND borrado IS NULL', [id, cuentaId]);
    if (!r.rowCount) throw he(404, 'No encontramos ese pack.');
    invalidar();
    return { ok: true };
  }

  const ventaJson = (x) => ({ id: x.id, tipo: x.tipo || 'pack', creado: x.creado, pagado: x.pagado, titulo: x.titulo, monto: pesos(x.monto_centavos), comision: pesos(x.comision_centavos), comisionPct: Number(x.comision_pct), estado: x.estado });
  async function ventasDe(cuentaId) {
    const { rows } = await pool.query(
      "SELECT * FROM ventas_contenido WHERE cuenta_id = $1 AND estado <> 'pendiente' ORDER BY creado DESC LIMIT 200", [cuentaId]);
    return rows.map(ventaJson);
  }
  async function panel(cuentaId) {
    const lim = await limitePacks(cuentaId);
    const [disp, pct, con, its, vs] = await Promise.all([disponible(), comisionPct(), estadoConexion(cuentaId), items(cuentaId, lim), ventasDe(cuentaId)]);
    // max: packs que permite su plan (null = ilimitados; 0 = su plan no incluye la venta de packs)
    return { disponible: disp, comisionPct: pct, conexion: disp ? con : { estado: 'sin_conectar', desde: null }, items: its, ventas: vs, max: lim };
  }

  // ---------- Público ----------
  const PERFIL_VISIBLE = `p.estado = 'publicado' AND p.verificacion = 'verificada' AND NOT p.oculto AND c.estado = 'activa'`;
  async function vendedoraLista(cuentaId, activa) {
    if (!cuentaCompleta(activa)) return false;
    return !!(await tokenDe(cuentaId, activa.id));
  }
  // ¿La acompañante puede cobrar ahora? (cuenta de comisión completa + conexión vigente con esa aplicación)
  async function puedeCobrar(cuentaId) {
    const activa = await cuentaActiva();
    return vendedoraLista(cuentaId, activa);
  }
  // Pedidos personalizados: planes Oro (C) y Star (S) con Mercado Pago conectado a la cuenta de comisión activa.
  async function tomaPedidos(cuentaId) {
    if (!PLANES_PEDIDOS.includes(await planDe(cuentaId))) return false;
    return puedeCobrar(cuentaId);
  }
  async function itemsPublicos(slug) {
    const activa = await cuentaActiva();
    if (!cuentaCompleta(activa)) return { disponible: false, items: [], pedidos: false };
    const { rows: [p] } = await pool.query(`SELECT p.cuenta_id FROM perfiles p JOIN cuentas c ON c.id = p.cuenta_id WHERE p.slug = $1 AND ${PERFIL_VISIBLE}`, [slug]);
    if (!p) throw he(404, 'Perfil no encontrado.');
    if (!(await vendedoraLista(p.cuenta_id, activa))) return { disponible: true, items: [], pedidos: false };
    const lim = await limitePacks(p.cuenta_id);
    const { rows } = await pool.query('SELECT id, titulo, descripcion, precio_centavos FROM contenido_items WHERE cuenta_id = $1 AND borrado IS NULL ORDER BY creado, id', [p.cuenta_id]);
    const vis = lim === null ? rows : rows.slice(0, lim);
    const pedidos = PLANES_PEDIDOS.includes(await planDe(p.cuenta_id));
    return { disponible: true, items: vis.map((x) => ({ id: x.id, titulo: x.titulo, descripcion: x.descripcion, precio: pesos(x.precio_centavos) })), pedidos };
  }

  // Lo único que ve Mercado Pago (y el resumen de la tarjeta del comprador): un texto neutro con el número de orden.
  const tituloNeutro = (ventaId) => 'Contenido digital #' + String(ventaId).replace(/-/g, '').slice(0, 8).toUpperCase();
  async function comprar(itemId, { ipHash = null, clienteId = null } = {}) {
    if (!clienteId) throw he(401, 'Tenés que iniciar sesión.');
    const activa = await cuentaActiva();
    if (!cuentaCompleta(activa)) throw he(409, 'La venta de contenido todavía no está disponible.');
    const { rows: [it] } = await pool.query(
      `SELECT i.*, p.slug, p.datos->>'displayName' AS nombre FROM contenido_items i
         JOIN perfiles p ON p.cuenta_id = i.cuenta_id JOIN cuentas c ON c.id = i.cuenta_id
        WHERE i.id = $1 AND i.borrado IS NULL AND ${PERFIL_VISIBLE}`, [itemId]);
    if (!it) throw he(404, 'Este contenido ya no está a la venta.');
    // Si bajó de plan, solo los primeros packs que entran siguen a la venta.
    const lim = await limitePacks(it.cuenta_id);
    if (lim !== null) {
      const { rows: [pos] } = await pool.query(
        'SELECT count(*)::int AS n FROM contenido_items WHERE cuenta_id = $1 AND borrado IS NULL AND (creado, id) < ($2, $3)', [it.cuenta_id, it.creado, it.id]);
      if (!enVenta(pos.n, lim)) throw he(404, 'Este contenido ya no está a la venta.');
    }
    const token = await tokenDe(it.cuenta_id, activa.id);
    if (!token) throw he(409, 'Este contenido no se puede comprar en este momento.');
    const tk = crypto.randomBytes(32).toString('hex');
    const url = await iniciarPago({
      token, activa, cuentaId: it.cuenta_id, clienteId, ipHash, tk, tipo: 'pack', itemId: it.id, titulo: it.titulo,
      montoCentavos: it.precio_centavos, vuelta: () => `${SITE}/compra/${tk}`,
    });
    return { url, token: tk };
  }

  // Crea la venta y la preferencia de Checkout Pro (con el token de la vendedora y la comisión como marketplace_fee).
  async function iniciarPago({ token, activa, cuentaId, clienteId, ipHash = null, tk, tipo, itemId = null, solicitudItemId = null, titulo, montoCentavos, vuelta }) {
    const pct = await comisionPct();
    const comi = Math.round(Number(montoCentavos) * pct / 100);
    const { rows: [v] } = await pool.query(
      `INSERT INTO ventas_contenido (token, item_id, cuenta_id, app_id, titulo, monto_centavos, comision_pct, comision_centavos, ip_hash, cliente_id, tipo, solicitud_item_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [tk, itemId, cuentaId, activa.id, titulo, montoCentavos, pct, comi, ipHash, clienteId, tipo, solicitudItemId]);
    const back = vuelta(v);
    const pref = {
      // Título neutro (decisión de Juan): a Mercado Pago nunca va el título ni la descripción de la vendedora.
      items: [{ id: itemId || solicitudItemId, title: tituloNeutro(v.id), description: 'Contenido digital', quantity: 1, unit_price: Number(montoCentavos) / 100, currency_id: 'ARS' }],
      statement_descriptor: DESCRIPTOR_NEUTRO,
      marketplace_fee: comi / 100,
      external_reference: v.id,
      back_urls: { success: back, pending: back, failure: back },
      auto_return: 'approved',
      notification_url: `${SITE}/api/mp/webhook?venta=${v.id}&source_news=webhooks`,
    };
    let r;
    try {
      r = await mp.crearPreferencia(token, pref, v.id);
    } catch (e) {
      await pool.query('DELETE FROM ventas_contenido WHERE id = $1', [v.id]);
      if (e.status === 401 || e.status === 403) {
        await pool.query("UPDATE mp_conexiones SET estado = 'revocada', error = $3 WHERE cuenta_id = $1 AND app_id = $2", [cuentaId, activa.id, 'preferencia ' + e.status]);
        invalidar();
        throw he(409, 'Este contenido no se puede comprar en este momento.');
      }
      log('mercado pago: no se pudo crear la preferencia (' + (e.code || e.message) + ')');
      throw he(502, 'No se pudo iniciar el pago. Probá de nuevo en unos minutos.');
    }
    const url = r.init_point || r.sandbox_init_point;
    if (!url || !/^https:\/\//.test(url)) {
      await pool.query('DELETE FROM ventas_contenido WHERE id = $1', [v.id]);
      throw he(502, 'No se pudo iniciar el pago. Probá de nuevo en unos minutos.');
    }
    await pool.query('UPDATE ventas_contenido SET mp_preferencia = $2 WHERE id = $1', [v.id, r.id ? String(r.id) : null]);
    return url;
  }

  // Pago del contenido bloqueado de un pedido personalizado (lib/solicitudes.js ya controló que el cliente sea el del
  // pedido, que el contenido esté listo y sin pagar). Vuelve al chat del pedido.
  async function pagarItemPedido({ clienteId, item, solicitudId }) {
    if (!clienteId) throw he(401, 'Tenés que iniciar sesión.');
    const activa = await cuentaActiva();
    if (!cuentaCompleta(activa)) throw he(409, 'Los pagos no están disponibles en este momento.');
    const token = await tokenDe(item.cuenta_id, activa.id);
    if (!token) throw he(409, 'Este contenido no se puede pagar en este momento.');
    const tk = crypto.randomBytes(32).toString('hex');
    const url = await iniciarPago({
      token, activa, cuentaId: item.cuenta_id, clienteId, tk, tipo: 'pedido', solicitudItemId: item.id, titulo: 'Pedido personalizado',
      montoCentavos: item.precio_centavos, vuelta: () => `${SITE}/cliente/pedido/${solicitudId}`,
    });
    return { url };
  }

  // Al volver de Mercado Pago al chat: consulta los pagos abiertos de ese contenido (como /compra/<token>).
  async function verificarItemPedido(clienteId, itemId, { paymentId = null } = {}) {
    const { rows } = await pool.query(
      `SELECT * FROM ventas_contenido WHERE solicitud_item_id = $1 AND cliente_id = $2 AND estado IN ('pendiente', 'en_proceso')
        ORDER BY creado DESC LIMIT 3`, [itemId, clienteId]);
    for (const v of rows) {
      const hace = v.verificado ? now() - new Date(v.verificado).getTime() : Infinity;
      if (hace <= VERIFICAR_CADA_MS) continue;
      try { await verificar(v, paymentId && /^[0-9]{1,30}$/.test(String(paymentId)) ? String(paymentId) : null); } catch (e) { log('mercado pago: no se pudo consultar un pago (' + (e.code || e.message) + ')'); }
    }
  }

  // Aplica el estado de un pago de Mercado Pago a la venta (con la fila bloqueada). Nunca confía en lo que llega en la
  // notificación: el pago se consulta a Mercado Pago con el token de la vendedora y se controla referencia y monto.
  async function aplicarPago(ventaId, pago) {
    const nuevo = estadoVenta(pago && pago.status);
    if (!nuevo) return null;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: [v] } = await client.query('SELECT * FROM ventas_contenido WHERE id = $1 FOR UPDATE', [ventaId]);
      if (!v || String(pago.external_reference || '') !== v.id) { await client.query('ROLLBACK'); return null; }
      if (nuevo === 'aprobada') {
        const okMonto = Math.round(Number(pago.transaction_amount) * 100) === Number(v.monto_centavos) && (pago.currency_id || 'ARS') === 'ARS';
        if (!okMonto) { await client.query('ROLLBACK'); log('mercado pago: pago con monto distinto al de la venta; no se aprueba'); return null; }
      }
      const pagoId = pago.id == null ? null : String(pago.id);
      // Una venta aprobada solo cambia si ESE pago se devuelve o se contracarga
      if (v.estado === 'aprobada' && !(nuevo === 'reembolsada' && pagoId === v.mp_pago)) { await client.query('ROLLBACK'); return v.estado; }
      if (v.estado === 'reembolsada') { await client.query('ROLLBACK'); return v.estado; }
      let link = v.link_entregado;
      if (nuevo === 'aprobada' && !link && v.tipo !== 'pedido' && v.item_id) {
        const { rows: [it] } = await client.query('SELECT link FROM contenido_items WHERE id = $1', [v.item_id]);
        link = it ? it.link : null;
      }
      // Pedido personalizado: el contenido se desbloquea en el chat y vence a 1 mes del pago.
      if (nuevo === 'aprobada' && v.tipo === 'pedido' && v.solicitud_item_id) {
        const { rows: [si] } = await client.query(
          `UPDATE solicitud_items SET pagado = COALESCE(pagado, now()), vence = COALESCE(pagado, now()) + interval '1 month'
            WHERE id = $1 RETURNING solicitud_id`, [v.solicitud_item_id]);
        if (si) await client.query('UPDATE solicitudes SET actividad = now() WHERE id = $1', [si.solicitud_id]);
      }
      await client.query(
        `UPDATE ventas_contenido SET estado = $2, mp_pago = COALESCE($3, mp_pago), mp_estado = $4, link_entregado = $5,
                pagado = CASE WHEN $2 = 'aprobada' THEN COALESCE(pagado, now()) ELSE pagado END, actualizado = now(), verificado = now()
          WHERE id = $1`, [v.id, nuevo, pagoId, String(pago.status), link]);
      await client.query('COMMIT');
      return nuevo;
    } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; } finally { client.release(); }
  }

  // Consulta un pago (o busca los de la venta) a Mercado Pago con el token de la vendedora y lo aplica.
  async function verificar(v, pagoId) {
    const token = await tokenDe(v.cuenta_id, v.app_id);
    if (!token) return null;
    await pool.query('UPDATE ventas_contenido SET verificado = now() WHERE id = $1', [v.id]);
    if (pagoId) return aplicarPago(v.id, await mp.pago(token, pagoId));
    const r = await mp.buscarPagos(token, v.id);
    const lista = (r && Array.isArray(r.results) ? r.results : []).filter((p) => String(p.external_reference || '') === v.id);
    const elegido = lista.find((p) => p.status === 'approved') || lista.sort((a, b) => String(b.date_created || '').localeCompare(String(a.date_created || '')))[0];
    return elegido ? aplicarPago(v.id, elegido) : null;
  }

  // Notificación de Mercado Pago (POST /api/mp/webhook?venta=<id>&data.id=<pago>&type=payment).
  async function webhook({ query = {}, headers = {}, body = {} }) {
    const tipo = String(query.type || query.topic || (body && body.type) || '');
    const dataId = String(query['data.id'] || query.id || (body && body.data && body.data.id) || '');
    const ventaId = String(query.venta || '');
    if (tipo !== 'payment' || !dataId || !/^[0-9a-f-]{36}$/i.test(ventaId) || !/^[A-Za-z0-9_-]{1,64}$/.test(dataId)) return { status: 200, resultado: 'ignorada' };
    const { rows: [v] } = await pool.query('SELECT * FROM ventas_contenido WHERE id = $1', [ventaId]);
    if (!v) return { status: 200, resultado: 'ignorada' };
    const cuenta = porId(v.app_id);
    if (!cuenta || !firmaValida({ secret: cuenta.webhookSecret, header: headers['x-signature'], requestId: headers['x-request-id'], dataId: query['data.id'] || dataId })) {
      return { status: 401, resultado: 'firma inválida' };
    }
    try {
      const estado = await verificar(v, dataId);
      return { status: 200, resultado: estado || 'sin cambios' };
    } catch (e) {
      log('mercado pago: no se pudo consultar el pago de una notificación (' + (e.code || e.message) + ')');
      return { status: 502, resultado: 'error' }; // Mercado Pago reintenta
    }
  }

  // Página /compra/<token> del comprador. paymentId: el que agrega Mercado Pago al volver (se confirma con la API).
  async function compra(tk, { paymentId = null, clienteId = null } = {}) {
    if (!/^[0-9a-f]{64}$/.test(String(tk || ''))) throw he(404, 'Compra no encontrada.');
    let { rows: [v] } = await pool.query("SELECT * FROM ventas_contenido WHERE token = $1 AND tipo = 'pack'", [tk]);
    // Solo la ve el cliente que la hizo (con su sesión)
    if (!v || !clienteId || v.cliente_id !== clienteId) throw he(404, 'Compra no encontrada.');
    const abierta = ['pendiente', 'en_proceso'].includes(v.estado);
    const hace = v.verificado ? now() - new Date(v.verificado).getTime() : Infinity;
    if (abierta && hace > VERIFICAR_CADA_MS) {
      try { await verificar(v, paymentId && /^[0-9]{1,30}$/.test(String(paymentId)) ? String(paymentId) : null); } catch (e) { log('mercado pago: no se pudo consultar un pago (' + (e.code || e.message) + ')'); }
      ({ rows: [v] } = await pool.query('SELECT * FROM ventas_contenido WHERE token = $1', [tk]));
    }
    const { rows: [p] } = await pool.query("SELECT slug, datos->>'displayName' AS nombre FROM perfiles WHERE cuenta_id = $1", [v.cuenta_id]);
    return {
      estado: v.estado, titulo: v.titulo, monto: pesos(v.monto_centavos), creado: v.creado, pagado: v.pagado,
      vendedora: p ? { nombre: p.nombre || '', slug: p.slug } : null,
      link: v.estado === 'aprobada' ? v.link_entregado : null,
    };
  }

  // Tu espacio → Mis compras: los packs que compró el cliente (sin los pagos que nunca se iniciaron).
  async function comprasDeCliente(clienteId) {
    const { rows } = await pool.query(
      `SELECT v.*, p.slug, p.datos->>'displayName' AS nombre FROM ventas_contenido v LEFT JOIN perfiles p ON p.cuenta_id = v.cuenta_id
        WHERE v.cliente_id = $1 AND v.tipo = 'pack' AND v.estado <> 'pendiente' ORDER BY v.creado DESC LIMIT 200`, [clienteId]);
    return rows.map((v) => ({
      token: v.token, itemId: v.item_id, titulo: v.titulo, monto: pesos(v.monto_centavos), estado: v.estado, creado: v.creado, pagado: v.pagado,
      vendedora: v.slug ? { nombre: v.nombre || '', slug: v.slug } : null, link: v.estado === 'aprobada' ? v.link_entregado : null,
    }));
  }

  // ---------- Admin ----------
  async function resumenAdmin() {
    const activa = await cuentaActiva();
    const { rows } = await pool.query("SELECT app_id, count(*) FILTER (WHERE estado = 'activa' AND expira > now())::int AS conectadas FROM mp_conexiones GROUP BY app_id");
    const n = new Map(rows.map((x) => [x.app_id, x.conectadas]));
    return {
      disponible: cuentaCompleta(activa), activa: activa ? activa.id : null, comisionPct: await comisionPct(),
      cuentas: cuentas.map((c) => ({
        id: c.id, nombre: c.nombre, activa: !!activa && activa.id === c.id, completa: cuentaCompleta(c), conectadas: n.get(c.id) || 0,
        faltan: [!c.clientId && 'CLIENT_ID', !c.clientSecret && 'CLIENT_SECRET', !c.webhookSecret && 'WEBHOOK_SECRET'].filter(Boolean),
      })),
      redirectUri, webhookUrl: SITE + '/api/mp/webhook',
    };
  }
  async function elegirCuenta(id) {
    const c = porId(id);
    if (!c) throw he(400, 'Esa cuenta no está configurada.');
    if (!cuentaCompleta(c)) throw he(400, 'A esa cuenta le faltan datos en la configuración del servidor.');
    await pool.query(
      `INSERT INTO ajustes (clave, valor, actualizado) VALUES ('venta_contenido', $1::jsonb, now())
       ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado = now()`, [JSON.stringify({ cuenta: c.id })]);
    invalidar();
    return resumenAdmin();
  }
  async function ventasAdmin({ estado = null, limite = 300 } = {}) {
    const est = ['pendiente', 'en_proceso', 'aprobada', 'rechazada', 'reembolsada'].includes(estado) ? estado : null;
    const { rows } = await pool.query(
      `SELECT v.*, p.slug, p.datos->>'displayName' AS nombre FROM ventas_contenido v LEFT JOIN perfiles p ON p.cuenta_id = v.cuenta_id
        WHERE ($1::text IS NULL AND v.estado <> 'pendiente') OR v.estado = $1 ORDER BY v.creado DESC LIMIT $2`, [est, Math.min(1000, Math.max(1, limite))]);
    const { rows: [t] } = await pool.query(
      `SELECT count(*)::int AS ventas, COALESCE(sum(monto_centavos), 0)::bigint AS monto, COALESCE(sum(comision_centavos), 0)::bigint AS comision
         FROM ventas_contenido WHERE estado = 'aprobada'`);
    return {
      items: rows.map((x) => ({ ...ventaJson(x), cuenta: (porId(x.app_id) || { nombre: x.app_id }).nombre, acompanante: { id: x.cuenta_id, nombre: x.nombre || '', slug: x.slug || null } })),
      totales: { ventas: t.ventas, monto: pesos(t.monto), comision: pesos(t.comision) },
    };
  }

  let timer = null;
  function iniciarTarea({ listo = () => true, cadaMs = 12 * HOUR } = {}) {
    if (timer || !cuentas.length) return;
    const correr = () => { if (listo()) renovarTokens().catch((e) => log('mercado pago: renovación falló:', e.code || e.message)); };
    setTimeout(correr, 60 * 1000).unref();
    timer = setInterval(correr, cadaMs); timer.unref();
  }
  function detenerTarea() { if (timer) clearInterval(timer); timer = null; }

  return {
    cuentaActiva, disponible, comisionPct, estadoConexion, iniciarOAuth, completarOAuth, desconectar, renovarTokens,
    items, crearItem, editarItem, borrarItem, ventasDe, panel, itemsPublicos, comprar, webhook, compra, aplicarPago,
    puedeCobrar, tomaPedidos, pagarItemPedido, verificarItemPedido, comprasDeCliente,
    resumenAdmin, elegirCuenta, ventasAdmin, iniciarTarea, detenerTarea, redirectUri,
  };
}
