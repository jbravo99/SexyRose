// Asistente de cuenta por WhatsApp (15/11/2026): agente (Baileys falso + Claude falso + Telegram falso) y app reales
// contra Postgres. Nunca sale a la red.
//   DATABASE_URL=postgres://postgres@127.0.0.1:55432/<db> node --test test/asistente.test.js
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import sharp from 'sharp';
import { start } from '../server.js';
import { startAgente } from '../agente.js';
import { createAsistente } from '../lib/asistente.js';
import { createLlm, HERRAMIENTAS, MODELO_DEFAULT, promptSistema } from '../lib/asistente-llm.js';
import { AYUDA, CONTENIDO_PROXIMAMENTE, TEMAS_AYUDA, textoAyuda } from '../lib/asistente-ayuda.js';
import { AJUSTE_ESTADO, ventaContenidoDisponible } from '../lib/contenido.js';
import { authEnBase, leerContenido } from '../lib/asistente-whatsapp.js';
import { telefonoOculto, validarAjustes } from '../lib/asistente-comun.js';
import { detectarIdioma, codigoEnTexto, monedaEnTexto } from '../lib/asistente-textos.js';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('Falta DATABASE_URL.'); process.exit(1); }
const db = new pg.Pool({ connectionString: DATABASE_URL, max: 4 });
const dbAgente = new pg.Pool({ connectionString: DATABASE_URL, max: 5 });
const A = '/panel-pruebas-asistente-0123456789';
const USER = 'admin-asis'; const PASS = 'clave-de-prueba-larga-789';
const SITE = 'https://sexyrose.test';
const KEY = 'clave-maestra-de-prueba-asistente-0123456789';
const TOKEN = '999999:TEST-ASISTENTE';
const PRESENTA = 'Hola, soy el asistente de cuenta AI de SexyRose.';
let instance; let agente; let BASE; let tmpData;

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
async function hasta(fn, ms = 4000) {
  const fin = Date.now() + ms;
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() > fin) return v; await espera(25); }
}
const resp = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

// ---------- Telegram falso (lo usan el app y el agente) ----------
const TG = { updates: [], enviados: [], archivos: [], respuestas: [], ediciones: [], nextId: 1, msgId: 100 };
async function tgFetch(url, opts = {}) {
  const m = /^\/bot([^/]+)\/(\w+)$/.exec(new URL(url).pathname);
  if (!m || m[1] !== TOKEN) return resp(401, { ok: false, description: 'Unauthorized' });
  let p = {};
  if (opts.body instanceof FormData) { for (const [k, v] of opts.body.entries()) p[k] = typeof v === 'string' ? v : { blob: true, size: v.size, type: v.type, name: v.name }; }
  else if (opts.body) p = JSON.parse(opts.body);
  switch (m[2]) {
    case 'getMe': return resp(200, { ok: true, result: { id: 1, is_bot: true, first_name: 'SR', username: 'sr_asis_bot' } });
    case 'getWebhookInfo': return resp(200, { ok: true, result: { url: '' } });
    case 'getUpdates': { const d = Number(p.offset) || 0; return resp(200, { ok: true, result: TG.updates.filter((x) => x.update_id >= d) }); }
    case 'sendMessage': TG.enviados.push({ chat: String(p.chat_id), text: p.text, markup: p.reply_markup || null }); return resp(200, { ok: true, result: { message_id: ++TG.msgId } });
    case 'sendPhoto': case 'sendDocument':
      TG.archivos.push({ metodo: m[2], chat: String(p.chat_id), caption: p.caption, markup: p.reply_markup ? JSON.parse(p.reply_markup) : null, archivo: p.photo || p.document });
      return resp(200, { ok: true, result: { message_id: ++TG.msgId } });
    case 'answerCallbackQuery': TG.respuestas.push({ id: p.callback_query_id, text: p.text || '' }); return resp(200, { ok: true, result: true });
    case 'editMessageCaption': case 'editMessageText': TG.ediciones.push({ metodo: m[2], ...p }); return resp(200, { ok: true, result: true });
    default: return resp(404, { ok: false, description: 'Not Found' });
  }
}
let cqN = 0;
function tocar(data, chatId = 777, caption = 'Comprobante') {
  const id = 'cq' + (++cqN);
  TG.updates.push({ update_id: TG.nextId++, callback_query: { id, data, from: { id: chatId }, message: { message_id: 55, chat: { id: chatId, type: 'private' }, caption, photo: [{}] } } });
  return id;
}
const respuestaDe = (id) => hasta(() => TG.respuestas.find((r) => r.id === id));

// ---------- Claude falso ----------
const LLM = { llamadas: [], guion: null };
async function llmFetch(url, opts) {
  assert.equal(url, 'https://api.anthropic.com/v1/messages');
  assert.equal(opts.headers['x-api-key'], 'sk-prueba');
  const body = JSON.parse(opts.body);
  LLM.llamadas.push(body);
  const r = LLM.guion ? LLM.guion(body, LLM.llamadas.length) : { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Respuesta de prueba.' }] };
  if (r.status) return resp(r.status, r.body || { type: 'error', error: { type: 'api_error' } });
  return resp(200, { type: 'message', role: 'assistant', ...r });
}
const usarHerramienta = (name, input, id = 'tu_' + crypto.randomBytes(3).toString('hex')) => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id, name, input }] });

// ---------- WhatsApp falso (socket de Baileys) ----------
let SOCK = null; let socketsCreados = 0;
class SocketFalso {
  constructor() { this.ev = new EventEmitter(); this.enviados = []; this.presencias = []; this.logouts = 0; this.user = { id: '5491100000000:7@s.whatsapp.net' }; }
  async sendMessage(jid, content, opts) { this.enviados.push({ jid, text: content.text, id: opts && opts.messageId }); return { key: { id: opts && opts.messageId } }; }
  async sendPresenceUpdate(t, jid) { this.presencias.push({ t, jid, n: this.enviados.length }); }
  async presenceSubscribe() {}
  async logout() { this.logouts++; }
  end() {}
}
async function makeSocket() {
  socketsCreados++;
  const s = new SocketFalso();
  SOCK = s;
  setImmediate(() => s.ev.emit('connection.update', { qr: 'QR-PRUEBA-' + socketsCreados }));
  return s;
}
const ARCHIVOS = new Map(); // waId → Buffer
const descargar = async (m) => ARCHIVOS.get(m.key.id);
let JPG;
let nMsg = 0;
async function llega(tel, contenido, { fromMe = false, id = null, jid = null } = {}) {
  const wid = id || 'IN' + (++nMsg) + crypto.randomBytes(3).toString('hex');
  const message = typeof contenido === 'string' ? { conversation: contenido } : contenido;
  await agente.wa._alLlegar({ type: 'notify', messages: [{ key: { remoteJid: jid || `${tel}@s.whatsapp.net`, fromMe, id: wid }, messageTimestamp: Math.floor(Date.now() / 1000), message }] });
  return wid;
}
async function llegaFoto(tel, caption = '') {
  const wid = 'IMG' + (++nMsg);
  ARCHIVOS.set(wid, JPG);
  await llega(tel, { imageMessage: { mimetype: 'image/jpeg', fileLength: JPG.length, caption } }, { id: wid });
  return wid;
}
const enviadosA = (tel) => SOCK.enviados.filter((m) => m.jid === `${tel}@s.whatsapp.net`);
const ultimoA = (tel) => { const x = enviadosA(tel); return x.length ? x[x.length - 1].text : null; };

// ---------- Admin ----------
const auth = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
const adm = (p, opts = {}) => fetch(BASE + A + '/api' + p, { ...opts, headers: { authorization: auth, ...(opts.headers || {}) } });
const admJson = (method, p, body) => adm(p, { method, body: JSON.stringify(body ?? {}), headers: { 'content-type': 'application/json', 'x-sr-admin': '1', origin: BASE } });

// ---------- Datos ----------
const MAILS = [];
let n = 0;
async function acompanante({ whatsapp = null, nombre = 'Valentina' } = {}) {
  const email = `zzasis-${Date.now()}-${n++}@example.com`;
  const { rows } = await db.query('INSERT INTO cuentas (email, pass_hash) VALUES ($1, $2) RETURNING id', [email, 'x']);
  const id = rows[0].id;
  await db.query("INSERT INTO perfiles (cuenta_id, slug, datos, estado, verificacion) VALUES ($1, $2, $3, 'publicado', 'verificada')",
    [id, 'zzasis-' + id.slice(0, 8), JSON.stringify({ displayName: nombre, ...(whatsapp ? { whatsapp } : {}) })]);
  return { id, email };
}
const cred = () => instance.ctx.creditos;
const pedido = async (cuentaId, packId = 'trimestre-plata') => cred().crearPedido(cuentaId, { packId });
const estadoPedido = async (id) => (await db.query('SELECT * FROM pedidos_creditos WHERE id = $1', [id])).rows[0];
const conv = async (tel) => (await db.query('SELECT * FROM asistente_conversaciones WHERE telefono = $1', [tel])).rows[0];
const saldo = async (id) => Number((await db.query('SELECT COALESCE(SUM(centavos), 0)::bigint AS s FROM creditos_movimientos WHERE cuenta_id = $1', [id])).rows[0].s);

