// Pruebas del clip de 5 s de la tarjeta (tabla previews, lib/videos.js, /api/cuenta/preview y estado público).
//   DATABASE_URL=postgres://... node --test test/fase1-preview.test.js
// Necesita ffmpeg y ffprobe. Usa un almacenamiento falso inyectado (config.storageDriver) con get() para leer el MP4 ya procesado.
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

const guardados = new Map();
const borrados = [];
const driver = {
  origin: 'https://cdn.prueba.test',
  async put(clave, buffer, tipo) { guardados.set(clave, { buffer: Buffer.from(buffer), tipo }); return `https://cdn.prueba.test/${clave}`; },
  async get(clave) { const g = guardados.get(clave); if (!g) throw new Error('no existe ' + clave); return g.buffer; },
  async del(clave) { borrados.push(clave); guardados.delete(clave); },
};

const ffmpeg = (args) => { const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', ...args]); if (r.status !== 0) throw new Error('ffmpeg: ' + r.stderr); };
const ffprobe = (file) => JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file]).stdout.toString());

before(async () => {
  tmpData = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-pdata-'));
  tmpPublic = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-ppub-'));
  await fs.writeFile(path.join(tmpPublic, 'index.html'), '<!doctype html><title>x</title>');
  clips = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-pclips-'));
  if (!hayFfmpeg) return;
  // 12 s vertical (celular) con audio
  ffmpeg(['-f', 'lavfi', '-i', 'testsrc=size=720x1280:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '12', '-c:v', 'libx264', '-c:a', 'aac', path.join(clips, 'v12.mp4')]);
  // 3 s (más corto que el clip)
  ffmpeg(['-f', 'lavfi', '-i', 'testsrc=size=640x480:rate=15', '-t', '3', '-c:v', 'libx264', path.join(clips, 'v3.mp4')]);
});

after(async () => {
  await db.query("DELETE FROM cuentas WHERE email LIKE 'zzprev-%@example.com'");
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
  async video(file) {
    const fd = new FormData();
    fd.append('video', new Blob([await fs.readFile(file)], { type: 'video/mp4' }), path.basename(file));
    const r = await fetch(this.base + '/api/cuenta/videos', { method: 'POST', headers: this.headers(), body: fd });
    return { status: r.status, body: await r.json().catch(() => null) };
  }
  async yo() { return (await this.get('/api/cuenta/yo')).body.cuenta; }
}

async function registrar(base) {
  const c = new Cliente(base);
  const email = `zzprev-${rand()}@example.com`;
  const r = await c.json('POST', '/api/cuenta/registro', {
    email, password: 'una-clave-larga-123', displayName: `Zz Prev ${rand()}`, fechaNacimiento: '1993-05-06',
    genero: 'mujer', tipo: 'acompanante', aceptaTerminos: true, mayorEdad: true,
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  // El registro no abre la sesión (no revela si el email existía): entra con su contraseña.
  const l = await c.json('POST', '/api/cuenta/login', { email, password: 'una-clave-larga-123' });
  assert.equal(l.status, 200, JSON.stringify(l.body));
  c.id = l.body.cuenta.id;
  return c;
}
const darPlan = (id, plan) => db.query("INSERT INTO suscripciones (cuenta_id, plan, periodo, desde, hasta) VALUES ($1, $2, 'manual', now() - interval '1 hour', now() + interval '10 days')", [id, plan]);
const publicar = async (id) => { await db.query("UPDATE perfiles SET estado = 'publicado', verificacion = 'verificada', publicado_en = now() WHERE cuenta_id = $1", [id]); invalidarSitio(); };
const perfilPublico = async (c) => { invalidarSitio(); return (await c.get('/api/sitio/estado')).body.perfiles.find((x) => x.cuentaId === c.id); };
const leer = async (url, nombre) => { const clave = url.replace('https://cdn.prueba.test/', ''); const f = path.join(tmpData, nombre); await fs.writeFile(f, guardados.get(clave).buffer); return { f, clave, buf: guardados.get(clave).buffer }; };

describe('clip de tarjeta con almacenamiento local', () => {
  test('el API responde 409 y el panel no lo ofrece', async () => {
    const s = await servidor({ storage: 'local' });
    try {
      const c = await registrar(s.base);
      await darPlan(c.id, 'C');
      const yo = await c.yo();
      assert.equal(yo.previewHabilitado, false);
      const r = await c.json('PUT', '/api/cuenta/preview', { videoId: crypto.randomUUID(), inicio: 0 });
      assert.equal(r.status, 409);
    } finally { await s.close(); }
  });
});

describe('clip de tarjeta (5 s, sin audio, desde Plata)', { skip: !hayFfmpeg && 'falta ffmpeg' }, () => {
  let s;
  before(async () => { s = await servidor({ storageDriver: driver }); });
  after(async () => { if (s) await s.close(); });

  test('Bronce: el automático se arma igual pero no se publica; con Plata aparece en la tarjeta', async () => {
    const c = await registrar(s.base);
    assert.equal((await c.video(path.join(clips, 'v12.mp4'))).status, 202);
    await s.ctx.videos.vacia();
    const yo = await c.yo();
    assert.equal(yo.previewHabilitado, false);
    assert.equal(yo.perfil.preview.estado, 'listo');
    assert.equal(yo.perfil.preview.elegido, false);
    assert.equal(yo.perfil.preview.inicio, 0);
    assert.match(yo.perfil.preview.url, /^https:\/\/cdn\.prueba\.test\/p\/[0-9a-f-]+-[0-9a-f]{12}\.mp4$/);
    const r = await c.json('PUT', '/api/cuenta/preview', { videoId: yo.perfil.videos[0].id, inicio: 2 });
    assert.equal(r.status, 403); assert.match(r.body.error, /Disponible desde Plata/);
    await publicar(c.id);
    assert.equal((await perfilPublico(c)).preview, null);
    await darPlan(c.id, 'D');
    const p = await perfilPublico(c);
    assert.equal(p.plan, 'D');
    assert.deepEqual(p.preview, { url: yo.perfil.preview.url });
    assert.equal((await c.yo()).previewHabilitado, true);
  });

  test('Oro elige video e inicio: 5 s, sin audio, ≤480 px, faststart, sin metadatos; reemplaza y borra el anterior', async () => {
    const c = await registrar(s.base);
    await darPlan(c.id, 'C');
    await c.video(path.join(clips, 'v12.mp4'));
    await s.ctx.videos.vacia();
    const yo0 = await c.yo();
    assert.equal(yo0.previewHabilitado, true);
    const auto = yo0.perfil.preview;
    const vid = yo0.perfil.videos[0].id;
    // validaciones
    const lejos = await c.json('PUT', '/api/cuenta/preview', { videoId: vid, inicio: 9 });
    assert.equal(lejos.status, 400); assert.match(lejos.body.error, /entre 0 y 7 s/);
    assert.equal((await c.json('PUT', '/api/cuenta/preview', { videoId: vid, inicio: -1 })).status, 400);
    assert.equal((await c.json('PUT', '/api/cuenta/preview', { videoId: 'nada', inicio: 0 })).status, 400);
    const ajeno = await registrar(s.base);
    await darPlan(ajeno.id, 'C');
    assert.equal((await ajeno.json('PUT', '/api/cuenta/preview', { videoId: vid, inicio: 0 })).status, 404);
    // elegir desde el segundo 3
    const r = await c.json('PUT', '/api/cuenta/preview', { videoId: vid, inicio: 3 });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.cuenta.perfil.preview.estado, 'procesando');
    await s.ctx.videos.vacia();
    const pv = (await c.yo()).perfil.preview;
    assert.equal(pv.estado, 'listo'); assert.equal(pv.elegido, true); assert.equal(pv.inicio, 3); assert.equal(pv.videoId, vid);
    assert.notEqual(pv.url, auto.url);
    const { f, buf, clave } = await leer(pv.url, 'prev.mp4');
    assert.equal(guardados.get(clave).tipo, 'video/mp4');
    const info = ffprobe(f);
    const vs = info.streams.find((x) => x.codec_type === 'video');
    assert.ok(!info.streams.some((x) => x.codec_type === 'audio'), 'no tiene que tener audio');
    assert.equal(vs.codec_name, 'h264'); assert.equal(vs.pix_fmt, 'yuv420p');
    assert.ok(Math.max(vs.width, vs.height) <= 480, `${vs.width}x${vs.height}`);
    assert.equal(vs.height, 480); assert.equal(vs.width, 270);
    const dur = Number(info.format.duration);
    assert.ok(dur >= 4.8 && dur <= 5.2, String(dur));
    assert.ok(buf.indexOf('moov') > 0 && buf.indexOf('moov') < buf.indexOf('mdat'), 'faststart');
    assert.ok(buf.length < 600 * 1024, `pesa ${buf.length}`);
    assert.ok(!(info.format.tags || {}).title);
    // el clip anterior se borró del CDN
    assert.ok(borrados.includes(auto.url.replace('https://cdn.prueba.test/', '')));
    // "usar automático" vuelve al comienzo del primer video
    const d = await c.json('DELETE', '/api/cuenta/preview');
    assert.equal(d.status, 200);
    await s.ctx.videos.vacia();
    const pv2 = (await c.yo()).perfil.preview;
    assert.equal(pv2.elegido, false); assert.equal(pv2.inicio, 0); assert.equal(pv2.estado, 'listo');
    assert.ok(borrados.includes(clave));
  });

  test('video más corto que 5 s: solo se permite arrancar en 0', async () => {
    const c = await registrar(s.base);
    await darPlan(c.id, 'S');
    await c.video(path.join(clips, 'v3.mp4'));
    await s.ctx.videos.vacia();
    const v = (await c.yo()).perfil.videos[0];
    assert.equal((await c.json('PUT', '/api/cuenta/preview', { videoId: v.id, inicio: 1 })).status, 400);
    assert.equal((await c.json('PUT', '/api/cuenta/preview', { videoId: v.id, inicio: 0 })).status, 200);
    await s.ctx.videos.vacia();
    const pv = (await c.yo()).perfil.preview;
    assert.equal(pv.estado, 'listo');
    const info = ffprobe((await leer(pv.url, 'corto.mp4')).f);
    assert.ok(Number(info.format.duration) <= 3.2);
  });

  test('borrar el video del clip: vuelve al automático con el siguiente; sin videos, se borra el clip', async () => {
    const c = await registrar(s.base);
    await darPlan(c.id, 'S');
    await c.video(path.join(clips, 'v12.mp4'));
    await s.ctx.videos.vacia();
    await c.video(path.join(clips, 'v3.mp4'));
    await s.ctx.videos.vacia();
    const vids = (await c.yo()).perfil.videos;
    assert.equal(vids.length, 2);
    const [v1, v2] = vids;
    await c.json('PUT', '/api/cuenta/preview', { videoId: v2.id, inicio: 0 });
    await s.ctx.videos.vacia();
    const elegido = (await c.yo()).perfil.preview;
    assert.equal(elegido.videoId, v2.id);
    // borra el video del clip → automático con v1
    assert.equal((await c.json('DELETE', `/api/cuenta/videos/${v2.id}`)).status, 200);
    await s.ctx.videos.vacia();
    const pv = (await c.yo()).perfil.preview;
    assert.equal(pv.videoId, v1.id); assert.equal(pv.elegido, false); assert.equal(pv.estado, 'listo');
    assert.ok(borrados.includes(elegido.url.replace('https://cdn.prueba.test/', '')));
    // borrar un video que no es el del clip no lo toca
    // borra el último → sin clip
    assert.equal((await c.json('DELETE', `/api/cuenta/videos/${v1.id}`)).status, 200);
    await s.ctx.videos.vacia();
    assert.equal((await c.yo()).perfil.preview, null);
    assert.ok(borrados.includes(pv.url.replace('https://cdn.prueba.test/', '')));
    await publicar(c.id);
    assert.equal((await perfilPublico(c)).preview, null);
  });

  test('guardas: sin X-SR o sin sesión no se cambia', async () => {
    const c = await registrar(s.base);
    await darPlan(c.id, 'C');
    assert.equal((await c.json('PUT', '/api/cuenta/preview', { videoId: crypto.randomUUID(), inicio: 0 }, { 'x-sr': '' })).status, 403);
    const anon = new Cliente(s.base);
    assert.equal((await anon.json('PUT', '/api/cuenta/preview', { videoId: crypto.randomUUID(), inicio: 0 })).status, 401);
  });
});
