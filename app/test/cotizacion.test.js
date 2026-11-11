// Cotización automática del dólar blue (DolarApi, respaldo Bluelytics), modo manual, guardia del 25 %,
// endpoints del admin y compatibilidad con el formato viejo {arsPorUsd, nota}. Sin red: fetch inyectado.
//   DATABASE_URL=postgres://postgres@localhost:55432/srtestC node --test test/cotizacion.test.js
import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { start } from '../server.js';
import {
  createCotizacion, parseDolarApi, parseBluelytics, normalizar, validarCotizacionV2, COTIZACION_URL, COTIZACION_FALLBACK_URL,
} from '../lib/cotizacion.js';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres@localhost:55432/srtestC';
const db = new pg.Pool({ connectionString: DATABASE_URL, max: 4 });
const A = '/panel-pruebas-cotizacion-0123456789';
const USER = 'admin-cot';
const PASS = 'clave-de-prueba-larga-789';
let instance; let BASE; let tmpData;

// Fuentes simuladas: cada una devuelve lo que diga `fuentes` (objeto JSON, número de status o 'error').
const fuentes = { a: null, b: null };
const llamadas = [];
const respuesta = (x) => {
  if (x === 'error' || x == null) return Promise.reject(new TypeError('fetch failed'));
  if (typeof x === 'number') return Promise.resolve({ ok: false, status: x, json: async () => ({}) });
  return Promise.resolve({ ok: true, status: 200, json: async () => x });
};
const fakeFetch = (url, opts) => {
  llamadas.push({ url, ua: opts && opts.headers && opts.headers['User-Agent'] });
  return respuesta(url === COTIZACION_URL ? fuentes.a : url === COTIZACION_FALLBACK_URL ? fuentes.b : 'error');
};
const dolarApi = (compra, venta, fecha = '2026-11-10T20:59:00.000Z') => ({ moneda: 'USD', casa: 'blue', nombre: 'Blue', compra, venta, fechaActualizacion: fecha });
const bluelytics = (buy, sell) => ({ oficial: { value_buy: 1400, value_sell: 1450 }, blue: { value_avg: (buy + sell) / 2, value_sell: sell, value_buy: buy }, last_update: '2026-11-10T12:00:50.000000-03:00' });

const guardado = async () => (await db.query("SELECT valor FROM ajustes WHERE clave = 'cotizacion'")).rows[0]?.valor || null;
const poner = (v) => db.query(
  "INSERT INTO ajustes (clave, valor, actualizado) VALUES ('cotizacion', $1::jsonb, now()) ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor",
  [JSON.stringify(v)]);
const borrar = () => db.query("DELETE FROM ajustes WHERE clave = 'cotizacion'");

let reloj = Date.parse('2026-11-11T15:00:00Z');
const auth = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
const adm = (p, opts = {}) => fetch(BASE + A + '/api' + p, { ...opts, headers: { authorization: auth, ...(opts.headers || {}) } });
const admPost = (p, body, { method = 'POST', headers = {} } = {}) => adm(p, {
  method, body: JSON.stringify(body ?? {}), headers: { 'content-type': 'application/json', 'x-sr-admin': '1', origin: BASE, ...headers },
});

before(async () => {
  tmpData = await fs.mkdtemp(path.join(os.tmpdir(), 'srcot-data-'));
  instance = await start({
    port: 0, host: '127.0.0.1', databaseUrl: DATABASE_URL, adminPath: A, adminUser: USER, adminPassword: PASS,
    ipHashSalt: 'sal-de-prueba', siteUrl: 'https://sexyrose.test', dataDir: tmpData,
    log: () => {}, tareaPlanes: false, tareaCotizacion: false,
    telegramToken: '', telegramChatId: '', mailgunApiKey: '',
    cotizacionFetch: fakeFetch, cotizacionNow: () => reloj,
  });
  BASE = `http://127.0.0.1:${instance.port}`;
  await instance.ready;
});
after(async () => {
  await borrar();
  await instance?.close();
  await db.end();
  if (tmpData) await fs.rm(tmpData, { recursive: true, force: true });
});
beforeEach(async () => { await borrar(); fuentes.a = null; fuentes.b = null; llamadas.length = 0; });

