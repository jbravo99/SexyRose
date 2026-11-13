// Admin → SEO (12/11/2026): validación (lib/seo-ajustes.js), plantillas editadas sobre las de seo-datos.json en el
// servidor (lib/seo-sitio.js: título, descripción, robots y sitemap por tipo de página e idioma) y la API del admin
// (GET/PUT/DELETE /seo) con el sitio real: estado, <head> de cada página y /sitemap.xml.
//   DATABASE_URL=postgres://... node --test test/admin-seo.test.js
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import pg from 'pg';
import { start } from '../server.js';
import { invalidarSitio } from '../routes/sitio.js';
import { invalidarCatalogos } from '../lib/catalogos.js';
import { validarSeo, seoTexto, seoMinProfiles } from '../lib/seo-ajustes.js';
import { createSeoSitio } from '../lib/seo-sitio.js';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('Falta DATABASE_URL.'); process.exit(1); }

const DATOS = {
  defaults: {
    siteUrl: 'https://sexyrose.net', minProfiles: 1,
    home: Object.fromEntries(['es', 'en', 'pt'].map((l) => [l, { title: `Inicio ${l}`, description: `Desc ${l}`, blockTitle: `Bloque ${l}`, blockText: `Texto ${l}` }])),
    tpl: Object.fromEntries(['es', 'en', 'pt'].map((l) => [l, {
      country: { title: `[${l}] país {pais}`, description: '{cantidad} en {pais}', intro: 'Intro {pais}' },
      place: { title: `[${l}] lugar {lugar}`, description: '{cantidad} en {lugar}', intro: 'Intro {lugar}' },
      countryMen: { title: `[${l}] hombres {pais}`, description: '{cantidad}', intro: 'Intro h {pais}' },
      placeMen: { title: `[${l}] hombres {lugar}`, description: '{cantidad}', intro: 'Intro h {lugar}' },
      profile: { title: `[${l}] {nombre} en {lugar}`, description: '{nombre}, {edad}. {bio}' },
    }])),
  },
  lugares: {},
  dict: { 'Provincia de Buenos Aires': ['Buenos Aires Province', 'Província de Buenos Aires'] },
};

// Plantillas por defecto reales (mvp/src/seo.js → seo-datos.json): las mismas que lee build-sitio.py
async function defaultsReales() {
  const src = await fs.readFile(new URL('../../mvp/src/seo.js', import.meta.url), 'utf8');
  const i = src.indexOf('HH.SEO_DEFAULTS = ') + 'HH.SEO_DEFAULTS = '.length;
  let n = 0; let j = i; let str = null;
  for (; j < src.length; j++) {
    const c = src[j];
    if (str) { if (c === '\\') j++; else if (c === str) str = null; continue; }
    if (c === '"' || c === "'") str = c; else if (c === '{') n++; else if (c === '}' && --n === 0) break;
  }
  return vm.runInNewContext('(' + src.slice(i, j + 1) + ')');
}

