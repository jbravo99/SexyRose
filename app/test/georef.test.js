// Ubicaciones oficiales (Georef + barrios de CABA), 13/11/2026.
//   node --test test/georef.test.js                       (sin base: solo las funciones puras)
//   DATABASE_URL=postgres://... node --test test/georef.test.js
// Los archivos de test/fixtures/georef/ son SINTÉTICOS, con la misma forma que los de https://infra.datos.gob.ar/georef/
// (confirmada en el código de datosgobar/georef-ar-etl: { cantidad, total, inicio, parametros, <entidad>: [...] },
// localidades en MAYÚSCULAS, departamentos y provincias con acentos). El GeoJSON de barrios imita el del GCBA (sin
// confirmar: propiedad BARRIO).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { start } from '../server.js';
import { norm, nombreLindo, diccionario, leerEntidades, leerBarrios, planificar, BARRIOS_CABA, GBA } from '../lib/georef.js';
import { buscarUbicaciones, indiceUbicaciones, slugsPublicos, cargarCatalogos, invalidarCatalogos } from '../lib/catalogos.js';
import { ubicacionesUsadas, aclaraciones } from '../routes/sitio.js';
import { createSeoSitio } from '../lib/seo-sitio.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, 'fixtures', 'georef');
const plano = (x) => JSON.parse(JSON.stringify(x));