async function limpiar() {
  await db.query('DELETE FROM asistente_conversaciones');
  await db.query('DELETE FROM asistente_salida');
  await db.query('DELETE FROM asistente_auth');
  await db.query("DELETE FROM cuentas WHERE email LIKE 'zzasis-%'");
  await db.query("DELETE FROM ajustes WHERE clave IN ('asistente', 'telegram', 'cotizacion')");
  // El número del chip vinculado lo usa el botón de comprar créditos: no queda para las otras pruebas
  await db.query('UPDATE asistente_whatsapp SET numero = NULL WHERE id = 1');
}

before(async () => {
  JPG = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#ffffff' } }).jpeg().toBuffer();
  tmpData = await fs.mkdtemp(path.join(os.tmpdir(), 'srasis-data-'));
  instance = await start({ prelanzamientoPorDefecto: false,
    port: 0, host: '127.0.0.1', databaseUrl: DATABASE_URL, adminPath: A, adminUser: USER, adminPassword: PASS,
    ipHashSalt: 'sal', siteUrl: SITE, dataDir: tmpData, log: () => {}, tareaPlanes: false, tareaContenido: false, tareaCotizacion: false, tareaGeoref: false,
    sendMail: async (m) => { MAILS.push(m); }, secretsKey: KEY,
    telegramToken: TOKEN, telegramChatId: '', telegramFetch: tgFetch, telegramCadaMs: 30, telegramSupervisarMs: 40, asistenteEscucharMs: 200,
  });
  BASE = `http://127.0.0.1:${instance.port}`;
  await instance.ready;
  await limpiar();
  await db.query("INSERT INTO ajustes (clave, valor) VALUES ('telegram', $1)", [JSON.stringify({ chatId: '777', chatNombre: 'Juan', chatUsuario: 'juan', vinculado: new Date().toISOString(), avisos: {} })]);
  await db.query("INSERT INTO ajustes (clave, valor) VALUES ('cotizacion', $1)", [JSON.stringify({ arsPorUsd: 1450, fecha: new Date().toISOString(), nota: '' })]);
  agente = await startAgente({
    pool: dbAgente, databaseUrl: DATABASE_URL, makeSocket, descargar, llmFetch, telegramFetch: tgFetch, anthropicKey: 'sk-prueba',
    telegramToken: TOKEN, telegramChatId: '', demora: () => 0, dormir: async () => {}, supervisarMs: 40, dataDir: tmpData, secretsKey: KEY, siteUrl: SITE, log: () => {},
  });
});
after(async () => {
  await agente?.cerrar();
  await instance?.close();
  await limpiar();
  await db.end(); await dbAgente.end();
  if (tmpData) await fs.rm(tmpData, { recursive: true, force: true });
});

describe('piezas sueltas', () => {
  test('modelo por defecto, teléfonos enmascarados, alias, idioma y código de pedido', () => {
    assert.equal(MODELO_DEFAULT, 'claude-haiku-5-5');
    assert.equal(telefonoOculto('5491155551234'), '+54 9 11 ****-1234');
    assert.equal(telefonoOculto(''), 'Número oculto');
    assert.match(validarAjustes({ alias: 'ab', titular: 'Juan Pérez' }).error, /6 a 20/);
    assert.match(validarAjustes({ alias: 'con espacio', titular: 'Juan' }).error, /6 a 20/);
    assert.match(validarAjustes({ alias: 'sexyrose.pagos.muy.largo.de.mas', titular: 'Juan' }).error, /6 a 20/);
    assert.match(validarAjustes({ alias: 'sexy.rose-1', titular: 'J' }).error, /titular/);
    assert.deepEqual(validarAjustes({ activo: true, alias: 'sexy.rose-1', titular: 'Juan Pérez' }).valor, { activo: true, alias: 'sexy.rose-1', titular: 'Juan Pérez', aliasUsd: '', titularUsd: '' });
    assert.equal(detectarIdioma('Hi, I want to buy Mes Plata (35 credits, USD 35). Order SR-1234'), 'en');
    assert.equal(detectarIdioma('Olá, quero comprar Mes Plata'), 'pt');
    assert.equal(detectarIdioma('hola, cómo cambio la contraseña?'), 'es');
    assert.equal(codigoEnTexto('Pedido sr 4821, gracias'), 'SR-4821');
    assert.equal(codigoEnTexto('SR-12345'), null);
    assert.equal(leerContenido({ ephemeralMessage: { message: { extendedTextMessage: { text: 'hola' } } } }).texto, 'hola');
    assert.equal(leerContenido({ reactionMessage: {} }), null);
  });

  test('la sesión de WhatsApp se guarda cifrada con SECRETS_KEY', async () => {
    const B = await import('@whiskeysockets/baileys');
    const a = await authEnBase({ pool: db, secretsKey: KEY, BufferJSON: B.BufferJSON, initAuthCreds: B.initAuthCreds, proto: B.proto });
    await a.guardarCreds();
    await a.state.keys.set({ session: { 'abc:1': { secreto: 'valor-muy-privado', buf: Buffer.from('hola') } } });
    const { rows } = await db.query('SELECT clave, valor FROM asistente_auth ORDER BY clave');
    assert.deepEqual(rows.map((r) => r.clave), ['creds', 'session-abc-1']);
    for (const r of rows) { assert.match(r.valor, /^v1:/); assert.ok(!r.valor.includes('valor-muy-privado')); assert.ok(!r.valor.includes('noiseKey')); }
    const leido = await a.state.keys.get('session', ['abc:1', 'otro']);
    assert.equal(leido['abc:1'].secreto, 'valor-muy-privado');
    assert.ok(Buffer.isBuffer(leido['abc:1'].buf));
    assert.equal(leido.otro, undefined);
    const b = await authEnBase({ pool: db, secretsKey: KEY, BufferJSON: B.BufferJSON, initAuthCreds: B.initAuthCreds, proto: B.proto });
    assert.deepEqual(Buffer.from(b.state.creds.noiseKey.private), Buffer.from(a.state.creds.noiseKey.private));
    await db.query('DELETE FROM asistente_auth');
  });
});

describe('admin y conexión', () => {
  test('ajustes: validación, prender, QR en SVG y conectado', async () => {
    let r = await adm('/asistente');
    assert.equal(r.status, 200);
    let e = await r.json();
    assert.equal(e.ajustes.activo, false);
    assert.equal(e.whatsapp.estado, 'apagado');
    assert.equal(e.ia.configurada, true); assert.equal(e.ia.modelo, 'claude-haiku-5-5');
    assert.equal((await admJson('PUT', '/asistente/ajustes', { activo: true, alias: 'x y', titular: 'Juan Pérez' })).status, 400);
    assert.equal((await admJson('PUT', '/asistente/ajustes', { activo: true, alias: 'sexyrose.pagos', titular: 'J' })).status, 400);
    // sin la cabecera del panel no cambia nada
    assert.equal((await adm('/asistente/ajustes', { method: 'PUT', body: '{}', headers: { 'content-type': 'application/json', origin: BASE } })).status, 403);
    r = await admJson('PUT', '/asistente/ajustes', { activo: true, alias: 'sexyrose.pagos', titular: 'Juan Pérez' });
    assert.equal(r.status, 200, await r.clone().text());
    e = await r.json();
    assert.deepEqual(e.ajustes, { activo: true, alias: 'sexyrose.pagos', titular: 'Juan Pérez', aliasUsd: '', titularUsd: '' });
    e = await hasta(async () => { const x = await (await adm('/asistente')).json(); return x.whatsapp.estado === 'esperando_qr' && x.whatsapp.qrSvg ? x : null; });
    assert.ok(e, 'muestra el QR');
    assert.match(e.whatsapp.qrSvg, /^data:image\/svg\+xml;base64,/);
    assert.match(Buffer.from(e.whatsapp.qrSvg.split(',')[1], 'base64').toString(), /<svg[\s\S]*<path/);
    SOCK.ev.emit('connection.update', { connection: 'open' });
    e = await hasta(async () => { const x = await (await adm('/asistente')).json(); return x.whatsapp.estado === 'conectado' ? x : null; });
    assert.ok(e, 'conectado');
    assert.equal(e.whatsapp.numero, '+54 9 11 ****-0000');
    assert.equal(e.whatsapp.qrSvg, null);
    // el app lee getUpdates sin parar mientras el asistente está prendido (botones de Telegram)
    assert.ok(await hasta(() => instance.ctx.telegram.continuo), 'polling continuo');
  });

  test('grupos, estados, difusiones y canales se ignoran; nunca se responden', async () => {
    const antes = SOCK.enviados.length;
    await llega(null, 'hola grupo', { jid: '120363000000000000@g.us' });
    await llega(null, 'estado', { jid: 'status@broadcast' });
    await llega(null, 'canal', { jid: '120363000000000001@newsletter' });
    await llega(null, 'difusión', { jid: '1234567890@broadcast' });
    assert.equal(SOCK.enviados.length, antes);
    const { rows } = await db.query("SELECT count(*)::int AS n FROM asistente_conversaciones WHERE jid NOT LIKE '%@s.whatsapp.net'");
    assert.equal(rows[0].n, 0);
    assert.equal(LLM.llamadas.length, 0);
  });
});

