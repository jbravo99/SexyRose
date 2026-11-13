// Pruebas de planes (Planes v2): 4 planes pagados con créditos, subidas, semanas, cupo Star, pedidos viejos por
// transferencia (historial), vencimientos y API del admin.
//   DATABASE_URL_B=postgres://postgres@localhost:55432/srtestB node --test test/fase1-planes.test.js
// Aplica todos los db/*.sql (como el servidor) antes de arrancar.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { start } from '../server.js';
import { nuevaReferencia, mezclarPrecios, validarPrecios, semanaDeMes, PRECIOS_DEFAULT } from '../lib/planes.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '..');
const DATABASE_URL = process.env.DATABASE_URL_B || process.env.DATABASE_URL || 'postgres://postgres@localhost:55432/srtestB';
const db = new pg.Pool({ connectionString: DATABASE_URL, max: 3 });
const A = '/panel-pruebas-fase1-b-0123456789';
const USER = 'admin-b';
const PASS = 'clave-de-prueba-larga-123';
const mails = [];
let instance; let BASE; let tmpData;

const auth = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
const adm = (p, opts = {}) => fetch(BASE + A + '/api' + p, { ...opts, headers: { authorization: auth, ...(opts.headers || {}) } });
const admPost = (p, body, { method = 'POST', headers = {} } = {}) => adm(p, {
  method, body: JSON.stringify(body ?? {}),
  headers: { 'content-type': 'application/json', 'x-sr-admin': '1', origin: BASE, ...headers },
});
const cta = (cuentaId, p, opts = {}) => fetch(BASE + '/api/cuenta' + p, { ...opts, headers: { 'x-test-cuenta': cuentaId, ...(opts.headers || {}) } });
const ctaPost = (cuentaId, p, body, headers = {}) => cta(cuentaId, p, {
  method: 'POST', body: JSON.stringify(body ?? {}),
  headers: { 'content-type': 'application/json', 'x-sr': '1', origin: BASE, ...headers },
});

async function aplicarEsquema() {
  const leer = (f) => fs.readFile(path.join(APP, f), 'utf8');
  await db.query(await leer('db/schema.sql'));
  await db.query(await leer('db/010-cuentas.sql'));
  await db.query(await leer('db/020-planes.sql'));
  await db.query('TRUNCATE avisos_plan, suscripciones, pedidos RESTART IDENTITY CASCADE');
  for (const f of (await fs.readdir(path.join(APP, 'db'))).filter((x) => /^\d+-.*\.sql$/.test(x)).sort()) await db.query(await leer('db/' + f));
  await db.query("DELETE FROM cuentas WHERE email LIKE 'zzb-%'");
  await db.query("DELETE FROM ajustes WHERE clave IN ('precios', 'transferencia', 'portada', 'promo')");
  await db.query("DELETE FROM ubicaciones WHERE id LIKE 'zzb-%'");
  await db.query("DELETE FROM categorias WHERE id LIKE 'zzb-%'");
  await db.query("DELETE FROM intereses WHERE id LIKE 'zzb-%'");
}

let n = 0;
async function nuevaCuenta({ provincia = 'Zzb Provincia', estado = 'borrador', verificacion = 'sin_enviar', datos = {} } = {}) {
  const email = `zzb-${Date.now()}-${n++}-${crypto.randomBytes(3).toString('hex')}@example.com`;
  const { rows } = await db.query('INSERT INTO cuentas (email, pass_hash) VALUES ($1, $2) RETURNING id', [email, 'x']);
  const id = rows[0].id;
  await db.query('INSERT INTO perfiles (cuenta_id, slug, datos, estado, verificacion) VALUES ($1, $2, $3, $4, $5)',
    [id, 'zzb-' + id.slice(0, 8), JSON.stringify({ displayName: 'Prueba ' + n, provincia, ciudad: 'Zzb Ciudad', ...datos }), estado, verificacion]);
  return { id, email };
}
const ultimoMail = (email) => [...mails].reverse().find((m) => m.to === email);
// Carga créditos con un ajuste del admin (como hace el admin a mano).
async function cargar(cuentaId, creditos) {
  const r = await admPost(`/creditos/${cuentaId}/ajuste`, { creditos, motivo: 'Carga de prueba' });
  assert.equal(r.status, 200, await r.clone().text());
}
// Saldo = suma de movimientos = fila de creditos_cuentas, y saldo_despues del último movimiento.
async function invariante(cuentaId) {
  const { rows: [x] } = await db.query(
    `SELECT COALESCE((SELECT sum(centavos) FROM creditos_movimientos WHERE cuenta_id = $1), 0)::bigint AS suma,
            COALESCE((SELECT centavos FROM creditos_cuentas WHERE cuenta_id = $1), 0)::bigint AS fila,
            COALESCE((SELECT saldo_despues FROM creditos_movimientos WHERE cuenta_id = $1 ORDER BY id DESC LIMIT 1), 0)::bigint AS ultimo`, [cuentaId]);
  assert.equal(x.suma, x.fila);
  assert.equal(x.suma, x.ultimo);
}

before(async () => {
  await aplicarEsquema();
  tmpData = await fs.mkdtemp(path.join(os.tmpdir(), 'srb-data-'));
  instance = await start({ prelanzamientoPorDefecto: false,
    port: 0, host: '127.0.0.1', databaseUrl: DATABASE_URL, adminPath: A, adminUser: USER, adminPassword: PASS,
    ipHashSalt: 'sal-de-prueba', siteUrl: 'https://sexyrose.test', dataDir: tmpData,
    log: () => {}, tareaPlanes: false,
    sendMail: async (m) => { mails.push(m); },
    requireCuenta: (req, res, next) => {
      const id = req.get('x-test-cuenta');
      if (!id) return res.status(401).json({ error: 'Iniciá sesión.' });
      req.cuenta = { id };
      next();
    },
  });
  BASE = `http://127.0.0.1:${instance.port}`;
  await instance.ready;
});

