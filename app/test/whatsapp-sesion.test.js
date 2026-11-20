// Sesión de WhatsApp del asistente (18/11/2026): reenvíos cuando el otro teléfono no puede descifrar ("Esperando
// mensaje"), claves de Signal guardadas en orden y completas, cierre que termina de escribir, y una sola conexión por
// sesión (candado de Postgres). Socket de Baileys falso; Baileys real para proto, BufferJSON y la caché de claves.
//   DATABASE_URL=postgres://postgres@127.0.0.1:55432/<db> node --test test/whatsapp-sesion.test.js
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import * as B from '@whiskeysockets/baileys';
import { start } from '../server.js';
import { createRequire } from 'node:module';
import { authEnBase, crearCandado, createWhatsApp, sinDatos, cacheConVencimiento, loggerMudo, AVISO_REVINCULAR, FORMATO_SESION, borrarAuth, prefijoAuth, candadoDeChip, CANDADO_WHATSAPP } from '../lib/asistente-whatsapp.js';
import { crearConsolaSegura, instalarConsolaSegura } from '../lib/consola-segura.js';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('Falta DATABASE_URL.'); process.exit(1); }
const db = new pg.Pool({ connectionString: DATABASE_URL, max: 6 });
const KEY = 'clave-maestra-de-prueba-whatsapp-0123456789';
let instance; let tmpData;

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
async function hasta(fn, ms = 4000) {
  const fin = Date.now() + ms;
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() > fin) return v; await espera(20); }
}
const nuevaAuth = () => authEnBase({ pool: db, secretsKey: KEY, BufferJSON: B.BufferJSON, initAuthCreds: B.initAuthCreds, proto: B.proto });
const loggerNulo = { level: 'silent', child() { return this; }, trace() {}, debug() {}, info() {}, warn() {}, error() {}, fatal() {} };

// ---------- Socket de Baileys falso ----------
class SocketFalso {
  constructor(opciones) {
    this.opciones = opciones; this.ev = new EventEmitter(); this.ws = new EventEmitter(); this.enviados = []; this.terminado = false;
    this.user = { id: '5491100000000:7@s.whatsapp.net' }; this.frenar = null;
  }
  async sendMessage(jid, content, opts) {
    this.enviados.push({ jid, text: content.text, id: opts.messageId });
    if (this.frenar) await this.frenar;
    return { key: { id: opts.messageId, remoteJid: jid, fromMe: true }, message: B.proto.Message.fromObject({ extendedTextMessage: { text: content.text } }) };
  }
  async sendPresenceUpdate() {}
  async presenceSubscribe() {}
  async logout() {}
  end() { this.terminado = true; }
}
function fabrica(alCrear = () => {}) {
  const f = { sockets: [] };
  f.makeSocket = async (opciones) => { const s = new SocketFalso(opciones); alCrear(s); f.sockets.push(s); return s; };
  f.ultimo = () => f.sockets[f.sockets.length - 1];
  return f;
}
async function conectado(wa, f) {
  assert.ok(await hasta(() => f.sockets.length > 0), 'socket creado');
  f.ultimo().ev.emit('connection.update', { connection: 'open' });
  assert.ok(await hasta(() => wa.conectado()), 'conectado');
}
const nuevoWa = (extra = {}) => createWhatsApp({ pool: db, secretsKey: KEY, demora: () => 0, dormir: async () => {}, candado: null, ...extra });

before(async () => {
  tmpData = await fs.mkdtemp(path.join(os.tmpdir(), 'srwa-data-'));
  instance = await start({ prelanzamientoPorDefecto: false,
    port: 0, host: '127.0.0.1', databaseUrl: DATABASE_URL, adminPath: '/panel-pruebas-wa-0123456789', adminUser: 'admin-wa', adminPassword: 'clave-de-prueba-larga-wa-1',
    ipHashSalt: 'sal', siteUrl: 'https://sexyrose.test', dataDir: tmpData, log: () => {}, tareaPlanes: false, tareaContenido: false, tareaCotizacion: false, tareaGeoref: false,
    secretsKey: KEY, telegramToken: '', telegramChatId: '',
  });
  await instance.ready;
  await db.query('DELETE FROM asistente_auth');
  await db.query('DELETE FROM asistente_wa_enviados');
});
after(async () => {
  await db.query('DELETE FROM asistente_auth').catch(() => {});
  await db.query('DELETE FROM asistente_wa_enviados').catch(() => {});
  await instance?.close();
  await db.end();
  if (tmpData) await fs.rm(tmpData, { recursive: true, force: true });
});

