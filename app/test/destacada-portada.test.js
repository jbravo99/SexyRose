// Portada de las historias destacadas (17/11/2026, pedido de Juan; lib/destacadas.js, migración 250):
// uno de sus elementos, una imagen subida aparte o la automática (el primer elemento).
//   DATABASE_URL=postgres://... node --test test/destacada-portada.test.js
// Usa un almacenamiento falso inyectado (config.storageDriver).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import sharp from 'sharp';
import { start } from '../server.js';
import { invalidarSitio } from '../routes/sitio.js';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('Falta DATABASE_URL.'); process.exit(1); }

const db = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
const rand = () => crypto.randomBytes(4).toString('hex');
const ip = () => `2001:db8:${rand().slice(0, 4)}::${rand().slice(0, 4)}`;
let tmpData; let tmpPublic; let s;

const guardados = new Map();
const driver = {
  origin: 'https://cdn.prueba.test',
  async put(clave, buffer, tipo) { guardados.set(clave, { buffer: Buffer.from(buffer), tipo }); return `https://cdn.prueba.test/${clave}`; },
  async del(clave) { guardados.delete(clave); },
};
const subidas = () => [...guardados.keys()].filter((k) => k.startsWith('d/p-'));
const claveDe = (url) => url.replace('https://cdn.prueba.test/', '');

async function jpg(w, h, conGps) {
  let img = sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 60, b: 90 } } });
  if (conGps) img = img.withExif({ IFD0: { Make: 'Telefono', Model: 'X' }, IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '34/1 36/1 0/1' } });
  return img.jpeg().toBuffer();
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
  async multipart(p, buf) {
    const fd = new FormData();
    fd.append('foto', new Blob([buf], { type: 'image/jpeg' }), 'p.jpg');
    const r = await fetch(this.base + p, { method: 'POST', headers: this.headers(), body: fd });
    return { status: r.status, body: await r.json().catch(() => null) };
  }
  async foto(destId) { return this.multipart(`/api/cuenta/destacadas/${destId}/fotos`, await jpg(400, 700)); }
  async crear(titulo) { const r = await this.json('POST', '/api/cuenta/destacadas', { titulo }); assert.equal(r.status, 201, JSON.stringify(r.body)); return r.body.destacada.id; }
  elegir(destId, itemId) { return this.json('PUT', `/api/cuenta/destacadas/${destId}/portada`, { itemId }); }
  async subir(destId, buf) { return this.multipart(`/api/cuenta/destacadas/${destId}/portada`, buf || await jpg(900, 600, true)); }
  automatica(destId) { return this.json('DELETE', `/api/cuenta/destacadas/${destId}/portada`); }
  async panel(destId) { return (await this.get('/api/cuenta/yo')).body.cuenta.destacadas.find((d) => d.id === destId); }
  async publica(destId) {
    invalidarSitio();
    const e = await this.get('/api/sitio/estado');
    const p = e.body.perfiles.find((x) => x.cuentaId === this.id);
    return p && (p.destacadas || []).find((d) => d.id === destId);
  }
}