after(async () => {
  await instance?.close();
  await db.query("DELETE FROM cuentas WHERE email LIKE 'zzb-%'");
  await db.end();
  if (tmpData) await fs.rm(tmpData, { recursive: true, force: true });
});

describe('precios y utilidades', () => {
  test('referencias cortas sin caracteres ambiguos (pedidos viejos)', () => {
    for (let i = 0; i < 200; i++) assert.match(nuevaReferencia(), /^SR-[A-HJ-KMNP-Z2-9]{4}$/);
  });
  test('defaults v2, mezcla y validación', async () => {
    assert.deepEqual(PRECIOS_DEFAULT.mes, { E: 0, D: 35, C: 90, S: 350 });
    assert.deepEqual(PRECIOS_DEFAULT.semana, { C: 27, S: 105 });
    assert.deepEqual(mezclarPrecios(null), { mes: { ...PRECIOS_DEFAULT.mes }, semana: { ...PRECIOS_DEFAULT.semana }, semanaAuto: { activo: true, recargo: 20 } });
    assert.equal(mezclarPrecios({ mes: { D: 25, Z: 9 }, semana: { C: -1 } }).mes.D, 25);
    assert.equal(mezclarPrecios({ semana: { C: -1 } }).semana.C, 27);
    // los B/A viejos se ignoran
    const viejo = mezclarPrecios({ mes: { E: 0, D: 20, C: 45, B: 70, A: 150, S: 350 }, semana: { B: 21, A: 45, S: 105 } });
    assert.deepEqual(Object.keys(viejo.mes), ['E', 'D', 'C', 'S']);
    assert.deepEqual(Object.keys(viejo.semana), ['C', 'S']);
    assert.ok(validarPrecios({ mes: { E: 0, D: 35, C: 90, S: 350 }, semana: { C: 27, S: 105 } }).valor);
    assert.match(validarPrecios({ mes: { E: 0, D: 35, C: 90, B: 1, S: 350 }, semana: { C: 27, S: 105 } }).error, /desconocido/);
    assert.match(validarPrecios({ mes: { E: 0, D: 35, C: 90, S: 350 }, semana: { C: 27, S: 105, D: 1 } }).error, /desconocido/);
    assert.ok(validarPrecios({ mes: { E: 0, D: 'x', C: 90, S: 350 }, semana: { C: 27, S: 105 } }).error);
    assert.match(validarPrecios({ mes: { E: 0, D: 95, C: 90, S: 350 }, semana: { C: 27, S: 105 } }).error, /subir con el plan/);
    assert.match(validarPrecios({ mes: { E: 5, D: 35, C: 90, S: 350 }, semana: { C: 27, S: 105 } }).error, /gratis/);
  });
  test('semana calculada sola: mes / 4 + recargo, o a mano', () => {
    // Los defaults ya cumplen la regla del 20 %
    assert.equal(semanaDeMes(90, 20), 27); assert.equal(semanaDeMes(350, 20), 105); assert.equal(semanaDeMes(95, 20), 28.5);
    // Prendida: lo que venga en "semana" se ignora y se calcula
    let v = validarPrecios({ mes: { E: 0, D: 40, C: 100, S: 400 }, semana: { C: 1, S: 1 }, semanaAuto: { activo: true, recargo: 25 } }).valor;
    assert.deepEqual(v.semana, { C: 31.25, S: 125 }); assert.deepEqual(v.semanaAuto, { activo: true, recargo: 25 });
    assert.deepEqual(mezclarPrecios(v).semana, { C: 31.25, S: 125 });
    // Cambiar solo el mes en lo guardado (prendida) recalcula la semana al leer
    assert.deepEqual(mezclarPrecios({ ...v, mes: { ...v.mes, C: 120 } }).semana, { C: 37.5, S: 125 });
    // Apagada: quedan las semanas escritas a mano
    v = validarPrecios({ mes: { E: 0, D: 40, C: 100, S: 400 }, semana: { C: 33, S: 110 }, semanaAuto: { activo: false, recargo: 20 } }).valor;
    assert.deepEqual(mezclarPrecios(v).semana, { C: 33, S: 110 });
    // Precios guardados antes de esto (sin semanaAuto): apagada, no cambia nada de lo que Juan tenía
    const antes = mezclarPrecios({ mes: { E: 0, D: 35, C: 90, S: 350 }, semana: { C: 30, S: 100 } });
    assert.deepEqual(antes.semana, { C: 30, S: 100 }); assert.equal(antes.semanaAuto.activo, false);
    assert.deepEqual(validarPrecios({ mes: { E: 0, D: 35, C: 90, S: 350 }, semana: { C: 30, S: 100 } }).valor.semanaAuto, { activo: false, recargo: 20 });
    // Validación
    assert.match(validarPrecios({ mes: { E: 0, D: 35, C: 90, S: 350 }, semana: { C: 27, S: 105 }, semanaAuto: { activo: true, recargo: 500 } }).error, /recargo/);
    assert.match(validarPrecios({ mes: { E: 0, D: 35, C: 90, S: 350 }, semana: { C: 27, S: 105 }, semanaAuto: 'si' }).error, /semana calculada/);
  });
  test('GET /api/cuenta/planes: 4 planes, límites, saldo y sin datos bancarios', async () => {
    const c = await nuevaCuenta();
    let r = await cta(c.id, '/planes');
    assert.equal(r.status, 200);
    let j = await r.json();
    assert.equal(j.efectivo, 'E');
    assert.deepEqual(j.precios.mes, { E: 0, D: 35, C: 90, S: 350 });
    assert.deepEqual(j.precios.semana, { C: 27, S: 105 });
    assert.deepEqual(j.planes.map((p) => p.codigo), ['E', 'D', 'C', 'S']);
    const P = Object.fromEntries(j.planes.map((p) => [p.codigo, p]));
    assert.equal(P.D.semana, null);
    assert.equal(P.C.semana, 27);
    assert.deepEqual(P.E.limites, { fotos: 8, videos: 2, historiasDia: 1, destacadas: 1, packs: 0 });
    assert.deepEqual(P.D.limites, { fotos: 30, videos: 10, historiasDia: 3, destacadas: 2, packs: 1 });
    assert.deepEqual(P.C.limites, { fotos: 500, videos: 200, historiasDia: null, destacadas: 5, packs: 5 });
    assert.deepEqual(P.S.limites, { fotos: 1000, videos: 500, historiasDia: null, destacadas: null, packs: null });
    assert.deepEqual(j.planes.map((p) => p.preview), [false, true, true, true]);
    assert.deepEqual(P.D.destacado, { dia: 2, semana: 9 });
    assert.equal(P.S.destacado, null);
    assert.equal(P.S.cupoProvincia, 10);
    assert.deepEqual(j.saldo, { centavos: 0, creditos: '0.00' });
    assert.equal(j.base, null);
    assert.equal(j.pausa, null);
    assert.equal(j.cupoStar.libres, 10);
    assert.ok(!('transferencia' in j));
    const precios = { mes: { E: 0, D: 36, C: 90, S: 350 }, semana: { C: 27, S: 105 } };
    assert.equal((await admPost('/ajustes/precios', { valor: precios }, { method: 'PUT' })).status, 200);
    assert.equal((await admPost('/ajustes/transferencia', { valor: 'Alias: X' }, { method: 'PUT' })).status, 404);
    j = await (await cta(c.id, '/planes')).json();
    assert.equal(j.precios.mes.D, 36);
    await admPost('/ajustes/precios', { valor: { mes: { ...PRECIOS_DEFAULT.mes }, semana: { ...PRECIOS_DEFAULT.semana } } }, { method: 'PUT' });
    assert.equal((await cta('', '/planes')).status, 401);
  });
});

