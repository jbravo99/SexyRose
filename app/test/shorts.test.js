// Shorts (11/11/2026): orden del feed (mvp/src/prod-shorts.js, función pura), datos que usa (videos públicos en
// /api/sitio/estado, con fecha), ajuste del admin (tarjeta propia cada N videos), dirección /shorts del sitio,
// logo único (favicon, íconos, email) y fuentes propias en las páginas del servidor.
//   DATABASE_URL=postgres://... node --test test/shorts.test.js
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { start } from '../server.js';
import { invalidarSitio } from '../routes/sitio.js';
import { emailBasico } from '../lib/mail.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(HERE, '..');
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('Falta DATABASE_URL.'); process.exit(1); }

// prod-shorts.js es JS de navegador: se carga en un contexto aislado sin window (exporta la función pura)
async function cargarOrden() {
  const src = await fs.readFile(path.join(APP, '..', 'mvp', 'src', 'prod-shorts.js'), 'utf8');
  const module = { exports: {} };
  vm.runInNewContext(src, { module, Date, Math });
  // Los arreglos del otro contexto tienen otro prototipo: se copian para comparar
  return (items, semilla) => JSON.parse(JSON.stringify(module.exports.shortsOrden(items, semilla)));
}
async function cargarHash() {
  const src = await fs.readFile(path.join(APP, '..', 'mvp', 'src', 'prod-shorts.js'), 'utf8');
  const module = { exports: {} };
  vm.runInNewContext(src, { module, Date, Math });
  return module.exports.hashMezcla;
}

