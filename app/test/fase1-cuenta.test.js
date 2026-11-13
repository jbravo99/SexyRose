// Pruebas de la Fase 1: cuentas, perfil, fotos, verificación, historias y API pública del sitio.
//   DATABASE_URL=postgres://... node --test test/fase1-cuenta.test.js
// Levanta el servidor en este proceso con una carpeta de datos temporal. Borra lo que crea (emails zztest-*).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import sharp from 'sharp';
import { start } from '../server.js';
import { mailsEnviados } from '../lib/mail.js';
import { invalidarSitio } from '../routes/sitio.js';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('Falta DATABASE_URL.'); process.exit(1); }

const db = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
let instance; let BASE; let tmpData; let tmpPublic;
const demoras = []; // demoras del ingreso por email (no se duerme de verdad en las pruebas)
const rand = () => crypto.randomBytes(4).toString('hex');
const ip = () => `2001:db8:${rand().slice(0, 4)}::${rand().slice(0, 4)}`;
const emailNuevo = () => `zztest-${rand()}@example.com`;

before(async () => {
  tmpData = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-data-'));
  tmpPublic = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-pub-'));
  await fs.writeFile(path.join(tmpPublic, 'index.html'), '<!doctype html><title>x</title>');
  instance = await start({ prelanzamientoPorDefecto: false,
    port: 0, host: '127.0.0.1', databaseUrl: DATABASE_URL, publicDir: tmpPublic, dataDir: tmpData, storage: 'local',
    adminUser: '', adminPassword: '', adminPath: '', ipHashSalt: 'sal', siteUrl: 'https://sexyrose.net',
    telegramToken: '', telegramChatId: '', mailgunApiKey: '', log: () => {},
    dormirAuth: async (ms) => { demoras.push(ms); },
  });
  BASE = `http://127.0.0.1:${instance.port}`;
  await instance.ready;
});

after(async () => {
  await db.query("DELETE FROM cuentas WHERE email LIKE 'zztest-%@example.com'");
  await db.query("DELETE FROM denuncias WHERE descripcion LIKE '[zztest]%'");
  await db.end();
  if (instance) await instance.close();
  await fs.rm(tmpData, { recursive: true, force: true });
  await fs.rm(tmpPublic, { recursive: true, force: true });
});

// --- Cliente con cookie ---------------------------------------------------------
class Cliente {
  constructor() { this.cookie = ''; this.ip = ip(); }
  headers(extra = {}) {
    return { origin: BASE, 'x-sr': '1', 'cf-connecting-ip': this.ip, ...(this.cookie ? { cookie: this.cookie } : {}), ...extra };
  }
  guardar(r) {
    const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
    for (const c of sc) {
      const m = /^sr_sesion=([^;]*)/.exec(c);
      if (m) this.cookie = m[1] ? `sr_sesion=${m[1]}` : '';
    }
    return r;
  }
  async json(method, p, body, extra = {}) {
    const r = await fetch(BASE + p, {
      method, headers: this.headers({ 'content-type': 'application/json', ...extra }), body: body === undefined ? undefined : JSON.stringify(body),
    });
    this.guardar(r);
    return { status: r.status, body: await r.json().catch(() => null), res: r };
  }
  async get(p) { const r = await fetch(BASE + p, { headers: this.headers() }); return { status: r.status, body: await r.json().catch(() => null), res: r }; }
  async subir(p, campos) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) {
      if (typeof v === 'string') fd.append(k, v); else fd.append(k, new Blob([v], { type: 'image/jpeg' }), 'x.jpg');
    }
    const r = await fetch(BASE + p, { method: 'POST', headers: this.headers(), body: fd });
    this.guardar(r);
    return { status: r.status, body: await r.json().catch(() => null) };
  }
}

const datosRegistro = (over = {}) => ({
  email: emailNuevo(), password: 'una-clave-larga-123', displayName: `Zz Test ${rand()}`, fechaNacimiento: '1995-04-10', genero: 'mujer', tipo: 'acompanante',
  aceptaTerminos: true, mayorEdad: true, ...over,
});

