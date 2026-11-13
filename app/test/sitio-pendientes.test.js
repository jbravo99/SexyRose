// Pendientes del sitio (11/11/2026): 404 reales, SEO en el servidor (título, canonical, hreflang, robots, og:*),
// sitemap.xml con datos reales, textos del inicio editables (ajuste textos_sitio), videos en la ficha del admin y
// mensajes del servidor en inglés y portugués.
//   DATABASE_URL=postgres://... node --test test/sitio-pendientes.test.js
// Levanta el servidor en este proceso con una cáscara del sitio de prueba. Borra lo que crea (emails zzp-*).
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
import { invalidarCatalogos } from '../lib/catalogos.js';
import { validarTextosSitio, TEXTOS_SITIO_DEFAULT } from '../routes/admin-textos-sitio.js';
import { createSeoSitio, slugify } from '../lib/seo-sitio.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('Falta DATABASE_URL.'); process.exit(1); }

// Plantillas SEO de prueba (mismo formato que app/sitio-spa/seo-datos.json, que genera build-sitio.py)
const DATOS = {
  defaults: {
    siteUrl: 'https://sexyrose.net', minProfiles: 1,
    home: { es: { title: 'Inicio ES', description: 'Desc ES' }, en: { title: 'Home EN', description: 'Desc EN' }, pt: { title: 'Início PT', description: 'Desc PT' } },
    tpl: Object.fromEntries(['es', 'en', 'pt'].map((l) => [l, {
      country: { title: `[${l}] país {pais}`, description: '{cantidad} en {pais}' },
      place: { title: `[${l}] lugar {lugar}`, description: '{cantidad} en {lugar}' },
      placeAct: { title: `[${l}] {Actividad} en {lugar}`, description: '{actividad} en {lugar}: {cantidad}' },
      countryMen: { title: `[${l}] hombres {pais}`, description: '{cantidad}' },
      placeMen: { title: `[${l}] hombres {lugar}`, description: '{cantidad}' },
      profile: { title: `[${l}] {nombre} en {lugar}`, description: '{nombre}, {edad}: {salidas}. {bio}' },
    }])),
  },
  lugares: { 'Ciudad de Buenos Aires': { slug: 'buenos-aires', name: 'Buenos Aires' } },
  dict: { Cena: ['Dinner', 'Jantar'], Café: ['Coffee', 'Café'], 'Provincia de Buenos Aires': ['Buenos Aires Province', 'Província de Buenos Aires'] },
};