describe('Georef: funciones puras', () => {
  test('nombres en MAYÚSCULAS de BAHRA → nombre normal con acentos tomados de los nombres oficiales', () => {
    const dic = diccionario(['Oberá', 'San Martín', 'Río Grande', 'General Pueyrredón', 'José C. Paz']);
    assert.equal(nombreLindo('OBERA', dic), 'Oberá');
    assert.equal(nombreLindo('SAN MARTIN DE LOS ANDES', dic), 'San Martín de los Andes');
    assert.equal(nombreLindo('VILLA RIO GRANDE', dic), 'Villa Río Grande');
    assert.equal(nombreLindo('BARRIO PARQUE II', dic), 'Barrio Parque II');
    assert.equal(nombreLindo('EL SOBERBIO', dic), 'El Soberbio');
    assert.equal(nombreLindo('Ya Viene Bien', dic), 'Ya Viene Bien', 'si no viene en mayúsculas se respeta');
    assert.equal(norm('José C. Paz'), 'jose c paz');
  });
  test('lee el JSON de Georef, un arreglo o NDJSON', async () => {
    const txt = await fs.readFile(path.join(FIX, 'localidades.json'), 'utf8');
    const l = leerEntidades(txt, 'localidades');
    assert.ok(l.length > 20 && l[0].centroide && l[0].provincia.id);
    assert.equal(leerEntidades(JSON.stringify(l), 'localidades').length, l.length);
    const nd = [JSON.stringify({ fecha_creacion: 'x', version: '12', cantidad: 2 }), ...l.slice(0, 2).map((x) => JSON.stringify(x))].join('\n');
    assert.equal(leerEntidades(nd, 'localidades').length, 2);
  });
  test('barrios de CABA: siempre los 48 oficiales; del dataset solo se toma el contorno (centro) de los que reconoce', async () => {
    const b = leerBarrios(await fs.readFile(path.join(FIX, 'barrios.geojson'), 'utf8'));
    assert.equal(b.length, 48);
    assert.equal(BARRIOS_CABA.length, 48);
    const pal = b.find((x) => x.nombre === 'Palermo');
    assert.ok(pal.delDataset && Math.abs(pal.lat + 34.5781) < 0.001 && Math.abs(pal.lng + 58.4265) < 0.001);
    assert.ok(b.find((x) => x.nombre === 'Monserrat').delDataset, 'MONTSERRAT del dataset = Monserrat');
    assert.ok(!b.some((x) => /no existe/i.test(x.nombre)));
    assert.equal(leerBarrios(null).length, 48, 'sin dataset: los 48 con su centro aproximado');
  });
  test('tabla del GBA: 24 partidos', () => {
    assert.equal(Object.values(GBA).flat().length, 24);
  });
  test('buscar: sin acentos, primero los que empiezan con lo escrito, solo en la provincia, repetidos con su departamento', () => {
    const rows = [
      { id: 'ar', nombre: 'Argentina', tipo: 'pais', padre: null, activa: true },
      { id: 'mis', nombre: 'Provincia de Misiones', tipo: 'provincia', padre: 'ar', activa: true },
      { id: 'cba', nombre: 'Provincia de Córdoba', tipo: 'provincia', padre: 'ar', activa: true },
      { id: 'obera', nombre: 'Oberá', tipo: 'ciudad', padre: 'mis', activa: true },
      { id: 'colonia-obera', nombre: 'Colonia Oberá', tipo: 'ciudad', padre: 'mis', activa: true },
      { id: 'sj1', nombre: 'San José', tipo: 'ciudad', padre: 'mis', activa: true, departamento: 'Apóstoles' },
      { id: 'sj2', nombre: 'San José', tipo: 'ciudad', padre: 'mis', activa: true, departamento: 'Oberá' },
      { id: 'obera-cba', nombre: 'Oberá', tipo: 'ciudad', padre: 'cba', activa: true },
      { id: 'oculta', nombre: 'Oberávila', tipo: 'ciudad', padre: 'mis', activa: false },
    ];
    const idx = indiceUbicaciones(rows);
    const r = buscarUbicaciones(idx, 'mis', 'OBE');
    assert.deepEqual(plano(r.map((x) => x.id)), ['obera', 'colonia-obera']);
    assert.equal(r[0].camino, 'Oberá, Misiones');
    const sj = buscarUbicaciones(idx, 'mis', 'san jo');
    assert.deepEqual(plano(sj.map((x) => x.detalle).sort()), ['Apóstoles', 'Oberá']);
    assert.equal(buscarUbicaciones(idx, 'mis', '').length, 0);
  });
  test('direcciones: con nombres repetidos, el slug corto se lo queda el que ya lo tenía', () => {
    const s = slugsPublicos([
      { id: 'santa-rosa', nombre: 'Santa Rosa', fuente: 'manual' },
      { id: 'santa-rosa-mendoza', nombre: 'Santa Rosa', fuente: 'georef' },
      { id: 'cordoba', nombre: 'Córdoba', fuente: 'manual' },
      { id: 'provincia-de-cordoba', nombre: 'Provincia de Córdoba', fuente: 'manual' },
    ]);
    assert.equal(s.get('santa-rosa'), 'santa-rosa');
    assert.equal(s.get('santa-rosa-mendoza'), 'santa-rosa-mendoza');
    assert.equal(s.get('cordoba'), 'cordoba');
  });
  test('nombres repetidos en el estado: aclaración con la provincia (o el departamento si también se repite)', () => {
    const rows = [
      { id: 'ar', nombre: 'Argentina', tipo: 'pais', padre: null },
      { id: 'mza', nombre: 'Provincia de Mendoza', tipo: 'provincia', padre: 'ar' },
      { id: 'lpa', nombre: 'Provincia de La Pampa', tipo: 'provincia', padre: 'ar' },
      { id: 'mis', nombre: 'Provincia de Misiones', tipo: 'provincia', padre: 'ar' },
      { id: 'santa-rosa', nombre: 'Santa Rosa', tipo: 'ciudad', padre: 'lpa' },
      { id: 'santa-rosa-mendoza', nombre: 'Santa Rosa', tipo: 'ciudad', padre: 'mza' },
      { id: 'sj1', nombre: 'San José', tipo: 'ciudad', padre: 'mis', departamento: 'Apóstoles' },
      { id: 'sj2', nombre: 'San Jose', tipo: 'ciudad', padre: 'mis', departamento: 'Oberá' },
      { id: 'obera', nombre: 'Oberá', tipo: 'ciudad', padre: 'mis' },
    ];
    const a = aclaraciones(rows, new Map(rows.map((r) => [r.id, r])));
    assert.equal(a.get('santa-rosa'), 'La Pampa'); assert.equal(a.get('santa-rosa-mendoza'), 'Mendoza');
    assert.equal(a.get('sj1'), 'Misiones, Apóstoles'); assert.equal(a.get('sj2'), 'Misiones, Oberá');
    assert.ok(!a.has('obera') && !a.has('mza'));
  });
  test('SEO con dos "Santa Rosa": cada página con su nombre y sus perfiles (por id)', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-geo-seo-'));
    const tpl = { title: 'Avisos en {lugar}', description: '{cantidad} en {lugar}', intro: 'Intro {lugar}' };
    await fs.writeFile(path.join(dir, 'seo-datos.json'), JSON.stringify({ defaults: { siteUrl: 'https://sexyrose.net', minProfiles: 1, home: { es: { title: 'Inicio', description: 'D' } }, tpl: { es: { country: tpl, place: tpl, countryMen: tpl, placeMen: tpl, profile: { title: '{nombre} en {lugar}', description: '{nombre}' } } } }, lugares: {}, dict: {} }));
    const perfil = (slug, prov, ciudad) => ({ slug, displayName: slug, edad: 30, genero: 'mujer', ubicacionIds: { pais: 'ar', provincia: prov, ciudad }, ciudad: 'Santa Rosa', bio: 'Bio', fotos: [], actualizado: '2026-11-01T10:00:00Z' });
    const estado = { ajustes: {}, ubicaciones: [
      { id: 'ar', nombre: 'Argentina', tipo: 'pais', padre: null, slug: 'argentina' },
      { id: 'mza', nombre: 'Provincia de Mendoza', tipo: 'provincia', padre: 'ar', slug: 'provincia-de-mendoza' },
      { id: 'lpa', nombre: 'Provincia de La Pampa', tipo: 'provincia', padre: 'ar', slug: 'provincia-de-la-pampa' },
      { id: 'santa-rosa', nombre: 'Santa Rosa', tipo: 'ciudad', padre: 'lpa', slug: 'santa-rosa', aclaracion: 'La Pampa' },
      { id: 'santa-rosa-mendoza', nombre: 'Santa Rosa', tipo: 'ciudad', padre: 'mza', slug: 'santa-rosa-mendoza', aclaracion: 'Mendoza' },
    ], perfiles: [perfil('ana', 'mza', 'santa-rosa-mendoza'), perfil('bea', 'mza', 'santa-rosa-mendoza'), perfil('caro', 'lpa', 'santa-rosa')] };
    const seo = createSeoSitio({ datosPath: path.join(dir, 'seo-datos.json'), siteUrl: 'https://sexyrose.net', estado: async () => estado });
    const m1 = await seo.meta('/argentina/santa-rosa-mendoza'); const m2 = await seo.meta('/argentina/santa-rosa');
    assert.equal(m1.title, 'Avisos en Santa Rosa · Mendoza'); assert.equal(m2.title, 'Avisos en Santa Rosa · La Pampa');
    assert.equal((await seo.meta('/perfil/caro')).title, 'caro en Santa Rosa · La Pampa');
    await fs.rm(dir, { recursive: true, force: true });
  });
  test('plan: vincula lo cargado a mano (mismo id), crea lo nuevo, GBA por partido, barrios primero', async () => {
    const leer = async (f, k) => leerEntidades(await fs.readFile(path.join(FIX, f), 'utf8'), k);
    const existentes = [
      { id: 'argentina', nombre: 'Argentina', tipo: 'pais', padre: null },
      { id: 'ciudad-de-buenos-aires', nombre: 'Capital Federal (CABA)', tipo: 'provincia', padre: 'argentina' },
      { id: 'provincia-de-buenos-aires', nombre: 'Provincia de Buenos Aires', tipo: 'provincia', padre: 'argentina' },
      { id: 'zona-norte-gba', nombre: 'Zona Norte (GBA)', tipo: 'zona', padre: 'provincia-de-buenos-aires' },
      { id: 'zona-oeste-gba', nombre: 'Zona Oeste (GBA)', tipo: 'zona', padre: 'provincia-de-buenos-aires' },
      { id: 'zona-sur-gba', nombre: 'Zona Sur (GBA)', tipo: 'zona', padre: 'provincia-de-buenos-aires' },
      { id: 'martinez', nombre: 'Martínez', tipo: 'ciudad', padre: 'zona-norte-gba', lat: -34.49, lng: -58.5 },
      { id: 'provincia-de-misiones', nombre: 'Provincia de Misiones', tipo: 'provincia', padre: 'argentina' },
    ];
    const p = planificar(existentes, {
      provincias: await leer('provincias.json', 'provincias'), departamentos: await leer('departamentos.json', 'departamentos'),
      localidades: await leer('localidades.json', 'localidades'), barrios: leerBarrios(null),
    });
    const por = (nombre) => p.nuevos.find((x) => x.nombre === nombre);
    assert.ok(p.vinculos.some((v) => v.id === 'martinez' && v.georef_id === '06756010002'));
    assert.equal(por('Boulogne Sur Mer').padre, 'zona-norte-gba');
    assert.equal(por('González Catán').padre, 'zona-oeste-gba');
    assert.equal(por('Del Viso').padre, 'provincia-de-buenos-aires', 'Pilar no es parte de los 24 partidos');
    assert.equal(por('Oberá').padre, 'provincia-de-misiones');
    assert.equal(por('Palermo').id, 'palermo');
    assert.equal(por('Palermo').tipo, 'barrio');
    assert.ok(!p.nuevos.some((x) => /ciudad de buenos aires/i.test(x.nombre)), 'la localidad única de CABA no se agrega');
    // Provincias que no estaban (en la lista de prueba: Córdoba, Mendoza, La Pampa, Tierra del Fuego) se crean
    assert.ok(p.nuevos.some((x) => x.tipo === 'provincia' && x.nombre === 'Provincia de Tierra del Fuego'));
    // Dos "Santa Rosa" (Mendoza y La Pampa): ids distintos
    const sr = p.nuevos.filter((x) => x.nombre === 'Santa Rosa').map((x) => x.id).sort();
    assert.equal(sr.length, 2); assert.notEqual(sr[0], sr[1]);
    assert.ok(p.avisos.some((a) => /no encontrado.*Ezeiza/.test(a)), 'avisa los partidos del GBA que no están en departamentos');
  });
});