// El registro no abre la sesión (no revela si el email ya existía): la cuenta entra con su contraseña
// (o con el link del email). Así quedan sin email confirmado, como antes.
async function registrar(over = {}) {
  const c = new Cliente();
  const d = datosRegistro(over);
  const r = await c.json('POST', '/api/cuenta/registro', d);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.revisarEmail, true);
  const l = await c.json('POST', '/api/cuenta/login', { email: d.email, password: d.password });
  assert.equal(l.status, 200, JSON.stringify(l.body));
  c.email = d.email; c.password = d.password; c.yo = l.body.cuenta;
  return c;
}

const jpeg = (w = 600, h = 600, color = { r: 200, g: 60, b: 120 }) => sharp({ create: { width: w, height: h, channels: 3, background: color } })
  .jpeg().withExif({ IFD0: { Copyright: 'dato-secreto-exif', Artist: 'gps-test' } }).toBuffer();

const ultimoLink = (email, ruta) => {
  const m = [...mailsEnviados].reverse().find((x) => x.to === email && x.links.some((l) => l.includes(ruta)));
  const link = m && m.links.find((l) => l.includes(ruta));
  return link ? new URL(link).searchParams.get('token') : null;
};

describe('registro, login y sesión', () => {
  test('registro crea cuenta + perfil borrador + email de verificación; el link abre la sesión (cookie segura)', async () => {
    const c = new Cliente();
    const d = datosRegistro();
    const r = await fetch(BASE + '/api/cuenta/registro', { method: 'POST', headers: c.headers({ 'content-type': 'application/json' }), body: JSON.stringify(d) });
    assert.equal(r.status, 201);
    assert.ok(!r.headers.getSetCookie().some((x) => x.startsWith('sr_sesion=')), 'el registro no abre la sesión');
    assert.deepEqual(await r.json(), { ok: true, revisarEmail: true, mensaje: 'Revisá tu email para continuar. Te mandamos un link para confirmar tu cuenta.' });
    const tok = ultimoLink(d.email, '/cuenta/verificar');
    assert.ok(tok, 'no se mandó el email de verificación');
    const v = await fetch(BASE + '/api/cuenta/verificar-email', { method: 'POST', headers: c.headers({ 'content-type': 'application/json' }), body: JSON.stringify({ token: tok }) });
    assert.equal(v.status, 200);
    const sc = v.headers.getSetCookie().find((x) => x.startsWith('sr_sesion='));
    assert.ok(sc, 'el link del email abre la sesión');
    for (const flag of ['HttpOnly', 'SameSite=Lax', 'Path=/', 'Secure', 'Max-Age=2592000']) assert.ok(sc.includes(flag), flag);
    const body = await v.json();
    assert.equal(body.cuenta.email, d.email);
    assert.equal(body.cuenta.emailVerificado, true);
    assert.equal(body.cuenta.perfil.estado, 'borrador');
    assert.equal(body.cuenta.perfil.verificacion, 'sin_enviar');
    assert.equal(body.cuenta.plan.efectivo, 'E');
    assert.equal(body.cuenta.perfil.completo, false);
    assert.ok(body.cuenta.perfil.faltantes.length >= 3);
    const { rows } = await db.query('SELECT pass_hash FROM cuentas WHERE email = $1', [d.email]);
    assert.match(rows[0].pass_hash, /^scrypt\$32768\$8\$1\$/);
    assert.ok(!rows[0].pass_hash.includes(d.password));
  });

  test('registro: validaciones', async () => {
    const c = new Cliente();
    assert.equal((await c.json('POST', '/api/cuenta/registro', datosRegistro({ email: 'no-es-email' }))).status, 400);
    assert.equal((await c.json('POST', '/api/cuenta/registro', datosRegistro({ password: 'corta' }))).status, 400);
    const menor = new Date(); menor.setUTCFullYear(menor.getUTCFullYear() - 17);
    const r = await c.json('POST', '/api/cuenta/registro', datosRegistro({ fechaNacimiento: menor.toISOString().slice(0, 10) }));
    assert.equal(r.status, 400); assert.match(r.body.error, /18/);
    assert.equal((await c.json('POST', '/api/cuenta/registro', datosRegistro({ aceptaTerminos: false }))).status, 400);
    assert.equal((await c.json('POST', '/api/cuenta/registro', datosRegistro({ mayorEdad: false }))).status, 400);
    // Tipo de perfil (virtual / acompañante / ambas): obligatorio y de la lista
    for (const tipo of [undefined, '', 'otra']) {
      const rt = await c.json('POST', '/api/cuenta/registro', datosRegistro({ tipo }));
      assert.equal(rt.status, 400, String(tipo)); assert.match(rt.body.error, /acompañante, virtual o ambas/);
    }
    // Email que ya tiene cuenta: la misma respuesta que un registro nuevo (no revela que existe) y un aviso al dueño
    const a = await registrar();
    const antes = mailsEnviados.filter((m) => m.to === a.email).length;
    const dup = await new Cliente().json('POST', '/api/cuenta/registro', datosRegistro({ email: a.email.toUpperCase() }));
    assert.equal(dup.status, 201);
    assert.deepEqual(dup.body, { ok: true, revisarEmail: true, mensaje: 'Revisá tu email para continuar. Te mandamos un link para confirmar tu cuenta.' });
    assert.ok(!dup.res.headers.getSetCookie().some((x) => x.startsWith('sr_sesion=')));
    const nuevos = mailsEnviados.filter((m) => m.to === a.email).slice(antes);
    assert.equal(nuevos.length, 1); assert.match(nuevos[0].subject, /intentó crear una cuenta/);
    const { rows: [n] } = await db.query('SELECT count(*)::int AS n FROM cuentas WHERE email = $1', [a.email]);
    assert.equal(n.n, 1, 'no se crea otra cuenta');
  });

  test('migración 140: los perfiles que ya existían quedan como acompañante (tipo de perfil)', async () => {
    const a = await registrar({ tipo: 'virtual' });
    const b = await registrar();
    await db.query("UPDATE perfiles SET datos = datos - 'tipo' WHERE cuenta_id = $1", [b.yo.id]);
    const sql = await fs.readFile(new URL('../db/140-tipo-perfil.sql', import.meta.url), 'utf8');
    await db.query(sql);
    const { rows } = await db.query('SELECT cuenta_id, datos->>\'tipo\' AS tipo FROM perfiles WHERE cuenta_id = ANY($1)', [[a.yo.id, b.yo.id]]);
    const tipo = Object.fromEntries(rows.map((r) => [r.cuenta_id, r.tipo]));
    assert.equal(tipo[a.yo.id], 'virtual', 'no pisa lo que eligió');
    assert.equal(tipo[b.yo.id], 'acompanante');
  });

  test('login, contraseña incorrecta, yo y logout', async () => {
    const a = await registrar();
    const b = new Cliente();
    const mal = await b.json('POST', '/api/cuenta/login', { email: a.email, password: 'otra-clave-1234' });
    assert.equal(mal.status, 401); assert.equal(mal.body.error, 'Email o contraseña incorrectos.');
    const noExiste = await b.json('POST', '/api/cuenta/login', { email: emailNuevo(), password: 'otra-clave-1234' });
    assert.equal(noExiste.status, 401); assert.equal(noExiste.body.error, mal.body.error);
    const ok = await b.json('POST', '/api/cuenta/login', { email: a.email.toUpperCase(), password: a.password });
    assert.equal(ok.status, 200); assert.ok(b.cookie);
    assert.equal((await b.get('/api/cuenta/yo')).body.cuenta.email, a.email);
    const out = await b.json('POST', '/api/cuenta/logout', {});
    assert.equal(out.status, 200); assert.equal(b.cookie, '');
    assert.equal((await b.get('/api/cuenta/yo')).status, 401);
  });

  test('intentos fallidos: nadie puede bloquear la cuenta de otra (solo demora); por IP sí hay límite', async () => {
    const a = await registrar();
    demoras.length = 0;
    // 12 intentos fallidos desde IPs distintas: ninguno se corta, pero a partir del 6.º hay una demora creciente
    for (let i = 0; i < 12; i++) {
      const r = await new Cliente().json('POST', '/api/cuenta/login', { email: a.email, password: 'incorrecta-' + i });
      assert.equal(r.status, 401);
    }
    assert.ok(demoras.length >= 6, 'demora por email');
    assert.ok(demoras[demoras.length - 1] > demoras[0], 'la demora crece');
    assert.ok(Math.max(...demoras) <= 4000, 'con tope');
    // La dueña entra igual con su contraseña
    assert.equal((await new Cliente().json('POST', '/api/cuenta/login', { email: a.email, password: a.password })).status, 200);
    // Desde una misma IP: 10 fallos con ese email → el 11.º se corta (429) solo para esa IP
    const atacante = new Cliente();
    let last;
    for (let i = 0; i < 11; i++) last = await atacante.json('POST', '/api/cuenta/login', { email: a.email, password: 'otra-mala-' + i });
    assert.equal(last.status, 429);
    assert.equal((await new Cliente().json('POST', '/api/cuenta/login', { email: a.email, password: a.password })).status, 200);
  });

  test('verificar email con el link y restablecer contraseña (cierra las otras sesiones)', async () => {
    const a = await registrar();
    const tok = ultimoLink(a.email, '/cuenta/verificar');
    const v = await new Cliente().json('POST', '/api/cuenta/verificar-email', { token: tok });
    assert.equal(v.status, 200);
    assert.equal((await a.get('/api/cuenta/yo')).body.cuenta.emailVerificado, true);
    assert.equal((await new Cliente().json('POST', '/api/cuenta/verificar-email', { token: tok })).status, 400, 'el link se usa una sola vez');

    const otro = new Cliente();
    assert.equal((await otro.json('POST', '/api/cuenta/olvide', { email: emailNuevo() })).status, 200, 'no revela si existe');
    const ol = await otro.json('POST', '/api/cuenta/olvide', { email: a.email });
    assert.equal(ol.status, 200);
    const rt = ultimoLink(a.email, '/cuenta/restablecer');
    assert.ok(rt);
    const nueva = 'clave-nueva-segura-99';
    const rs = await otro.json('POST', '/api/cuenta/restablecer', { token: rt, password: nueva });
    assert.equal(rs.status, 200); assert.ok(otro.cookie);
    assert.equal((await a.get('/api/cuenta/yo')).status, 401, 'la sesión vieja se cerró');
    assert.equal((await new Cliente().json('POST', '/api/cuenta/login', { email: a.email, password: a.password })).status, 401);
    assert.equal((await new Cliente().json('POST', '/api/cuenta/login', { email: a.email, password: nueva })).status, 200);
    assert.equal((await otro.json('POST', '/api/cuenta/restablecer', { token: rt, password: 'otra-clave-mas-1' })).status, 400);
  });

  test('cambiar contraseña', async () => {
    const a = await registrar();
    assert.equal((await a.json('POST', '/api/cuenta/cambiar-password', { actual: 'mal-mal-mal-1', nueva: 'nueva-clave-555' })).status, 400);
    assert.equal((await a.json('POST', '/api/cuenta/cambiar-password', { actual: a.password, nueva: 'nueva-clave-555' })).status, 200);
    assert.equal((await new Cliente().json('POST', '/api/cuenta/login', { email: a.email, password: 'nueva-clave-555' })).status, 200);
  });
});