describe('pedidos y comprobantes', () => {
  let ac; let p1; const TEL = '5491155550001';
  test('código de pedido: responde con pack, créditos, pesos, alias, titular y código (sin IA), con la presentación', async () => {
    ac = await acompanante();
    p1 = await pedido(ac.id);
    const llamadas = LLM.llamadas.length;
    await llega(TEL, p1.mensaje);
    const t = ultimoA(TEL);
    assert.ok(t.startsWith(PRESENTA), t);
    assert.match(t, new RegExp(`Pedido ${p1.codigo}: Trimestre Plata, 105 créditos`));
    assert.match(t, /ARS 137\.800 \(USD 95\)/);
    assert.match(t, /Alias: sexyrose\.pagos/);
    assert.match(t, /Titular: Juan Pérez/);
    assert.match(t, new RegExp(`poné ${p1.codigo} como referencia`));
    assert.match(t, /Una vez que transfieras y se verifique el pago, se acreditan los créditos en tu cuenta\. Mandame el comprobante por acá\./);
    assert.equal(LLM.llamadas.length, llamadas, 'no usó la IA');
    // "escribiendo…" antes de responder
    assert.ok(SOCK.presencias.some((x) => x.t === 'composing' && x.jid === `${TEL}@s.whatsapp.net`));
    // la segunda respuesta de la sesión no repite la presentación
    await llega(TEL, 'mi pedido es ' + p1.codigo);
    assert.ok(!ultimoA(TEL).startsWith(PRESENTA));
    // un mensaje del propio bot que vuelve como fromMe no silencia el chat
    const propio = SOCK.enviados[SOCK.enviados.length - 1].id;
    await llega(TEL, ultimoA(TEL), { fromMe: true, id: propio });
    assert.equal((await conv(TEL)).silenciado_hasta, null);
  });

  test('comprobante: se adjunta al pedido y Juan recibe la foto por Telegram con botones (sin datos de contacto)', async () => {
    await llegaFoto(TEL);
    assert.match(ultimoA(TEL), new RegExp(`Recibí el comprobante del pedido ${p1.codigo}`));
    const p = await estadoPedido(p1.id);
    assert.equal(p.estado, 'pendiente');
    assert.ok(p.comprobante_ruta, 'comprobante adjunto');
    const f = await fs.readFile(path.join(tmpData, 'privado', p.comprobante_ruta));
    assert.deepEqual(f, JPG);
    const tg = await hasta(() => TG.archivos.find((x) => x.caption.includes(p1.codigo)));
    assert.equal(tg.metodo, 'sendPhoto'); assert.equal(tg.chat, '777');
    assert.match(tg.caption, /Trimestre Plata/); assert.match(tg.caption, /105 créditos · USD 95 · ARS 137\.800/); assert.match(tg.caption, /Cuenta: Valentina/);
    assert.ok(!tg.caption.includes(TEL) && !tg.caption.includes('1155550001') && !tg.caption.includes('@'), 'sin teléfono ni email');
    const botones = tg.markup.inline_keyboard[0];
    assert.deepEqual(botones.map((b) => b.text), ['Acreditar', 'Rechazar']);
    assert.match(botones[0].callback_data, /^sr:a:[A-Za-z0-9_-]{22}$/);
    p1.botones = botones;
    // el token no queda en la base, solo su hash
    const { rows } = await db.query('SELECT token_hash FROM asistente_tg_acciones WHERE pedido_id = $1', [p1.id]);
    assert.equal(rows.length, 2);
    assert.ok(!rows.some((r) => r.token_hash.toString().includes(botones[0].callback_data.slice(5))));
  });

  test('botones: solo desde el chat vinculado y con un token válido; acreditar una sola vez; aviso por WhatsApp', async () => {
    const s0 = await saldo(ac.id);
    // otro chat con el botón verdadero: no hace nada
    let id = tocar(p1.botones[0].callback_data, 555);
    assert.equal((await respuestaDe(id)).text, 'No autorizado.');
    // token inventado desde el chat de Juan
    id = tocar('sr:a:' + crypto.randomBytes(16).toString('base64url'));
    assert.match((await respuestaDe(id)).text, /no válido/);
    // el token de "Rechazar" no sirve para acreditar
    id = tocar('sr:a:' + p1.botones[1].callback_data.slice(5));
    assert.match((await respuestaDe(id)).text, /no válido/);
    assert.equal((await estadoPedido(p1.id)).estado, 'pendiente');
    assert.equal(await saldo(ac.id), s0);
    // Juan toca "Acreditar"
    id = tocar(p1.botones[0].callback_data, 777, 'Comprobante recibido por WhatsApp');
    assert.match((await respuestaDe(id)).text, /105 créditos acreditados/);
    const p = await estadoPedido(p1.id);
    assert.equal(p.estado, 'confirmado'); assert.equal(p.confirmado_por, 'telegram');
    assert.equal(await saldo(ac.id), s0 + 10500);
    const ed = await hasta(() => TG.ediciones.find((x) => x.caption && /Acreditado desde Telegram/.test(x.caption)));
    assert.deepEqual(ed.reply_markup, { inline_keyboard: [] });
    // tocar de nuevo (o el otro botón) no acredita dos veces
    id = tocar(p1.botones[0].callback_data);
    assert.match((await respuestaDe(id)).text, /ya está confirmado/);
    id = tocar(p1.botones[1].callback_data);
    assert.match((await respuestaDe(id)).text, /ya está confirmado/);
    assert.equal(await saldo(ac.id), s0 + 10500);
    // la acompañante recibe el aviso por WhatsApp
    const aviso = await hasta(() => enviadosA(TEL).find((m) => /Listo, acreditamos 105 créditos/.test(m.text)));
    assert.ok(aviso, 'aviso de créditos acreditados');
    assert.match(aviso.text, new RegExp(p1.codigo));
  });

  test('confirmar desde el admin y rechazar desde Telegram también avisan por WhatsApp', async () => {
    const p2 = await pedido(ac.id, 'mes-plata');
    await llega(TEL, p2.codigo);
    let r = await admJson('POST', `/pedidos-creditos/${p2.id}/confirmar`);
    assert.equal(r.status, 200, await r.clone().text());
    assert.ok(await hasta(() => enviadosA(TEL).find((m) => m.text.includes(`acreditamos 35 créditos en tu cuenta (pedido ${p2.codigo})`))));
    const p3 = await pedido(ac.id, 'inicial');
    await llegaFoto(TEL, 'te paso el comprobante ' + p3.codigo);
    assert.match(ultimoA(TEL), new RegExp(`comprobante del pedido ${p3.codigo}`));
    const tg = await hasta(() => TG.archivos.find((x) => x.caption.includes(p3.codigo)));
    const id = tocar(tg.markup.inline_keyboard[0][1].callback_data);
    assert.match((await respuestaDe(id)).text, /rechazado/);
    assert.equal((await estadoPedido(p3.id)).estado, 'rechazado');
    assert.equal((await estadoPedido(p3.id)).confirmado_por, 'telegram');
    assert.ok(await hasta(() => enviadosA(TEL).find((m) => m.text.startsWith(`No pudimos confirmar el pago del pedido ${p3.codigo}.`))));
    // desde el admin con motivo
    const p4 = await pedido(ac.id, 'inicial');
    await llega(TEL, p4.codigo);
    r = await admJson('POST', `/pedidos-creditos/${p4.id}/rechazar`, { motivo: 'no llegó la transferencia' });
    assert.equal(r.status, 200);
    assert.ok(await hasta(() => enviadosA(TEL).find((m) => m.text.includes(`pedido ${p4.codigo}. Motivo: no llegó la transferencia.`))));
  });

  test('varios pedidos pendientes: pregunta cuál y adjunta cuando responde el código', async () => {
    const tel = '5491155550003';
    const b = await acompanante({ whatsapp: '+54 9 11 5555-0003', nombre: 'Bianca' });
    const a1 = await pedido(b.id, 'inicial'); const a2 = await pedido(b.id, 'mes-plata');
    await llegaFoto(tel);
    const t = ultimoA(tel);
    assert.match(t, /más de un pedido pendiente/);
    assert.ok(t.includes(a1.codigo) && t.includes(a2.codigo));
    assert.equal((await estadoPedido(a1.id)).comprobante_ruta, null);
    await llega(tel, `es el ${a2.codigo}`);
    assert.match(ultimoA(tel), new RegExp(`Recibí el comprobante del pedido ${a2.codigo}`));
    assert.ok((await estadoPedido(a2.id)).comprobante_ruta);
    assert.equal((await estadoPedido(a1.id)).comprobante_ruta, null);
    // sin pedidos en el chat
    await llegaFoto('5491155550004');
    assert.match(ultimoA('5491155550004'), /no encuentro un pedido pendiente/);
    // un audio o un PDF falso no se aceptan
    await llega('5491155550004', { audioMessage: { mimetype: 'audio/ogg' } });
    assert.match(ultimoA('5491155550004'), /comprobantes en foto o PDF/);
    await llega('5491155550004', { documentMessage: { mimetype: 'application/zip', fileLength: 10 } });
    assert.match(ultimoA('5491155550004'), /comprobantes en foto o PDF/);
    await llega('5491155550004', { documentMessage: { mimetype: 'application/pdf', fileLength: 11 * 1024 * 1024 } });
    assert.match(ultimoA('5491155550004'), /máximo 10 MB/);
  });
});

