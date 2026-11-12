// Pruebas de las historias en video (POST /api/cuenta/historias/video + cola de lib/videos.js + estado público + Shorts).
//   DATABASE_URL=postgres://... node --test test/historias-video.test.js
// Necesita ffmpeg y ffprobe en el PATH. Usa un almacenamiento falso inyectado (config.storageDriver).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import sharp from 'sharp';
import { start } from '../server.js';
import { invalidarSitio } from '../routes/sitio.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(HERE, '..');
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
const ffmpeg = (args) => {
  const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', ...args]);
  if (r.status !== 0) throw new Error('ffmpeg: ' + r.stderr);
};

before(async () => {
  tmpData = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-hvdata-'));
  tmpPublic = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-hvpub-'));
  await fs.writeFile(path.join(tmpPublic, 'index.html'), '<!doctype html><title>x</title>');
  clips = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-hclips-'));
  if (!hayFfmpeg) return;
  // vertical 9:16 de 45 s (más que un video de galería, menos que el tope de historias)
  ffmpeg(['-f', 'lavfi', '-i', 'testsrc=size=360x640:rate=10', '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '45',
    '-c:v', 'libx264', '-c:a', 'aac', '-shortest', path.join(clips, 'v45.mp4')]);
  // 65 s: más de 60
  ffmpeg(['-f', 'lavfi', '-i', 'testsrc=size=180x320:rate=5', '-t', '65', '-c:v', 'libx264', path.join(clips, 'v65.mp4')]);
  // 3 s
  ffmpeg(['-f', 'lavfi', '-i', 'testsrc=size=360x640:rate=10', '-t', '3', '-c:v', 'libx264', path.join(clips, 'v3.mp4')]);
});