describe('textos del inicio: validación (routes/admin-textos-sitio.js)', () => {
  const es = () => JSON.parse(JSON.stringify(TEXTOS_SITIO_DEFAULT.es));
  test('los textos por defecto son válidos y quedan iguales', () => {
    const r = validarTextosSitio({ es: es() });
    assert.equal(r.error, undefined);
    assert.deepEqual(r.valor.es, TEXTOS_SITIO_DEFAULT.es);
    assert.equal(r.valor.es.faq.length, 7);
  });
  test('español obligatorio (título, subtítulo y título de preguntas); la línea de arriba es opcional', () => {
    assert.match(validarTextosSitio({ en: { heroTitulo: 'x' } }).error, /español/);
    assert.match(validarTextosSitio(null).error, /Formato/);
    assert.match(validarTextosSitio([]).error, /Formato/);
    assert.match(validarTextosSitio({ es: { ...es(), heroTitulo: '   ' } }).error, /título en español es obligatorio/i);
    assert.match(validarTextosSitio({ es: { ...es(), heroSubtitulo: '' } }).error, /subtítulo en español es obligatorio/i);
    assert.match(validarTextosSitio({ es: { ...es(), faqTitulo: '' } }).error, /preguntas frecuentes en español es obligatorio/i);
    assert.equal(validarTextosSitio({ es: { ...es(), heroEyebrow: '' } }).error, undefined);
    assert.match(validarTextosSitio({ es: es(), fr: {} }).error, /Idioma desconocido/);
  });
  test('largos máximos, tipos y preguntas incompletas', () => {
    assert.match(validarTextosSitio({ es: { ...es(), heroTitulo: 'x'.repeat(121) } }).error, /hasta 120/);
    assert.match(validarTextosSitio({ es: { ...es(), heroSubtitulo: 'x'.repeat(301) } }).error, /hasta 300/);
    assert.match(validarTextosSitio({ es: { ...es(), heroTitulo: 5 } }).error, /texto/);
    assert.match(validarTextosSitio({ es: { ...es(), faq: 'no' } }).error, /lista/);
    assert.match(validarTextosSitio({ es: { ...es(), faq: [{ pregunta: '¿Algo?', respuesta: '' }] } }).error, /Pregunta 1.*completá/);
    assert.match(validarTextosSitio({ es: { ...es(), faq: [{ pregunta: '¿Algo?' }] } }).error, /Pregunta 1/);
    assert.match(validarTextosSitio({ es: { ...es(), faq: Array.from({ length: 13 }, () => ({ pregunta: '¿Algo?', respuesta: 'Sí.' })) } }).error, /Hasta 12/);
    assert.match(validarTextosSitio({ es: { ...es(), faq: [{ pregunta: '¿' + 'x'.repeat(160) + '?', respuesta: 'Sí.' }] } }).error, /hasta 160/);
  });
  test('normaliza: espacios, saltos de línea solo en respuestas, filas vacías fuera; inglés/portugués vacíos no se guardan', () => {
    const r = validarTextosSitio({
      es: { ...es(), heroTitulo: '  Hola\n  *mundo*  ', faq: [{ pregunta: ' ¿Uno? ', respuesta: 'Línea 1\r\nLínea 2\n\n\n\nOtra' }, { pregunta: '', respuesta: '' }] },
      en: { heroTitulo: '', heroSubtitulo: '  Sub EN ', faq: [] },
      pt: { heroTitulo: '', faq: [{ pregunta: '', respuesta: '' }] },
    });
    assert.equal(r.error, undefined);
    assert.equal(r.valor.es.heroTitulo, 'Hola *mundo*');
    assert.deepEqual(r.valor.es.faq, [{ pregunta: '¿Uno?', respuesta: 'Línea 1\nLínea 2\n\nOtra' }]);
    assert.deepEqual(r.valor.en, { heroSubtitulo: 'Sub EN' });
    assert.equal(r.valor.pt, undefined);
    // Sin preguntas en español: la sección no se muestra (lista vacía guardada)
    assert.deepEqual(validarTextosSitio({ es: { ...es(), faq: [] } }).valor.es.faq, []);
  });
});

