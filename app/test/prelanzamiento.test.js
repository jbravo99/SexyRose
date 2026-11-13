// Home provisoria (pre-lanzamiento, 13/11/2026): lib/prelanzamiento.js, estado público vacío, 302 de lo oculto,
// SEO de la portada, sitemap, registro de interesados cerrado, registro de acompañantes abierto y el interruptor de
// Admin → Ajustes. Este archivo arranca el servidor SIN prelanzamientoPorDefecto: prueba el valor de producción
// (prendida si el ajuste nunca se guardó). Al terminar borra el ajuste (las demás pruebas usan el modo normal).
//   DATABASE_URL=postgres://... node --test test/prelanzamiento.test.js
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { start } from '../server.js';
import { hashPassword } from '../lib/auth.js';
import { invalidarCatalogos } from '../lib/catalogos.js';
import { invalidarSitio } from '../routes/sitio.js';
import {
  ocultaEnPrelanzamiento, prelanzamientoActivo, validarPrelanzamiento, SEO_PRELANZAMIENTO, REGISTRO_CLIENTE_CERRADO,
} from '../lib/prelanzamiento.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MVP = path.join(HERE, '..', '..', 'mvp');
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('Falta DATABASE_URL.'); process.exit(1); }

describe('lib/prelanzamiento.js', () => {
  test('sin ajuste guardado: prendida; con ajuste: lo guardado', () => {
    assert.equal(prelanzamientoActivo({}), true);
    assert.equal(prelanzamientoActivo(null), true);
    assert.equal(prelanzamientoActivo({ prelanzamiento: { activo: false } }), false);
    assert.equal(prelanzamientoActivo({ prelanzamiento: { activo: true } }), true);
    assert.equal(prelanzamientoActivo({ prelanzamiento: 'cualquier cosa' }), true);
  });
  test('validación del ajuste: solo { activo: bool }', () => {
    assert.deepEqual(validarPrelanzamiento({ activo: false }), { valor: { activo: false } });
    assert.deepEqual(validarPrelanzamiento({ activo: true, otra: 1 }), { valor: { activo: true } });
    for (const v of [null, true, 'si', [], {}, { activo: 'true' }, { activo: 1 }]) assert.ok(validarPrelanzamiento(v).error, JSON.stringify(v));
  });
  test('qué se oculta', () => {
    for (const p of [['perfil', 'x'], ['profile', 'x'], ['argentina'], ['argentina', 'san-isidro'], ['argentina', 'hombres'], ['cerca'], ['near-me'], ['perto-de-mim'],
      ['swipe'], ['shorts'], ['stars'], ['links', 'x'], ['favoritos'], ['favorites'], ['cliente', 'registro']]) assert.equal(ocultaEnPrelanzamiento(p), true, p.join('/'));
    for (const p of [[], ['registro'], ['sign-up'], ['cadastro'], ['ingresar'], ['login'], ['entrar'], ['panel'], ['panel', 'fotos'], ['cuenta', 'verificar'],
      ['cuenta', 'restablecer'], ['compra', 'abc'], ['cliente', 'ingresar'], ['cliente', 'verificar'], ['cliente', 'restablecer'], ['cliente', 'compras']]) assert.equal(ocultaEnPrelanzamiento(p), false, p.join('/') || '/');
  });
  test('el front repite los mismos títulos y descripciones, y va solo en el sitio real', async () => {
    const src = await fs.readFile(path.join(MVP, 'src', 'prod-prelanzamiento.js'), 'utf8');
    for (const l of ['es', 'en', 'pt']) {
      assert.ok(src.includes(SEO_PRELANZAMIENTO[l].title), 'título ' + l);
      assert.ok(src.includes(SEO_PRELANZAMIENTO[l].description), 'descripción ' + l);
    }
    assert.match(SEO_PRELANZAMIENTO.es.title, /^Escorts y acompañantes en Argentina \| SexyRose$/);
    assert.match(src, /window\.HH_DEMO\) return;/, 'la demo no la usa');
    const build = await fs.readFile(path.join(MVP, 'build.py'), 'utf8');
    const sitio = build.split("elif TARGET == 'sitio':")[1].split('elif TARGET:')[0];
    assert.match(sitio, /'prod-prelanzamiento\.js'/);
    assert.doesNotMatch(build.split("elif TARGET == 'sitio':")[0], /prod-prelanzamiento/);
  });
});

