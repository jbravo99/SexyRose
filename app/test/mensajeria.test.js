// Mensajería y captación (16/11/2026): lector de planillas, normalización y limpieza de la lista, cola del día,
// seguridad (palabras de alguien muy joven → "revisar"), el agente con la invitación (no silencia, "respondió",
// "no escribir"), "se registró", el botón de comprar créditos con el número vinculado y lo que se movió de Ajustes.
// Agente (Baileys falso + Claude falso) y app reales contra Postgres. Nunca sale a la red.
//   DATABASE_URL=postgres://postgres@127.0.0.1:55432/<db> node --test test/mensajeria.test.js
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import pg from 'pg';
import { start } from '../server.js';
import { startAgente } from '../agente.js';
import { crearXlsx } from '../lib/xlsx.js';
import { leerCsv, leerPlanilla, leerXlsx } from '../lib/xlsx-lector.js';
import {
  MENSAJE_DEFAULT, contactosDeFilas, esMensajeCaptacion, motivoJoven, normalizarTelefono, respuestaInvitada,
} from '../lib/captacion.js';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('Falta DATABASE_URL.'); process.exit(1); }
const db = new pg.Pool({ connectionString: DATABASE_URL, max: 4 });
const dbAgente = new pg.Pool({ connectionString: DATABASE_URL, max: 5 });
const A = '/panel-pruebas-mensajeria-0123456789';
const USER = 'admin-msj'; const PASS = 'clave-de-prueba-larga-456';
const SITE = 'https://sexyrose.test';
const KEY = 'clave-maestra-de-prueba-mensajeria-0123456789';
const TOKEN = '888888:TEST-MENSAJERIA';
const PRESENTA = 'Hola, soy el asistente de cuenta AI de SexyRose.';
let instance; let agente; let BASE; let tmpData;

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
async function hasta(fn, ms = 4000) {
  const fin = Date.now() + ms;
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() > fin) return v; await espera(25); }
}
const resp = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

// ---------- Telegram falso ----------
const TG = { enviados: [] };
async function tgFetch(url, opts = {}) {
  const m = /^\/bot([^/]+)\/(\w+)$/.exec(new URL(url).pathname);
  if (!m || m[1] !== TOKEN) return resp(401, { ok: false });
  const p = opts.body && !(opts.body instanceof FormData) ? JSON.parse(opts.body) : {};
  switch (m[2]) {
    case 'getMe': return resp(200, { ok: true, result: { id: 1, is_bot: true, first_name: 'SR', username: 'sr_msj_bot' } });
    case 'getWebhookInfo': return resp(200, { ok: true, result: { url: '' } });
    case 'getUpdates': return resp(200, { ok: true, result: [] });
    case 'sendMessage': TG.enviados.push({ chat: String(p.chat_id), text: p.text }); return resp(200, { ok: true, result: { message_id: 1 } });
    default: return resp(200, { ok: true, result: true });
  }
}