describe('identificación y permisos', () => {
  test('por el teléfono del perfil: ve su cuenta y puede pedir créditos', async () => {
    const tel = '5491155550005';
    const c = await acompanante({ whatsapp: '+54 11 5555-0005', nombre: 'Carla' });
    await db.query("INSERT INTO creditos_movimientos (cuenta_id, tipo, centavos, saldo_despues, motivo) VALUES ($1, 'ajuste_admin', 4200, 4200, 'prueba')", [c.id]);
    LLM.guion = () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Listo.' }] });
    await llega(tel, '¿cuánto saldo tengo?');
    const k = await conv(tel);
    assert.equal(k.cuenta_id, c.id); assert.equal(k.identificado_por, 'telefono');
    const e = await agente.asistente.herramienta(k.id, 'estado_cuenta', {});
    assert.equal(e.resultado.saldoCreditos, '42.00');
    assert.equal(e.resultado.nombreArtistico, 'Carla');
    const r = await agente.asistente.herramienta(k.id, 'crear_pedido', { pack_id: 'mes-plata' });
    assert.ok(r.resultado.ok, JSON.stringify(r));
    assert.match(ultimoA(tel), new RegExp(`Pedido ${r.resultado.codigo}: Mes Plata, 35 créditos`));
    assert.match(ultimoA(tel), /Alias: sexyrose\.pagos/);
    const { rows } = await db.query("SELECT * FROM pedidos_creditos WHERE codigo = $1 AND estado = 'pendiente'", [r.resultado.codigo]);
    assert.equal(rows[0].cuenta_id, c.id);
    LLM.guion = null;
  });

  test('un chat sin identificar no ve saldo, no crea pedidos y solo ve los pedidos cuyo código escribió', async () => {
    const tel = '5491155550006';
    const d = await acompanante({ nombre: 'Dana' });
    const otro = await pedido(d.id, 'inicial');
    // la IA intenta ver la cuenta: la herramienta lo niega y el saldo nunca llega a la IA
    LLM.guion = (body, i) => (body.messages[body.messages.length - 1].role === 'user' && typeof body.messages[body.messages.length - 1].content === 'string'
      ? usarHerramienta('estado_cuenta', {}) : { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Para eso necesito identificar tu cuenta: pasame tu email.' }] });
    const desde = LLM.llamadas.length;
    await llega(tel, 'quiero ver mi saldo');
    const tr = LLM.llamadas.slice(desde).map((b) => JSON.stringify(b.messages)).join('');
    assert.match(tr, /chat_no_identificado/);
    assert.ok(!/saldoCreditos/.test(tr));
    assert.match(ultimoA(tel), /pasame tu email/);
    LLM.guion = null;
    const k = await conv(tel);
    assert.equal(k.cuenta_id, null);
    assert.equal((await agente.asistente.herramienta(k.id, 'estado_cuenta', {})).resultado.error, 'chat_no_identificado');
    assert.equal((await agente.asistente.herramienta(k.id, 'crear_pedido', { pack_id: 'inicial' })).resultado.error, 'chat_no_identificado');
    assert.match((await agente.asistente.herramienta(k.id, 'pedido_por_codigo', { codigo: otro.codigo })).resultado.error, /No hay un pedido/);
    assert.match((await agente.asistente.herramienta(k.id, 'datos_transferencia', { codigo: otro.codigo })).resultado.error, /No hay un pedido/);
    // escribe el código: ahora sí ve ese pedido (y nada más)
    await llega(tel, otro.codigo);
    const pp = await agente.asistente.herramienta(k.id, 'pedido_por_codigo', { codigo: otro.codigo });
    assert.equal(pp.resultado.estado, 'pendiente'); assert.equal(pp.resultado.creditos, '10');
    assert.equal((await agente.asistente.herramienta(k.id, 'estado_cuenta', {})).resultado.error, 'chat_no_identificado');
    const { rows } = await db.query("SELECT count(*)::int AS n FROM pedidos_creditos WHERE cuenta_id = $1", [d.id]);
    assert.equal(rows[0].n, 1);
  });

  test('por email: código de 6 números (lo manda el app), intentos y vencimiento', async () => {
    const tel = '5491155550007';
    const e = await acompanante({ nombre: 'Eva' });
    LLM.guion = (body) => {
      const ult = body.messages[body.messages.length - 1];
      if (typeof ult.content === 'string' && ult.content.includes('@')) return usarHerramienta('enviar_codigo_email', { email: e.email.toUpperCase() });
      return { stop_reason: 'end_turn', content: [{ type: 'text', text: '' }] };
    };
    const m0 = MAILS.length;
    await llega(tel, `mi email es ${e.email}`);
    assert.match(ultimoA(tel), /te mandé un código de 6 números/);
    const mail = await hasta(() => MAILS.slice(m0).find((m) => m.to === e.email));
    assert.ok(mail, 'el app mandó el email');
    const codigo = /Tu código es: (\d{6})/.exec(mail.text)[1];
    // email que no es de nadie: misma respuesta, ningún email
    const m1 = MAILS.length;
    const k = await conv(tel);
    await agente.asistente.herramienta(k.id, 'enviar_codigo_email', { email: 'nadie-zz@example.com' });
    assert.match(ultimoA(tel), /te mandé un código/);
    await espera(300);
    assert.equal(MAILS.length, m1);
    // el pedido de código nuevo anula el anterior: se pide de nuevo para la cuenta real
    const m2 = MAILS.length;
    await agente.asistente.herramienta(k.id, 'enviar_codigo_email', { email: e.email });
    const mail2 = await hasta(() => MAILS.slice(m2).find((m) => m.to === e.email));
    const cod2 = /Tu código es: (\d{6})/.exec(mail2.text)[1];
    LLM.guion = null;
    const malo = cod2 === '000000' ? '111111' : '000000';
    await llega(tel, malo);
    assert.match(ultimoA(tel), /no es correcto\. Te quedan 4 intentos/);
    if (codigo !== cod2) { await llega(tel, codigo); assert.match(ultimoA(tel), /no es correcto/); } // el anterior ya no sirve
    await llega(tel, cod2);
    assert.match(ultimoA(tel), /ya sé que sos Eva/);
    const k2 = await conv(tel);
    assert.equal(k2.cuenta_id, e.id); assert.equal(k2.identificado_por, 'email');
    assert.equal((await agente.asistente.herramienta(k2.id, 'estado_cuenta', {})).resultado.nombreArtistico, 'Eva');

    // 5 intentos y se acaba
    const tel2 = '5491155550008';
    await llega(tel2, 'hola');
    const k3 = await conv(tel2);
    await agente.asistente.herramienta(k3.id, 'enviar_codigo_email', { email: e.email });
    for (let i = 1; i <= 4; i++) { await llega(tel2, '99999' + i); assert.match(ultimoA(tel2), new RegExp(`Te ${5 - i === 1 ? 'queda 1 intento' : `quedan ${5 - i} intentos`}`)); }
    await llega(tel2, '999995');
    assert.match(ultimoA(tel2), /Se terminaron los intentos/);
    assert.equal((await conv(tel2)).cuenta_id, null);
    // vencido
    await agente.asistente.herramienta(k3.id, 'enviar_codigo_email', { email: e.email });
    await db.query("UPDATE asistente_codigos_email SET expira = now() - interval '1 minute' WHERE conversacion_id = $1 AND usado IS NULL", [k3.id]);
    await llega(tel2, '123456');
    assert.match(ultimoA(tel2), /Ese código venció/);
    assert.equal((await conv(tel2)).cuenta_id, null);
  });
});

describe('IA, persona y límites', () => {
  test('presentación como IA al empezar cada sesión, también en inglés', async () => {
    LLM.guion = () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: '**Los planes** se pagan con créditos.' }] });
    await llega('5491155550010', '¿cómo funcionan los planes?');
    const t = ultimoA('5491155550010');
    assert.equal(t, `${PRESENTA}\n\nLos planes se pagan con créditos.`);
    const ultima = LLM.llamadas[LLM.llamadas.length - 1];
    assert.equal(ultima.model, 'claude-haiku-5-5');
    assert.ok(ultima.tools.some((x) => x.name === 'derivar_a_juan'));
    assert.match(ultima.system, /NO identificado/);
    await llega('447700900123', 'Hi, how can I change my password please?');
    assert.ok(ultimoA('447700900123').startsWith("Hi, I'm SexyRose's AI account assistant."));
    // pasadas 24 h sin respuestas del bot, se presenta de nuevo
    const k = await conv('5491155550010');
    await db.query("UPDATE asistente_mensajes SET creado = now() - interval '25 hours' WHERE conversacion_id = $1", [k.id]);
    await llega('5491155550010', 'otra pregunta');
    assert.ok(ultimoA('5491155550010').startsWith(PRESENTA));
    LLM.guion = null;
  });

  test('"¿sos un bot?": dice que es una IA y ofrece pasar con una persona', async () => {
    const llamadas = LLM.llamadas.length;
    await llega('5491155550011', '¿sos un bot?');
    assert.match(ultimoA('5491155550011'), /Soy un asistente de IA \(inteligencia artificial\), no una persona\. Si preferís hablar con alguien del equipo, decime y te paso\./);
    assert.equal(LLM.llamadas.length, llamadas);
  });

  test('derivar_a_juan: avisa, el chat pasa a "humano" y el bot calla; alerta urgente', async () => {
    const tel = '5491155550012';
    LLM.guion = () => usarHerramienta('derivar_a_juan', { motivo: 'Pide hablar con una persona; su número es +54 9 11 5555-0012' });
    await llega(tel, 'quiero hablar con alguien');
    assert.match(ultimoA(tel), /Le paso tu consulta a una persona del equipo/);
    const k = await conv(tel);
    assert.equal(k.estado, 'humano');
    const tg = await hasta(() => TG.enviados.find((m) => /pasa a vos/.test(m.text) && /Pide hablar/.test(m.text)));
    assert.ok(tg); assert.ok(!tg.text.includes('5555-0012'), 'sin teléfono en Telegram');
    const antes = enviadosA(tel).length; const llamadas = LLM.llamadas.length;
    await llega(tel, '¿hola?');
    assert.equal(enviadosA(tel).length, antes); assert.equal(LLM.llamadas.length, llamadas);
    // alerta
    const tel2 = '5491155550013';
    LLM.guion = () => usarHerramienta('alerta', { tipo: 'menores', motivo: 'Mencionó a una menor' });
    await llega(tel2, 'mensaje preocupante');
    assert.match(ultimoA(tel2), /Gracias por escribir\. Una persona del equipo va a revisar este tema\./);
    assert.equal((await conv(tel2)).estado, 'humano');
    assert.ok(await hasta(() => TG.enviados.find((m) => /ALERTA URGENTE del asistente \(menores\)/.test(m.text))));
    LLM.guion = null;
  });

  test('"Pasar a humano" desde el admin y Juan escribiendo desde el teléfono silencian el bot', async () => {
    const tel = '5491155550014';
    await llega(tel, 'hola');
    const k = await conv(tel);
    let r = await admJson('POST', `/asistente/conversaciones/${k.id}/humano`, { humano: true });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).conversacion.estado, 'humano');
    let antes = enviadosA(tel).length;
    await llega(tel, '¿estás?');
    assert.equal(enviadosA(tel).length, antes);
    r = await admJson('POST', `/asistente/conversaciones/${k.id}/humano`, { humano: false });
    assert.equal((await r.json()).conversacion.estado, 'bot');
    await llega(tel, '¿y ahora?');
    assert.equal(enviadosA(tel).length, antes + 1);
    // Juan escribe desde el teléfono (fromMe que no mandó el bot): 12 h de silencio
    await llega(tel, 'Hola, soy Juan, te escribo yo', { fromMe: true });
    const k2 = await conv(tel);
    assert.ok(new Date(k2.silenciado_hasta) > new Date(Date.now() + 11.9 * 3600 * 1000));
    const { rows } = await db.query("SELECT origen, dir FROM asistente_mensajes WHERE conversacion_id = $1 ORDER BY id DESC LIMIT 1", [k.id]);
    assert.deepEqual(rows[0], { origen: 'juan', dir: 'out' });
    antes = enviadosA(tel).length;
    await llega(tel, 'gracias Juan');
    assert.equal(enviadosA(tel).length, antes);
    r = await adm('/asistente/conversaciones?estado=humano');
    assert.ok((await r.json()).items.some((x) => x.id === k.id));
  });

  test('límite de 20 mensajes por hora: pasa a una persona', async () => {
    const tel = '5491155550015';
    await llega(tel, 'hola');
    const k = await conv(tel);
    for (let i = 0; i < 19; i++) await db.query("INSERT INTO asistente_mensajes (conversacion_id, dir, origen, texto) VALUES ($1, 'in', 'usuario', 'x')", [k.id]);
    const llamadas = LLM.llamadas.length;
    await llega(tel, 'mensaje 21');
    assert.match(ultimoA(tel), /Le paso tu consulta a una persona/);
    assert.equal((await conv(tel)).estado, 'humano');
    assert.equal(LLM.llamadas.length, llamadas);
    assert.ok(await hasta(() => TG.enviados.find((m) => /Más de 20 mensajes en una hora/.test(m.text))));
  });

  test('si la API de Claude falla: "Te va a responder una persona del equipo" + aviso; lo automático sigue andando', async () => {
    const tel = '5491155550016';
    LLM.guion = () => ({ status: 529 });
    const t0 = TG.enviados.length;
    await llega(tel, '¿cómo subo fotos?');
    assert.match(ultimoA(tel), /Te va a responder una persona del equipo\./);
    assert.ok(await hasta(() => TG.enviados.slice(t0).find((m) => /Asistente sin IA/.test(m.text))));
    // no repite el aviso en cada mensaje
    const n0 = enviadosA(tel).length;
    await llega(tel, '¿hola?');
    assert.equal(enviadosA(tel).length, n0);
    // el código de pedido sigue andando
    const f = await acompanante({ nombre: 'Flor' });
    const p = await pedido(f.id, 'inicial');
    await llega(tel, p.codigo);
    assert.match(ultimoA(tel), /Alias: sexyrose\.pagos/);
    LLM.guion = null;
  });

  test('sin ANTHROPIC_API_KEY: lo libre va a una persona, lo automático funciona', async () => {
    const enviados = [];
    const sinClave = createAsistente({
      pool: db, creditos: cred(), planes: instance.ctx.planes, privado: instance.ctx.privado, telegram: agente.telegram,
      llm: createLlm({ apiKey: '' }), siteUrl: SITE, enviar: async (jid, t) => { enviados.push({ jid, t }); return 'X' + enviados.length; },
    });
    const jid = '5491155550017@s.whatsapp.net';
    await sinClave.recibir({ jid, telefono: '5491155550017', waId: 'k1', tipo: 'texto', texto: '¿qué es el Destacado?' });
    assert.equal(enviados.at(-1).t, `${PRESENTA}\n\nTe va a responder una persona del equipo.`);
    const g = await acompanante({ nombre: 'Gala' });
    const p = await pedido(g.id, 'inicial');
    await sinClave.recibir({ jid, telefono: '5491155550017', waId: 'k2', tipo: 'texto', texto: `Pedido ${p.codigo}` });
    assert.match(enviados.at(-1).t, /ARS 14\.500 \(USD 10\)/);
  });
});

