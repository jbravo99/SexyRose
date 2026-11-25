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
import { APERTURA_PRELANZAMIENTO, AYUDA, PRELANZAMIENTO_COMO_FUNCIONA, CONTENIDO_PROXIMAMENTE, TEMAS_AYUDA, textoAyuda } from '../lib/asistente-ayuda.js';
import { invalidarCatalogos } from '../lib/catalogos.js';
import { AJUSTE_ESTADO, ventaContenidoDisponible } from '../lib/contenido.js';
import { authEnBase, leerContenido } from '../lib/asistente-whatsapp.js';
import { telefonoOculto, validarAjustes } from '../lib/asistente-comun.js';
import { asignarCuenta, validarCuenta } from '../lib/cuentas-transferencia.js';
import { detectarIdioma, codigoEnTexto, monedaEnTexto, esCierre } from '../lib/asistente-textos.js';
import { MENSAJE_DEFAULT as INVITACION, MENSAJES_CORTOS } from '../lib/captacion.js';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('Falta DATABASE_URL.'); process.exit(1); }
const db = new pg.Pool({ connectionString: DATABASE_URL, max: 4 });
const dbAgente = new pg.Pool({ connectionString: DATABASE_URL, max: 5 });
const A = '/panel-pruebas-asistente-0123456789';
const USER = 'admin-asis'; const PASS = 'clave-de-prueba-larga-789';
const SITE = 'https://sexyrose.test';
const KEY = 'clave-maestra-de-prueba-asistente-0123456789';
const TOKEN = '999999:TEST-ASISTENTE';
const PRESENTA = 'Hola, soy el asistente virtual de SexyRose.';
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
// Cuentas para las transferencias (Créditos → Banco): deja exactamente estas listas, cargadas por el admin
async function ponerCuentas({ ars = [], usd = [] } = {}) {
  await db.query('DELETE FROM transferencia_cuentas');
  await db.query('UPDATE transferencia_rotacion SET ultimo_orden = NULL');
  const out = { ARS: [], USD: [] };
  for (const [moneda, lista] of [['ARS', ars], ['USD', usd]]) {
    for (const c of lista) {
      const r = await admJson('POST', '/asistente/cuentas', { moneda, ...c });
      assert.equal(r.status, 200, await r.clone().text());
      const e = await r.json();
      out[moneda].push(e.cuentas[moneda][e.cuentas[moneda].length - 1]);
    }
  }
  return out;
}
const PESOS = { alias: 'sexyrose.pagos', titular: 'Juan Pérez' };
const DOLARES = { alias: 'sexyrose.usd', titular: 'Juan Pérez USD' };
const saldo = async (id) => Number((await db.query('SELECT COALESCE(SUM(centavos), 0)::bigint AS s FROM creditos_movimientos WHERE cuenta_id = $1', [id])).rows[0].s);