// ---------- Claude falso ----------
const LLM = { llamadas: [], guion: null };
async function llmFetch(url, opts) {
  const body = JSON.parse(opts.body);
  LLM.llamadas.push(body);
  const r = LLM.guion ? LLM.guion(body, LLM.llamadas.length) : { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Respuesta de prueba.' }] };
  return resp(200, { type: 'message', role: 'assistant', ...r });
}

// ---------- WhatsApp falso ----------
let SOCK = null;
class SocketFalso {
  constructor() { this.ev = new EventEmitter(); this.enviados = []; this.user = { id: '5491100009999:3@s.whatsapp.net' }; }
  async sendMessage(jid, content, opts) { this.enviados.push({ jid, text: content.text, id: opts && opts.messageId }); return { key: { id: opts && opts.messageId } }; }
  async sendPresenceUpdate() {}
  async presenceSubscribe() {}
  async logout() {}
  end() {}
}
async function makeSocket() {
  const s = new SocketFalso();
  SOCK = s;
  setImmediate(() => s.ev.emit('connection.update', { qr: 'QR-MSJ' }));
  return s;
}
let nMsg = 0;
async function llega(tel, texto, { fromMe = false, jid = null } = {}) {
  const wid = 'MSJ' + (++nMsg) + crypto.randomBytes(3).toString('hex');
  await agente.wa._alLlegar({ type: 'notify', messages: [{ key: { remoteJid: jid || `${tel}@s.whatsapp.net`, fromMe, id: wid }, messageTimestamp: Math.floor(Date.now() / 1000), message: { conversation: texto } }] });
  return wid;
}
const enviadosA = (tel) => SOCK.enviados.filter((m) => m.jid === `${tel}@s.whatsapp.net`);
const ultimoA = (tel) => { const x = enviadosA(tel); return x.length ? x[x.length - 1].text : null; };

// ---------- Admin ----------
const auth = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
const adm = (p, opts = {}) => fetch(BASE + A + '/api' + p, { ...opts, headers: { authorization: auth, ...(opts.headers || {}) } });
const admJson = (method, p, body) => adm(p, { method, body: JSON.stringify(body ?? {}), headers: { 'content-type': 'application/json', 'x-sr-admin': '1', origin: BASE } });
const subir = (buf, nombre = 'contactos.xlsx', headers = {}) => adm('/captacion/importar?nombre=' + encodeURIComponent(nombre), {
  method: 'POST', body: buf, headers: { 'content-type': 'application/octet-stream', 'x-sr-admin': '1', origin: BASE, ...headers },
});
const cap = async (tel) => (await db.query('SELECT * FROM captacion_contactos WHERE telefono = $1', [tel])).rows[0];
const conv = async (tel) => (await db.query('SELECT * FROM asistente_conversaciones WHERE telefono = $1', [tel])).rows[0];

let n = 0;
async function acompanante({ whatsapp = null, nombre = 'Valentina' } = {}) {
  const email = `zzmsj-${Date.now()}-${n++}@example.com`;
  const { rows } = await db.query('INSERT INTO cuentas (email, pass_hash) VALUES ($1, $2) RETURNING id', [email, 'x']);
  const id = rows[0].id;
  await db.query("INSERT INTO perfiles (cuenta_id, slug, datos, estado, verificacion) VALUES ($1, $2, $3, 'publicado', 'verificada')",
    [id, 'zzmsj-' + id.slice(0, 8), JSON.stringify({ displayName: nombre, ...(whatsapp ? { whatsapp } : {}) })]);
  return { id, email };
}

// ---------- Un .xlsx "como el de Excel": textos compartidos, comprimido, dos hojas ----------
function zip(entradas) {
  const locales = []; const centrales = []; let off = 0;
  for (const e of entradas) {
    const datos = Buffer.from(e.datos, 'utf8');
    const comp = e.guardado ? datos : zlib.deflateRawSync(datos);
    const nombre = Buffer.from(e.nombre, 'utf8');
    const crc = zlib.crc32(datos);
    const l = Buffer.alloc(30); l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(20, 4); l.writeUInt16LE(e.guardado ? 0 : 8, 8);
    l.writeUInt32LE(crc, 14); l.writeUInt32LE(comp.length, 18); l.writeUInt32LE(datos.length, 22); l.writeUInt16LE(nombre.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(e.guardado ? 0 : 8, 10);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(datos.length, 24); c.writeUInt16LE(nombre.length, 28); c.writeUInt32LE(off, 42);
    locales.push(l, nombre, comp); centrales.push(c, nombre);
    off += 30 + nombre.length + comp.length;
  }
  const cd = Buffer.concat(centrales);
  const fin = Buffer.alloc(22); fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(entradas.length, 8); fin.writeUInt16LE(entradas.length, 10);
  fin.writeUInt32LE(cd.length, 12); fin.writeUInt32LE(off, 16);
  return Buffer.concat([...locales, cd, fin]);
}
const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// filas: arreglos de textos o números; los textos van a sharedStrings (como guarda Excel)
function xlsxExcel(hojas) {
  const ss = []; const idx = new Map();
  const s = (t) => { if (!idx.has(t)) { idx.set(t, ss.length); ss.push(t); } return idx.get(t); };
  const col = (i) => String.fromCharCode(65 + i);
  const hojaXml = (filas) => `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${filas.map((f, i) => `<row r="${i + 1}" spans="1:${f.length}">${f.map((v, j) => (v === '' || v == null ? '' : typeof v === 'number'
    ? `<c r="${col(j)}${i + 1}" s="1"><v>${v}</v></c>`
    : `<c r="${col(j)}${i + 1}" t="s"><v>${s(v)}</v></c>`)).join('')}</row>`).join('')}</sheetData></worksheet>`;
  const entradas = [
    { nombre: '[Content_Types].xml', datos: '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>' },
    { nombre: 'xl/workbook.xml', datos: `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${hojas.map((h, i) => `<sheet name="${xmlEsc(h.nombre)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
    { nombre: 'xl/_rels/workbook.xml.rels', datos: `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hojas.map((h, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>` },
    ...hojas.map((h, i) => ({ nombre: `xl/worksheets/sheet${i + 1}.xml`, datos: hojaXml(h.filas) })),
  ];
  entradas.push({ nombre: 'xl/sharedStrings.xml', datos: `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${ss.length}" uniqueCount="${ss.length}">${ss.map((t) => (t.includes('|')
    ? `<si>${t.split('|').map((p) => `<r><t xml:space="preserve">${xmlEsc(p)}</t></r>`).join('')}</si>` // texto con formato (varias partes)
    : `<si><t>${xmlEsc(t)}</t></si>`)).join('')}</sst>` });
  return zip(entradas);
}
const CABECERA = ['Nombres', 'Teléfono', 'Categoría', 'Ciudad', 'Sitios', 'Cantidad de avisos', 'URL', 'Fecha', 'Estado', 'Nota', 'Abrir WhatsApp'];

async function limpiar() {
  await db.query('DELETE FROM asistente_conversaciones');
  await db.query('DELETE FROM asistente_salida');
  await db.query('DELETE FROM asistente_auth');
  await db.query('DELETE FROM captacion_contactos');
  await db.query("DELETE FROM cuentas WHERE email LIKE 'zzmsj-%'");
  await db.query("DELETE FROM ajustes WHERE clave IN ('asistente', 'telegram', 'captacion', 'contacto')");
  await db.query('UPDATE asistente_whatsapp SET numero = NULL, por_dia = 30, pausado = false, rol = \'captacion\', recuperar_desde = NULL, recuperar_hasta = NULL, recuperados = 0 WHERE id = 1');
  await db.query('DELETE FROM asistente_whatsapp WHERE id > 1');
}

before(async () => {
  tmpData = await fs.mkdtemp(path.join(os.tmpdir(), 'srmsj-data-'));
  instance = await start({ prelanzamientoPorDefecto: false,
    port: 0, host: '127.0.0.1', databaseUrl: DATABASE_URL, adminPath: A, adminUser: USER, adminPassword: PASS,
    ipHashSalt: 'sal', siteUrl: SITE, dataDir: tmpData, log: () => {}, tareaPlanes: false, tareaContenido: false, tareaCotizacion: false, tareaGeoref: false,
    sendMail: async () => {}, secretsKey: KEY,
    telegramToken: TOKEN, telegramChatId: '', telegramFetch: tgFetch, telegramCadaMs: 30, telegramSupervisarMs: 40, asistenteEscucharMs: 200,
  });
  BASE = `http://127.0.0.1:${instance.port}`;
  await instance.ready;
  await limpiar();
  await db.query("INSERT INTO ajustes (clave, valor) VALUES ('telegram', $1)", [JSON.stringify({ chatId: '777', chatNombre: 'Juan', chatUsuario: 'juan', vinculado: new Date().toISOString(), avisos: {} })]);
  agente = await startAgente({
    pool: dbAgente, databaseUrl: DATABASE_URL, makeSocket, llmFetch, telegramFetch: tgFetch, anthropicKey: 'sk-prueba',
    telegramToken: TOKEN, telegramChatId: '', demora: () => 0, dormir: async () => {}, pausaRecuperar: async () => {}, supervisarMs: 40, dataDir: tmpData, secretsKey: KEY, siteUrl: SITE, log: () => {},
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
  test('teléfonos a E.164 de Argentina; extranjeros e inválidos se marcan', () => {
    const e = (x) => normalizarTelefono(x).telefono;
    assert.equal(e('+54 9 11 2233-4455'), '+5491122334455');
    assert.equal(e('+54 11 2233 4455'), '+5491122334455');
    assert.equal(e('011 15 2233-4455'), '+5491122334455');
    assert.equal(e('11 2233 4455'), '+5491122334455');
    assert.equal(e('5491122334455'), '+5491122334455');
    assert.equal(e('0351 15 512-3456'), '+5493515123456');
    assert.equal(e('+54 9 2944 55-1234'), '+5492944551234');
    assert.equal(normalizarTelefono('+5491122334455').comparable, '541122334455');
    assert.equal(normalizarTelefono('+34 612 345 678').motivo, 'extranjero');
    assert.equal(normalizarTelefono('1234').motivo, 'invalido');
    assert.equal(normalizarTelefono('').telefono, null);
  });

  test('palabras que sugieren una menor (sin importar mayúsculas ni tildes); "Nina" no', () => {
    for (const t of ['PENDEJITA hermosa', 'Jovencita', 'nenita', 'Nena trolita', 'LOLITA', 'colegiala', 'teen', 'soy menor', 'Adolescente', '17 años',
      '16 AÑOS', 'recién cumplidos', 'Recien cumplidos 18', 'niña', 'tengo 15']) assert.ok(motivoJoven(t), t);
    for (const t of ['Nina', 'Valentina', 'Mora 25 años', 'Sofi 18 años', 'Morena', 'Antonella', 'Belén']) assert.equal(motivoJoven(t), null, t);
  });

  test('respuestas de una invitada: rechazos, insultos y "¿quién te dio mi número?"', () => {
    for (const t of ['No', 'no gracias', 'No me interesa', 'baja', 'No me escriban más', 'dejá de escribirme', 'andate a la mierda', 'pelotudo', 'STOP']) assert.equal(respuestaInvitada(t), 'rechazo', t);
    for (const t of ['¿Quién te dio mi número?', 'de dónde sacaron mi número??', 'quien te paso mi celular']) assert.equal(respuestaInvitada(t), 'origen', t);
    for (const t of ['Hola, ¿cómo me registro?', '¿Es gratis?', 'sí, me interesa', 'no sé cómo subir las fotos, me ayudás?']) assert.equal(respuestaInvitada(t), null, t);
  });

  test('reconoce el mensaje de captación aunque cambien espacios y asteriscos', () => {
    assert.ok(esMensajeCaptacion(MENSAJE_DEFAULT, MENSAJE_DEFAULT));
    assert.ok(esMensajeCaptacion(MENSAJE_DEFAULT.replace(/\*/g, '').replace(/\n+/g, ' '), MENSAJE_DEFAULT));
    assert.ok(!esMensajeCaptacion('Hola, te escribo yo', MENSAJE_DEFAULT));
  });

  test('lector de .xlsx (textos compartidos, comprimido, hoja "Contactos" aunque no sea la primera) y de .csv', () => {
    const buf = xlsxExcel([
      { nombre: 'Avisos', filas: [['otra cosa'], ['x']] },
      { nombre: 'Contactos', filas: [CABECERA, ['Mora|, Sol', '+5491122334455', 'Escort', 'Palermo', 'skokka', 3, 'https://ejemplo.test/a', '13/11/2026', '', 'nota & más', '=HYPERLINK()']] },
    ]);
    const r = leerXlsx(buf, { hoja: 'contactos' });
    assert.equal(r.hoja, 'Contactos');
    assert.deepEqual(r.filas[0], CABECERA);
    assert.deepEqual(r.filas[1].slice(0, 6), ['Mora, Sol', '+5491122334455', 'Escort', 'Palermo', 'skokka', '3']);
    assert.equal(r.filas[1][9], 'nota & más');
    // la planilla que arma lib/xlsx.js (textos en línea)
    const propio = crearXlsx([{ nombre: 'Contactos', filas: [['Teléfono', 'Nombre'], ['+5491155556666', 'Luna']] }]);
    assert.deepEqual(leerPlanilla(propio, 'x.xlsx').filas[1], ['+5491155556666', 'Luna']);
    // CSV con ; comillas y BOM
    assert.deepEqual(leerCsv('﻿Nombre;Teléfono\n"Ana; ""la"" Rubia";011 15 2233-4455\r\n'), [['Nombre', 'Teléfono'], ['Ana; "la" Rubia', '011 15 2233-4455']]);
    assert.equal(leerPlanilla(Buffer.from('a,b\n1,2'), 'x.csv').tipo, 'csv');
    assert.throws(() => leerPlanilla(Buffer.from('PK\u0003\u0004basura'), 'x.xlsx'), /válida|dañada/);
    assert.throws(() => leerPlanilla(Buffer.from('hola'), 'viejo.xls'), /\.xls/);
    // una "bomba zip" se corta
    const bomba = zip([{ nombre: 'xl/workbook.xml', datos: '<workbook><sheets><sheet name="A" r:id="rId1"/></sheets></workbook>' },
      { nombre: 'xl/_rels/workbook.xml.rels', datos: '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>' },
      { nombre: 'xl/worksheets/sheet1.xml', datos: '<worksheet>' + ' '.repeat(45 * 1024 * 1024) + '</worksheet>' }]);
    assert.throws(() => leerXlsx(bomba), /grande/);
  });

  test('de la planilla a contactos: encabezados con otras mayúsculas o tildes, un teléfono por fila, menores y extranjeros a revisar', () => {
    const r = contactosDeFilas([
      ['NOMBRES', 'TELEFONO ', 'ciudad', 'Sitios', 'cantidad de AVISOS'],
      ['Mora', '+54 9 11 2233-4455', 'Palermo', 'skokka', '2'],
      ['Morita', '011 15 2233-4455', 'Belgrano', 'gemidos', '1'],
      ['', '', '', '', ''],
      ['Pendejita', '+5491155550101', 'Once', 'skokka', '1'],
      ['Ana', '+34612345678', 'Madrid', 'x', '1'],
      ['Sin tel', '', 'X', '', ''],
    ]);
    assert.equal(r.filasLeidas, 5);
    assert.equal(r.sinTelefono, 1);
    assert.equal(r.repetidosEnArchivo, 1);
    const mora = r.contactos.find((c) => c.telefono === '+5491122334455');
    assert.deepEqual(mora.nombres, ['Mora', 'Morita']);
    assert.deepEqual(mora.ciudades, ['Palermo', 'Belgrano']);
    assert.equal(mora.avisos, 3);
    assert.equal(mora.estado, 'pendiente');
    assert.equal(r.contactos.find((c) => c.telefono === '+5491155550101').estado, 'revisar');
    assert.match(r.contactos.find((c) => c.telefono === '+5491155550101').motivo, /mayor de edad/);
    assert.match(r.contactos.find((c) => c.telefono === '+34612345678').motivo, /extranjero/);
    assert.match(contactosDeFilas([['Nombre', 'Ciudad'], ['a', 'b']]).error, /teléfono/);
  });

  test('la planilla de Juan: títulos arriba, encabezados con barras y paréntesis ("Nombre / alias", "Sitio(s)"…)', () => {
    const r = contactosDeFilas([
      ['SexyRose — Contactos relevados de sitios de avisos'],
      ['Una fila por teléfono…'],
      [],
      ['Nombre / alias', 'Teléfono (WhatsApp)', 'Categoría', 'Ciudad / zona', 'Sitio(s)', 'Avisos con este teléfono', 'URL del aviso', 'Fecha de relevamiento', 'Estado', 'Nota', 'WhatsApp (mensaje listo)'],
      ['Bibi M. / Sofy', '+5491153487597', 'Trans', 'Capital Federal / Caballito', 'sexo3.com, distintas.net', '3', 'https://www.sexo3.com/es/x', '2026-11-13', 'Pendiente', 'Mismo teléfono', 'Abrir WhatsApp'],
      ['Lolita', '+5491155550202', 'Escort', 'Rosario', 'skokka', '1', 'https://ar.skokka.com/x', '2026-11-13', 'Pendiente', '', 'Abrir WhatsApp'],
    ]);
    assert.deepEqual(r.columnas, ['nombres', 'telefono', 'categoria', 'ciudad', 'sitios', 'avisos', 'url', 'fecha', 'estado', 'nota']);
    const bibi = r.contactos.find((c) => c.telefono === '+5491153487597');
    assert.deepEqual(bibi.nombres, ['Bibi M.', 'Sofy']);
    assert.deepEqual(bibi.ciudades, ['Capital Federal', 'Caballito']);
    assert.deepEqual(bibi.sitios, ['sexo3.com', 'distintas.net']);
    assert.equal(bibi.avisos, 3);
    assert.equal(bibi.estado, 'pendiente');
    const lol = r.contactos.find((c) => c.telefono === '+5491155550202');
    assert.equal(lol.estado, 'revisar', 'el nombre se lee y las palabras de alguien muy joven lo mandan a revisar');
  });
});

describe('captación: importar, cola y estados', () => {
  test('el admin pide usuario y contraseña, la cabecera del panel y el mismo origen', async () => {
    assert.equal((await fetch(BASE + A + '/api/captacion')).status, 401);
    assert.equal((await fetch(BASE + A + '/api/captacion/importar', { method: 'POST', body: 'x', headers: { 'content-type': 'application/octet-stream' } })).status, 401);
    assert.equal((await subir(Buffer.from('a'), 'x.csv', { 'x-sr-admin': '' })).status, 403);
    assert.equal((await subir(Buffer.from('a'), 'x.csv', { origin: 'https://otro.test' })).status, 403);
    assert.equal((await admJson('POST', '/captacion/importar', { a: 1 })).status, 415);
    assert.equal((await adm('/captacion/vaciar', { method: 'POST', body: '{"confirmar":true}', headers: { 'content-type': 'application/json', origin: BASE } })).status, 403);
    assert.equal((await adm('/captacion/ajustes', { method: 'PUT', body: '{}', headers: { 'content-type': 'application/json', 'x-sr-admin': '1', origin: 'https://otro.test' } })).status, 403);
    const r = await adm('/captacion');
    assert.equal(r.status, 200);
    const d = await r.json();
    assert.equal(d.numeros.total, 0);
    assert.equal(d.ajustes.mensaje, MENSAJE_DEFAULT);
    assert.equal(d.cola.porDia, 30);
  });

  test('importa la hoja Contactos: sin duplicados, excluye los teléfonos del sitio, menores y extranjeros a revisar', async () => {
    await acompanante({ whatsapp: '+541155550200', nombre: 'Ya Publicada' }); // sin el 9: igual es la misma
    const filas = [CABECERA,
      ['Mora', '+5491155550201', 'Escort', 'Palermo', 'skokka', 5, '', '', '', '', ''],
      ['Luna', '+5491155550202', 'Escort', 'Córdoba', 'gemidos', 9, '', '', '', '', ''],
      ['Sol', '+5491155550203', 'Trans', 'Almagro', 'distintas', 1, '', '', '', '', ''],
      ['Kiara', '+5491155550204', 'Escort', 'Rosario', 'pkadoras', 5, '', '', '', '', ''],
      ['Mora la de Palermo', '011 15 5555-0201', 'Escort', 'Palermo', 'gemidos', 2, '', '', '', '', ''],
      ['Jovencita', '+5491155550205', 'Escort', 'Once', 'skokka', 20, '', '', '', '', ''],
      ['Anto', '+5491155550206', 'Escort', 'Flores', 'skokka', 3, '', '', '', 'Revisar: dice nena en el aviso', ''],
      ['Extranjera', '+34612345678', 'Escort', 'Madrid', 'x', 1, '', '', '', '', ''],
      ['Ya Publicada', '+5491155550200', 'Escort', 'Caballito', 'skokka', 4, '', '', '', '', ''],
      ['Dejala', '+5491155550207', 'Escort', 'Caballito', 'skokka', 4, '', '', 'No escribir', '', ''],
    ];
    const r = await subir(xlsxExcel([{ nombre: 'Avisos', filas: [['nada']] }, { nombre: 'Contactos', filas }]));
    assert.equal(r.status, 200, await r.clone().text());
    const d = await r.json();
    assert.equal(d.hoja, 'Contactos');
    assert.equal(d.telefonos, 9);
    assert.equal(d.repetidosEnArchivo, 1);
    assert.equal(d.nuevos, 9);
    assert.equal(d.enSitio, 1);
    assert.equal(d.revisar, 3);
    assert.deepEqual((await cap('+5491155550201')).nombres, ['Mora', 'Mora la de Palermo']);
    assert.equal((await cap('+5491155550201')).avisos, 7);
    assert.equal((await cap('+5491155550200')).estado, 'en_sitio');
    assert.equal((await cap('+5491155550205')).estado, 'revisar');
    assert.equal((await cap('+5491155550205')).tipo_motivo, 'joven');
    assert.equal((await cap('+5491155550206')).tipo_motivo, 'joven');
    assert.equal((await cap('+34612345678')).estado, 'revisar');
    assert.equal((await cap('+5491155550207')).estado, 'no_escribir');
    const e = d.resumen.estados;
    assert.equal(e.pendiente, 4); assert.equal(e.revisar, 3); assert.equal(e.en_sitio, 1); assert.equal(e.no_escribir, 1);
    // Cola: los de más avisos primero; nunca los de "revisar", "no escribir" ni los que ya están en el sitio
    const ids = d.resumen.cola.items.map((x) => x.nombres[0]);
    assert.deepEqual(ids, ['Luna', 'Mora', 'Kiara', 'Sol']);
    assert.ok(d.resumen.cola.items.every((x) => x.waUrl.startsWith('https://wa.me/549115555020') && x.waUrl.includes(encodeURIComponent('Te escribo de SexyRose'))));
    assert.ok(d.resumen.cola.items.every((x) => /\*{4}/.test(x.telefono)), 'teléfono enmascarado');
    assert.ok(d.resumen.revisar.every((x) => !x.waUrl && x.motivo));
    assert.equal(d.resumen.revisar[0].tipoMotivo, 'joven');
  });

  test('cola: N por día (configurable) y en orden; se descuenta lo enviado hoy', async () => {
    let r = await admJson('PUT', '/captacion/ajustes', { porDia: 0 });
    assert.equal(r.status, 400);
    // Varios chips (19/11/2026): el cupo es por chip (Admin → Mensajería → WhatsApp)
    r = await admJson('PUT', '/asistente/chips/1', { porDia: 2 });
    assert.equal(r.status, 200);
    let d = await (await adm('/captacion')).json();
    assert.deepEqual(d.cola.chip, { id: 1, letra: 'A', conectado: false });
    assert.deepEqual(d.cola.items.map((x) => x.nombres[0]), ['Luna', 'Mora']);
    const kiara = await cap('+5491155550204');
    r = await admJson('POST', `/captacion/${kiara.id}/estado`, { estado: 'enviado' });
    assert.equal(r.status, 200);
    d = await (await adm('/captacion')).json();
    assert.equal(d.cola.enviadosHoy, 1);
    assert.equal(d.cola.items.length, 1);
    assert.equal(d.numeros.enviadosSemana, 1);
    // deshacer (vuelve a pendiente) y volver a 30 por día
    assert.equal((await admJson('POST', `/captacion/${kiara.id}/estado`, { estado: 'pendiente' })).status, 200);
    assert.equal((await admJson('PUT', '/asistente/chips/1', { porDia: 30 })).status, 200);
  });

  test('"revisar" nunca entra en la cola ni se puede abrir; "Revisado: es mayor de edad" lo devuelve; "Descartar"', async () => {
    const j = await cap('+5491155550205');
    assert.equal((await admJson('POST', `/captacion/${j.id}/abierto`, {})).status, 409);
    assert.equal((await admJson('POST', `/captacion/${j.id}/estado`, { estado: 'enviado' })).status, 409);
    assert.equal((await admJson('POST', `/captacion/${j.id}/estado`, { estado: 'pendiente' })).status, 409);
    let d = await (await adm('/captacion')).json();
    assert.ok(!d.cola.items.some((x) => x.id === j.id));
    let r = await admJson('POST', `/captacion/${j.id}/estado`, { estado: 'revisado' });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).contacto.estado, 'pendiente');
    d = await (await adm('/captacion')).json();
    assert.equal(d.cola.items[0].id, j.id, 'tiene 20 avisos: primera');
    const anto = await cap('+5491155550206');
    r = await admJson('POST', `/captacion/${anto.id}/estado`, { estado: 'descartado' });
    assert.equal((await r.json()).contacto.estado, 'descartado');
    assert.equal((await admJson('POST', `/captacion/${anto.id}/estado`, { estado: 'cualquiera' })).status, 400);
    // "no escribir" nunca vuelve a la cola
    const dej = await cap('+5491155550207');
    assert.equal((await admJson('POST', `/captacion/${dej.id}/estado`, { estado: 'pendiente' })).status, 409);
    assert.equal((await admJson('POST', `/captacion/${dej.id}/estado`, { estado: 'revisado' })).status, 409);
  });

  test('"No disponible" (19/11/2026): el número ya no tiene WhatsApp; sale de la cola, libera el cupo y se puede volver atrás', async () => {
    const mora = await cap('+5491155550201');
    assert.equal((await admJson('POST', `/captacion/${mora.id}/abierto`, {})).status, 200);
    assert.equal((await admJson('POST', `/captacion/${mora.id}/estado`, { estado: 'enviado' })).status, 200);
    let d = await (await adm('/captacion')).json();
    const hoy = d.cola.enviadosHoy;
    let r = await admJson('POST', `/captacion/${mora.id}/estado`, { estado: 'no_disponible' });
    assert.equal(r.status, 200);
    const x = (await r.json()).contacto;
    assert.equal(x.estado, 'no_disponible');
    assert.equal(x.enviado, null, 'no le llegó nada: no cuenta como enviado');
    assert.equal(x.waUrl, null);
    d = await (await adm('/captacion')).json();
    assert.equal(d.cola.enviadosHoy, hoy - 1);
    assert.ok(!d.cola.items.some((c) => c.id === mora.id));
    assert.equal(d.estados.no_disponible, 1);
    const l = await (await adm('/captacion/contactos?estado=no_disponible')).json();
    assert.deepEqual(l.items.map((c) => c.id), [mora.id]);
    // no se puede abrir; "revisar" nunca pasa a no disponible (no saltea la revisión)
    assert.equal((await admJson('POST', `/captacion/${mora.id}/abierto`, {})).status, 409);
    const rev = (await db.query("SELECT id FROM captacion_contactos WHERE estado = 'revisar' LIMIT 1")).rows[0];
    assert.equal((await admJson('POST', `/captacion/${rev.id}/estado`, { estado: 'no_disponible' })).status, 409);
    // volver a la cola
    r = await admJson('POST', `/captacion/${mora.id}/estado`, { estado: 'pendiente' });
    assert.equal((await r.json()).contacto.estado, 'pendiente');
    d = await (await adm('/captacion')).json();
    assert.ok(d.cola.items.some((c) => c.id === mora.id));
  });

  test('volver a subir la planilla une sin duplicar, conserva los estados y un pendiente con palabras de menor pasa a revisar', async () => {
    const kiara = await cap('+5491155550204');
    await admJson('POST', `/captacion/${kiara.id}/estado`, { estado: 'enviado' });
    const csv = 'Nombres;Teléfono;Ciudad;Sitios;Cantidad de avisos\n'
      + 'Kiara Rubia;+5491155550204;Rosario;skokka;1\n'
      + 'Sol pendejita;+5491155550203;Almagro;distintas;1\n'
      + 'Jovencita;+5491155550205;Once;skokka;1\n' // ya revisada por Juan: no vuelve a revisar
      + 'Nueva;+5491155550208;Mar del Plata;skokka;1\n';
    const r = await subir(Buffer.from(csv, 'utf8'), 'contactos.csv');
    assert.equal(r.status, 200, await r.clone().text());
    const d = await r.json();
    assert.equal(d.tipo, 'csv');
    assert.equal(d.nuevos, 1); assert.equal(d.actualizados, 3);
    const k = await cap('+5491155550204');
    assert.equal(k.estado, 'enviado');
    assert.deepEqual(k.nombres, ['Kiara', 'Kiara Rubia']);
    assert.equal(k.avisos, 5);
    assert.equal((await cap('+5491155550203')).estado, 'revisar');
    assert.equal((await cap('+5491155550205')).estado, 'pendiente');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM captacion_contactos')).rows[0].n, 10);
    const l = await (await adm('/captacion/contactos?estado=revisar')).json();
    assert.ok(l.items.some((x) => x.nombres.includes('Sol pendejita')));
    assert.equal((await adm('/captacion/contactos?estado=otro')).status, 400);
    const q = await (await adm('/captacion/contactos?q=rosario')).json();
    assert.equal(q.total, 1);
  });

  test('planillas inválidas: sin columna de teléfono, sin teléfonos o demasiado grande', async () => {
    let r = await subir(Buffer.from('Nombre,Ciudad\nAna,Once\n'), 'x.csv');
    assert.equal(r.status, 400);
    assert.match((await r.json()).error, /teléfono/);
    r = await subir(Buffer.from('Nombre,Teléfono\nAna,\n'), 'x.csv');
    assert.equal(r.status, 400);
    r = await subir(Buffer.alloc(9 * 1024 * 1024, 65), 'x.csv');
    assert.equal(r.status, 413);
  });
});

describe('captación en el agente', () => {
  test('prender el asistente y vincular el chip', async () => {
    let r = await admJson('PUT', '/asistente/ajustes', { activo: true });
    assert.equal(r.status, 200);
    assert.ok(await hasta(() => SOCK), 'socket');
    await hasta(async () => (await (await adm('/asistente')).json()).whatsapp.estado === 'esperando_qr');
    SOCK.ev.emit('connection.update', { connection: 'open' });
    const e = await hasta(async () => { const x = await (await adm('/asistente')).json(); return x.whatsapp.estado === 'conectado' ? x : null; });
    assert.ok(e);
  });

  test('la invitación que Juan manda desde WhatsApp Web marca "enviado" y NO silencia al bot', async () => {
    const tel = '5491155550201';
    const c = await cap('+' + tel);
    assert.equal((await admJson('POST', `/captacion/${c.id}/abierto`, {})).status, 200);
    assert.equal((await cap('+' + tel)).estado, 'abierto');
    const antes = SOCK.enviados.length;
    await llega(tel, MENSAJE_DEFAULT, { fromMe: true });
    const x = await cap('+' + tel);
    assert.equal(x.estado, 'enviado');
    assert.ok(x.enviado);
    const k = await conv(tel);
    assert.equal(k.silenciado_hasta, null, 'sin silencio');
    assert.equal(k.captacion_id, c.id);
    const { rows } = await db.query('SELECT origen, dir FROM asistente_mensajes WHERE conversacion_id = $1', [k.id]);
    assert.deepEqual(rows, [{ origen: 'captacion', dir: 'out' }]);
    assert.equal(SOCK.enviados.length, antes, 'el bot no manda nada');
    const d = await (await adm('/captacion')).json();
    assert.ok(!d.cola.items.some((y) => y.id === c.id));
    assert.ok(d.numeros.enviadosHoy >= 1);
  });

  test('cuando responde: "respondió" y el asistente contesta con el contexto de la invitación (y la presentación como IA)', async () => {
    const tel = '5491155550201';
    LLM.guion = () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Crear tu perfil es gratis con el plan Bronce. Te registrás en sexyrose.test/registro.' }] });
    const n0 = LLM.llamadas.length;
    await llega(tel, 'Hola! ¿cómo me registro? ¿es gratis?');
    assert.equal((await cap('+' + tel)).estado, 'respondio');
    assert.ok((await cap('+' + tel)).respondio);
    const t = ultimoA(tel);
    assert.ok(t.startsWith(PRESENTA), t);
    assert.match(t, /plan Bronce/);
    const b = LLM.llamadas[n0];
    assert.match(b.system, /invitación de SexyRose/);
    assert.match(b.system, /de su aviso publicado en otro sitio/);
    assert.ok(b.tools.some((h) => h.name === 'no_contactar'));
    LLM.guion = null;
    // en el admin aparece con el filtro Captación
    const l = await (await adm('/asistente/conversaciones?estado=captacion')).json();
    assert.equal(l.items.length, 1);
    assert.deepEqual(l.items[0].captacion.estado, 'respondio');
    const e = await (await adm('/asistente')).json();
    assert.equal(e.conversaciones.captacion, 1);
    // un chat que no es de captación no tiene la herramienta
    const n1 = LLM.llamadas.length;
    await llega('5491155559998', 'hola, ¿cómo cargo créditos?');
    assert.ok(!LLM.llamadas[n1].tools.some((h) => h.name === 'no_contactar'));
    assert.doesNotMatch(LLM.llamadas[n1].system, /invitación de SexyRose/);
    const d = await (await adm('/captacion')).json();
    assert.equal(d.numeros.respondieron, 1);
    assert.ok(d.numeros.tasaRespuesta > 0);
  });

  test('"no me interesa": una respuesta amable, "no escribir" y nunca más en la cola; otro "no" no se contesta', async () => {
    const tel = '5491155550202';
    await llega(tel, MENSAJE_DEFAULT.replace(/\*/g, ''), { fromMe: true }); // Juan mandó la invitación (sin "Abrir chat")
    assert.equal((await cap('+' + tel)).estado, 'enviado');
    const n0 = LLM.llamadas.length;
    await llega(tel, 'No me interesa, gracias');
    const x = await cap('+' + tel);
    assert.equal(x.estado, 'no_escribir');
    assert.ok(x.respondio && x.no_escribir);
    assert.equal(ultimoA(tel), `${PRESENTA}\n\nPerfecto, no te vamos a escribir más. Disculpá la molestia.`);
    assert.equal(LLM.llamadas.length, n0, 'sin IA');
    const antes = enviadosA(tel).length;
    await llega(tel, 'NO');
    assert.equal(enviadosA(tel).length, antes);
    const d = await (await adm('/captacion')).json();
    assert.ok(!d.cola.items.some((y) => y.id === x.id));
    // ni volviendo a subir la planilla
    await subir(Buffer.from('Nombres,Teléfono\nLuna,+5491155550202\n'), 'x.csv');
    assert.equal((await cap('+' + tel)).estado, 'no_escribir');
    assert.equal((await admJson('POST', `/captacion/${x.id}/abierto`, {})).status, 409);
  });

  test('"¿quién te dio mi número?": de su aviso en otro sitio y "no escribir"; la IA también puede usar no_contactar', async () => {
    const tel = '5491155550204';
    await llega(tel, MENSAJE_DEFAULT, { fromMe: true }); // ya estaba "enviado": reenvío, no silencia
    assert.equal((await conv(tel)).silenciado_hasta, null);
    await llega(tel, '¿Quién te dio mi número?');
    assert.equal(ultimoA(tel), `${PRESENTA}\n\nTu número lo vimos en tu aviso publicado en otro sitio. Perfecto, no te vamos a escribir más. Disculpá la molestia.`);
    assert.equal((await cap('+' + tel)).estado, 'no_escribir');

    const tel2 = '5491155550205';
    await llega(tel2, MENSAJE_DEFAULT, { fromMe: true });
    LLM.guion = (body, i) => (body.messages.length === 1
      ? { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'tu_nc' + i, name: 'no_contactar', input: { motivo: 'No quiere' } }] }
      : { stop_reason: 'end_turn', content: [{ type: 'text', text: 'no debería salir' }] });
    await llega(tel2, 'Mirá, la verdad que ahora estoy con otras cosas y prefiero que no');
    LLM.guion = null;
    assert.equal((await cap('+' + tel2)).estado, 'no_escribir');
    assert.equal(ultimoA(tel2), `${PRESENTA}\n\nPerfecto, no te vamos a escribir más. Disculpá la molestia.`);
  });

  test('si después Juan escribe a mano en ese chat, rige el silencio de 12 h de siempre', async () => {
    const tel = '5491155550201';
    await llega(tel, 'Hola, soy Juan. Cualquier cosa avisame.', { fromMe: true });
    const k = await conv(tel);
    assert.ok(new Date(k.silenciado_hasta) > new Date(Date.now() + 11.9 * 3600 * 1000));
    const { rows } = await db.query('SELECT origen FROM asistente_mensajes WHERE conversacion_id = $1 ORDER BY id DESC LIMIT 1', [k.id]);
    assert.equal(rows[0].origen, 'juan');
    const antes = enviadosA(tel).length;
    await llega(tel, 'dale gracias');
    assert.equal(enviadosA(tel).length, antes);
  });

  test('chat sin número (@lid): la invitación se asocia al único "Abrir chat" reciente', async () => {
    const c = await cap('+5491155550208');
    await admJson('POST', `/captacion/${c.id}/abierto`, {});
    await llega(null, MENSAJE_DEFAULT, { fromMe: true, jid: '123456789012345@lid' });
    assert.equal((await cap('+5491155550208')).estado, 'enviado');
    const { rows } = await db.query("SELECT captacion_id, silenciado_hasta FROM asistente_conversaciones WHERE jid = '123456789012345@lid'");
    assert.equal(rows[0].captacion_id, c.id);
    assert.equal(rows[0].silenciado_hasta, null);
  });

  test('"se registró": un perfil con ese WhatsApp (al crearse o al editarlo) lo marca solo', async () => {
    const ac = await acompanante({ whatsapp: '+5491155550203', nombre: 'Sol' }); // estaba en "revisar"
    let x = await cap('+5491155550203');
    assert.equal(x.estado, 'se_registro');
    assert.equal(x.cuenta_id, ac.id);
    const ac2 = await acompanante({ nombre: 'Kiara sin número' });
    await db.query("UPDATE perfiles SET datos = datos || '{\"whatsapp\": \"+541155550206\"}'::jsonb WHERE cuenta_id = $1", [ac2.id]);
    x = await cap('+5491155550206');
    assert.equal(x.estado, 'se_registro');
    const d = await (await adm('/captacion')).json();
    assert.equal(d.numeros.registrados, 2);
    const l = await (await adm('/captacion/contactos?estado=se_registro')).json();
    assert.ok(l.items.every((y) => y.cuenta && y.cuenta.id));
    assert.equal(l.items.find((y) => y.cuenta.id === ac.id).cuenta.nombre, 'Sol');
  });

  test('Vaciar lista: pide confirmar y deja solo los que se registraron', async () => {
    assert.equal((await admJson('POST', '/captacion/vaciar', {})).status, 400);
    const r = await admJson('POST', '/captacion/vaciar', { confirmar: true });
    assert.equal(r.status, 200);
    const d = await r.json();
    assert.ok(d.borrados >= 8);
    const { rows } = await db.query('SELECT estado FROM captacion_contactos');
    assert.ok(rows.length === 2 && rows.every((x) => x.estado === 'se_registro'));
    // los chats quedan, sin el vínculo a captación
    assert.equal((await db.query('SELECT count(*)::int AS n FROM asistente_conversaciones WHERE captacion_id IS NOT NULL')).rows[0].n, 0);
  });
});

describe('lo que se movió de Ajustes', () => {
  test('el botón de comprar créditos usa el número vinculado al asistente; sin chip, el que estaba guardado', async () => {
    await db.query('UPDATE asistente_whatsapp SET numero = NULL WHERE id = 1');
    await admJson('PUT', '/ajustes/contacto', { valor: { whatsapp: '5491122334455', telegram: 'sr_soporte', telegramActivo: true } });
    let e = await (await adm('/integraciones/whatsapp/ejemplo')).json();
    assert.ok(e.whatsappUrl.startsWith('https://wa.me/5491122334455?text='), e.whatsappUrl);
    let a = await (await adm('/asistente')).json();
    assert.deepEqual(a.botonCreditos, { vinculado: null, guardado: '+5491122334455', usa: 'guardado' });
    // el agente guarda el número del chip al conectar (5491100009999 en el socket falso)
    await db.query("UPDATE asistente_whatsapp SET numero = '5491100009999' WHERE id = 1");
    e = await (await adm('/integraciones/whatsapp/ejemplo')).json();
    assert.ok(e.whatsappUrl.startsWith('https://wa.me/5491100009999?text='), e.whatsappUrl);
    a = await (await adm('/asistente')).json();
    assert.deepEqual(a.botonCreditos, { vinculado: '+5491100009999', guardado: '+5491122334455', usa: 'vinculado' });
    // en un pedido real (panel de la acompañante)
    const ac = await acompanante();
    const p = await instance.ctx.creditos.crearPedido(ac.id, { packId: 'trimestre-plata' });
    const full = await instance.ctx.creditos.pedidosDeCuenta(ac.id);
    assert.ok(full.find((x) => x.id === p.id).whatsappUrl.startsWith('https://wa.me/5491100009999?text='));
    assert.equal(full.find((x) => x.id === p.id).telegramUrl, 'https://t.me/sr_soporte');
  });

  test('Mensajería → Telegram guarda el usuario de Telegram sin perder el WhatsApp guardado (ningún ajuste se pierde)', async () => {
    const antes = (await (await adm('/ajustes')).json());
    let r = await admJson('PUT', '/ajustes/contacto', { valor: { telegram: '@otro_usuario', telegramActivo: false } });
    assert.equal(r.status, 200);
    assert.deepEqual((await r.json()).valor, { whatsapp: '5491122334455', telegram: 'otro_usuario', telegramActivo: false });
    r = await admJson('PUT', '/ajustes/contacto', { valor: { telegram: '', telegramActivo: true } });
    assert.equal(r.status, 400);
    const despues = await (await adm('/ajustes')).json();
    assert.deepEqual(despues.mensajes, antes.mensajes);
    assert.equal(despues.contacto.whatsapp, '5491122334455');
    // la vinculación de Telegram y los avisos siguen en la misma API
    const tg = await (await adm('/integraciones/telegram')).json();
    assert.ok(tg.vinculado && Array.isArray(tg.avisos));
    // el ajuste del asistente sigue igual (las cuentas para transferir están en sus listas: Créditos → Banco)
    assert.equal((await (await adm('/asistente')).json()).ajustes.activo, true);
  });

  test('los avisos de Telegram del asistente dicen "Admin → Mensajería"', async () => {
    const tel = '5491155559997';
    LLM.guion = (body, i) => (body.messages.length === 1
      ? { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'tu_d' + i, name: 'derivar_a_juan', input: { motivo: 'Pide una persona' } }] }
      : { stop_reason: 'end_turn', content: [] });
    await llega(tel, 'quiero hablar con una persona');
    LLM.guion = null;
    const m = await hasta(() => TG.enviados.find((x) => /pasa a vos/.test(x.text)));
    assert.match(m.text, /Admin → Mensajería/);
    assert.doesNotMatch(m.text, /Admin → Asistente/);
  });

  test('el mensaje de captación se edita y vuelve al texto aprobado', async () => {
    let r = await admJson('PUT', '/captacion/ajustes', { mensaje: 'corto' });
    assert.equal(r.status, 400);
    r = await admJson('PUT', '/captacion/ajustes', { mensaje: 'Hola, te escribimos de SexyRose para invitarte a publicar gratis.' });
    assert.equal((await r.json()).ajustes.mensaje, 'Hola, te escribimos de SexyRose para invitarte a publicar gratis.');
    r = await admJson('PUT', '/captacion/ajustes', { mensaje: '' });
    assert.equal((await r.json()).ajustes.mensaje, MENSAJE_DEFAULT);
  });
});