describe('cuenta en dólares (16/11/2026)', () => {
  const USD = { aliasUsd: 'sexyrose.usd', titularUsd: 'Juan Pérez USD' };
  const ponerUsd = (extra = {}) => admJson('PUT', '/asistente/ajustes', { activo: true, alias: 'sexyrose.pagos', titular: 'Juan Pérez', ...USD, ...extra });
  const sinUsd = () => admJson('PUT', '/asistente/ajustes', { activo: true, alias: 'sexyrose.pagos', titular: 'Juan Pérez', aliasUsd: '', titularUsd: '' });
  const PREGUNTA = /¿Vas a transferir en pesos o en dólares\?$/;

  test('detección de la moneda en la respuesta (sin importar mayúsculas ni tildes)', () => {
    for (const t of ['pesos', 'En PESOS', 'en $', 'ARS', 'peso', 'te paso en pesos porfa']) assert.equal(monedaEnTexto(t), 'ARS', t);
    for (const t of ['dólares', 'DOLARES', 'en dolar', 'USD', 'u$s', 'US$ porfa', 'mejor en dólares', 'in dollars']) assert.equal(monedaEnTexto(t), 'USD', t);
    for (const t of ['pesos o dólares?', 'no tengo dólares', 'no, en pesos no']) assert.equal(monedaEnTexto(t), 'ambas', t);
    for (const t of ['hola', 'ya te transferí', 'dolarizado']) assert.equal(monedaEnTexto(t), null, t);
  });

  test('ajustes: validación de la cuenta en dólares y compatibilidad con el ajuste viejo {activo, alias, titular}', async () => {
    assert.match(validarAjustes({ alias: 'sexyrose.pagos', titular: 'Juan Pérez', aliasUsd: 'con espacio', titularUsd: 'Juan' }).error, /alias en dólares tiene que tener de 6 a 20/);
    assert.match(validarAjustes({ alias: 'sexyrose.pagos', titular: 'Juan Pérez', aliasUsd: 'sexyrose.usd', titularUsd: 'J' }).error, /titular en dólares/);
    assert.match(validarAjustes({ alias: 'sexyrose.pagos', titular: 'Juan Pérez', aliasUsd: 'sexyrose.usd' }).error, /completá el alias y el nombre del titular/);
    assert.equal((await ponerUsd({ aliasUsd: 'x y' })).status, 400);
    // un ajuste guardado antes de la cuenta en dólares se lee igual (pesos) y sin dólares
    await db.query("UPDATE ajustes SET valor = $1 WHERE clave = 'asistente'", [JSON.stringify({ activo: true, alias: 'sexyrose.pagos', titular: 'Juan Pérez' })]);
    let e = await (await adm('/asistente')).json();
    assert.deepEqual(e.ajustes, { activo: true, alias: 'sexyrose.pagos', titular: 'Juan Pérez', aliasUsd: '', titularUsd: '' });
    // sin cuenta en dólares no pregunta nada: pesos directo, como siempre
    const tel = '5491155550030';
    const a = await acompanante({ nombre: 'Ana' });
    const p = await pedido(a.id);
    await llega(tel, p.mensaje);
    assert.match(ultimoA(tel), /ARS 137\.800 \(USD 95\)/);
    assert.doesNotMatch(ultimoA(tel), /dólares\?/);
    assert.equal((await estadoPedido(p.id)).moneda_asistente, null);
    // guardar la cuenta en dólares; un PUT viejo (sin aliasUsd/titularUsd) no la borra
    let r = await ponerUsd();
    assert.equal(r.status, 200, await r.clone().text());
    r = await admJson('PUT', '/asistente/ajustes', { activo: true, alias: 'sexyrose.pagos', titular: 'Juan Pérez' });
    e = await r.json();
    assert.deepEqual(e.ajustes, { activo: true, alias: 'sexyrose.pagos', titular: 'Juan Pérez', ...USD });
  });

  test('con cuenta en dólares: pregunta la moneda, toma "en dólares" y pasa los datos en USD; Telegram muestra la moneda', async () => {
    const tel = '5491155550031';
    const a = await acompanante({ nombre: 'Belén' });
    const p = await pedido(a.id);
    const llamadas = LLM.llamadas.length;
    await llega(tel, p.mensaje);
    let t = ultimoA(tel);
    assert.ok(t.startsWith(PRESENTA + '\n\n'), t);
    assert.match(t, new RegExp(`Pedido ${p.codigo}: Trimestre Plata, 105 créditos\\.\\n¿Vas a transferir en pesos o en dólares\\?$`));
    assert.doesNotMatch(t, /Alias|ARS/);
    assert.equal((await conv(tel)).pago_esperando_moneda, true);
    await llega(tel, 'En DÓLARES');
    t = ultimoA(tel);
    assert.match(t, new RegExp(`^Pedido ${p.codigo}: Trimestre Plata, 105 créditos\\.\\nMonto a transferir: USD 95\\.\\nAlias: sexyrose\\.usd\\nTitular: Juan Pérez USD\\n`));
    assert.match(t, new RegExp(`fijate que el titular de la cuenta sea ese\\. Si tu banco te deja, poné ${p.codigo} como referencia\\.`));
    assert.match(t, /Una vez que transfieras y se verifique el pago, se acreditan los créditos en tu cuenta\. Mandame el comprobante por acá\.$/);
    assert.doesNotMatch(t, /ARS|sexyrose\.pagos/);
    assert.equal(LLM.llamadas.length, llamadas, 'sin IA');
    assert.equal((await estadoPedido(p.id)).moneda_asistente, 'USD');
    assert.equal((await conv(tel)).pago_esperando_moneda, false);
    // el mismo código otra vez: ya eligió, pasa los datos en dólares sin preguntar
    await llega(tel, p.codigo);
    assert.match(ultimoA(tel), /Monto a transferir: USD 95\./);
    // comprobante → Telegram con el monto en la moneda elegida
    await llegaFoto(tel);
    const tg = await hasta(() => TG.archivos.find((x) => x.caption.includes(p.codigo)));
    assert.match(tg.caption, /105 créditos · en dólares: USD 95\n/);
    assert.doesNotMatch(tg.caption, /ARS/);
    // admin: el chat y la lista de pedidos muestran la moneda
    const k = await conv(tel);
    const d = await (await adm('/asistente/conversaciones/' + k.id)).json();
    assert.equal(d.pedidos.find((x) => x.codigo === p.codigo).moneda, 'USD');
    const l = await (await adm('/pedidos-creditos?q=' + p.codigo)).json();
    assert.equal(l.items.find((x) => x.id === p.id).monedaAsistente, 'USD');
  });

  test('"pesos" a la pregunta y después "mejor en dólares": cambia de moneda y pasa los otros datos', async () => {
    const tel = '5491155550032';
    const a = await acompanante({ nombre: 'Cami' });
    const p = await pedido(a.id);
    await llega(tel, p.mensaje);
    assert.match(ultimoA(tel), PREGUNTA);
    await llega(tel, 'pesos');
    let t = ultimoA(tel);
    assert.match(t, /Monto a transferir: ARS 137\.800 \(USD 95\)\.\nAlias: sexyrose\.pagos\nTitular: Juan Pérez\n/);
    assert.equal((await estadoPedido(p.id)).moneda_asistente, 'ARS');
    // repetir la misma moneda no manda los datos de nuevo (lo responde la IA)
    const llamadas = LLM.llamadas.length;
    await llega(tel, 'ok, en pesos');
    assert.equal(ultimoA(tel), 'Respuesta de prueba.');
    assert.equal(LLM.llamadas.length, llamadas + 1);
    await llega(tel, 'mejor en dólares');
    t = ultimoA(tel);
    assert.match(t, /Monto a transferir: USD 95\.\nAlias: sexyrose\.usd\nTitular: Juan Pérez USD\n/);
    assert.equal((await estadoPedido(p.id)).moneda_asistente, 'USD');
    await llega(tel, 'no, perdón, en $');
    assert.equal((await estadoPedido(p.id)).moneda_asistente, 'USD', 'con "no" lo decide la IA');
    await llega(tel, 'en $');
    assert.match(ultimoA(tel), /ARS 137\.800/);
    assert.equal((await estadoPedido(p.id)).moneda_asistente, 'ARS');
    // Telegram: en pesos
    await llegaFoto(tel);
    const tg = await hasta(() => TG.archivos.find((x) => x.caption.includes(p.codigo)));
    assert.match(tg.caption, /105 créditos · en pesos: ARS 137\.800 \(USD 95\)\n/);
  });

  test('respuesta ambigua o sin moneda: la resuelve la IA con datos_transferencia(moneda); también en inglés', async () => {
    const tel = '5491155550033';
    const a = await acompanante({ nombre: 'Dalma' });
    const p = await pedido(a.id, 'mes-plata');
    await llega(tel, p.mensaje);
    assert.match(ultimoA(tel), PREGUNTA);
    LLM.guion = (body) => {
      const ult = body.messages[body.messages.length - 1];
      if (typeof ult.content === 'string') return usarHerramienta('datos_transferencia', { codigo: p.codigo, moneda: 'USD' });
      return { stop_reason: 'end_turn', content: [{ type: 'text', text: '' }] };
    };
    await llega(tel, 'tengo pesos y dólares, pero prefiero pagar en verde');
    assert.match(ultimoA(tel), /Monto a transferir: USD 35\.\nAlias: sexyrose\.usd/);
    assert.equal((await estadoPedido(p.id)).moneda_asistente, 'USD');
    const ultima = LLM.llamadas[LLM.llamadas.length - 1];
    assert.deepEqual(ultima.tools.find((x) => x.name === 'datos_transferencia').input_schema.properties.moneda.enum, ['ARS', 'USD']);
    LLM.guion = null;
    // la herramienta sin moneda y sin elección: pregunta
    const p2 = await pedido(a.id, 'inicial');
    await llega(tel, p2.codigo);
    const k = await conv(tel);
    const r = await agente.asistente.herramienta(k.id, 'datos_transferencia', { codigo: p2.codigo });
    assert.match(r.resultado.nota, /preguntó/);
    assert.match(ultimoA(tel), PREGUNTA);
    // crear_pedido por chat también pregunta primero
    await db.query("UPDATE asistente_conversaciones SET cuenta_id = $2, identificado_por = 'email', identificado = now() WHERE id = $1", [k.id, a.id]);
    const c = await agente.asistente.herramienta(k.id, 'crear_pedido', { pack_id: 'mes-plata' });
    assert.ok(c.resultado.ok);
    assert.match(c.resultado.nota, /preguntó/);
    assert.match(ultimoA(tel), new RegExp(`Pedido ${c.resultado.codigo}: Mes Plata, 35 créditos\\.\\n¿Vas a transferir`));
    // en inglés
    const tel2 = '447700900130';
    const b = await acompanante({ nombre: 'Emma' });
    const p3 = await pedido(b.id, 'inicial');
    await llega(tel2, `Hi, I want to buy Inicial. Order ${p3.codigo}`);
    assert.match(ultimoA(tel2), /Will you transfer in pesos or in dollars\?$/);
    await llega(tel2, 'dollars');
    assert.match(ultimoA(tel2), /Amount to transfer: USD 10\.\nAlias: sexyrose\.usd\nAccount holder: Juan Pérez USD\n/);
  });

  test('sin cuenta en dólares, la herramienta no acepta USD y todo vuelve a ser como antes', async () => {
    assert.equal((await sinUsd()).status, 200);
    const tel = '5491155550034';
    const a = await acompanante({ nombre: 'Eli' });
    const p = await pedido(a.id, 'inicial');
    await llega(tel, p.codigo);
    assert.match(ultimoA(tel), /ARS 14\.500 \(USD 10\)/);
    const k = await conv(tel);
    assert.match((await agente.asistente.herramienta(k.id, 'datos_transferencia', { codigo: p.codigo, moneda: 'USD' })).resultado.error, /solo se puede transferir en pesos/);
    const n = enviadosA(tel).length;
    await llega(tel, 'dólares');
    assert.equal(enviadosA(tel).length, n + 1);
    assert.equal(ultimoA(tel), 'Respuesta de prueba.', 'sin cuenta en dólares, "dólares" lo responde la IA');
    await llegaFoto(tel);
    const tg = await hasta(() => TG.archivos.find((x) => x.caption.includes(p.codigo)));
    assert.match(tg.caption, /10 créditos · USD 10 · ARS 14\.500\n/);
  });
});

