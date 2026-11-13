// Integraciones del admin (13/11/2026): vincular Telegram desde el admin (código de un solo uso + getUpdates),
// elegir qué avisos llegan (incluye pedidos de créditos, pedidos personalizados y ventas), cuentas de Mercado Pago
// cargadas desde el admin (cifradas con SECRETS_KEY, sin devolver secretos, "Probar", respaldo del .env,
// cambio de cuenta activa y webhook firmado con el secreto guardado) y el mensaje de ejemplo de WhatsApp.
// Telegram y Mercado Pago están simulados: nunca se sale a la red.
//   DATABASE_URL=postgres://postgres@localhost:55432/<db> node --test test/integraciones.test.js
import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { start } from '../server.js';
import { firmar } from '../lib/mercadopago.js';
import { createTelegram, AVISOS } from '../lib/telegram.js';
import { createMpCuentas } from '../lib/mp-cuentas.js';
import { cifrarSecreto, descifrarSecreto } from '../lib/secretos.js';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('Falta DATABASE_URL.'); process.exit(1); }
const db = new pg.Pool({ connectionString: DATABASE_URL, max: 4 });
const A = '/panel-pruebas-integraciones-0123456789';
const USER = 'admin-int'; const PASS = 'clave-de-prueba-larga-456';
const SITE = 'https://sexyrose.test';
const KEY = 'clave-maestra-de-prueba-0123456789abcdef';
const TOKEN = '123456:TEST-TOKEN';
const CUENTA_ENV = { id: '3333333333333333', nombre: 'Del servidor', clientId: '3333333333333333', clientSecret: 'secreto-env-c', webhookSecret: 'webhook-env-c' };
const NUEVA = { nombre: 'Juan', clientId: '4444444444444444', clientSecret: 'secreto-admin-juan-123', webhookSecret: 'webhook-admin-juan-456' };
let instance; let BASE; let tmpData;

// ---------- Telegram simulado ----------
const TG = { updates: [], enviados: [], webhookUrl: '', nextId: 1 };
const resp = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
async function tgFetch(url, opts = {}) {
  const u = new URL(url);
  const m = /^\/bot([^/]+)\/(\w+)$/.exec(u.pathname);
  if (!m || m[1] !== TOKEN) return resp(401, { ok: false, description: 'Unauthorized' });
  const p = opts.body ? JSON.parse(opts.body) : {};
  switch (m[2]) {
    case 'getMe': return resp(200, { ok: true, result: { id: 1, is_bot: true, first_name: 'SR avisos', username: 'sr_test_bot' } });
    case 'getWebhookInfo': return resp(200, { ok: true, result: { url: TG.webhookUrl } });
    case 'getUpdates': {
      const desde = Number(p.offset) || 0;
      return resp(200, { ok: true, result: TG.updates.filter((x) => x.update_id >= desde) });
    }
    case 'sendMessage': TG.enviados.push({ chat: String(p.chat_id), text: p.text }); return resp(200, { ok: true, result: { message_id: TG.enviados.length } });
    default: return resp(404, { ok: false, description: 'Not Found' });
  }
}
const start_ = (codigo, chat = { id: 777, type: 'private', first_name: 'Juan', username: 'juanb' }) => {
  TG.updates.push({ update_id: TG.nextId++, message: { message_id: 1, chat, text: '/start ' + codigo } });
};
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
async function hasta(fn, ms = 3000) {
  const fin = Date.now() + ms;
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() > fin) return v; await espera(40); }
}