describe('comprar planes con créditos', () => {
  test('validaciones, saldo insuficiente y reglas de POST', async () => {
    const c = await nuevaCuenta();
    const err = async (body, status, re, codigo) => {
      const r = await ctaPost(c.id, '/plan/comprar', body);
      assert.equal(r.status, status, JSON.stringify(body));
      const j = await r.json();
      assert.match(j.error, re);
      if (codigo) assert.equal(j.codigo, codigo);
      return j;
    };
    await err({ plan: 'E', periodo: 'mes' }, 400, /gratis/);
    await err({ plan: 'D', periodo: 'semana' }, 400, /por semana: solo Oro y Star/);
    await err({ plan: 'B', periodo: 'mes' }, 400, /plan válido/);
    await err({ plan: 'A', periodo: 'semana' }, 400, /plan válido/);
    await err({ plan: 'C', periodo: 'dia' }, 400, /mes o por semana/);
    const j = await err({ plan: 'D', periodo: 'mes' }, 402, /No te alcanzan/, 'saldo_insuficiente');
    assert.deepEqual(j.faltan, { centavos: 3500, creditos: '35.00' });
    // los pedidos por transferencia ya no existen
    let r = await ctaPost(c.id, '/pedidos', { plan: 'D', periodo: 'mes' });
    assert.equal(r.status, 410);
    assert.match((await r.json()).error, /créditos/);
    // reglas de POST
    let x = await cta(c.id, '/plan/comprar', { method: 'POST', body: '{"plan":"C","periodo":"mes"}', headers: { 'content-type': 'application/json', origin: BASE } });
    assert.equal(x.status, 403);
    x = await cta(c.id, '/plan/comprar', { method: 'POST', body: '{"plan":"C","periodo":"mes"}', headers: { 'content-type': 'application/json', 'x-sr': '1', origin: 'https://evil.example' } });
    assert.equal(x.status, 403);
    x = await cta(c.id, '/plan/comprar', { method: 'POST', body: 'plan=C', headers: { 'content-type': 'text/plain', 'x-sr': '1', origin: BASE } });
    assert.equal(x.status, 415);
    r = await cta(c.id, '/plan/cotizar?plan=D&periodo=mes');
    const q = await r.json();
    assert.equal(q.tipo, 'nuevo');
    assert.equal(q.alcanza, false);
    assert.equal(q.costo.creditos, '35.00');
  });

  test('alta, renovación anticipada y movimientos del libro', async () => {
    const c = await nuevaCuenta();
    await cargar(c.id, 105);
    let r = await ctaPost(c.id, '/plan/comprar', { plan: 'D', periodo: 'mes' });
    assert.equal(r.status, 201);
    let j = await r.json();
    assert.equal(j.tipo, 'nuevo');
    assert.equal(j.plan, 'D');
    assert.equal(j.saldo.creditos, '70.00');
    assert.equal(j.suscripcion.renovacionAuto, true);
    assert.equal(j.suscripcion.origen, 'creditos');
    assert.ok(Math.abs((new Date(j.suscripcion.hasta) - new Date(j.suscripcion.desde)) / 86400000 - 30) < 0.01);
    const s1 = j.suscripcion;
    r = await ctaPost(c.id, '/plan/comprar', { plan: 'D', periodo: 'mes' });
    j = await r.json();
    assert.equal(j.tipo, 'renovacion_anticipada');
    assert.equal(new Date(j.suscripcion.desde).getTime(), new Date(s1.hasta).getTime());
    assert.equal(j.saldo.creditos, '35.00');
    const pl = await (await cta(c.id, '/planes')).json();
    assert.equal(pl.efectivo, 'D');
    assert.equal(pl.base.plan, 'D');
    assert.equal(new Date(pl.base.hasta).getTime(), new Date(j.suscripcion.hasta).getTime());
    assert.equal(pl.base.proximaRenovacion.costo.creditos, '35.00');
    assert.equal(pl.base.proximaRenovacion.alcanza, true);
    const cr = await (await cta(c.id, '/creditos')).json();
    assert.equal(cr.saldo.centavos, 3500);
    assert.deepEqual(cr.movimientos.map((m) => [m.tipo, m.centavos]), [['renovacion_plan', -3500], ['renovacion_plan', -3500], ['ajuste_admin', 10500]]);
    assert.equal(cr.movimientos[0].saldoDespues.creditos, '35.00');
    await invariante(c.id);
  });

  test('subida prorrateada, bajar solo programado y renovación on/off', async () => {
    const c = await nuevaCuenta();
    await cargar(c.id, 100);
    await ctaPost(c.id, '/plan/comprar', { plan: 'D', periodo: 'mes' });
    // pasaron 15 días: quedan 15
    await db.query("UPDATE suscripciones SET desde = desde - interval '15 days', hasta = hasta - interval '15 days' WHERE cuenta_id = $1", [c.id]);
    const hastaVieja = (await db.query("SELECT hasta FROM suscripciones WHERE cuenta_id = $1 AND estado = 'activa'", [c.id])).rows[0].hasta;
    let q = await (await cta(c.id, '/plan/cotizar?plan=C&periodo=mes')).json();
    assert.equal(q.tipo, 'subida');
    assert.equal(q.planAnterior, 'D');
    assert.equal(q.costo.centavos, 2750); // (90 − 35) × 15 / 30
    assert.equal(q.diasRestantes, 15);
    let r = await ctaPost(c.id, '/plan/comprar', { plan: 'C', periodo: 'mes' });
    assert.equal(r.status, 201);
    let j = await r.json();
    assert.equal(j.tipo, 'subida');
    assert.equal(j.plan, 'C');
    assert.equal(new Date(j.suscripcion.hasta).getTime(), new Date(hastaVieja).getTime());
    assert.equal(j.saldo.centavos, 10000 - 3500 - 2750);
    const vieja = await db.query("SELECT estado, nota FROM suscripciones WHERE cuenta_id = $1 AND plan = 'D'", [c.id]);
    assert.equal(vieja.rows[0].estado, 'cancelada');
    assert.match(vieja.rows[0].nota, /pasó a Oro/);
    // bajar a Plata: no se compra, se programa
    r = await ctaPost(c.id, '/plan/comprar', { plan: 'D', periodo: 'mes' });
    assert.equal(r.status, 409);
    assert.equal((await r.json()).codigo, 'usar_cambio_programado');
    r = await ctaPost(c.id, '/plan/cambio', { plan: 'S' });
    assert.equal(r.status, 409);
    assert.equal((await r.json()).codigo, 'usar_subida');
    r = await cta(c.id, '/plan/cambio', { method: 'PUT', body: JSON.stringify({ plan: 'D' }), headers: { 'content-type': 'application/json', 'x-sr': '1', origin: BASE } });
    assert.equal(r.status, 200);
    j = await r.json();
    assert.equal(j.cambioProgramado, 'D');
    assert.equal(j.base.proximaRenovacion.plan, 'D');
    assert.equal(j.base.proximaRenovacion.costo.creditos, '35.00');
    r = await cta(c.id, '/plan/renovacion', { method: 'PUT', body: JSON.stringify({ activa: false }), headers: { 'content-type': 'application/json', 'x-sr': '1', origin: BASE } });
    assert.equal(r.status, 200);
    j = await r.json();
    assert.equal(j.renovacionAuto, false);
    assert.equal(j.base.proximaRenovacion, null);
    assert.equal((await ctaPost(c.id, '/plan/renovacion', { activa: 'si' })).status, 400);
    assert.equal((await ctaPost(c.id, '/plan/cambio', { plan: null })).status, 200);
    const sin = await nuevaCuenta();
    assert.equal((await ctaPost(sin.id, '/plan/renovacion', { activa: true })).status, 409);
    await invariante(c.id);
  });

  test('semana: Bronce → semana; Plata → subida temporal de 7 días; no sirve para el mismo plan', async () => {
    const b = await nuevaCuenta();
    await cargar(b.id, 54);
    let j = await (await ctaPost(b.id, '/plan/comprar', { plan: 'C', periodo: 'semana' })).json();
    assert.equal(j.tipo, 'semana');
    assert.equal(j.costo.creditos, '27.00');
    assert.equal(j.plan, 'C');
    const s1 = j.suscripcion;
    assert.equal(s1.renovacionAuto, false);
    assert.ok(Math.abs((new Date(s1.hasta) - new Date(s1.desde)) / 86400000 - 7) < 0.01);
    // segunda semana se apila
    j = await (await ctaPost(b.id, '/plan/comprar', { plan: 'C', periodo: 'semana' })).json();
    assert.equal(new Date(j.suscripcion.desde).getTime(), new Date(s1.hasta).getTime());
    const mov = await db.query('SELECT tipo FROM creditos_movimientos WHERE cuenta_id = $1 AND centavos < 0', [b.id]);
    assert.deepEqual(mov.rows.map((x) => x.tipo), ['semana', 'semana']);

    const p = await nuevaCuenta();
    await cargar(p.id, 35 + 105);
    await ctaPost(p.id, '/plan/comprar', { plan: 'D', periodo: 'mes' });
    j = await (await ctaPost(p.id, '/plan/comprar', { plan: 'S', periodo: 'semana' })).json();
    assert.equal(j.tipo, 'subida_temporal');
    assert.equal(j.plan, 'S');
    const pl = await (await cta(p.id, '/planes')).json();
    assert.equal(pl.efectivo, 'S');
    assert.equal(pl.base.plan, 'D');
    assert.equal(pl.semanas.length, 1);
    // pasan los 7 días: vuelve a Plata
    await db.query("UPDATE suscripciones SET desde = desde - interval '8 days', hasta = hasta - interval '8 days' WHERE id = $1", [j.suscripcion.id]);
    assert.equal((await (await cta(p.id, '/planes')).json()).efectivo, 'D');
    const o = await nuevaCuenta();
    await cargar(o.id, 200);
    await ctaPost(o.id, '/plan/comprar', { plan: 'C', periodo: 'mes' });
    const r = await ctaPost(o.id, '/plan/comprar', { plan: 'C', periodo: 'semana' });
    assert.equal(r.status, 409);
    assert.equal((await r.json()).codigo, 'semana_no_sube');
  });

  test('Star exige provincia y cupo (10 por provincia)', async () => {
    const sinProv = await nuevaCuenta({ provincia: '' });
    await cargar(sinProv.id, 400);
    let r = await ctaPost(sinProv.id, '/plan/comprar', { plan: 'S', periodo: 'mes' });
    assert.equal(r.status, 400);
    assert.match((await r.json()).error, /provincia/);
    const prov = 'Zzb Cupo ' + crypto.randomBytes(2).toString('hex');
    for (let i = 0; i < 10; i++) {
      const s = await nuevaCuenta({ provincia: prov });
      await db.query("INSERT INTO suscripciones (cuenta_id, plan, periodo, desde, hasta) VALUES ($1, 'S', 'mes', now() - interval '1 day', now() + interval '20 days')", [s.id]);
    }
    const otra = await nuevaCuenta({ provincia: prov.toUpperCase() + '  ' });
    await cargar(otra.id, 400);
    r = await ctaPost(otra.id, '/plan/comprar', { plan: 'S', periodo: 'semana' });
    assert.equal(r.status, 409);
    const j = await r.json();
    assert.match(j.error, /No quedan lugares Star/);
    assert.equal(j.codigo, 'cupo_star');
    assert.equal((await ctaPost(otra.id, '/plan/comprar', { plan: 'S', periodo: 'mes' })).status, 409);
    assert.equal((await cta(otra.id, '/plan/cotizar?plan=S&periodo=mes')).status, 409);
    assert.equal((await (await cta(otra.id, '/creditos')).json()).saldo.creditos, '400.00'); // no se cobró nada
    const plan = await (await cta(otra.id, '/planes')).json();
    assert.equal(plan.cupoStar.libres, 0);
    const stars = await (await adm('/stars')).json();
    const p = stars.provincias.find((x) => x.provincia.toLowerCase() === prov.toLowerCase());
    assert.equal(p.ocupadas, 10);
    assert.equal(p.libres, 0);
    const libre = await nuevaCuenta({ provincia: 'Zzb Libre ' + crypto.randomBytes(2).toString('hex') });
    await cargar(libre.id, 350);
    r = await ctaPost(libre.id, '/plan/comprar', { plan: 'S', periodo: 'mes' });
    assert.equal(r.status, 201);
    assert.equal((await r.json()).saldo.centavos, 0);
  });

  test('dos compras a la vez no se pasan del saldo', async () => {
    const c = await nuevaCuenta();
    await cargar(c.id, 35);
    const rs = await Promise.all([1, 2, 3].map(() => ctaPost(c.id, '/plan/comprar', { plan: 'D', periodo: 'mes' })));
    assert.deepEqual(rs.map((r) => r.status).sort(), [201, 402, 402]);
    assert.equal((await (await cta(c.id, '/creditos')).json()).saldo.centavos, 0);
    await invariante(c.id);
  });
});