describe('SEO en el servidor (lib/seo-sitio.js) con un estado de prueba', () => {
  let dir; let seo;
  const perfil = (slug, ciudad, extra = {}) => ({ slug, displayName: slug[0].toUpperCase() + slug.slice(1), edad: 30, genero: 'mujer', ubicacionIds: { pais: 'argentina', provincia: ciudad.prov, ciudad: ciudad.id }, ciudad: ciudad.nombre, provincia: '', salidas: ['cena'], bio: 'Bio <de> prueba & "comillas"', fotos: [{ url: 'https://cdn.example/f.jpg', urlMini: 'https://cdn.example/f-mini.jpg' }], actualizado: '2026-11-01T10:00:00Z', ...extra });
  const SI = { id: 'san-isidro', nombre: 'San Isidro', prov: 'provincia-de-buenos-aires' };
  const TI = { id: 'tigre', nombre: 'Tigre', prov: 'provincia-de-buenos-aires' };
  const estado = {
    ubicaciones: [
      { id: 'argentina', nombre: 'Argentina', tipo: 'pais', padre: null },
      { id: 'ciudad-de-buenos-aires', nombre: 'Ciudad de Buenos Aires', tipo: 'provincia', padre: 'argentina' },
      { id: 'provincia-de-buenos-aires', nombre: 'Provincia de Buenos Aires', tipo: 'provincia', padre: 'argentina' },
      { id: 'zona-norte-gba', nombre: 'Zona Norte (GBA)', tipo: 'zona', padre: 'provincia-de-buenos-aires' },
      { id: 'san-isidro', nombre: 'San Isidro', tipo: 'ciudad', padre: 'zona-norte-gba' },
      { id: 'tigre', nombre: 'Tigre', tipo: 'ciudad', padre: 'zona-norte-gba' },
      { id: 'cordoba', nombre: 'Córdoba', tipo: 'provincia', padre: 'argentina' },
    ],
    categorias: [{ id: 'cena', nombre: 'Cena' }, { id: 'cafe', nombre: 'Café' }],
    perfiles: [perfil('ana', SI), perfil('bea', SI, { salidas: ['cafe'], actualizado: '2026-11-05T10:00:00Z' }), perfil('caro', TI), perfil('dani', SI, { genero: 'hombre' })],
  };
  before(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-seo-'));
    await fs.writeFile(path.join(dir, 'seo-datos.json'), JSON.stringify(DATOS));
    seo = createSeoSitio({ datosPath: path.join(dir, 'seo-datos.json'), siteUrl: 'https://sexyrose.net', estado: async () => estado });
  });
  after(() => fs.rm(dir, { recursive: true, force: true }));

  test('portada: título por idioma, canonical y hreflang es/en/pt + x-default', async () => {
    const m = await seo.meta('/en/');
    assert.equal(m.status, 200); assert.equal(m.title, 'Home EN'); assert.equal(m.description, 'Desc EN');
    assert.equal(m.canonical, 'https://sexyrose.net/en/');
    assert.deepEqual(m.alternates, { es: 'https://sexyrose.net/', en: 'https://sexyrose.net/en/', pt: 'https://sexyrose.net/pt/', 'x-default': 'https://sexyrose.net/' });
    assert.equal(m.robots, 'index,follow');
  });
  test('lugares: slugs propios (buenos-aires), indexable solo con perfiles suficientes; dirección vieja de actividad → 301 al lugar', async () => {
    const zona = await seo.meta('/argentina/zona-norte-gba');
    assert.equal(zona.status, 200); assert.equal(zona.title, '[es] lugar Zona Norte (GBA)'); assert.equal(zona.description, '3 en Zona Norte (GBA)');
    assert.equal(zona.robots, 'index,follow'); // perfiles en dos ciudades
    // Sin páginas por actividad: la dirección vieja (cualquier tercer tramo que no sea "hombres") va al lugar, mismo idioma
    for (const [u, to] of [['/en/argentina/san-isidro/dinner', '/en/argentina/san-isidro'], ['/argentina/san-isidro/cena', '/argentina/san-isidro'], ['/pt/argentina/tigre/cafe', '/pt/argentina/tigre'], ['/argentina/san-isidro/no-existe', '/argentina/san-isidro']]) {
      const r = await seo.meta(u);
      assert.equal(r.status, 301, u); assert.equal(r.location, to, u);
    }
    const caba = await seo.meta('/argentina/buenos-aires');
    assert.equal(caba.status, 200); assert.equal(caba.robots, 'noindex,follow'); // sin perfiles
    const prov = await seo.meta('/en/argentina/provincia-de-buenos-aires');
    assert.equal(prov.title, '[en] lugar Buenos Aires Province');
    const men = await seo.meta('/argentina/hombres');
    assert.equal(men.title, '[es] hombres Argentina'); assert.equal(men.description, '1');
  });
  test('404: lugar o perfil que no existe, país con demasiados niveles', async () => {
    for (const u of ['/argentina/no-existe', '/perfil/no-existe', '/en/profile/nadie', '/perfil', '/argentina/san-isidro/cena/extra']) {
      const m = await seo.meta(u);
      assert.equal(m.status, 404, u); assert.equal(m.robots, 'noindex,follow', u); assert.equal(m.canonical, null, u);
    }
    assert.equal((await seo.meta('/perfil/nadie')).title, 'Perfil no encontrado | SexyRose');
    assert.equal((await seo.meta('/pt/argentina/nada')).title, 'Página não encontrada | SexyRose');
  });
  test('perfil: plantilla, og:image con la primera foto (mini) y todo escapado en el <head>', async () => {
    const m = await seo.meta('/pt/perfil/ana');
    assert.equal(m.status, 200); assert.equal(m.type, 'profile');
    assert.equal(m.title, '[pt] Ana en San Isidro'); assert.equal(m.image, 'https://cdn.example/f-mini.jpg');
    assert.equal(m.canonical, 'https://sexyrose.net/pt/perfil/ana');
    const html = seo.aplicar('<!doctype html><html lang="es-AR"><head><title>x</title><meta name="description" content="vieja">\n<!--SR:SEO-->\n</head><body></body></html>', m);
    assert.match(html, /<html lang="pt-BR">/);
    assert.match(html, /<title>\[pt\] Ana en San Isidro<\/title>/);
    assert.doesNotMatch(html, /content="vieja"/);
    assert.match(html, /<meta property="og:image" content="https:\/\/cdn\.example\/f-mini\.jpg">/);
    assert.match(html, /<meta property="og:locale" content="pt_BR">/);
    assert.match(html, /<link rel="alternate" hreflang="x-default" href="https:\/\/sexyrose\.net\/perfil\/ana">/);
    assert.match(html, /&lt;de&gt; prueba &amp; &quot;comillas&quot;/);
    assert.doesNotMatch(html, /<de>/);
  });
  test('privadas y de uso: robots sin índice, sin canonical en las privadas', async () => {
    for (const u of ['/panel', '/panel/fotos', '/cuenta/verificar', '/ingresar', '/en/login', '/favoritos', '/en/favorites', '/registro', '/pt/cadastro']) {
      const m = await seo.meta(u); assert.equal(m.status, 200, u); assert.equal(m.robots, 'noindex,nofollow', u);
    }
    for (const u of ['/swipe', '/cerca', '/en/near-me']) assert.equal((await seo.meta(u)).robots, 'noindex,follow', u);
    assert.equal((await seo.meta('/panel')).canonical, null);
  });
  test('sitemap: portada, lugares indexables y perfiles (sin páginas por actividad); cada uno en es/en/pt con alternativas y lastmod', async () => {
    const xml = await seo.sitemap(['  <url><loc>https://sexyrose.net/terminos</loc></url>']);
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((x) => x[1]);
    for (const u of ['https://sexyrose.net/', 'https://sexyrose.net/en/', 'https://sexyrose.net/pt/', 'https://sexyrose.net/argentina',
      'https://sexyrose.net/argentina/zona-norte-gba', 'https://sexyrose.net/argentina/san-isidro',
      'https://sexyrose.net/perfil/ana', 'https://sexyrose.net/en/profile/bea', 'https://sexyrose.net/pt/perfil/caro', 'https://sexyrose.net/terminos',
      'https://sexyrose.net/argentina/hombres']) assert.ok(locs.includes(u), u);
    for (const u of ['https://sexyrose.net/argentina/buenos-aires', 'https://sexyrose.net/argentina/cordoba', 'https://sexyrose.net/argentina/tigre/cafe', 'https://sexyrose.net/argentina/san-isidro/cena', 'https://sexyrose.net/en/argentina/san-isidro/dinner']) assert.ok(!locs.includes(u), u);
    assert.doesNotMatch(xml, /\/(cena|cafe|dinner|jantar)</);
    assert.match(xml, /<url><loc>https:\/\/sexyrose\.net\/perfil\/bea<\/loc><lastmod>2026-11-05<\/lastmod>/);
    assert.match(xml, /<url><loc>https:\/\/sexyrose\.net\/argentina\/san-isidro<\/loc><lastmod>2026-11-05<\/lastmod>/);
    assert.match(xml, /xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml"/);
    assert.match(xml, /<xhtml:link rel="alternate" hreflang="pt" href="https:\/\/sexyrose\.net\/pt\/perfil\/ana"\/>/);
    assert.equal(slugify('Zona Norte (GBA)'), 'zona-norte-gba');
  });
  test('sin seo-datos.json no inventa nada (la cáscara sale como siempre)', async () => {
    const s2 = createSeoSitio({ datosPath: path.join(dir, 'no-existe.json'), estado: async () => estado });
    assert.equal(await s2.meta('/'), null);
    assert.equal(await s2.sitemap(), null);
  });
});

