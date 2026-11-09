// Pruebas de Fase 2 (agente B): planes, pedidos por transferencia, suscripciones, cupo Star, vencimientos y API del admin.
//   DATABASE_URL_B=postgres://postgres@localhost:55432/srtestB node --test test/fase1-planes.test.js
// Aplica schema.sql + 010-cuentas.sql + 020-planes.sql antes de arrancar.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { start } from '../server.js';
import { nuevaReferencia, mezclarPrecios, validarPrecios, PRECIOS_DEFAULT } from '../lib/planes.js';

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

before(async () => {
  await aplicarEsquema();
  tmpData = await fs.mkdtemp(path.join(os.tmpdir(), 'srb-data-'));
  instance = await start({
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
  test('referencias cortas sin caracteres ambiguos', () => {
    for (let i = 0; i < 200; i++) assert.match(nuevaReferencia(), /^SR-[A-HJ-KMNP-Z2-9]{4}$/);
  });
  test('defaults, mezcla y validación', async () => {
    assert.deepEqual(mezclarPrecios(null), { mes: { ...PRECIOS_DEFAULT.mes }, semana: { ...PRECIOS_DEFAULT.semana } });
    assert.equal(mezclarPrecios({ mes: { D: 25, Z: 9 }, semana: { B: -1 } }).mes.D, 25);
    assert.equal(mezclarPrecios({ semana: { B: -1 } }).semana.B, 21);
    assert.ok(validarPrecios({ mes: { E: 0, D: 1, C: 2, B: 3, A: 4, S: 5 }, semana: { B: 1, A: 2, S: 3 } }).valor);
    assert.ok(validarPrecios({ mes: { E: 0, D: 1, C: 2, B: 3, A: 4, S: 5 }, semana: { B: 1, A: 2, S: 3, D: 1 } }).error);
    assert.ok(validarPrecios({ mes: { E: 0, D: 'x', C: 2, B: 3, A: 4, S: 5 }, semana: { B: 1, A: 2, S: 3 } }).error);
  });
  test('GET /api/cuenta/planes con defaults y luego con precios del admin', async () => {
    const c = await nuevaCuenta();
    let r = await cta(c.id, '/planes');
    assert.equal(r.status, 200);
    let j = await r.json();
    assert.equal(j.efectivo, 'E');
    assert.deepEqual(j.precios.mes, { E: 0, D: 20, C: 45, B: 70, A: 150, S: 350 });
    assert.deepEqual(j.precios.semana, { B: 21, A: 45, S: 105 });
    assert.equal(j.planes.find((p) => p.codigo === 'D').semana, null);
    assert.equal(j.cupoStar.libres, 10);
    assert.equal(j.transferencia, '');
    const precios = { mes: { E: 0, D: 22, C: 45, B: 70, A: 150, S: 350 }, semana: { B: 21, A: 45, S: 105 } };
    assert.equal((await admPost('/ajustes/precios', { valor: precios }, { method: 'PUT' })).status, 200);
    assert.equal((await admPost('/ajustes/transferencia', { valor: 'Alias: SEXYROSE.PAGOS' }, { method: 'PUT' })).status, 200);
    j = await (await cta(c.id, '/planes')).json();
    assert.equal(j.precios.mes.D, 22);
    assert.equal(j.transferencia, 'Alias: SEXYROSE.PAGOS');
    await admPost('/ajustes/precios', { valor: { mes: { ...PRECIOS_DEFAULT.mes }, semana: { ...PRECIOS_DEFAULT.semana } } }, { method: 'PUT' });
    assert.equal((await cta('', '/planes')).status, 401);
  });
});

describe('pedidos', () => {
  test('validaciones', async () => {
    const c = await nuevaCuenta();
    const err = async (body, status, re) => {
      const r = await ctaPost(c.id, '/pedidos', body);
      assert.equal(r.status, status, JSON.stringify(body));
      assert.match((await r.json()).error, re);
    };
    await err({ plan: 'E', periodo: 'mes' }, 400, /gratis/);
    await err({ plan: 'D', periodo: 'semana' }, 400, /por semana/);
    await err({ plan: 'C', periodo: 'semana' }, 400, /por semana/);
    await err({ plan: 'X', periodo: 'mes' }, 400, /plan válido/);
    await err({ plan: 'B', periodo: 'dia' }, 400, /mes o por semana/);
    const r = await ctaPost(c.id, '/pedidos', { plan: 'B', periodo: 'semana' });
    assert.equal(r.status, 201);
    const { pedido } = await r.json();
    assert.equal(pedido.montoUsd, 21);
    assert.equal(pedido.estado, 'pendiente');
    assert.match(pedido.referencia, /^SR-/);
    await err({ plan: 'B', periodo: 'semana' }, 409, /pedido abierto/);
    // otro período del mismo plan sí
    assert.equal((await ctaPost(c.id, '/pedidos', { plan: 'B', periodo: 'mes' })).status, 201);
    // reglas de POST
    let x = await cta(c.id, '/pedidos', { method: 'POST', body: '{"plan":"A","periodo":"mes"}', headers: { 'content-type': 'application/json', origin: BASE } });
    assert.equal(x.status, 403);
    x = await cta(c.id, '/pedidos', { method: 'POST', body: '{"plan":"A","periodo":"mes"}', headers: { 'content-type': 'application/json', 'x-sr': '1', origin: 'https://evil.example' } });
    assert.equal(x.status, 403);
    x = await cta(c.id, '/pedidos', { method: 'POST', body: 'plan=A', headers: { 'content-type': 'text/plain', 'x-sr': '1', origin: BASE } });
    assert.equal(x.status, 415);
  });

  test('Star exige provincia y cupo (10 por provincia)', async () => {
    const sinProv = await nuevaCuenta({ provincia: '' });
    let r = await ctaPost(sinProv.id, '/pedidos', { plan: 'S', periodo: 'mes' });
    assert.equal(r.status, 400);
    assert.match((await r.json()).error, /provincia/);
    const prov = 'Zzb Cupo ' + crypto.randomBytes(2).toString('hex');
    for (let i = 0; i < 10; i++) {
      const s = await nuevaCuenta({ provincia: prov });
      await db.query("INSERT INTO suscripciones (cuenta_id, plan, periodo, desde, hasta) VALUES ($1, 'S', 'mes', now() - interval '1 day', now() + interval '20 days')", [s.id]);
    }
    const otra = await nuevaCuenta({ provincia: prov.toUpperCase() + '  ' });
    r = await ctaPost(otra.id, '/pedidos', { plan: 'S', periodo: 'semana' });
    assert.equal(r.status, 409);
    assert.match((await r.json()).error, /No quedan lugares Star/);
    const plan = await (await cta(otra.id, '/planes')).json();
    assert.equal(plan.cupoStar.libres, 0);
    const stars = await (await adm('/stars')).json();
    const p = stars.provincias.find((x) => x.provincia.toLowerCase() === prov.toLowerCase());
    assert.equal(p.ocupadas, 10);
    assert.equal(p.libres, 0);
    // en otra provincia sí hay lugar
    const libre = await nuevaCuenta({ provincia: 'Zzb Libre ' + crypto.randomBytes(2).toString('hex') });
    r = await ctaPost(libre.id, '/pedidos', { plan: 'S', periodo: 'mes' });
    assert.equal(r.status, 201);
    assert.equal((await r.json()).pedido.montoUsd, 350);
  });

  test('informar con comprobante, confirmar crea suscripción, el admin ve el comprobante', async () => {
    const c = await nuevaCuenta();
    const { pedido } = await (await ctaPost(c.id, '/pedidos', { plan: 'C', periodo: 'mes' })).json();
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), crypto.randomBytes(64)]);
    const fd = new FormData();
    fd.append('nota', 'Transferí desde Banco X');
    fd.append('comprobante', new Blob([png], { type: 'image/png' }), 'comp.png');
    let r = await cta(c.id, `/pedidos/${pedido.id}/informar`, { method: 'POST', body: fd, headers: { 'x-sr': '1', origin: BASE } });
    assert.equal(r.status, 200);
    let j = await r.json();
    assert.equal(j.pedido.estado, 'informado');
    assert.equal(j.pedido.tieneComprobante, true);
    // comprobante falso (texto) rechazado
    const fd2 = new FormData();
    fd2.append('comprobante', new Blob([Buffer.from('<html>hola</html> no es imagen')], { type: 'image/png' }), 'x.png');
    r = await cta(c.id, `/pedidos/${pedido.id}/informar`, { method: 'POST', body: fd2, headers: { 'x-sr': '1', origin: BASE } });
    assert.equal(r.status, 400);
    // otra cuenta no puede informar este pedido
    const otra = await nuevaCuenta();
    r = await ctaPost(otra.id, `/pedidos/${pedido.id}/informar`, { nota: 'x' });
    assert.equal(r.status, 404);
    // admin: lista, comprobante, confirmar
    const lista = await (await adm('/pedidos?estado=abiertos')).json();
    const item = lista.items.find((x) => x.id === pedido.id);
    assert.ok(item && item.cuenta.email === c.email && item.tieneComprobante);
    assert.ok(lista.informados >= 1);
    r = await adm(`/pedidos/${pedido.id}/comprobante`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'image/png');
    assert.match(r.headers.get('cache-control'), /no-store/);
    assert.deepEqual(Buffer.from(await r.arrayBuffer()), png);
    assert.equal((await fetch(BASE + A + `/api/pedidos/${pedido.id}/comprobante`)).status, 401);
    r = await admPost(`/pedidos/${pedido.id}/confirmar`, {});
    assert.equal(r.status, 200);
    j = await r.json();
    assert.equal(j.pedido.estado, 'confirmado');
    assert.equal(j.suscripcion.plan, 'C');
    const dias = (new Date(j.suscripcion.hasta) - new Date(j.suscripcion.desde)) / 86400000;
    assert.ok(Math.abs(dias - 30) < 0.01);
    assert.match(ultimoMail(c.email).subject, /Recibimos tu pago/);
    assert.equal((await admPost(`/pedidos/${pedido.id}/confirmar`, {})).status, 409);
    const yo = await (await cta(c.id, '/planes')).json();
    assert.equal(yo.efectivo, 'C');
  });

  test('cancelar y rechazar', async () => {
    const c = await nuevaCuenta();
    const p1 = (await (await ctaPost(c.id, '/pedidos', { plan: 'D', periodo: 'mes' })).json()).pedido;
    assert.equal((await (await ctaPost(c.id, `/pedidos/${p1.id}/cancelar`, {})).json()).pedido.estado, 'cancelado');
    assert.equal((await ctaPost(c.id, `/pedidos/${p1.id}/cancelar`, {})).status, 409);
    const p2 = (await (await ctaPost(c.id, '/pedidos', { plan: 'D', periodo: 'mes' })).json()).pedido;
    const r = await admPost(`/pedidos/${p2.id}/rechazar`, { motivo: 'No llegó la transferencia' });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).pedido.motivo, 'No llegó la transferencia');
    assert.match(ultimoMail(c.email).text, /No llegó la transferencia/);
  });
});