describe('pedidos viejos por transferencia (historial)', () => {
  const pedidoViejo = async (cuentaId, plan = 'C', periodo = 'mes', monto = 45) => {
    const { rows } = await db.query(
      'INSERT INTO pedidos (cuenta_id, plan, periodo, monto_usd, referencia) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [cuentaId, plan, periodo, monto, nuevaReferencia()]);
    return rows[0];
  };

  test('informar con comprobante, confirmar crea suscripción, el admin ve el comprobante', async () => {
    const c = await nuevaCuenta();
    const pedido = await pedidoViejo(c.id);
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), crypto.randomBytes(64)]);
    const fd = new FormData();
    fd.append('nota', 'Transferí desde Banco X');
    fd.append('comprobante', new Blob([png], { type: 'image/png' }), 'comp.png');
    let r = await cta(c.id, `/pedidos/${pedido.id}/informar`, { method: 'POST', body: fd, headers: { 'x-sr': '1', origin: BASE } });
    assert.equal(r.status, 200);
    let j = await r.json();
    assert.equal(j.pedido.estado, 'informado');
    assert.equal(j.pedido.tieneComprobante, true);
    const fd2 = new FormData();
    fd2.append('comprobante', new Blob([Buffer.from('<html>hola</html> no es imagen')], { type: 'image/png' }), 'x.png');
    r = await cta(c.id, `/pedidos/${pedido.id}/informar`, { method: 'POST', body: fd2, headers: { 'x-sr': '1', origin: BASE } });
    assert.equal(r.status, 400);
    const otra = await nuevaCuenta();
    r = await ctaPost(otra.id, `/pedidos/${pedido.id}/informar`, { nota: 'x' });
    assert.equal(r.status, 404);
    const lista = await (await adm('/pedidos?estado=abiertos')).json();
    const item = lista.items.find((x) => x.id === pedido.id);
    assert.ok(item && item.cuenta.email === c.email && item.tieneComprobante);
    r = await adm(`/pedidos/${pedido.id}/comprobante`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await r.arrayBuffer()), png);
    assert.equal((await fetch(BASE + A + `/api/pedidos/${pedido.id}/comprobante`)).status, 401);
    r = await admPost(`/pedidos/${pedido.id}/confirmar`, {});
    assert.equal(r.status, 200);
    j = await r.json();
    assert.equal(j.pedido.estado, 'confirmado');
    assert.equal(j.suscripcion.plan, 'C');
    assert.ok(Math.abs((new Date(j.suscripcion.hasta) - new Date(j.suscripcion.desde)) / 86400000 - 30) < 0.01);
    assert.match(ultimoMail(c.email).subject, /Recibimos tu pago/);
    assert.equal((await admPost(`/pedidos/${pedido.id}/confirmar`, {})).status, 409);
    assert.equal((await (await cta(c.id, '/planes')).json()).efectivo, 'C');
  });

  test('cancelar y rechazar', async () => {
    const c = await nuevaCuenta();
    const p1 = await pedidoViejo(c.id, 'D', 'mes', 20);
    assert.equal((await (await ctaPost(c.id, `/pedidos/${p1.id}/cancelar`, {})).json()).pedido.estado, 'cancelado');
    assert.equal((await ctaPost(c.id, `/pedidos/${p1.id}/cancelar`, {})).status, 409);
    const p2 = await pedidoViejo(c.id, 'D', 'mes', 20);
    const r = await admPost(`/pedidos/${p2.id}/rechazar`, { motivo: 'No llegó la transferencia' });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).pedido.motivo, 'No llegó la transferencia');
    assert.match(ultimoMail(c.email).text, /No llegó la transferencia/);
  });
});