async function limpiar() {
  await db.query('DELETE FROM asistente_conversaciones');
  await db.query('DELETE FROM asistente_salida');
  await db.query('DELETE FROM asistente_auth');
  await db.query("DELETE FROM cuentas WHERE email LIKE 'zzasis-%'");
  await db.query("DELETE FROM cuentas_eliminadas WHERE email LIKE 'zzasis-%'");
  await db.query("DELETE FROM ajustes WHERE clave IN ('asistente', 'telegram', 'cotizacion')");
  await db.query('DELETE FROM transferencia_cuentas');
  await db.query('UPDATE transferencia_rotacion SET ultimo_orden = NULL');
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
    telegramToken: TOKEN, telegramChatId: '', demora: () => 0, dormir: async () => {}, invitacionesIa: false, esperaAgrupar: 0, supervisarMs: 40, dataDir: tmpData, secretsKey: KEY, siteUrl: SITE, log: () => {},
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
    assert.match(validarCuenta({ alias: 'ab', titular: 'Juan Pérez' }).error, /6 a 20/);
    assert.match(validarCuenta({ alias: 'con espacio', titular: 'Juan' }).error, /6 a 20/);
    assert.match(validarCuenta({ alias: 'sexyrose.pagos.muy.largo.de.mas', titular: 'Juan' }).error, /6 a 20/);
    assert.match(validarCuenta({ alias: 'sexy.rose-1', titular: 'J' }).error, /titular/);
    assert.deepEqual(validarCuenta({ alias: ' sexy.rose-1 ', titular: 'Juan  Pérez' }).valor, { alias: 'sexy.rose-1', titular: 'Juan Pérez' });
    // el ajuste del asistente es solo { activo }: las claves viejas de la cuenta se ignoran
    assert.deepEqual(validarAjustes({ activo: true, alias: 'sexy.rose-1', titular: 'Juan Pérez' }).valor, { activo: true });
    assert.match(validarAjustes({ activo: 'si' }).error, /verdadero o falso/);
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
    assert.deepEqual(rows.map((r) => r.clave), ['creds', 'formato', 'session-abc-1']); // formato: marca de Baileys 7
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
    assert.deepEqual(e.cuentas, { ARS: [], USD: [] });
    assert.equal((await admJson('PUT', '/asistente/ajustes', { activo: 'si' })).status, 400);
    // sin la cabecera del panel no cambia nada
    assert.equal((await adm('/asistente/ajustes', { method: 'PUT', body: '{}', headers: { 'content-type': 'application/json', origin: BASE } })).status, 403);
    r = await admJson('PUT', '/asistente/ajustes', { activo: true });
    assert.equal(r.status, 200, await r.clone().text());
    e = await r.json();
    assert.deepEqual(e.ajustes, { activo: true });
    await ponerCuentas({ ars: [PESOS] });
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
    assert.ok(!t.startsWith('Hola, soy'), 'sin presentación (23/11/2026): ' + t);
    assert.match(t, new RegExp(`Pedido ${p1.codigo}: Trimestre Plata, 105 créditos`));
    assert.match(t, /ARS 137\.800 \(USD 95\)/);
    assert.match(t, /Alias: sexyrose\.pagos/);
    assert.match(t, /Titular: Juan Pérez/);
    assert.match(t, new RegExp(`poné ${p1.codigo} como referencia`));
    assert.match(t, /Después mandame el comprobante por acá\.$/);
    assert.equal(LLM.llamadas.length, llamadas, 'no usó la IA');
    // "escribiendo…" antes de responder
    assert.ok(SOCK.presencias.some((x) => x.t === 'composing' && x.jid === `${TEL}@s.whatsapp.net`));
    // 23/11/2026: ninguna respuesta empieza con la presentación
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
    // la cuenta a la que tenía que transferir (para revisar la cuenta correcta)
    assert.match(tg.caption, /\nAlias que se le pasó: sexyrose\.pagos · Juan Pérez\n/);
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
    // un PDF falso no se acepta (los audios pasan a Juan: ver "audios")
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

  test('chat por LID (Baileys 7): se identifica por el teléfono y se responde por el LID; el chat guardado con el LID pasa al teléfono', async () => {
    const tel = '5491155550061'; const lid = '204060801230061@lid';
    const c = await acompanante({ whatsapp: '+54 11 5555-0061', nombre: 'Lucía' });
    LLM.guion = () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Hola, ¿en qué te ayudo?' }] });
    const llegaLid = (texto, alt) => agente.wa._alLlegar({ type: 'notify', messages: [{ key: { remoteJid: lid, ...(alt ? { remoteJidAlt: alt } : {}), fromMe: false, id: 'LID' + (++nMsg) }, messageTimestamp: Math.floor(Date.now() / 1000), message: { conversation: texto } }] });
    // 1) WhatsApp no mandó el teléfono: el chat queda con el LID, sin identificar, y se le responde al LID
    await llegaLid('hola');
    const k1 = (await db.query('SELECT * FROM asistente_conversaciones WHERE jid = $1', [lid])).rows[0];
    assert.ok(k1); assert.equal(k1.telefono, null); assert.equal(k1.cuenta_id, null);
    const alLid = () => SOCK.enviados.filter((m) => m.jid === lid).length;
    assert.equal(alLid(), 1);
    // 2) llega con el teléfono: el MISMO chat pasa al teléfono, se identifica por el perfil y se sigue respondiendo al LID
    await llegaLid('¿cuánto saldo tengo?', `${tel}@s.whatsapp.net`);
    const k2 = await conv(tel);
    assert.equal(k2.id, k1.id);
    assert.equal(k2.jid, `${tel}@s.whatsapp.net`);
    assert.equal(k2.cuenta_id, c.id); assert.equal(k2.identificado_por, 'telefono');
    assert.equal(alLid(), 2);
    assert.equal(enviadosA(tel).length, 0, 'nada al teléfono: la sesión de Signal es la del LID');
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
  test('sin presentación al empezar (23/11/2026), también en inglés; markdown limpio', async () => {
    LLM.guion = () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: '**Los planes** se pagan con créditos.' }] });
    await llega('5491155550010', '¿cómo funcionan los planes?');
    const t = ultimoA('5491155550010');
    assert.equal(t, 'Los planes se pagan con créditos.');
    const ultima = LLM.llamadas[LLM.llamadas.length - 1];
    assert.equal(ultima.model, 'claude-haiku-5-5');
    assert.ok(ultima.tools.some((x) => x.name === 'derivar_a_juan'));
    assert.match(ultima.system, /NO identificado/);
    await llega('447700900123', 'Hi, how can I change my password please?');
    assert.ok(!ultimoA('447700900123').startsWith("Hi, I'm"), 'sin presentación también en inglés');
    // 23/11/2026: tampoco pasadas 24 h
    const k = await conv('5491155550010');
    await db.query("UPDATE asistente_mensajes SET creado = now() - interval '25 hours' WHERE conversacion_id = $1", [k.id]);
    await llega('5491155550010', 'otra pregunta');
    assert.ok(!ultimoA('5491155550010').startsWith(PRESENTA));
    LLM.guion = null;
  });

  test('cierre de la charla (21/11/2026): no contesta "listo", "gracias", "❤" si no le había preguntado nada; sí si le había preguntado', async () => {
    for (const t of ['listo', 'Sii dale , listo te hablo', 'Si ❤', 'Igualmente', '👍', 'Muchas gracias amor', 'Perfecto, después te escribo', 'ok']) assert.equal(esCierre(t), true, t);
    for (const t of ['Hola', 'Hola buenas tardes', 'buenas tardes', '¿Cuánto sale?', 'Si pasame los planes', 'Me súper interesa', 'Como hacemos ???', 'No', 'listo ya me registré', '']) assert.equal(esCierre(t), false, t);
    const tel = '5491155550033';
    LLM.guion = () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Perfecto. Cuando quieras, escribime por acá.' }] });
    await llega(tel, 'quería saber cómo me registro');
    const n = enviadosA(tel).length; const ll = LLM.llamadas.length;
    for (const t of ['listo', 'Sii dale , listo te hablo', 'Si ❤', 'Igualmente']) await llega(tel, t);
    assert.equal(enviadosA(tel).length, n, 'no contesta las despedidas');
    assert.equal(LLM.llamadas.length, ll, 'ni llama a la IA');
    // Si el asistente había preguntado algo, "dale" es la respuesta
    LLM.guion = () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Hay 4 planes, Bronce es gratis. ¿Te paso los precios?' }] });
    await llega(tel, '¿y los planes?');
    const n2 = enviadosA(tel).length;
    LLM.guion = () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Plata sale USD 25 por mes.' }] });
    await llega(tel, 'dale');
    assert.equal(enviadosA(tel).length, n2 + 1);
    LLM.guion = null;
  });

  test('respuestas breves e invitación corta (21/11/2026)', async () => {
    const p = promptSistema({ siteUrl: SITE, identificado: false, idioma: 'es' });
    assert.ok(p.includes('contestá solo eso en 2 o 3 renglones'));
    assert.ok(p.includes('de los textos de ayuda tomá la parte que responde la pregunta'));
    // 23/11/2026: completo cuando lo piden, con lista "• "; sin hacerla responder "sí" varias veces; verificación después
    assert.ok(p.includes('dáselo completo en UN mensaje') && p.includes('"• "'));
    assert.ok(p.includes('Nunca la hagas responder "sí" varias veces'));
    assert.ok(p.includes('No menciones la verificación de identidad ni documentos'), 'sin documentos salvo que pregunte (25/11/2026)');
    assert.doesNotMatch(AYUDA.registro + AYUDA.publicar, /documento|selfie|7 días/, 'registro y publicar sin documentos ni plazo');
    assert.match(AYUDA.verificacion, /No hace falta para publicar tu perfil/);
    assert.doesNotMatch(AYUDA.verificacion, /7 días|se pausa/);
    const pcap = promptSistema({ siteUrl: SITE, identificado: false, idioma: 'es', captacion: true });
    assert.doesNotMatch(pcap.slice(pcap.indexOf('Cualquier respuesta a la invitación'), pcap.indexOf('Los planes pagos')), /verific|documento/);
    const pc = promptSistema({ siteUrl: SITE, identificado: false, idioma: 'es', captacion: true });
    assert.ok(pc.includes('NO le preguntes "¿en qué te puedo ayudar?"') && pc.includes(`Cerrá con el link de registro`));
    assert.ok(pc.includes('Los planes pagos y Destacado, solo si los pregunta.'));
    assert.equal(MENSAJES_CORTOS[0], INVITACION);
    assert.equal(MENSAJES_CORTOS.length, 3);
    for (const m of MENSAJES_CORTOS) {
      assert.ok(m.length <= 250, `corta (${m.length})`);
      assert.ok(m.split('\n\n').length >= 2, 'en párrafos separados (23/11/2026)');
      assert.ok(m.endsWith('?'), 'termina en pregunta');
      // 22/11/2026: sin link en el primer mensaje (el asistente lo pasa cuando responde)
      assert.ok(m.includes('SexyRose') && !/sexyrose\.net/i.test(m) && m.includes('*gratis*') && /diciembre/.test(m));
      assert.ok(!/no te (escribo|escribimos) más/i.test(m), 'sin línea de baja');
    }
  });

  test('"¿sos un bot?": dice que es una IA y ofrece pasar con una persona', async () => {
    const llamadas = LLM.llamadas.length;
    await llega('5491155550011', '¿sos un bot?');
    assert.match(ultimoA('5491155550011'), /Soy un asistente de IA, no una persona\. Si preferís hablar con alguien del equipo, decime\./);
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

  test('"Agente responda último mensaje" (22/11/2026): retoma un chat que contestó Juan, aunque sea una despedida', async () => {
    const tel = '5491155550016';
    await llega(tel, 'hola');
    const k = await conv(tel);
    await llega(tel, 'Te dejo el link por si te interesa: sexyrose.net', { fromMe: true });
    let antes = enviadosA(tel).length;
    await llega(tel, 'Gracias si podés dar info');
    assert.equal(enviadosA(tel).length, antes, 'en silencio: no contesta solo');
    const llamadas = LLM.llamadas.length;
    let r = await admJson('POST', `/asistente/conversaciones/${k.id}/responder`, {});
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.conversacion.estado, 'bot');
    assert.equal(j.conversacion.silenciadoHasta, null);
    assert.ok(await hasta(() => enviadosA(tel).length === antes + 1), 'contesta el agente');
    // La IA leyó lo que escribió Juan
    const ll = LLM.llamadas.slice(llamadas);
    assert.ok(ll.some((x) => JSON.stringify(x.messages || x.mensajes || x).includes('(Escribió una persona del equipo) Te dejo el link')));
    // Ya contestado: el último mensaje es nuestro
    r = await admJson('POST', `/asistente/conversaciones/${k.id}/responder`, {});
    assert.equal(r.status, 409);
    assert.match((await r.json()).error, /es nuestro/);
    // Sigue el asistente con el chat
    antes = enviadosA(tel).length;
    await llega(tel, '¿cuánto sale el plan Plata?');
    assert.equal(enviadosA(tel).length, antes + 1);
    // Dos toques seguidos: responde una sola vez
    await llega(tel, 'Hola, soy Juan', { fromMe: true });
    await llega(tel, 'ok, ¿y el Oro?');
    antes = enviadosA(tel).length;
    await Promise.all([admJson('POST', `/asistente/conversaciones/${k.id}/responder`, {}), admJson('POST', `/asistente/conversaciones/${k.id}/responder`, {})]);
    assert.ok(await hasta(() => enviadosA(tel).length === antes + 1));
    await new Promise((res) => setTimeout(res, 400));
    assert.equal(enviadosA(tel).length, antes + 1, 'una sola respuesta');
    assert.equal((await admJson('POST', '/asistente/conversaciones/00000000-0000-0000-0000-000000000000/responder', {})).status, 404);
  });

  test('audios (23/11/2026): el chat pasa a Juan sin contestar; Juan escribe lo que dijo y el agente responde con eso', async () => {
    const tel = '5491155550019';
    await llega(tel, 'hola');
    const antes = enviadosA(tel).length; const tg0 = TG.enviados.length;
    await llega(tel, { audioMessage: { mimetype: 'audio/ogg' } });
    assert.equal(enviadosA(tel).length, antes, 'no le contesta nada');
    let k = await conv(tel);
    assert.equal(k.estado, 'humano');
    assert.match(k.motivo_humano, /audio/);
    assert.ok(await hasta(() => TG.enviados.slice(tg0).find((m) => /llegó un audio/.test(m.text))), 'aviso por Telegram');
    // Un texto después del audio tampoco se contesta (lo atiende Juan)
    await llega(tel, '¿me escuchaste?');
    assert.equal(enviadosA(tel).length, antes);
    // En el admin: Juan escribe lo que dijo debajo del audio
    let d = await (await adm('/asistente/conversaciones/' + k.id)).json();
    const audio = d.mensajes.find((m) => m.tipo === 'audio');
    assert.ok(audio && !audio.texto);
    const n0 = LLM.llamadas.length;
    LLM.guion = () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'El plan Bronce es gratis.' }] });
    let r = await admJson('POST', `/asistente/conversaciones/${k.id}/mensajes/${audio.id}/audio`, { texto: 'Quiero saber cuánto cuesta publicar' });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.responde, true);
    assert.equal(j.conversacion.estado, 'bot');
    assert.ok(await hasta(() => enviadosA(tel).length === antes + 1), 'responde el agente');
    assert.equal(ultimoA(tel), 'El plan Bronce es gratis.');
    assert.match(JSON.stringify(LLM.llamadas[n0].messages), /Mandó un audio; lo que dijo, escrito por el equipo:\) Quiero saber cuánto cuesta publicar/);
    LLM.guion = null;
    d = await (await adm('/asistente/conversaciones/' + k.id)).json();
    assert.equal(d.mensajes.find((m) => m.id === audio.id).texto, 'Quiero saber cuánto cuesta publicar');
    // Validaciones
    assert.equal((await admJson('POST', `/asistente/conversaciones/${k.id}/mensajes/${audio.id}/audio`, { texto: ' ' })).status, 400);
    const txt = d.mensajes.find((m) => m.tipo === 'texto' && m.dir === 'in');
    assert.equal((await admJson('POST', `/asistente/conversaciones/${k.id}/mensajes/${txt.id}/audio`, { texto: 'x' })).status, 404, 'solo audios');
    // Ya respondido: se guarda igual pero no pide otra respuesta
    r = await (await admJson('POST', `/asistente/conversaciones/${k.id}/mensajes/${audio.id}/audio`, { texto: 'Corrijo: cuánto cuesta' })).json();
    assert.equal(r.responde, false);
    assert.match(r.aviso, /es nuestro/);
  });

  test('respuesta vacía de la IA (23/11/2026): un reintento; si vuelve vacía, pasa a una persona con aviso', async () => {
    const tel = '5491155550020';
    let n = 0;
    LLM.guion = () => { n++; return n === 1 ? { stop_reason: 'max_tokens', content: [{ type: 'thinking', thinking: '...' }] } : { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Segunda vez sí.' }] }; };
    await llega(tel, '¿qué es el Destacado?');
    assert.equal(ultimoA(tel), 'Segunda vez sí.');
    LLM.guion = () => ({ stop_reason: 'max_tokens', content: [{ type: 'thinking', thinking: '...' }] });
    const tg0 = TG.enviados.length;
    await llega(tel, '¿y cuánto sale?');
    assert.match(ultimoA(tel), /Te va a responder una persona del equipo/);
    assert.ok(await hasta(() => TG.enviados.slice(tg0).find((m) => /respuesta vacía/.test(m.text))));
    LLM.guion = null;
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

  test('mensajes seguidos (23/11/2026): espera y contesta una sola vez leyendo todos; un "gracias" seguido no pierde la respuesta', async () => {
    const enviados = []; const llamadas = [];
    const llmFalso = { disponible: true, conversar: async ({ mensajes }) => { llamadas.push(mensajes); return { texto: 'Te cuento todo.' }; } };
    const ag = createAsistente({
      pool: db, creditos: cred(), planes: instance.ctx.planes, privado: instance.ctx.privado, telegram: agente.telegram,
      llm: llmFalso, siteUrl: SITE, esperaAgrupar: 150, enviar: async (jid, t) => { enviados.push({ jid, t }); return 'G' + enviados.length; },
    });
    const jid = '5491155550018@s.whatsapp.net';
    const r1 = await ag.recibir({ jid, telefono: '5491155550018', waId: 'g1', tipo: 'texto', texto: 'Hola buenas noches si' });
    assert.deepEqual(r1, { ia: 'en espera' });
    await new Promise((r) => setTimeout(r, 60));
    await ag.recibir({ jid, telefono: '5491155550018', waId: 'g2', tipo: 'texto', texto: 'Contame' });
    assert.equal(enviados.length, 0, 'todavía esperando');
    await ag.esperar();
    assert.equal(llamadas.length, 1, 'una sola vez');
    assert.equal(enviados.length, 1);
    const ult = llamadas[0][llamadas[0].length - 1];
    assert.equal(ult.role, 'user');
    assert.ok(ult.content.includes('Hola buenas noches si') && ult.content.includes('Contame'), 'lee los dos');
    // Pregunta y enseguida "gracias" (que solo no se contesta): la pregunta se contesta igual, una vez
    await ag.recibir({ jid, telefono: '5491155550018', waId: 'g3', tipo: 'texto', texto: '¿cuánto sale el plan Plata?' });
    await ag.recibir({ jid, telefono: '5491155550018', waId: 'g4', tipo: 'texto', texto: 'gracias' });
    await ag.esperar();
    assert.equal(llamadas.length, 2);
    assert.equal(enviados.length, 2);
    // Si en la espera escribe Juan desde el teléfono, el bot no contesta
    await ag.recibir({ jid, telefono: '5491155550018', waId: 'g5', tipo: 'texto', texto: '¿y el Oro?' });
    await ag.recibir({ jid, telefono: '5491155550018', waId: 'g6', tipo: 'texto', texto: 'Te contesto yo', deMi: true });
    await ag.esperar();
    assert.equal(llamadas.length, 2, 'Juan respondió: la IA no');
  });

  test('sin ANTHROPIC_API_KEY: lo libre va a una persona, lo automático funciona', async () => {
    const enviados = [];
    const sinClave = createAsistente({
      pool: db, creditos: cred(), planes: instance.ctx.planes, privado: instance.ctx.privado, telegram: agente.telegram,
      llm: createLlm({ apiKey: '' }), siteUrl: SITE, esperaAgrupar: 0, enviar: async (jid, t) => { enviados.push({ jid, t }); return 'X' + enviados.length; },
    });
    const jid = '5491155550017@s.whatsapp.net';
    await sinClave.recibir({ jid, telefono: '5491155550017', waId: 'k1', tipo: 'texto', texto: '¿qué es el Destacado?' });
    assert.equal(enviados.at(-1).t, 'Te va a responder una persona del equipo.');
    const g = await acompanante({ nombre: 'Gala' });
    const p = await pedido(g.id, 'inicial');
    await sinClave.recibir({ jid, telefono: '5491155550017', waId: 'k2', tipo: 'texto', texto: `Pedido ${p.codigo}` });
    assert.match(enviados.at(-1).t, /ARS 14\.500 \(USD 10\)/);
  });
});

describe('cuenta en dólares (16/11/2026)', () => {
  const ponerUsd = () => ponerCuentas({ ars: [PESOS], usd: [DOLARES] });
  const sinUsd = () => ponerCuentas({ ars: [PESOS] });
  const PREGUNTA = /¿Vas a transferir en pesos o en dólares\?$/;

  test('detección de la moneda en la respuesta (sin importar mayúsculas ni tildes)', () => {
    for (const t of ['pesos', 'En PESOS', 'en $', 'ARS', 'peso', 'te paso en pesos porfa']) assert.equal(monedaEnTexto(t), 'ARS', t);
    for (const t of ['dólares', 'DOLARES', 'en dolar', 'USD', 'u$s', 'US$ porfa', 'mejor en dólares', 'in dollars']) assert.equal(monedaEnTexto(t), 'USD', t);
    for (const t of ['pesos o dólares?', 'no tengo dólares', 'no, en pesos no']) assert.equal(monedaEnTexto(t), 'ambas', t);
    for (const t of ['hola', 'ya te transferí', 'dolarizado']) assert.equal(monedaEnTexto(t), null, t);
  });

  test('cuenta en dólares: misma validación en el admin; sin ninguna activa en dólares no pregunta la moneda', async () => {
    await sinUsd();
    const mal = async (b) => { const r = await admJson('POST', '/asistente/cuentas', { moneda: 'USD', ...b }); assert.equal(r.status, 400); return (await r.json()).error; };
    assert.match(await mal({ alias: 'con espacio', titular: 'Juan' }), /alias tiene que tener de 6 a 20/);
    assert.match(await mal({ alias: 'sexyrose.usd', titular: 'J' }), /titular/);
    assert.match(await mal({ alias: 'sexyrose.usd' }), /Completá el alias y el nombre del titular/);
    // un PUT viejo con alias/titular no toca las listas
    let r = await admJson('PUT', '/asistente/ajustes', { activo: true, alias: 'otro.alias', titular: 'Otro', aliasUsd: 'otro.usd', titularUsd: 'Otro' });
    let e = await r.json();
    assert.deepEqual(e.ajustes, { activo: true });
    assert.deepEqual(e.cuentas.ARS.map((c) => c.alias), ['sexyrose.pagos']);
    assert.deepEqual(e.cuentas.USD, []);
    // sin cuenta en dólares no pregunta nada: pesos directo, como siempre
    const tel = '5491155550030';
    const a = await acompanante({ nombre: 'Ana' });
    const p = await pedido(a.id);
    await llega(tel, p.mensaje);
    assert.match(ultimoA(tel), /ARS 137\.800 \(USD 95\)/);
    assert.doesNotMatch(ultimoA(tel), /dólares\?/);
    assert.equal((await estadoPedido(p.id)).moneda_asistente, null);
    // una cuenta en dólares pausada es como no tenerla
    const c = await ponerCuentas({ ars: [PESOS], usd: [{ ...DOLARES, activo: false }] });
    assert.equal(c.USD[0].activo, false);
    const p2 = await pedido(a.id, 'inicial');
    await llega(tel, p2.codigo);
    assert.match(ultimoA(tel), /ARS 14\.500 \(USD 10\)/);
    r = await ponerUsd();
    e = await (await adm('/asistente')).json();
    assert.deepEqual(e.cuentas.USD.map((x) => [x.alias, x.titular, x.activo]), [['sexyrose.usd', 'Juan Pérez USD', true]]);
  });

  test('con cuenta en dólares: pregunta la moneda, toma "en dólares" y pasa los datos en USD; Telegram muestra la moneda', async () => {
    const tel = '5491155550031';
    const a = await acompanante({ nombre: 'Belén' });
    const p = await pedido(a.id);
    const llamadas = LLM.llamadas.length;
    await llega(tel, p.mensaje);
    let t = ultimoA(tel);
    assert.ok(t.startsWith('Pedido '), t);
    assert.match(t, new RegExp(`Pedido ${p.codigo}: Trimestre Plata, 105 créditos\\.\\n¿Vas a transferir en pesos o en dólares\\?$`));
    assert.doesNotMatch(t, /Alias|ARS/);
    assert.equal((await conv(tel)).pago_esperando_moneda, true);
    await llega(tel, 'En DÓLARES');
    t = ultimoA(tel);
    assert.match(t, new RegExp(`^Pedido ${p.codigo}: Trimestre Plata, 105 créditos\\.\\nMonto a transferir: USD 95\\.\\nAlias: sexyrose\\.usd\\nTitular: Juan Pérez USD\\n`));
    assert.match(t, new RegExp(`Fijate que el titular sea ese y, si podés, poné ${p.codigo} como referencia\\.`));
    assert.match(t, /Después mandame el comprobante por acá\.$/);
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
    await sinUsd();
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

// Varias cuentas para las transferencias con rotación (18/11/2026, decisión de Juan: "Quiero que el bot vaya rotando
// entre los diferentes alias que agregue"). Una cuenta por pedido, por turno entre las activas de esa moneda; el pedido
// se queda con la suya. Ver lib/cuentas-transferencia.js.
describe('varias cuentas con rotación (18/11/2026)', () => {
  const A = { alias: 'cuenta.uno', titular: 'Juan Uno' };
  const B = { alias: 'cuenta.dos', titular: 'Juan Dos' };
  const C = { alias: 'cuenta.tres', titular: 'Juan Tres' };
  const U1 = { alias: 'dolar.uno', titular: 'Juan Dolar Uno' };
  const U2 = { alias: 'dolar.dos', titular: 'Juan Dolar Dos' };
  const aliasEn = (t) => (/Alias: (\S+)/.exec(t) || [])[1] || null;
  const asignado = async (pedidoId, moneda = 'ARS') => (await db.query('SELECT * FROM pedidos_transferencia WHERE pedido_id = $1 AND moneda = $2', [pedidoId, moneda])).rows[0] || null;
  let telN = 100;
  // Una acompañante nueva por pedido (máximo 3 pedidos abiertos por cuenta) que manda el código desde su chat
  async function pedidoPorChat(packId = 'inicial') {
    const tel = '54911555' + String(50000 + telN++);
    const a = await acompanante({ nombre: 'Rota' + telN });
    const p = await pedido(a.id, packId);
    await llega(tel, p.codigo);
    return { tel, a, p, texto: ultimoA(tel) };
  }

  test('migración: el alias de pesos y el de dólares del ajuste viejo pasan a ser la primera cuenta de cada lista', async () => {
    const sql = await fs.readFile(new URL('../db/290-alias-rotacion.sql', import.meta.url), 'utf8');
    const antes = (await db.query("SELECT valor FROM ajustes WHERE clave = 'asistente'")).rows[0].valor;
    // pedido pendiente que ya pasó por el chat (recibió el alias viejo) y otro que no
    const a = await acompanante({ nombre: 'Migra' });
    const p1 = await pedido(a.id, 'inicial'); const p2 = await pedido(a.id, 'mes-plata');
    const k = (await db.query("INSERT INTO asistente_conversaciones (jid) VALUES ('5491100009999@s.whatsapp.net') RETURNING id")).rows[0];
    await db.query('INSERT INTO asistente_conv_pedidos (conversacion_id, pedido_id) VALUES ($1, $2)', [k.id, p1.id]);
    // base como antes de la 290: sin listas ni turno, el ajuste con { alias, titular, aliasUsd, titularUsd }
    await db.query('DELETE FROM transferencia_cuentas'); await db.query('DELETE FROM transferencia_rotacion');
    await db.query("UPDATE ajustes SET valor = $1 WHERE clave = 'asistente'",
      [JSON.stringify({ activo: true, alias: 'viejo.pesos', titular: 'Juan Pérez', aliasUsd: 'viejo.usd', titularUsd: 'Juan Pérez USD' })]);
    await db.query(sql);
    let e = await (await adm('/asistente')).json();
    assert.deepEqual(e.cuentas.ARS.map((c) => [c.alias, c.titular, c.activo, c.orden]), [['viejo.pesos', 'Juan Pérez', true, 1]]);
    assert.deepEqual(e.cuentas.USD.map((c) => [c.alias, c.titular, c.activo, c.orden]), [['viejo.usd', 'Juan Pérez USD', true, 1]]);
    assert.deepEqual(e.ajustes, { activo: true });
    const s1 = await asignado(p1.id);
    assert.equal(s1.alias, 'viejo.pesos'); assert.equal(s1.cuenta_id, e.cuentas.ARS[0].id);
    assert.equal(await asignado(p2.id), null, 'sin pasar por el chat no tiene cuenta todavía');
    // se vuelve a aplicar en cada arranque: no duplica ni revive cuentas borradas
    await db.query(sql);
    await db.query('DELETE FROM transferencia_cuentas');
    await db.query(sql);
    e = await (await adm('/asistente')).json();
    assert.deepEqual(e.cuentas, { ARS: [], USD: [] });
    // solo pesos en el ajuste viejo → solo la lista en pesos
    await db.query('DELETE FROM transferencia_rotacion');
    await db.query("UPDATE ajustes SET valor = $1 WHERE clave = 'asistente'", [JSON.stringify({ activo: true, alias: 'viejo.pesos', titular: 'Juan Pérez' })]);
    await db.query(sql);
    e = await (await adm('/asistente')).json();
    assert.deepEqual([e.cuentas.ARS.length, e.cuentas.USD.length], [1, 0]);
    await db.query("UPDATE ajustes SET valor = $1 WHERE clave = 'asistente'", [JSON.stringify(antes)]);
  });

  test('por turno entre las activas: cada pedido nuevo recibe la siguiente; una pausada se saltea', async () => {
    const c = await ponerCuentas({ ars: [A, B, C] });
    const vistos = [];
    for (let i = 0; i < 4; i++) {
      const x = await pedidoPorChat();
      assert.match(x.texto, /Titular: Juan (Uno|Dos|Tres)\n/);
      vistos.push(aliasEn(x.texto));
      assert.equal((await asignado(x.p.id)).alias, aliasEn(x.texto));
    }
    assert.deepEqual(vistos, ['cuenta.uno', 'cuenta.dos', 'cuenta.tres', 'cuenta.uno']);
    // el admin muestra a cuál le toca y cuántos pedidos recibió cada una
    let e = await (await adm('/asistente')).json();
    assert.deepEqual(e.cuentas.ARS.map((x) => [x.alias, x.pedidos, x.siguiente]), [['cuenta.uno', 2, false], ['cuenta.dos', 1, true], ['cuenta.tres', 1, false]]);
    // pausar la dos: se saltea
    let r = await admJson('PUT', '/asistente/cuentas/' + c.ARS[1].id, { activo: false });
    assert.equal(r.status, 200);
    e = await r.json();
    assert.equal(e.cuentas.ARS[1].activo, false);
    assert.deepEqual(e.cuentas.ARS.map((x) => x.siguiente), [false, false, true]);
    const sig = [];
    for (let i = 0; i < 3; i++) sig.push(aliasEn((await pedidoPorChat()).texto));
    assert.deepEqual(sig, ['cuenta.tres', 'cuenta.uno', 'cuenta.tres']);
    // reanudarla: vuelve a entrar en su lugar
    await admJson('PUT', '/asistente/cuentas/' + c.ARS[1].id, { activo: true });
    assert.equal(aliasEn((await pedidoPorChat()).texto), 'cuenta.uno');
    assert.equal(aliasEn((await pedidoPorChat()).texto), 'cuenta.dos');
    // la acompañante no ve nada de la rotación: solo el alias y el titular de su pedido
    const x = await pedidoPorChat();
    assert.doesNotMatch(x.texto, /cuenta\.(uno|dos).*cuenta\.|rota|turno|otra cuenta|varias/i);
  });

  test('el mismo pedido conserva su cuenta: al pedir de nuevo, al pausarla, al editarla y al borrarla', async () => {
    const c = await ponerCuentas({ ars: [A, B] });
    const x = await pedidoPorChat('mes-plata');
    assert.equal(aliasEn(x.texto), 'cuenta.uno');
    await llega(x.tel, x.p.codigo);
    assert.equal(aliasEn(ultimoA(x.tel)), 'cuenta.uno', 'pedir los datos de nuevo');
    const k = await conv(x.tel);
    const r1 = await agente.asistente.herramienta(k.id, 'datos_transferencia', { codigo: x.p.codigo });
    assert.equal(r1.resultado.enviado, true);
    assert.equal(aliasEn(ultimoA(x.tel)), 'cuenta.uno', 'por la herramienta de la IA');
    // otro pedido en el medio se lleva la dos; este sigue con la uno
    assert.equal(aliasEn((await pedidoPorChat()).texto), 'cuenta.dos');
    await admJson('PUT', '/asistente/cuentas/' + c.ARS[0].id, { activo: false });
    await llega(x.tel, x.p.codigo);
    assert.equal(aliasEn(ultimoA(x.tel)), 'cuenta.uno', 'pausada');
    await admJson('PUT', '/asistente/cuentas/' + c.ARS[0].id, { alias: 'cuenta.nueva', titular: 'Otro Nombre' });
    await llega(x.tel, x.p.codigo);
    assert.match(ultimoA(x.tel), /Alias: cuenta\.uno\nTitular: Juan Uno\n/, 'editada: el pedido guarda la copia de ese momento');
    const r = await admJson('DELETE', '/asistente/cuentas/' + c.ARS[0].id);
    assert.equal(r.status, 200);
    assert.deepEqual((await r.json()).cuentas.ARS.map((y) => y.alias), ['cuenta.dos']);
    await llega(x.tel, x.p.codigo);
    assert.match(ultimoA(x.tel), /Alias: cuenta\.uno\nTitular: Juan Uno\n/, 'borrada');
    // comprobante → Telegram con la cuenta de ese pedido
    await llegaFoto(x.tel);
    const tg = await hasta(() => TG.archivos.find((y) => y.caption.includes(x.p.codigo)));
    assert.match(tg.caption, /\nAlias que se le pasó: cuenta\.uno · Juan Uno\n/);
    // admin: lista de pedidos y chat
    const l = await (await adm('/pedidos-creditos?q=' + x.p.codigo)).json();
    const it = l.items.find((y) => y.id === x.p.id);
    assert.deepEqual(it.cuentasTransferencia.map((y) => [y.moneda, y.alias, y.titular, y.enUso]), [['ARS', 'cuenta.uno', 'Juan Uno', true]]);
    assert.equal(it.cuentasTransferencia[0].cuentaId, c.ARS[0].id);
    const d = await (await adm('/asistente/conversaciones/' + k.id)).json();
    assert.deepEqual(d.pedidos.find((y) => y.codigo === x.p.codigo).cuenta, { moneda: 'ARS', alias: 'cuenta.uno', titular: 'Juan Uno' });
    // un pedido que nunca recibió los datos no muestra ninguna
    const sin = await pedido(x.a.id, 'inicial');
    const l2 = await (await adm('/pedidos-creditos?q=' + sin.codigo)).json();
    assert.deepEqual(l2.items.find((y) => y.id === sin.id).cuentasTransferencia, []);
  });

  test('pedidos a la vez reciben cuentas seguidas; el mismo pedido pedido a la vez recibe una sola', async () => {
    await ponerCuentas({ ars: [A, B, C] });
    const peds = [];
    for (let i = 0; i < 3; i++) {
      const a = await acompanante({ nombre: 'Conc' + i });
      for (let j = 0; j < 3; j++) peds.push(await pedido(a.id, 'inicial'));
    }
    const pools = [db, dbAgente];
    const res = await Promise.all(peds.map((p, i) => asignarCuenta(pools[i % 2], p.id, 'ARS')));
    const cuenta = {};
    for (const r of res) cuenta[r.alias] = (cuenta[r.alias] || 0) + 1;
    assert.deepEqual(cuenta, { 'cuenta.uno': 3, 'cuenta.dos': 3, 'cuenta.tres': 3 });
    // una fila por pedido; el turno quedó después de la última (9 vueltas exactas → le toca a la primera)
    assert.equal((await db.query('SELECT count(*)::int AS n FROM pedidos_transferencia WHERE pedido_id = ANY($1::uuid[])', [peds.map((p) => p.id)])).rows[0].n, 9);
    // el mismo pedido, seis veces a la vez: una sola fila y el turno avanza una vez
    const a = await acompanante({ nombre: 'Misma' });
    const p = await pedido(a.id, 'inicial');
    const mismas = await Promise.all(Array.from({ length: 6 }, (_, i) => asignarCuenta(pools[i % 2], p.id, 'ARS')));
    assert.equal(new Set(mismas.map((m) => m.cuentaId)).size, 1);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM pedidos_transferencia WHERE pedido_id = $1', [p.id])).rows[0].n, 1);
    assert.equal(mismas[0].alias, 'cuenta.uno');
    const p2 = await pedido(a.id, 'inicial');
    assert.equal((await asignarCuenta(db, p2.id, 'ARS')).alias, 'cuenta.dos');
  });

  test('cambio de moneda: una cuenta de cada lista, una sola vez; Telegram y el admin muestran las dos', async () => {
    await ponerCuentas({ ars: [A, B], usd: [U1, U2] });
    const x = await pedidoPorChat('trimestre-plata');
    assert.match(x.texto, /¿Vas a transferir en pesos o en dólares\?$/);
    assert.equal(await asignado(x.p.id), null, 'preguntar la moneda no asigna nada');
    await llega(x.tel, 'pesos');
    assert.match(ultimoA(x.tel), /Alias: cuenta\.uno\nTitular: Juan Uno\n/);
    await llega(x.tel, 'mejor en dólares');
    assert.match(ultimoA(x.tel), /Monto a transferir: USD 95\.\nAlias: dolar\.uno\nTitular: Juan Dolar Uno\n/);
    await llega(x.tel, 'en $');
    assert.match(ultimoA(x.tel), /Alias: cuenta\.uno\n/, 'vuelve a pesos: la misma de antes');
    await llega(x.tel, 'dólares');
    assert.match(ultimoA(x.tel), /Alias: dolar\.uno\n/, 'vuelve a dólares: la misma de antes');
    // otro pedido sigue el turno de cada lista
    const y = await pedidoPorChat();
    await llega(y.tel, 'dolares');
    assert.match(ultimoA(y.tel), /Alias: dolar\.dos\n/);
    // con todas las de dólares pausadas, este pedido conserva la suya (ya eligió dólares)
    const e0 = await (await adm('/asistente')).json();
    for (const cu of e0.cuentas.USD) await admJson('PUT', '/asistente/cuentas/' + cu.id, { activo: false });
    await llega(x.tel, x.p.codigo);
    assert.match(ultimoA(x.tel), /Alias: dolar\.uno\n/);
    const k = await conv(x.tel);
    assert.equal((await agente.asistente.herramienta(k.id, 'datos_transferencia', { codigo: x.p.codigo, moneda: 'USD' })).resultado.enviado, true);
    // pedidos nuevos ya no preguntan la moneda
    const z = await pedidoPorChat();
    assert.match(z.texto, /Alias: cuenta\.(uno|dos)\n/);
    assert.doesNotMatch(z.texto, /dólares\?/);
    // comprobante: Telegram muestra la de dólares (la elegida) y la de pesos que se le pasó antes
    await llegaFoto(x.tel);
    const tg = await hasta(() => TG.archivos.find((t) => t.caption.includes(x.p.codigo)));
    assert.match(tg.caption, /\nAlias que se le pasó: dolar\.uno · Juan Dolar Uno \(antes, en pesos: cuenta\.uno · Juan Uno\)\n/);
    const l = await (await adm('/pedidos-creditos?q=' + x.p.codigo)).json();
    assert.deepEqual(l.items.find((t) => t.id === x.p.id).cuentasTransferencia.map((t) => [t.moneda, t.alias, t.enUso]), [['USD', 'dolar.uno', true], ['ARS', 'cuenta.uno', false]]);
    for (const cu of e0.cuentas.USD) await admJson('PUT', '/asistente/cuentas/' + cu.id, { activo: true });
  });

  test('sin ninguna cuenta activa en pesos: "En un rato te paso los datos" y aviso a Juan; no se asigna nada', async () => {
    const c = await ponerCuentas({ ars: [A, B] });
    for (const cu of c.ARS) await admJson('PUT', '/asistente/cuentas/' + cu.id, { activo: false });
    const n = TG.enviados.length;
    const x = await pedidoPorChat();
    assert.match(x.texto, /En un rato te paso el monto en pesos y los datos para transferir\.$/);
    assert.doesNotMatch(x.texto, /Alias/);
    assert.equal(await asignado(x.p.id), null);
    const av = await hasta(() => TG.enviados.slice(n).find((t) => t.text.includes(x.p.codigo)));
    assert.match(av.text, /no pude pasar los datos para transferir del pedido/);
    assert.match(av.text, /No hay ninguna cuenta activa en pesos \(Admin → Créditos → Banco\)\. Pasale el monto y los datos vos\./);
    // al reanudar una, el mismo pedido recibe los datos
    await admJson('PUT', '/asistente/cuentas/' + c.ARS[1].id, { activo: true });
    await llega(x.tel, x.p.codigo);
    assert.equal(aliasEn(ultimoA(x.tel)), 'cuenta.dos');
    // sin ninguna cuenta cargada, lo mismo
    await ponerCuentas({});
    const y = await pedidoPorChat();
    assert.match(y.texto, /En un rato te paso/);
  });

  test('admin: agregar, validar, editar, pausar, ordenar y borrar', async () => {
    await ponerCuentas({});
    const post = (b) => admJson('POST', '/asistente/cuentas', b);
    const err = async (r, re) => { assert.equal(r.status, 400); assert.match((await r.json()).error, re); };
    await err(await post({ alias: 'cuenta.uno', titular: 'Juan Uno' }), /Elegí la moneda/);
    await err(await post({ moneda: 'EUR', alias: 'cuenta.uno', titular: 'Juan Uno' }), /Elegí la moneda/);
    await err(await post({ moneda: 'ARS', alias: 'ab', titular: 'Juan Uno' }), /6 a 20/);
    await err(await post({ moneda: 'ARS', alias: 'cuenta.uno', titular: 'J' }), /entre 3 y 80/);
    await err(await post({ moneda: 'ARS', alias: 'cuenta.uno', titular: 'Juan <b>' }), /solo puede tener letras/);
    await err(await post({ moneda: 'ARS', alias: '', titular: '' }), /Completá el alias/);
    // sin la cabecera del panel, nada
    assert.equal((await adm('/asistente/cuentas', { method: 'POST', body: JSON.stringify({ moneda: 'ARS', ...A }), headers: { 'content-type': 'application/json', origin: BASE } })).status, 403);
    let e = await (await post({ moneda: 'ARS', ...A })).json();
    e = await (await post({ moneda: 'ARS', ...B })).json();
    e = await (await post({ moneda: 'ARS', ...C, activo: false })).json();
    assert.deepEqual(e.cuentas.ARS.map((x) => [x.alias, x.activo, x.orden]), [['cuenta.uno', true, 1], ['cuenta.dos', true, 2], ['cuenta.tres', false, 3]]);
    // el mismo alias no se repite en la misma lista (sin importar mayúsculas); en la otra moneda sí se puede
    await err(await post({ moneda: 'ARS', alias: 'CUENTA.UNO', titular: 'Otro' }), /ya está en la lista de pesos/);
    assert.equal((await post({ moneda: 'USD', ...A })).status, 200);
    const [uno, dos, tres] = e.cuentas.ARS;
    // editar
    await err(await admJson('PUT', '/asistente/cuentas/' + uno.id, { alias: 'x y' }), /6 a 20/);
    await err(await admJson('PUT', '/asistente/cuentas/' + uno.id, { alias: 'cuenta.dos' }), /ya está en la lista de pesos/);
    await err(await admJson('PUT', '/asistente/cuentas/' + uno.id, { activo: 'no' }), /verdadero o falso/);
    await err(await admJson('PUT', '/asistente/cuentas/' + uno.id, {}), /nada para cambiar/);
    e = await (await admJson('PUT', '/asistente/cuentas/' + uno.id, { alias: 'cuenta.uno.b', titular: 'Juan Uno Bis' })).json();
    assert.deepEqual([e.cuentas.ARS[0].alias, e.cuentas.ARS[0].titular, e.cuentas.ARS[0].moneda], ['cuenta.uno.b', 'Juan Uno Bis', 'ARS']);
    e = await (await admJson('PUT', '/asistente/cuentas/' + tres.id, { activo: true })).json();
    assert.equal(e.cuentas.ARS[2].activo, true);
    // ordenar: subir la tres dos veces y bajar la uno.b; en el borde no cambia nada
    const mover = async (id, dir) => (await admJson('POST', `/asistente/cuentas/${id}/mover`, { dir })).json();
    await mover(tres.id, 'arriba');
    e = await mover(tres.id, 'arriba');
    assert.deepEqual(e.cuentas.ARS.map((x) => x.alias), ['cuenta.tres', 'cuenta.uno.b', 'cuenta.dos']);
    e = await mover(tres.id, 'arriba');
    assert.deepEqual(e.cuentas.ARS.map((x) => [x.alias, x.orden]), [['cuenta.tres', 1], ['cuenta.uno.b', 2], ['cuenta.dos', 3]]);
    e = await mover(uno.id, 'abajo');
    assert.deepEqual(e.cuentas.ARS.map((x) => x.alias), ['cuenta.tres', 'cuenta.dos', 'cuenta.uno.b']);
    await err(await admJson('POST', `/asistente/cuentas/${uno.id}/mover`, { dir: 'costado' }), /arriba/);
    // la rotación sigue el orden nuevo
    const a = await acompanante({ nombre: 'Orden' });
    const p = await pedido(a.id, 'inicial');
    assert.equal((await asignarCuenta(db, p.id, 'ARS')).alias, 'cuenta.tres');
    // borrar; id desconocido o inválido
    assert.equal((await admJson('DELETE', '/asistente/cuentas/' + dos.id)).status, 200);
    assert.equal((await admJson('DELETE', '/asistente/cuentas/' + dos.id)).status, 404);
    assert.equal((await admJson('PUT', '/asistente/cuentas/no-es-un-id', { activo: true })).status, 404);
    e = await (await adm('/asistente')).json();
    assert.deepEqual(e.cuentas.ARS.map((x) => x.alias), ['cuenta.tres', 'cuenta.uno.b']);
    assert.deepEqual(e.cuentas.USD.map((x) => x.alias), ['cuenta.uno']);
    // máximo 20 por moneda
    for (let i = e.cuentas.ARS.length; i < 20; i++) assert.equal((await post({ moneda: 'ARS', alias: 'lote.' + String(i).padStart(2, '0'), titular: 'Juan Lote' })).status, 200);
    await err(await post({ moneda: 'ARS', alias: 'lote.extra', titular: 'Juan Lote' }), /Ya hay 20 cuentas en pesos/);
    await ponerCuentas({ ars: [PESOS] });
  });
});

// Cuenta eliminada por el admin (18/11/2026): el asistente puede decir el motivo SOLO al número de WhatsApp que tenía
// en su perfil (busca por el número del chat; la herramienta no recibe datos) y solo fecha y motivo.
describe('motivo de una cuenta eliminada (18/11/2026)', () => {
  const MOTIVO = 'Las fotos de tu perfil no eran tuyas.';
  const eliminarPorAdmin = async (id, motivo) => {
    const r = await admJson('POST', `/acompanantes/${id}/eliminar`, { motivo });
    assert.equal(r.status, 200, await r.clone().text());
  };

  test('la herramienta no recibe datos y las instrucciones dicen cómo usarla', () => {
    const h = HERRAMIENTAS.find((x) => x.name === 'motivo_eliminacion');
    assert.ok(h, 'falta la herramienta');
    assert.deepEqual(h.input_schema, { type: 'object', properties: {}, additionalProperties: false });
    for (const captacion of [false, true]) {
      const p = promptSistema({ siteUrl: SITE, identificado: false, idioma: 'es', captacion });
      assert.ok(p.includes('el motivo de una cuenta eliminada'));
      assert.ok(p.includes('usá "motivo_eliminacion" (busca solo por el número de este chat'));
      assert.ok(p.includes('decile la fecha y el motivo tal como está escrito, en pocas palabras y con amabilidad, sin agregar opiniones, consejos para apelar ni detalles internos'));
      assert.ok(p.includes('Si no lo encuentra, decile que desde este chat no podés ver ese dato y usá "derivar_a_juan"'));
      assert.ok(p.includes('Nunca des datos de otra cuenta ni de otro número.'));
    }
    assert.match(textoAyuda('ocultar_o_baja', SITE), /Si eliminamos tu cuenta y querés saber el motivo, preguntalo en este chat desde el número de WhatsApp que tenías en tu perfil\./);
  });

  test('desde el número de su perfil: fecha y motivo tal cual; desde otro número, nada', async () => {
    const tel = '5491155550091';
    const c = await acompanante({ whatsapp: '+54 11 5555-0091', nombre: 'Lola' });
    await eliminarPorAdmin(c.id, MOTIVO);
    const { rows: [k] } = await db.query("INSERT INTO asistente_conversaciones (jid, telefono) VALUES ($1, $2) RETURNING id", [`${tel}@s.whatsapp.net`, tel]);
    const r = await agente.asistente.herramienta(k.id, 'motivo_eliminacion', {});
    assert.deepEqual(Object.keys(r.resultado).sort(), ['encontrado', 'fecha', 'motivo'], 'solo fecha y motivo: ni email ni nombres');
    assert.equal(r.resultado.encontrado, true);
    assert.equal(r.resultado.motivo, MOTIVO);
    assert.match(r.resultado.fecha, /^\d{1,2}\/\d{1,2}\/\d{4}$/);
    // Otro número (aunque escriba el de ella): no encuentra nada ni deja ver el motivo
    const otro = '5491155550092';
    const { rows: [k2] } = await db.query("INSERT INTO asistente_conversaciones (jid, telefono) VALUES ($1, $2) RETURNING id", [`${otro}@s.whatsapp.net`, otro]);
    const r2 = await agente.asistente.herramienta(k2.id, 'motivo_eliminacion', { telefono: tel, email: c.email, numero: '+54 11 5555-0091' });
    assert.equal(r2.resultado.encontrado, false);
    assert.ok(!JSON.stringify(r2).includes(MOTIVO));
    assert.match(r2.resultado.instruccion, /derivar_a_juan/);
    // Un chat sin número (WhatsApp con identificador oculto): tampoco
    const { rows: [k3] } = await db.query("INSERT INTO asistente_conversaciones (jid) VALUES ('99887766@lid') RETURNING id");
    assert.equal((await agente.asistente.herramienta(k3.id, 'motivo_eliminacion', {})).resultado.encontrado, false);
  });

  test('si el mismo número tuvo más de una cuenta eliminada, la más reciente', async () => {
    const tel = '5491155550093';
    const a = await acompanante({ whatsapp: '+5491155550093', nombre: 'Uno' });
    await eliminarPorAdmin(a.id, 'Primer motivo, el más viejo.');
    const b = await acompanante({ whatsapp: '+54 9 11 5555 0093', nombre: 'Dos' });
    await eliminarPorAdmin(b.id, 'Segundo motivo, el más nuevo.');
    const { rows: [k] } = await db.query("INSERT INTO asistente_conversaciones (jid, telefono) VALUES ($1, $2) RETURNING id", [`${tel}@s.whatsapp.net`, tel]);
    assert.equal((await agente.asistente.herramienta(k.id, 'motivo_eliminacion', {})).resultado.motivo, 'Segundo motivo, el más nuevo.');
  });

  test('en una conversación: la IA usa la herramienta y recibe solo fecha y motivo', async () => {
    const tel = '5491155550094';
    const c = await acompanante({ whatsapp: '+5491155550094', nombre: 'Mora' });
    await eliminarPorAdmin(c.id, MOTIVO);
    const desde = LLM.llamadas.length;
    LLM.guion = (body, i) => (i === desde + 1 ? usarHerramienta('motivo_eliminacion', {})
      : { stop_reason: 'end_turn', content: [{ type: 'text', text: `Tu cuenta se eliminó por este motivo: ${MOTIVO}` }] });
    await llega(tel, '¿por qué eliminaron mi cuenta?');
    assert.ok(await hasta(() => (ultimoA(tel) || '').includes(MOTIVO)));
    const enviadoALaIa = JSON.stringify(LLM.llamadas.slice(desde));
    assert.ok(enviadoALaIa.includes(MOTIVO));
    assert.ok(!enviadoALaIa.includes(c.email) && !enviadoALaIa.includes('Mora'), 'ni email ni nombre');
    LLM.guion = null;
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
    assert.ok(d.mensajes.some((m) => m.origen === 'bot' && m.texto));
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
  const TODOS = () => [...Object.entries(AYUDA), ['contenido (próximamente)', CONTENIDO_PROXIMAMENTE], ['apertura (home provisoria)', APERTURA_PRELANZAMIENTO], ['como_funciona (home provisoria)', PRELANZAMIENTO_COMO_FUNCIONA]];

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

  test('"apertura" (19/11/2026): "a partir de diciembre" con la home provisoria prendida; sitio abierto si no', async () => {
    assert.match(APERTURA_PRELANZAMIENTO, /a partir de diciembre/);
    assert.equal(textoAyuda('apertura', SITE), APERTURA_PRELANZAMIENTO.replace(/\{url\}/g, SITE));
    assert.ok(textoAyuda('apertura', SITE).includes(`${SITE}/registro`));
    assert.equal(textoAyuda('apertura', SITE, { prelanzamiento: false }), `SexyRose ya está abierto: los perfiles publicados se ven en ${SITE}.`);
    // la herramienta lo elige y el modelo sabe cuándo usarlo; la fecha de apertura es la única que puede dar
    const ayuda = HERRAMIENTAS.find((h) => h.name === 'ayuda');
    assert.match(ayuda.input_schema.properties.tema.description, /apertura = cuándo abre el sitio/);
    for (const captacion of [false, true]) {
      const p = promptSistema({ siteUrl: SITE, identificado: false, idioma: 'es', captacion });
      assert.ok(p.includes('La única fecha que podés dar es cuándo abre el sitio, tal como la dice la ayuda (tema "apertura").'));
      assert.ok(p.includes('cuándo abre el sitio'));
    }
    assert.ok(promptSistema({ siteUrl: SITE, identificado: false, idioma: 'es', captacion: true }).includes('publicar, apertura, contenido'));
    // el agente lee el ajuste de la home provisoria en la base (estas pruebas arrancan con el sitio abierto)
    const { rows: [k] } = await db.query("INSERT INTO asistente_conversaciones (jid, telefono) VALUES ('5491155550302@s.whatsapp.net', '5491155550302') RETURNING id");
    const apertura = async () => (await agente.asistente.herramienta(k.id, 'ayuda', { tema: 'apertura' })).resultado.texto;
    invalidarCatalogos();
    assert.equal(await apertura(), textoAyuda('apertura', SITE, { prelanzamiento: false }));
    await db.query(`INSERT INTO ajustes (clave, valor, actualizado) VALUES ('prelanzamiento', '{"activo": true}'::jsonb, now())
      ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor`);
    invalidarCatalogos();
    try {
      assert.equal(await apertura(), textoAyuda('apertura', SITE));
    } finally {
      await db.query("DELETE FROM ajustes WHERE clave = 'prelanzamiento'");
      invalidarCatalogos();
    }
    assert.equal(await apertura(), textoAyuda('apertura', SITE, { prelanzamiento: false }));
  });

  test('planes: la renovación automática usa el saldo de créditos (sin transferir de nuevo); como_funciona avisa la apertura y la vista previa', async () => {
    const pl = textoAyuda('planes', SITE);
    assert.match(pl, /los cargás por transferencia y quedan como saldo en tu cuenta/);
    assert.match(pl, /se renueva solo descontándolos del saldo, sin transferir de nuevo/);
    assert.match(pl, /Si no te alcanzan, te avisamos antes/);
    assert.ok(promptSistema({ siteUrl: SITE, identificado: false, idioma: 'es' }).includes('la renovación automática solo descuenta créditos que ya tiene de saldo; no le cobra plata ni le debita nada'));
    const cf = textoAyuda('como_funciona', SITE);
    assert.ok(cf.startsWith(AYUDA.como_funciona.replace(/\{url\}/g, SITE)));
    assert.ok(cf.endsWith(`El sitio abre al público a partir de diciembre: hasta entonces los clientes todavía no ven los perfiles, pero vos podés ver el tuyo en ${SITE}/panel/vista-previa.`));
    assert.ok(cf.length <= 1200);
    assert.equal(textoAyuda('como_funciona', SITE, { prelanzamiento: false }), AYUDA.como_funciona.replace(/\{url\}/g, SITE));
    assert.ok(textoAyuda('apertura', SITE).includes(`${SITE}/panel/vista-previa`));
    // el agente: sitio abierto en estas pruebas → sin la línea; con la home provisoria prendida → con la línea
    const { rows: [k] } = await db.query("INSERT INTO asistente_conversaciones (jid, telefono) VALUES ('5491155550303@s.whatsapp.net', '5491155550303') RETURNING id");
    const cfAgente = async () => (await agente.asistente.herramienta(k.id, 'ayuda', { tema: 'como_funciona' })).resultado.texto;
    invalidarCatalogos();
    assert.ok(!(await cfAgente()).includes('diciembre'));
    await db.query(`INSERT INTO ajustes (clave, valor, actualizado) VALUES ('prelanzamiento', '{"activo": true}'::jsonb, now())
      ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor`);
    invalidarCatalogos();
    try {
      assert.equal(await cfAgente(), cf);
    } finally {
      await db.query("DELETE FROM ajustes WHERE clave = 'prelanzamiento'");
      invalidarCatalogos();
    }
  });

  test('precios (19/11/2026): cada monto también en pesos, con la cotización en uso y redondeado hacia arriba a la centena', async () => {
    const { rows: [k] } = await db.query("INSERT INTO asistente_conversaciones (jid, telefono) VALUES ('5491155550304@s.whatsapp.net', '5491155550304') RETURNING id");
    const precios = async () => (await agente.asistente.herramienta(k.id, 'precios', {})).resultado;
    const prev = (await db.query("SELECT valor FROM ajustes WHERE clave = 'cotizacion'")).rows[0];
    const prevP = (await db.query("SELECT valor FROM ajustes WHERE clave = 'precios'")).rows[0];
    try {
      await db.query(`INSERT INTO ajustes (clave, valor) VALUES ('cotizacion', $1) ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor`,
        [JSON.stringify({ arsPorUsd: 1580, fecha: new Date().toISOString(), nota: '' })]);
      await db.query(`INSERT INTO ajustes (clave, valor) VALUES ('precios', $1) ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor`,
        [JSON.stringify({ mes: { E: 0, D: 25, C: 72, S: 175 }, semana: { C: 20, S: 50 }, semanaAuto: { activo: false, recargo: 20 } })]);
      invalidarCatalogos();
      const r = await precios();
      const pl = Object.fromEntries(r.planes.map((p) => [p.nombre, p]));
      assert.equal(pl.Plata.mes, 25);
      assert.equal(pl.Plata.mesPesos, '$39.500');
      assert.equal(pl.Oro.mesPesos, '$113.800'); // 72 × 1580 = 113.760 → hacia arriba a la centena
      assert.equal(pl.Oro.semanaPesos, '$31.600');
      assert.equal(pl.Star.mesPesos, '$276.500');
      assert.equal(pl.Bronce.mesPesos, null, 'Bronce es gratis');
      assert.ok(r.packs.every((p) => p.pagaPesos === '$' + (Math.ceil((p.pagaUsd * 1580) / 100) * 100).toLocaleString('es-AR')));
      assert.ok(r.destacado.every((d) => typeof d.mesPesos === 'string' && d.mesPesos.startsWith('$')));
      assert.equal(r.cotizacion.pesosPorDolar, 1580);
      // sin cotización: solo USD
      await db.query("DELETE FROM ajustes WHERE clave = 'cotizacion'");
      const r2 = await precios();
      assert.ok(r2.planes.every((p) => p.mesPesos === null && p.semanaPesos === null));
      assert.ok(r2.packs.every((p) => p.pagaPesos === null));
    } finally {
      await db.query("DELETE FROM ajustes WHERE clave IN ('cotizacion', 'precios')");
      if (prev) await db.query("INSERT INTO ajustes (clave, valor) VALUES ('cotizacion', $1)", [JSON.stringify(prev.valor)]);
      if (prevP) await db.query("INSERT INTO ajustes (clave, valor) VALUES ('precios', $1)", [JSON.stringify(prevP.valor)]);
      invalidarCatalogos();
    }
    assert.ok(promptSistema({ siteUrl: SITE, identificado: false, idioma: 'es' }).includes('Plata $39.500 por mes (USD 25)'));
  });
});
