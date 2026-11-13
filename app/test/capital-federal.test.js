// "Ciudad de Buenos Aires" pasa a llamarse "Capital Federal (CABA)" (Juan, 13/11/2026). El id ('ciudad-de-buenos-aires')
// queda igual; la dirección pasa a /argentina/capital-federal (título "Capital Federal") y /argentina/buenos-aires
// redirige con 301.
//   DATABASE_URL=postgres://... node --test test/capital-federal.test.js
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { start } from '../server.js';
import { createSeoSitio } from '../lib/seo-sitio.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');
const NUEVO = 'Capital Federal (CABA)';
const VIEJO = 'Ciudad de Buenos Aires';

// HH.SEO_PLACE_DEFAULTS tal como lo arma build-sitio.py (literal de mvp/src/urls.js)
function lugaresSeo() {
  const src = fsSync.readFileSync(path.join(ROOT, 'mvp', 'src', 'urls.js'), 'utf8');
  const marca = 'HH.SEO_PLACE_DEFAULTS = ';
  const i = src.indexOf(marca) + marca.length;
  let prof = 0; let j = i;
  for (; j < src.length; j++) { if (src[j] === '{') prof++; else if (src[j] === '}') { prof--; if (!prof) break; } }
  return vm.runInNewContext('(' + src.slice(i, j + 1) + ')');
}

describe('Capital Federal (CABA): SEO y direcciones', () => {
  test('el nombre nuevo y el viejo tienen el mismo slug y el mismo nombre para buscadores', () => {
    const L = lugaresSeo();
    for (const n of [NUEVO, VIEJO]) {
      assert.equal(L[n].slug, 'capital-federal'); assert.equal(L[n].name, 'Capital Federal');
      assert.deepEqual([...L[n].oldSlugs], ['buenos-aires']);
    }
  });

  let dir;
  const perfil = (slug) => ({ slug, displayName: slug, edad: 30, genero: 'mujer', ubicacionIds: { pais: 'argentina', provincia: 'ciudad-de-buenos-aires', ciudad: 'ciudad-de-buenos-aires' }, ciudad: 'ciudad-de-buenos-aires', bio: 'Bio', fotos: [], actualizado: '2026-11-01T10:00:00Z' });
  const estadoCon = (nombre) => ({
    ajustes: {},
    ubicaciones: [
      { id: 'argentina', nombre: 'Argentina', tipo: 'pais', padre: null },
      { id: 'ciudad-de-buenos-aires', nombre, tipo: 'provincia', padre: 'argentina' },
    ],
    perfiles: [perfil('ana'), perfil('bea')],
  });
  before(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-caba-'));
    const tpl = { title: 'Avisos en {lugar}', description: '{cantidad} en {lugar}', intro: 'Intro {lugar}' };
    const datos = {
      defaults: {
        siteUrl: 'https://sexyrose.net', minProfiles: 1,
        home: { es: { title: 'Inicio', description: 'D' } },
        tpl: { es: { country: tpl, place: tpl, countryMen: tpl, placeMen: tpl, profile: { title: '{nombre} en {lugar}', description: '{nombre}' } } },
      },
      lugares: lugaresSeo(),
      dict: {},
    };
    await fs.writeFile(path.join(dir, 'seo-datos.json'), JSON.stringify(datos));
  });
  after(() => fs.rm(dir, { recursive: true, force: true }));

  for (const nombre of [NUEVO, VIEJO]) {
    test(`con el nombre "${nombre}": /argentina/capital-federal es la dirección y /argentina/buenos-aires redirige`, async () => {
      const seo = createSeoSitio({ datosPath: path.join(dir, 'seo-datos.json'), siteUrl: 'https://sexyrose.net', estado: async () => estadoCon(nombre) });
      const m = await seo.meta('/argentina/capital-federal');
      assert.equal(m.status, 200);
      assert.equal(m.title, 'Avisos en Capital Federal');
      assert.equal(m.canonical, 'https://sexyrose.net/argentina/capital-federal');
      for (const [viejo, nuevo] of [['/argentina/buenos-aires', '/argentina/capital-federal'], ['/en/argentina/buenos-aires', '/en/argentina/capital-federal'],
        ['/argentina/buenos-aires/hombres', '/argentina/capital-federal/hombres'], ['/argentina/buenos-aires/cena', '/argentina/capital-federal']]) {
        const r = await seo.meta(viejo);
        assert.equal(r.status, 301, viejo); assert.equal(r.location, nuevo, viejo);
      }
      const xml = await seo.sitemap();
      assert.match(xml, /https:\/\/sexyrose\.net\/argentina\/capital-federal</);
      assert.doesNotMatch(xml, /\/argentina\/buenos-aires/);
      const p = await seo.meta('/perfil/ana');
      assert.equal(p.title, 'ana en Capital Federal');
    });
  }

  test('el selector lo ordena en la C', () => {
    const ctx = {}; ctx.globalThis = ctx; vm.createContext(ctx);
    vm.runInContext(fsSync.readFileSync(path.join(ROOT, 'mvp', 'src', 'ubicaciones.js'), 'utf8'), ctx);
    const L = [
      { id: 'ar', name: 'Argentina', parentId: null, level: 'country' },
      { id: 'ciudad-de-buenos-aires', name: NUEVO, parentId: 'ar', level: 'city' },
      { id: 'cat', name: 'Catamarca', parentId: 'ar', level: 'state' },
      { id: 'cba', name: 'Córdoba', parentId: 'ar', level: 'state' },
      { id: 'pba', name: 'Provincia de Buenos Aires', parentId: 'ar', level: 'state' },
    ];
    const o = ctx.HH.ubic.ordenar(ctx.HH.ubic.hijos(L, 'ar')).map((l) => l.name);
    assert.deepEqual(JSON.parse(JSON.stringify(o)), [NUEVO, 'Catamarca', 'Córdoba', 'Provincia de Buenos Aires']);
  });
});