describe('suscripciones y plan efectivo', () => {
  test('plan manual del admin y cancelación', async () => {
    const c = await nuevaCuenta();
    let r = await admPost(`/acompanantes/${c.id}/plan`, { plan: 'C', dias: 400 });
    assert.equal(r.status, 400);
    r = await admPost(`/acompanantes/${c.id}/plan`, { plan: 'E', dias: 10 });
    assert.equal(r.status, 400);
    r = await admPost(`/acompanantes/${c.id}/plan`, { plan: 'A', dias: 10 });
    assert.equal(r.status, 400);
    r = await admPost(`/acompanantes/${c.id}/plan`, { plan: 'C', dias: 10, nota: 'Lanzamiento' });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.plan, 'C');
    assert.equal(j.suscripcion.periodo, 'manual');
    assert.equal(j.suscripcion.origen, 'manual');
    assert.equal(j.suscripcion.renovacionAuto, false);
    assert.match(j.suscripcion.nota, /Lanzamiento · asignado por admin-b/);
    const subs = await (await adm('/suscripciones')).json();
    assert.ok(subs.items.some((s) => s.id === j.suscripcion.id && s.cuenta.email === c.email));
    assert.equal((await admPost(`/suscripciones/${j.suscripcion.id}/cancelar`, {})).status, 200);
    assert.equal((await (await cta(c.id, '/planes')).json()).efectivo, 'E');
  });

  test('tarea de vencimientos: marca vencidas, vence pedidos viejos y avisa una sola vez', async () => {
    const c = await nuevaCuenta();
    const { rows: [s3] } = await db.query("INSERT INTO suscripciones (cuenta_id, plan, periodo, desde, hasta) VALUES ($1, 'C', 'mes', now() - interval '28 days', now() + interval '2 days') RETURNING id", [c.id]);
    const { rows: [sv] } = await db.query("INSERT INTO suscripciones (cuenta_id, plan, periodo, desde, hasta) VALUES ($1, 'D', 'mes', now() - interval '31 days', now() - interval '1 hour') RETURNING id", [c.id]);
    const { rows: [pv] } = await db.query("INSERT INTO pedidos (cuenta_id, plan, periodo, monto_usd, referencia, creado) VALUES ($1, 'D', 'mes', 20, $2, now() - interval '8 days') RETURNING id", [c.id, 'SR-T' + crypto.randomBytes(3).toString('hex')]);
    // renovación apilada: la que vence no avisa
    const c2 = await nuevaCuenta();
    await db.query("INSERT INTO suscripciones (cuenta_id, plan, periodo, desde, hasta) VALUES ($1, 'C', 'mes', now() - interval '29 days', now() + interval '1 day'), ($1, 'C', 'mes', now() + interval '1 day', now() + interval '31 days')", [c2.id]);
    const antes = mails.length;
    const { createPlanes } = await import('../lib/planes.js');
    const enviados = [];
    const planes = createPlanes({ pool: db, sendMail: async (m) => enviados.push(m) });
    const r1 = await planes.ejecutarVencimientos();
    assert.ok(r1.vencidas >= 1 && r1.pedidosVencidos >= 1);
    const paraC = enviados.filter((m) => m.to === c.email);
    assert.equal(paraC.filter((m) => /vence el/.test(m.subject)).length, 1);
    assert.equal(paraC.filter((m) => /venció/.test(m.subject)).length, 1);
    assert.match(paraC.find((m) => /venció/.test(m.subject)).text, /Ahora tu perfil está en Oro/);
    assert.equal(enviados.filter((m) => m.to === c2.email).length, 0);
    assert.equal((await db.query('SELECT estado FROM suscripciones WHERE id = $1', [sv.id])).rows[0].estado, 'vencida');
    assert.equal((await db.query('SELECT estado FROM suscripciones WHERE id = $1', [s3.id])).rows[0].estado, 'activa');
    assert.equal((await db.query('SELECT estado FROM pedidos WHERE id = $1', [pv.id])).rows[0].estado, 'vencido');
    await planes.ejecutarVencimientos();
    assert.equal(enviados.filter((m) => m.to === c.email).length, 2);
    assert.equal(enviados.filter((m) => m.to === c2.email).length, 0);
    assert.equal(mails.length, antes);
    // también quedó en las notificaciones del panel
    const nots = await (await cta(c.id, '/notificaciones')).json();
    assert.ok(nots.items.some((n) => n.tipo === 'plan_vence') && nots.items.some((n) => n.tipo === 'plan_vencio'));
  });
});