describe('claves de Signal en la base', () => {
  test('todas las categorías se guardan cifradas y sobreviven a releer la sesión', async () => {
    await db.query('DELETE FROM asistente_auth');
    const a = await nuevaAuth();
    const datos = {
      'pre-key': { 1: { public: Buffer.from('pub1'), private: Buffer.from('priv1') }, 2: { public: Buffer.from('pub2'), private: Buffer.from('priv2') } },
      session: { '5491155550001.0': Buffer.from('sesion-0'), '5491155550001.3': Buffer.from('sesion-3'), '123456789012345_1.0': Buffer.from('sesion-lid') },
      'sender-key': { 'grupo@g.us::5491155550001::0': Buffer.from('sk') },
      'sender-key-memory': { 'grupo@g.us': { '5491155550001:0@s.whatsapp.net': true } },
      'app-state-sync-key': { AAAAAQ: { keyData: Buffer.from('k'), fingerprint: { rawId: 1, currentIndex: 0, deviceIndexes: [0] }, timestamp: 1 } },
      'app-state-sync-version': { regular: { version: 3, hash: Buffer.alloc(128, 1), indexValueMap: {} } },
    };
    await a.state.keys.set(datos);
    const { rows } = await db.query('SELECT valor FROM asistente_auth');
    assert.equal(rows.length, 9);
    for (const r of rows) { assert.match(r.valor, /^v1:/); assert.ok(!r.valor.includes('sesion-')); }
    const b = await nuevaAuth(); // como después de reiniciar el contenedor
    for (const tipo of Object.keys(datos)) {
      const ids = Object.keys(datos[tipo]);
      const leido = await b.state.keys.get(tipo, ids);
      assert.deepEqual(Object.keys(leido).sort(), ids.sort(), tipo);
    }
    assert.deepEqual((await b.state.keys.get('session', ['5491155550001.3']))['5491155550001.3'], Buffer.from('sesion-3'));
    assert.ok((await b.state.keys.get('app-state-sync-key', ['AAAAAQ'])).AAAAAQ instanceof B.proto.Message.AppStateSyncKeyData);
    assert.equal((await b.state.keys.get('app-state-sync-version', ['regular'])).regular.version, 3);
    // borrar (Baileys manda null): una pre-key usada
    await b.state.keys.set({ 'pre-key': { 1: null } });
    assert.deepEqual(Object.keys(await (await nuevaAuth()).state.keys.get('pre-key', ['1', '2'])), ['2']);
  });

  test('las escrituras quedan en orden aunque nadie las espere, y vaciar() las termina', async () => {
    await db.query('DELETE FROM asistente_auth');
    const a = await nuevaAuth();
    // Muchas escrituras seguidas de la misma sesión sin esperar: la base tiene que terminar con la ÚLTIMA.
    const ps = [];
    for (let i = 0; i < 40; i++) ps.push(a.state.keys.set({ session: { 'x.0': Buffer.from('v' + i), ['otra.' + i]: Buffer.from('o') } }));
    a.state.creds.nextPreKeyId = 777;
    ps.push(a.guardarCreds());
    await a.vaciar();
    const b = await nuevaAuth();
    assert.deepEqual((await b.state.keys.get('session', ['x.0']))['x.0'], Buffer.from('v39'));
    assert.equal(Object.keys(await b.state.keys.get('session', Array.from({ length: 40 }, (_, i) => 'otra.' + i))).length, 40);
    assert.equal(b.state.creds.nextPreKeyId, 777);
    await Promise.all(ps);
  });

  test('el valor se toma al llamar (no al escribir) y descartar() no vuelve a crear la sesión borrada', async () => {
    await db.query('DELETE FROM asistente_auth');
    const a = await nuevaAuth();
    const obj = { n: 1 };
    const p = a.state.keys.set({ 'sender-key-memory': { g: obj } });
    obj.n = 2;
    await p;
    assert.equal((await (await nuevaAuth()).state.keys.get('sender-key-memory', ['g'])).g.n, 1);
    a.descartar();
    await a.guardarCreds();
    await a.state.keys.set({ session: { 'y.0': Buffer.from('no') } });
    await a.vaciar();
    const { rows } = await db.query("SELECT clave FROM asistente_auth WHERE clave IN ('creds', 'session-y.0')");
    assert.equal(rows.length, 0);
  });

  test('con la caché y las transacciones de Baileys: lo confirmado queda en la base', async () => {
    await db.query('DELETE FROM asistente_auth');
    const a = await nuevaAuth();
    const keys = B.addTransactionCapability(B.makeCacheableSignalKeyStore(a.state.keys, loggerNulo), loggerNulo, { maxCommitRetries: 2, delayBetweenTriesMs: 10 });
    await keys.transaction(async () => {
      await keys.set({ session: { 'j.0': Buffer.from('cifrado-1') } });
      await keys.set({ session: { 'j.0': Buffer.from('cifrado-2') }, 'pre-key': { 9: { public: Buffer.from('p'), private: Buffer.from('q') } } });
    });
    await a.vaciar();
    const b = await nuevaAuth();
    assert.deepEqual((await b.state.keys.get('session', ['j.0']))['j.0'], Buffer.from('cifrado-2'));
    assert.ok((await b.state.keys.get('pre-key', ['9']))['9']);
  });
});