describe('protección de las mutaciones', () => {
  test('sin X-SR, otro origen, cross-site o text/plain → rechazado', async () => {
    const d = datosRegistro();
    const base = { 'content-type': 'application/json', origin: BASE, 'x-sr': '1', 'cf-connecting-ip': ip() };
    const post = (h) => fetch(BASE + '/api/cuenta/registro', { method: 'POST', headers: { ...base, ...h }, body: JSON.stringify(d) });
    const sin = { ...base }; delete sin['x-sr'];
    assert.equal((await fetch(BASE + '/api/cuenta/registro', { method: 'POST', headers: sin, body: JSON.stringify(d) })).status, 403);
    assert.equal((await post({ origin: 'https://malo.example' })).status, 403);
    assert.equal((await post({ 'sec-fetch-site': 'cross-site' })).status, 403);
    const sinOrigen = { ...base }; delete sinOrigen.origin;
    assert.equal((await fetch(BASE + '/api/cuenta/registro', { method: 'POST', headers: sinOrigen, body: JSON.stringify(d) })).status, 403);
    assert.equal((await post({ 'content-type': 'text/plain' })).status, 415);
    const { rowCount } = await db.query('SELECT 1 FROM cuentas WHERE email = $1', [d.email]);
    assert.equal(rowCount, 0);
  });
  test('sin sesión → 401', async () => {
    const c = new Cliente();
    assert.equal((await c.json('PUT', '/api/cuenta/perfil', { titular: 'x' })).status, 401);
    assert.equal((await c.get('/api/cuenta/yo')).status, 401);
  });
});