describe('mensajes del servidor en inglés y portugués (mvp/src/prod-sitio-errores.js)', () => {
  test('cada mensaje tiene inglés y portugués, y los fijos existen tal cual en el servidor o en el sitio', async () => {
    const src = await fs.readFile(path.join(HERE, '..', '..', 'mvp', 'src', 'prod-sitio-errores.js'), 'utf8');
    const ctx = { HH: {} }; vm.runInNewContext(src, ctx);
    const D = ctx.HH.I18N; const claves = Object.keys(D);
    assert.ok(claves.length > 150, String(claves.length));
    const fuentes = [];
    for (const f of ['server.js', 'routes/cuenta.js', 'routes/cuenta-planes.js', 'routes/sitio.js', 'lib/auth.js', 'lib/perfiles.js', 'lib/imagenes.js', 'lib/videos.js', 'lib/planes.js', 'lib/creditos.js', 'lib/catalogos.js']) {
      try { fuentes.push(await fs.readFile(path.join(HERE, '..', f), 'utf8')); } catch { /* archivo opcional */ }
    }
    fuentes.push(await fs.readFile(path.join(HERE, '..', '..', 'mvp', 'src', 'prod-sitio.js'), 'utf8'));
    const todo = fuentes.join('\n');
    const faltan = [];
    for (const k of claves) {
      const [en, pt] = D[k];
      assert.ok(typeof en === 'string' && en.trim() && typeof pt === 'string' && pt.trim(), k);
      assert.equal((k.match(/\{[nx]\}/g) || []).length, (en.match(/\{[nx]\}/g) || []).length, 'marcadores en inglés: ' + k);
      assert.equal((k.match(/\{[nx]\}/g) || []).length, (pt.match(/\{[nx]\}/g) || []).length, 'marcadores en portugués: ' + k);
      if (!/\{[nx]\}/.test(k) && !todo.includes(k)) faltan.push(k);
    }
    // Los fijos tienen que existir en el código (si alguien cambia la redacción, la traducción deja de aplicarse)
    assert.deepEqual(faltan, [], 'mensajes que ya no están en el código');
  });
});