describe('reenvíos (getMessage) y configuración del socket', () => {
  test('getMessage devuelve el contenido original de lo que mandó el bot, cifrado en la base; desconocido → undefined', async () => {
    await db.query('DELETE FROM asistente_wa_enviados');
    const f = fabrica(); const logs = [];
    const wa = nuevoWa({ makeSocket: f.makeSocket, log: (...a) => logs.push(a.join(' ')) });
    await wa.iniciar(); await conectado(wa, f);
    const op = f.ultimo().opciones;
    assert.equal(typeof op.getMessage, 'function');
    assert.ok(op.msgRetryCounterCache && typeof op.msgRetryCounterCache.get === 'function');
    const id = await wa.enviar('5491155550001@s.whatsapp.net', 'Hola, tu pedido SR-1234 está acreditado.');
    const m = await op.getMessage({ remoteJid: '5491155550001:3@s.whatsapp.net', fromMe: true, id });
    assert.equal(m.extendedTextMessage.text, 'Hola, tu pedido SR-1234 está acreditado.');
    assert.equal(await op.getMessage({ remoteJid: '5491155550001@s.whatsapp.net', fromMe: true, id: '3EB0NOEXISTE' }), undefined);
    const { rows } = await db.query('SELECT contenido FROM asistente_wa_enviados WHERE wa_id = $1', [id]);
    assert.equal(rows.length, 1);
    assert.match(rows[0].contenido, /^v1:/);
    assert.ok(!rows[0].contenido.includes('SR-1234'));
    assert.ok(logs.some((l) => /se reenvía el mensaje …/.test(l)));
    assert.ok(logs.some((l) => /no hay copia/.test(l)));
    assert.ok(!logs.join('\n').match(/5491155550001|SR-1234/), 'logs sin teléfono ni contenido');
    await wa.detener();

    // Después de reiniciar (proceso nuevo, sin memoria): sale de la base.
    const f2 = fabrica();
    const wa2 = nuevoWa({ makeSocket: f2.makeSocket });
    await wa2.iniciar(); await conectado(wa2, f2);
    const m2 = await f2.ultimo().opciones.getMessage({ id });
    assert.ok(m2 instanceof B.proto.Message);
    assert.equal(m2.extendedTextMessage.text, 'Hola, tu pedido SR-1234 está acreditado.');
    await wa2.detener();
  });

  test('si el pedido de reenvío llega mientras el mensaje todavía se está mandando, lo espera', async () => {
    const f = fabrica();
    const wa = nuevoWa({ makeSocket: f.makeSocket });
    await wa.iniciar(); await conectado(wa, f);
    const s = f.ultimo();
    let soltar; s.frenar = new Promise((r) => { soltar = r; });
    const envio = wa.enviar('5491155550002@s.whatsapp.net', 'Respuesta lenta');
    assert.ok(await hasta(() => s.enviados.length === 1));
    const pedido = s.opciones.getMessage({ id: s.enviados[0].id });
    await espera(30);
    soltar();
    const [id, m] = await Promise.all([envio, pedido]);
    assert.equal(id, s.enviados[0].id);
    assert.equal(m.extendedTextMessage.text, 'Respuesta lenta');
    await wa.detener();
  });

  test('la caché de reintentos es la misma en cada reconexión', async () => {
    const f = fabrica();
    const wa = nuevoWa({ makeSocket: f.makeSocket });
    await wa.iniciar(); await conectado(wa, f);
    const c1 = f.ultimo().opciones.msgRetryCounterCache;
    c1.set('ID:part', 2);
    f.ultimo().ev.emit('connection.update', { connection: 'close', lastDisconnect: { error: { output: { statusCode: 515 } } } });
    assert.ok(await hasta(() => f.sockets.length === 2), 'reconectó');
    assert.equal(f.ultimo().opciones.msgRetryCounterCache, c1);
    assert.equal(f.ultimo().opciones.msgRetryCounterCache.get('ID:part'), 2);
    await wa.detener();
  });

  test('cache con vencimiento', async () => {
    const c = cacheConVencimiento(30);
    c.set('a', 1); assert.equal(c.get('a'), 1);
    await espera(50); assert.equal(c.get('a'), undefined);
    c.set('b', 2); c.del('b'); assert.equal(c.get('b'), undefined);
    c.set('c', 3); c.flushAll(); assert.equal(c.get('c'), undefined);
  });
});