describe('Capital Federal (CABA): base de datos', () => {
  const DATABASE_URL = process.env.DATABASE_URL;
  let instance; let db; let BASE; let tmpData; let tmpPublic;
  before(async () => {
    if (!DATABASE_URL) return;
    tmpData = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-caba-data-'));
    tmpPublic = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-caba-pub-'));
    await fs.writeFile(path.join(tmpPublic, 'index.html'), '<!doctype html><title>x</title>');
    instance = await start({ prelanzamientoPorDefecto: false,
      port: 0, host: '127.0.0.1', databaseUrl: DATABASE_URL, publicDir: tmpPublic, dataDir: tmpData, storage: 'local',
      sitioSpaPath: path.join(tmpPublic, 'no-existe.html'), adminUser: 'zzcadmin', adminPassword: 'clave-larga-zzc-123', ipHashSalt: 'sal',
      siteUrl: 'https://sexyrose.net', telegramToken: '', telegramChatId: '', mailgunApiKey: '', tareaPlanes: false, log: () => {},
    });
    BASE = `http://127.0.0.1:${instance.port}`;
    await instance.ready;
    db = new pg.Pool({ connectionString: DATABASE_URL });
  });
  after(async () => {
    if (db) await db.end();
    if (instance) await instance.close();
    for (const d of [tmpData, tmpPublic]) if (d) await fs.rm(d, { recursive: true, force: true });
  });

  test('al arrancar queda "Capital Federal (CABA)" con el mismo id', { skip: !DATABASE_URL }, async () => {
    const { rows: [u] } = await db.query("SELECT nombre FROM ubicaciones WHERE id = 'ciudad-de-buenos-aires'");
    assert.equal(u.nombre, NUEVO);
    // El panel elige la provincia de /api/ubicaciones/provincias (el estado del sitio solo trae lugares con perfiles)
    const pv = await (await fetch(BASE + '/api/ubicaciones/provincias')).json();
    const caba = pv.items.find((x) => x.id === 'ciudad-de-buenos-aires');
    assert.equal(caba.nombre, NUEVO);
  });

  test('migración 150: cambia el nombre de siempre, pero no pisa uno editado en el admin', { skip: !DATABASE_URL }, async () => {
    const sql = await fs.readFile(new URL('../db/150-capital-federal.sql', import.meta.url), 'utf8');
    await db.query("UPDATE ubicaciones SET nombre = $1 WHERE id = 'ciudad-de-buenos-aires'", [VIEJO]);
    await db.query(sql);
    let { rows: [u] } = await db.query("SELECT nombre FROM ubicaciones WHERE id = 'ciudad-de-buenos-aires'");
    assert.equal(u.nombre, NUEVO);
    await db.query("UPDATE ubicaciones SET nombre = 'CABA (editado)' WHERE id = 'ciudad-de-buenos-aires'");
    await db.query(sql);
    ({ rows: [u] } = await db.query("SELECT nombre FROM ubicaciones WHERE id = 'ciudad-de-buenos-aires'"));
    assert.equal(u.nombre, 'CABA (editado)');
    await db.query("UPDATE ubicaciones SET nombre = $1 WHERE id = 'ciudad-de-buenos-aires'", [NUEVO]);
  });
});
