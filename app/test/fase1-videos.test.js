// Pruebas de los videos de la galería (lib/videos.js + /api/cuenta/videos + estado público).
//   DATABASE_URL=postgres://... node --test test/fase1-videos.test.js
// Necesita ffmpeg y ffprobe en el PATH (en Docker vienen del paquete ffmpeg). Usa un almacenamiento falso inyectado
// (config.storageDriver) que guarda en memoria y responde URLs de un CDN de prueba.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { start } from '../server.js';
import { invalidarSitio } from '../routes/sitio.js';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('Falta DATABASE_URL.'); process.exit(1); }
const hayFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0;

const db = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
const rand = () => crypto.randomBytes(4).toString('hex');
const ip = () => `2001:db8:${rand().slice(0, 4)}::${rand().slice(0, 4)}`;
let tmpData; let tmpPublic; let clips;

// Almacenamiento falso (bunny.net de mentira)
const guardados = new Map();
const borrados = [];
const driver = {
  origin: 'https://cdn.prueba.test',
  async put(clave, buffer, tipo) { guardados.set(clave, { buffer: Buffer.from(buffer), tipo }); return `https://cdn.prueba.test/${clave}`; },
  async del(clave) { borrados.push(clave); guardados.delete(clave); },
};

const ffmpeg = (args) => {
  const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', ...args]);
  if (r.status !== 0) throw new Error('ffmpeg: ' + r.stderr);
};

before(async () => {
  tmpData = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-vdata-'));
  tmpPublic = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-vpub-'));
  await fs.writeFile(path.join(tmpPublic, 'index.html'), '<!doctype html><title>x</title>');
  clips = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-clips-'));
  if (!hayFfmpeg) return;
  // 5 s con audio y metadatos "privados" (ubicación, título)
  ffmpeg(['-f', 'lavfi', '-i', 'testsrc=size=1920x1080:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '5',
    '-c:v', 'libx264', '-c:a', 'aac', '-metadata', 'location=+40.7128-074.0060/', '-metadata', 'title=dato-privado', path.join(clips, 'a5.mp4')]);
  // 40 s (demasiado largo)
  ffmpeg(['-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=10', '-t', '40', '-c:v', 'libx264', path.join(clips, 'a40.mp4')]);
  // Celular acostado: 1280×720 con rotación de 90° → se ve vertical
  ffmpeg(['-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=30', '-t', '3', '-c:v', 'libx264', path.join(clips, 'r0.mp4')]);
  ffmpeg(['-display_rotation', '90', '-i', path.join(clips, 'r0.mp4'), '-c', 'copy', path.join(clips, 'rot.mp4')]);
  // WebM sin audio
  ffmpeg(['-f', 'lavfi', '-i', 'testsrc=size=640x480:rate=15', '-t', '2', '-c:v', 'libvpx-vp9', '-b:v', '300k', path.join(clips, 'w.webm')]);
  // Texto con extensión .mp4
  await fs.writeFile(path.join(clips, 'falso.mp4'), 'esto no es un video '.repeat(20));
});

after(async () => {
  await db.query("DELETE FROM cuentas WHERE email LIKE 'zzvid-%@example.com'");
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
  async json(method, p, body, extra = {}) {
    const r = this.guardar(await fetch(this.base + p, { method, headers: this.headers({ 'content-type': 'application/json', ...extra }), body: body === undefined ? undefined : JSON.stringify(body) }));
    return { status: r.status, body: await r.json().catch(() => null) };
  }
  async get(p) { const r = await fetch(this.base + p, { headers: this.headers() }); return { status: r.status, body: await r.json().catch(() => null) }; }
  async video(file, { headers = {}, campo = 'video' } = {}) {
    const fd = new FormData();
    fd.append(campo, new Blob([await fs.readFile(file)], { type: 'video/mp4' }), path.basename(file));
    const r = await fetch(this.base + '/api/cuenta/videos', { method: 'POST', headers: { ...this.headers(), ...headers }, body: fd });
    return { status: r.status, body: await r.json().catch(() => null) };
  }
}

async function registrar(base) {
  const c = new Cliente(base);
  const r = await c.json('POST', '/api/cuenta/registro', {
    email: `zzvid-${rand()}@example.com`, password: 'una-clave-larga-123', displayName: `Zz Vid ${rand()}`, fechaNacimiento: '1994-02-03',
    genero: 'mujer', aceptaTerminos: true, mayorEdad: true,
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  c.id = r.body.cuenta.id;
  return c;
}

const ffprobe = (file) => JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file]).stdout.toString());

