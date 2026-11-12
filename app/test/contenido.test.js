// Pruebas de la venta de contenido con Mercado Pago (marketplace): OAuth por aplicación, contenidos, compra con el
// token de la vendedora y marketplace_fee, notificaciones firmadas, aprobación automática, cambio de la cuenta de
// comisión (reconexión) y renovación de tokens. Mercado Pago está simulado (nunca se sale a la red).
//   DATABASE_URL=postgres://postgres@localhost:55432/<db> node --test test/contenido.test.js
import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { start } from '../server.js';
import { firmar, firmaValida, cuentasDesdeEnv } from '../lib/mercadopago.js';
import { createContenido, validarItem, cifrar, descifrar, estadoVenta } from '../lib/contenido.js';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('Falta DATABASE_URL.'); process.exit(1); }
const db = new pg.Pool({ connectionString: DATABASE_URL, max: 4 });
const A = '/panel-pruebas-contenido-0123456789';
const USER = 'admin-ct'; const PASS = 'clave-de-prueba-larga-789';
const SITE = 'https://sexyrose.test';
const CUENTA_A = { id: '1111111111111111', nombre: 'Juan', clientId: '1111111111111111', clientSecret: 'secreto-app-a', webhookSecret: 'webhook-a' };
const CUENTA_B = { id: '2222222222222222', nombre: 'Socio', clientId: '2222222222222222', clientSecret: 'secreto-app-b', webhookSecret: 'webhook-b' };
let instance; let BASE; let tmpData;