describe('suscripciones y plan efectivo', () => {
  test('renovación apilada del mismo plan no pierde días', async () => {
    const c = await nuevaCuenta();
    const a = (await (await ctaPost(c.id, '/pedidos', { plan: 'B', periodo: 'mes' })).json()).pedido;
    const s1 = (await (await admPost(`/pedidos/${a.id}/confirmar`, {})).json()).suscripcion;
    const b = (await (await ctaPost(c.id, '/pedidos', { plan: 'B', periodo: 'mes' })).json()).pedido;
    const s2 = (await (await admPost(`/pedidos/${b.id}/confirmar`, {})).json()).suscripcion;
    assert.equal(new Date(s2.desde).getTime(), new Date(s1.hasta).getTime());
    assert.ok(Math.abs((new Date(s2.hasta) - new Date(s1.desde)) / 86400000 - 60) < 0.01);
  });

  test('semana de Diamante sobre Platino mensual: sube 7 días y vuelve a Platino', async () => {
    const c = await nuevaCuenta();
    const pm = (await (await ctaPost(c.id, '/pedidos', { plan: 'B', periodo: 'mes' })).json()).pedido;
    await admPost(`/pedidos/${pm.id}/confirmar`, {});
    const pw = (await (await ctaPost(c.id, '/pedidos', { plan: 'A', periodo: 'semana' })).json()).pedido;
    assert.equal(pw.montoUsd, 45);
    const sw = (await (await admPost(`/pedidos/${pw.id}/confirmar`, {})).json()).suscripcion;
    assert.ok(Math.abs((new Date(sw.hasta) - new Date(sw.desde)) / 86400000 - 7) < 0.01);
    assert.equal((await (await cta(c.id, '/planes')).json()).efectivo, 'A');
    const det = await (await adm(`/acompanantes/${c.id}`)).json();
    assert.equal(det.plan, 'A');
    // pasan los 7 días
    await db.query("UPDATE suscripciones SET desde = desde - interval '8 days', hasta = hasta - interval '8 days' WHERE id = $1", [sw.id]);
    assert.equal((await (await cta(c.id, '/planes')).json()).efectivo, 'B');
    const lista = await (await adm('/acompanantes?q=' + encodeURIComponent(c.email))).json();
    assert.equal(lista.items[0].plan, 'B');
  });

  test('plan manual del admin y cancelación', async () => {
    const c = await nuevaCuenta();
    let r = await admPost(`/acompanantes/${c.id}/plan`, { plan: 'A', dias: 400 });
    assert.equal(r.status, 400);
    r = await admPost(`/acompanantes/${c.id}/plan`, { plan: 'E', dias: 10 });
    assert.equal(r.status, 400);
    r = await admPost(`/acompanantes/${c.id}/plan`, { plan: 'A', dias: 10, nota: 'Lanzamiento' });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.plan, 'A');
    assert.equal(j.suscripcion.periodo, 'manual');
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
    await db.query("INSERT INTO suscripciones (cuenta_id, plan, periodo, desde, hasta) VALUES ($1, 'B', 'mes', now() - interval '29 days', now() + interval '1 day'), ($1, 'B', 'mes', now() + interval '1 day', now() + interval '31 days')", [c2.id]);
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
    assert.deepEqual(all.precios.semana, { B: 21, A: 45, S: 105 });
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
});