describe('admin: conversaciones, desvincular y limpieza', () => {
  test('lista con teléfono enmascarado, cuenta y último mensaje; vista del chat y comprobante', async () => {
    let r = await adm('/asistente/conversaciones');
    assert.equal(r.status, 200);
    const l = await r.json();
    const x = l.items.find((i) => i.telefono === '+54 9 11 ****-0001');
    assert.ok(x, JSON.stringify(l.items.map((i) => i.telefono)));
    assert.ok(!JSON.stringify(l).includes('5491155550001'), 'nunca el número completo');
    assert.equal(x.cuenta, null);
    assert.ok(x.ultimo && x.ultimo.creado);
    const carla = l.items.find((i) => i.telefono === '+54 9 11 ****-0005');
    assert.equal(carla.cuenta.nombre, 'Carla');
    r = await adm('/asistente/conversaciones?q=0001');
    assert.ok((await r.json()).items.some((i) => i.id === x.id));
    r = await adm('/asistente/conversaciones/' + x.id);
    const d = await r.json();
    assert.ok(d.mensajes.some((m) => m.origen === 'bot' && m.texto.startsWith(PRESENTA)));
    assert.ok(d.pedidos.length >= 3);
    const conArchivo = d.mensajes.find((m) => m.archivo);
    r = await adm(`/asistente/conversaciones/${x.id}/mensajes/${conArchivo.id}/archivo`);
    assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'image/jpeg'); assert.match(r.headers.get('cache-control'), /no-store/);
    assert.equal((await adm('/asistente/conversaciones/no-es-uuid')).status, 404);
    assert.equal((await admJson('POST', `/asistente/conversaciones/${x.id}/humano`, { humano: 'si' })).status, 400);
    // sin Basic Auth no hay nada
    assert.equal((await fetch(BASE + A + '/api/asistente/conversaciones')).status, 401);
  });

  test('desvincular: el agente cierra la sesión y vuelve a pedir QR', async () => {
    const viejo = SOCK;
    const r = await admJson('POST', '/asistente/desvincular');
    assert.equal(r.status, 200);
    assert.ok(await hasta(() => viejo.logouts === 1), 'logout');
    const e = await hasta(async () => { const x = await (await adm('/asistente')).json(); return x.whatsapp.estado === 'esperando_qr' && x.whatsapp.qrSvg ? x : null; });
    assert.ok(e, 'QR nuevo');
    assert.notEqual(SOCK, viejo);
    SOCK.ev.emit('connection.update', { connection: 'open' });
    assert.ok(await hasta(() => agente.wa.conectado()));
  });

  test('con el asistente prendido, vincular Telegram sigue funcionando', async () => {
    const r = await admJson('POST', '/integraciones/telegram/vincular');
    assert.equal(r.status, 200, await r.clone().text());
    const codigo = (await r.json()).pendiente.codigo;
    TG.updates.push({ update_id: TG.nextId++, message: { message_id: 9, chat: { id: 888, type: 'private', first_name: 'Juan2' }, text: '/start ' + codigo } });
    assert.ok(await hasta(async () => (await (await adm('/integraciones/telegram')).json()).vinculado?.nombre === 'Juan2'));
    assert.ok(instance.ctx.telegram.continuo, 'sigue leyendo sin parar');
  });

  test('limpieza: mensajes y archivos de más de 90 días (los comprobantes de pedidos quedan)', async () => {
    const k = await conv('5491155550004');
    const ruta = await instance.ctx.privado.guardar('comprobantes', JPG, 'jpg');
    await db.query("INSERT INTO asistente_mensajes (conversacion_id, dir, origen, tipo, media_ruta, creado) VALUES ($1, 'in', 'usuario', 'imagen', $2, now() - interval '91 days')", [k.id, ruta]);
    const usado = (await db.query('SELECT comprobante_ruta FROM pedidos_creditos WHERE comprobante_ruta IS NOT NULL LIMIT 1')).rows[0].comprobante_ruta;
    await db.query("UPDATE asistente_mensajes SET creado = now() - interval '91 days' WHERE media_ruta = $1", [usado]);
    const viejo = await db.query("INSERT INTO asistente_conversaciones (jid, telefono, ultimo_mensaje, creado) VALUES ('5490000000001@s.whatsapp.net', '5490000000001', now() - interval '100 days', now() - interval '100 days') RETURNING id");
    const r = await instance.ctx.asistenteApp.purgar();
    assert.ok(r.mensajes >= 2);
    await assert.rejects(fs.stat(path.join(tmpData, 'privado', ruta)));
    await fs.stat(path.join(tmpData, 'privado', usado)); // sigue: es el comprobante de un pedido
    assert.equal((await db.query('SELECT 1 FROM asistente_conversaciones WHERE id = $1', [viejo.rows[0].id])).rows.length, 0);
    assert.ok(await conv('5491155550004'), 'los chats con mensajes recientes quedan');
  });

  test('apagar: el agente se desconecta y el app deja de leer getUpdates sin parar', async () => {
    const r = await admJson('PUT', '/asistente/ajustes', { activo: false, alias: 'sexyrose.pagos', titular: 'Juan Pérez' });
    assert.equal(r.status, 200);
    assert.ok(await hasta(() => !agente.wa.activo));
    assert.ok(await hasta(async () => (await (await adm('/asistente')).json()).whatsapp.estado === 'apagado'));
    assert.ok(await hasta(() => !instance.ctx.telegram.continuo));
    const antes = SOCK.enviados.length;
    const res = await agente.asistente.recibir({ jid: '5491155550099@s.whatsapp.net', telefono: '5491155550099', waId: 'z', tipo: 'texto', texto: 'hola' });
    assert.equal(res.ignorado, 'apagado');
    assert.equal(SOCK.enviados.length, antes);
  });
});