describe('Georef: base de datos, API y admin', { skip: !process.env.DATABASE_URL }, () => {
  const DATABASE_URL = process.env.DATABASE_URL;
  const A = '/panel-pruebas-georef-0123456789';
  const auth = 'Basic ' + Buffer.from('admin-g:clave-de-prueba-larga-g-123').toString('base64');
  let instance; let BASE; let db; let tmpData; let tmpPublic;
  const pedidos = [];
  const fakeFetch = async (url) => {
    pedidos.push(url);
    const nombre = String(url).split('/').pop();
    try { const t = await fs.readFile(path.join(FIX, nombre), 'utf8'); return new Response(t, { status: 200 }); } catch { return new Response('no', { status: 404 }); }
  };
  const adm = (p, opts = {}) => fetch(BASE + A + '/api' + p, { ...opts, headers: { authorization: auth, ...(opts.headers || {}) } });
  const admPost = (p, body, method = 'POST') => adm(p, { method, body: JSON.stringify(body ?? {}), headers: { 'content-type': 'application/json', 'x-sr-admin': '1', origin: BASE } });
  // Sesión de la acompañante: fila en sesiones (cookie sr_sesion), como la que crea el login
  const sesiones = new Map();
  async function cookieDe(id) {
    if (!sesiones.has(id)) {
      const t = crypto.randomBytes(24).toString('base64url');
      await db.query("INSERT INTO sesiones (token_hash, cuenta_id, expira) VALUES (sha256($1::bytea), $2, now() + interval '1 hour')", [Buffer.from(t), id]);
      sesiones.set(id, 'sr_sesion=' + t);
    }
    return sesiones.get(id);
  }
  const cta = async (id, p, body, method = 'PUT') => fetch(BASE + '/api/cuenta' + p, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { cookie: await cookieDe(id), ...(method === 'GET' ? {} : { 'content-type': 'application/json', 'x-sr': '1', origin: BASE }) } });
  const fila = async (id) => (await db.query('SELECT * FROM ubicaciones WHERE id = $1', [id])).rows[0];
  const esperar = async (fn, ms = 20000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timeout'); await new Promise((r) => setTimeout(r, 200)); } };
  async function limpiar() {
    await db.query("DELETE FROM cuentas WHERE email LIKE 'zzg-%'");
    await db.query("UPDATE ubicaciones SET padre = NULL WHERE false");
    // Lo que agregó el importador (hijos primero) y los vínculos de lo que ya estaba
    for (let i = 0; i < 4; i++) await db.query("DELETE FROM ubicaciones u WHERE fuente = 'georef' AND NOT EXISTS (SELECT 1 FROM ubicaciones h WHERE h.padre = u.id)");
    await db.query("UPDATE ubicaciones SET georef_id = NULL, departamento = NULL WHERE georef_id IS NOT NULL");
    await db.query("UPDATE ubicaciones SET activa = true WHERE id IN ('martinez', 'san-justo')");
    await db.query('DELETE FROM georef_importaciones');
    invalidarCatalogos();
  }

  before(async () => {
    db = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
    tmpData = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-geo-data-'));
    tmpPublic = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-geo-pub-'));
    await fs.writeFile(path.join(tmpPublic, 'index.html'), '<!doctype html><title>x</title>');
    // Base ya migrada por otras pruebas o vacía: limpiar lo de corridas anteriores (si las tablas existen)
    try { await limpiar(); } catch { /* primera vez: las tablas se crean al arrancar */ }
    instance = await start({
      port: 0, host: '127.0.0.1', databaseUrl: DATABASE_URL, publicDir: tmpPublic, dataDir: tmpData, storage: 'local',
      sitioSpaPath: path.join(tmpPublic, 'no-existe.html'), adminPath: A, adminUser: 'admin-g', adminPassword: 'clave-de-prueba-larga-g-123', ipHashSalt: 'sal',
      siteUrl: 'https://sexyrose.net', telegramToken: '', telegramChatId: '', mailgunApiKey: '', tareaPlanes: false, log: () => {},
      georefFetch: fakeFetch, georefMinLocalidades: 1,
    });
    BASE = `http://127.0.0.1:${instance.port}`;
    await instance.ready;
  });
  after(async () => {
    if (db) { await limpiar().catch(() => {}); await db.end(); }
    if (instance) await instance.close();
    for (const d of [tmpData, tmpPublic]) if (d) await fs.rm(d, { recursive: true, force: true });
  });

  test('al arrancar, sin importación previa, importa sola en segundo plano (y no bloquea el sitio)', async () => {
    const r = await fetch(BASE + '/api/sitio/estado');
    assert.equal(r.status, 200, 'el sitio atiende mientras importa');
    const imp = await esperar(async () => (await db.query('SELECT * FROM georef_importaciones WHERE ok')).rows[0]);
    assert.equal(imp.motivo, 'arranque');
    assert.ok(pedidos.some((u) => u.endsWith('/localidades.json')) && pedidos.some((u) => u.endsWith('/provincias.json')));
    assert.ok(imp.conteos.localidades >= 20 && imp.conteos.barrios === 48);
  });

  test('vincula las cargadas a mano (mismo id, nombre y zona) y agrega las nuevas en su lugar', async () => {
    const m = await fila('martinez');
    assert.equal(m.georef_id, '06756010002'); assert.equal(m.nombre, 'Martínez'); assert.equal(m.padre, 'zona-norte-gba'); assert.equal(m.fuente, 'manual');
    const pilar = await fila('pilar');
    assert.equal(pilar.padre, 'zona-norte-gba', 'Pilar cargada a mano sigue en Zona Norte');
    const ob = (await db.query("SELECT * FROM ubicaciones WHERE nombre = 'Oberá'")).rows[0];
    assert.equal(ob.padre, 'provincia-de-misiones'); assert.equal(ob.fuente, 'georef'); assert.equal(ob.tipo, 'ciudad');
    assert.ok(Math.abs(ob.lat + 27.4871) < 0.001);
    const bou = (await db.query("SELECT * FROM ubicaciones WHERE nombre = 'Boulogne Sur Mer'")).rows[0];
    assert.equal(bou.padre, 'zona-norte-gba');
    const { rows: barrios } = await db.query("SELECT * FROM ubicaciones WHERE tipo = 'barrio' AND padre = 'ciudad-de-buenos-aires'");
    assert.equal(barrios.length, 48);
    // Santa Rosa (La Pampa) era la cargada a mano; la de Mendoza es otra con otro id
    assert.equal((await fila('santa-rosa')).georef_id, '42021010000');
    const srm = (await db.query("SELECT * FROM ubicaciones WHERE georef_id = '50070010000'")).rows[0];
    assert.notEqual(srm.id, 'santa-rosa'); assert.equal(srm.nombre, 'Santa Rosa');
  });

  test('se puede correr de nuevo: no duplica, no renombra, no reactiva, no mueve ni borra', async () => {
    const antes = (await db.query('SELECT count(*)::int AS n FROM ubicaciones')).rows[0].n;
    const ob = (await db.query("SELECT id FROM ubicaciones WHERE nombre = 'Oberá'")).rows[0].id;
    await db.query("UPDATE ubicaciones SET nombre = 'Oberá (Misiones)' WHERE id = $1", [ob]);
    await db.query("UPDATE ubicaciones SET activa = false WHERE id = 'martinez'");
    const r = await instance.ctx.georef.importar({ motivo: 'manual', archivos: { dir: FIX } });
    assert.equal(r.ok, true, r.error);
    assert.equal(r.conteos.insertadas, 0);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM ubicaciones')).rows[0].n, antes);
    assert.equal((await fila(ob)).nombre, 'Oberá (Misiones)');
    assert.equal((await fila('martinez')).activa, false);
    await db.query("UPDATE ubicaciones SET nombre = 'Oberá' WHERE id = $1", [ob]);
    await db.query("UPDATE ubicaciones SET activa = true WHERE id = 'martinez'");
    invalidarCatalogos();
  });

  test('API del panel: provincias, buscar localidad (Misiones → "Obe" → Oberá) y barrios de CABA', async () => {
    const pv = await (await fetch(BASE + '/api/ubicaciones/provincias')).json();
    assert.ok(pv.items.some((x) => x.id === 'ciudad-de-buenos-aires') && pv.items.some((x) => x.id === 'provincia-de-misiones'));
    let r = await (await fetch(BASE + '/api/ubicaciones/buscar?provincia=provincia-de-misiones&q=Obe')).json();
    assert.equal(r.items[0].nombre, 'Oberá'); assert.equal(r.items[0].camino, 'Oberá, Misiones');
    r = await (await fetch(BASE + '/api/ubicaciones/buscar?provincia=provincia-de-misiones&q=' + encodeURIComponent('OBÉ'))).json();
    assert.equal(r.items[0].nombre, 'Oberá');
    r = await (await fetch(BASE + '/api/ubicaciones/buscar?provincia=provincia-de-buenos-aires&q=boul')).json();
    assert.equal(r.items[0].camino, 'Boulogne Sur Mer, Zona Norte (GBA), Buenos Aires');
    assert.equal((await fetch(BASE + '/api/ubicaciones/buscar?q=obe')).status, 400);
    const b = await (await fetch(BASE + '/api/ubicaciones/barrios')).json();
    assert.equal(b.items.length, 48);
  });

  test('perfil: guarda la localidad elegida y valida que exista, esté activa y sea de la provincia', async () => {
    const email = `zzg-${crypto.randomBytes(4).toString('hex')}@example.com`;
    const { rows: [c] } = await db.query('INSERT INTO cuentas (email, pass_hash) VALUES ($1, $2) RETURNING id', [email, 'x']);
    await db.query("INSERT INTO perfiles (cuenta_id, slug, datos) VALUES ($1, $2, '{}')", [c.id, 'zzg-' + c.id.slice(0, 8)]);
    const ob = (await db.query("SELECT id FROM ubicaciones WHERE nombre = 'Oberá'")).rows[0].id;
    const base = { displayName: 'Zzg', genero: 'mujer', tipo: 'acompanante' };
    let r = await cta(c.id, '/perfil', { ...base, provincia: 'provincia-de-misiones', ciudad: ob });
    assert.equal(r.status, 200, await r.clone().text());
    const yo = await (await cta(c.id, '/yo', undefined, 'GET')).json();
    assert.equal(yo.cuenta.perfil.ubicacion.ciudad.camino, 'Oberá, Misiones');
    r = await cta(c.id, '/perfil', { ...base, provincia: 'provincia-de-cordoba', ciudad: ob });
    assert.equal(r.status, 400);
    r = await cta(c.id, '/perfil', { ...base, provincia: 'provincia-de-misiones', ciudad: 'no-existe' });
    assert.equal(r.status, 400);
    r = await cta(c.id, '/perfil', { ...base, provincia: 'ciudad-de-buenos-aires', ciudad: 'palermo' });
    assert.equal(r.status, 200, 'barrio de CABA');
    await db.query("UPDATE ubicaciones SET activa = false WHERE id = 'palermo'"); invalidarCatalogos();
    r = await cta(c.id, '/perfil', { ...base, provincia: 'ciudad-de-buenos-aires', ciudad: 'palermo' });
    assert.equal(r.status, 400, 'un lugar oculto no se puede elegir');
    await db.query("UPDATE ubicaciones SET activa = true WHERE id = 'palermo'"); invalidarCatalogos();
  });

  test('sitio público: solo los lugares con perfiles visibles y los que los contienen', async () => {
    const cat = await cargarCatalogos(db);
    const ob = (await db.query("SELECT id FROM ubicaciones WHERE nombre = 'Oberá'")).rows[0].id;
    const u = ubicacionesUsadas(cat, [{ ubicacionIds: { pais: 'argentina', provincia: 'provincia-de-misiones', ciudad: ob } }, { ubicacionIds: { pais: 'argentina', provincia: 'ciudad-de-buenos-aires', ciudad: 'palermo' } }]);
    assert.deepEqual(plano(u.map((x) => x.id).sort()), ['argentina', 'ciudad-de-buenos-aires', ob, 'palermo', 'provincia-de-misiones'].sort());
    assert.equal(u.find((x) => x.id === 'palermo').slug, 'palermo');
    const est = await (await fetch(BASE + '/api/sitio/estado')).json();
    assert.ok(est.ubicaciones.length < 60, `el estado no manda los ${cat.ubicaciones.length} lugares (manda ${est.ubicaciones.length})`);
    const usados = new Set(est.perfiles.flatMap((p) => Object.values(p.ubicacionIds || {})));
    for (const x of est.ubicaciones.filter((y) => y.tipo === 'ciudad' || y.tipo === 'barrio')) assert.ok(usados.has(x.id), x.id + ' no tiene perfiles');
  });

  test('admin: lista con fuente y perfiles, unir con otro lugar (mueve perfiles y oculta) y estado de la importación', async () => {
    const lista = await (await adm('/ubicaciones')).json();
    const ob = lista.items.find((x) => x.nombre === 'Oberá');
    assert.equal(ob.fuente, 'georef'); assert.ok(ob.perfiles >= 0);
    // Una ciudad cargada a mano con un perfil se une con la de Georef
    await db.query("INSERT INTO ubicaciones (id, nombre, tipo, padre) VALUES ('zzg-obera-mano', 'Obera', 'ciudad', 'provincia-de-misiones') ON CONFLICT DO NOTHING");
    const email = `zzg-${crypto.randomBytes(4).toString('hex')}@example.com`;
    const { rows: [c] } = await db.query('INSERT INTO cuentas (email, pass_hash) VALUES ($1, $2) RETURNING id', [email, 'x']);
    await db.query('INSERT INTO perfiles (cuenta_id, slug, datos) VALUES ($1, $2, $3)', [c.id, 'zzg-' + c.id.slice(0, 8), JSON.stringify({ provincia: 'provincia-de-misiones', ciudad: 'zzg-obera-mano' })]);
    assert.equal((await admPost('/ubicaciones/zzg-obera-mano/unir', { destino: 'provincia-de-misiones' })).status, 400, 'destino tiene que ser ciudad o barrio');
    const r = await admPost('/ubicaciones/zzg-obera-mano/unir', { destino: ob.id });
    assert.equal(r.status, 200, await r.clone().text());
    assert.equal((await r.json()).movidos, 1);
    const { rows: [p] } = await db.query('SELECT datos FROM perfiles WHERE cuenta_id = $1', [c.id]);
    assert.equal(p.datos.ciudad, ob.id); assert.equal(p.datos.provincia, 'provincia-de-misiones'); assert.equal(p.datos.pais, 'argentina');
    assert.equal((await fila('zzg-obera-mano')).activa, false);
    // Renombrar una ciudad de Zona Norte desde el admin (no revisa de nuevo el padre)
    let e = await admPost('/ubicaciones/martinez', { nombre: 'Martínez (San Isidro)' }, 'PUT');
    assert.equal(e.status, 200, await e.clone().text());
    assert.equal((await fila('martinez')).padre, 'zona-norte-gba');
    e = await admPost('/ubicaciones/martinez', { nombre: 'Martínez' }, 'PUT'); assert.equal(e.status, 200);
    await db.query("DELETE FROM perfiles WHERE cuenta_id = $1", [c.id]);
    await db.query("DELETE FROM ubicaciones WHERE id = 'zzg-obera-mano'");
    // Estado e "Importar ahora"
    const g = await (await adm('/georef')).json();
    assert.equal(g.ultima.ok, true); assert.ok(g.ultimaOk.conteos.localidades > 0); assert.ok(g.lugares.georef > 48);
    const imp = await admPost('/georef/importar', {});
    assert.equal(imp.status, 202);
    const fin = await esperar(async () => { const x = await (await adm('/georef')).json(); return !x.corriendo && x.ultima.motivo === 'admin' ? x : null; });
    assert.equal(fin.ultima.ok, true, fin.ultima.error);
  });

  test('si datos.gob.ar falla queda registrado y reintenta más tarde (no enseguida)', async () => {
    const geo = instance.ctx.georef;
    await db.query('DELETE FROM georef_importaciones');
    assert.equal(await geo.toca(), 'arranque');
    await db.query("INSERT INTO georef_importaciones (inicio, fin, ok, error) VALUES (now(), now(), false, 'x')");
    assert.equal(await geo.toca(), null, 'recién falló: espera');
    assert.equal(await geo.toca(Date.now() + 6 * 60 * 1000), 'arranque', 'a los 5 minutos reintenta');
    await db.query("INSERT INTO georef_importaciones (inicio, fin, ok) VALUES (now() - interval '8 days', now() - interval '8 days', true)");
    await db.query("DELETE FROM georef_importaciones WHERE NOT ok");
    assert.equal(await geo.toca(), 'semanal');
  });
});
