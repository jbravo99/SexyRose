// Pruebas de las historias destacadas (lib/destacadas.js + /api/cuenta/destacadas + estado público).
//   DATABASE_URL=postgres://... node --test test/destacadas.test.js
// Los videos necesitan ffmpeg y ffprobe en el PATH. Usa un almacenamiento falso inyectado (config.storageDriver).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import sharp from 'sharp';
import { start } from '../server.js';
import { invalidarSitio } from '../routes/sitio.js';
import { validarTitulo } from '../lib/destacadas.js';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('Falta DATABASE_URL.'); process.exit(1); }
const hayFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0;

const db = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
const rand = () => crypto.randomBytes(4).toString('hex');
const ip = () => `2001:db8:${rand().slice(0, 4)}::${rand().slice(0, 4)}`;
let tmpData; let tmpPublic; let clips;

const guardados = new Map();
const driver = {
  origin: 'https://cdn.prueba.test',
  async put(clave, buffer, tipo) { guardados.set(clave, { buffer: Buffer.from(buffer), tipo }); return `https://cdn.prueba.test/${clave}`; },
  async del(clave) { guardados.delete(clave); },
};

before(async () => {
  tmpData = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-dsdata-'));
  tmpPublic = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-dspub-'));
  await fs.writeFile(path.join(tmpPublic, 'index.html'), '<!doctype html><title>x</title>');
  clips = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-dsclips-'));
  if (!hayFfmpeg) return;
  const ff = (args) => { const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', ...args]); if (r.status !== 0) throw new Error('ffmpeg: ' + r.stderr); };
  ff(['-f', 'lavfi', '-i', 'testsrc=size=360x640:rate=10', '-t', '3', '-c:v', 'libx264', path.join(clips, 'v3.mp4')]);
  ff(['-f', 'lavfi', '-i', 'testsrc=size=180x320:rate=5', '-t', '65', '-c:v', 'libx264', path.join(clips, 'v65.mp4')]);
});

after(async () => {
  await db.query("DELETE FROM cuentas WHERE email LIKE 'zzds-%@example.com'");
  await db.end();
  for (const d of [tmpData, tmpPublic, clips]) if (d) await fs.rm(d, { recursive: true, force: true });
});

async function servidor(over) {
  const inst = await start({
    port: 0, host: '127.0.0.1', databaseUrl: DATABASE_URL, publicDir: tmpPublic, dataDir: tmpData,
    adminUser: '', adminPassword: '', adminPath: '', ipHashSalt: 'sal', siteUrl: 'https://sexyrose.net',
    telegramToken: '', telegramChatId: '', mailgunApiKey: '', tareaPlanes: false, log: () => {}, ...over,
  });
  await inst.ready;
  return { ...inst, base: `http://127.0.0.1:${inst.port}` };
}

class Cliente {
  constructor(base) { this.base = base; this.cookie = ''; this.ip = ip(); }
  headers(extra = {}) { return { origin: this.base, 'x-sr': '1', 'cf-connecting-ip': this.ip, ...(this.cookie ? { cookie: this.cookie } : {}), ...extra }; }
  guardar(r) { for (const c of r.headers.getSetCookie()) { const m = /^sr_sesion=([^;]*)/.exec(c); if (m) this.cookie = m[1] ? `sr_sesion=${m[1]}` : ''; } return r; }
  async json(method, p, body) {
    const r = this.guardar(await fetch(this.base + p, { method, headers: this.headers({ 'content-type': 'application/json' }), body: body === undefined ? undefined : JSON.stringify(body) }));
    return { status: r.status, body: await r.json().catch(() => null) };
  }
  async get(p) { const r = await fetch(this.base + p, { headers: this.headers() }); return { status: r.status, body: await r.json().catch(() => null) }; }
  async foto(destId) {
    const fd = new FormData();
    const jpg = await sharp({ create: { width: 400, height: 700, channels: 3, background: { r: 120, g: 80, b: 200 } } }).jpeg().toBuffer();
    fd.append('foto', new Blob([jpg], { type: 'image/jpeg' }), 'd.jpg');
    const r = await fetch(`${this.base}/api/cuenta/destacadas/${destId}/fotos`, { method: 'POST', headers: this.headers(), body: fd });
    return { status: r.status, body: await r.json().catch(() => null) };
  }
  async video(destId, file) {
    const fd = new FormData();
    fd.append('video', new Blob([await fs.readFile(file)], { type: 'video/mp4' }), path.basename(file));
    const r = await fetch(`${this.base}/api/cuenta/destacadas/${destId}/videos`, { method: 'POST', headers: this.headers(), body: fd });
    return { status: r.status, body: await r.json().catch(() => null) };
  }
  crear(titulo) { return this.json('POST', '/api/cuenta/destacadas', { titulo }); }
}

async function registrar(base, plan = 'E') {
  const c = new Cliente(base);
  const email = `zzds-${rand()}@example.com`;
  const r = await c.json('POST', '/api/cuenta/registro', {
    email, password: 'una-clave-larga-123', displayName: `Zz Ds ${rand()}`, fechaNacimiento: '1994-02-03',
    genero: 'mujer', tipo: 'acompanante', aceptaTerminos: true, mayorEdad: true,
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  // El registro no abre la sesión (no revela si el email existía): entra con su contraseña.
  const l = await c.json('POST', '/api/cuenta/login', { email, password: 'una-clave-larga-123' });
  assert.equal(l.status, 200, JSON.stringify(l.body));
  c.id = l.body.cuenta.id;
  await db.query("UPDATE perfiles SET estado = 'publicado', verificacion = 'verificada', publicado_en = now() WHERE cuenta_id = $1", [c.id]);
  await ponerPlan(c.id, plan);
  return c;
}
async function ponerPlan(id, plan) {
  await db.query('DELETE FROM suscripciones WHERE cuenta_id = $1', [id]);
  if (plan !== 'E') await db.query("INSERT INTO suscripciones (cuenta_id, plan, periodo, desde, hasta) VALUES ($1, $2, 'manual', now() - interval '1 hour', now() + interval '30 days')", [id, plan]);
  invalidarSitio();
}
async function publicasDe(c) {
  invalidarSitio();
  const e = await c.get('/api/sitio/estado');
  const p = e.body.perfiles.find((x) => x.cuentaId === c.id);
  assert.ok(p, 'el perfil está publicado');
  return p.destacadas || [];
}
async function esperarItem(c, itemId) {
  let it;
  for (let i = 0; i < 300; i++) {
    const yo = await c.get('/api/cuenta/yo');
    it = yo.body.cuenta.destacadas.flatMap((d) => d.items).find((x) => x.id === itemId);
    if (!it || it.estado !== 'procesando') return it;
    await new Promise((res) => setTimeout(res, 200));
  }
  return it;
}

describe('nombre de la destacada', () => {
  test('hasta 16 caracteres (los emojis cuentan como uno), sin vacíos', () => {
    assert.equal(validarTitulo('  Viajes  ').valor, 'Viajes');
    assert.ok(validarTitulo('').error);
    assert.ok(validarTitulo('   ').error);
    assert.equal(validarTitulo('1234567890123456').valor, '1234567890123456');
    assert.match(validarTitulo('12345678901234567').error, /16 caracteres/);
    assert.equal(validarTitulo('Viajes ✈️🌎').error, undefined);
  });
});

describe('destacadas con almacenamiento externo', () => {
  let s;
  before(async () => { s = await servidor({ storageDriver: driver }); });
  after(async () => { if (s) await s.close(); });

  test('Bronce: 1 destacada; crear, renombrar, subir foto, se ve en el perfil, borrar elemento y destacada borra archivos', async () => {
    const c = await registrar(s.base, 'E');
    const r = await c.crear('Viajes');
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const id = r.body.destacada.id;
    const r2 = await c.crear('Cafés');
    assert.equal(r2.status, 400); assert.match(r2.body.error, /1 destacada/);
    assert.equal((await c.crear('x'.repeat(17))).status, 400);
    // sin elementos: no aparece en el perfil
    assert.deepEqual(await publicasDe(c), []);
    const f1 = await c.foto(id);
    assert.equal(f1.status, 201, JSON.stringify(f1.body));
    assert.equal(f1.body.item.tipo, 'foto'); assert.equal(f1.body.item.estado, 'listo');
    assert.equal(f1.body.item.url, `https://cdn.prueba.test/d/${f1.body.item.id}.webp`);
    assert.ok(guardados.has(`d/${f1.body.item.id}.webp`) && guardados.has(`d/${f1.body.item.id}-m.webp`));
    const f2 = await c.foto(id);
    assert.equal(f2.status, 201);
    // renombrar
    assert.equal((await c.json('PUT', '/api/cuenta/destacadas/' + id, { titulo: 'Mis viajes' })).status, 200);
    // perfil público: la destacada con sus dos fotos, en orden; no vence
    const pub = await publicasDe(c);
    assert.equal(pub.length, 1);
    assert.equal(pub[0].titulo, 'Mis viajes');
    assert.deepEqual(pub[0].items.map((x) => x.id), [f1.body.item.id, f2.body.item.id]);
    assert.equal(pub[0].items[0].tipo, 'foto'); assert.ok(pub[0].items[0].urlMini);
    // panel (/yo): con el límite y si se ve
    const yo = await c.get('/api/cuenta/yo');
    assert.equal(yo.body.cuenta.limites.destacadas, 1);
    assert.equal(yo.body.cuenta.destacadas[0].visible, true);
    // borrar un elemento: se van sus archivos
    assert.equal((await c.json('DELETE', '/api/cuenta/destacadas/items/' + f1.body.item.id)).status, 200);
    assert.equal(guardados.has(`d/${f1.body.item.id}.webp`), false);
    assert.equal(guardados.has(`d/${f1.body.item.id}-m.webp`), false);
    // otra acompañante no puede tocarla
    const otra = await registrar(s.base, 'E');
    assert.equal((await otra.foto(id)).status, 404);
    assert.equal((await otra.json('DELETE', '/api/cuenta/destacadas/' + id)).status, 404);
    assert.equal((await otra.json('DELETE', '/api/cuenta/destacadas/items/' + f2.body.item.id)).status, 404);
    // borrar la destacada: se van todos sus archivos y libera el cupo
    assert.equal((await c.json('DELETE', '/api/cuenta/destacadas/' + id)).status, 200);
    assert.equal(guardados.has(`d/${f2.body.item.id}.webp`), false);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM destacada_items WHERE destacada_id = $1', [id])).rows[0].n, 0);
    assert.deepEqual(await publicasDe(c), []);
    assert.equal((await c.crear('Otra')).status, 201);
  });

  test('Plata 2, Oro 5, Star sin límite; si baja de plan se ven las primeras y el resto queda guardado', async () => {
    const d = await registrar(s.base, 'D');
    assert.equal((await d.crear('A')).status, 201);
    assert.equal((await d.crear('B')).status, 201);
    const r = await d.crear('C');
    assert.equal(r.status, 400); assert.match(r.body.error, /2 destacadas/);

    const o = await registrar(s.base, 'C');
    const ids = [];
    for (const t of ['Uno', 'Dos', 'Tres', 'Cuatro', 'Cinco']) {
      const x = await o.crear(t); assert.equal(x.status, 201); ids.push(x.body.destacada.id);
      assert.equal((await o.foto(x.body.destacada.id)).status, 201);
    }
    assert.equal((await o.crear('Seis')).status, 400);
    assert.deepEqual((await publicasDe(o)).map((x) => x.titulo), ['Uno', 'Dos', 'Tres', 'Cuatro', 'Cinco']);
    // baja a Plata: en el perfil, las 2 primeras; en el panel, el resto marcado como que no se ve
    await ponerPlan(o.id, 'D');
    assert.deepEqual((await publicasDe(o)).map((x) => x.titulo), ['Uno', 'Dos']);
    const yo = await o.get('/api/cuenta/yo');
    assert.deepEqual(yo.body.cuenta.destacadas.map((x) => x.visible), [true, true, false, false, false]);
    assert.equal(yo.body.cuenta.limites.destacadas, 2);
    assert.equal((await o.crear('Siete')).status, 400);
    // vuelve a Oro: se ven todas otra vez
    await ponerPlan(o.id, 'C');
    assert.equal((await publicasDe(o)).length, 5);

    const st = await registrar(s.base, 'S');
    for (let i = 0; i < 7; i++) assert.equal((await st.crear('S' + i)).status, 201);
    const yoS = await st.get('/api/cuenta/yo');
    assert.equal(yoS.body.cuenta.limites.destacadas, null);
    assert.ok(yoS.body.cuenta.destacadas.every((x) => x.visible));
  });

  test('hasta 100 fotos y videos por destacada', async () => {
    const c = await registrar(s.base, 'E');
    const id = (await c.crear('Lleno')).body.destacada.id;
    await db.query(
      "INSERT INTO destacada_items (destacada_id, cuenta_id, tipo, estado, url) SELECT $1, $2, 'foto', 'listo', 'https://cdn.prueba.test/d/x.webp' FROM generate_series(1, 100)",
      [id, c.id]);
    const r = await c.foto(id);
    assert.equal(r.status, 400); assert.match(r.body.error, /hasta 100/);
  });

  test('video: se procesa en la cola (d/<id>.mp4 + portada), no se ve hasta estar listo; más de 60 s queda con error', { skip: !hayFfmpeg && 'falta ffmpeg' }, async () => {
    const c = await registrar(s.base, 'D');
    const id = (await c.crear('Videos')).body.destacada.id;
    const r = await c.video(id, path.join(clips, 'v3.mp4'));
    assert.equal(r.status, 202, JSON.stringify(r.body));
    assert.equal(r.body.item.tipo, 'video'); assert.equal(r.body.item.estado, 'procesando');
    const it = await esperarItem(c, r.body.item.id);
    assert.equal(it.estado, 'listo', JSON.stringify(it));
    assert.equal(it.url, `https://cdn.prueba.test/d/${it.id}.mp4`);
    assert.equal(it.urlMini, `https://cdn.prueba.test/d/${it.id}.webp`);
    assert.ok(it.segundos >= 2 && it.segundos <= 4);
    const pub = await publicasDe(c);
    assert.equal(pub[0].items[0].tipo, 'video');
    assert.ok(pub[0].items[0].segundos >= 2); assert.ok(pub[0].items[0].ancho && pub[0].items[0].alto);
    // más de 60 s: error con el motivo; no aparece en el perfil
    const r2 = await c.video(id, path.join(clips, 'v65.mp4'));
    assert.equal(r2.status, 202);
    const it2 = await esperarItem(c, r2.body.item.id);
    assert.equal(it2.estado, 'error'); assert.match(it2.error, /Hasta 60 segundos/);
    assert.equal((await publicasDe(c))[0].items.length, 1);
    // borrar la destacada: se va el MP4 y la portada
    assert.equal((await c.json('DELETE', '/api/cuenta/destacadas/' + id)).status, 200);
    assert.equal(guardados.has(`d/${it.id}.mp4`), false);
    assert.equal(guardados.has(`d/${it.id}.webp`), false);
  });
});

describe('destacadas con almacenamiento local (sin bunny.net)', () => {
  test('las fotos funcionan; los videos responden 409', async () => {
    const s = await servidor({ storage: 'local' });
    try {
      const c = await registrar(s.base, 'E');
      const id = (await c.crear('Local')).body.destacada.id;
      assert.equal((await c.foto(id)).status, 201);
      const fd = new FormData(); fd.append('video', new Blob([Buffer.from('x')]), 'a.mp4');
      const r = await fetch(`${s.base}/api/cuenta/destacadas/${id}/videos`, { method: 'POST', headers: c.headers(), body: fd });
      assert.equal(r.status, 409);
    } finally { await s.close(); }
  });
});