describe('lectura de las fuentes', () => {
  test('DolarApi y Bluelytics se parsean y se validan (100 < x < 100000)', () => {
    assert.deepEqual(parseDolarApi(dolarApi(1535, 1555)), { compra: 1535, venta: 1555, fechaFuente: '2026-11-10T20:59:00.000Z', fuente: 'DolarApi' });
    const b = parseBluelytics(bluelytics(1522, 1555));
    assert.equal(b.compra, 1522); assert.equal(b.venta, 1555); assert.equal(b.fuente, 'Bluelytics');
    assert.equal(b.fechaFuente, '2026-11-10T15:00:50.000Z');
    assert.equal(parseDolarApi(dolarApi(50, 1555)), null);
    assert.equal(parseDolarApi(dolarApi(1535, 'x')), null);
    assert.equal(parseDolarApi(dolarApi(1535, 200000)), null);
    assert.equal(parseBluelytics({ blue: {} }), null);
    assert.equal(parseDolarApi(null), null);
  });
  test('el formato viejo {arsPorUsd, fecha, nota} se lee como manual', () => {
    const c = normalizar({ arsPorUsd: 1450, fecha: '2026-11-01T10:00:00Z', nota: 'Blue venta' });
    assert.equal(c.modo, 'manual'); assert.equal(c.arsPorUsd, 1450); assert.equal(c.fuente, 'manual'); assert.equal(c.valor, 'venta');
    assert.equal(normalizar(null).modo, 'auto');
  });
});

describe('actualización automática', () => {
  const nueva = (extra = {}) => {
    const avisos = [];
    const cot = createCotizacion({ pool: db, fetchImpl: fakeFetch, notify: async (t) => { avisos.push(t); }, now: () => reloj, ...extra });
    return { cot, avisos };
  };

  test('DolarApi responde: se aplica venta, con fuente y fechas; UA sin datos personales', async () => {
    fuentes.a = dolarApi(1535, 1555);
    const { cot } = nueva();
    const r = await cot.actualizar();
    assert.equal(r.actualizada, true);
    const g = await guardado();
    assert.equal(g.modo, 'auto'); assert.equal(g.valor, 'venta');
    assert.equal(g.arsPorUsd, 1555); assert.equal(g.compra, 1535); assert.equal(g.venta, 1555);
    assert.equal(g.fuente, 'DolarApi'); assert.equal(g.fechaFuente, '2026-11-10T20:59:00.000Z');
    assert.equal(g.fecha, new Date(reloj).toISOString()); assert.equal(g.alerta, null);
    assert.equal(llamadas.length, 1);
    assert.equal(llamadas[0].ua, 'SexyRose/1.0');
  });

  test('DolarApi falla (error o HTTP 500 o JSON raro): usa Bluelytics', async () => {
    const { cot } = nueva();
    for (const malo of ['error', 500, { compra: 'x' }]) {
      await borrar(); llamadas.length = 0;
      fuentes.a = malo; fuentes.b = bluelytics(1522, 1560);
      const r = await cot.actualizar();
      assert.equal(r.actualizada, true, String(malo));
      const g = await guardado();
      assert.equal(g.fuente, 'Bluelytics'); assert.equal(g.arsPorUsd, 1560); assert.equal(g.compra, 1522);
      assert.deepEqual(llamadas.map((x) => x.url), [COTIZACION_URL, COTIZACION_FALLBACK_URL]);
    }
  });

  test('las dos fallan: queda la anterior y no rompe', async () => {
    await poner({ modo: 'auto', valor: 'venta', arsPorUsd: 1500, compra: 1480, venta: 1500, fuente: 'DolarApi', fechaFuente: '2026-11-09T12:00:00Z', fecha: '2026-11-09T12:00:00Z', alerta: null, nota: '' });
    fuentes.a = 'error'; fuentes.b = 503;
    const { cot } = nueva();
    const r = await cot.actualizar();
    assert.equal(r.actualizada, false);
    assert.match(r.error, /No se pudo consultar/);
    const g = await guardado();
    assert.equal(g.arsPorUsd, 1500); assert.equal(g.fecha, '2026-11-09T12:00:00Z');
  });

  test('salto de más de 25 %: no se aplica, queda alerta y avisa una sola vez', async () => {
    await poner({ modo: 'auto', valor: 'venta', arsPorUsd: 1500, compra: 1480, venta: 1500, fuente: 'DolarApi', fechaFuente: '2026-11-09T12:00:00Z', fecha: '2026-11-09T12:00:00Z', alerta: null, nota: '' });
    fuentes.a = dolarApi(2000, 2100);
    const { cot, avisos } = nueva();
    let r = await cot.actualizar();
    assert.equal(r.actualizada, false);
    let g = await guardado();
    assert.equal(g.arsPorUsd, 1500);
    assert.equal(g.venta, 2100);
    assert.match(g.alerta, /25 %/);
    r = await cot.actualizar();
    assert.equal(avisos.length, 1, 'mismo salto: un solo aviso');
    assert.match(avisos[0], /25 %/);
    // Dentro del margen (+20 %): se aplica y se limpia la alerta.
    fuentes.a = dolarApi(1780, 1800);
    r = await cot.actualizar();
    assert.equal(r.actualizada, true);
    g = await guardado();
    assert.equal(g.arsPorUsd, 1800); assert.equal(g.alerta, null);
  });

  test('modo manual: el valor en uso no cambia, pero guarda compra/venta de referencia', async () => {
    await poner({ arsPorUsd: 1450, fecha: '2026-11-09T12:00:00Z', nota: 'a mano' }); // formato viejo
    fuentes.a = dolarApi(1535, 1555);
    const { cot } = nueva();
    const r = await cot.actualizar();
    assert.equal(r.actualizada, false);
    const g = await guardado();
    assert.equal(g.modo, 'manual'); assert.equal(g.arsPorUsd, 1450); assert.equal(g.fuente, 'manual');
    assert.equal(g.compra, 1535); assert.equal(g.venta, 1555); assert.equal(g.fuenteBlue, 'DolarApi');
    assert.equal(g.nota, 'a mano');
  });

  test('compra/venta: con valor compra usa la compra', async () => {
    await poner({ modo: 'auto', valor: 'compra' });
    fuentes.a = dolarApi(1535, 1555);
    const { cot } = nueva();
    await cot.actualizar();
    assert.equal((await guardado()).arsPorUsd, 1535);
  });

  test('tarea periódica: arranca cuando la base está lista y se detiene', async () => {
    fuentes.a = dolarApi(1535, 1555);
    const { cot } = nueva();
    let listo = false;
    cot.iniciarTarea({ listo: () => listo, intervaloMs: 60 * 60 * 1000 });
    await new Promise((r) => setTimeout(r, 2300));
    assert.equal(llamadas.length, 0, 'no consulta antes de que la base esté lista');
    listo = true;
    await new Promise((r) => setTimeout(r, 2300));
    cot.detenerTarea();
    assert.equal(llamadas.length, 1);
    assert.equal((await guardado()).arsPorUsd, 1555);
  });

  test('sin fetch (tests sin inyectar) no consulta nada', async () => {
    const cot = createCotizacion({ pool: db, fetchImpl: null });
    // En `node --test` el fetch global queda deshabilitado solo en server.js; acá se prueba la ruta sin red.
    cot.iniciarTarea();
    cot.detenerTarea();
    assert.equal(llamadas.length, 0);
  });
});