describe('SEO: plantillas por defecto (13/11/2026: escorts y acompañantes)', () => {
  test('cada texto por defecto pasa la validación del admin (variables y largos) y nombra las palabras clave', async () => {
    const D = await defaultsReales();
    const sinH1 = JSON.parse(JSON.stringify({ home: D.home, tpl: D.tpl }), (k, v) => (k === 'h1' ? undefined : v));
    const r = validarSeo(sinH1);
    assert.equal(r.error, undefined, r.error);
    assert.equal(D.home.es.title, 'Escorts y acompañantes en Argentina | SexyRose');
    assert.equal(D.tpl.es.place.title, 'Escorts y acompañantes en {lugar} | SexyRose');
    assert.equal(D.tpl.es.place.h1, 'Escorts y acompañantes en {lugar}');
    assert.equal(D.tpl.es.placeMen.h1, 'Escorts hombres y acompañantes en {lugar}');
    assert.equal(D.tpl.es.profile.title, '{nombre}, escort en {lugar} | SexyRose');
    assert.equal(D.tpl.en.place.title, 'Escorts and companions in {lugar} | SexyRose');
    assert.equal(D.tpl.pt.place.title, 'Acompanhantes e escorts em {lugar} | SexyRose');
    for (const l of ['es', 'en', 'pt']) {
      for (const t of ['country', 'place', 'countryMen', 'placeMen']) {
        const x = D.tpl[l][t];
        for (const f of ['title', 'description', 'h1', 'intro']) assert.match(x[f], /escort/i, `${l}.${t}.${f}`);
        // Con un lugar largo y un número de 3 cifras: título hasta 60 y descripción hasta 155 (lo que muestra Google)
        const v = (s) => s.replace(/\{(lugar|pais)\}/g, 'Capital Federal').replace('{cantidad}', '128');
        assert.ok(v(x.title).length <= 60, `${l}.${t}.title ${v(x.title).length}`);
        assert.ok(v(x.description).length <= 155, `${l}.${t}.description ${v(x.description).length}`);
      }
      assert.ok(D.home[l].title.length <= 60 && D.home[l].description.length <= 155, l);
    }
    // Criterio legal: sin garantías, sin "verificados", sin precios ni actividades
    const todo = JSON.stringify(D);
    assert.doesNotMatch(todo, /verificad|garant|guarant|sexo|sexual|\$|precio|cena|caf[eé]|salida/i);
  });
});

describe('SEO editable: validación', () => {
  test('acepta campos conocidos por idioma y tipo, saca los vacíos y normaliza espacios', () => {
    const r = validarSeo({ minProfiles: 3, home: { es: { title: '  Hola   mundo ', description: '' }, en: { blockText: 'Uno\r\n\r\n\r\nDos' } }, tpl: { pt: { place: { title: 'Lugar {lugar} ({cantidad})', intro: '' } } } });
    assert.deepEqual(r, { valor: { minProfiles: 3, home: { es: { title: 'Hola mundo' }, en: { blockText: 'Uno\n\nDos' } }, tpl: { pt: { place: { title: 'Lugar {lugar} ({cantidad})' } } } } });
    assert.deepEqual(validarSeo({}), { valor: {} });
  });
  test('variables: solo las de cada plantilla; nada de variables en la portada; llaves sueltas', () => {
    assert.match(validarSeo({ tpl: { es: { place: { title: '{actividad} en {lugar}' } } } }).error, /\{actividad\} no es una variable.*\{pais\}, \{lugar\}, \{ciudad\}, \{cantidad\}/);
    assert.match(validarSeo({ tpl: { es: { country: { description: 'Hola {nombre}' } } } }).error, /\{nombre\} no es una variable/);
    assert.ok(validarSeo({ tpl: { es: { profile: { description: '{nombre}, {edad} en {lugar}, {pais}. {bio}' } } } }).valor);
    assert.match(validarSeo({ tpl: { es: { profile: { title: '{cantidad}' } } } }).error, /\{cantidad\} no es una variable/);
    assert.match(validarSeo({ home: { es: { title: 'Hola {pais}' } } }).error, /no se pueden usar variables/);
    assert.match(validarSeo({ tpl: { es: { place: { title: 'Hola {lugar' } } } }).error, /llave/);
  });
  test('largos máximos, idiomas, tipos, campos y mínimo de perfiles', () => {
    assert.match(validarSeo({ home: { es: { title: 'x'.repeat(91) } } }).error, /hasta 90 caracteres/);
    assert.ok(validarSeo({ home: { es: { title: 'x'.repeat(90) } } }).valor);
    assert.match(validarSeo({ tpl: { es: { place: { description: 'x'.repeat(301) } } } }).error, /hasta 300/);
    assert.match(validarSeo({ home: { fr: { title: 'x' } } }).error, /Idioma desconocido/);
    assert.match(validarSeo({ tpl: { es: { placeAct: { title: 'x' } } } }).error, /tipo de página desconocido/);
    assert.match(validarSeo({ tpl: { es: { profile: { intro: 'x' } } } }).error, /campo desconocido intro/);
    assert.match(validarSeo({ home: { es: { h1: 'x' } } }).error, /campo desconocido h1/);
    assert.match(validarSeo({ minProfiles: 0 }).error, /entre 1 y 20/);
    assert.match(validarSeo({ minProfiles: 2.5 }).error, /entre 1 y 20/);
    assert.match(validarSeo({ otra: 1 }).error, /Campo desconocido/);
    assert.match(validarSeo({ home: { es: { title: 5 } } }).error, /tiene que ser texto/);
  });
  test('lectura: lo guardado gana, vacío usa el por defecto', () => {
    const g = { minProfiles: 4, home: { es: { title: 'Mío' } }, tpl: { en: { place: { description: 'Mine {lugar}' } } } };
    assert.equal(seoTexto(DATOS.defaults, g, 'home.title', 'es'), 'Mío');
    assert.equal(seoTexto(DATOS.defaults, g, 'home.title', 'en'), 'Inicio en');
    assert.equal(seoTexto(DATOS.defaults, g, 'tpl.place.description', 'en'), 'Mine {lugar}');
    assert.equal(seoTexto(DATOS.defaults, g, 'tpl.place.title', 'en'), '[en] lugar {lugar}');
    assert.equal(seoTexto(DATOS.defaults, null, 'tpl.place.title', 'pt'), '[pt] lugar {lugar}');
    assert.equal(seoMinProfiles(DATOS.defaults, g), 4);
    assert.equal(seoMinProfiles(DATOS.defaults, null), 1);
  });
});