describe('admin: acompañantes y verificación', () => {
  test('auth y reglas de POST', async () => {
    assert.equal((await fetch(BASE + A + '/api/acompanantes')).status, 401);
    const c = await nuevaCuenta();
    const url = BASE + A + `/api/acompanantes/${c.id}/estado`;
    const base = { authorization: auth, 'content-type': 'application/json', origin: BASE };
    let r = await fetch(url, { method: 'POST', headers: base, body: '{"estado":"pausado"}' });
    assert.equal(r.status, 403);
    r = await fetch(url, { method: 'POST', headers: { ...base, 'x-sr-admin': '1', origin: 'https://evil.example' }, body: '{"estado":"pausado"}' });
    assert.equal(r.status, 403);
    r = await fetch(url, { method: 'POST', headers: { ...base, 'x-sr-admin': '1', 'content-type': 'text/plain' }, body: '{"estado":"pausado"}' });
    assert.equal(r.status, 403);
    assert.equal((await adm('/acompanantes/no-es-uuid')).status, 404);
  });

  test('aprobar verificación publica el perfil en revisión, con email; ver selfie y documento', async () => {
    const c = await nuevaCuenta({ estado: 'en_revision', verificacion: 'pendiente' });
    await fs.mkdir(path.join(tmpData, 'privado', 'verificaciones'), { recursive: true });
    const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), crypto.randomBytes(40)]);
    await fs.writeFile(path.join(tmpData, 'privado', 'verificaciones', 's.jpg'), jpg);
    await fs.writeFile(path.join(tmpData, 'privado', 'verificaciones', 'd.jpg'), jpg);
    const { rows: [v] } = await db.query(
      "INSERT INTO verificaciones (cuenta_id, selfie_ruta, documento_ruta) VALUES ($1, 'verificaciones/s.jpg', 'verificaciones/d.jpg') RETURNING id", [c.id]);
    const lista = await (await adm('/acompanantes?estado=verificacion_pendiente')).json();
    assert.ok(lista.items.some((x) => x.cuentaId === c.id && x.verificacion === 'pendiente'));
    const det = await (await adm(`/acompanantes/${c.id}`)).json();
    assert.equal(det.verificaciones[0].id, v.id);
    assert.equal(det.verificaciones[0].tieneSelfie, true);
    let r = await adm(`/verificaciones/${v.id}/selfie`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'image/jpeg');
    assert.deepEqual(Buffer.from(await r.arrayBuffer()), jpg);
    assert.equal((await adm(`/verificaciones/${v.id}/documento`)).status, 200);
    assert.equal((await adm(`/verificaciones/${v.id}/otro`)).status, 404);
    // ruta maliciosa en la base: nunca sale de privado/
    const { rows: [mal] } = await db.query("INSERT INTO verificaciones (cuenta_id, selfie_ruta, documento_ruta, estado) VALUES ($1, '../../etc/passwd', '../../etc/passwd', 'rechazada') RETURNING id", [c.id]);
    assert.equal((await adm(`/verificaciones/${mal.id}/selfie`)).status, 404);
    r = await admPost(`/acompanantes/${c.id}/verificacion`, { decision: 'rechazar' });
    assert.equal(r.status, 400);
    r = await admPost(`/acompanantes/${c.id}/verificacion`, { decision: 'aprobar' });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.perfil.estado, 'publicado');
    assert.equal(j.perfil.verificacion, 'verificada');
    assert.ok(j.perfil.publicado_en);
    assert.match(ultimoMail(c.email).subject, /publicado/);
    assert.equal((await admPost(`/acompanantes/${c.id}/verificacion`, { decision: 'aprobar' })).status, 409);
    const resumen = await (await adm('/resumen')).json();
    assert.ok(resumen.acompanantes.publicadas >= 1);
    assert.ok('verificacionesPendientes' in resumen && 'pedidos' in resumen && 'preregistros' in resumen);
  });

  test('rechazar verificación vuelve a borrador; cambios de estado', async () => {
    const c = await nuevaCuenta({ estado: 'en_revision', verificacion: 'pendiente' });
    await db.query("INSERT INTO verificaciones (cuenta_id, selfie_ruta, documento_ruta) VALUES ($1, 'verificaciones/no-existe-s.jpg', 'verificaciones/no-existe-d.jpg')", [c.id]);
    let r = await admPost(`/acompanantes/${c.id}/verificacion`, { decision: 'rechazar', motivo: 'La foto del documento no se lee' });
    let j = await r.json();
    assert.equal(j.perfil.estado, 'borrador');
    assert.equal(j.perfil.verificacion, 'rechazada');
    assert.equal(j.perfil.motivo_rechazo, 'La foto del documento no se lee');
    assert.match(ultimoMail(c.email).text, /no se lee/);
    r = await admPost(`/acompanantes/${c.id}/estado`, { estado: 'publicado' });
    assert.equal(r.status, 409);
    r = await admPost(`/acompanantes/${c.id}/estado`, { estado: 'suspendido' });
    assert.equal(r.status, 400);
    r = await admPost(`/acompanantes/${c.id}/estado`, { estado: 'borrador' });
    assert.equal(r.status, 400);
    const ok = await nuevaCuenta({ estado: 'publicado', verificacion: 'verificada' });
    r = await admPost(`/acompanantes/${ok.id}/estado`, { estado: 'pausado', motivo: 'Pedido de ella' });
    j = await r.json();
    assert.equal(j.perfil.estado, 'pausado');
    assert.match(ultimoMail(ok.email).subject, /pausado/);
    r = await admPost(`/acompanantes/${ok.id}/estado`, { estado: 'publicado' });
    assert.equal((await r.json()).perfil.estado, 'publicado');
  });
});

