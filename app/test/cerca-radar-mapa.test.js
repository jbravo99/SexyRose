// Cerca de mí (13/11/2026): radar con escala real (mvp/src/radar.js, funciones puras) y vista Mapa
// (lib/mapa.js: MAP_TILES_URL y compañía → /api/sitio/estado y CSP).
//   node --test test/cerca-radar-mapa.test.js                       (sin base: radar, config y CSP)
//   DATABASE_URL=postgres://... node --test test/cerca-radar-mapa.test.js   (además: estado con y sin mapa)
import { describe, test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { mapaConfig, mapaOrigenes } from '../lib/mapa.js';
import { cspSitio } from '../routes/spa-sitio.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ctx = { globalThis: {} };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(HERE, '..', '..', 'mvp', 'src', 'radar.js'), 'utf8'), ctx);
const R = ctx.HH.radar;

// Generador pseudoaleatorio con semilla (los casos se repiten igual en cada corrida)
function azar(semilla) {
  let s = semilla >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

describe('Radar (radar.js)', () => {
  test('anillos: el último es el rango elegido', () => {
    for (const km of [5, 10, 15, 25, 50, 100]) {
      const a = R.anillos(km);
      assert.equal(a[a.length - 1], km);
      assert.deepEqual([...a].sort((x, y) => x - y), [...a]);
    }
    assert.deepEqual([...R.anillos(15)], [2, 5, 10, 15]);
    const raro = R.anillos(40);
    assert.equal(raro[raro.length - 1], 40);
  });

  test('radio: escala de raíz cuadrada, recortada al rango', () => {
    assert.equal(R.radio(0, 15, 200), 0);
    assert.equal(R.radio(15, 15, 200), 200);
    assert.equal(R.radio(99, 15, 200), 200);
    assert.ok(Math.abs(R.radio(3.75, 15, 200) - 100) < 1e-9); // un cuarto de la distancia = mitad del radio
  });

  test('rumbo: 0 = este, π/2 = norte, corrige por latitud', () => {
    const c = [-34.6, -58.4];
    assert.ok(Math.abs(R.rumbo(c, [-34.6, -58.3])) < 1e-9);
    assert.ok(Math.abs(R.rumbo(c, [-34.5, -58.4]) - Math.PI / 2) < 1e-9);
    assert.ok(Math.abs(Math.abs(R.rumbo(c, [-34.6, -58.5])) - Math.PI) < 1e-9);
    assert.ok(Math.abs(R.rumbo(c, [-34.7, -58.4]) + Math.PI / 2) < 1e-9);
    // 0,1° de longitud mide menos que 0,1° de latitud: el rumbo a (+0,1, +0,1) queda por arriba de 45°
    assert.ok(R.rumbo(c, [-34.5, -58.3]) > Math.PI / 4);
  });

  test('ubicar: sin burbujas encimadas, dentro del radar y lejos de "Vos" (celular y escritorio)', () => {
    const casos = [
      { w: 358, h: 437, n: 10, s: [56, 50, 46, 42], lw: 80, lh: 30, centro: 56, vueltas: 60 },
      { w: 1148, h: 720, n: 18, s: [92, 84, 78, 72], lw: 110, lh: 34, centro: 56, vueltas: 30 },
    ];
    for (const c of casos) {
      const rnd = azar(c.w);
      for (let v = 0; v < c.vueltas; v++) {
        const km = [5, 10, 15, 25, 50][v % 5];
        // Mitad de los casos con varias en la misma zona (mismo rumbo y distancia): el peor caso del radar
        const items = Array.from({ length: c.n }, (_, i) => {
          const junta = v % 2 === 0 && i < c.n / 2;
          const s = c.s[i % c.s.length];
          return { d: junta ? km * 0.3 : rnd() * km, a: junta ? 1 : rnd() * Math.PI * 2 - Math.PI, s, lw: Math.max(s, c.lw), lh: c.lh };
        });
        const pos = R.ubicar(items, { w: c.w, h: c.h, km, centro: c.centro });
        assert.equal(pos.length, items.length);
        const pisadas = R.seSuperponen(items, pos); // (arreglo de otro contexto de vm: se compara el largo)
        assert.equal(pisadas.length, 0, `encimadas (${c.w}px, vuelta ${v}): ${JSON.stringify(pisadas)}`);
        pos.forEach((p, i) => {
          const it = items[i];
          assert.ok(p.x - it.lw / 2 >= -0.5 && p.x + it.lw / 2 <= c.w + 0.5, 'se sale a lo ancho');
          assert.ok(p.y - it.s / 2 >= -0.5 && p.y + it.s / 2 + it.lh <= c.h + 0.5, 'se sale a lo alto');
          assert.ok(Math.hypot(p.x - c.w / 2, p.y - c.h / 2) >= c.centro / 2 + it.s / 2 - 0.5, 'pisa el centro');
        });
        assert.ok(pos.R > 0);
      }
    }
  });

  test('ubicar: una sola burbuja queda en su lugar real (distancia y rumbo)', () => {
    const items = [{ d: 15, a: 0, s: 50, lw: 50, lh: 0 }];
    const pos = R.ubicar(items, { w: 400, h: 400, km: 15, centro: 56 });
    assert.ok(Math.abs(pos[0].x - (200 + pos.R)) < 1);
    assert.ok(Math.abs(pos[0].y - 200) < 1);
  });
});

describe('Vista Mapa: configuración (lib/mapa.js)', () => {
  const T = 'https://sexyrose.b-cdn.net/mapa/argentina.pmtiles';
  const G = 'https://sexyrose.b-cdn.net/mapa/fonts/{fontstack}/{range}.pbf';
  const S = 'https://sexyrose.b-cdn.net/mapa/sprites/v4/dark';

  test('sin MAP_TILES_URL no hay mapa', () => {
    assert.equal(mapaConfig({}), null);
    assert.equal(mapaConfig({ MAP_GLYPHS_URL: G, MAP_SPRITE_URL: S }), null);
  });

  test('solo https (http únicamente en localhost) y archivo .pmtiles', () => {
    assert.equal(mapaConfig({ MAP_TILES_URL: 'http://cdn.example.com/a.pmtiles' }), null);
    assert.equal(mapaConfig({ MAP_TILES_URL: 'https://cdn.example.com/a.mbtiles' }), null);
    assert.equal(mapaConfig({ MAP_TILES_URL: 'https://u:p@cdn.example.com/a.pmtiles' }), null);
    assert.equal(mapaConfig({ MAP_TILES_URL: 'javascript:alert(1)//a.pmtiles' }), null);
    assert.equal(mapaConfig({ MAP_TILES_URL: 'no es una url' }), null);
    assert.deepEqual(mapaConfig({ MAP_TILES_URL: 'http://127.0.0.1:8792/a.pmtiles' }), { tiles: 'http://127.0.0.1:8792/a.pmtiles', glyphs: '', sprite: '' });
    assert.deepEqual(mapaConfig({ MAP_TILES_URL: T }), { tiles: T, glyphs: '', sprite: '' });
  });

  test('nombres del mapa solo con glyphs (plantilla) y sprite juntos', () => {
    assert.deepEqual(mapaConfig({ MAP_TILES_URL: T, MAP_GLYPHS_URL: G, MAP_SPRITE_URL: S }), { tiles: T, glyphs: G, sprite: S });
    assert.deepEqual(mapaConfig({ MAP_TILES_URL: T, MAP_GLYPHS_URL: G }), { tiles: T, glyphs: '', sprite: '' });
    assert.deepEqual(mapaConfig({ MAP_TILES_URL: T, MAP_SPRITE_URL: S }), { tiles: T, glyphs: '', sprite: '' });
    // Glyphs sin {fontstack}/{range} no sirven
    assert.deepEqual(mapaConfig({ MAP_TILES_URL: T, MAP_GLYPHS_URL: 'https://x.example.com/f.pbf', MAP_SPRITE_URL: S }), { tiles: T, glyphs: '', sprite: '' });
  });

  test('orígenes para la CSP (connect-src), sin repetir', () => {
    assert.deepEqual(mapaOrigenes(null), []);
    assert.deepEqual(mapaOrigenes(mapaConfig({ MAP_TILES_URL: T, MAP_GLYPHS_URL: G, MAP_SPRITE_URL: S })), ['https://sexyrose.b-cdn.net']);
    assert.deepEqual(mapaOrigenes({ tiles: T, glyphs: 'https://g.example.com/{fontstack}/{range}.pbf', sprite: '' }), ['https://sexyrose.b-cdn.net', 'https://g.example.com']);
  });

  test('CSP: suma los orígenes del mapa a connect-src y nada más', () => {
    const sin = cspSitio(null, '');
    assert.match(sin, /connect-src 'self';/);
    const con = cspSitio(null, '', ['https://sexyrose.b-cdn.net']);
    assert.match(con, /connect-src 'self' https:\/\/sexyrose\.b-cdn\.net;/);
    assert.match(con, /script-src 'self';/); // el worker del mapa sale del mismo sitio
    assert.doesNotMatch(con, /worker-src|unsafe-eval/);
    // Algo raro en la lista no entra a la CSP
    assert.match(cspSitio(null, '', ["https://x.com; script-src *"]), /connect-src 'self';/);
  });
});

describe('Vista Mapa: /api/sitio/estado', { skip: !process.env.DATABASE_URL && 'sin DATABASE_URL' }, () => {
  let pool;
  const antes = { ...process.env };
  after(async () => {
    for (const k of ['MAP_TILES_URL', 'MAP_GLYPHS_URL', 'MAP_SPRITE_URL']) { if (antes[k] == null) delete process.env[k]; else process.env[k] = antes[k]; }
    if (pool) await pool.end();
  });

  test('trae "mapa" solo si está configurado', async () => {
    const pg = (await import('pg')).default;
    const { armarEstado } = await import('../routes/sitio.js');
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    delete process.env.MAP_TILES_URL; delete process.env.MAP_GLYPHS_URL; delete process.env.MAP_SPRITE_URL;
    assert.equal('mapa' in (await armarEstado(pool)), false);
    process.env.MAP_TILES_URL = 'https://sexyrose.b-cdn.net/mapa/argentina.pmtiles';
    const e = await armarEstado(pool);
    assert.deepEqual(e.mapa, { tiles: process.env.MAP_TILES_URL, glyphs: '', sprite: '' });
  });
});