describe('orden del feed (shortsOrden)', () => {
  const H = 3600e3;
  const base = Date.parse('2026-11-11T12:00:00Z');
  const it = (perfilId, horasAtras, n) => ({ key: `${perfilId}:${n}`, perfilId, fecha: new Date(base - horasAtras * H).toISOString() });

  test('nadie acapara el feed: de a uno por acompañante, del video más nuevo al más viejo', async () => {
    const orden = await cargarOrden();
    // A subió 4 videos hoy, B 1 hoy, C 2 hace 3 días
    const items = [it('A', 1, 1), it('A', 2, 2), it('A', 3, 3), it('A', 4, 4), it('B', 5, 1), it('C', 72, 1), it('C', 80, 2)];
    const out = orden(items, 'semilla');
    assert.equal(out.length, items.length);
    // primera vuelta: A y B (hoy) en algún orden, después C (hace 3 días)
    assert.deepEqual(new Set(out.slice(0, 2).map((x) => x.perfilId)), new Set(['A', 'B']));
    assert.equal(out[2].perfilId, 'C');
    // nunca dos seguidos de la misma mientras haya otras con videos pendientes
    for (let i = 1; i < 5; i++) assert.notEqual(out[i].perfilId, out[i - 1].perfilId, `posición ${i}`);
    // los de A, del más nuevo al más viejo
    assert.deepEqual(out.filter((x) => x.perfilId === 'A').map((x) => x.key), ['A:1', 'A:2', 'A:3', 'A:4']);
    // al final quedan solo los que sobran de A
    assert.deepEqual(out.slice(-2).map((x) => x.key), ['A:3', 'A:4']);
  });

  test('mismo día: la semilla mezcla el orden; misma semilla, mismo orden', async () => {
    const orden = await cargarOrden();
    const items = 'ABCDEFGHIJ'.split('').map((p, i) => it(p, 1 + i * 0.1, 1));
    const a = orden(items, 's1').map((x) => x.perfilId).join('');
    assert.equal(orden(items, 's1').map((x) => x.perfilId).join(''), a);
    const otras = ['s2', 's3', 's4', 's5'].map((s) => orden(items, s).map((x) => x.perfilId).join(''));
    assert.ok(otras.some((o) => o !== a), 'otra semilla cambia el orden');
  });

  test('Star primero en cada vuelta (de a una), rotando entre ellas según la semilla', async () => {
    const orden = await cargarOrden();
    const star = (p, h, n) => ({ ...it(p, h, n), star: true });
    // A (no Star) subió hoy; S1 y S2 (Star) hace días; S1 tiene 2 videos
    const items = [it('A', 1, 1), it('A', 2, 2), star('S1', 50, 1), star('S1', 60, 2), star('S2', 90, 1), it('B', 30, 1)];
    const out = orden(items, 'x');
    assert.deepEqual(new Set(out.slice(0, 2).map((x) => x.perfilId)), new Set(['S1', 'S2']), 'la primera vuelta arranca con las Star');
    assert.deepEqual(out.slice(2, 4).map((x) => x.perfilId), ['A', 'B'], 'después el resto, por fecha');
    assert.equal(out[4].perfilId, 'S1', 'segunda vuelta: otra vez la Star primero');
    assert.equal(out[5].perfilId, 'A');
    // entre Star, el orden depende de la semilla (no siempre la misma primera)
    const primeras = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((sem) => orden(items, sem)[0].perfilId));
    assert.equal(primeras.size, 2, 'las dos Star rotan en el primer lugar');
  });

  test('hash con mezcla: cambiar la semilla reordena de verdad (rotación de Destacado)', async () => {
    const h = await cargarHash();
    const ids = Array.from({ length: 20 }, (_, i) => `cuenta-${i}-${'x'.repeat(i % 3)}`);
    const ordenCon = (semilla) => ids.slice().sort((a, b) => h(a + semilla) - h(b + semilla)).join(',');
    const ordenes = new Set(['k1', 'k2', 'k3', 'k4', 'k5', 'k6'].map(ordenCon));
    assert.equal(ordenes.size, 6, 'cada semilla da un orden distinto');
    const primeros = new Set(['k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7', 'k8'].map((sm) => ordenCon(sm).split(',')[0]));
    assert.ok(primeros.size >= 4, 'el primer lugar va cambiando');
    // prod-sitio.js usa este hash para la rotación de las destacadas
    const sitio = await fs.readFile(path.join(APP, '..', 'mvp', 'src', 'prod-sitio.js'), 'utf8');
    assert.match(sitio, /const rota = \(id\) => \(HH\.hashMezcla \?/);
    assert.doesNotMatch(sitio, /hash\([a-z]\.userId \+ ROTA\)/);
  });

  test('entradas raras: vacío, sin perfil, sin fecha', async () => {
    const orden = await cargarOrden();
    assert.deepEqual(orden([], 'x'), []);
    assert.deepEqual(orden(null, 'x'), []);
    const out = orden([{ key: 'k1', perfilId: 'A' }, { key: 'k2' }, it('B', 1, 1)], 'x');
    assert.deepEqual(out.map((x) => x.key), ['B:1', 'k1']);
  });
});