describe('validación del admin', () => {
  test('formatos aceptados y rechazados', () => {
    assert.deepEqual(validarCotizacionV2({ arsPorUsd: 1450, nota: 'Blue venta' }).valor, { modo: 'manual', valor: undefined, arsPorUsd: 1450, nota: 'Blue venta' });
    assert.equal(validarCotizacionV2({ modo: 'auto' }).valor.modo, 'auto');
    assert.equal(validarCotizacionV2({ modo: 'auto', valor: 'compra' }).valor.valor, 'compra');
    assert.ok(validarCotizacionV2({ arsPorUsd: -1 }).error);
    assert.ok(validarCotizacionV2({ modo: 'manual', arsPorUsd: 'abc' }).error);
    assert.ok(validarCotizacionV2({ modo: 'otro' }).error);
    assert.ok(validarCotizacionV2({ modo: 'auto', valor: 'promedio' }).error);
    assert.ok(validarCotizacionV2([1]).error);
    assert.equal(validarCotizacionV2({ modo: 'manual', arsPorUsd: '' }).valor.arsPorUsd, null);
  });
});

describe('endpoints del admin', () => {
  test('requieren Basic Auth y el header del admin', async () => {
    assert.equal((await fetch(BASE + A + '/api/cotizacion/actualizar', { method: 'POST' })).status, 401);
    let r = await adm('/cotizacion/actualizar', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json', origin: BASE } });
    assert.notEqual(r.status, 200);
    r = await adm('/ajustes/cotizacion', { method: 'PUT', body: JSON.stringify({ valor: { modo: 'auto' } }), headers: { 'content-type': 'application/json', origin: BASE } });
    assert.notEqual(r.status, 200);
    assert.equal(llamadas.length, 0);
  });

  test('PUT: validación, manual, pasar a automático actualiza al toque, GET expone el formato nuevo', async () => {
    let r = await admPost('/ajustes/cotizacion', { valor: { arsPorUsd: -1 } }, { method: 'PUT' });
    assert.equal(r.status, 400);
    r = await admPost('/ajustes/cotizacion', { valor: { modo: 'raro' } }, { method: 'PUT' });
    assert.equal(r.status, 400);
    r = await admPost('/ajustes/cotizacion', {}, { method: 'PUT' });
    assert.equal(r.status, 400);
    // Formato viejo: queda manual con el valor cargado.
    r = await admPost('/ajustes/cotizacion', { valor: { arsPorUsd: 1450, nota: 'Blue venta' } }, { method: 'PUT' });
    assert.equal(r.status, 200);
    let j = await r.json();
    assert.equal(j.valor.modo, 'manual'); assert.equal(j.valor.arsPorUsd, 1450); assert.ok(j.valor.fecha);
    assert.equal(llamadas.length, 0);
    // A automático: consulta DolarApi en el momento.
    fuentes.a = dolarApi(1535, 1555);
    r = await admPost('/ajustes/cotizacion', { valor: { modo: 'auto', valor: 'venta', nota: '' } }, { method: 'PUT' });
    assert.equal(r.status, 200);
    j = await r.json();
    assert.equal(j.valor.modo, 'auto'); assert.equal(j.valor.arsPorUsd, 1555); assert.equal(j.valor.fuente, 'DolarApi');
    assert.equal(llamadas.length, 1);
    // Cambiar a compra aplica la compra.
    r = await admPost('/ajustes/cotizacion', { valor: { modo: 'auto', valor: 'compra' } }, { method: 'PUT' });
    j = await r.json();
    assert.equal(j.valor.valor, 'compra'); assert.equal(j.valor.arsPorUsd, 1535);
    const all = await (await adm('/ajustes')).json();
    assert.equal(all.cotizacion.modo, 'auto'); assert.equal(all.cotizacion.valor, 'compra'); assert.equal(all.cotizacion.arsPorUsd, 1535);
    // La cotización no es pública.
    const est = await (await fetch(BASE + '/api/sitio/estado')).json();
    assert.equal(JSON.stringify(est).includes('cotizacion'), false);
  });

  test('Actualizar ahora: devuelve la cotización nueva y como máximo una vez cada 5 minutos', async () => {
    reloj += 60 * 60 * 1000;
    await poner({ modo: 'auto', valor: 'venta', arsPorUsd: 1500 });
    fuentes.a = dolarApi(1535, 1555);
    let r = await admPost('/cotizacion/actualizar', {});
    assert.equal(r.status, 200);
    let j = await r.json();
    assert.equal(j.actualizada, true); assert.equal(j.cotizacion.arsPorUsd, 1555); assert.equal(j.cotizacion.fuente, 'DolarApi');
    r = await admPost('/cotizacion/actualizar', {});
    assert.equal(r.status, 429);
    assert.match((await r.json()).error, /min/);
    reloj += 5 * 60 * 1000 + 1;
    // Con alerta por salto, el admin lo puede forzar con «Actualizar ahora».
    await poner({ ...(await guardado()), alerta: 'x' });
    fuentes.a = dolarApi(2400, 2500);
    r = await admPost('/cotizacion/actualizar', {});
    j = await r.json();
    assert.equal(j.actualizada, true); assert.equal(j.cotizacion.arsPorUsd, 2500); assert.equal(j.cotizacion.alerta, null);
  });

  test('Pedidos usa la cotización automática para el monto en pesos', async () => {
    await poner({ modo: 'auto', valor: 'venta', arsPorUsd: 1555, fuente: 'DolarApi', fechaFuente: '2026-11-10T20:59:00.000Z', fecha: new Date().toISOString() });
    const j = await (await adm('/pedidos-creditos')).json();
    assert.equal(j.cotizacion.arsPorUsd, 1555);
    assert.equal(j.cotizacion.fuente, 'DolarApi');
  });
});