describe('servidor con la home provisoria', () => {
  const db = new pg.Pool({ connectionString: DATABASE_URL, max: 4 });
  const A = '/panel-pruebas-prelanzamiento-0123';
  const USER = 'admin-pre'; const PASS = 'clave-de-prueba-larga-456';
  const auth = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
  let instance; let BASE; let tmpData; let tmpSpa; let slug; let clienteEmail;
  const ipAzar = () => `10.9.${crypto.randomInt(256)}.${crypto.randomInt(256)}`;
  const get = (p) => fetch(BASE + p, { redirect: 'manual' });
  const admin = (method, p, body, extra = {}) => fetch(BASE + A + '/api' + p, {
    method, body: body === undefined ? undefined : JSON.stringify(body),
    headers: { authorization: auth, ...(method !== 'GET' ? { 'content-type': 'application/json', 'x-sr-admin': '1', origin: BASE } : {}), ...extra },
  });
  const post = (p, body) => fetch(BASE + '/api' + p, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', 'x-sr': '1', origin: BASE, 'cf-connecting-ip': ipAzar() } });
  const estado = async () => (await get('/api/sitio/estado')).json();
  const ponerModo = async (activo) => {
    const r = await admin('PUT', '/ajustes/prelanzamiento', { valor: { activo } });
    assert.equal(r.status, 200);
    return r.json();
  };

  before(async () => {
    tmpData = await fs.mkdtemp(path.join(os.tmpdir(), 'srpre-data-'));
    tmpSpa = await fs.mkdtemp(path.join(os.tmpdir(), 'srpre-spa-'));
    await fs.mkdir(path.join(tmpSpa, 'assets'));
    await fs.writeFile(path.join(tmpSpa, 'index.html'), '<!doctype html><html lang="es-AR"><head><title>SR</title><meta name="description" content="x"><!--SR:SEO--><!--SR:PRECONNECT--></head><body><main id="app"></main></body></html>');
    const tpl = Object.fromEntries(['es', 'en', 'pt'].map((l) => [l, Object.fromEntries(['country', 'place', 'countryMen', 'placeMen', 'profile'].map((k) => [k, { title: k + ' {lugar}', description: k }]))]));
    await fs.writeFile(path.join(tmpSpa, 'seo-datos.json'), JSON.stringify({ defaults: { siteUrl: 'https://sexyrose.test', minProfiles: 1, home: Object.fromEntries(['es', 'en', 'pt'].map((l) => [l, { title: 'Inicio normal', description: 'descripcion normal' }])), tpl }, lugares: {}, dict: {} }));
    process.env.SITIO_SPA_PATH = path.join(tmpSpa, 'index.html');
    // Sin prelanzamientoPorDefecto: el valor de producción
    instance = await start({
      port: 0, host: '127.0.0.1', databaseUrl: DATABASE_URL, adminPath: A, adminUser: USER, adminPassword: PASS,
      ipHashSalt: 'sal', siteUrl: 'https://sexyrose.test', dataDir: tmpData, log: () => {}, tareaPlanes: false, sendMail: async () => {},
    });
    BASE = `http://127.0.0.1:${instance.port}`;
    await instance.ready;
    // Nunca guardado (las tablas existen recién ahora, en una base nueva). La caché de catálogos se armó al arrancar
    // sin el ajuste, así que la portada provisoria sale ya con el valor por defecto.
    await db.query("DELETE FROM ajustes WHERE clave = 'prelanzamiento'");
    invalidarCatalogos(); invalidarSitio();
    await db.query("DELETE FROM cuentas WHERE email LIKE 'zzpre-%'");
    await db.query("DELETE FROM clientes WHERE email LIKE 'zzpre-%'");
    // Una acompañante publicada y verificada (en modo normal se vería en el sitio)
    const { rows } = await db.query('INSERT INTO cuentas (email, pass_hash) VALUES ($1, $2) RETURNING id', [`zzpre-${crypto.randomBytes(3).toString('hex')}@example.com`, 'x']);
    const id = rows[0].id; slug = `zzpre-${id.slice(0, 6)}`;
    await db.query("INSERT INTO perfiles (cuenta_id, slug, datos, estado, verificacion, publicado_en) VALUES ($1, $2, $3, 'publicado', 'verificada', now())",
      [id, slug, JSON.stringify({ displayName: 'Pre Uno', genero: 'mujer', fechaNacimiento: '1995-01-01', pais: 'argentina', provincia: 'provincia-de-buenos-aires', ciudad: 'san-isidro' })]);
    await db.query('INSERT INTO fotos (cuenta_id, orden, clave, url, url_mini, ancho, alto) VALUES ($1, 0, $2, $3, $3, 800, 1000)', [id, `zzpre/${id}.jpg`, 'https://cdn.example/zzpre.jpg']);
    await db.query("INSERT INTO historias (cuenta_id, url, estado, expira) VALUES ($1, 'https://cdn.example/zzpre-h.jpg', 'listo', now() + interval '10 hours')", [id]).catch(() => {});
    // Un interesado que ya tenía cuenta
    clienteEmail = `zzpre-cli-${crypto.randomBytes(3).toString('hex')}@example.com`;
    await db.query("INSERT INTO clientes (usuario, usuario_norm, email, pass_hash, acepto_terminos, mayor_edad_declarada, email_verificado) VALUES ($1, $2, $3, $4, now(), true, now())",
      ['zzpre' + crypto.randomBytes(2).toString('hex'), 'zzpre-' + crypto.randomBytes(3).toString('hex'), clienteEmail, await hashPassword('una-clave-larga-123')]);
  });
  after(async () => {
    await instance?.close();
    delete process.env.SITIO_SPA_PATH;
    await db.query("DELETE FROM ajustes WHERE clave = 'prelanzamiento'");
    await db.query("DELETE FROM cuentas WHERE email LIKE 'zzpre-%'");
    await db.query("DELETE FROM clientes WHERE email LIKE 'zzpre-%'");
    await db.end();
    await fs.rm(tmpData, { recursive: true, force: true });
    await fs.rm(tmpSpa, { recursive: true, force: true });
  });

  test('sin ajuste guardado está prendida: el estado no trae perfiles, historias ni lugares', async () => {
    const e = await estado();
    assert.equal(e.ajustes.prelanzamiento, true);
    assert.deepEqual(e.perfiles, []);
    assert.deepEqual(e.historias, []);
    assert.deepEqual(e.ubicaciones, []);
    assert.ok(e.ajustes.precios, 'los precios siguen (registro de acompañantes)');
    assert.equal((await get('/api/sitio/perfil/' + slug)).status, 404);
    const c = await get('/api/sitio/contenido/perfil/' + slug);
    assert.equal(c.status, 404);
    assert.equal((await c.json()).error, 'Perfil no encontrado.');
  });

  test('la portada: 200, indexable, con título y descripción propios en cada idioma', async () => {
    for (const [p, l, lang] of [['/', 'es', 'es-AR'], ['/en/', 'en', 'en'], ['/pt/', 'pt', 'pt-BR']]) {
      const r = await get(p);
      assert.equal(r.status, 200, p);
      const html = await r.text();
      assert.ok(html.includes(`<title>${SEO_PRELANZAMIENTO[l].title}</title>`), p);
      assert.ok(html.includes(`<meta name="description" content="${SEO_PRELANZAMIENTO[l].description.replace(/'/g, '&#39;')}">`) || html.includes(SEO_PRELANZAMIENTO[l].description), p);
      assert.match(html, /<meta name="robots" content="index,follow">/, p);
      assert.match(html, /<html[^>]*\bdata-prelanzamiento\b/, p + ': marca para no mostrar la ventana de +18');
      assert.match(html, new RegExp(`<html[^>]*lang="${lang}"`), p);
      assert.match(html, /hreflang="pt" href="https:\/\/sexyrose\.test\/pt\/"/, p);
      assert.doesNotMatch(html, /Inicio normal/, p);
    }
  });

  test('lugares, perfiles, Cerca, Swipe, Shorts, Stars, favoritos, links y registro de interesados: 302 a la portada', async () => {
    const casos = [
      ['/argentina', '/'], ['/argentina/san-isidro', '/'], ['/argentina/hombres', '/'], ['/argentina/capital-federal/hombres', '/'],
      ['/perfil/' + slug, '/'], ['/perfil/no-existe', '/'], ['/cerca', '/'], ['/swipe', '/'], ['/shorts', '/'], ['/stars', '/'],
      ['/favoritos', '/'], ['/links/' + slug, '/'], ['/cliente/registro', '/'],
      ['/en/argentina', '/en/'], ['/en/profile/' + slug, '/en/'], ['/en/near-me', '/en/'], ['/en/favorites', '/en/'], ['/en/cliente/registro', '/en/'],
      ['/pt/argentina/san-isidro', '/pt/'], ['/pt/perto-de-mim', '/pt/'], ['/pt/swipe', '/pt/'],
    ];
    for (const [p, destino] of casos) {
      const r = await get(p);
      assert.equal(r.status, 302, p);
      assert.equal(r.headers.get('location'), destino, p);
      assert.equal(r.headers.get('cache-control'), 'no-store', p);
    }
  });

  test('siguen abiertos: acompañantes, panel, cuenta, compra, ingreso de interesados y páginas legales', async () => {
    for (const p of ['/registro', '/ingresar', '/panel', '/panel/fotos', '/cuenta/verificar', '/cuenta/restablecer', '/compra/abc',
      '/cliente/ingresar', '/cliente/verificar', '/cliente/restablecer', '/cliente/compras', '/en/sign-up', '/en/login', '/pt/cadastro', '/pt/entrar',
      '/terminos', '/privacidad', '/contenido', '/denunciar', '/trata', '/robots.txt']) {
      const r = await get(p);
      assert.equal(r.status, 200, p);
    }
    const reg = await (await get('/registro')).text();
    assert.match(reg, /noindex,nofollow/);
    // Dirección desconocida: la 404 de siempre (no la portada)
    assert.equal((await get('/no-existe-esta-pagina')).status, 404);
    // La demo no se toca (si está generada responde; nunca redirige a la portada)
    assert.notEqual((await get('/demo/')).status, 302);
  });

  test('sitemap: solo la portada (es/en/pt) y las páginas legales', async () => {
    const xml = await (await get('/sitemap.xml')).text();
    for (const u of ['https://sexyrose.test/', 'https://sexyrose.test/en/', 'https://sexyrose.test/pt/', 'https://sexyrose.test/terminos', 'https://sexyrose.test/privacidad']) {
      assert.ok(xml.includes(`<loc>${u}</loc>`), u);
    }
    assert.doesNotMatch(xml, /perfil|profile|argentina|cerca|swipe|stars/);
    assert.equal((xml.match(/<loc>/g) || []).length, 3 + 5);
  });

  test('registro de interesados cerrado (mensaje neutro); quien ya tenía cuenta ingresa; las acompañantes se registran', async () => {
    const r = await post('/cliente/registro', { usuario: 'zzpre_nuevo', email: 'zzpre-nuevo@example.com', password: 'una-clave-larga-123', mayorEdad: true, aceptaTerminos: true });
    assert.equal(r.status, 403);
    const b = await r.json();
    assert.equal(b.error, REGISTRO_CLIENTE_CERRADO);
    assert.doesNotMatch(b.error, /lanzamiento|prelanzamiento|admin/i);
    assert.equal((await db.query("SELECT 1 FROM clientes WHERE email = 'zzpre-nuevo@example.com'")).rowCount, 0);
    const l = await post('/cliente/login', { email: clienteEmail, password: 'una-clave-larga-123' });
    assert.equal(l.status, 200);
    const c = await post('/cuenta/registro', {
      email: `zzpre-acomp-${crypto.randomBytes(3).toString('hex')}@example.com`, password: 'una-clave-larga-123', displayName: 'Zz Pre Nueva',
      fechaNacimiento: '1995-04-10', genero: 'mujer', tipo: 'acompanante', aceptaTerminos: true, mayorEdad: true,
    });
    assert.equal(c.status, 201, await c.text());
  });

  test('Admin → Ajustes: lee el modo y los perfiles publicados; valida; exige la cabecera del panel', async () => {
    const r = await admin('GET', '/ajustes');
    assert.equal(r.status, 200);
    const a = await r.json();
    assert.equal(a.prelanzamiento.activo, true);
    assert.ok(a.prelanzamiento.publicados >= 1);
    const una = await (await admin('GET', '/ajustes/prelanzamiento')).json();
    assert.equal(una.valor.activo, true);
    for (const valor of ['no', true, { activo: 'false' }, {}]) {
      const x = await admin('PUT', '/ajustes/prelanzamiento', { valor });
      assert.equal(x.status, 400, JSON.stringify(valor));
    }
    assert.equal((await admin('PUT', '/ajustes/prelanzamiento', {})).status, 400);
    assert.equal((await admin('PUT', '/ajustes/prelanzamiento', { valor: { activo: false } }, { 'x-sr-admin': '' })).status, 403);
    assert.equal((await admin('PUT', '/ajustes/prelanzamiento', { valor: { activo: false } }, { origin: 'https://otro.example' })).status, 403);
    assert.equal((await fetch(BASE + A + '/api/ajustes/prelanzamiento', { method: 'PUT', body: '{"valor":{"activo":false}}', headers: { 'content-type': 'application/json', 'x-sr-admin': '1', origin: BASE } })).status, 401);
    // Nada de eso la apagó
    assert.equal((await estado()).ajustes.prelanzamiento, true);
  });

  test('apagada desde el admin: todo como siempre al instante; prendida de nuevo: vuelve la portada', async () => {
    const off = await ponerModo(false);
    assert.deepEqual(off.valor, { activo: false, publicados: off.valor.publicados });
    let e = await estado();
    assert.equal(e.ajustes.prelanzamiento, false);
    assert.ok(e.perfiles.some((p) => p.slug === slug), 'el perfil publicado vuelve al estado');
    assert.ok(e.ubicaciones.length > 0);
    assert.equal((await get('/api/sitio/perfil/' + slug)).status, 200);
    assert.notEqual((await get('/api/sitio/contenido/perfil/' + slug)).status, 404);
    const home = await (await get('/')).text();
    assert.match(home, /<title>Inicio normal<\/title>/);
    assert.doesNotMatch(home, /data-prelanzamiento/, 'apagada: la ventana de +18 vuelve');
    for (const p of ['/perfil/' + slug, '/swipe', '/cerca', '/stars', '/favoritos', '/cliente/registro', '/en/profile/' + slug]) {
      assert.equal((await get(p)).status, 200, p);
    }
    const xml = await (await get('/sitemap.xml')).text();
    assert.ok(xml.includes('/perfil/' + slug), 'el sitemap normal lista los perfiles');
    const r = await post('/cliente/registro', { usuario: 'zzpre_' + crypto.randomBytes(2).toString('hex'), email: `zzpre-${crypto.randomBytes(3).toString('hex')}@example.com`, password: 'una-clave-larga-123', mayorEdad: true, aceptaTerminos: true });
    assert.equal(r.status, 201);

    await ponerModo(true);
    e = await estado();
    assert.equal(e.ajustes.prelanzamiento, true);
    assert.deepEqual(e.perfiles, []);
    assert.equal((await get('/swipe')).status, 302);
    assert.match(await (await get('/')).text(), /Escorts y acompañantes en Argentina \| SexyRose/);
  });
});