describe('varios chips (19/11/2026)', () => {
  const decodificar = (u) => decodeURIComponent(new URL(u).searchParams.get('text'));
  const V = [
    'Hola, ¿qué tal? Somos SexyRose (sexyrose.net), versión uno del mensaje de invitación para probar.',
    'Buenas, ¿cómo andás? Te escribe SexyRose (sexyrose.net), versión dos del mensaje de invitación para probar.',
    'Hola, ¿cómo va? Desde SexyRose (sexyrose.net) te escribimos: versión tres del mensaje de invitación para probar.',
  ];
  let sockB = null;

  test('agregar chips (letras, rol, cupo, pausa); el agente los toma; el A no se quita', async () => {
    const antes = SOCK;
    let r = await admJson('POST', '/asistente/chips', { rol: 'captacion', porDia: 3 });
    assert.equal(r.status, 201);
    let d = await r.json();
    assert.deepEqual(d.chips.map((c) => [c.letra, c.rol, c.porDia]), [['A', 'captacion', 30], ['B', 'captacion', 3]]);
    assert.ok(await hasta(() => agente.chips.has(2)), 'el agente toma el chip B');
    assert.ok(await hasta(() => SOCK !== antes), 'socket del chip B');
    sockB = SOCK;
    sockB.ev.emit('connection.update', { connection: 'open' });
    assert.ok(await hasta(async () => (await (await adm('/asistente')).json()).chips.find((c) => c.letra === 'B').estado === 'conectado'));
    r = await admJson('POST', '/asistente/chips', { rol: 'creditos' });
    d = await r.json();
    assert.deepEqual(d.chips.map((c) => c.letra), ['A', 'B', 'C']);
    assert.equal((await admJson('POST', '/asistente/chips', { rol: 'otro' })).status, 400);
    assert.equal((await admJson('PUT', '/asistente/chips/2', { porDia: 0 })).status, 400);
    assert.equal((await admJson('DELETE', '/asistente/chips/1', {})).status, 409);
    // desvincular uno solo: la salida lleva el chip
    assert.equal((await admJson('POST', '/asistente/desvincular', { chip: 9 })).status, 404);
  });

  test('captación: la cola rota al chip con más cupo, se puede elegir otro, y cada envío cuenta para su chip', async () => {
    const csv = 'Nombres;Teléfono;Ciudad;Sitios;Cantidad de avisos\n'
      + 'Uno;+5491155550901;Rosario;skokka;9\nDos;+5491155550902;Rosario;skokka;8\nTres;+5491155550903;Rosario;skokka;7\nCuatro;+5491155550904;Rosario;skokka;6\n';
    assert.equal((await subir(Buffer.from(csv, 'utf8'), 'chips.csv')).status, 200);
    let d = await (await adm('/captacion')).json();
    // A ya mandó hoy (pruebas de arriba) → le queda menos que su cupo; B tiene 3 libres
    const a = d.chips.find((c) => c.letra === 'A'); const b = d.chips.find((c) => c.letra === 'B');
    assert.equal(b.cupo, 3);
    assert.ok(!d.chips.some((c) => c.letra === 'C'), 'el chip de créditos no manda invitaciones');
    const esperado = a.cupo > b.cupo ? 'A' : 'B';
    assert.equal(d.cola.chip.letra, esperado);
    d = await (await adm('/captacion?chip=2')).json();
    assert.equal(d.cola.chip.letra, 'B');
    assert.equal(d.cola.items.length, 3, 'cupo del chip B');
    // Abrir chat con el B y que salga desde el B
    const c = d.cola.items.find((x) => x.nombres[0] === 'Uno');
    assert.equal((await admJson('POST', `/captacion/${c.id}/abierto`, { chip: 2 })).status, 200);
    assert.equal((await cap('+5491155550901')).chip, 2);
    await agente.chips.get(2)._alLlegar({ type: 'notify', messages: [{ key: { remoteJid: '5491155550901@s.whatsapp.net', fromMe: true, id: 'CHIPB1' }, messageTimestamp: Math.floor(Date.now() / 1000), message: { conversation: MENSAJE_DEFAULT } }] });
    const x = await cap('+5491155550901');
    assert.deepEqual([x.estado, x.chip], ['enviado', 2]);
    const k = (await db.query('SELECT * FROM asistente_conversaciones WHERE telefono = $1', ['5491155550901'])).rows;
    assert.deepEqual(k.map((y) => y.chip), [2], 'el chat es del chip B');
    d = await (await adm('/captacion?chip=2')).json();
    assert.equal(d.chips.find((y) => y.letra === 'B').enviadosHoy, 1);
    assert.equal(d.cola.items.length, 2);
    // Pausado: no aparece para mandar
    await admJson('PUT', '/asistente/chips/2', { pausado: true });
    d = await (await adm('/captacion?chip=2')).json();
    assert.ok(!d.chips.some((y) => y.letra === 'B'));
    assert.equal(d.cola.chip.letra, 'A');
    await admJson('PUT', '/asistente/chips/2', { pausado: false });
  });

  test('cuando responde en el chip B, el asistente contesta por el B; si hay chip de créditos, las compras se derivan allá', async () => {
    await db.query("UPDATE asistente_whatsapp SET numero = '5491100007777' WHERE id = 3");
    LLM.guion = () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Te paso el link de créditos.' }] });
    const n0 = LLM.llamadas.length; const enA = SOCK === sockB ? 0 : null;
    const antesB = sockB.enviados.length;
    await agente.chips.get(2)._alLlegar({ type: 'notify', messages: [{ key: { remoteJid: '5491155550901@s.whatsapp.net', fromMe: false, id: 'CHIPB2' }, messageTimestamp: Math.floor(Date.now() / 1000), message: { conversation: 'Hola, quiero comprar créditos' } }] });
    assert.ok(await hasta(() => sockB.enviados.length > antesB), 'responde por el chip B');
    assert.equal(sockB.enviados.at(-1).jid, '5491155550901@s.whatsapp.net');
    const llamada = LLM.llamadas[n0];
    assert.ok(JSON.stringify(llamada.system).includes('https://wa.me/5491100007777'));
    const nombres = (llamada.tools || []).map((t) => t.name);
    assert.ok(!nombres.includes('crear_pedido') && !nombres.includes('datos_transferencia'), nombres.join(','));
    assert.equal((await cap('+5491155550901')).estado, 'respondio');
    void enA;
    // "Cargar créditos": el chip de créditos; pausado, vuelve al A
    let a = await (await adm('/asistente')).json();
    assert.equal(a.botonCreditos.vinculado, '+5491100007777');
    await admJson('PUT', '/asistente/chips/3', { pausado: true });
    a = await (await adm('/asistente')).json();
    assert.notEqual(a.botonCreditos.vinculado, '+5491100007777');
    LLM.guion = null;
  });

  test('versiones del mensaje: cada contacto recibe siempre la misma y el asistente reconoce cualquiera', async () => {
    let r = await admJson('PUT', '/captacion/ajustes', { mensajes: [V[0], V[1], V[2]] });
    assert.equal(r.status, 200);
    assert.equal((await admJson('PUT', '/captacion/ajustes', { mensajes: ['corto'] })).status, 400);
    assert.equal((await admJson('PUT', '/captacion/ajustes', { mensajes: Array(6).fill(V[0]) })).status, 400);
    const d = await (await adm('/captacion?chip=1')).json();
    assert.deepEqual(d.ajustes.mensajes, V);
    const textos = d.cola.items.map((x) => decodificar(x.waUrl));
    assert.ok(textos.every((t) => V.includes(t)));
    const otra = await (await adm('/captacion?chip=1')).json();
    assert.deepEqual(otra.cola.items.map((x) => decodificar(x.waUrl)), textos, 'siempre la misma versión');
    // Un envío con la versión dos se reconoce como invitación
    const c = d.cola.items.find((x) => x.nombres[0] === 'Dos');
    await admJson('POST', `/captacion/${c.id}/abierto`, { chip: 1 });
    await llega('5491155550902', V[1], { fromMe: true });
    assert.equal((await cap('+5491155550902')).estado, 'enviado');
    // Vacío: vuelve al texto aprobado
    r = await admJson('PUT', '/captacion/ajustes', { mensajes: [] });
    assert.deepEqual((await r.json()).ajustes.mensajes, [MENSAJE_DEFAULT]);
  });

  test('quitar un chip: el agente lo cierra y sus chats quedan', async () => {
    const r = await admJson('DELETE', '/asistente/chips/2', {});
    assert.equal(r.status, 200);
    assert.ok(await hasta(() => !agente.chips.has(2)), 'el agente lo cierra');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM asistente_conversaciones WHERE chip = 2')).rows[0].n, 1);
    // uno nuevo no reusa la letra B (tiene chats)
    const d = await (await admJson('POST', '/asistente/chips', { rol: 'captacion' })).json();
    assert.deepEqual(d.chips.map((c) => c.letra), ['A', 'C', 'D']);
    await admJson('DELETE', '/asistente/chips/3', {}); await admJson('DELETE', '/asistente/chips/4', {});
  });
});