describe('ayuda: contexto de todo el sitio y venta de contenido (17/11/2026)', () => {
  const TEMAS_NUEVOS = ['perfil', 'historias', 'videos', 'mis_numeros', 'avisos', 'ocultar_o_baja', 'como_funciona', 'denuncias', 'idiomas', 'contenido'];
  // Nada interno en los textos de ayuda (Juan: "sin pasar nada vital del negocio ni información confidencial").
  // "Telegram" como contacto de su perfil sí; Mercado Pago solo en el texto de "contenido" (lo muestra su panel).
  const PROHIBIDAS = [/comisi[oó]n/i, /%/, /porcentaje/i, /proveedor/i, /\bcostos?\b/i, /bunny/i, /mailgun/i, /cloudflare/i, /anthropic/i,
    /claude/i, /haiku/i, /baileys/i, /hetzner/i, /servidor/i, /contenedor/i, /docker/i, /captaci[oó]n/i, /\badmin/i, /alerta/i,
    /aviso a juan/i, /\bjuan\b/i, /\bbot de telegram\b/i, /georef/i, /marketplace/i, /client.?secret/i, /webhook/i, /credencial/i,
    /skokka/i, /simpleescort/i, /argxp/i, /otros sitios/i, /m[eé]tricas/i, /moderador/i, /estrategia/i, /abogad/i];
  const TODOS = () => [...Object.entries(AYUDA), ['contenido (próximamente)', CONTENIDO_PROXIMAMENTE]];

  test('cada tema devuelve texto, con la dirección del sitio y de un largo de WhatsApp', () => {
    for (const t of TEMAS_NUEVOS) assert.ok(TEMAS_AYUDA.includes(t), `falta el tema ${t}`);
    for (const t of TEMAS_AYUDA) {
      for (const contenidoDisponible of [false, true]) {
        const x = textoAyuda(t, 'https://sexyrose.test/', { contenidoDisponible });
        assert.ok(typeof x === 'string' && x.length > 20, `${t}: sin texto`);
        assert.ok(!x.includes('{url}') && !x.includes('test//'), `${t}: dirección mal armada`);
        assert.ok(x.length <= 1200, `${t}: demasiado largo para WhatsApp (${x.length})`);
      }
    }
    assert.equal(textoAyuda('no-existe', SITE), null);
    assert.equal(textoAyuda('toString', SITE), null);
    // la herramienta ofrece exactamente estos temas
    const ayuda = HERRAMIENTAS.find((h) => h.name === 'ayuda');
    assert.deepEqual(ayuda.input_schema.properties.tema.enum, TEMAS_AYUDA);
    for (const t of TEMAS_NUEVOS) assert.match(ayuda.input_schema.properties.tema.description, new RegExp(`\\b${t}\\b`));
    // enlaces: las secciones del panel que existen
    const enl = textoAyuda('enlaces', SITE);
    for (const p of ['numeros', 'perfil', 'fotos', 'verificacion', 'historias', 'plan', 'destacado', 'creditos', 'contenido', 'avisos', 'cuenta']) assert.ok(enl.includes(`${SITE}/panel/${p}\n`), `enlaces: falta /panel/${p}`);
    assert.ok(enl.includes(`${SITE}/trata`) && enl.includes(`${SITE}/denunciar`));
  });

  test('ningún texto de ayuda nombra cosas internas; Mercado Pago solo en "contenido"', () => {
    for (const [tema, t] of TODOS()) {
      for (const re of PROHIBIDAS) assert.ok(!re.test(t), `${tema}: dice algo interno (${re})`);
      if (tema !== 'contenido') assert.ok(!/mercado ?pago/i.test(t), `${tema}: nombra Mercado Pago`);
      assert.ok(!/sexual|sexo|desnud/i.test(t), `${tema}: contenido sexual`);
    }
    // "próximamente": sin fechas, sin motivos, sin Mercado Pago
    assert.equal(CONTENIDO_PROXIMAMENTE, 'La venta de contenido todavía no está disponible en SexyRose: va a estar próximamente.');
    assert.ok(!/\d|mercado|pago|configur|cuenta/i.test(CONTENIDO_PROXIMAMENTE));
  });

  test('las instrucciones incluyen los temas nuevos y la derivación sigue igual', () => {
    for (const captacion of [false, true]) {
      const p = promptSistema({ siteUrl: SITE, identificado: false, idioma: 'es', captacion });
      for (const x of ['los datos de su perfil', 'videos', 'historias', 'venta de contenido (packs y pedidos personalizados)', 'Mis números', 'avisos del panel',
        'ocultar el perfil o dar de baja la cuenta', 'cómo funciona el sitio para los clientes', 'denuncias', 'idiomas del sitio', 'enlaces del sitio']) {
        assert.ok(p.includes(x), `falta "${x}"`);
      }
      assert.ok(p.includes('Para explicar cómo funciona algo usá la herramienta "ayuda"'));
      assert.ok(p.includes('Si piden hablar con una persona, si la consulta está fuera de estos temas o si la persona está enojada: usá "derivar_a_juan".'));
      assert.ok(p.includes('Expliques cómo funciona el negocio por dentro (comisiones, proveedores, costos'));
    }
  });

  test('"contenido": "próximamente" sin Mercado Pago de la plataforma; cómo empezar cuando está habilitada (lo ve el agente por la base)', async () => {
    const { rows: [k] } = await db.query("INSERT INTO asistente_conversaciones (jid, telefono) VALUES ('5491155550301@s.whatsapp.net', '5491155550301') RETURNING id");
    const ayudaContenido = async () => (await agente.asistente.herramienta(k.id, 'ayuda', { tema: 'contenido' })).resultado.texto;
    // Al arrancar, el app publicó el estado (estas pruebas no tienen cuentas de Mercado Pago)
    assert.equal(await instance.ctx.contenido.disponible(), false);
    const { rows: [fila] } = await db.query('SELECT valor FROM ajustes WHERE clave = $1', [AJUSTE_ESTADO]);
    assert.deepEqual(fila.valor, { disponible: false });
    assert.equal(await ventaContenidoDisponible(dbAgente), false);
    assert.equal(await ayudaContenido(), CONTENIDO_PROXIMAMENTE);
    // Juan carga la aplicación de Mercado Pago desde el admin: el agente (otra conexión, sin las credenciales) lo ve
    const APP = { nombre: 'Prueba asistente', clientId: '7777000011', clientSecret: 'secreto-app-asistente-123', webhookSecret: 'webhook-asistente-456' };
    let r = await admJson('POST', '/integraciones/mp', APP);
    assert.equal(r.status, 201, await r.clone().text());
    assert.equal(await ventaContenidoDisponible(dbAgente), true);
    const t = await ayudaContenido();
    assert.match(t, /Conectar Mercado Pago/);
    assert.match(t, /Agregar pack/);
    assert.ok(t.includes(`${SITE}/panel/contenido`) && t.includes(`${SITE}/panel/pedidos`));
    assert.ok(!/comisi|%/i.test(t));
    // la borra: vuelve a "próximamente"
    r = await admJson('DELETE', '/integraciones/mp/' + APP.clientId);
    assert.equal(r.status, 200);
    assert.equal(await ventaContenidoDisponible(dbAgente), false);
    assert.equal(await ayudaContenido(), CONTENIDO_PROXIMAMENTE);
    // un valor raro en la base cuenta como no disponible
    await db.query("UPDATE ajustes SET valor = '\"si\"'::jsonb WHERE clave = $1", [AJUSTE_ESTADO]);
    assert.equal(await ayudaContenido(), CONTENIDO_PROXIMAMENTE);
    await instance.ctx.contenido.publicarEstado();
    // los demás temas no dependen de esto
    assert.equal((await agente.asistente.herramienta(k.id, 'ayuda', { tema: 'perfil' })).resultado.texto, textoAyuda('perfil', SITE));
    assert.equal((await agente.asistente.herramienta(k.id, 'ayuda', { tema: 'nada' })).resultado.error, 'Tema desconocido.');
  });
});