describe('cierre y logs', () => {
  test('detener() (SIGTERM) termina de escribir credenciales y claves pendientes antes de soltar', async () => {
    await db.query('DELETE FROM asistente_auth');
    const f = fabrica();
    const wa = nuevoWa({ makeSocket: f.makeSocket, crearAuth: () => nuevaAuth() });
    await wa.iniciar(); await conectado(wa, f);
    const s = f.ultimo();
    // Baileys: cambia creds y emite creds.update (nosotros no lo esperamos) y escribe claves
    s.opciones.auth.creds.me = { id: '5491100000000:7@s.whatsapp.net', name: 'chip' };
    s.opciones.auth.creds.nextPreKeyId = 31;
    s.ev.emit('creds.update', { me: s.opciones.auth.creds.me });
    for (let i = 0; i < 20; i++) s.opciones.auth.keys.set({ session: { ['d.' + i]: Buffer.from('s' + i) } });
    await wa.detener();
    assert.ok(s.terminado);
    const b = await nuevaAuth();
    assert.equal(b.state.creds.nextPreKeyId, 31);
    assert.equal(b.state.creds.me.name, 'chip');
    assert.equal(Object.keys(await b.state.keys.get('session', Array.from({ length: 20 }, (_, i) => 'd.' + i))).length, 20);
  });

  test('desvinculado (401): lo pendiente no vuelve a crear la sesión borrada', async () => {
    await db.query('DELETE FROM asistente_auth');
    const f = fabrica();
    const wa = nuevoWa({ makeSocket: f.makeSocket, crearAuth: () => nuevaAuth() });
    await wa.iniciar(); await conectado(wa, f);
    const s = f.ultimo();
    s.opciones.auth.keys.set({ session: { 'z.0': Buffer.from('vieja') } });
    s.ev.emit('connection.update', { connection: 'close', lastDisconnect: { error: { output: { statusCode: 401 } } } });
    s.ev.emit('creds.update', {});
    assert.ok(await hasta(() => f.sockets.length === 2), 'pide QR nuevo');
    await espera(50);
    const { rows } = await db.query('SELECT clave FROM asistente_auth');
    assert.deepEqual(rows, []);
    await wa.detener();
  });

  test('logs de reintentos y de mensajes sin descifrar, sin números', async () => {
    const f = fabrica(); const logs = []; const recibidos = [];
    const wa = nuevoWa({ makeSocket: f.makeSocket, log: (...a) => logs.push(a.join(' ')), alMensaje: async (ev) => { recibidos.push(ev); } });
    await wa.iniciar(); await conectado(wa, f);
    const s = f.ultimo();
    s.ws.emit('CB:receipt', { tag: 'receipt', attrs: { id: '3EB0AAAABBBBCCCC123456', type: 'retry', from: '5491155550001:3@s.whatsapp.net' }, content: [{ tag: 'retry', attrs: { count: '1', id: '3EB0AAAABBBBCCCC123456' } }] });
    s.ws.emit('CB:receipt', { tag: 'receipt', attrs: { id: 'X', from: '5491155550001@s.whatsapp.net' } }); // entregado: nada
    await wa._alLlegar({ type: 'notify', messages: [{ key: { remoteJid: '123456789012345@lid', id: 'ABCDEF0123', fromMe: false }, messageTimestamp: Math.floor(Date.now() / 1000), messageStubType: 2, messageStubParameters: ['No session record for 123456789012345.0'] }] });
    assert.equal(recibidos.length, 0, 'un mensaje sin descifrar no se contesta');
    const t = logs.join('\n');
    assert.match(t, /no pudo descifrar el mensaje …123456 y pidió reenvío \(intento 1\)/);
    assert.match(t, /no se pudo descifrar \(…EF0123: No session record for #\.0\)/);
    assert.ok(!/5491155550001|123456789012345/.test(t), t);
    assert.equal(sinDatos('Bad MAC 5491155550001\nstack'), 'Bad MAC #');
    // 440: otra conexión con la misma sesión → no pelea
    s.ev.emit('connection.update', { connection: 'close', lastDisconnect: { error: { output: { statusCode: 440 } } } });
    assert.ok(await hasta(() => logs.some((l) => /reemplazó a esta \(440\); reintento en 60 s/.test(l))));
    await wa.detener();
  });
});

describe('una sola conexión por sesión', () => {
  test('mientras un agente tiene la sesión, el otro espera; cuando la suelta, se conecta', async () => {
    const f1 = fabrica(); const f2 = fabrica(); const logs2 = [];
    const wa1 = nuevoWa({ makeSocket: f1.makeSocket, candado: crearCandado(db) });
    const wa2 = nuevoWa({ makeSocket: f2.makeSocket, candado: crearCandado(db), esperaCandadoMs: 40, log: (...a) => logs2.push(a.join(' ')) });
    await wa1.iniciar(); await conectado(wa1, f1);
    await wa2.iniciar();
    await espera(200);
    assert.equal(f2.sockets.length, 0, 'el segundo no se conecta con las mismas credenciales');
    assert.equal(logs2.filter((l) => /otra instancia del agente/.test(l)).length, 1, 'avisa una vez');
    await wa1.detener(); // como el contenedor viejo al recibir SIGTERM
    assert.ok(await hasta(() => f2.sockets.length === 1), 'el segundo se conecta');
    await wa2.detener();
    const { rows } = await db.query("SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND objid = 7262701 AND database = (SELECT oid FROM pg_database WHERE datname = current_database())");
    assert.equal(rows[0].n, 0, 'nadie queda con el candado');
  });

  test('si se cae la conexión que tiene el candado, corta WhatsApp y lo vuelve a pedir', async () => {
    const f = fabrica(); const logs = [];
    const wa = nuevoWa({ makeSocket: f.makeSocket, candado: crearCandado(db, { log: (...a) => logs.push(a.join(' ')) }), esperaCandadoMs: 40 });
    await wa.iniciar(); await conectado(wa, f);
    const viejo = f.ultimo();
    await db.query("SELECT pg_terminate_backend(pid) FROM pg_locks WHERE locktype = 'advisory' AND objid = 7262701 AND database = (SELECT oid FROM pg_database WHERE datname = current_database())");
    await wa.latido(); // revisa el candado
    assert.ok(await hasta(() => viejo.terminado), 'cortó');
    assert.ok(await hasta(() => f.sockets.length === 2), 'volvió a conectar con el candado');
    assert.ok(logs.some((l) => /se perdió el candado/.test(l)));
    await wa.detener();
  });
});

// ---------- LID (Baileys 7, 18/11/2026) ----------
// WhatsApp manda los chats 1:1 por LID (`…@lid`) con el teléfono aparte (key.remoteJidAlt). Con Baileys 6 se respondía
// al teléfono y la sesión de Signal quedaba partida: "Esperando mensaje" en el teléfono del otro lado.
const ahora = () => Math.floor(Date.now() / 1000);
const TEL = '5491155550071'; const PN = `${TEL}@s.whatsapp.net`; const LID = '204060801234567@lid';
function relacion({ lidAPn = {}, pnALid = {}, falla = false } = {}) {
  const r = { pedidosPn: [], pedidosLid: [] };
  r.getPNForLID = async (lid) => { r.pedidosPn.push(lid); if (falla) throw new Error('usync'); return lidAPn[lid.replace(/:\d+@/, '@')] || null; };
  r.getLIDForPN = async (pn) => { r.pedidosLid.push(pn); if (falla) throw new Error('usync'); return pnALid[pn.replace(/:\d+@/, '@')] || null; };
  return r;
}
async function waLid({ rel = relacion(), user = { id: '5491100000000:7@s.whatsapp.net', lid: '998877665544332:7@lid' } } = {}) {
  const recibidos = []; const logs = [];
  const f = fabrica((s) => { s.signalRepository = { lidMapping: rel }; s.user = user; });
  const wa = nuevoWa({ makeSocket: f.makeSocket, alMensaje: async (ev) => { recibidos.push(ev); }, log: (...a) => logs.push(a.join(' ')) });
  await wa.iniciar(); await conectado(wa, f);
  return { wa, f, recibidos, logs, rel };
}
const msj = (key, texto = 'hola') => ({ type: 'notify', messages: [{ key: { id: 'M' + crypto.randomUUID().slice(0, 8), fromMe: false, ...key }, messageTimestamp: ahora(), message: { conversation: texto } }] });

describe('LID (Baileys 7): a quién se responde y cómo se identifica', () => {
  test('llega por LID con el teléfono: el chat queda con el teléfono y la respuesta va al LID', async () => {
    const { wa, f, recibidos } = await waLid();
    await wa._alLlegar(msj({ remoteJid: '204060801234567:3@lid', remoteJidAlt: `${TEL}:3@s.whatsapp.net` }));
    assert.equal(recibidos.length, 1);
    assert.equal(recibidos[0].jid, PN, 'clave del chat: el teléfono (así se identifica por el perfil)');
    assert.equal(recibidos[0].telefono, TEL);
    assert.equal(recibidos[0].lid, LID);
    await wa.enviar(recibidos[0].jid, 'respuesta');
    assert.equal(f.ultimo().enviados.at(-1).jid, LID, 'se responde por donde escribió');
    await wa.detener();
  });

  test('llega por teléfono: se responde al teléfono aunque WhatsApp tenga un LID para ese número', async () => {
    const rel = relacion({ pnALid: { [PN]: LID } });
    const { wa, f, recibidos } = await waLid({ rel });
    await wa._alLlegar(msj({ remoteJid: PN, remoteJidAlt: LID }));
    assert.equal(recibidos[0].jid, PN);
    assert.equal(recibidos[0].lid, null);
    await wa.enviar(PN, 'respuesta');
    assert.equal(f.ultimo().enviados.at(-1).jid, PN);
    assert.equal(rel.pedidosLid.length, 0, 'no hace falta buscar el LID');
    await wa.detener();
  });

  test('Baileys 6 (key.senderPn) y sin teléfono en el mensaje: usa la relación LID↔teléfono guardada', async () => {
    const rel = relacion({ lidAPn: { [LID]: `${TEL}:0@s.whatsapp.net` } });
    const { wa, recibidos } = await waLid({ rel });
    await wa._alLlegar(msj({ remoteJid: '111222333444555@lid', senderPn: '5491155550072@s.whatsapp.net' }));
    assert.equal(recibidos[0].jid, '5491155550072@s.whatsapp.net');
    await wa._alLlegar(msj({ remoteJid: LID }));
    assert.equal(recibidos[1].jid, PN);
    assert.equal(recibidos[1].telefono, TEL);
    await wa.detener();
  });

  test('sin teléfono por ningún lado: el chat queda con el LID (se identifica por email) y se responde al LID', async () => {
    const { wa, f, recibidos } = await waLid({ rel: relacion({ falla: true }) });
    await wa._alLlegar(msj({ remoteJid: LID }));
    assert.equal(recibidos[0].jid, LID);
    assert.equal(recibidos[0].telefono, null);
    assert.equal(recibidos[0].lid, null);
    await wa.enviar(LID, 'x');
    assert.equal(f.ultimo().enviados.at(-1).jid, LID);
    await wa.detener();
  });

  test('mensaje propio (Juan desde el teléfono del chip): no toma el número del chip como teléfono del chat', async () => {
    const rel = relacion({ lidAPn: { [LID]: PN } });
    const { wa, recibidos } = await waLid({ rel });
    await wa._alLlegar(msj({ remoteJid: LID, fromMe: true, remoteJidAlt: '5491100000000@s.whatsapp.net' }, 'te escribo yo'));
    assert.equal(recibidos[0].jid, PN);
    assert.equal(recibidos[0].deMi, true);
    // chat con uno mismo (por teléfono o por el LID del chip): se ignora
    await wa._alLlegar(msj({ remoteJid: '998877665544332@lid', fromMe: true }));
    await wa._alLlegar(msj({ remoteJid: '5491100000000@s.whatsapp.net', fromMe: true }));
    assert.equal(recibidos.length, 1);
    await wa.detener();
  });

  test('aviso sin mensaje previo (p. ej. después de reiniciar): al LID que WhatsApp tiene para el teléfono; si falla, al teléfono', async () => {
    let { wa, f } = await waLid({ rel: relacion({ pnALid: { [PN]: LID } }) });
    await wa.enviar(PN, 'créditos acreditados');
    assert.equal(f.ultimo().enviados.at(-1).jid, LID);
    await wa.detener();
    ({ wa, f } = await waLid({ rel: relacion({ falla: true }) }));
    await wa.enviar(PN, 'créditos acreditados');
    assert.equal(f.ultimo().enviados.at(-1).jid, PN);
    await wa.detener();
  });
});

describe('sesión guardada por Baileys 6', () => {
  async function sesionVieja({ conMarca = false } = {}) {
    await db.query('DELETE FROM asistente_auth');
    const a = await nuevaAuth();
    a.state.creds.me = { id: '5491100000000:7@s.whatsapp.net', name: 'chip' };
    a.state.creds.registered = true;
    await a.guardarCreds();
    await a.state.keys.set({ session: { '5491155550071.0': Buffer.from('partida') }, 'pre-key': { 5: { public: Buffer.from('p'), private: Buffer.from('q') } } });
    await a.vaciar();
    if (!conMarca) await db.query("DELETE FROM asistente_auth WHERE clave = 'formato'");
  }
  const estadoAdmin = async () => (await db.query('SELECT estado, error FROM asistente_whatsapp WHERE id = 1')).rows[0];

  test('sin la marca: se borra, se pide QR con el aviso en el admin y por Telegram; al vincular se va el aviso', async () => {
    await sesionVieja();
    const f = fabrica(); const avisos = []; const logs = [];
    const wa = nuevoWa({ makeSocket: f.makeSocket, crearAuth: () => nuevaAuth(), avisar: async (t) => { avisos.push(t); }, log: (...a) => logs.push(a.join(' ')) });
    await wa.iniciar();
    assert.ok(await hasta(() => f.sockets.length === 1));
    const s = f.ultimo();
    assert.equal(s.opciones.auth.creds.me, undefined, 'credenciales nuevas: no se conecta con la sesión vieja');
    const { rows } = await db.query('SELECT clave FROM asistente_auth');
    assert.deepEqual(rows, [], 'la sesión vieja se borró');
    assert.ok(await hasta(() => avisos.length === 1));
    assert.match(avisos[0], /vincular el chip de nuevo/);
    assert.ok(!/\d{6,}/.test(avisos[0]));
    assert.ok(logs.some((l) => /versión anterior \(Baileys 6\)/.test(l)));
    s.ev.emit('connection.update', { qr: 'QR-NUEVO' });
    assert.ok(await hasta(async () => (await estadoAdmin()).estado === 'esperando_qr'), JSON.stringify(await estadoAdmin()));
    assert.equal((await estadoAdmin()).error, AVISO_REVINCULAR);
    // Baileys guarda las credenciales nuevas: con la marca
    s.opciones.auth.creds.me = { id: '5491100000000:8@s.whatsapp.net' };
    s.ev.emit('creds.update', {});
    s.ev.emit('connection.update', { connection: 'open' });
    assert.ok(await hasta(() => wa.conectado()));
    assert.ok(await hasta(async () => (await estadoAdmin()).estado === 'conectado'));
    assert.equal((await estadoAdmin()).error, null);
    await wa.detener();
    const b = await nuevaAuth();
    assert.equal(b.formatoViejo, false, 'la sesión nueva tiene la marca');
    assert.equal(b.state.creds.me.id, '5491100000000:8@s.whatsapp.net');
  });

  test('con la marca (ya es de Baileys 7) se usa tal cual; sin credenciales tampoco avisa', async () => {
    await sesionVieja({ conMarca: true });
    assert.equal((await nuevaAuth()).formatoViejo, false);
    let f = fabrica(); const avisos = [];
    let wa = nuevoWa({ makeSocket: f.makeSocket, crearAuth: () => nuevaAuth(), avisar: async (t) => { avisos.push(t); } });
    await wa.iniciar(); await conectado(wa, f);
    assert.equal(f.ultimo().opciones.auth.creds.me.name, 'chip');
    await wa.detener();
    await db.query('DELETE FROM asistente_auth');
    f = fabrica();
    wa = nuevoWa({ makeSocket: f.makeSocket, crearAuth: () => nuevaAuth(), avisar: async (t) => { avisos.push(t); } });
    await wa.iniciar(); await conectado(wa, f);
    await wa.detener();
    assert.equal(avisos.length, 0);
    await db.query('DELETE FROM asistente_auth');
  });

  test('si no se puede borrar la sesión vieja, no se conecta con ella ni se cae: reintenta', async () => {
    await sesionVieja();
    const f = fabrica(); const logs = []; let fallar = true;
    const pool = { query: (q, p) => (fallar && /^DELETE FROM asistente_auth WHERE/.test(q) ? Promise.reject(Object.assign(new Error('x'), { code: '57P01' })) : db.query(q, p)) };
    const wa = createWhatsApp({ pool, secretsKey: KEY, demora: () => 0, dormir: async () => {}, candado: null, makeSocket: f.makeSocket, crearAuth: () => nuevaAuth(), log: (...a) => logs.push(a.join(' ')) });
    await wa.iniciar();
    assert.ok(await hasta(() => logs.some((l) => /conexión falló/.test(l))));
    assert.equal(f.sockets.length, 0);
    fallar = false;
    assert.ok(await hasta(() => f.sockets.length === 1, 5000), 'reintenta y sigue');
    assert.equal(f.ultimo().opciones.auth.creds.me, undefined);
    await wa.detener();
    await db.query('DELETE FROM asistente_auth');
  });

  test('las categorías nuevas de Baileys 7 (lid-mapping, device-list, tctoken, identity-key) se guardan y se releen', async () => {
    await db.query('DELETE FROM asistente_auth');
    const a = await nuevaAuth();
    const keys = B.addTransactionCapability(B.makeCacheableSignalKeyStore(a.state.keys, loggerNulo), loggerNulo, { maxCommitRetries: 2, delayBetweenTriesMs: 10 });
    await keys.transaction(async () => {
      await keys.set({
        'lid-mapping': { [TEL]: '204060801234567', '204060801234567_reverse': TEL },
        'device-list': { [TEL]: ['0', '3'] },
        tctoken: { '204060801234567@lid': { token: Buffer.from('tc'), timestamp: '1700000000' } },
        'identity-key': { '204060801234567_1.0': Buffer.from('identidad') },
        session: { '204060801234567_1.0': Buffer.from('sesion-lid') },
      });
    }, 'prueba');
    await a.vaciar();
    const { rows } = await db.query('SELECT valor FROM asistente_auth');
    for (const r of rows) { assert.match(r.valor, /^v1:/); assert.ok(!r.valor.includes(TEL)); }
    const b = await nuevaAuth();
    assert.equal((await b.state.keys.get('lid-mapping', [TEL]))[TEL], '204060801234567');
    assert.equal((await b.state.keys.get('lid-mapping', ['204060801234567_reverse']))['204060801234567_reverse'], TEL);
    assert.deepEqual((await b.state.keys.get('device-list', [TEL]))[TEL], ['0', '3']);
    const tc = (await b.state.keys.get('tctoken', ['204060801234567@lid']))['204060801234567@lid'];
    assert.ok(Buffer.isBuffer(tc.token)); assert.equal(tc.token.toString(), 'tc');
    assert.deepEqual((await b.state.keys.get('identity-key', ['204060801234567_1.0']))['204060801234567_1.0'], Buffer.from('identidad'));
    // con el almacén de relaciones de Baileys 7, leyendo desde la base
    const { LIDMappingStore } = await import('@whiskeysockets/baileys/lib/Signal/lid-mapping.js');
    const rel = new LIDMappingStore(B.addTransactionCapability(b.state.keys, loggerNulo, { maxCommitRetries: 1, delayBetweenTriesMs: 1 }), loggerNulo, async () => null);
    assert.equal(await rel.getPNForLID(LID), `${TEL}:0@s.whatsapp.net`);
    assert.equal(await rel.getLIDForPN(PN), LID);
    await db.query('DELETE FROM asistente_auth');
  });
});

describe('logs sin claves', () => {
  test('libsignal: sesiones y errores en una línea, sin claves ni números', () => {
    const salida = [];
    const c = crearConsolaSegura((m, args) => salida.push({ m, t: args.map(String).join(' ') }), { ahora: () => 'T' });
    const sesion = { registrationId: 93562557, currentRatchet: { ephemeralKeyPair: { pubKey: Buffer.from('PUBLICA'), privKey: Buffer.from('PRIVADA') }, rootKey: Buffer.from('RAIZ') }, indexInfo: { baseKey: Buffer.from('BASE'), closed: -1 }, pendingPreKey: { signedKeyId: 1, baseKey: Buffer.from('X') } };
    c.info('Closing session:', sesion);
    c.info('Opening session:', sesion);
    c.warn('Session already closed', sesion);
    c.info('Removing old closed session:', sesion);
    c.warn('Closing open session in favor of incoming prekey bundle');
    c.error('Failed to decrypt message with any known session...');
    c.error('Session error:Error: Bad MAC 5491155550001', 'Error: Bad MAC\n    at doDecryptWhisperMessage (session_cipher.js:1:1)');
    const t = salida.map((x) => x.t).join('\n');
    assert.equal(salida.length, 7, t);
    assert.match(t, /signal: se cerró una sesión/);
    assert.match(t, /signal: el otro dispositivo empezó una sesión nueva/);
    assert.match(t, /signal: error de sesión: Bad MAC #/);
    assert.ok(!/PRIVADA|PUBLICA|RAIZ|93562557|privKey|Buffer|5491155550001|doDecrypt/.test(t), t);
    // el resto: igual, pero sin bytes ni objetos con claves
    c.log('agente: algo', 3, { a: 1 });
    c.warn('otra cosa', Buffer.from('secreto'), { privKey: 'x' }, { anidado: { y: new Uint8Array([1, 2]) } }, new Error('falló\nstack'));
    assert.deepEqual(salida.at(-2).t, 'agente: algo 3 [object Object]');
    assert.equal(salida.at(-1).t, 'otra cosa [bytes] [objeto omitido] [objeto omitido] Error: falló');
  });

  test('instalada en la consola del proceso: libsignal de verdad (SessionRecord) no imprime la sesión', () => {
    const require = createRequire(import.meta.url);
    const SessionRecord = require('libsignal/src/session_record.js');
    const capt = []; const orig = {};
    for (const m of ['log', 'info', 'warn', 'error', 'debug', 'trace']) { orig[m] = console[m]; console[m] = (...a) => capt.push(a); }
    const restaurar = instalarConsolaSegura(console);
    try {
      const rec = new SessionRecord();
      const s = { indexInfo: { closed: -1, baseKey: Buffer.from('BASE') }, currentRatchet: { ephemeralKeyPair: { privKey: Buffer.from('PRIVADA') } }, registrationId: 93562557 };
      rec.closeSession(s);
      rec.closeSession(s); // "Session already closed"
    } finally { restaurar(); for (const m of Object.keys(orig)) console[m] = orig[m]; }
    const t = capt.map((a) => a.map((x) => (typeof x === 'string' ? x : require('node:util').inspect(x))).join(' ')).join('\n');
    assert.equal(capt.length, 2, t);
    assert.ok(!/PRIVADA|93562557|privKey|Buffer/.test(t), t);
    assert.match(t, /signal: se cerró una sesión/);
  });

  test('logger de Baileys: "init queries" Timed Out queda explicado y sin números', () => {
    const logs = [];
    const l = loggerMudo((...a) => logs.push(a.join(' ')));
    l.error({ err: new Error('Timed Out') }, "unexpected error in 'init queries'");
    l.warn({ lid: '204060801234567@lid', pn: PN }, `Invalid LID-PN mapping: ${LID}, ${PN}`);
    l.info({ myPN: PN }, 'Own LID session created successfully');
    const t = logs.join('\n');
    assert.match(t, /consultas iniciales.*no afecta los mensajes/);
    assert.ok(!new RegExp(TEL + '|204060801234567').test(t), t);
    assert.equal(logs.length, 3);
    assert.equal(FORMATO_SESION, 'baileys7-lid');
  });
});

describe('varios chips (19/11/2026): una sesión por chip', () => {
  test('cada chip guarda su sesión con su prefijo; borrar la de uno no toca la de los otros; candado propio', async () => {
    await db.query('DELETE FROM asistente_auth');
    assert.equal(prefijoAuth(1), ''); assert.equal(prefijoAuth(2), 'c2:'); assert.equal(prefijoAuth(12), 'c12:');
    assert.equal(candadoDeChip(1), CANDADO_WHATSAPP); assert.notEqual(candadoDeChip(2), CANDADO_WHATSAPP);
    const uno = await authEnBase({ pool: db, secretsKey: KEY, BufferJSON: B.BufferJSON, initAuthCreds: B.initAuthCreds, proto: B.proto });
    const dos = await authEnBase({ pool: db, secretsKey: KEY, BufferJSON: B.BufferJSON, initAuthCreds: B.initAuthCreds, proto: B.proto, prefijo: 'c2:' });
    await uno.state.keys.set({ session: { 'a.0': Buffer.from('s1') } }); await uno.guardarCreds();
    await dos.state.keys.set({ session: { 'a.0': Buffer.from('s2') } }); await dos.guardarCreds();
    await uno.vaciar(); await dos.vaciar();
    let { rows } = await db.query('SELECT clave FROM asistente_auth ORDER BY clave');
    assert.deepEqual(rows.map((r) => r.clave), ['c2:creds', 'c2:formato', 'c2:session-a.0', 'creds', 'formato', 'session-a.0']);
    // Cada uno lee lo suyo
    const dos2 = await authEnBase({ pool: db, secretsKey: KEY, BufferJSON: B.BufferJSON, initAuthCreds: B.initAuthCreds, proto: B.proto, prefijo: 'c2:' });
    assert.equal(Buffer.from((await dos2.state.keys.get('session', ['a.0']))['a.0']).toString(), 's2');
    // Borrar el chip 1 deja el 2; borrar el 2 deja el 1
    await borrarAuth(db, 1);
    ({ rows } = await db.query('SELECT clave FROM asistente_auth ORDER BY clave'));
    assert.deepEqual(rows.map((r) => r.clave), ['c2:creds', 'c2:formato', 'c2:session-a.0']);
    await uno.state.keys.set({ session: { 'a.0': Buffer.from('s1') } }); await uno.vaciar();
    await borrarAuth(db, 2);
    ({ rows } = await db.query('SELECT clave FROM asistente_auth ORDER BY clave'));
    assert.deepEqual(rows.map((r) => r.clave), ['session-a.0']);
    await db.query('DELETE FROM asistente_auth');
  });

  test('el estado de cada chip va a su fila y los mensajes llegan con el chip', async () => {
    await db.query("INSERT INTO asistente_whatsapp (id, rol) VALUES (2, 'captacion') ON CONFLICT (id) DO NOTHING");
    try {
      const f = fabrica(); const recibidos = [];
      const wa = nuevoWa({ chip: 2, makeSocket: f.makeSocket, alMensaje: async (ev) => { recibidos.push(ev); } });
      await wa.iniciar(); await conectado(wa, f);
      assert.ok(await hasta(async () => (await db.query('SELECT estado FROM asistente_whatsapp WHERE id = 2')).rows[0].estado === 'conectado'), 'estado en la fila del chip B');
      assert.equal(wa.chip, 2);
      await wa._alLlegar({ type: 'notify', messages: [{ key: { remoteJid: '5491155550777@s.whatsapp.net', id: 'X1', fromMe: false }, messageTimestamp: Math.floor(Date.now() / 1000), message: { conversation: 'hola' } }] });
      assert.ok(await hasta(() => recibidos.length === 1));
      assert.equal(recibidos[0].chip, 2);
      await wa.detener();
    } finally {
      await db.query('DELETE FROM asistente_whatsapp WHERE id = 2');
      await db.query('DELETE FROM asistente_auth');
    }
  });
});