// ---------- Mercado Pago simulado ----------
const MP = { codigos: new Map(), refresh: new Map(), pagos: new Map(), prefs: [], tokenPosts: [], fallarRefresh: false };
function mpReset() { MP.codigos.clear(); MP.refresh.clear(); MP.pagos.clear(); MP.prefs.length = 0; MP.tokenPosts.length = 0; MP.fallarRefresh = false; }
const resp = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
async function mpFetch(url, opts = {}) {
  const u = new URL(url);
  const auth = (opts.headers && opts.headers.Authorization) || '';
  if (u.pathname === '/oauth/token') {
    const f = Object.fromEntries(new URLSearchParams(opts.body));
    MP.tokenPosts.push(f);
    const app = [CUENTA_A, CUENTA_B].find((c) => c.clientId === f.client_id);
    if (!app || f.client_secret !== app.clientSecret) return resp(401, { error: 'invalid_client' });
    if (f.grant_type === 'authorization_code') {
      const c = MP.codigos.get(f.code);
      if (!c || c.app !== app.id || f.redirect_uri !== SITE + '/api/cuenta/contenido/mp/callback') return resp(400, { error: 'invalid_grant' });
      MP.codigos.delete(f.code);
      MP.refresh.set(c.refresh, { app: app.id, access: c.access, user: c.user });
      return resp(200, { access_token: c.access, refresh_token: c.refresh, expires_in: 15552000, user_id: c.user, token_type: 'bearer' });
    }
    if (f.grant_type === 'refresh_token') {
      const r = MP.refresh.get(f.refresh_token);
      if (MP.fallarRefresh || !r || r.app !== app.id) return resp(400, { error: 'invalid_grant' });
      MP.refresh.delete(f.refresh_token);
      const access = r.access + '-r'; const refresh = 'RT-' + crypto.randomBytes(4).toString('hex');
      MP.refresh.set(refresh, { app: app.id, access, user: r.user });
      return resp(200, { access_token: access, refresh_token: refresh, expires_in: 15552000, user_id: r.user });
    }
  }
  if (u.pathname === '/checkout/preferences') {
    const body = JSON.parse(opts.body);
    MP.prefs.push({ auth, body });
    return resp(201, { id: 'pref-' + MP.prefs.length, init_point: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-' + MP.prefs.length });
  }
  const mPago = /^\/v1\/payments\/(\d+)$/.exec(u.pathname);
  if (mPago) {
    const p = MP.pagos.get(mPago[1]);
    if (!p) return resp(404, { message: 'not_found' });
    if (auth !== 'Bearer ' + p.token) return resp(401, { message: 'unauthorized' });
    return resp(200, p.pago);
  }
  if (u.pathname === '/v1/payments/search') {
    const ref = u.searchParams.get('external_reference');
    const res = [...MP.pagos.values()].filter((p) => auth === 'Bearer ' + p.token && p.pago.external_reference === ref).map((p) => p.pago);
    return resp(200, { results: res });
  }
  return resp(404, { message: 'ruta simulada desconocida ' + u.pathname });
}

// ---------- Ayudas ----------
const auth = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
const adm = (p, opts = {}) => fetch(BASE + A + '/api' + p, { ...opts, headers: { authorization: auth, ...(opts.headers || {}) } });
const admPut = (p, body) => adm(p, { method: 'PUT', body: JSON.stringify(body), headers: { 'content-type': 'application/json', 'x-sr-admin': '1', origin: BASE } });
const cta = (id, p, opts = {}) => fetch(BASE + '/api/cuenta' + p, { redirect: 'manual', ...opts, headers: { 'x-test-cuenta': id, ...(opts.headers || {}) } });
const ctaPost = (id, p, body, method = 'POST') => cta(id, p, { method, body: JSON.stringify(body ?? {}), headers: { 'content-type': 'application/json', 'x-sr': '1', origin: BASE } });
// Desde el 12/11/2026 comprar exige una cuenta de cliente con el email confirmado: por defecto, las pruebas compran
// con la sesión de un cliente verificado (CLI). cookie: otra sesión; cookie: '' = sin sesión.
let CLI = null;
async function crearCliente({ verificado = true } = {}) {
  const u = 'zzcli' + crypto.randomBytes(4).toString('hex');
  const { rows } = await db.query(
    `INSERT INTO clientes (usuario, usuario_norm, email, pass_hash, acepto_terminos, mayor_edad_declarada, email_verificado)
     VALUES ($1, $1, $2, 'x', now(), true, $3) RETURNING id`, [u, u + '@example.com', verificado ? new Date() : null]);
  const token = crypto.randomBytes(32).toString('base64url');
  await db.query("INSERT INTO sesiones_clientes (token_hash, cliente_id, expira) VALUES ($1, $2, now() + interval '1 day')",
    [crypto.createHash('sha256').update(token).digest(), rows[0].id]);
  return { id: rows[0].id, cookie: 'sr_cliente=' + token };
}
const pub = (p, opts = {}) => {
  const { cookie, ...o } = opts;
  const ck = cookie !== undefined ? cookie : (CLI ? CLI.cookie : '');
  return fetch(BASE + '/api' + p, { ...o, headers: { ...(o.headers || {}), ...(ck ? { cookie: ck } : {}) } });
};
const pubPost = (p, body, { cookie } = {}) => pub(p, { cookie, method: 'POST', body: JSON.stringify(body ?? {}), headers: { 'content-type': 'application/json', 'x-sr': '1', origin: BASE, 'cf-connecting-ip': '2001:db8::' + crypto.randomBytes(2).toString('hex') } });
let n = 0;
// plan: el de la vendedora (por defecto Star, que no tiene tope de packs); 'E' = Bronce sin suscripción.
async function vendedora({ plan = 'S' } = {}) {
  const email = `zzct-${Date.now()}-${n++}@example.com`;
  const { rows } = await db.query('INSERT INTO cuentas (email, pass_hash) VALUES ($1, $2) RETURNING id', [email, 'x']);
  const id = rows[0].id; const slug = 'zzct-' + id.slice(0, 8);
  await db.query("INSERT INTO perfiles (cuenta_id, slug, datos, estado, verificacion) VALUES ($1, $2, $3, 'publicado', 'verificada')",
    [id, slug, JSON.stringify({ displayName: 'Vendedora ' + n, provincia: 'zzct-prov' })]);
  if (plan !== 'E') await ponerPlan(id, plan);
  return { id, slug };
}
async function ponerPlan(id, plan) {
  await db.query('DELETE FROM suscripciones WHERE cuenta_id = $1', [id]);
  if (plan !== 'E') await db.query("INSERT INTO suscripciones (cuenta_id, plan, periodo, desde, hasta) VALUES ($1, $2, 'manual', now() - interval '1 hour', now() + interval '30 days')", [id, plan]);
}
// Conecta a la vendedora con la aplicación activa (flujo OAuth completo)
// Cada vendedora con su propia cuenta de Mercado Pago (una cuenta de Mercado Pago no se puede conectar a dos)
let usuarioMp = 5000;
async function conectar(v, { code = 'code-' + crypto.randomBytes(4).toString('hex'), app = CUENTA_A, user = ++usuarioMp } = {}) {
  const r = await ctaPost(v.id, '/contenido/mp/conectar');
  assert.equal(r.status, 200, await r.clone().text());
  const url = new URL((await r.json()).url);
  assert.equal(url.origin + url.pathname, 'https://auth.mercadopago.com.ar/authorization');
  assert.equal(url.searchParams.get('client_id'), app.clientId);
  assert.equal(url.searchParams.get('redirect_uri'), SITE + '/api/cuenta/contenido/mp/callback');
  const access = `AT-${v.id.slice(0, 6)}-${app.id.slice(0, 2)}-${crypto.randomBytes(3).toString('hex')}`;
  MP.codigos.set(code, { app: app.id, access, refresh: 'RT-' + crypto.randomBytes(4).toString('hex'), user });
  const cb = await cta(v.id, `/contenido/mp/callback?code=${code}&state=${url.searchParams.get('state')}`);
  assert.equal(cb.status, 303);
  assert.equal(cb.headers.get('location'), '/panel/contenido?mp=ok');
  return access;
}
const item = (over = {}) => ({ titulo: 'Pack de fotos', descripcion: 'Diez fotos', precio: 5000, link: 'https://drive.example.com/carpeta/abc', ...over });
async function crearItem(v, over) {
  const r = await ctaPost(v.id, '/contenido/items', item(over));
  assert.equal(r.status, 201, await r.clone().text());
  return (await r.json()).item;
}
function notificar(ventaId, pagoId, { secret = CUENTA_A.webhookSecret, firma = true } = {}) {
  const ts = String(Math.floor(Date.now() / 1000)); const requestId = crypto.randomUUID();
  const headers = { 'content-type': 'application/json', 'x-request-id': requestId };
  if (firma) headers['x-signature'] = `ts=${ts},v1=${firmar(secret, { dataId: pagoId, requestId, ts })}`;
  return pub(`/mp/webhook?venta=${ventaId}&data.id=${pagoId}&type=payment&source_news=webhooks`, {
    method: 'POST', headers, body: JSON.stringify({ action: 'payment.created', type: 'payment', data: { id: pagoId } }),
  });
}
const ventaDe = async (token) => (await db.query('SELECT * FROM ventas_contenido WHERE token = $1', [token])).rows[0];

before(async () => {
  tmpData = await fs.mkdtemp(path.join(os.tmpdir(), 'srct-data-'));
  instance = await start({
    port: 0, host: '127.0.0.1', databaseUrl: DATABASE_URL, adminPath: A, adminUser: USER, adminPassword: PASS,
    ipHashSalt: 'sal', siteUrl: SITE, dataDir: tmpData, log: () => {}, tareaPlanes: false, tareaContenido: false, tareaCotizacion: false,
    sendMail: async () => {}, mpCuentas: [CUENTA_A, CUENTA_B], mpFetch,
    requireCuenta: (req, res, next) => { const id = req.get('x-test-cuenta'); if (!id) return res.status(401).json({ error: 'Iniciá sesión.' }); req.cuenta = { id }; next(); },
  });
  BASE = `http://127.0.0.1:${instance.port}`;
  await instance.ready;
  await db.query("DELETE FROM cuentas WHERE email LIKE 'zzct-%'");
  await db.query("DELETE FROM ajustes WHERE clave IN ('venta_contenido', 'comision')");
  await db.query("DELETE FROM clientes WHERE email LIKE 'zzcli%'");
  CLI = await crearCliente();
});
beforeEach(async () => {
  mpReset();
  await db.query("DELETE FROM ajustes WHERE clave = 'venta_contenido'");
});
after(async () => {
  await instance?.close();
  await db.query("DELETE FROM cuentas WHERE email LIKE 'zzct-%'");
  await db.query("DELETE FROM ajustes WHERE clave = 'venta_contenido'");
  await db.end();
  if (tmpData) await fs.rm(tmpData, { recursive: true, force: true });
});

describe('piezas sueltas', () => {
  test('firma de las notificaciones (x-signature)', () => {
    const ts = '1704908010'; const requestId = 'req-1'; const dataId = 'ABC123';
    const v1 = firmar('s3creto', { dataId: 'abc123', requestId, ts });
    assert.ok(firmaValida({ secret: 's3creto', header: `ts=${ts},v1=${v1}`, requestId, dataId }), 'data.id alfanumérico va en minúsculas');
    assert.ok(!firmaValida({ secret: 'otro', header: `ts=${ts},v1=${v1}`, requestId, dataId }));
    assert.ok(!firmaValida({ secret: 's3creto', header: `ts=${ts},v1=${v1}`, requestId: 'req-2', dataId }));
    assert.ok(!firmaValida({ secret: 's3creto', header: '', requestId, dataId }));
    assert.ok(!firmaValida({ secret: '', header: `ts=${ts},v1=${v1}`, requestId, dataId }));
  });
  test('cuentas del .env, validación de contenidos, cifrado y estados', () => {
    const c = cuentasDesdeEnv({ MP_CUENTA_1_NOMBRE: 'Juan', MP_CUENTA_1_CLIENT_ID: '123', MP_CUENTA_1_CLIENT_SECRET: 's', MP_CUENTA_1_WEBHOOK_SECRET: 'w', MP_CUENTA_3_NOMBRE: 'Socio' });
    assert.deepEqual(c.map((x) => [x.id, x.nombre, !!x.clientSecret]), [['123', 'Juan', true], ['cuenta-3', 'Socio', false]]);
    assert.ok(validarItem(item()).valor);
    assert.match(validarItem(item({ link: 'http://inseguro.com/x' })).error, /https/);
    assert.match(validarItem(item({ link: 'javascript:alert(1)' })).error, /https/);
    assert.match(validarItem(item({ precio: 50 })).error, /precio/);
    assert.match(validarItem(item({ precio: 100.123 })).error, /decimales/);
    assert.match(validarItem(item({ titulo: 'ab' })).error, /título/);
    const enc = cifrar(CUENTA_A, 'APP_USR-token');
    assert.ok(!enc.includes('APP_USR'));
    assert.equal(descifrar(CUENTA_A, enc), 'APP_USR-token');
    assert.equal(descifrar(CUENTA_B, enc), null, 'con otra aplicación no se descifra');
    assert.equal(estadoVenta('approved'), 'aprobada'); assert.equal(estadoVenta('in_process'), 'en_proceso');
    assert.equal(estadoVenta('rejected'), 'rechazada'); assert.equal(estadoVenta('refunded'), 'reembolsada');
  });
  test('sin cuenta de comisión completa la función no está disponible', async () => {
    const ct = createContenido({ pool: db, mp: {}, cuentas: [{ ...CUENTA_A, webhookSecret: '' }], siteUrl: SITE });
    const v = await vendedora();
    assert.equal((await ct.panel(v.id)).disponible, false);
    assert.deepEqual(await ct.itemsPublicos(v.slug), { disponible: false, items: [], pedidos: false });
    await assert.rejects(ct.iniciarOAuth(v.id), /no está disponible/);
  });
});

describe('conexión con Mercado Pago (OAuth)', () => {
  test('conectar guarda los tokens cifrados por aplicación; el estado de otra cuenta no sirve', async () => {
    const v = await vendedora(); const otra = await vendedora();
    let p = await (await cta(v.id, '/contenido')).json();
    assert.equal(p.disponible, true); assert.equal(p.conexion.estado, 'sin_conectar'); assert.equal(p.comisionPct, 10);
    const access = await conectar(v, { user: 777 });
    const post = MP.tokenPosts.at(-1);
    assert.equal(post.client_secret, CUENTA_A.clientSecret); assert.equal(post.grant_type, 'authorization_code');
    const { rows: [c] } = await db.query('SELECT * FROM mp_conexiones WHERE cuenta_id = $1', [v.id]);
    assert.equal(c.app_id, CUENTA_A.id); assert.equal(c.mp_user_id, '777'); assert.equal(c.estado, 'activa');
    assert.ok(!c.access_cifrado.includes(access), 'el token no se guarda en claro');
    assert.ok(new Date(c.expira) > new Date(Date.now() + 170 * 86400000));
    p = await (await cta(v.id, '/contenido')).json();
    assert.equal(p.conexion.estado, 'conectada');
    // El "state" de una vendedora no sirve para otra (CSRF)
    const r = await ctaPost(v.id, '/contenido/mp/conectar');
    const st = new URL((await r.json()).url).searchParams.get('state');
    MP.codigos.set('code-x', { app: CUENTA_A.id, access: 'AT-x', refresh: 'RT-x', user: 1 });
    const cb = await cta(otra.id, `/contenido/mp/callback?code=code-x&state=${st}`);
    assert.equal(cb.headers.get('location'), '/panel/contenido?mp=error');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM mp_conexiones WHERE cuenta_id = $1', [otra.id])).rows[0].n, 0);
    // Cancelar en Mercado Pago
    assert.equal((await cta(v.id, '/contenido/mp/callback?error=access_denied')).headers.get('location'), '/panel/contenido?mp=cancelado');
    // Desconectar
    assert.equal((await ctaPost(v.id, '/contenido/mp/desconectar')).status, 200);
    assert.equal((await (await cta(v.id, '/contenido')).json()).conexion.estado, 'sin_conectar');
  });
  test('las mutaciones exigen mismo origen y X-SR', async () => {
    const v = await vendedora();
    const r = await cta(v.id, '/contenido/items', { method: 'POST', body: JSON.stringify(item()), headers: { 'content-type': 'application/json', origin: 'https://otro.example' } });
    assert.equal(r.status, 403);
    const r2 = await cta(v.id, '/contenido/mp/conectar', { method: 'POST', headers: { origin: BASE } });
    assert.equal(r2.status, 403);
  });
});

describe('packs por plan (Bronce 0, Plata 1, Oro 5, Star ilimitados)', () => {
  test('Bronce no puede cargar packs; Plata 1; Oro 5; Star más', async () => {
    const e = await vendedora({ plan: 'E' });
    const r = await ctaPost(e.id, '/contenido/items', item());
    assert.equal(r.status, 409); assert.match((await r.json()).error, /no incluye la venta de packs/);
    assert.equal((await (await cta(e.id, '/contenido')).json()).max, 0);
    const d = await vendedora({ plan: 'D' });
    await crearItem(d);
    const r2 = await ctaPost(d.id, '/contenido/items', item());
    assert.equal(r2.status, 409); assert.match((await r2.json()).error, /1 pack a la venta/);
    assert.equal((await (await cta(d.id, '/contenido')).json()).max, 1);
    const c = await vendedora({ plan: 'C' });
    for (let i = 0; i < 5; i++) await crearItem(c, { titulo: 'Pack ' + i });
    const r3 = await ctaPost(c.id, '/contenido/items', item());
    assert.equal(r3.status, 409); assert.match((await r3.json()).error, /5 packs a la venta/);
    const s = await vendedora({ plan: 'S' });
    for (let i = 0; i < 7; i++) await crearItem(s, { titulo: 'Pack ' + i });
    const pa = await (await cta(s.id, '/contenido')).json();
    assert.equal(pa.max, null); assert.equal(pa.items.length, 7); assert.ok(pa.items.every((x) => x.aLaVenta));
  });
  test('si baja de plan, los primeros que entran siguen a la venta y el resto no se puede comprar', async () => {
    const v = await vendedora({ plan: 'C' });
    await conectar(v);
    const its = [];
    for (let i = 0; i < 3; i++) its.push(await crearItem(v, { titulo: 'Pack ' + i }));
    await ponerPlan(v.id, 'D'); // Plata: 1 pack
    const pa = await (await cta(v.id, '/contenido')).json();
    assert.deepEqual(pa.items.map((x) => x.aLaVenta), [true, false, false]);
    const pubItems = (await (await pub('/sitio/contenido/perfil/' + v.slug)).json()).items;
    assert.deepEqual(pubItems.map((x) => x.id), [its[0].id]);
    const comprar = (id) => pubPost(`/sitio/contenido/${id}/comprar`);
    assert.equal((await comprar(its[1].id)).status, 404);
    assert.equal((await comprar(its[0].id)).status, 200);
    // y no puede cargar más mientras tenga más de los que permite su plan
    assert.equal((await ctaPost(v.id, '/contenido/items', item())).status, 409);
    // al volver a Oro, vuelven a estar a la venta
    await ponerPlan(v.id, 'C');
    assert.equal((await (await pub('/sitio/contenido/perfil/' + v.slug)).json()).items.length, 3);
  });
});

describe('contenidos y compra', () => {
  test('CRUD de contenidos; el perfil no muestra el link ni nada sin Mercado Pago conectado', async () => {
    const v = await vendedora();
    const it = await crearItem(v);
    assert.equal(it.precio.pesos, '5000.00');
    assert.equal((await ctaPost(v.id, '/contenido/items', item({ link: 'http://x.com' }))).status, 400);
    const ed = await ctaPost(v.id, '/contenido/items/' + it.id, item({ titulo: 'Pack editado', precio: '7500,50' }), 'PUT');
    assert.equal(ed.status, 200); assert.equal((await ed.json()).item.precio.centavos, 750050);
    // Sin conectar: el perfil no muestra contenidos
    assert.deepEqual((await (await pub('/sitio/contenido/perfil/' + v.slug)).json()).items, []);
    await conectar(v);
    const pubItems = (await (await pub('/sitio/contenido/perfil/' + v.slug)).json()).items;
    assert.equal(pubItems.length, 1); assert.equal(pubItems[0].titulo, 'Pack editado');
    assert.ok(!JSON.stringify(pubItems).includes('drive.example.com'), 'el link nunca sale en público');
    // Borrar
    assert.equal((await cta(v.id, '/contenido/items/' + it.id, { method: 'DELETE', headers: { 'x-sr': '1', origin: BASE } })).status, 200);
    assert.deepEqual((await (await pub('/sitio/contenido/perfil/' + v.slug)).json()).items, []);
    // Perfil no publicado: 404
    await db.query("UPDATE perfiles SET oculto = true WHERE cuenta_id = $1", [v.id]);
    assert.equal((await pub('/sitio/contenido/perfil/' + v.slug)).status, 404);
  });

  test('comprar crea la preferencia con el token de la vendedora y la comisión; el webhook firmado aprueba y entrega el link', async () => {
    await admPut('/ajustes/comision', { valor: { porcentaje: 12.5, saldoNegativoMax: 20 } });
    const v = await vendedora();
    const access = await conectar(v);
    const it = await crearItem(v, { precio: 8000 });
    const r = await pubPost(`/sitio/contenido/${it.id}/comprar`);
    assert.equal(r.status, 200, await r.clone().text());
    const { url, token } = await r.json();
    assert.match(url, /^https:\/\/www\.mercadopago\.com\.ar\//); assert.match(token, /^[0-9a-f]{64}$/);
    const pref = MP.prefs.at(-1);
    assert.equal(pref.auth, 'Bearer ' + access, 'la preferencia se crea con el token de la vendedora');
    assert.equal(pref.body.items[0].unit_price, 8000); assert.equal(pref.body.items[0].currency_id, 'ARS');
    assert.equal(pref.body.marketplace_fee, 1000);
    const venta = await ventaDe(token);
    assert.equal(pref.body.external_reference, venta.id);
    assert.equal(pref.body.back_urls.success, `${SITE}/compra/${token}`);
    assert.equal(pref.body.notification_url, `${SITE}/api/mp/webhook?venta=${venta.id}&source_news=webhooks`);
    assert.equal(venta.estado, 'pendiente'); assert.equal(Number(venta.comision_centavos), 100000);
    // Antes del pago: sin link
    let c = await (await pub('/sitio/compra/' + token)).json();
    assert.equal(c.estado, 'pendiente'); assert.equal(c.link, null);
    // Notificación sin firma o con firma de otra aplicación: 401 y no cambia nada
    MP.pagos.set('5001', { token: access, pago: { id: 5001, status: 'approved', external_reference: venta.id, transaction_amount: 8000, currency_id: 'ARS' } });
    assert.equal((await notificar(venta.id, '5001', { firma: false })).status, 401);
    assert.equal((await notificar(venta.id, '5001', { secret: CUENTA_B.webhookSecret })).status, 401);
    assert.equal((await ventaDe(token)).estado, 'pendiente');
    // Firma correcta: se consulta el pago con el token de la vendedora y se aprueba
    const w = await notificar(venta.id, '5001');
    assert.equal(w.status, 200); assert.equal((await w.json()).resultado, 'aprobada');
    c = await (await pub('/sitio/compra/' + token)).json();
    assert.equal(c.estado, 'aprobada'); assert.equal(c.link, 'https://drive.example.com/carpeta/abc'); assert.equal(c.vendedora.slug, v.slug);
    // Aparece en las ventas de la vendedora y del admin
    const pv = await (await cta(v.id, '/contenido')).json();
    assert.equal(pv.ventas.length, 1); assert.equal(pv.ventas[0].estado, 'aprobada');
    const av = await (await adm('/contenido/ventas')).json();
    assert.ok(av.items.some((x) => x.id === venta.id && x.cuenta === 'Juan' && x.comision.centavos === 100000));
    // La comisión no toca los créditos de la vendedora (Mercado Pago ya la retuvo)
    assert.equal((await db.query("SELECT count(*)::int AS n FROM creditos_movimientos WHERE cuenta_id = $1", [v.id])).rows[0].n, 0);
    // Una notificación repetida o un pago rechazado posterior no la cambian; la devolución de ESE pago sí
    assert.equal((await (await notificar(venta.id, '5001')).json()).resultado, 'aprobada');
    MP.pagos.set('5002', { token: access, pago: { id: 5002, status: 'rejected', external_reference: venta.id, transaction_amount: 8000 } });
    await notificar(venta.id, '5002');
    assert.equal((await ventaDe(token)).estado, 'aprobada');
    MP.pagos.get('5001').pago.status = 'refunded';
    await notificar(venta.id, '5001');
    c = await (await pub('/sitio/compra/' + token)).json();
    assert.equal(c.estado, 'reembolsada'); assert.equal(c.link, null);
    await admPut('/ajustes/comision', { valor: { porcentaje: 10, saldoNegativoMax: 20 } });
  });

  test('un pago con otro monto o de otra venta no aprueba', async () => {
    const v = await vendedora(); const access = await conectar(v); const it = await crearItem(v, { precio: 3000 });
    const { token } = await (await pubPost(`/sitio/contenido/${it.id}/comprar`)).json();
    const venta = await ventaDe(token);
    MP.pagos.set('6001', { token: access, pago: { id: 6001, status: 'approved', external_reference: venta.id, transaction_amount: 30, currency_id: 'ARS' } });
    await notificar(venta.id, '6001');
    MP.pagos.set('6002', { token: access, pago: { id: 6002, status: 'approved', external_reference: crypto.randomUUID(), transaction_amount: 3000, currency_id: 'ARS' } });
    await notificar(venta.id, '6002');
    assert.equal((await ventaDe(token)).estado, 'pendiente');
  });

  test('al volver de Mercado Pago, /compra/<token> confirma el pago aunque la notificación no haya llegado', async () => {
    const v = await vendedora(); const access = await conectar(v); const it = await crearItem(v, { precio: 1500 });
    const { token } = await (await pubPost(`/sitio/contenido/${it.id}/comprar`)).json();
    const venta = await ventaDe(token);
    MP.pagos.set('7001', { token: access, pago: { id: 7001, status: 'approved', external_reference: venta.id, transaction_amount: 1500, currency_id: 'ARS', date_created: new Date().toISOString() } });
    const c = await (await pub(`/sitio/compra/${token}?payment_id=7001`)).json();
    assert.equal(c.estado, 'aprobada'); assert.ok(c.link);
    // Sin payment_id también la encuentra (búsqueda por external_reference)
    const it2 = await crearItem(v, { precio: 1600, titulo: 'Otro pack' });
    const { token: t2 } = await (await pubPost(`/sitio/contenido/${it2.id}/comprar`)).json();
    const v2 = await ventaDe(t2);
    MP.pagos.set('7002', { token: access, pago: { id: 7002, status: 'approved', external_reference: v2.id, transaction_amount: 1600, currency_id: 'ARS', date_created: new Date().toISOString() } });
    assert.equal((await (await pub(`/sitio/compra/${t2}`)).json()).estado, 'aprobada');
    assert.equal((await pub('/sitio/compra/' + 'f'.repeat(64))).status, 404);
    // La compra solo la ve su dueño: otro cliente → 404; sin sesión → 401
    const otro = await crearCliente();
    assert.equal((await pub(`/sitio/compra/${t2}`, { cookie: otro.cookie })).status, 404);
    assert.equal((await pub(`/sitio/compra/${t2}`, { cookie: '' })).status, 401);
    // Mis compras (Tu espacio)
    const mis = await (await pub('/cliente/compras')).json();
    assert.ok(mis.items.some((x) => x.token === t2 && x.estado === 'aprobada' && x.link));
    assert.equal((await (await pub('/cliente/compras', { cookie: otro.cookie })).json()).items.length, 0);
  });

  test('comprar exige un cliente con sesión y email confirmado', async () => {
    const v = await vendedora(); await conectar(v); const it = await crearItem(v);
    const sin = await pubPost(`/sitio/contenido/${it.id}/comprar`, {}, { cookie: '' });
    assert.equal(sin.status, 401);
    assert.equal((await sin.json()).requiereLogin, true);
    const nv = await crearCliente({ verificado: false });
    const r = await pubPost(`/sitio/contenido/${it.id}/comprar`, {}, { cookie: nv.cookie });
    assert.equal(r.status, 403);
    assert.equal((await r.json()).requiereVerificacion, true);
    const ok = await pubPost(`/sitio/contenido/${it.id}/comprar`);
    assert.equal(ok.status, 200);
    const { token } = await ok.json();
    assert.equal((await ventaDe(token)).cliente_id, CLI.id);
    assert.equal((await ventaDe(token)).tipo, 'pack');
  });

  test('comprar exige mismo origen y X-SR', async () => {
    const v = await vendedora(); await conectar(v); const it = await crearItem(v);
    const r = await pub(`/sitio/contenido/${it.id}/comprar`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://otro.example' }, body: '{}' });
    assert.equal(r.status, 403);
  });
});

describe('una sola cuenta de Mercado Pago por acompañante y título neutro', () => {
  test('la misma cuenta de Mercado Pago no se conecta a dos acompañantes (ni en otra aplicación)', async () => {
    const v1 = await vendedora(); const v2 = await vendedora();
    await conectar(v1, { user: 4242 });
    // Otra acompañante con la misma cuenta de Mercado Pago: se rechaza y no queda conexión
    const r = await ctaPost(v2.id, '/contenido/mp/conectar');
    const st = new URL((await r.json()).url).searchParams.get('state');
    MP.codigos.set('code-dup', { app: CUENTA_A.id, access: 'AT-dup', refresh: 'RT-dup', user: 4242 });
    const cb = await cta(v2.id, `/contenido/mp/callback?code=code-dup&state=${st}`);
    assert.equal(cb.status, 303); assert.equal(cb.headers.get('location'), '/panel/contenido?mp=en_uso');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM mp_conexiones WHERE cuenta_id = $1', [v2.id])).rows[0].n, 0);
    assert.equal((await (await cta(v2.id, '/contenido')).json()).conexion.estado, 'sin_conectar');
    // Tampoco con la otra aplicación (cuenta de comisión del socio)
    await admPut('/contenido/cuenta-activa', { cuenta: CUENTA_B.id });
    const r2 = await ctaPost(v2.id, '/contenido/mp/conectar');
    const st2 = new URL((await r2.json()).url).searchParams.get('state');
    MP.codigos.set('code-dup2', { app: CUENTA_B.id, access: 'AT-dup2', refresh: 'RT-dup2', user: 4242 });
    const cb2 = await cta(v2.id, `/contenido/mp/callback?code=code-dup2&state=${st2}`);
    assert.equal(cb2.headers.get('location'), '/panel/contenido?mp=en_uso');
    // La misma acompañante sí puede reconectar su propia cuenta (también en la otra aplicación)
    await conectar(v1, { app: CUENTA_B, user: 4242 });
    // Y la base lo impide aunque se saltee el control (misma aplicación)
    await assert.rejects(db.query("INSERT INTO mp_conexiones (cuenta_id, app_id, mp_user_id, access_cifrado, expira) VALUES ($1, $2, '4242', 'x', now() + interval '1 day')", [v2.id, CUENTA_A.id]), /mp_conexiones_app_usuario_uq/);
  });

  test('a Mercado Pago va un título neutro: nunca el título ni la descripción de la vendedora', async () => {
    const v = await vendedora(); await conectar(v);
    const it = await crearItem(v, { titulo: 'Pack secreto de Martina', descripcion: 'Fotos picantes en la playa' });
    const r = await pubPost(`/sitio/contenido/${it.id}/comprar`);
    assert.equal(r.status, 200, await r.clone().text());
    const venta = await ventaDe((await r.json()).token);
    const pref = MP.prefs.at(-1).body;
    assert.equal(pref.items[0].title, 'Contenido digital #' + venta.id.replace(/-/g, '').slice(0, 8).toUpperCase());
    assert.equal(pref.items[0].description, 'Contenido digital');
    assert.equal(pref.statement_descriptor, 'CONT DIGITAL');
    const enviado = JSON.stringify(pref);
    assert.ok(!enviado.includes('Martina') && !enviado.includes('picantes') && !enviado.includes('secreto'), 'no se manda nada de lo que escribió la vendedora');
    // Para la vendedora y el comprador (en el sitio) el título sigue siendo el suyo
    assert.equal(venta.titulo, 'Pack secreto de Martina');
  });
});

describe('cuenta de comisión y tokens', () => {
  test('cambiar la cuenta activa pide reconectar; con la nueva conexión la comisión va a la otra aplicación', async () => {
    const v = await vendedora(); await conectar(v); const it = await crearItem(v, { precio: 2000 });
    let res = await (await adm('/contenido/resumen')).json();
    assert.equal(res.activa, CUENTA_A.id);
    const conectadasA = res.cuentas.find((c) => c.id === CUENTA_A.id).conectadas;
    assert.ok(conectadasA >= 1);
    // Cuenta desconocida: 400
    assert.equal((await admPut('/contenido/cuenta-activa', { cuenta: 'no-existe' })).status, 400);
    const r = await admPut('/contenido/cuenta-activa', { cuenta: CUENTA_B.id });
    assert.equal(r.status, 200);
    res = await r.json();
    assert.equal(res.activa, CUENTA_B.id); assert.equal(res.cuentas.find((c) => c.id === CUENTA_B.id).activa, true);
    // La vendedora tiene que reconectar; mientras tanto no se puede comprar
    assert.equal((await (await cta(v.id, '/contenido')).json()).conexion.estado, 'reconectar');
    assert.deepEqual((await (await pub('/sitio/contenido/perfil/' + v.slug)).json()).items, []);
    assert.equal((await pubPost(`/sitio/contenido/${it.id}/comprar`)).status, 409);
    const accessB = await conectar(v, { app: CUENTA_B });
    assert.equal((await (await cta(v.id, '/contenido')).json()).conexion.estado, 'conectada');
    const { token } = await (await pubPost(`/sitio/contenido/${it.id}/comprar`)).json();
    assert.equal(MP.prefs.at(-1).auth, 'Bearer ' + accessB);
    const venta = await ventaDe(token);
    assert.equal(venta.app_id, CUENTA_B.id);
    // La notificación de esa venta se valida con el secreto de la aplicación B
    MP.pagos.set('8001', { token: accessB, pago: { id: 8001, status: 'approved', external_reference: venta.id, transaction_amount: 2000, currency_id: 'ARS' } });
    assert.equal((await notificar(venta.id, '8001', { secret: CUENTA_A.webhookSecret })).status, 401);
    assert.equal((await (await notificar(venta.id, '8001', { secret: CUENTA_B.webhookSecret })).json()).resultado, 'aprobada');
  });

  test('renovación de tokens: renueva los que vencen pronto y corta los revocados', async () => {
    const v = await vendedora(); const access = await conectar(v);
    await db.query("UPDATE mp_conexiones SET expira = now() + interval '5 days' WHERE cuenta_id = $1", [v.id]);
    const ct = instance.ctx.contenido;
    const r1 = await ct.renovarTokens();
    assert.ok(r1.ok >= 1);
    assert.equal(MP.tokenPosts.at(-1).grant_type, 'refresh_token');
    const { rows: [c] } = await db.query('SELECT * FROM mp_conexiones WHERE cuenta_id = $1', [v.id]);
    assert.ok(new Date(c.expira) > new Date(Date.now() + 170 * 86400000)); assert.ok(c.renovada);
    // Con el token nuevo se sigue pudiendo cobrar
    const it = await crearItem(v);
    await pubPost(`/sitio/contenido/${it.id}/comprar`);
    assert.equal(MP.prefs.at(-1).auth, 'Bearer ' + access + '-r');
    // Mercado Pago rechaza el refresh (permiso revocado): la conexión queda cortada y pide reconectar
    await db.query("UPDATE mp_conexiones SET expira = now() + interval '5 days' WHERE cuenta_id = $1", [v.id]);
    MP.fallarRefresh = true;
    const r2 = await ct.renovarTokens();
    assert.ok(r2.revocadas >= 1);
    assert.equal((await db.query('SELECT estado FROM mp_conexiones WHERE cuenta_id = $1', [v.id])).rows[0].estado, 'revocada');
    assert.equal((await (await cta(v.id, '/contenido')).json()).conexion.estado, 'reconectar');
    assert.equal((await pubPost(`/sitio/contenido/${it.id}/comprar`)).status, 409);
  });
});