after(async () => {
  await db.query("DELETE FROM cuentas WHERE email LIKE 'zzhv-%@example.com'");
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
  async historiaVideo(file, texto = '') {
    const fd = new FormData();
    fd.append('video', new Blob([await fs.readFile(file)], { type: 'video/mp4' }), path.basename(file));
    if (texto) fd.append('texto', texto);
    const r = await fetch(this.base + '/api/cuenta/historias/video', { method: 'POST', headers: this.headers(), body: fd });
    return { status: r.status, body: await r.json().catch(() => null) };
  }
  async historiaFoto() {
    const fd = new FormData();
    const jpg = await sharp({ create: { width: 400, height: 700, channels: 3, background: { r: 200, g: 80, b: 120 } } }).jpeg().toBuffer();
    fd.append('foto', new Blob([jpg], { type: 'image/jpeg' }), 'h.jpg');
    const r = await fetch(this.base + '/api/cuenta/historias', { method: 'POST', headers: this.headers(), body: fd });
    return { status: r.status, body: await r.json().catch(() => null) };
  }
}

async function registrar(base) {
  const c = new Cliente(base);
  const r = await c.json('POST', '/api/cuenta/registro', {
    email: `zzhv-${rand()}@example.com`, password: 'una-clave-larga-123', displayName: `Zz Hv ${rand()}`, fechaNacimiento: '1994-02-03',
    genero: 'mujer', aceptaTerminos: true, mayorEdad: true,
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  c.id = r.body.cuenta.id;
  return c;
}

async function esperar(c, id) {
  let h;
  for (let i = 0; i < 300; i++) {
    const yo = await c.get('/api/cuenta/yo');
    h = yo.body.cuenta.historias.find((x) => x.id === id);
    if (!h || h.estado !== 'procesando') return h;
    await new Promise((res) => setTimeout(res, 200));
  }
  return h;
}

describe('historias en video con almacenamiento local (sin bunny.net)', () => {
  test('el API responde 409', async () => {
    const s = await servidor({ storage: 'local' });
    try {
      const c = await registrar(s.base);
      const fd = new FormData(); fd.append('video', new Blob([Buffer.from('x')]), 'a.mp4');
      const r = await fetch(s.base + '/api/cuenta/historias/video', { method: 'POST', headers: c.headers(), body: fd });
      assert.equal(r.status, 409);
    } finally { await s.close(); }
  });
});

describe('historias en video con almacenamiento externo', { skip: !hayFfmpeg && 'falta ffmpeg' }, () => {
  let s;
  before(async () => { s = await servidor({ storageDriver: driver }); });
  after(async () => { if (s) await s.close(); });

  test('45 s: 202 procesando → listo (MP4 + portada en h/), no se publica hasta estar listo, las 24 h corren desde ahí', async () => {
    const c = await registrar(s.base);
    // Bronce: 1 historia por día. Publicada y verificada para verla en el estado público.
    await db.query("UPDATE perfiles SET estado = 'publicado', verificacion = 'verificada', publicado_en = now() WHERE cuenta_id = $1", [c.id]);
    const r = await c.historiaVideo(path.join(clips, 'v45.mp4'), 'Atardecer');
    assert.equal(r.status, 202, JSON.stringify(r.body));
    assert.equal(r.body.historia.tipo, 'video');
    assert.equal(r.body.historia.estado, 'procesando');
    const id = r.body.historia.id;
    // una historia que se está procesando (o que falló) no se publica
    const { rows: [fake] } = await db.query("INSERT INTO historias (cuenta_id, tipo, estado) VALUES ($1, 'video', 'procesando') RETURNING id", [c.id]);
    const { rows: [fake2] } = await db.query("INSERT INTO historias (cuenta_id, tipo, estado, error) VALUES ($1, 'video', 'error', 'x') RETURNING id", [c.id]);
    invalidarSitio();
    const e0 = await c.get('/api/sitio/estado');
    assert.equal(e0.body.historias.some((x) => x.id === fake.id || x.id === fake2.id), false);
    await db.query('DELETE FROM historias WHERE id = ANY($1)', [[fake.id, fake2.id]]);
    const h = await esperar(c, id);
    assert.equal(h.estado, 'listo', JSON.stringify(h));
    assert.equal(h.tipo, 'video');
    assert.ok(h.segundos >= 44 && h.segundos <= 46, String(h.segundos));
    assert.equal(h.url, `https://cdn.prueba.test/h/${id}.mp4`);
    assert.equal(h.urlMini, `https://cdn.prueba.test/h/${id}.webp`);
    assert.equal(guardados.get(`h/${id}.mp4`).tipo, 'video/mp4');
    assert.equal(guardados.get(`h/${id}.webp`).tipo, 'image/webp');
    assert.ok(h.alto > h.ancho, 'sigue vertical');
    const ms = Date.parse(h.expira) - Date.now();
    assert.ok(ms > 23.9 * 3600e3 && ms <= 24 * 3600e3 + 5000, 'expira 24 h después de quedar lista');
    invalidarSitio();
    const e = await c.get('/api/sitio/estado');
    const pub = e.body.historias.find((x) => x.id === id);
    assert.ok(pub, 'aparece en el sitio');
    assert.equal(pub.tipo, 'video'); assert.equal(pub.url, h.url); assert.equal(pub.urlMini, h.urlMini);
    assert.ok(pub.segundos >= 44); assert.ok(pub.ancho && pub.alto);
    assert.equal(pub.texto, 'Atardecer');
    // cupo del día (Bronce = 1): la de video cuenta igual que una foto
    const yo = await c.get('/api/cuenta/yo');
    assert.equal(yo.body.cuenta.limites.historiasHoy, 1);
    const r2 = await c.historiaFoto();
    assert.equal(r2.status, 400); assert.match(r2.body.error, /1 historia por día/);
    const r3 = await c.historiaVideo(path.join(clips, 'v3.mp4'));
    assert.equal(r3.status, 400); assert.match(r3.body.error, /1 historia por día/);
    // vencida: sale del sitio
    await db.query("UPDATE historias SET expira = now() - interval '1 minute' WHERE id = $1", [id]);
    invalidarSitio();
    const e2 = await c.get('/api/sitio/estado');
    assert.equal(e2.body.historias.some((x) => x.id === id), false);
    // borrar: saca los archivos del CDN
    const d = await c.json('DELETE', '/api/cuenta/historias/' + id);
    assert.equal(d.status, 200);
    assert.equal(guardados.has(`h/${id}.mp4`), false);
  });

  test('más de 60 s: queda con error y el motivo; no cuenta para el cupo', async () => {
    const c = await registrar(s.base);
    const r = await c.historiaVideo(path.join(clips, 'v65.mp4'));
    assert.equal(r.status, 202, JSON.stringify(r.body));
    const h = await esperar(c, r.body.historia.id);
    assert.equal(h.estado, 'error');
    assert.match(h.error, /Hasta 60 segundos/);
    const yo = await c.get('/api/cuenta/yo');
    assert.equal(yo.body.cuenta.limites.historiasHoy, 0);
    // puede subir otra (su cupo de Bronce sigue libre)
    const r2 = await c.historiaVideo(path.join(clips, 'v3.mp4'));
    assert.equal(r2.status, 202);
    const h2 = await esperar(c, r2.body.historia.id);
    assert.equal(h2.estado, 'listo');
  });

  test('archivo que no es video: 400; la foto sigue funcionando por su ruta', async () => {
    const c = await registrar(s.base);
    const fd = new FormData(); fd.append('video', new Blob([Buffer.from('esto no es un video '.repeat(20))], { type: 'video/mp4' }), 'falso.mp4');
    const r = await fetch(s.base + '/api/cuenta/historias/video', { method: 'POST', headers: c.headers(), body: fd });
    assert.equal(r.status, 400);
    const f = await c.historiaFoto();
    assert.equal(f.status, 201, JSON.stringify(f.body));
    assert.equal(f.body.historia.tipo, 'foto'); assert.equal(f.body.historia.estado, 'listo');
  });

  test('Plata: 3 por día entre fotos y videos', async () => {
    const c = await registrar(s.base);
    await db.query("INSERT INTO suscripciones (cuenta_id, plan, periodo, desde, hasta) VALUES ($1, 'D', 'manual', now() - interval '1 hour', now() + interval '1 day')", [c.id]);
    assert.equal((await c.historiaFoto()).status, 201);
    assert.equal((await c.historiaVideo(path.join(clips, 'v3.mp4'))).status, 202);
    assert.equal((await c.historiaFoto()).status, 201);
    const r = await c.historiaVideo(path.join(clips, 'v3.mp4'));
    assert.equal(r.status, 400); assert.match(r.body.error, /3 historias por día/);
  });
});

describe('Shorts: videos de cada acompañante (videosDePerfil)', () => {
  async function cargar() {
    const src = await fs.readFile(path.join(APP, '..', 'mvp', 'src', 'prod-shorts.js'), 'utf8');
    const module = { exports: {} };
    vm.runInNewContext(src, { module, Date, Math });
    return (p, st, ahora) => JSON.parse(JSON.stringify(module.exports.videosDePerfil(p, st, ahora)));
  }
  test('galería + historias en video activas, sin vencidas, sin fotos, sin repetidos', async () => {
    const f = await cargar();
    const ahora = Date.parse('2026-11-11T12:00:00Z');
    const p = { userId: 'A', videos: [{ id: 'g1', src: 'https://c/g1.mp4', poster: 'https://c/g1.webp', createdAt: '2026-11-10T10:00:00Z' }, { id: 'g2', src: 'https://c/g2.mp4', poster: '' }] };
    const stories = [
      { id: 's1', workerId: 'A', video: true, src: 'https://c/s1.mp4', poster: 'https://c/s1.webp', createdAt: '2026-11-11T10:00:00Z', expiresAt: '2026-11-12T10:00:00Z', w: 405, h: 720 },
      { id: 's2', workerId: 'A', video: true, src: 'https://c/s2.mp4', poster: 'https://c/s2.webp', createdAt: '2026-11-10T08:00:00Z', expiresAt: '2026-11-11T08:00:00Z' }, // vencida
      { id: 's3', workerId: 'A', src: 'https://c/s3.webp', createdAt: '2026-11-11T09:00:00Z', expiresAt: '2026-11-12T09:00:00Z' }, // foto
      { id: 's4', workerId: 'B', video: true, src: 'https://c/s4.mp4', poster: 'https://c/s4.webp', createdAt: '2026-11-11T09:00:00Z', expiresAt: '2026-11-12T09:00:00Z' }, // de otra
      { id: 's5', workerId: 'A', video: true, src: 'https://c/g1.mp4', poster: 'https://c/x.webp', createdAt: '2026-11-11T09:00:00Z', expiresAt: '2026-11-12T09:00:00Z' }, // mismo archivo
    ];
    const out = f(p, stories, ahora);
    assert.deepEqual(out.map((x) => x.id), ['g1', 'h-s1']);
    assert.equal(out[1].poster, 'https://c/s1.webp'); assert.equal(out[1].h, 720); assert.equal(out[1].createdAt, '2026-11-11T10:00:00Z');
    assert.deepEqual(f({ userId: 'Z' }, null, ahora), []);
  });
});