describe('perfil', () => {
  test('PUT perfil: valida, descarta campos desconocidos y arma la ubicación', async () => {
    const a = await registrar();
    const r = await a.json('PUT', '/api/cuenta/perfil', {
      titular: '  Café y museos  ', bio: 'Hola\n\n\n\nsoy yo', provincia: 'provincia-de-buenos-aires', ciudad: 'la-plata', zona: 'Centro',
      whatsapp: '+54 9 221 555-1234', telegram: '@zz_test_user', intereses: ['arte', 'vinos'], salidas: ['cafe'], idiomas: ['Español', 'Inglés'],
      alturaCm: 168, contextura: 'atletica', tarifaDesde: 40, links: [{ label: 'Web', url: 'https://example.com/a' }],
      estado: 'publicado', verificacion: 'verificada', plan: 'S', hackeo: true,
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const d = r.body.cuenta.perfil.datos;
    assert.equal(d.titular, 'Café y museos');
    assert.equal(d.bio, 'Hola\n\nsoy yo');
    assert.equal(d.whatsapp, '+5492215551234');
    assert.equal(d.telegram, 'zz_test_user');
    assert.equal(d.pais, 'argentina');
    assert.ok(!('estado' in d) && !('hackeo' in d) && !('plan' in d) && !('verificacion' in d));
    assert.equal(r.body.cuenta.perfil.estado, 'borrador');
    assert.equal(r.body.cuenta.perfil.verificacion, 'sin_enviar');
    const caba = await a.json('PUT', '/api/cuenta/perfil', { provincia: '', ciudad: 'ciudad-de-buenos-aires' });
    assert.equal(caba.body.cuenta.perfil.datos.provincia, 'ciudad-de-buenos-aires');
  });

  test('PUT perfil: rechazos', async () => {
    const a = await registrar();
    const casos = [
      { fechaNacimiento: `${new Date().getUTCFullYear() - 16}-01-01` },
      { fechaNacimiento: '1990-02-31' },
      { links: [{ label: 'x', url: 'http://inseguro.example' }] },
      { links: [{ label: 'x', url: 'javascript:alert(1)' }] },
      { whatsapp: '221 555 1234' },
      { provincia: 'provincia-de-cordoba', ciudad: 'la-plata' },
      { ciudad: 'no-existe' },
      { intereses: ['arte', 'algo-raro'] },
      { intereses: ['arte', 'musica', 'cine', 'teatro', 'lectura', 'historia', 'vinos'] },
      { displayName: 'x' },
      { alturaCm: 300 },
      { bio: 'a'.repeat(1501) },
      { tipo: 'otra' },
      { tipo: '' },
    ];
    for (const c of casos) assert.equal((await a.json('PUT', '/api/cuenta/perfil', c)).status, 400, JSON.stringify(c));
  });

  test('slug único a partir del nombre artístico', async () => {
    const nombre = `Zz Valentina ${rand()}`;
    const a = await registrar({ displayName: nombre });
    const b = await registrar({ displayName: nombre });
    const base = nombre.toLowerCase().replace(/ /g, '-');
    assert.equal(a.yo.perfil.slug, base);
    assert.equal(b.yo.perfil.slug, base + '-2');
    const r = await registrar({ displayName: 'Admin' });
    assert.notEqual(r.yo.perfil.slug, 'admin');
  });
});

describe('fotos', () => {
  test('subida: sin EXIF, con marca de agua, tamaños y miniatura; borrar y ordenar', async () => {
    const a = await registrar();
    const negro = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: { r: 0, g: 0, b: 0 } } })
      .jpeg().withExif({ IFD0: { Copyright: 'dato-secreto-exif' } }).toBuffer();
    assert.ok((await sharp(negro).metadata()).exif, 'la imagen de prueba tiene EXIF');
    const r = await a.subir('/api/cuenta/fotos', { foto: negro });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const f = r.body.foto;
    assert.match(f.url, /^\/media\/f\/[0-9a-f-]{36}\.webp$/);
    const res = await fetch(BASE + f.url);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/webp');
    assert.match(res.headers.get('cache-control'), /max-age=31536000/);
    const buf = Buffer.from(await res.arrayBuffer());
    const meta = await sharp(buf).metadata();
    assert.equal(meta.width, 1600); assert.equal(meta.height, 1067);
    assert.equal(meta.exif, undefined, 'EXIF eliminado');
    assert.ok(!buf.includes(Buffer.from('dato-secreto-exif')));
    // Marca de agua (desde 11/11/2026 arriba a la derecha): la imagen era negra; arriba a la derecha tiene que haber
    // píxeles claros y abajo al centro (donde la tarjeta muestra el nombre) ya no.
    const maxRegion = async (left, top, width, height) => {
      const { data, info } = await sharp(buf).extract({ left, top, width, height }).raw().toBuffer({ resolveWithObject: true });
      let m = 0; for (let i = 0; i < data.length; i += info.channels) m = Math.max(m, data[i]);
      return m;
    };
    assert.ok(await maxRegion(1100, 0, 500, 160) > 60, 'hay marca de agua arriba a la derecha');
    assert.ok(await maxRegion(500, 850, 600, 200) < 20, 'abajo al centro no hay marca');
    const mini = await sharp(Buffer.from(await (await fetch(BASE + f.urlMini)).arrayBuffer())).metadata();
    assert.equal(mini.width, 480);

    const r2 = await a.subir('/api/cuenta/fotos', { foto: await jpeg() });
    const r3 = await a.subir('/api/cuenta/fotos', { foto: await jpeg() });
    const ids = [r3.body.foto.id, f.id, r2.body.foto.id];
    const o = await a.json('PUT', '/api/cuenta/fotos/orden', { ids });
    assert.equal(o.status, 200);
    assert.deepEqual(o.body.cuenta.perfil.fotos.map((x) => x.id), ids);
    assert.equal((await a.json('PUT', '/api/cuenta/fotos/orden', { ids: ids.slice(0, 2) })).status, 400);
    const otra = await registrar();
    assert.equal((await otra.json('DELETE', '/api/cuenta/fotos/' + f.id)).status, 404, 'no puede borrar fotos ajenas');
    assert.equal((await a.json('DELETE', '/api/cuenta/fotos/' + f.id)).status, 200);
    assert.equal((await fetch(BASE + f.url)).status, 404);
  });

  test('rechaza lo que no es imagen', async () => {
    const a = await registrar();
    const r = await a.subir('/api/cuenta/fotos', { foto: Buffer.from('<?php echo 1; ?> esto no es una imagen') });
    assert.equal(r.status, 400);
    const chica = await sharp({ create: { width: 50, height: 50, channels: 3, background: '#fff' } }).png().toBuffer();
    assert.equal((await a.subir('/api/cuenta/fotos', { foto: chica })).status, 400);
  });

  test('límite de fotos del plan Bronce (8)', async () => {
    const a = await registrar();
    const img = await jpeg(400, 400);
    for (let i = 0; i < 8; i++) assert.equal((await a.subir('/api/cuenta/fotos', { foto: img })).status, 201);
    const r = await a.subir('/api/cuenta/fotos', { foto: img });
    assert.equal(r.status, 400); assert.match(r.body.error, /8 fotos/);
  });
});