describe('videos con almacenamiento local (sin bunny.net)', () => {
  test('el API responde 409 y el panel sabe que están apagados', async () => {
    const s = await servidor({ storage: 'local' });
    try {
      const c = await registrar(s.base);
      const yo = await c.get('/api/cuenta/yo');
      assert.equal(yo.body.cuenta.videosHabilitados, false);
      assert.equal(yo.body.cuenta.limites.videos, 2);
      const fd = new FormData(); fd.append('video', new Blob([Buffer.from('x')]), 'a.mp4');
      const r = await fetch(s.base + '/api/cuenta/videos', { method: 'POST', headers: c.headers(), body: fd });
      assert.equal(r.status, 409);
      assert.match((await r.json()).error, /almacenamiento externo/);
    } finally { await s.close(); }
  });
});

describe('videos con almacenamiento externo', { skip: !hayFfmpeg && 'falta ffmpeg' }, () => {
  let s;
  before(async () => { s = await servidor({ storageDriver: driver }); });
  after(async () => { if (s) await s.close(); });

  test('subida → 202 procesando → listo: MP4 H.264 ≤720p, faststart, sin metadatos, portada, en el CDN', async () => {
    const c = await registrar(s.base);
    const yo0 = await c.get('/api/cuenta/yo');
    assert.equal(yo0.body.cuenta.videosHabilitados, true);
    const r = await c.video(path.join(clips, 'a5.mp4'));
    assert.equal(r.status, 202, JSON.stringify(r.body));
    assert.equal(r.body.video.estado, 'procesando');
    const id = r.body.video.id;
    // la cola procesa en segundo plano
    let v;
    for (let i = 0; i < 100; i++) {
      const yo = await c.get('/api/cuenta/yo');
      v = yo.body.cuenta.perfil.videos.find((x) => x.id === id);
      if (v.estado !== 'procesando') break;
      await new Promise((res) => setTimeout(res, 200));
    }
    assert.equal(v.estado, 'listo', JSON.stringify(v));
    assert.equal(v.url, `https://cdn.prueba.test/v/${id}.mp4`);
    assert.equal(v.poster, `https://cdn.prueba.test/v/${id}.webp`);
    assert.equal(v.ancho, 720); assert.equal(v.alto, 406);
    assert.ok(v.segundos >= 4.9 && v.segundos <= 5.2, String(v.segundos));
    const mp4 = guardados.get(`v/${id}.mp4`); const poster = guardados.get(`v/${id}.webp`);
    assert.equal(mp4.tipo, 'video/mp4'); assert.equal(poster.tipo, 'image/webp');
    assert.ok(mp4.buffer.indexOf('moov') > 0 && mp4.buffer.indexOf('moov') < mp4.buffer.indexOf('mdat'), 'moov tiene que ir antes que mdat (faststart)');
    const txt = mp4.buffer.toString('latin1');
    assert.ok(!txt.includes('dato-privado') && !txt.includes('+40.7128'), 'quedaron metadatos del original');
    const f = path.join(tmpData, 'out.mp4'); await fs.writeFile(f, mp4.buffer);
    const info = ffprobe(f);
    const vs = info.streams.find((x) => x.codec_type === 'video');
    assert.equal(vs.codec_name, 'h264'); assert.equal(vs.pix_fmt, 'yuv420p');
    assert.ok(Math.max(vs.width, vs.height) <= 720);
    assert.ok(info.streams.some((x) => x.codec_type === 'audio' && x.codec_name === 'aac'));
    assert.ok(!(info.format.tags || {}).title && !(info.format.tags || {}).location);
    // el temporal se borró
    assert.deepEqual((await fs.readdir(path.join(tmpData, 'tmp', 'videos'))).filter((x) => x.startsWith(id)), []);
  });

  test('video de celular girado: sale vertical (406×720)', async () => {
    const c = await registrar(s.base);
    const r = await c.video(path.join(clips, 'rot.mp4'));
    assert.equal(r.status, 202);
    await s.ctx.videos.vacia();
    const v = (await c.get('/api/cuenta/yo')).body.cuenta.perfil.videos[0];
    assert.equal(v.estado, 'listo'); assert.equal(v.ancho, 406); assert.equal(v.alto, 720);
    const f = path.join(tmpData, 'rot-out.mp4'); await fs.writeFile(f, guardados.get(`v/${v.id}.mp4`).buffer);
    const vs = ffprobe(f).streams.find((x) => x.codec_type === 'video');
    assert.equal(vs.width, 406); assert.equal(vs.height, 720);
    assert.ok(!(vs.side_data_list || []).some((x) => x.rotation), 'no tiene que quedar marca de rotación');
  });

  test('WebM sin audio se acepta; un texto con extensión .mp4 se rechaza; uno de 40 s queda con error', async () => {
    const c = await registrar(s.base);
    const w = await c.video(path.join(clips, 'w.webm'));
    assert.equal(w.status, 202);
    const falso = await c.video(path.join(clips, 'falso.mp4'));
    assert.equal(falso.status, 400); assert.match(falso.body.error, /MP4, MOV o WebM/);
    const largo = await c.video(path.join(clips, 'a40.mp4'));
    assert.equal(largo.status, 202);
    await s.ctx.videos.vacia();
    const vids = (await c.get('/api/cuenta/yo')).body.cuenta.perfil.videos;
    const vw = vids.find((x) => x.id === w.body.video.id); const vl = vids.find((x) => x.id === largo.body.video.id);
    assert.equal(vw.estado, 'listo');
    const fw = path.join(tmpData, 'w-out.mp4'); await fs.writeFile(fw, guardados.get(`v/${vw.id}.mp4`).buffer);
    assert.ok(!ffprobe(fw).streams.some((x) => x.codec_type === 'audio'));
    assert.equal(vl.estado, 'error'); assert.match(vl.error, /Hasta 30 segundos/);
    assert.ok(!guardados.has(`v/${vl.id}.mp4`));
    // los que quedan con error no ocupan cupo y se pueden borrar
    assert.equal((await c.json('DELETE', `/api/cuenta/videos/${vl.id}`)).status, 200);
  });

  test('cupo por plan: Bronce 2 (procesando + listos); con Plata 5', async () => {
    const c = await registrar(s.base);
    for (let i = 0; i < 2; i++) assert.equal((await c.video(path.join(clips, 'w.webm'))).status, 202);
    const tercero = await c.video(path.join(clips, 'w.webm'));
    assert.equal(tercero.status, 400); assert.match(tercero.body.error, /hasta 2 videos/);
    await db.query("INSERT INTO suscripciones (cuenta_id, plan, periodo, desde, hasta) VALUES ($1, 'D', 'manual', now() - interval '1 hour', now() + interval '1 day')", [c.id]);
    assert.equal((await c.video(path.join(clips, 'w.webm'))).status, 202);
    const yo = (await c.get('/api/cuenta/yo')).body.cuenta;
    assert.equal(yo.limites.videos, 5);
    await s.ctx.videos.vacia();
  });

  test('guardas: sin X-SR, de otro origen o sin sesión no se sube', async () => {
    const c = await registrar(s.base);
    const sinHeader = await c.video(path.join(clips, 'w.webm'), { headers: { 'x-sr': '' } });
    assert.equal(sinHeader.status, 403);
    const otro = await c.video(path.join(clips, 'w.webm'), { headers: { origin: 'https://otro.example' } });
    assert.equal(otro.status, 403);
    const anon = new Cliente(s.base);
    assert.equal((await anon.video(path.join(clips, 'w.webm'))).status, 401);
  });

  test('orden, borrado (borra del CDN) y estado público solo con listos y dentro del plan', async () => {
    const c = await registrar(s.base);
    const ids = [];
    for (let i = 0; i < 2; i++) ids.push((await c.video(path.join(clips, 'w.webm'))).body.video.id);
    await s.ctx.videos.vacia();
    const ord = await c.json('PUT', '/api/cuenta/videos/orden', { ids: [ids[1], ids[0]] });
    assert.equal(ord.status, 200);
    assert.deepEqual(ord.body.cuenta.perfil.videos.map((v) => v.id), [ids[1], ids[0]]);
    // publicar el perfil a mano y mirar el estado público
    await db.query("UPDATE perfiles SET estado = 'publicado', verificacion = 'verificada', publicado_en = now() WHERE cuenta_id = $1", [c.id]);
    await db.query("INSERT INTO videos (cuenta_id, orden, estado) VALUES ($1, 9, 'procesando')", [c.id]);
    invalidarSitio();
    const est = await c.get('/api/sitio/estado');
    const p = est.body.perfiles.find((x) => x.cuentaId === c.id);
    assert.equal(p.videos.length, 2);
    assert.deepEqual(p.videos.map((v) => v.id), [ids[1], ids[0]]);
    assert.ok(p.videos.every((v) => v.url.startsWith('https://cdn.prueba.test/v/') && v.poster && v.segundos > 0));
    const del = await c.json('DELETE', `/api/cuenta/videos/${ids[0]}`);
    assert.equal(del.status, 200);
    assert.ok(borrados.includes(`v/${ids[0]}.mp4`) && borrados.includes(`v/${ids[0]}.webp`));
    invalidarSitio();
    const p2 = (await c.get('/api/sitio/estado')).body.perfiles.find((x) => x.cuentaId === c.id);
    assert.deepEqual(p2.videos.map((v) => v.id), [ids[1]]);
    // otra cuenta no puede borrar videos ajenos
    const otra = await registrar(s.base);
    assert.equal((await otra.json('DELETE', `/api/cuenta/videos/${ids[1]}`)).status, 404);
  });

  test('al arrancar, un "procesando" sin archivo temporal pasa a error', async () => {
    const c = await registrar(s.base);
    const { rows } = await db.query("INSERT INTO videos (cuenta_id, estado) VALUES ($1, 'procesando') RETURNING id", [c.id]);
    await s.ctx.videos.recuperar();
    const { rows: r2 } = await db.query('SELECT estado, error FROM videos WHERE id = $1', [rows[0].id]);
    assert.equal(r2[0].estado, 'error'); assert.match(r2[0].error, /interrumpió/);
  });
});
