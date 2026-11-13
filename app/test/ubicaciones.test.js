// Selector de ubicación al estilo distintas.net (13/11/2026): funciones puras de mvp/src/ubicaciones.js.
//   node --test test/ubicaciones.test.js   (no usa base)
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ctx = {};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(HERE, '..', '..', 'mvp', 'src', 'ubicaciones.js'), 'utf8'), ctx);
const U = ctx.HH.ubic;
const plano = (x) => JSON.parse(JSON.stringify(x));

const L = [
  { id: 'ar', name: 'Argentina', parentId: null, level: 'country' },
  { id: 'pba', name: 'Provincia de Buenos Aires', parentId: 'ar', level: 'state' },
  { id: 'caba', name: 'Ciudad de Buenos Aires', parentId: 'ar', level: 'city' },
  { id: 'cba', name: 'Córdoba', parentId: 'ar', level: 'state' },
  { id: 'cat', name: 'Catamarca', parentId: 'ar', level: 'state' },
  { id: 'chu', name: 'Chubut', parentId: 'ar', level: 'state' },
  { id: 'mdp', name: 'Mar del Plata', parentId: 'pba', level: 'city' },
  { id: 'lp', name: 'La Plata', parentId: 'pba', level: 'city' },
  { id: 'cen', name: 'Centro', parentId: 'mdp', level: 'zone' },
  { id: 'per', name: 'La Perla', parentId: 'mdp', level: 'zone' },
  { id: 'pg', name: 'Playa Grande', parentId: 'mdp', level: 'zone' },
];
const N = { ar: 12, pba: 4, caba: 5, cba: 3, cat: 0, chu: 0, mdp: 4, lp: 0, cen: 3, per: 1, pg: 0 };
const contar = (l) => N[l.id] || 0;
const nombres = (v) => v.lista.map((r) => r.loc.name);

describe('Selector de ubicación (distintas.net)', () => {
  test('orden alfabético sin importar el nivel ni los acentos: Ciudad de Buenos Aires no queda última', () => {
    const o = U.ordenar(U.hijos(L, 'ar')).map((l) => l.name);
    assert.deepEqual(plano(o), ['Catamarca', 'Chubut', 'Ciudad de Buenos Aires', 'Córdoba', 'Provincia de Buenos Aires']);
  });
  test('nivel país: el país va arriba con ✓ y abajo solo los lugares con perfiles', () => {
    const v = U.vista(L, 'ar', null, contar);
    assert.deepEqual(plano(v.camino.map((l) => l.name)), ['Argentina']);
    assert.deepEqual(plano(nombres(v)), ['Ciudad de Buenos Aires', 'Córdoba', 'Provincia de Buenos Aires']);
    assert.equal(v.lista.find((r) => r.loc.id === 'pba').tieneHijos, true);
    assert.equal(v.lista.find((r) => r.loc.id === 'caba').tieneHijos, false);
  });
  test('dentro de una ciudad: camino con ✓ (país, provincia, ciudad) y sus barrios, sin los vacíos', () => {
    const v = U.vista(L, 'mdp', null, contar);
    assert.deepEqual(plano(v.camino.map((l) => l.name)), ['Argentina', 'Provincia de Buenos Aires', 'Mar del Plata']);
    assert.deepEqual(plano(nombres(v)), ['Centro', 'La Perla']);
    assert.ok(v.lista.every((r) => !r.tieneHijos));
  });
  test('un barrio elegido (sin lugares adentro) se ve marcado entre sus hermanos, aunque tenga 0 perfiles', () => {
    const v = U.vista(L, 'pg', null, contar);
    assert.deepEqual(plano(v.camino.map((l) => l.name)), ['Argentina', 'Provincia de Buenos Aires', 'Mar del Plata']);
    assert.deepEqual(plano(nombres(v)), ['Centro', 'La Perla', 'Playa Grande']);
    assert.equal(v.lista.find((r) => r.loc.id === 'pg').elegido, true);
  });
  test('una ciudad cuyos lugares están todos vacíos no tiene flecha', () => {
    const v = U.vista(L, 'pba', null, contar);
    assert.deepEqual(plano(nombres(v)), ['Mar del Plata']);
    const solo = U.vista(L.filter((l) => l.parentId !== 'mdp'), 'pba', null, contar);
    assert.equal(solo.lista[0].tieneHijos, false);
  });
  test('sin elegir: la raíz lista los países; un nivel sin perfiles queda vacío', () => {
    assert.deepEqual(plano(nombres(U.vista(L, null, null, contar))), ['Argentina']);
    assert.equal(U.vista(L, null, null, () => 0).vacia, true);
    // Un país sin perfiles en ningún lado: se queda en la lista de países, marcado
    assert.deepEqual(plano(nombres(U.vista(L, 'ar', null, () => 0))), ['Argentina']);
  });
  test('respeta los lugares deshabilitados', () => {
    const v = U.vista(L, 'ar', (l) => l.id !== 'cba', contar);
    assert.ok(!nombres(v).includes('Córdoba'));
  });
});

