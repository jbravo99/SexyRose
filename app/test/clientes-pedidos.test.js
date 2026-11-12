// Cuentas de interesados (clientes) y pedidos personalizados con chat (12/11/2026):
// registro → email confirmado → ingreso → recuperar contraseña; sesiones separadas de las acompañantes; pedido →
// aceptar/rechazar → chat (since=) → contenido bloqueado (foto y video) con vista previa borrosa → pago con Mercado Pago
// simulado → desbloqueo solo para ese cliente → vencimiento a 1 mes. Mercado Pago simulado (nunca se sale a la red).
//   DATABASE_URL=postgres://postgres@localhost:55432/<db> node --test test/clientes-pedidos.test.js
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import pg from 'pg';
import sharp from 'sharp';
import { start } from '../server.js';
import { firmar } from '../lib/mercadopago.js';
import { mailsEnviados } from '../lib/mail.js';
import { tam720 } from '../lib/solicitudes.js';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('Falta DATABASE_URL.'); process.exit(1); }
const db = new pg.Pool({ connectionString: DATABASE_URL, max: 4 });
const A = '/panel-pruebas-clientes-0123456789';
const SITE = 'https://sexyrose.test';
const APP = { id: '3333333333333333', nombre: 'Juan', clientId: '3333333333333333', clientSecret: 'secreto-app-c', webhookSecret: 'webhook-c' };
let instance; let BASE; let tmpData;

