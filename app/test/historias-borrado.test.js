// Pruebas del borrado de historias: el admin borra una historia (foto o video) y las vencidas se borran solas
// (archivos + fila). Usa un almacenamiento falso inyectado (config.storageDriver).
//   DATABASE_URL=postgres://... node --test test/historias-borrado.test.js
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { start } from '../server.js';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('Falta DATABASE_URL.'); process.exit(1); }
const db = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
const A = '/panel-pruebas-historias-0123456789';
const USER = 'admin-hb'; const PASS = 'clave-de-prueba-larga-456';
let instance; let BASE; let tmpData; let tmpPublic;

const guardados = new Map();
const driver = {
  origin: 'https://cdn.prueba.test',
  async put(clave, buffer, tipo) { guardados.set(clave, { buffer: Buffer.from(buffer), tipo }); return `https://cdn.prueba.test/${clave}`; },
  async del(clave) { guardados.delete(clave); },
};

const auth = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
const admDelete = (p, headers = {}) => fetch(BASE + A + '/api' + p, {
  method: 'DELETE', body: '{}', headers: { authorization: auth, 'content-type': 'application/json', 'x-sr-admin': '1', origin: BASE, ...headers },
});

let n = 0;
async function acompanante() {
  const { rows } = await db.query('INSERT INTO cuentas (email, pass_hash) VALUES ($1, $2) RETURNING id', [`zzhb-${Date.now()}-${n++}@example.com`, 'x']);
  const id = rows[0].id;
  await db.query("INSERT INTO perfiles (cuenta_id, slug, datos, estado, verificacion) VALUES ($1, $2, $3, 'borrador', 'pendiente')",
    [id, 'zzhb-' + id.slice(0, 8), JSON.stringify({ displayName: 'Prueba' })]);
  return id;
}
// Inserta una historia con sus archivos en el almacenamiento falso
async function historia(cuentaId, { tipo = 'foto', estado = 'listo', vencida = false } = {}) {
  const id = crypto.randomUUID();
  const clave = tipo === 'video' ? `h/${id}.mp4` : `h/${id}.webp`;
  const mini = tipo === 'video' ? `h/${id}.webp` : `h/${id}-m.webp`;
  const conArchivos = estado === 'listo';
  if (conArchivos) { await driver.put(clave, Buffer.from('a'), 'x'); await driver.put(mini, Buffer.from('b'), 'x'); }
  await db.query(
    `INSERT INTO historias (id, cuenta_id, tipo, estado, clave, clave_mini, url, url_mini, expira)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now() + ($9::int * interval '1 hour'))`,
    [id, cuentaId, tipo, estado, conArchivos ? clave : null, conArchivos ? mini : null,
      conArchivos ? `https://cdn.prueba.test/${clave}` : null, conArchivos ? `https://cdn.prueba.test/${mini}` : null, vencida ? -1 : 20]);
  return { id, clave, mini };
}
const existe = async (id) => (await db.query('SELECT 1 FROM historias WHERE id = $1', [id])).rowCount === 1;

before(async () => {
  tmpData = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-hbdata-'));
  tmpPublic = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-hbpub-'));
  await fs.writeFile(path.join(tmpPublic, 'index.html'), '<!doctype html><title>x</title>');
  instance = await start({ prelanzamientoPorDefecto: false,
    port: 0, host: '127.0.0.1', databaseUrl: DATABASE_URL, publicDir: tmpPublic, dataDir: tmpData, storageDriver: driver,
    adminPath: A, adminUser: USER, adminPassword: PASS, ipHashSalt: 'sal', siteUrl: 'https://sexyrose.net',
    telegramToken: '', telegramChatId: '', mailgunApiKey: '', tareaPlanes: false, tareaContenido: false, tareaCotizacion: false, log: () => {},
  });
  BASE = `http://127.0.0.1:${instance.port}`;
  await instance.ready;
});
after(async () => {
  await instance?.close();
  await db.query("DELETE FROM cuentas WHERE email LIKE 'zzhb-%@example.com'");
  await db.end();
  for (const d of [tmpData, tmpPublic]) if (d) await fs.rm(d, { recursive: true, force: true });
});

describe('admin: borrar una historia', () => {
  test('borra la fila y los archivos (foto y video); exige la cabecera del panel; 404 si no es de esa acompañante', async () => {
    const c = await acompanante(); const otra = await acompanante();
    const foto = await historia(c); const video = await historia(c, { tipo: 'video' });
    // Sin la cabecera del panel no se borra
    assert.equal((await admDelete(`/acompanantes/${c}/historias/${foto.id}`, { 'x-sr-admin': '' })).status, 403);
    assert.ok(await existe(foto.id));
    // De otra acompañante o inexistente: 404
    assert.equal((await admDelete(`/acompanantes/${otra}/historias/${foto.id}`)).status, 404);
    assert.equal((await admDelete(`/acompanantes/${c}/historias/${crypto.randomUUID()}`)).status, 404);
    assert.equal((await admDelete(`/acompanantes/${c}/historias/no-es-un-id`)).status, 404);
    // Foto
    let r = await admDelete(`/acompanantes/${c}/historias/${foto.id}`);
    assert.equal(r.status, 200, await r.clone().text());
    assert.ok(!(await existe(foto.id)));
    assert.ok(!guardados.has(foto.clave) && !guardados.has(foto.mini));
    // Video (MP4 + portada)
    r = await admDelete(`/acompanantes/${c}/historias/${video.id}`);
    assert.equal(r.status, 200);
    assert.ok(!(await existe(video.id)));
    assert.ok(!guardados.has(video.clave) && !guardados.has(video.mini));
    // Ya no aparece en la ficha del admin
    const ficha = await (await fetch(`${BASE}${A}/api/acompanantes/${c}`, { headers: { authorization: auth } })).json();
    assert.equal((ficha.historias || []).length, 0);
  });
});

describe('historias vencidas', () => {
  test('se borran (fila + archivos); las activas y las que se están procesando quedan; se puede correr de nuevo', async () => {
    const c = await acompanante();
    const vencidaFoto = await historia(c, { vencida: true });
    const vencidaVideo = await historia(c, { tipo: 'video', vencida: true });
    const vencidaError = await historia(c, { tipo: 'video', estado: 'error', vencida: true });
    const procesando = await historia(c, { tipo: 'video', estado: 'procesando', vencida: true });
    const activa = await historia(c);
    const borradas = await instance.ctx.historias.borrarVencidas();
    assert.ok(borradas >= 3, `borró ${borradas}`);
    for (const h of [vencidaFoto, vencidaVideo, vencidaError]) assert.ok(!(await existe(h.id)), 'la vencida no queda en la base');
    for (const h of [vencidaFoto, vencidaVideo]) assert.ok(!guardados.has(h.clave) && !guardados.has(h.mini), 'ni sus archivos');
    assert.ok(await existe(procesando.id), 'la que se está procesando no se toca');
    assert.ok(await existe(activa.id), 'la activa queda');
    assert.ok(guardados.has(activa.clave) && guardados.has(activa.mini));
    assert.equal(await instance.ctx.historias.borrarVencidas(), 0, 'una segunda pasada no borra nada');
    // El estado público tampoco la muestra (ya no existe)
    const { rows } = await db.query('SELECT count(*)::int AS n FROM historias WHERE cuenta_id = $1', [c]);
    assert.equal(rows[0].n, 2);
  });
});