describe('Nombres repetidos (dos "Santa Rosa"): todo por id', () => {
  // Como llegan en /api/sitio/estado: la aclaración la arma el servidor (routes/sitio.js, aclaraciones)
  const estado = [
    { id: 'argentina', nombre: 'Argentina', padre: null },
    { id: 'mza', nombre: 'Provincia de Mendoza', padre: 'argentina' },
    { id: 'lpa', nombre: 'Provincia de La Pampa', padre: 'argentina' },
    { id: 'santa-rosa', nombre: 'Santa Rosa', padre: 'lpa', aclaracion: 'La Pampa' },
    { id: 'santa-rosa-mendoza', nombre: 'Santa Rosa', padre: 'mza', aclaracion: 'Mendoza' },
  ];
  const locs = estado.map((u) => ({ id: u.id, parentId: u.padre, ...U.lugarDeEstado(u) }));
  const byId = new Map(locs.map((l) => [l.id, l]));
  const perfiles = [
    { ubicacionIds: { pais: 'argentina', provincia: 'mza', ciudad: 'santa-rosa-mendoza' } },
    { ubicacionIds: { pais: 'argentina', provincia: 'mza', ciudad: 'santa-rosa-mendoza' } },
    { ubicacionIds: { pais: 'argentina', provincia: 'lpa', ciudad: 'santa-rosa' } },
  ];
  // El sitio cuenta por el nombre del lugar del perfil (HH.inCity): con nombres únicos, eso es contar por id
  const ciudades = perfiles.map((p) => U.lugarDePerfil(p, byId).name);
  const contar = (l) => ciudades.filter((c) => U.camino(locs, (locs.find((x) => x.name === c) || {}).id).some((x) => x.id === l.id)).length;
  test('cada uno tiene su nombre, con la provincia como aclaración', () => {
    assert.equal(byId.get('santa-rosa-mendoza').name, 'Santa Rosa · Mendoza');
    assert.equal(byId.get('santa-rosa-mendoza').base, 'Santa Rosa');
    assert.equal(byId.get('santa-rosa-mendoza').extra, 'Mendoza');
    assert.equal(byId.get('santa-rosa').name, 'Santa Rosa · La Pampa');
    assert.equal(new Set(locs.map((l) => l.name)).size, locs.length);
    assert.equal(U.lugarDeEstado({ nombre: 'Oberá' }).name, 'Oberá');
  });
  test('el perfil va a su lugar por id y los contadores no se mezclan', () => {
    assert.deepEqual(plano(ciudades), ['Santa Rosa · Mendoza', 'Santa Rosa · Mendoza', 'Santa Rosa · La Pampa']);
    assert.equal(contar(byId.get('santa-rosa-mendoza')), 2);
    assert.equal(contar(byId.get('santa-rosa')), 1);
    const v = U.vista(locs, 'mza', null, contar);
    assert.deepEqual(plano(v.lista.map((r) => [r.loc.id, r.n])), [['santa-rosa-mendoza', 2]]);
    const w = U.vista(locs, 'lpa', null, contar);
    assert.deepEqual(plano(w.lista.map((r) => [r.loc.id, r.n])), [['santa-rosa', 1]]);
  });
});