describe('logo único', () => {
  test('favicon = el del encabezado (cuadrado rosa con corazón) y existen los PNG', async () => {
    const svg = await fs.readFile(path.join(APP, 'public', 'favicon.svg'), 'utf8');
    assert.match(svg, /#FF5C8A/);
    assert.match(svg, /M19 14c1\.49-1\.46 3-3\.21 3-5\.5/); // el corazón de HH.icon('heart')
    for (const f of ['apple-touch-icon.png', 'logo-email.png', 'icon-192.png', 'icon-512.png']) {
      const b = await fs.readFile(path.join(APP, 'public', f));
      assert.equal(b.subarray(1, 4).toString(), 'PNG', f);
    }
    const man = JSON.parse(await fs.readFile(path.join(APP, 'public', 'site.webmanifest'), 'utf8'));
    assert.equal(man.name, 'SexyRose');
  });
  test('los emails llevan el logo', () => {
    const { html } = emailBasico({ titulo: 'Hola', parrafos: ['x'] });
    assert.match(html, /<img src="https:\/\/[^"]+\/logo-email\.png" width="32" height="32"/);
  });
  test('las páginas del servidor no piden nada a Google', async () => {
    for (const f of ['terminos.html', 'privacidad.html', 'contenido.html', 'trata.html', 'denunciar.html', '404.html', 'index.html']) {
      const html = await fs.readFile(path.join(APP, 'public', f), 'utf8');
      assert.doesNotMatch(html, /googleapis|gstatic/, f);
      assert.match(html, /<!--sr:fuentes-->/, f);
      assert.match(html, /<img src="\/favicon\.svg"/, f);
    }
  });
});

describe('servidor: estado, ajuste y /shorts', () => {
  const db = new pg.Pool({ connectionString: DATABASE_URL, max: 4 });
  const A = '/panel-pruebas-shorts-0123456789';
  const USER = 'admin-sh'; const PASS = 'clave-de-prueba-larga-789';
  const auth = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
  const admPut = (p, body) => fetch(BASE + A + '/api' + p, { method: 'PUT', body: JSON.stringify(body), headers: { authorization: auth, 'content-type': 'application/json', 'x-sr-admin': '1', origin: BASE } });
  let instance; let BASE; let tmpData; let tmpSpa;
  const cuentas = [];

  before(async () => {
    tmpData = await fs.mkdtemp(path.join(os.tmpdir(), 'srsh-data-'));
    // Cáscara del sitio de prueba con su hoja de fuentes (como la que deja build-sitio.py)
    tmpSpa = await fs.mkdtemp(path.join(os.tmpdir(), 'srsh-spa-'));
    await fs.mkdir(path.join(tmpSpa, 'assets'));
    await fs.writeFile(path.join(tmpSpa, 'index.html'), '<!doctype html><html><head><title>SR</title><!--SR:SEO--><!--SR:PRECONNECT--></head><body><main id="app"></main></body></html>');
    // Plantillas SEO mínimas (mismo formato que seo-datos.json de build-sitio.py)
    const tpl = Object.fromEntries(['es', 'en', 'pt'].map((l) => [l, Object.fromEntries(['country', 'place', 'placeAct', 'countryMen', 'placeMen', 'profile'].map((k) => [k, { title: k, description: k }]))]));
    await fs.writeFile(path.join(tmpSpa, 'seo-datos.json'), JSON.stringify({ defaults: { siteUrl: 'https://sexyrose.test', minProfiles: 1, home: Object.fromEntries(['es', 'en', 'pt'].map((l) => [l, { title: 'Inicio', description: 'd' }])), tpl }, lugares: {}, dict: {} }));
    await fs.writeFile(path.join(tmpSpa, 'assets', 'fuentes.0123456789ab.css'), "@font-face{font-family:'Poppins';src:url(/assets/fonts/x.0123456789ab.woff2)}");
    process.env.SITIO_SPA_PATH = path.join(tmpSpa, 'index.html');
    instance = await start({ prelanzamientoPorDefecto: false,
      port: 0, host: '127.0.0.1', databaseUrl: DATABASE_URL, adminPath: A, adminUser: USER, adminPassword: PASS,
      ipHashSalt: 'sal', siteUrl: 'https://sexyrose.test', dataDir: tmpData, log: () => {}, tareaPlanes: false, sendMail: async () => {},
    });
    BASE = `http://127.0.0.1:${instance.port}`;
    await instance.ready;
    await db.query("DELETE FROM cuentas WHERE email LIKE 'zzsh-%'");
    const crear = async (i, estado, verificacion, oculto = false) => {
      const { rows } = await db.query('INSERT INTO cuentas (email, pass_hash) VALUES ($1, $2) RETURNING id', [`zzsh-${i}-${crypto.randomBytes(3).toString('hex')}@example.com`, 'x']);
      const id = rows[0].id; cuentas.push(id);
      await db.query("INSERT INTO perfiles (cuenta_id, slug, datos, estado, verificacion, oculto, publicado_en) VALUES ($1, $2, $3, $4, $5, $6, now())",
        [id, `zzsh-${i}-${id.slice(0, 6)}`, JSON.stringify({ displayName: 'Sh ' + i, genero: 'mujer', fechaNacimiento: '1995-01-01', pais: 'argentina', provincia: 'provincia-de-buenos-aires', ciudad: 'san-isidro' }), estado, verificacion, oculto]);
      await db.query('INSERT INTO fotos (cuenta_id, orden, clave, url, url_mini, ancho, alto) VALUES ($1, 0, $2, $3, $3, 800, 1000)', [id, `zzsh/${id}.jpg`, `https://cdn.example/zzsh${i}.jpg`]);
      await db.query("INSERT INTO suscripciones (cuenta_id, plan, periodo, desde, hasta, origen) VALUES ($1, 'C', 'mes', now() - interval '1 day', now() + interval '20 days', 'manual')", [id]);
      await db.query("INSERT INTO videos (cuenta_id, orden, estado, url, url_poster, segundos, ancho, alto, creado) VALUES ($1, 0, 'listo', $2, $3, 8, 720, 1280, now() - interval '2 hours')", [id, `https://cdn.example/zzsh${i}.mp4`, `https://cdn.example/zzsh${i}.jpg`]);
      await db.query("INSERT INTO videos (cuenta_id, orden, estado) VALUES ($1, 1, 'procesando')", [id]);
      return id;
    };
    await crear(1, 'publicado', 'verificada');
    await crear(2, 'publicado', 'verificada', true);  // oculto
    await crear(3, 'en_revision', 'pendiente');       // no publicado
    await db.query("DELETE FROM ajustes WHERE clave = 'shorts'");
    invalidarSitio();
  });
  after(async () => {
    await instance?.close();
    delete process.env.SITIO_SPA_PATH;
    await db.query("DELETE FROM cuentas WHERE email LIKE 'zzsh-%'");
    await db.query("DELETE FROM ajustes WHERE clave = 'shorts'");
    await db.end();
    await fs.rm(tmpData, { recursive: true, force: true });
    await fs.rm(tmpSpa, { recursive: true, force: true });
  });

  test('el estado trae solo los videos listos de perfiles visibles, con fecha, y sin ajuste de Shorts', async () => {
    const e = await (await fetch(BASE + '/api/sitio/estado')).json();
    const mias = e.perfiles.filter((p) => cuentas.includes(p.cuentaId));
    assert.equal(mias.length, 1, 'solo la publicada y visible');
    assert.equal(mias[0].videos.length, 1, 'solo el video listo');
    const v = mias[0].videos[0];
    assert.equal(v.poster, 'https://cdn.example/zzsh1.jpg');
    assert.ok(Date.parse(v.creado) > Date.now() - 3 * 3600e3, 'con fecha de subida');
    assert.equal('shorts' in e.ajustes, false, 'sin ajuste de Shorts (la tarjeta propia se sacó)');
  });

  test('Admin → Ajustes ya no tiene "shorts" (sin tarjeta propia)', async () => {
    const r = await admPut('/ajustes/shorts', { valor: { promoCada: 6 } });
    assert.equal(r.status, 404); // ajuste desconocido
  });

  test('/shorts, /en/shorts y /pt/shorts abren el sitio (no indexado)', async () => {
    for (const p of ['/shorts', '/en/shorts', '/pt/shorts']) {
      const r = await fetch(BASE + p);
      assert.equal(r.status, 200, p);
      const html = await r.text();
      assert.match(html, /<main id="app">/, p);
      assert.match(html, /name="robots" content="noindex,follow"/, p);
      assert.match(html, /<title>Shorts \| SexyRose<\/title>/, p);
    }
  });

  test('páginas del servidor: fuentes propias, sin Google, con el logo', async () => {
    const r = await fetch(BASE + '/terminos');
    assert.equal(r.status, 200);
    const csp = r.headers.get('content-security-policy');
    assert.doesNotMatch(csp, /googleapis|gstatic/);
    const html = await r.text();
    assert.match(html, /<link rel="stylesheet" href="\/assets\/fuentes\.0123456789ab\.css">/);
    assert.doesNotMatch(html, /sr:fuentes|googleapis/);
    const css = await fetch(BASE + '/assets/fuentes.0123456789ab.css');
    assert.equal(css.status, 200);
    assert.match(css.headers.get('content-type'), /text\/css/);
    for (const f of ['/favicon.svg', '/apple-touch-icon.png', '/logo-email.png', '/site.webmanifest']) assert.equal((await fetch(BASE + f)).status, 200, f);
  });
});