// ---------- Mercado Pago simulado ----------
const MP = { codigos: new Map(), pagos: new Map(), prefs: [] };
const cuentasMp = () => [CUENTA_ENV, NUEVA];
async function mpFetch(url, opts = {}) {
  const u = new URL(url);
  const auth = (opts.headers && opts.headers.Authorization) || '';
  if (u.pathname === '/oauth/token') {
    const f = Object.fromEntries(new URLSearchParams(opts.body));
    const app = cuentasMp().find((c) => c.clientId === f.client_id);
    if (!app || f.client_secret !== app.clientSecret) return resp(401, { error: 'invalid_client' });
    if (f.grant_type === 'client_credentials') return resp(200, { access_token: 'APP-' + app.clientId, token_type: 'bearer', expires_in: 21600 });
    if (f.grant_type === 'authorization_code') {
      const c = MP.codigos.get(f.code);
      if (!c || c.app !== app.clientId) return resp(400, { error: 'invalid_grant' });
      MP.codigos.delete(f.code);
      return resp(200, { access_token: c.access, refresh_token: 'RT-' + crypto.randomBytes(3).toString('hex'), expires_in: 15552000, user_id: c.user });
    }
  }
  if (u.pathname === '/checkout/preferences') {
    MP.prefs.push({ auth, body: JSON.parse(opts.body) });
    return resp(201, { id: 'pref-' + MP.prefs.length, init_point: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-' + MP.prefs.length });
  }
  const mPago = /^\/v1\/payments\/(\d+)$/.exec(u.pathname);
  if (mPago) {
    const p = MP.pagos.get(mPago[1]);
    if (!p || auth !== 'Bearer ' + p.token) return resp(404, { message: 'not_found' });
    return resp(200, p.pago);
  }
  return resp(404, { message: 'ruta simulada desconocida ' + u.pathname });
}

// ---------- Ayudas ----------
const auth = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
const adm = (p, opts = {}) => fetch(BASE + A + '/api' + p, { ...opts, headers: { authorization: auth, ...(opts.headers || {}) } });
const admJson = (method, p, body) => adm(p, { method, body: JSON.stringify(body ?? {}), headers: { 'content-type': 'application/json', 'x-sr-admin': '1', origin: BASE } });
const cta = (id, p, opts = {}) => fetch(BASE + '/api/cuenta' + p, { redirect: 'manual', ...opts, headers: { 'x-test-cuenta': id, ...(opts.headers || {}) } });
const ctaPost = (id, p, body) => cta(id, p, { method: 'POST', body: JSON.stringify(body ?? {}), headers: { 'content-type': 'application/json', 'x-sr': '1', origin: BASE } });
let CLI = null;
async function crearCliente() {
  const u = 'zzint' + crypto.randomBytes(4).toString('hex');
  const { rows } = await db.query(
    `INSERT INTO clientes (usuario, usuario_norm, email, pass_hash, acepto_terminos, mayor_edad_declarada, email_verificado)
     VALUES ($1, $1, $2, 'x', now(), true, now()) RETURNING id`, [u, u + '@example.com']);
  const token = crypto.randomBytes(32).toString('base64url');
  await db.query("INSERT INTO sesiones_clientes (token_hash, cliente_id, expira) VALUES ($1, $2, now() + interval '1 day')",
    [crypto.createHash('sha256').update(token).digest(), rows[0].id]);
  return { id: rows[0].id, cookie: 'sr_cliente=' + token };
}
const pubPost = (p, body) => fetch(BASE + '/api' + p, {
  method: 'POST', body: JSON.stringify(body ?? {}),
  headers: { 'content-type': 'application/json', 'x-sr': '1', origin: BASE, cookie: CLI.cookie, 'cf-connecting-ip': '2001:db8::' + crypto.randomBytes(2).toString('hex') },
});
let n = 0;
async function vendedora(plan = 'S') {
  const email = `zzint-${Date.now()}-${n++}@example.com`;
  const { rows } = await db.query('INSERT INTO cuentas (email, pass_hash) VALUES ($1, $2) RETURNING id', [email, 'x']);
  const id = rows[0].id; const slug = 'zzint-' + id.slice(0, 8);
  await db.query("INSERT INTO perfiles (cuenta_id, slug, datos, estado, verificacion) VALUES ($1, $2, $3, 'publicado', 'verificada')",
    [id, slug, JSON.stringify({ displayName: 'Vendedora ' + n, provincia: 'zzint-prov' })]);
  await db.query("INSERT INTO suscripciones (cuenta_id, plan, periodo, desde, hasta) VALUES ($1, $2, 'manual', now() - interval '1 hour', now() + interval '30 days')", [id, plan]);
  return { id, slug };
}
async function conectar(v, app) {
  const r = await ctaPost(v.id, '/contenido/mp/conectar');
  assert.equal(r.status, 200, await r.clone().text());
  const url = new URL((await r.json()).url);
  assert.equal(url.searchParams.get('client_id'), app.clientId);
  const code = 'code-' + crypto.randomBytes(4).toString('hex');
  const access = 'AT-' + crypto.randomBytes(4).toString('hex');
  MP.codigos.set(code, { app: app.clientId, access, user: 9000 + n });
  const cb = await cta(v.id, `/contenido/mp/callback?code=${code}&state=${url.searchParams.get('state')}`);
  assert.equal(cb.status, 303); assert.equal(cb.headers.get('location'), '/panel/contenido?mp=ok');
  return access;
}
function notificar(ventaId, pagoId, secret) {
  const ts = String(Math.floor(Date.now() / 1000)); const requestId = crypto.randomUUID();
  return fetch(`${BASE}/api/mp/webhook?venta=${ventaId}&data.id=${pagoId}&type=payment&source_news=webhooks`, {
    method: 'POST', body: JSON.stringify({ type: 'payment', data: { id: pagoId } }),
    headers: { 'content-type': 'application/json', 'x-request-id': requestId, 'x-signature': `ts=${ts},v1=${firmar(secret, { dataId: pagoId, requestId, ts })}` },
  });
}

before(async () => {
  tmpData = await fs.mkdtemp(path.join(os.tmpdir(), 'srint-data-'));
  instance = await start({ prelanzamientoPorDefecto: false,
    port: 0, host: '127.0.0.1', databaseUrl: DATABASE_URL, adminPath: A, adminUser: USER, adminPassword: PASS,
    ipHashSalt: 'sal', siteUrl: SITE, dataDir: tmpData, log: () => {}, tareaPlanes: false, tareaContenido: false, tareaCotizacion: false,
    sendMail: async () => {}, mpCuentas: [CUENTA_ENV], mpFetch, secretsKey: KEY,
    telegramToken: TOKEN, telegramChatId: '', telegramFetch: tgFetch, telegramCadaMs: 40,
    requireCuenta: (req, res, next) => { const id = req.get('x-test-cuenta'); if (!id) return res.status(401).json({ error: 'Iniciá sesión.' }); req.cuenta = { id }; next(); },
  });
  BASE = `http://127.0.0.1:${instance.port}`;
  await instance.ready;
  await db.query('DELETE FROM mp_cuentas');
  await db.query("DELETE FROM ajustes WHERE clave IN ('telegram', 'venta_contenido', 'contacto', 'comision')");
  await db.query("DELETE FROM cuentas WHERE email LIKE 'zzint-%'");
  await db.query("DELETE FROM clientes WHERE email LIKE 'zzint%'");
  CLI = await crearCliente();
});
beforeEach(() => { TG.enviados.length = 0; TG.webhookUrl = ''; });
after(async () => {
  await instance?.close();
  await db.query('DELETE FROM mp_cuentas');
  await db.query("DELETE FROM ajustes WHERE clave IN ('telegram', 'venta_contenido', 'contacto')");
  await db.query("DELETE FROM cuentas WHERE email LIKE 'zzint-%'");
  await db.query("DELETE FROM clientes WHERE email LIKE 'zzint%'");
  await db.end();
  if (tmpData) await fs.rm(tmpData, { recursive: true, force: true });
});

describe('Telegram', () => {
  test('vincular con el código de un solo uso: un código equivocado no vincula; el correcto sí', async () => {
    let e = await (await adm('/integraciones/telegram')).json();
    assert.equal(e.botConfigurado, true); assert.equal(e.bot.usuario, 'sr_test_bot'); assert.equal(e.vinculado, null); assert.equal(e.pendiente, null);
    assert.deepEqual(e.avisos.map((a) => a.id), Object.keys(AVISOS));
    assert.ok(!e.avisos.some((a) => /pre-?registro/i.test(a.nombre)), 'sin aviso de pre-registro');
    const r = await admJson('POST', '/integraciones/telegram/vincular');
    assert.equal(r.status, 200, await r.clone().text());
    e = await r.json();
    assert.match(e.pendiente.codigo, /^[A-Z2-9]{8}$/);
    assert.equal(e.pendiente.link, 'https://t.me/sr_test_bot?start=' + e.pendiente.codigo);
    // Código equivocado: no vincula y el bot avisa
    start_('ZZZZZZZZ', { id: 555, type: 'private', first_name: 'Otro' });
    await hasta(() => TG.enviados.some((m) => m.chat === '555'));
    assert.match(TG.enviados.find((m) => m.chat === '555').text, /no es válido/);
    assert.equal((await (await adm('/integraciones/telegram')).json()).vinculado, null);
    // Código correcto
    start_(e.pendiente.codigo);
    const v = await hasta(async () => (await (await adm('/integraciones/telegram')).json()).vinculado);
    assert.ok(v, 'quedó vinculado');
    assert.equal(v.nombre, 'Juan'); assert.equal(v.usuario, 'juanb');
    assert.ok(TG.enviados.some((m) => m.chat === '777' && /Listo/.test(m.text)));
    e = await (await adm('/integraciones/telegram')).json();
    assert.equal(e.pendiente, null);
    // Prueba
    TG.enviados.length = 0;
    assert.equal((await admJson('POST', '/integraciones/telegram/probar')).status, 200);
    assert.equal(TG.enviados.length, 1); assert.equal(TG.enviados[0].chat, '777');
  });

  test('avisos: las nuevas clases llegan (pedido de créditos, pedido personalizado) y las apagadas no', async () => {
    const v = await vendedora('S');
    TG.enviados.length = 0;
    const r = await ctaPost(v.id, '/creditos/pedidos', { packId: 'inicial' });
    assert.equal(r.status, 201, await r.clone().text());
    const { pedido } = await r.json();
    const m = await hasta(() => TG.enviados.find((x) => /Pedido de créditos nuevo/.test(x.text)));
    assert.ok(m); assert.ok(m.text.includes(pedido.codigo)); assert.equal(m.chat, '777');
    assert.ok(!m.text.includes('@example.com'), 'sin datos de contacto');
    // Apagar los pedidos de créditos
    const g = await admJson('PUT', '/integraciones/telegram/avisos', { avisos: { pedido_creditos: false } });
    assert.equal(g.status, 200);
    assert.equal((await g.json()).avisos.find((a) => a.id === 'pedido_creditos').activo, false);
    TG.enviados.length = 0;
    assert.equal((await ctaPost(v.id, '/creditos/pedidos', { packId: 'inicial' })).status, 201);
    await espera(200);
    assert.equal(TG.enviados.filter((x) => /Pedido de créditos/.test(x.text)).length, 0, 'apagado: no llega');
    await admJson('PUT', '/integraciones/telegram/avisos', { avisos: { pedido_creditos: true } });
    // El vínculo se conserva al guardar avisos
    assert.ok((await (await adm('/integraciones/telegram')).json()).vinculado);
  });

  test('desvincular: deja de haber chat (sin TELEGRAM_CHAT_ID de respaldo, probar responde 409)', async () => {
    const d = await (await admJson('POST', '/integraciones/telegram/desvincular')).json();
    assert.equal(d.vinculado, null); assert.equal(d.respaldoServidor, false);
    assert.equal((await admJson('POST', '/integraciones/telegram/probar')).status, 409);
    // Los avisos elegidos se conservan
    assert.equal(d.avisos.length, Object.keys(AVISOS).length);
  });

  test('si el bot tiene un webhook configurado, vincular lo avisa y no pisa nada', async () => {
    TG.webhookUrl = 'https://otro.example.com/hook';
    const r = await admJson('POST', '/integraciones/telegram/vincular');
    assert.equal(r.status, 409);
    assert.match((await r.json()).error, /webhook/);
  });

  test('el código vence a los 10 minutos; respaldo con TELEGRAM_CHAT_ID; sin token no se manda nada', async () => {
    await db.query("DELETE FROM ajustes WHERE clave = 'telegram'");
    let reloj = Date.now(); const enviados = [];
    const f = async (url, o) => { const r = await tgFetch(url, o); if (/sendMessage$/.test(url)) enviados.push(JSON.parse(o.body)); return r; };
    const tg = createTelegram({ pool: db, token: TOKEN, chatIdEnv: '999', fetchImpl: f, now: () => reloj, cadaMs: 1e9 });
    const e = await tg.vincular();
    assert.ok(e.pendiente); assert.equal(e.respaldoServidor, true);
    reloj += 11 * 60 * 1000;
    start_(e.pendiente.codigo, { id: 4242, type: 'private', first_name: 'Tarde' });
    await tg.revisar();
    const e2 = await tg.estado();
    assert.equal(e2.pendiente, null); assert.equal(e2.vinculado, null, 'vencido: no vincula');
    // Respaldo del servidor: los avisos van a TELEGRAM_CHAT_ID; un tipo apagado no se manda
    await tg.notify('hola', 'venta');
    assert.equal(enviados.at(-1).chat_id, '999');
    await tg.guardarAvisos({ venta: false });
    const antes = enviados.length;
    await tg.notify('chau', 'venta');
    assert.equal(enviados.length, antes);
    tg.detener();
    const sinToken = createTelegram({ pool: db, token: '', fetchImpl: () => { throw new Error('no debería llamar'); } });
    await sinToken.notify('x', 'venta');
    assert.equal((await sinToken.estado()).botConfigurado, false);
    await assert.rejects(() => sinToken.vincular(), /TELEGRAM_BOT_TOKEN/);
    await db.query("DELETE FROM ajustes WHERE clave = 'telegram'");
  });
});

describe('Mercado Pago: cuentas cargadas desde el admin', () => {
  test('alta cifrada, sin devolver secretos, "desde el servidor" de solo lectura, editar, probar y borrar', async () => {
    let r = await adm('/integraciones/mp');
    let l = await r.json();
    assert.equal(l.secretos, true);
    assert.deepEqual(l.cuentas.map((c) => [c.id, c.origen]), [[CUENTA_ENV.id, 'servidor']]);
    // Faltan datos / formato
    assert.equal((await admJson('POST', '/integraciones/mp', { nombre: 'X', clientId: 'a b', clientSecret: 'xxxxxxxx', webhookSecret: 'yyyyyyyy' })).status, 400);
    assert.equal((await admJson('POST', '/integraciones/mp', { nombre: 'X', clientId: '5555555555', clientSecret: '', webhookSecret: 'yyyyyyyy' })).status, 400);
    // Una del .env no se puede volver a cargar
    assert.equal((await admJson('POST', '/integraciones/mp', { ...CUENTA_ENV, nombre: 'Dup' })).status, 409);
    r = await admJson('POST', '/integraciones/mp', NUEVA);
    assert.equal(r.status, 201, await r.clone().text());
    const txt = await r.text();
    assert.ok(!txt.includes(NUEVA.clientSecret) && !txt.includes(NUEVA.webhookSecret), 'nunca devuelve los secretos');
    l = JSON.parse(txt);
    const c = l.cuentas.find((x) => x.id === NUEVA.clientId);
    assert.equal(c.origen, 'admin'); assert.equal(c.secretoFin, '••••' + NUEVA.clientSecret.slice(-4)); assert.equal(c.completa, true);
    assert.equal(l.cuentas[l.cuentas.length - 1].id, NUEVA.clientId, 'las del .env van primero; la nueva del admin al final');
    assert.equal(l.cuentas[0].origen, 'servidor', 'agregar una cuenta no cambia la activa por defecto (la primera del .env)');
    // En la base, cifrado
    const { rows: [fila] } = await db.query('SELECT * FROM mp_cuentas WHERE client_id = $1', [NUEVA.clientId]);
    assert.ok(fila.client_secret_cifrado.startsWith('v1:'));
    assert.ok(!fila.client_secret_cifrado.includes(NUEVA.clientSecret) && !fila.webhook_secret_cifrado.includes(NUEVA.webhookSecret));
    assert.equal(descifrarSecreto(KEY, fila.client_secret_cifrado), NUEVA.clientSecret);
    assert.equal(descifrarSecreto('otra-clave-maestra-distinta-0000', fila.client_secret_cifrado), null);
    // Duplicada
    assert.equal((await admJson('POST', '/integraciones/mp', NUEVA)).status, 409);
    // Resumen de la venta de contenido: aparecen las dos, con su origen y sin secretos
    const res = await (await adm('/contenido/resumen')).text();
    assert.ok(!res.includes(NUEVA.clientSecret) && !res.includes(CUENTA_ENV.clientSecret));
    const resumen = JSON.parse(res);
    assert.deepEqual(resumen.cuentas.map((x) => x.origen), ['servidor', 'admin']);
    // Editar: el nombre cambia; secretos vacíos = se conservan
    r = await admJson('PUT', '/integraciones/mp/' + NUEVA.clientId, { nombre: 'Juan B', clientSecret: '', webhookSecret: '' });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).cuentas.find((x) => x.id === NUEVA.clientId).nombre, 'Juan B');
    const { rows: [f2] } = await db.query('SELECT * FROM mp_cuentas WHERE client_id = $1', [NUEVA.clientId]);
    assert.equal(descifrarSecreto(KEY, f2.webhook_secret_cifrado), NUEVA.webhookSecret);
    // La del servidor no se edita ni se borra desde acá
    assert.equal((await admJson('PUT', '/integraciones/mp/' + CUENTA_ENV.id, { nombre: 'X' })).status, 404);
    assert.equal((await admJson('DELETE', '/integraciones/mp/' + CUENTA_ENV.id)).status, 404);
    // Probar: ok con las credenciales buenas, rechazo con un secreto malo
    let p = await (await admJson('POST', `/integraciones/mp/${NUEVA.clientId}/probar`)).json();
    assert.equal(p.ok, true);
    assert.equal((await admJson('POST', '/integraciones/mp', { nombre: 'Mala', clientId: '6666666666', clientSecret: 'secreto-que-no-es', webhookSecret: 'webhook-cualquiera' })).status, 201);
    p = await (await admJson('POST', '/integraciones/mp/6666666666/probar')).json();
    assert.equal(p.ok, false); assert.match(p.mensaje, /rechazó/);
    // Borrar
    r = await admJson('DELETE', '/integraciones/mp/6666666666');
    assert.equal(r.status, 200);
    assert.ok(!(await r.json()).cuentas.some((x) => x.id === '6666666666'));
  });

  test('cuenta del admin como activa: OAuth, compra y webhook firmado con el secreto guardado; aviso de venta', async () => {
    // (la cuenta NUEVA quedó cargada en la prueba anterior)
    let r = await admJson('PUT', '/contenido/cuenta-activa', { cuenta: NUEVA.clientId });
    assert.equal(r.status, 200, await r.clone().text());
    assert.equal((await r.json()).activa, NUEVA.clientId);
    // Telegram vinculado para recibir el aviso de venta
    const e = await (await admJson('POST', '/integraciones/telegram/vincular')).json();
    start_(e.pendiente.codigo, { id: 888, type: 'private', first_name: 'Juan' });
    assert.ok(await hasta(async () => (await (await adm('/integraciones/telegram')).json()).vinculado));
    const v = await vendedora('S');
    const access = await conectar(v, NUEVA);
    const it = await ctaPost(v.id, '/contenido/items', { titulo: 'Pack de fotos', descripcion: 'Diez', precio: 4000, link: 'https://drive.example.com/x' });
    assert.equal(it.status, 201, await it.clone().text());
    const item = (await it.json()).item;
    r = await pubPost(`/sitio/contenido/${item.id}/comprar`);
    assert.equal(r.status, 200, await r.clone().text());
    const { token } = await r.json();
    const { rows: [venta] } = await db.query('SELECT * FROM ventas_contenido WHERE token = $1', [token]);
    assert.equal(venta.app_id, NUEVA.clientId);
    assert.equal(MP.prefs.at(-1).auth, 'Bearer ' + access);
    MP.pagos.set('9101', { token: access, pago: { id: 9101, status: 'approved', external_reference: venta.id, transaction_amount: 4000, currency_id: 'ARS' } });
    // Firmado con la clave de otra cuenta: 401
    assert.equal((await notificar(venta.id, '9101', CUENTA_ENV.webhookSecret)).status, 401);
    TG.enviados.length = 0;
    const w = await notificar(venta.id, '9101', NUEVA.webhookSecret);
    assert.equal(w.status, 200); assert.equal((await w.json()).resultado, 'aprobada');
    const aviso = await hasta(() => TG.enviados.find((x) => /Venta de contenido pagada/.test(x.text)));
    assert.ok(aviso); assert.equal(aviso.chat, '888'); assert.match(aviso.text, /pack/);
    // Pedido personalizado nuevo → aviso
    TG.enviados.length = 0;
    r = await pubPost('/cliente/pedidos', { slug: v.slug, texto: 'Una foto en el parque' });
    assert.equal(r.status, 201, await r.clone().text());
    const ap = await hasta(() => TG.enviados.find((x) => /pedido personalizado nuevo/i.test(x.text)));
    assert.ok(ap); assert.ok(!ap.text.includes('parque'), 'sin el texto del pedido');
  });

  test('al arrancar se leen las cuentas guardadas; con otra SECRETS_KEY quedan como ilegibles', async () => {
    const lista = [];
    const ok = createMpCuentas({ pool: db, secretsKey: KEY, envCuentas: [CUENTA_ENV], lista });
    await ok.cargar();
    const nueva = lista.find((c) => c.id === NUEVA.clientId);
    assert.equal(nueva.clientSecret, NUEVA.clientSecret); assert.equal(nueva.webhookSecret, NUEVA.webhookSecret);
    const lista2 = [];
    const mal = createMpCuentas({ pool: db, secretsKey: 'otra-clave-maestra-distinta-0000', envCuentas: [CUENTA_ENV], lista: lista2 });
    await mal.cargar();
    assert.deepEqual(lista2.map((c) => c.id), [CUENTA_ENV.id]);
    assert.deepEqual(mal.listar().ilegibles.map((c) => c.id), [NUEVA.clientId]);
    // Sin SECRETS_KEY: no se puede guardar
    const sin = createMpCuentas({ pool: db, secretsKey: '', envCuentas: [], lista: [] });
    assert.equal(sin.listar().secretos, false);
    await assert.rejects(() => sin.crear(NUEVA), /SECRETS_KEY/);
    assert.throws(() => cifrarSecreto('', 'x'));
  });
});

describe('WhatsApp', () => {
  test('mensaje de ejemplo para "Probar": el mismo que arma un pedido real, con un código de ejemplo', async () => {
    await admJson('PUT', '/ajustes/contacto', { valor: { whatsapp: '5491122334455', telegram: '', telegramActivo: false } });
    const r = await adm('/integraciones/whatsapp/ejemplo');
    assert.equal(r.status, 200);
    const d = await r.json();
    assert.match(d.mensaje, /SR-0000/);
    assert.ok(d.whatsappUrl.startsWith('https://wa.me/5491122334455?text='));
  });
});