describe('admin: ajustes y catálogos', () => {
  test('ajustes GET/PUT con validación', async () => {
    let r = await admPost('/ajustes/portada', { valor: { titulo: 'Hola' } }, { method: 'PUT' });
    assert.equal(r.status, 400);
    r = await admPost('/ajustes/portada', { valor: { titulo: 'Acompañantes en Argentina', subtitulo: 'Perfiles verificados' } }, { method: 'PUT' });
    assert.equal(r.status, 200);
    r = await admPost('/ajustes/promo', { valor: 'x'.repeat(501) }, { method: 'PUT' });
    assert.equal(r.status, 400);
    r = await admPost('/ajustes/promo', { valor: 'Bronce gratis' }, { method: 'PUT' });
    assert.equal(r.status, 200);
    r = await admPost('/ajustes/otra', { valor: 1 }, { method: 'PUT' });
    assert.equal(r.status, 404);
    r = await admPost('/ajustes/precios', { valor: { mes: { E: 0 } } }, { method: 'PUT' });
    assert.equal(r.status, 400);
    r = await admPost('/ajustes/precios', {}, { method: 'PUT' });
    assert.equal(r.status, 400);
    const all = await (await adm('/ajustes')).json();
    assert.equal(all.portada.titulo, 'Acompañantes en Argentina');
    assert.equal(all.promo, 'Bronce gratis');
    assert.deepEqual(all.precios.semana, { C: 27, S: 105 });
    assert.ok(!('transferencia' in all));
    assert.equal((await (await adm('/ajustes/promo')).json()).valor, 'Bronce gratis');
  });

  test('ubicaciones: crear, editar, no borrar si tiene hijos o perfiles', async () => {
    let r = await admPost('/ubicaciones', { id: 'zzb-pais', nombre: 'Zzbland', tipo: 'pais' });
    assert.equal(r.status, 201);
    r = await admPost('/ubicaciones', { id: 'zzb-prov', nombre: 'Zzb Provincia Uno', tipo: 'provincia', padre: 'zzb-pais' });
    assert.equal(r.status, 201);
    assert.equal((await admPost('/ubicaciones', { id: 'zzb-prov', nombre: 'Otra', tipo: 'provincia', padre: 'zzb-pais' })).status, 409);
    assert.equal((await admPost('/ubicaciones', { id: 'zzb-x', nombre: 'X', tipo: 'ciudad', padre: 'zzb-pais' })).status, 400); // nombre corto
    assert.equal((await admPost('/ubicaciones', { id: 'zzb-ciu', nombre: 'Zzb Ciudad Mal', tipo: 'provincia', padre: 'zzb-prov' })).status, 400); // padre de nivel menor
    assert.equal((await admPost('/ubicaciones', { id: 'Mal Id', nombre: 'Zzb Ciudad', tipo: 'ciudad', padre: 'zzb-prov' })).status, 400);
    r = await admPost('/ubicaciones', { id: 'zzb-ciu', nombre: 'Zzb Ciudad Dos', tipo: 'ciudad', padre: 'zzb-prov' });
    assert.equal(r.status, 201);
    r = await admPost('/ubicaciones/zzb-ciu', { nombre: 'Zzb Ciudad Dos Editada', activa: false }, { method: 'PUT' });
    const it = (await r.json()).item;
    assert.equal(it.nombre, 'Zzb Ciudad Dos Editada');
    assert.equal(it.activa, false);
    assert.equal(it.tipo, 'ciudad');
    assert.equal((await admPost('/ubicaciones/zzb-prov', {}, { method: 'DELETE' })).status, 409);
    await nuevaCuenta({ provincia: 'zzb provincia uno' });
    assert.equal((await admPost('/ubicaciones/zzb-ciu', {}, { method: 'DELETE' })).status, 200);
    r = await admPost('/ubicaciones/zzb-prov', {}, { method: 'DELETE' });
    assert.equal(r.status, 409);
    assert.match((await r.json()).error, /perfiles/);
    const lista = await (await adm('/ubicaciones')).json();
    assert.ok(lista.items.some((u) => u.id === 'zzb-prov'));
  });

  test('categorías e intereses: CRUD y bloqueo si se usan', async () => {
    let r = await admPost('/categorias', { nombre: 'Zzb Picnic', icono: 'coffee', orden: 3 });
    assert.equal(r.status, 201);
    const cat = (await r.json()).item;
    assert.equal(cat.id, 'zzb-picnic');
    assert.equal((await admPost('/categorias', { nombre: 'Zzb Mal', icono: '<svg>' })).status, 400);
    r = await admPost('/intereses', { id: 'zzb-astro', nombre: 'Astronomía', nombre_en: 'Astronomy' });
    assert.equal(r.status, 201);
    await nuevaCuenta({ datos: { salidas: ['zzb-picnic'], intereses: ['zzb-astro'] } });
    assert.equal((await admPost('/categorias/zzb-picnic', {}, { method: 'DELETE' })).status, 409);
    assert.equal((await admPost('/intereses/zzb-astro', {}, { method: 'DELETE' })).status, 409);
    r = await admPost('/intereses/zzb-astro', { nombre: 'Astronomía y estrellas' }, { method: 'PUT' });
    assert.equal((await r.json()).item.nombre_en, 'Astronomy');
    await db.query("DELETE FROM cuentas WHERE email LIKE 'zzb-%' AND id IN (SELECT cuenta_id FROM perfiles WHERE datos->'salidas' ? 'zzb-picnic')");
    assert.equal((await admPost('/categorias/zzb-picnic', {}, { method: 'DELETE' })).status, 200);
    assert.equal((await admPost('/intereses/zzb-astro', {}, { method: 'DELETE' })).status, 200);
    assert.equal((await admPost('/categorias/zzb-nada', {}, { method: 'DELETE' })).status, 404);
  });

  test('servicios (tabla intereses): el admin puede cargar formas de pago como «Acepta tarjeta» y nombres de hasta 40 letras', async () => {
    // En pantalla se llaman "Servicios"; ids, tabla y API siguen siendo intereses. El id se arma solo con el nombre.
    let r = await admPost('/intereses', { nombre: 'Zzb Acepta tarjeta', nombre_en: 'Accepts cards', nombre_pt: 'Aceita cartão' });
    assert.equal(r.status, 201);
    const it = (await r.json()).item;
    assert.equal(it.id, 'zzb-acepta-tarjeta'); assert.equal(it.nombre, 'Zzb Acepta tarjeta'); assert.equal(it.nombre_pt, 'Aceita cartão');
    const largo = 'Zzb Acepta transferencia y Mercado Pago'; // 39 letras
    r = await admPost('/intereses', { nombre: largo });
    assert.equal(r.status, 201); assert.equal((await r.json()).item.nombre, largo);
    const e = await (await fetch(BASE + '/api/sitio/estado')).json();
    assert.ok(e.intereses.some((x) => x.id === 'zzb-acepta-tarjeta' && x.nombreEn === 'Accepts cards'));
    for (const id of ['zzb-acepta-tarjeta', 'zzb-acepta-transferencia-y-mercado-pago']) assert.equal((await admPost('/intereses/' + id, {}, { method: 'DELETE' })).status, 200);
  });
});