describe('verificación de identidad', () => {
  test('selfie y documento quedan privados', async () => {
    const a = await registrar();
    // Sin el consentimiento aparte para datos sensibles, se rechaza
    const sin = await a.subir('/api/cuenta/verificacion', { selfie: await jpeg(), documento: await jpeg(900, 600) });
    assert.equal(sin.status, 400); assert.match(sin.body.error, /aceptar el uso de tu documento/);
    const r = await a.subir('/api/cuenta/verificacion', { selfie: await jpeg(), documento: await jpeg(900, 600), consentimiento: '1' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.cuenta.perfil.verificacion, 'pendiente');
    const { rows } = await db.query('SELECT selfie_ruta, documento_ruta, estado, consentimiento_at FROM verificaciones WHERE cuenta_id = $1', [a.yo.id]);
    assert.equal(rows.length, 1); assert.equal(rows[0].estado, 'pendiente'); assert.ok(rows[0].consentimiento_at, 'guarda cuándo dio el consentimiento');
    for (const rel of [rows[0].selfie_ruta, rows[0].documento_ruta]) {
      assert.match(rel, /^verif\/[0-9a-f]{32}-(selfie|doc)\.jpg$/);
      const st = await fs.stat(path.join(tmpData, 'privado', rel));
      assert.ok(st.isFile());
      assert.equal(st.mode & 0o077, 0, 'permisos solo del dueño');
      const meta = await sharp(await fs.readFile(path.join(tmpData, 'privado', rel))).metadata();
      assert.equal(meta.exif, undefined);
      for (const u of ['/media/' + rel, '/media/../privado/' + rel, '/privado/' + rel, '/media/%2e%2e/privado/' + rel]) {
        assert.notEqual((await fetch(BASE + u)).status, 200, u);
      }
    }
    // Reenviar reemplaza la pendiente anterior
    await a.subir('/api/cuenta/verificacion', { selfie: await jpeg(), documento: await jpeg(), consentimiento: '1' });
    const { rows: r2 } = await db.query('SELECT 1 FROM verificaciones WHERE cuenta_id = $1', [a.yo.id]);
    assert.equal(r2.length, 1);
    await assert.rejects(fs.stat(path.join(tmpData, 'privado', rows[0].selfie_ruta)));
    assert.equal((await a.subir('/api/cuenta/verificacion', { selfie: await jpeg(), consentimiento: '1' })).status, 400);
  });
});

describe('historias', () => {
  test('límite diario de Bronce (1) y vencimiento a las 24 h', async () => {
    const a = await registrar();
    const r = await a.subir('/api/cuenta/historias', { foto: await jpeg(), texto: 'Café en Palermo' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.historia.texto, 'Café en Palermo');
    const r2 = await a.subir('/api/cuenta/historias', { foto: await jpeg() });
    assert.equal(r2.status, 400); assert.match(r2.body.error, /1 historia por día/);
    let yo = (await a.get('/api/cuenta/yo')).body.cuenta;
    assert.equal(yo.historias.length, 1); assert.equal(yo.limites.historiasHoy, 1);
    await db.query("UPDATE historias SET expira = now() - interval '1 minute' WHERE cuenta_id = $1", [a.yo.id]);
    yo = (await a.get('/api/cuenta/yo')).body.cuenta;
    assert.equal(yo.historias.length, 0);
  });
});

describe('enviar a revisión y sitio público', () => {
  test('completitud, revisión y aparición en /api/sitio/estado solo si está publicado y verificado', async () => {
    const a = await registrar();
    let r = await a.json('POST', '/api/cuenta/perfil/enviar-revision', {});
    assert.equal(r.status, 400); assert.ok(r.body.faltantes.length >= 4);
    await new Cliente().json('POST', '/api/cuenta/verificar-email', { token: ultimoLink(a.email, '/cuenta/verificar') });
    await a.json('PUT', '/api/cuenta/perfil', { provincia: 'provincia-de-cordoba', ciudad: 'cordoba', whatsapp: '+5493511234567', titular: 'Hola', nacionalidad: 'Argentina', intereses: ['arte', 'vinos'] });
    for (let i = 0; i < 3; i++) await a.subir('/api/cuenta/fotos', { foto: await jpeg() });
    r = await a.json('POST', '/api/cuenta/perfil/enviar-revision', {});
    assert.equal(r.status, 400); assert.deepEqual(r.body.faltantes, ['Enviá tu verificación de identidad (selfie y documento).']);
    await a.subir('/api/cuenta/verificacion', { selfie: await jpeg(), documento: await jpeg(), consentimiento: '1' });
    r = await a.json('POST', '/api/cuenta/perfil/enviar-revision', {});
    assert.equal(r.status, 200); assert.equal(r.body.cuenta.perfil.estado, 'en_revision');

    const pub = new Cliente();
    invalidarSitio();
    let e = (await pub.get('/api/sitio/estado')).body;
    assert.ok(Array.isArray(e.perfiles) && e.intereses.length === 16);
    // Georef (13/11/2026): el estado solo trae los lugares con perfiles publicados y los que los contienen
    const usados = new Set(e.perfiles.flatMap((x) => Object.values(x.ubicacionIds || {})));
    assert.ok(e.ubicaciones.filter((u) => u.tipo === 'ciudad' || u.tipo === 'barrio').every((u) => usados.has(u.id)));
    assert.equal(e.categorias, undefined); // el sitio no publica actividades (12/11/2026)
    assert.ok(e.ajustes.precios.mes.S === 350 && e.ajustes.precios.semana.C === 27 && !('B' in e.ajustes.precios.mes));
    assert.ok(!e.perfiles.some((p) => p.cuentaId === a.yo.id));

    await db.query("UPDATE perfiles SET estado = 'publicado', verificacion = 'pendiente', publicado_en = now() WHERE cuenta_id = $1", [a.yo.id]);
    invalidarSitio();
    e = (await pub.get('/api/sitio/estado')).body;
    assert.ok(!e.perfiles.some((p) => p.cuentaId === a.yo.id), 'sin verificar no se publica');

    await db.query("UPDATE perfiles SET verificacion = 'verificada' WHERE cuenta_id = $1", [a.yo.id]);
    await a.subir('/api/cuenta/historias', { foto: await jpeg(), texto: 'Hoy' });
    invalidarSitio();
    e = (await pub.get('/api/sitio/estado')).body;
    const p = e.perfiles.find((x) => x.cuentaId === a.yo.id);
    assert.ok(p);
    assert.equal(p.ciudad, 'Córdoba'); assert.equal(p.provincia, 'Provincia de Córdoba'); assert.equal(p.pais, 'Argentina');
    assert.ok(['cordoba', 'provincia-de-cordoba', 'argentina'].every((id) => e.ubicaciones.some((u) => u.id === id)), 'su ciudad, su provincia y el país viajan al sitio');
    assert.equal(p.edad > 18, true); assert.equal(p.plan, 'E'); assert.equal(p.star, false);
    assert.equal(p.fotos.length, 3); assert.equal(p.contacto.whatsapp, '+5493511234567');
    assert.ok(!('fechaNacimiento' in p) && !('email' in p));
    assert.ok(!('salidas' in p)); // las actividades no se publican
    // Intereses: el sitio filtra por ellos (inicio, Cerca y Swipe): la lista del admin con nombres por idioma y los ids de cada perfil
    assert.deepEqual(p.intereses, ['arte', 'vinos']);
    // Tipo de perfil: el de la registración, y se cambia desde el panel
    assert.equal(p.tipo, 'acompanante');
    assert.equal((await a.json('PUT', '/api/cuenta/perfil', { tipo: 'ambas' })).status, 200);
    assert.equal((await a.get('/api/cuenta/yo')).body.cuenta.perfil.datos.tipo, 'ambas');
    invalidarSitio();
    assert.equal((await pub.get('/api/sitio/estado')).body.perfiles.find((x) => x.cuentaId === a.yo.id).tipo, 'ambas');
    const arte = e.intereses.find((x) => x.id === 'arte');
    assert.ok(arte && arte.nombre === 'Arte' && arte.nombreEn === 'Art' && arte.nombrePt === 'Arte');
    assert.ok(e.historias.some((h) => h.cuentaId === a.yo.id && h.texto === 'Hoy'));
    assert.equal((await pub.get('/api/sitio/perfil/' + p.slug)).body.slug, p.slug);
    assert.equal((await pub.get('/api/sitio/perfil/no-existe-zz')).status, 404);

    // Oculto → sale del sitio
    await a.json('POST', '/api/cuenta/perfil/ocultar', { oculto: true });
    e = (await pub.get('/api/sitio/estado')).body;
    assert.ok(!e.perfiles.some((x) => x.cuentaId === a.yo.id));

    // Reporte de un perfil
    const rep = await pub.json('POST', '/api/sitio/reporte', { slug: p.slug, categoria: 'otro', descripcion: '[zztest] Este perfil parece falso, revisar.' });
    assert.equal(rep.status, 201, JSON.stringify(rep.body));
    const { rows } = await db.query('SELECT url FROM denuncias WHERE id = $1', [rep.body.id]);
    assert.equal(rows[0].url, 'https://sexyrose.net/perfil/' + p.slug);
  });

  test('cuenta suspendida no puede editar', async () => {
    const a = await registrar();
    await db.query("UPDATE cuentas SET estado = 'suspendida' WHERE id = $1", [a.yo.id]);
    assert.equal((await a.json('PUT', '/api/cuenta/perfil', { titular: 'x' })).status, 403);
    assert.equal((await a.get('/api/cuenta/yo')).body.cuenta.estado, 'suspendida');
  });
});