describe('responder lo que llegó sin conexión (20/11/2026)', () => {
  const ts = (ms) => Math.floor(ms / 1000);
  const msj = (tel, id, texto, ms, fromMe = false) => ({ key: { remoteJid: `${tel}@s.whatsapp.net`, fromMe, id }, messageTimestamp: ts(ms), message: { conversation: texto } });

  test('pedirlo desvincula el chip; con el historial, contesta solo los chats sin responder desde la fecha (con disculpa) y avisa', async () => {
    assert.equal((await admJson('POST', '/asistente/chips/1/recuperar', { desde: 'x' })).status, 400);
    assert.equal((await admJson('POST', '/asistente/chips/1/recuperar', { desde: new Date(Date.now() + 3600e3).toISOString() })).status, 400);
    assert.equal((await admJson('POST', '/asistente/chips/1/recuperar', { desde: new Date(Date.now() - 9 * 864e5).toISOString() })).status, 400);
    const ayer = Date.now() - 26 * 3600e3; const hoy = Date.now() - 3 * 3600e3;
    // Sin pedido: el historial no hace nada
    await agente.chips.get(1)._alHistorial({ messages: [msj('5491155550961', 'H0', 'hola?', hoy)] });
    assert.equal((await db.query("SELECT count(*)::int AS n FROM asistente_conversaciones WHERE telefono = '5491155550961'")).rows[0].n, 0);
    const desde = new Date(ayer - 3600e3).toISOString();
    const viejo = SOCK;
    let r = await admJson('POST', '/asistente/chips/1/recuperar', { desde });
    assert.equal(r.status, 200);
    let d = await r.json();
    const a = d.chips.find((c) => c.letra === 'A');
    assert.ok(a.recuperar && a.recuperar.vigente && a.recuperar.respondidos === 0);
    const sal = (await db.query("SELECT datos FROM asistente_salida WHERE tipo = 'desvincular' ORDER BY id DESC LIMIT 1")).rows[0];
    assert.deepEqual(sal.datos, { chip: 1 });
    // El agente desvincula el chip A y pide QR nuevo; Juan lo escanea
    assert.ok(await hasta(() => SOCK !== viejo), 'socket nuevo después de desvincular');
    SOCK.ev.emit('connection.update', { connection: 'open' });
    assert.ok(await hasta(() => agente.chips.get(1).conectado()), 'conectado de nuevo');
    LLM.guion = () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Perdón por la demora. Crear tu perfil es gratis.' }] });
    const n0 = LLM.llamadas.length; const antes = SOCK.enviados.length; const tg0 = TG.enviados.length;
    await agente.chips.get(1)._alHistorial({ messages: [
      // 1) escribió dos veces sin respuesta → se contesta una vez, con las dos en el historial de la IA
      msj('5491155550961', 'H1', 'Hola, ¿cómo me registro?', ayer + 1000), msj('5491155550961', 'H2', '¿Es gratis?', ayer + 2000),
      // 2) Juan ya le respondió desde el teléfono → nada
      msj('5491155550962', 'H3', 'Hola', ayer + 3000), msj('5491155550962', 'H4', 'Hola! Te cuento…', ayer + 4000, true),
      // 3) antes de la fecha → nada
      msj('5491155550963', 'H5', 'Viejo', ayer - 5 * 3600e3),
      // 4) un grupo → nada
      { key: { remoteJid: '123-456@g.us', fromMe: false, id: 'H6' }, messageTimestamp: ts(hoy), message: { conversation: 'grupo' } },
    ] });
    await agente.asistente.esperarRecuperar();
    const k = (await db.query("SELECT * FROM asistente_conversaciones WHERE telefono = '5491155550961'")).rows[0];
    const ms = (await db.query('SELECT dir, origen, texto FROM asistente_mensajes WHERE conversacion_id = $1 ORDER BY id', [k.id])).rows;
    assert.deepEqual(ms.map((x) => [x.dir, x.origen]), [['in', 'usuario'], ['in', 'usuario'], ['out', 'bot']]);
    assert.equal(SOCK.enviados.length, antes + 1, 'un solo mensaje');
    assert.equal(SOCK.enviados.at(-1).jid, '5491155550961@s.whatsapp.net');
    assert.equal(LLM.llamadas.length, n0 + 1);
    const sys = JSON.stringify(LLM.llamadas[n0].system);
    assert.ok(sys.includes('empezá con una disculpa breve por la demora'));
    assert.ok(JSON.stringify(LLM.llamadas[n0].messages).includes('¿cómo me registro?') && JSON.stringify(LLM.llamadas[n0].messages).includes('¿Es gratis?'));
    assert.equal((await db.query("SELECT count(*)::int AS n FROM asistente_conversaciones WHERE telefono IN ('5491155550962', '5491155550963')")).rows[0].n, 0);
    assert.ok(TG.enviados.slice(tg0).some((x) => /respondí 1 chat que había quedado sin respuesta/.test(x.text)), 'aviso por Telegram');
    d = await (await adm('/asistente')).json();
    assert.equal(d.chips.find((c) => c.letra === 'A').recuperar.respondidos, 1);
    // El mismo historial otra vez (llega en pedazos): no repite
    await agente.chips.get(1)._alHistorial({ messages: [msj('5491155550961', 'H2', '¿Es gratis?', ayer + 2000)] });
    await agente.asistente.esperarRecuperar();
    assert.equal(SOCK.enviados.length, antes + 1);
    // La disculpa no queda para los mensajes de siempre
    const n1 = LLM.llamadas.length;
    await llega('5491155550961', 'Otra pregunta');
    assert.ok(!JSON.stringify(LLM.llamadas[n1].system).includes('disculpa breve por la demora'));
    LLM.guion = null;
    await db.query('UPDATE asistente_whatsapp SET recuperar_desde = NULL, recuperar_hasta = NULL, recuperados = 0 WHERE id = 1');
    await db.query("DELETE FROM asistente_salida WHERE tipo = 'desvincular'");
  });
});