// ---------- Mercado Pago simulado ----------
const MP = { codigos: new Map(), pagos: new Map(), prefs: [] };
const resp = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
async function mpFetch(url, opts = {}) {
  const u = new URL(url);
  const auth = (opts.headers && opts.headers.Authorization) || '';
  if (u.pathname === '/oauth/token') {
    const f = Object.fromEntries(new URLSearchParams(opts.body));
    const c = MP.codigos.get(f.code);
    if (!c) return resp(400, { error: 'invalid_grant' });
    MP.codigos.delete(f.code);
    return resp(200, { access_token: c.access, refresh_token: 'RT-' + crypto.randomBytes(4).toString('hex'), expires_in: 15552000, user_id: c.user });
  }
  if (u.pathname === '/checkout/preferences') {
    MP.prefs.push({ auth, body: JSON.parse(opts.body) });
    return resp(201, { id: 'pref-' + MP.prefs.length, init_point: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-' + MP.prefs.length });
  }
  const m = /^\/v1\/payments\/(\d+)$/.exec(u.pathname);
  if (m) {
    const p = MP.pagos.get(m[1]);
    if (!p) return resp(404, { message: 'not_found' });
    if (auth !== 'Bearer ' + p.token) return resp(401, {});
    return resp(200, p.pago);
  }
  if (u.pathname === '/v1/payments/search') {
    const ref = u.searchParams.get('external_reference');
    return resp(200, { results: [...MP.pagos.values()].filter((p) => auth === 'Bearer ' + p.token && p.pago.external_reference === ref).map((p) => p.pago) });
  }
  return resp(404, {});
}

// ---------- Ayudas ----------
const ip = () => '2001:db8::' + crypto.randomBytes(2).toString('hex');
const req = (p, { method = 'GET', body, cookie = '', headers = {} } = {}) => fetch(BASE + '/api' + p, {
  method, redirect: 'manual',
  headers: { ...(cookie ? { cookie } : {}), ...(method !== 'GET' ? { 'content-type': 'application/json', 'x-sr': '1', origin: BASE } : {}), 'cf-connecting-ip': ip(), ...headers },
  ...(method !== 'GET' ? { body: JSON.stringify(body ?? {}) } : {}),
});
const post = (p, body, cookie) => req(p, { method: 'POST', body, cookie });
const cookieDe = (r, nombre) => { const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')]; const c = sc.find((x) => x && x.startsWith(nombre + '=')); return c ? c.split(';')[0] : ''; };
const token = () => crypto.randomBytes(32).toString('base64url');
const sha = (t) => crypto.createHash('sha256').update(t).digest();
let n = 0;

async function sesionAcomp(id) {
  const t = token();
  await db.query("INSERT INTO sesiones (token_hash, cuenta_id, expira) VALUES ($1, $2, now() + interval '1 day')", [sha(t), id]);
  return 'sr_sesion=' + t;
}
async function vendedora({ plan = 'C', conectar = true } = {}) {
  const email = `zzcp-${Date.now()}-${n++}@example.com`;
  const { rows } = await db.query("INSERT INTO cuentas (email, pass_hash, email_verificado) VALUES ($1, 'x', now()) RETURNING id", [email]);
  const id = rows[0].id; const slug = 'zzcp-' + id.slice(0, 8);
  await db.query("INSERT INTO perfiles (cuenta_id, slug, datos, estado, verificacion) VALUES ($1, $2, $3, 'publicado', 'verificada')", [id, slug, JSON.stringify({ displayName: 'Vendedora ' + n })]);
  if (plan !== 'E') await db.query("INSERT INTO suscripciones (cuenta_id, plan, periodo, desde, hasta) VALUES ($1, $2, 'manual', now() - interval '1 hour', now() + interval '30 days')", [id, plan]);
  const cookie = await sesionAcomp(id);
  let access = null;
  if (conectar) {
    const r = await post('/cuenta/contenido/mp/conectar', {}, cookie);
    assert.equal(r.status, 200, await r.clone().text());
    const url = new URL((await r.json()).url);
    const code = 'code-' + crypto.randomBytes(4).toString('hex');
    access = 'AT-' + crypto.randomBytes(4).toString('hex');
    MP.codigos.set(code, { access, user: 9000 + n });
    const cb = await req(`/cuenta/contenido/mp/callback?code=${code}&state=${url.searchParams.get('state')}`, { cookie });
    assert.equal(cb.status, 303);
    assert.equal(cb.headers.get('location'), '/panel/contenido?mp=ok');
  }
  return { id, slug, cookie, access };
}
async function cliente({ verificado = true } = {}) {
  const u = 'zzcpcli' + crypto.randomBytes(3).toString('hex');
  const { rows } = await db.query(
    `INSERT INTO clientes (usuario, usuario_norm, email, pass_hash, acepto_terminos, mayor_edad_declarada, email_verificado)
     VALUES ($1, $1, $2, 'x', now(), true, $3) RETURNING id`, [u, u + '@example.com', verificado ? new Date() : null]);
  const t = token();
  await db.query("INSERT INTO sesiones_clientes (token_hash, cliente_id, expira) VALUES ($1, $2, now() + interval '1 day')", [sha(t), rows[0].id]);
  return { id: rows[0].id, usuario: u, cookie: 'sr_cliente=' + t };
}
function notificar(ventaId, pagoId) {
  const ts = String(Math.floor(Date.now() / 1000)); const requestId = crypto.randomUUID();
  return fetch(`${BASE}/api/mp/webhook?venta=${ventaId}&data.id=${pagoId}&type=payment`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-request-id': requestId, 'x-signature': `ts=${ts},v1=${firmar(APP.webhookSecret, { dataId: pagoId, requestId, ts })}` },
    body: JSON.stringify({ type: 'payment', data: { id: pagoId } }),
  });
}
async function subir(cookie, solicitudId, { buf, nombre, tipo, precio = '3500' }) {
  const fd = new FormData();
  fd.append('precio', precio);
  fd.append('archivo', new Blob([buf], { type: tipo }), nombre);
  return fetch(`${BASE}/api/cuenta/solicitudes/${solicitudId}/items`, { method: 'POST', body: fd, headers: { cookie, 'x-sr': '1', origin: BASE } });
}
const esperar = async (fn, ms = 60000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error('tiempo agotado'); await new Promise((r) => setTimeout(r, 250)); } };

before(async () => {
  tmpData = await fs.mkdtemp(path.join(os.tmpdir(), 'srcp-data-'));
  instance = await start({
    port: 0, host: '127.0.0.1', databaseUrl: DATABASE_URL, adminPath: A, adminUser: 'adm', adminPassword: 'clave-de-prueba-larga-123',
    ipHashSalt: 'sal', siteUrl: SITE, dataDir: tmpData, log: () => {}, tareaPlanes: false, tareaContenido: false, tareaCotizacion: false,
    mpCuentas: [APP], mpFetch, cookieSecure: false,
  });
  BASE = `http://127.0.0.1:${instance.port}`;
  await instance.ready;
  await db.query("DELETE FROM cuentas WHERE email LIKE 'zzcp-%'");
  await db.query("DELETE FROM clientes WHERE email LIKE 'zzcp%' OR email LIKE 'zzreg%'");
});
after(async () => {
  await instance?.close();
  await db.query("DELETE FROM cuentas WHERE email LIKE 'zzcp-%'");
  await db.query("DELETE FROM clientes WHERE email LIKE 'zzcp%' OR email LIKE 'zzreg%'");
  await db.end();
  await fs.rm(tmpData, { recursive: true, force: true });
});

describe('cuentas de interesados', () => {
  test('registro, email sin confirmar, confirmación, ingreso, salida y recuperar contraseña', async () => {
    const email = `zzreg-${Date.now()}@example.com`;
    // Validaciones
    assert.equal((await post('/cliente/registro', { usuario: 'a', email, password: 'contraseña-larga', mayorEdad: true, aceptaTerminos: true })).status, 400);
    assert.equal((await post('/cliente/registro', { usuario: 'juan_perez', email, password: 'contraseña-larga', mayorEdad: false, aceptaTerminos: true })).status, 400);
    assert.equal((await post('/cliente/registro', { usuario: 'juan_perez', email, password: 'corta', mayorEdad: true, aceptaTerminos: true })).status, 400);
    const usuario = 'Zz.' + crypto.randomBytes(3).toString('hex');
    const r = await post('/cliente/registro', { usuario, email, password: 'contraseña-larga', mayorEdad: true, aceptaTerminos: true });
    assert.equal(r.status, 201, await r.clone().text());
    const ck = cookieDe(r, 'sr_cliente');
    assert.ok(ck, 'deja la cookie de sesión del cliente');
    assert.ok(!cookieDe(r, 'sr_sesion'), 'nunca la de las acompañantes');
    const yo = (await r.json()).cliente;
    assert.equal(yo.usuario, usuario); assert.equal(yo.emailVerificado, false);
    // Mismo usuario (sin importar mayúsculas) o mismo email: 409
    assert.equal((await post('/cliente/registro', { usuario: usuario.toUpperCase(), email: 'zzreg-otro-' + email, password: 'contraseña-larga', mayorEdad: true, aceptaTerminos: true })).status, 409);
    assert.equal((await post('/cliente/registro', { usuario: usuario + 'x', email, password: 'contraseña-larga', mayorEdad: true, aceptaTerminos: true })).status, 409);
    // Sin confirmar no puede pedir
    const v = await vendedora();
    const p0 = await post('/cliente/pedidos', { slug: v.slug, texto: 'Hola, quiero un pedido' }, ck);
    assert.equal(p0.status, 403); assert.equal((await p0.json()).requiereVerificacion, true);
    // Email de confirmación → /cliente/verificar?token=
    const mail = [...mailsEnviados].reverse().find((m) => m.to === email);
    assert.ok(mail && /\/cliente\/verificar\?token=/.test(mail.links[0]));
    const t = new URL(mail.links[0]).searchParams.get('token');
    assert.equal((await post('/cliente/verificar-email', { token: t })).status, 200);
    assert.equal((await post('/cliente/verificar-email', { token: t })).status, 400, 'el link sirve una vez');
    assert.equal((await (await req('/cliente/yo', { cookie: ck })).json()).cliente.emailVerificado, true);
    // Salir e ingresar
    assert.equal((await post('/cliente/logout', {}, ck)).status, 200);
    assert.equal((await req('/cliente/yo', { cookie: ck })).status, 401);
    assert.equal((await post('/cliente/login', { email, password: 'mal-mal-mal-mal' })).status, 401);
    const l = await post('/cliente/login', { email, password: 'contraseña-larga' });
    assert.equal(l.status, 200);
    const ck2 = cookieDe(l, 'sr_cliente');
    // Recuperar contraseña
    assert.equal((await post('/cliente/olvide', { email })).status, 200);
    const m2 = [...mailsEnviados].reverse().find((m) => m.to === email && /restablecer/.test(m.links[0] || ''));
    const t2 = new URL(m2.links[0]).searchParams.get('token');
    const rs = await post('/cliente/restablecer', { token: t2, password: 'otra-contraseña-larga' });
    assert.equal(rs.status, 200);
    assert.equal((await req('/cliente/yo', { cookie: ck2 })).status, 401, 'se cierran las otras sesiones');
    assert.equal((await post('/cliente/login', { email, password: 'otra-contraseña-larga' })).status, 200);
  });

  test('las sesiones están separadas: un cliente no entra al panel ni una acompañante a la cuenta de cliente', async () => {
    const c = await cliente(); const v = await vendedora({ conectar: false });
    assert.equal((await req('/cuenta/yo', { cookie: c.cookie })).status, 401);
    assert.equal((await req('/cuenta/solicitudes', { cookie: c.cookie })).status, 401);
    assert.equal((await req('/cliente/yo', { cookie: v.cookie })).status, 401);
    assert.equal((await req('/cliente/pedidos', { cookie: v.cookie })).status, 401);
    // Una cookie de cliente con nombre de la de acompañante tampoco sirve
    assert.equal((await req('/cuenta/yo', { cookie: c.cookie.replace('sr_cliente=', 'sr_sesion=') })).status, 401);
  });
});

describe('pedidos personalizados', () => {
  test('solo Oro y Star con Mercado Pago conectado; el perfil lo anuncia', async () => {
    const c = await cliente();
    const plata = await vendedora({ plan: 'D' });
    const oroSinMp = await vendedora({ plan: 'C', conectar: false });
    const star = await vendedora({ plan: 'S' });
    assert.equal((await (await req('/sitio/contenido/perfil/' + plata.slug)).json()).pedidos, false);
    assert.equal((await (await req('/sitio/contenido/perfil/' + oroSinMp.slug)).json()).pedidos, false);
    assert.equal((await (await req('/sitio/contenido/perfil/' + star.slug)).json()).pedidos, true);
    assert.equal((await post('/cliente/pedidos', { slug: plata.slug, texto: 'Quiero algo' }, c.cookie)).status, 409);
    assert.equal((await post('/cliente/pedidos', { slug: oroSinMp.slug, texto: 'Quiero algo' }, c.cookie)).status, 409);
    assert.equal((await post('/cliente/pedidos', { slug: star.slug, texto: 'Quiero algo' }, c.cookie)).status, 201);
    assert.equal((await post('/cliente/pedidos', { slug: star.slug, texto: 'x'.repeat(501) }, c.cookie)).status, 400);
    const dup = await post('/cliente/pedidos', { slug: star.slug, texto: 'Otro pedido' }, c.cookie);
    assert.equal(dup.status, 409, 'un solo pedido sin responder por acompañante');
    assert.equal((await post('/cliente/pedidos', { slug: star.slug, texto: 'Quiero algo' })).status, 401, 'sin sesión');
  });

  test('rechazar termina ahí, sin chat', async () => {
    const c = await cliente(); const v = await vendedora();
    const { id } = await (await post('/cliente/pedidos', { slug: v.slug, texto: 'Un pedido para rechazar' }, c.cookie)).json();
    const lista = await (await req('/cuenta/solicitudes', { cookie: v.cookie })).json();
    const it = lista.items.find((x) => x.id === id);
    assert.equal(it.cliente.usuario, c.usuario); assert.equal(it.noLeidos, 1); assert.ok(!('email' in it.cliente));
    assert.equal((await post(`/cuenta/solicitudes/${id}/rechazar`, {}, v.cookie)).status, 200);
    assert.equal((await post(`/cuenta/solicitudes/${id}/aceptar`, {}, v.cookie)).status, 409);
    assert.equal((await post(`/cliente/pedidos/${id}/mensajes`, { texto: 'hola' }, c.cookie)).status, 409);
    const d = await (await req(`/cliente/pedidos/${id}`, { cookie: c.cookie })).json();
    assert.equal(d.solicitud.estado, 'rechazada');
    // Otro cliente u otra acompañante: no lo ven
    const otro = await cliente(); const otra = await vendedora({ conectar: false });
    assert.equal((await req(`/cliente/pedidos/${id}`, { cookie: otro.cookie })).status, 404);
    assert.equal((await req(`/cuenta/solicitudes/${id}`, { cookie: otra.cookie })).status, 404);
  });

  test('aceptar abre el chat; mensajes con since, no leídos, límite de velocidad y cierre', async () => {
    const c = await cliente(); const v = await vendedora({ plan: 'S' });
    const { id } = await (await post('/cliente/pedidos', { slug: v.slug, texto: 'Quiero un video saludando' }, c.cookie)).json();
    assert.equal((await post(`/cliente/pedidos/${id}/mensajes`, { texto: 'hola' }, c.cookie)).status, 409, 'antes de aceptar no hay chat');
    assert.equal((await (await req('/cuenta/yo', { cookie: v.cookie })).json()).cuenta.pedidosNoLeidos, 1);
    assert.equal((await post(`/cuenta/solicitudes/${id}/aceptar`, {}, v.cookie)).status, 200);
    const m1 = await (await post(`/cuenta/solicitudes/${id}/mensajes`, { texto: '¡Hola! Te lo hago hoy.' }, v.cookie)).json();
    assert.equal(m1.mensaje.autor, 'acompanante');
    // El cliente ve 2 no leídos (aviso de aceptado + mensaje)
    assert.equal((await (await req('/cliente/yo', { cookie: c.cookie })).json()).cliente.pedidosNoLeidos, 2);
    let d = await (await req(`/cliente/pedidos/${id}`, { cookie: c.cookie })).json();
    assert.equal(d.solicitud.estado, 'aceptada'); assert.equal(d.solicitud.acompanante.slug, v.slug);
    assert.deepEqual(d.mensajes.map((m) => m.autor), ['sistema', 'acompanante']);
    assert.equal((await (await req('/cliente/yo', { cookie: c.cookie })).json()).cliente.pedidosNoLeidos, 0, 'abrir el chat marca leído');
    const ultimo = d.ultimo;
    await post(`/cliente/pedidos/${id}/mensajes`, { texto: 'Gracias!' }, c.cookie);
    d = await (await req(`/cuenta/solicitudes/${id}?since=${ultimo}`, { cookie: v.cookie })).json();
    assert.deepEqual(d.mensajes.map((m) => m.texto), ['Gracias!'], 'since trae solo lo nuevo');
    d = await (await req(`/cuenta/solicitudes/${id}?since=${d.ultimo}`, { cookie: v.cookie })).json();
    assert.equal(d.mensajes.length, 0);
    assert.equal((await post(`/cliente/pedidos/${id}/mensajes`, { texto: 'x'.repeat(1001) }, c.cookie)).status, 400);
    // Límite de velocidad: 30 por minuto
    let ultimo429 = 0;
    for (let i = 0; i < 31; i++) { const r = await post(`/cliente/pedidos/${id}/mensajes`, { texto: 'm' + i }, c.cookie); ultimo429 = r.status; }
    assert.equal(ultimo429, 429);
    // Cierre: solo lectura
    assert.equal((await post(`/cuenta/solicitudes/${id}/cerrar`, {}, v.cookie)).status, 200);
    assert.equal((await post(`/cuenta/solicitudes/${id}/mensajes`, { texto: 'otra' }, v.cookie)).status, 409);
    d = await (await req(`/cliente/pedidos/${id}`, { cookie: c.cookie })).json();
    assert.equal(d.solicitud.estado, 'cerrada'); assert.equal(d.solicitud.cerradaPor, 'acompanante');
  });

  test('contenido bloqueado: foto con vista previa borrosa, pago con Mercado Pago, desbloqueo solo para el cliente y vencimiento', async () => {
    const c = await cliente(); const v = await vendedora();
    const { id } = await (await post('/cliente/pedidos', { slug: v.slug, texto: 'Una foto en la playa' }, c.cookie)).json();
    // Antes de aceptar no se puede mandar contenido
    const foto = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: { r: 200, g: 40, b: 90 } } }).jpeg().toBuffer();
    assert.equal((await subir(v.cookie, id, { buf: foto, nombre: 'f.jpg', tipo: 'image/jpeg' })).status, 409);
    await post(`/cuenta/solicitudes/${id}/aceptar`, {}, v.cookie);
    assert.equal((await subir(v.cookie, id, { buf: foto, nombre: 'f.jpg', tipo: 'image/jpeg', precio: '5' })).status, 400, 'precio mínimo');
    const up = await subir(v.cookie, id, { buf: foto, nombre: 'f.jpg', tipo: 'image/jpeg', precio: '3500' });
    assert.equal(up.status, 201, await up.clone().text());
    const { itemId } = await up.json();
    // El original quedó en 720p máx. y en el disco privado (nunca en /media)
    const { rows: [fila] } = await db.query('SELECT * FROM solicitud_items WHERE id = $1', [itemId]);
    assert.deepEqual([fila.ancho, fila.alto], [1080, 720]);
    assert.ok(fila.ruta.startsWith('pedidos/') && fila.ruta_preview.startsWith('pedidos/'));
    // El cliente ve el contenido bloqueado y la vista previa borrosa; el original no
    let d = await (await req(`/cliente/pedidos/${id}`, { cookie: c.cookie })).json();
    const it = d.items.find((x) => x.id === itemId);
    assert.equal(it.desbloqueado, false); assert.equal(it.precio.centavos, 350000); assert.equal(it.preview, true);
    const prev = await req(`/cliente/pedidos/items/${itemId}/archivo?preview=1`, { cookie: c.cookie });
    assert.equal(prev.status, 200); assert.equal(prev.headers.get('cache-control'), 'no-store, private');
    const pm = await sharp(Buffer.from(await prev.arrayBuffer())).metadata();
    assert.ok(Math.max(pm.width, pm.height) <= 480, 'la vista previa es chica y borrosa');
    assert.equal((await req(`/cliente/pedidos/items/${itemId}/archivo`, { cookie: c.cookie })).status, 403);
    // Otros no ven nada
    const otro = await cliente(); const otra = await vendedora({ conectar: false });
    assert.equal((await req(`/cliente/pedidos/items/${itemId}/archivo?preview=1`, { cookie: otro.cookie })).status, 404);
    assert.equal((await req(`/cuenta/solicitudes/items/${itemId}/archivo`, { cookie: otra.cookie })).status, 404);
    assert.equal((await req(`/cliente/pedidos/items/${itemId}/archivo?preview=1`)).status, 401);
    // La acompañante sí ve el original
    assert.equal((await req(`/cuenta/solicitudes/items/${itemId}/archivo`, { cookie: v.cookie })).status, 200);
    // Pago: título neutro, token de la vendedora, comisión; vuelve al chat
    const pg1 = await post(`/cliente/pedidos/items/${itemId}/pagar`, {}, c.cookie);
    assert.equal(pg1.status, 200, await pg1.clone().text());
    assert.match((await pg1.json()).url, /^https:\/\/www\.mercadopago\.com\.ar\//);
    const pref = MP.prefs[MP.prefs.length - 1];
    assert.equal(pref.auth, 'Bearer ' + v.access);
    assert.match(pref.body.items[0].title, /^Contenido digital #[0-9A-F]{8}$/);
    assert.equal(pref.body.back_urls.success, `${SITE}/cliente/pedido/${id}`);
    const { rows: [venta] } = await db.query('SELECT * FROM ventas_contenido WHERE solicitud_item_id = $1', [itemId]);
    assert.equal(venta.tipo, 'pedido'); assert.equal(venta.cliente_id, c.id); assert.equal(Number(venta.monto_centavos), 350000);
    // Otro cliente no puede pagarlo
    assert.equal((await post(`/cliente/pedidos/items/${itemId}/pagar`, {}, otro.cookie)).status, 404);
    // Notificación firmada → aprobado → desbloqueado
    MP.pagos.set('8101', { token: v.access, pago: { id: 8101, status: 'approved', external_reference: venta.id, transaction_amount: 3500, currency_id: 'ARS' } });
    assert.equal((await notificar(venta.id, '8101')).status, 200);
    d = await (await req(`/cliente/pedidos/${id}`, { cookie: c.cookie })).json();
    const it2 = d.items.find((x) => x.id === itemId);
    assert.equal(it2.pagado, true); assert.equal(it2.desbloqueado, true); assert.ok(it2.vence);
    const orig = await req(`/cliente/pedidos/items/${itemId}/archivo`, { cookie: c.cookie });
    assert.equal(orig.status, 200);
    const om = await sharp(Buffer.from(await orig.arrayBuffer())).metadata();
    assert.deepEqual([om.width, om.height], [1080, 720]);
    assert.equal((await post(`/cliente/pedidos/items/${itemId}/pagar`, {}, c.cookie)).status, 409, 'ya pagado');
    // Aparece en las ventas de la acompañante (tipo pedido)
    const panel = await (await req('/cuenta/contenido', { cookie: v.cookie })).json();
    assert.ok(panel.ventas.some((x) => x.tipo === 'pedido' && x.estado === 'aprobada'));
    // Vencimiento: a 1 mes del pago se borran los archivos
    await db.query("UPDATE solicitud_items SET pagado = now() - interval '32 days', vence = now() - interval '1 day' WHERE id = $1", [itemId]);
    const abs = path.join(tmpData, 'privado', fila.ruta);
    await fs.access(abs);
    assert.ok((await instance.ctx.solicitudes.vencer()) >= 1);
    await assert.rejects(fs.access(abs));
    d = await (await req(`/cliente/pedidos/${id}`, { cookie: c.cookie })).json();
    assert.equal(d.items.find((x) => x.id === itemId).estado, 'vencido');
    assert.equal((await req(`/cliente/pedidos/items/${itemId}/archivo`, { cookie: c.cookie })).status, 410);
    assert.equal(await instance.ctx.solicitudes.vencer(), 0, 'una segunda pasada no borra nada');
  });

  test('contenido bloqueado en video: se procesa a 720p máx., vista previa borrosa y Range', async () => {
    const c = await cliente(); const v = await vendedora();
    const { id } = await (await post('/cliente/pedidos', { slug: v.slug, texto: 'Un video corto' }, c.cookie)).json();
    await post(`/cuenta/solicitudes/${id}/aceptar`, {}, v.cookie);
    const mp4 = path.join(tmpData, 'prueba.mp4');
    await promisify(execFile)('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=1920x1080:rate=24', '-t', '2', '-pix_fmt', 'yuv420p', '-y', mp4]);
    const up = await subir(v.cookie, id, { buf: await fs.readFile(mp4), nombre: 'v.mp4', tipo: 'video/mp4', precio: '9000' });
    assert.equal(up.status, 202, await up.clone().text());
    const { itemId } = await up.json();
    const it = await esperar(async () => { const d = await (await req(`/cuenta/solicitudes/${id}`, { cookie: v.cookie })).json(); const x = d.items.find((y) => y.id === itemId); return x && x.estado !== 'procesando' ? x : null; });
    assert.equal(it.estado, 'listo', JSON.stringify(it));
    assert.deepEqual([it.ancho, it.alto], [1280, 720]);
    assert.equal((await req(`/cliente/pedidos/items/${itemId}/archivo?preview=1`, { cookie: c.cookie })).status, 200);
    assert.equal((await req(`/cliente/pedidos/items/${itemId}/archivo`, { cookie: c.cookie })).status, 403);
    // La acompañante lo reproduce con Range
    const rg = await req(`/cuenta/solicitudes/items/${itemId}/archivo`, { cookie: v.cookie, headers: { range: 'bytes=0-99' } });
    assert.equal(rg.status, 206); assert.equal(rg.headers.get('content-type'), 'video/mp4');
    assert.equal((await rg.arrayBuffer()).byteLength, 100);
  });

  test('tamaño 720p', () => {
    assert.deepEqual(tam720(3000, 2000), { ancho: 1080, alto: 720 });
    assert.deepEqual(tam720(1080, 1920), { ancho: 720, alto: 1280 });
    assert.deepEqual(tam720(640, 480), { ancho: 640, alto: 480 });
    assert.deepEqual(tam720(1921, 1081, true), { ancho: 1280, alto: 720 });
  });
});