async function registrar(plan = 'E') {
  const c = new Cliente(s.base);
  const email = `zzdp-${rand()}@example.com`;
  const r = await c.json('POST', '/api/cuenta/registro', {
    email, password: 'una-clave-larga-123', displayName: `Zz Dp ${rand()}`, fechaNacimiento: '1994-02-03',
    genero: 'mujer', tipo: 'acompanante', aceptaTerminos: true, mayorEdad: true,
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const l = await c.json('POST', '/api/cuenta/login', { email, password: 'una-clave-larga-123' });
  assert.equal(l.status, 200, JSON.stringify(l.body));
  c.id = l.body.cuenta.id;
  await db.query("UPDATE perfiles SET estado = 'publicado', verificacion = 'verificada', publicado_en = now() WHERE cuenta_id = $1", [c.id]);
  if (plan !== 'E') await db.query("INSERT INTO suscripciones (cuenta_id, plan, periodo, desde, hasta) VALUES ($1, $2, 'manual', now() - interval '1 hour', now() + interval '30 days')", [c.id, plan]);
  invalidarSitio();
  return c;
}

before(async () => {
  tmpData = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-dpdata-'));
  tmpPublic = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-dppub-'));
  await fs.writeFile(path.join(tmpPublic, 'index.html'), '<!doctype html><title>x</title>');
  s = await start({ prelanzamientoPorDefecto: false,
    port: 0, host: '127.0.0.1', databaseUrl: DATABASE_URL, publicDir: tmpPublic, dataDir: tmpData, storageDriver: driver,
    adminUser: '', adminPassword: '', adminPath: '', ipHashSalt: 'sal', siteUrl: 'https://sexyrose.net',
    telegramToken: '', telegramChatId: '', mailgunApiKey: '', tareaPlanes: false, log: () => {},
  });
  await s.ready;
  s.base = `http://127.0.0.1:${s.port}`;
});

after(async () => {
  if (s) await s.close();
  await db.query("DELETE FROM cuentas WHERE email LIKE 'zzdp-%@example.com'");
  await db.end();
  for (const d of [tmpData, tmpPublic]) if (d) await fs.rm(d, { recursive: true, force: true });
});

describe('portada de la destacada', () => {
  test('automática = sin portada elegida; elegir uno de sus elementos se ve en el panel, en el sitio y en la vista previa', async () => {
    const c = await registrar();
    const id = await c.crear('Viajes');
    const f1 = (await c.foto(id)).body.item; const f2 = (await c.foto(id)).body.item;
    assert.equal((await c.panel(id)).portada, null);
    assert.equal((await c.publica(id)).portada, null);
    const r = await c.elegir(id, f2.id);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body.portada, { tipo: 'item', itemId: f2.id, url: f2.urlMini });
    assert.deepEqual((await c.panel(id)).portada, { tipo: 'item', itemId: f2.id, url: f2.urlMini });
    const pub = await c.publica(id);
    assert.equal(pub.portada, f2.urlMini);
    assert.deepEqual(pub.items.map((x) => x.id), [f1.id, f2.id], 'el orden de los elementos no cambia');
    const vp = await c.get('/api/cuenta/vista-previa');
    assert.equal(vp.body.perfil.destacadas.find((d) => d.id === id).portada, f2.urlMini);
    // volver a la automática
    const a = await c.automatica(id);
    assert.equal(a.status, 200); assert.equal(a.body.portada, null);
    assert.equal((await c.publica(id)).portada, null);
  });

  test('imagen subida aparte: sin metadatos, cuadrada (hasta 480 px) y con almacenamiento público; reemplazarla o volver a la automática borra el archivo', async () => {
    const c = await registrar();
    const id = await c.crear('Noche');
    const f1 = (await c.foto(id)).body.item;
    const r = await c.subir(id);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.portada.tipo, 'subida');
    const clave1 = claveDe(r.body.portada.url);
    assert.match(clave1, /^d\/p-[0-9a-f-]{36}\.webp$/);
    const g = guardados.get(clave1);
    assert.equal(g.tipo, 'image/webp');
    const meta = await sharp(g.buffer).metadata();
    assert.equal(meta.format, 'webp'); assert.equal(meta.width, 480); assert.equal(meta.height, 480);
    assert.equal(meta.exif, undefined, 'sin EXIF ni ubicación');
    assert.deepEqual((await c.panel(id)).portada, { tipo: 'subida', url: r.body.portada.url });
    assert.equal((await c.publica(id)).portada, r.body.portada.url);
    // una chica (300 × 260) no se agranda
    const r2 = await c.subir(id, await jpg(300, 260));
    assert.equal(r2.status, 200);
    const m2 = await sharp(guardados.get(claveDe(r2.body.portada.url)).buffer).metadata();
    assert.equal(m2.width, 260); assert.equal(m2.height, 260);
    assert.equal(guardados.has(clave1), false, 'la anterior se borró');
    // pasar a un elemento borra la subida
    assert.equal((await c.elegir(id, f1.id)).status, 200);
    assert.equal(guardados.has(claveDe(r2.body.portada.url)), false);
    // subir otra y volver a la automática también
    const r3 = await c.subir(id);
    assert.equal(guardados.has(claveDe(r3.body.portada.url)), true);
    assert.equal((await c.automatica(id)).status, 200);
    assert.equal(guardados.has(claveDe(r3.body.portada.url)), false);
    assert.equal((await c.publica(id)).portada, null);
    // lo que no es imagen o es muy chica: 400 y no queda nada guardado
    const antes = subidas().length;
    const bad = await c.multipart(`/api/cuenta/destacadas/${id}/portada`, Buffer.from('no es una imagen'));
    assert.equal(bad.status, 400); assert.match(bad.body.error, /imagen válida/);
    const chica = await c.subir(id, await jpg(120, 120));
    assert.equal(chica.status, 400); assert.match(chica.body.error, /demasiado chica/);
    assert.equal(subidas().length, antes);
    assert.equal((await db.query('SELECT portada_clave FROM destacadas WHERE id = $1', [id])).rows[0].portada_clave, null);
  });

  test('solo lo suyo: elemento de otra destacada, de otra acompañante, inexistente o sin terminar → error', async () => {
    const c = await registrar('D');
    const id = await c.crear('Una'); const id2 = await c.crear('Otra');
    const f1 = (await c.foto(id)).body.item; const fOtra = (await c.foto(id2)).body.item;
    const otra = await registrar();
    const idAjena = await otra.crear('Ajena');
    const fAjena = (await otra.foto(idAjena)).body.item;
    // elemento de otra destacada suya
    let r = await c.elegir(id, fOtra.id);
    assert.equal(r.status, 404); assert.match(r.body.error, /No encontramos ese elemento/);
    // elemento de otra acompañante en su destacada
    assert.equal((await c.elegir(id, fAjena.id)).status, 404);
    // otra acompañante sobre su destacada (con un elemento de ella)
    assert.equal((await otra.elegir(id, f1.id)).status, 404);
    assert.equal((await otra.elegir(id, fAjena.id)).status, 404);
    const antes = subidas().length;
    assert.equal((await otra.subir(id)).status, 404);
    assert.equal(subidas().length, antes, 'no queda el archivo');
    assert.equal((await otra.automatica(id)).status, 404);
    // inexistente, inválido, vacío
    assert.equal((await c.elegir(id, crypto.randomUUID())).status, 404);
    assert.equal((await c.elegir(id, 'x')).status, 404);
    assert.equal((await c.elegir(id, null)).status, 400);
    assert.equal((await c.elegir(crypto.randomUUID(), f1.id)).status, 404);
    // un video que todavía se procesa
    const { rows: [v] } = await db.query("INSERT INTO destacada_items (destacada_id, cuenta_id, tipo, estado) VALUES ($1, $2, 'video', 'procesando') RETURNING id", [id, c.id]);
    r = await c.elegir(id, v.id);
    assert.equal(r.status, 400); assert.match(r.body.error, /ya esté listo/);
    // nada cambió
    assert.equal((await c.panel(id)).portada, null);
    assert.equal((await c.publica(id)).portada, null);
  });

  test('video listo: su portada; si se borra el elemento elegido vuelve la automática', async () => {
    const c = await registrar();
    const id = await c.crear('Mix');
    const f1 = (await c.foto(id)).body.item; const f2 = (await c.foto(id)).body.item;
    const { rows: [v] } = await db.query(
      "INSERT INTO destacada_items (destacada_id, cuenta_id, tipo, estado, url, url_mini, segundos) VALUES ($1, $2, 'video', 'listo', 'https://cdn.prueba.test/d/v.mp4', 'https://cdn.prueba.test/d/v.webp', 5) RETURNING id",
      [id, c.id]);
    const rv = await c.elegir(id, v.id);
    assert.equal(rv.status, 200); assert.equal(rv.body.portada.url, 'https://cdn.prueba.test/d/v.webp');
    assert.equal((await c.publica(id)).portada, 'https://cdn.prueba.test/d/v.webp');
    assert.equal((await c.elegir(id, f2.id)).status, 200);
    assert.equal((await c.publica(id)).portada, f2.urlMini);
    // borra la foto que era la portada: vuelve la automática (el primer elemento)
    assert.equal((await c.json('DELETE', '/api/cuenta/destacadas/items/' + f2.id)).status, 200);
    assert.equal((await c.panel(id)).portada, null);
    const pub = await c.publica(id);
    assert.equal(pub.portada, null);
    assert.equal(pub.items[0].id, f1.id);
    // con un elemento de portada, borrar la destacada entera funciona igual
    assert.equal((await c.elegir(id, f1.id)).status, 200);
    assert.equal((await c.json('DELETE', '/api/cuenta/destacadas/' + id)).status, 200);
    assert.equal((await c.panel(id)), undefined);
  });

  test('borrar la destacada borra la imagen de portada subida', async () => {
    const c = await registrar();
    const id = await c.crear('Chau');
    const f1 = (await c.foto(id)).body.item;
    const r = await c.subir(id);
    const clave = claveDe(r.body.portada.url);
    assert.equal(guardados.has(clave), true);
    assert.equal((await c.json('DELETE', '/api/cuenta/destacadas/' + id)).status, 200);
    assert.equal(guardados.has(clave), false);
    assert.equal(guardados.has(`d/${f1.id}.webp`), false);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM destacadas WHERE id = $1', [id])).rows[0].n, 0);
  });
});