describe('SEO editable en el servidor (lib/seo-sitio.js)', () => {
  let dir; let seo;
  const perfil = (slug, ciudad, extra = {}) => ({ slug, displayName: slug[0].toUpperCase() + slug.slice(1), edad: 30, genero: 'mujer', ubicacionIds: { pais: 'argentina', provincia: 'provincia-de-buenos-aires', ciudad }, ciudad, bio: 'Bio', fotos: [], actualizado: '2026-11-01T10:00:00Z', ...extra });
  const estado = {
    ajustes: {},
    ubicaciones: [
      { id: 'argentina', nombre: 'Argentina', tipo: 'pais', padre: null },
      { id: 'provincia-de-buenos-aires', nombre: 'Provincia de Buenos Aires', tipo: 'provincia', padre: 'argentina' },
      { id: 'san-isidro', nombre: 'San Isidro', tipo: 'ciudad', padre: 'provincia-de-buenos-aires' },
      { id: 'tigre', nombre: 'Tigre', tipo: 'ciudad', padre: 'provincia-de-buenos-aires' },
    ],
    perfiles: [perfil('ana', 'san-isidro'), perfil('bea', 'san-isidro'), perfil('caro', 'tigre'), perfil('dani', 'san-isidro', { genero: 'hombre' })],
  };
  // Cada cambio del ajuste llega con un estado nuevo (como el de /api/sitio/estado después de guardar)
  const conSeo = (s) => ({ ...estado, ajustes: { seo: s } });
  let actual = estado;
  before(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-seoadm-'));
    await fs.writeFile(path.join(dir, 'seo-datos.json'), JSON.stringify(DATOS));
    seo = createSeoSitio({ datosPath: path.join(dir, 'seo-datos.json'), siteUrl: 'https://sexyrose.net', estado: async () => actual });
  });
  after(() => fs.rm(dir, { recursive: true, force: true }));

  test('cada tipo de página e idioma usa lo editado; lo que no se editó sigue por defecto', async () => {
    actual = conSeo({
      home: { es: { title: 'Mi portada', description: 'Mi descripción' }, pt: { title: 'Portada PT' } },
      tpl: {
        es: { country: { title: 'Avisos en {pais} ({cantidad})' }, place: { title: 'Avisos en {lugar}', description: '{cantidad} avisos en {ciudad}, {pais}' }, countryMen: { title: 'Hombres: {pais}' }, placeMen: { description: 'H {lugar}: {cantidad}' }, profile: { title: '{nombre} · {lugar}', description: '{nombre} ({edad}) en {pais}' } },
        en: { place: { title: 'Ads in {lugar}' } },
      },
    });
    let m = await seo.meta('/');
    assert.equal(m.title, 'Mi portada'); assert.equal(m.description, 'Mi descripción');
    m = await seo.meta('/en/'); assert.equal(m.title, 'Inicio en'); assert.equal(m.description, 'Desc en');
    m = await seo.meta('/pt/'); assert.equal(m.title, 'Portada PT'); assert.equal(m.description, 'Desc pt');
    m = await seo.meta('/argentina'); assert.equal(m.title, 'Avisos en Argentina (3)'); assert.equal(m.description, '3 en Argentina');
    m = await seo.meta('/argentina/san-isidro'); assert.equal(m.title, 'Avisos en San Isidro'); assert.equal(m.description, '2 avisos en San Isidro, Argentina');
    m = await seo.meta('/en/argentina/san-isidro'); assert.equal(m.title, 'Ads in San Isidro'); assert.equal(m.description, '2 en San Isidro');
    m = await seo.meta('/pt/argentina/san-isidro'); assert.equal(m.title, '[pt] lugar San Isidro');
    m = await seo.meta('/argentina/hombres'); assert.equal(m.title, 'Hombres: Argentina'); assert.equal(m.description, '1');
    m = await seo.meta('/argentina/san-isidro/hombres'); assert.equal(m.title, '[es] hombres San Isidro'); assert.equal(m.description, 'H San Isidro: 1');
    m = await seo.meta('/perfil/ana'); assert.equal(m.title, 'Ana · San Isidro'); assert.equal(m.description, 'Ana (30) en Argentina');
    m = await seo.meta('/en/profile/ana'); assert.equal(m.title, '[en] Ana en San Isidro');
    // Las direcciones viejas de actividad siguen yendo al lugar
    m = await seo.meta('/argentina/san-isidro/cena'); assert.equal(m.status, 301); assert.equal(m.location, '/argentina/san-isidro');
  });
  test('mínimo de perfiles para indexar: robots y sitemap cambian apenas se guarda', async () => {
    actual = conSeo(null);
    let xml = await seo.sitemap();
    assert.ok(xml.includes('<loc>https://sexyrose.net/argentina/tigre</loc>')); // 1 perfil alcanza con el mínimo por defecto (1)
    assert.equal((await seo.meta('/argentina/tigre')).robots, 'index,follow');
    actual = conSeo({ minProfiles: 2 });
    assert.equal((await seo.meta('/argentina/tigre')).robots, 'noindex,follow');
    assert.equal((await seo.meta('/argentina/san-isidro')).robots, 'index,follow');
    xml = await seo.sitemap(); // la caché del sitemap se descarta al cambiar lo editado
    assert.ok(!xml.includes('<loc>https://sexyrose.net/argentina/tigre</loc>'));
    assert.ok(xml.includes('<loc>https://sexyrose.net/argentina/san-isidro</loc>'));
    assert.ok(!xml.includes('/cena'));
    actual = estado;
  });
});