describe('servidor: 404, SEO, sitemap, textos del inicio y videos del admin', () => {
  const db = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
  let instance; let BASE; let tmpData; let tmpPublic; let tmpSpa; const ADMIN = '/panel-zzp-1234567890';
  const auth = { authorization: 'Basic ' + Buffer.from('zzpadmin:clave-larga-zzp-123').toString('base64') };
  const cuentas = [];
  before(async () => {
    tmpData = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-data-'));
    tmpPublic = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-pub-'));
    tmpSpa = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-spa-'));
    await fs.writeFile(path.join(tmpPublic, 'index.html'), '<!doctype html><title>x</title>');
    await fs.writeFile(path.join(tmpPublic, 'terminos.html'), '<!doctype html><title>t</title>');
    await fs.writeFile(path.join(tmpSpa, 'index.html'), '<!doctype html><html lang="es-AR" data-prod="sitio" data-routing="path"><head><meta charset="utf-8"><title>SexyRose — Acompañantes</title><meta name="description" content="vieja">\n<!--SR:SEO-->\n<!--SR:PRECONNECT-->\n<link rel="stylesheet" href="/assets/app.0123456789ab.css">\n</head><body><main id="app"></main>' + 'x'.repeat(1500) + '<script src="/assets/app.0123456789ab.js" defer></script></body></html>');
    await fs.writeFile(path.join(tmpSpa, 'seo-datos.json'), JSON.stringify(DATOS));
    instance = await start({
      port: 0, host: '127.0.0.1', databaseUrl: DATABASE_URL, publicDir: tmpPublic, dataDir: tmpData, storage: 'local', sitioSpaPath: path.join(tmpSpa, 'index.html'),
      adminUser: 'zzpadmin', adminPassword: 'clave-larga-zzp-123', adminPath: ADMIN, ipHashSalt: 'sal', siteUrl: 'https://sexyrose.net',
      telegramToken: '', telegramChatId: '', mailgunApiKey: '', tareaPlanes: false, log: () => {},
    });
    BASE = `http://127.0.0.1:${instance.port}`;
    await instance.ready;
    // Dos perfiles publicados en San Isidro (uno con un video y su clip) y uno en borrador
    for (const [i, estado] of [[0, 'publicado'], [1, 'publicado'], [2, 'borrador']]) {
      const email = `zzp-${crypto.randomBytes(4).toString('hex')}@example.com`;
      const { rows } = await db.query('INSERT INTO cuentas (email, pass_hash) VALUES ($1, $2) RETURNING id', [email, 'x']);
      const id = rows[0].id; cuentas.push(id);
      await db.query("INSERT INTO perfiles (cuenta_id, slug, datos, estado, verificacion, publicado_en) VALUES ($1, $2, $3, $4, 'verificada', now())",
        [id, `zzp-${i}-${id.slice(0, 6)}`, JSON.stringify({ displayName: 'Zzp ' + i, genero: 'mujer', fechaNacimiento: '1995-01-01', pais: 'argentina', provincia: 'provincia-de-buenos-aires', ciudad: 'san-isidro', salidas: ['cena'], bio: 'Hola' }), estado]);
      await db.query('INSERT INTO fotos (cuenta_id, orden, clave, url, url_mini, ancho, alto) VALUES ($1, 0, $2, $3, $4, 800, 1000)', [id, `zzp/${id}.jpg`, `https://cdn.example/zzp${i}.jpg`, `https://cdn.example/zzp${i}-mini.jpg`]);
    }
    const v = await db.query("INSERT INTO videos (cuenta_id, orden, estado, url, url_poster, segundos, ancho, alto, bytes) VALUES ($1, 0, 'listo', 'https://cdn.example/v.mp4', 'https://cdn.example/v.jpg', 12.4, 720, 1280, 3145728) RETURNING id", [cuentas[0]]);
    await db.query("INSERT INTO videos (cuenta_id, orden, estado, error) VALUES ($1, 1, 'error', 'No pudimos procesar el video. Borralo y probá de nuevo.')", [cuentas[0]]);
    await db.query("INSERT INTO previews (cuenta_id, video_id, inicio, elegido, estado, url) VALUES ($1, $2, 3.5, true, 'listo', 'https://cdn.example/p.mp4')", [cuentas[0], v.rows[0].id]);
    await db.query("DELETE FROM ajustes WHERE clave = 'textos_sitio'");
    invalidarCatalogos(); invalidarSitio();
  });
  after(async () => {
    await db.query("DELETE FROM ajustes WHERE clave = 'textos_sitio'");
    await db.query("DELETE FROM cuentas WHERE email LIKE 'zzp-%@example.com'");
    await db.end();
    if (instance) await instance.close();
    for (const d of [tmpData, tmpPublic, tmpSpa]) await fs.rm(d, { recursive: true, force: true });
  });
  const slug = (i) => `zzp-${i}-${cuentas[i].slice(0, 6)}`;
  const etiqueta = (html, re) => { const m = html.match(re); return m ? m[1] : null; };

  test('perfil publicado: 200 con título, canonical, hreflang y og:image; inexistente o sin publicar: 404', async () => {
    const r = await fetch(BASE + '/en/profile/' + slug(0));
    assert.equal(r.status, 200);
    const html = await r.text();
    assert.equal(etiqueta(html, /<title>([^<]*)<\/title>/), '[en] Zzp 0 en San Isidro');
    assert.match(html, /<html lang="en"/);
    assert.match(html, new RegExp(`<link rel="canonical" href="https://sexyrose\\.net/en/profile/${slug(0)}">`));
    assert.match(html, new RegExp(`<link rel="alternate" hreflang="pt" href="https://sexyrose\\.net/pt/perfil/${slug(0)}">`));
    assert.match(html, /<meta property="og:image" content="https:\/\/cdn\.example\/zzp0-mini\.jpg">/);
    assert.match(html, /<meta name="robots" content="index,follow">/);
    assert.equal(r.headers.get('x-robots-tag'), null);
    for (const u of ['/perfil/no-existe-zzp', '/perfil/' + slug(2), '/argentina/no-existe-zzp', '/en/argentina/nada-zzp']) {
      const n = await fetch(BASE + u);
      assert.equal(n.status, 404, u);
      assert.equal(n.headers.get('x-robots-tag'), 'noindex', u);
      const h = await n.text();
      assert.match(h, /<main id="app">/, u); // misma cáscara: el SPA muestra su página de no encontrado
      assert.match(h, /<meta name="robots" content="noindex,follow">/, u);
    }
    // país desconocido: sigue de largo a la 404 del servidor
    assert.equal((await fetch(BASE + '/narnia-zzp')).status, 404);
  });
  test('portada, lugar y privadas: etiquetas y robots; /favoritos y /panel siguen sin índice', async () => {
    const h = await (await fetch(BASE + '/pt/')).text();
    assert.equal(etiqueta(h, /<title>([^<]*)<\/title>/), 'Início PT');
    assert.match(h, /<meta name="description" content="Desc PT">/);
    assert.doesNotMatch(h, /content="vieja"/);
    // Dirección vieja de lugar + actividad: 301 a la página del lugar (con la consulta), sin páginas por actividad
    for (const [u, to] of [['/argentina/san-isidro/cena?x=1', '/argentina/san-isidro?x=1'], ['/en/argentina/san-isidro/dinner', '/en/argentina/san-isidro'], ['/argentina/san-isidro/no-existe', '/argentina/san-isidro']]) {
      const l = await fetch(BASE + u, { redirect: 'manual' });
      assert.equal(l.status, 301, u); assert.equal(l.headers.get('location'), to, u);
    }
    const l = await fetch(BASE + '/argentina/san-isidro');
    assert.equal(l.status, 200);
    assert.match(await l.text(), /<title>\[es\] lugar San Isidro<\/title>/);
    for (const u of ['/favoritos', '/panel', '/ingresar']) {
      const r = await fetch(BASE + u);
      assert.equal(r.status, 200, u);
      assert.equal(r.headers.get('x-robots-tag'), 'noindex, nofollow', u);
      assert.match(await r.text(), /<meta name="robots" content="noindex,nofollow">/, u);
    }
    const csp = (await fetch(BASE + '/')).headers.get('content-security-policy');
    assert.doesNotMatch(csp, /googleapis|gstatic/);
    assert.match(csp, /font-src 'self' data:/);
  });
  test('sitemap.xml con datos reales y robots.txt apuntando a él', async () => {
    const r = await fetch(BASE + '/sitemap.xml');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /application\/xml/);
    const xml = await r.text();
    assert.ok(xml.includes(`<loc>https://sexyrose.net/perfil/${slug(0)}</loc>`));
    assert.ok(xml.includes(`<loc>https://sexyrose.net/en/profile/${slug(1)}</loc>`));
    assert.ok(xml.includes(`<loc>https://sexyrose.net/pt/perfil/${slug(1)}</loc>`));
    assert.ok(!xml.includes(slug(2)));
    assert.ok(xml.includes('<loc>https://sexyrose.net/argentina/san-isidro</loc>'));
    assert.ok(xml.includes('<loc>https://sexyrose.net/terminos</loc>'));
    assert.match(xml, /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
    assert.match(await (await fetch(BASE + '/robots.txt')).text(), /Sitemap: https:\/\/sexyrose\.net\/sitemap\.xml/);
  });
  test('textos del inicio: admin guarda (valida), el sitio los recibe en el estado, y se restauran', async () => {
    const api = (m, p, body) => fetch(BASE + ADMIN + '/api' + p, { method: m, headers: { ...auth, ...(m === 'GET' ? {} : { 'content-type': 'application/json', 'x-sr-admin': '1', origin: BASE }) }, body: body ? JSON.stringify(body) : (m === 'GET' ? undefined : '{}') });
    let r = await api('GET', '/textos-sitio');
    assert.equal(r.status, 200);
    let j = await r.json();
    assert.equal(j.valor, null);
    assert.deepEqual(j.defaults.es, TEXTOS_SITIO_DEFAULT.es);
    assert.equal((await fetch(BASE + ADMIN + '/api/textos-sitio')).status, 401); // sin usuario del admin
    r = await api('PUT', '/textos-sitio', { valor: { es: { heroTitulo: '' } } });
    assert.equal(r.status, 400);
    assert.match((await r.json()).error, /obligatorio/);
    const valor = { es: { ...TEXTOS_SITIO_DEFAULT.es, heroTitulo: 'Salidas con *buena* compañía.', faq: [{ pregunta: '¿Nueva?', respuesta: 'Sí.' }] }, en: { heroSubtitulo: 'English subtitle' } };
    r = await api('PUT', '/textos-sitio', { valor });
    assert.equal(r.status, 200);
    j = await r.json();
    assert.equal(j.valor.es.heroTitulo, 'Salidas con *buena* compañía.');
    const e = await (await fetch(BASE + '/api/sitio/estado')).json();
    assert.deepEqual(e.ajustes.textos_sitio, j.valor);
    r = await api('DELETE', '/textos-sitio');
    assert.equal(r.status, 200);
    assert.equal((await r.json()).valor, null);
    assert.equal((await (await fetch(BASE + '/api/sitio/estado')).json()).ajustes.textos_sitio, null);
  });
  test('ficha del admin: videos (portada, duración, estado) y clip de 5 s, solo lectura', async () => {
    const r = await fetch(BASE + ADMIN + `/api/acompanantes/${cuentas[0]}/videos`, { headers: auth });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    const j = await r.json();
    assert.equal(j.videos.length, 2);
    assert.deepEqual({ estado: j.videos[0].estado, segundos: j.videos[0].segundos, urlPoster: j.videos[0].urlPoster, bytes: j.videos[0].bytes }, { estado: 'listo', segundos: 12.4, urlPoster: 'https://cdn.example/v.jpg', bytes: 3145728 });
    assert.equal(j.videos[1].estado, 'error');
    assert.deepEqual({ estado: j.preview.estado, inicio: j.preview.inicio, elegido: j.preview.elegido, url: j.preview.url }, { estado: 'listo', inicio: 3.5, elegido: true, url: 'https://cdn.example/p.mp4' });
    const vacio = await (await fetch(BASE + ADMIN + `/api/acompanantes/${cuentas[1]}/videos`, { headers: auth })).json();
    assert.deepEqual(vacio, { videos: [], preview: null });
    assert.equal((await fetch(BASE + ADMIN + '/api/acompanantes/no-es-uuid/videos', { headers: auth })).status, 404);
    assert.equal((await fetch(BASE + ADMIN + `/api/acompanantes/${cuentas[0]}/videos`)).status, 401);
  });
});