describe('Admin → SEO con el servidor real', () => {
  const db = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
  let instance; let BASE; let tmpData; let tmpPublic; let tmpSpa; const ADMIN = '/panel-zzs-1234567890';
  const auth = { authorization: 'Basic ' + Buffer.from('zzsadmin:clave-larga-zzs-123').toString('base64') };
  const cuentas = [];
  const api = (m, p, body) => fetch(BASE + ADMIN + '/api' + p, { method: m, headers: { ...auth, ...(m === 'GET' ? {} : { 'content-type': 'application/json', 'x-sr-admin': '1', origin: BASE }) }, body: body ? JSON.stringify(body) : (m === 'GET' ? undefined : '{}') });
  before(async () => {
    tmpData = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-data-'));
    tmpPublic = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-pub-'));
    tmpSpa = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-spa-'));
    await fs.writeFile(path.join(tmpPublic, 'index.html'), '<!doctype html><title>x</title>');
    await fs.writeFile(path.join(tmpSpa, 'index.html'), '<!doctype html><html lang="es-AR" data-prod="sitio" data-routing="path"><head><meta charset="utf-8"><title>SexyRose</title><meta name="description" content="vieja">\n<!--SR:SEO-->\n<!--SR:PRECONNECT-->\n<link rel="stylesheet" href="/assets/app.0123456789ab.css">\n</head><body><main id="app"></main>' + 'x'.repeat(1500) + '<script src="/assets/app.0123456789ab.js" defer></script></body></html>');
    await fs.writeFile(path.join(tmpSpa, 'seo-datos.json'), JSON.stringify(DATOS));
    instance = await start({ prelanzamientoPorDefecto: false,
      port: 0, host: '127.0.0.1', databaseUrl: DATABASE_URL, publicDir: tmpPublic, dataDir: tmpData, storage: 'local', sitioSpaPath: path.join(tmpSpa, 'index.html'),
      adminUser: 'zzsadmin', adminPassword: 'clave-larga-zzs-123', adminPath: ADMIN, ipHashSalt: 'sal', siteUrl: 'https://sexyrose.net',
      telegramToken: '', telegramChatId: '', mailgunApiKey: '', tareaPlanes: false, log: () => {},
    });
    BASE = `http://127.0.0.1:${instance.port}`;
    await instance.ready;
    for (const i of [0, 1]) {
      const email = `zzs-${crypto.randomBytes(4).toString('hex')}@example.com`;
      const { rows } = await db.query('INSERT INTO cuentas (email, pass_hash) VALUES ($1, $2) RETURNING id', [email, 'x']);
      const id = rows[0].id; cuentas.push(id);
      await db.query("INSERT INTO perfiles (cuenta_id, slug, datos, estado, verificacion, publicado_en) VALUES ($1, $2, $3, 'publicado', 'verificada', now())",
        [id, `zzs-${i}-${id.slice(0, 6)}`, JSON.stringify({ displayName: 'Zzs ' + i, genero: 'mujer', fechaNacimiento: '1995-01-01', pais: 'argentina', provincia: 'provincia-de-buenos-aires', ciudad: i ? 'tigre' : 'san-isidro', bio: 'Hola' })]);
      await db.query('INSERT INTO fotos (cuenta_id, orden, clave, url, url_mini, ancho, alto) VALUES ($1, 0, $2, $3, $4, 800, 1000)', [id, `zzs/${id}.jpg`, `https://cdn.example/zzs${i}.jpg`, `https://cdn.example/zzs${i}-mini.jpg`]);
    }
    await db.query("DELETE FROM ajustes WHERE clave = 'seo'");
    invalidarCatalogos(); invalidarSitio();
  });
  after(async () => {
    await db.query("DELETE FROM ajustes WHERE clave = 'seo'");
    await db.query("DELETE FROM cuentas WHERE email LIKE 'zzs-%@example.com'");
    await db.end();
    if (instance) await instance.close();
    for (const d of [tmpData, tmpPublic, tmpSpa]) await fs.rm(d, { recursive: true, force: true });
  });
  const titulo = (h) => { const m = h.match(/<title>([^<]*)<\/title>/); return m ? m[1] : null; };
  const desc = (h) => { const m = h.match(/<meta name="description" content="([^"]*)">/); return m ? m[1] : null; };

  test('sin usuario del admin no entra; GET trae lo guardado (nada), los textos por defecto y las reglas', async () => {
    assert.equal((await fetch(BASE + ADMIN + '/api/seo')).status, 401);
    const r = await api('GET', '/seo');
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.valor, null);
    assert.equal(j.defaults.home.es.title, 'Inicio es');
    assert.equal(j.defaults.tpl.en.place.title, '[en] lugar {lugar}');
    assert.equal(j.defaults.minProfiles, 1);
    assert.equal(j.defaults.siteUrl, 'https://sexyrose.net');
    assert.deepEqual(j.reglas.vars.place, ['pais', 'lugar', 'ciudad', 'cantidad']);
    assert.equal(j.reglas.largo.title.rec, 70);
    assert.equal((await api('PUT', '/seo', { valor: { home: { es: { title: 'x' } } } }).then((x) => x.status)), 200);
    await api('DELETE', '/seo');
  });
  test('guardar: valida, el estado lo trae, cada página y el sitemap lo usan; volver al texto por defecto', async () => {
    let r = await api('PUT', '/seo', { valor: { tpl: { es: { place: { title: '{actividad} en {lugar}' } } } } });
    assert.equal(r.status, 400);
    assert.match((await r.json()).error, /no es una variable/);
    r = await api('PUT', '/seo', {});
    assert.equal(r.status, 400);
    const valor = {
      minProfiles: 2,
      home: { es: { title: 'Avisos de acompañantes | SexyRose', description: 'Descripción nueva' }, en: { title: 'Companion ads' } },
      tpl: { es: { place: { title: 'Acompañantes en {lugar} ({cantidad})', description: 'Avisos en {lugar}, {pais}.' }, profile: { title: '{nombre} en {lugar}' } }, pt: { place: { title: 'Anúncios em {lugar}' } } },
    };
    r = await api('PUT', '/seo', { valor });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.deepEqual(j.valor, valor);
    const e = await (await fetch(BASE + '/api/sitio/estado')).json();
    assert.deepEqual(e.ajustes.seo, valor);
    let h = await (await fetch(BASE + '/')).text();
    assert.equal(titulo(h), 'Avisos de acompañantes | SexyRose'); assert.equal(desc(h), 'Descripción nueva');
    h = await (await fetch(BASE + '/en/')).text();
    assert.equal(titulo(h), 'Companion ads'); assert.equal(desc(h), 'Desc en');
    h = await (await fetch(BASE + '/argentina/san-isidro')).text();
    assert.equal(titulo(h), 'Acompañantes en San Isidro (1)'); assert.equal(desc(h), 'Avisos en San Isidro, Argentina.');
    assert.match(h, /<meta name="robots" content="noindex,follow">/); // 1 perfil < mínimo 2
    h = await (await fetch(BASE + '/pt/argentina/tigre')).text();
    assert.equal(titulo(h), 'Anúncios em Tigre');
    h = await (await fetch(BASE + '/argentina')).text();
    assert.equal(titulo(h), '[es] país Argentina'); // no editado
    assert.match(h, /<meta name="robots" content="index,follow">/); // 2 perfiles en el país
    h = await (await fetch(BASE + `/perfil/zzs-0-${cuentas[0].slice(0, 6)}`)).text();
    assert.equal(titulo(h), 'Zzs 0 en San Isidro');
    const l = await fetch(BASE + '/argentina/san-isidro/cena', { redirect: 'manual' });
    assert.equal(l.status, 301); assert.equal(l.headers.get('location'), '/argentina/san-isidro');
    let xml = await (await fetch(BASE + '/sitemap.xml')).text();
    assert.ok(!xml.includes('<loc>https://sexyrose.net/argentina/san-isidro</loc>'));
    assert.ok(xml.includes('<loc>https://sexyrose.net/argentina</loc>'));
    // Volver todo a los textos por defecto
    r = await api('DELETE', '/seo');
    assert.equal(r.status, 200);
    assert.equal((await r.json()).valor, null);
    h = await (await fetch(BASE + '/argentina/san-isidro')).text();
    assert.equal(titulo(h), '[es] lugar San Isidro');
    assert.match(h, /<meta name="robots" content="index,follow">/);
    xml = await (await fetch(BASE + '/sitemap.xml')).text();
    assert.ok(xml.includes('<loc>https://sexyrose.net/argentina/san-isidro</loc>'));
    assert.equal((await (await fetch(BASE + '/api/sitio/estado')).json()).ajustes.seo, null);
    // Guardar todo vacío también vuelve a los textos por defecto
    await api('PUT', '/seo', { valor: { home: { es: { title: 'Algo' } } } });
    r = await api('PUT', '/seo', { valor: { home: { es: { title: '' } } } });
    assert.equal((await r.json()).valor, null);
  });
});
