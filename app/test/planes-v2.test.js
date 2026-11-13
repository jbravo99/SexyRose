// Pruebas de Planes v2: libro de créditos (concurrencia, saldo negativo de comisión), pedidos de créditos por WhatsApp,
// ajustes nuevos del admin, renovación automática con avisos y pausa por saldo, Destacado (cupo 20 %, reservas, atado
// al plan), notificaciones y el freno de la migración 050 si quedan Platino/Diamante.
//   DATABASE_URL=postgres://postgres@localhost:55432/srtestB node --test test/planes-v2.test.js
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { start } from '../server.js';
import { createCreditos, arsSugerido, alcanzaParaSugerido, PACKS_DEFAULT, validarPacks } from '../lib/creditos.js';
import { createPlanes, maxSolape, proximaLibre } from '../lib/planes.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '..');
const DATABASE_URL = process.env.DATABASE_URL_B || process.env.DATABASE_URL || 'postgres://postgres@localhost:55432/srtestB';
const db = new pg.Pool({ connectionString: DATABASE_URL, max: 4 });
const A = '/panel-pruebas-planes-v2-0123456789';
const USER = 'admin-v2';
const PASS = 'clave-de-prueba-larga-456';
const DAY = 86400000;
const mails = [];
let instance; let BASE; let tmpData;

const auth = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
const adm = (p, opts = {}) => fetch(BASE + A + '/api' + p, { ...opts, headers: { authorization: auth, ...(opts.headers || {}) } });
const admPost = (p, body, { method = 'POST' } = {}) => adm(p, {
  method, body: JSON.stringify(body ?? {}), headers: { 'content-type': 'application/json', 'x-sr-admin': '1', origin: BASE },
});
const cta = (cuentaId, p, opts = {}) => fetch(BASE + '/api/cuenta' + p, { ...opts, headers: { 'x-test-cuenta': cuentaId, ...(opts.headers || {}) } });
const ctaPost = (cuentaId, p, body, method = 'POST') => cta(cuentaId, p, {
  method, body: JSON.stringify(body ?? {}), headers: { 'content-type': 'application/json', 'x-sr': '1', origin: BASE },
});

let n = 0;
async function nuevaCuenta({ provincia = 'zzv-prov', estado = 'borrador', verificacion = 'sin_enviar' } = {}) {
  const email = `zzv-${Date.now()}-${n++}-${crypto.randomBytes(3).toString('hex')}@example.com`;
  const { rows } = await db.query('INSERT INTO cuentas (email, pass_hash) VALUES ($1, $2) RETURNING id', [email, 'x']);
  const id = rows[0].id;
  await db.query('INSERT INTO perfiles (cuenta_id, slug, datos, estado, verificacion) VALUES ($1, $2, $3, $4, $5)',
    [id, 'zzv-' + id.slice(0, 8), JSON.stringify({ displayName: 'V2 ' + n, provincia, ciudad: 'zzv-ciudad' }), estado, verificacion]);
  return { id, email };
}
const publicada = (provincia) => nuevaCuenta({ provincia, estado: 'publicado', verificacion: 'verificada' });
const conPlan = (cuentaId, plan, { dias = 20, renov = false, origen = 'manual', hasta = null, cambio = null } = {}) => db.query(
  `INSERT INTO suscripciones (cuenta_id, plan, periodo, desde, hasta, renovacion_auto, origen, cambio_programado)
   VALUES ($1, $2, 'mes', COALESCE($4::timestamptz, now() + make_interval(days => $3)) - interval '30 days',
           COALESCE($4::timestamptz, now() + make_interval(days => $3)), $5, $6, $7) RETURNING *`,
  [cuentaId, plan, dias, hasta, renov, origen, cambio]).then((r) => r.rows[0]);
async function cargar(cuentaId, creditos) {
  const r = await admPost(`/creditos/${cuentaId}/ajuste`, { creditos, motivo: 'Carga de prueba' });
  assert.equal(r.status, 200, await r.clone().text());
}
const saldo = async (cuentaId) => Number((await db.query('SELECT COALESCE(sum(centavos), 0)::bigint AS s FROM creditos_movimientos WHERE cuenta_id = $1', [cuentaId])).rows[0].s);
async function invariante(cuentaId) {
  const { rows: [x] } = await db.query(
    `SELECT COALESCE((SELECT sum(centavos) FROM creditos_movimientos WHERE cuenta_id = $1), 0)::bigint AS suma,
            COALESCE((SELECT centavos FROM creditos_cuentas WHERE cuenta_id = $1), 0)::bigint AS fila`, [cuentaId]);
  assert.equal(x.suma, x.fila);
}
// El estado público tiene caché de 30 s: un PUT de ajustes del admin la invalida (como cualquier cambio del admin).
const estadoSitio = async () => {
  await admPost('/ajustes/promo', { valor: '' }, { method: 'PUT' });
  return (await fetch(BASE + '/api/sitio/estado')).json();
};

before(async () => {
  tmpData = await fs.mkdtemp(path.join(os.tmpdir(), 'srv2-data-'));
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
  await db.query("DELETE FROM cuentas WHERE email LIKE 'zzv-%'");
  await db.query("DELETE FROM ajustes WHERE clave IN ('packs', 'contacto', 'cotizacion', 'comision', 'mensajes', 'destacado')");
  for (const f of (await fs.readdir(path.join(APP, 'db'))).filter((x) => /^06\d-.*\.sql$/.test(x)).sort()) {
    await db.query(await fs.readFile(path.join(APP, 'db', f), 'utf8'));
  }
});

after(async () => {
  await instance?.close();
  await db.query("DELETE FROM cuentas WHERE email LIKE 'zzv-%'");
  await db.end();
  if (tmpData) await fs.rm(tmpData, { recursive: true, force: true });
});

describe('libro de créditos', () => {
  test('débitos simultáneos no dejan saldo negativo; saldo = suma de movimientos', async () => {
    const cred = createCreditos({ pool: db });
    const c = await nuevaCuenta();
    await cred.ajusteAdmin(c.id, { centavos: 3000, motivo: 'carga' });
    const intentos = await Promise.allSettled([1, 2, 3, 4, 5].map((i) => cred.enTransaccion((x) => cred.mover(x, {
      cuentaId: c.id, tipo: 'destacado', centavos: -1000, motivo: 'débito ' + i,
    }))));
    assert.equal(intentos.filter((r) => r.status === 'fulfilled').length, 3);
    const fallidos = intentos.filter((r) => r.status === 'rejected');
    assert.equal(fallidos.length, 2);
    for (const f of fallidos) { assert.equal(f.reason.status, 402); assert.equal(f.reason.codigo, 'saldo_insuficiente'); }
    assert.equal(await cred.saldo(c.id), 0);
    await invariante(c.id);
    const movs = await cred.movimientos(c.id);
    assert.equal(movs.items.length, 4);
    assert.deepEqual(movs.items.map((m) => m.saldoDespues.centavos), [0, 1000, 2000, 3000]);
    assert.equal(movs.items[0].creditos, '-10.00');
  });

  test('ajustes del admin: motivo obligatorio, decimales con coma, no deja negativo', async () => {
    const c = await nuevaCuenta();
    let r = await admPost(`/creditos/${c.id}/ajuste`, { creditos: 5 });
    assert.equal(r.status, 400);
    r = await admPost(`/creditos/${c.id}/ajuste`, { creditos: 0, motivo: 'nada' });
    assert.equal(r.status, 400);
    r = await admPost(`/creditos/${c.id}/ajuste`, { creditos: '2,5', motivo: 'Compensación por caída del sitio' });
    assert.equal(r.status, 200);
    let j = await r.json();
    assert.equal(j.saldo.creditos, '2.50');
    assert.equal(j.movimiento.tipo, 'ajuste_admin');
    assert.equal(j.movimiento.creadoPor, USER);
    r = await admPost(`/creditos/${c.id}/ajuste`, { creditos: -3, motivo: 'Corrección' });
    assert.equal(r.status, 402);
    assert.equal((await r.json()).codigo, 'saldo_insuficiente');
    r = await admPost(`/creditos/${c.id}/ajuste`, { centavos: -250, motivo: 'Corrección' });
    assert.equal(r.status, 200);
    assert.equal((await admPost(`/creditos/${crypto.randomUUID()}/ajuste`, { creditos: 1, motivo: 'x y z' })).status, 404);
    j = await (await adm(`/creditos/${c.id}`)).json();
    assert.equal(j.saldo.centavos, 0);
    assert.equal(j.movimientos.length, 2);
    assert.equal(j.cuenta.email, c.email);
    const lista = await (await adm('/creditos?q=' + encodeURIComponent(c.email))).json();
    assert.equal(lista.items[0].cuentaId, c.id);
    await invariante(c.id);
  });

  test('comisión de venta: se descuenta en créditos y puede quedar hasta −20', async () => {
    const cred = createCreditos({ pool: db });
    const c = await nuevaCuenta();
    await cred.ajusteAdmin(c.id, { centavos: 500, motivo: 'carga' });
    const m = await cred.registrarComisionVenta(c.id, 10000, 'venta-1'); // venta de 100 → comisión 10
    assert.equal(m.tipo, 'comision_venta');
    assert.equal(m.centavos, -1000);
    assert.equal(await cred.saldo(c.id), -500);
    await assert.rejects(cred.registrarComisionVenta(c.id, 20000, 'venta-2'), (e) => e.status === 402); // quedaría en −25
    assert.equal(await cred.saldo(c.id), -500);
    assert.ok(await cred.registrarComisionVenta(c.id, 150000, 'venta-3').then(() => false, () => true));
    await db.query("UPDATE ajustes SET valor = '{\"porcentaje\": 5, \"saldoNegativoMax\": 20}' WHERE clave = 'comision'");
    assert.equal((await cred.registrarComisionVenta(c.id, 20000)).centavos, -1000);
    assert.equal(await cred.saldo(c.id), -1500);
    await db.query("UPDATE ajustes SET valor = '{\"porcentaje\": 10, \"saldoNegativoMax\": 20}' WHERE clave = 'comision'");
    // con saldo negativo no se pueden comprar planes ni hacer ajustes negativos
    await assert.rejects(cred.ajusteAdmin(c.id, { centavos: -1, motivo: 'corrección' }), (e) => e.status === 402);
    await invariante(c.id);
  });

  test('utilidades: pesos sugeridos y "alcanza para"', () => {
    assert.equal(arsSugerido(95, 1450), 137800);
    assert.equal(arsSugerido(10, 1000), 10000);
    assert.equal(arsSugerido(10, null), null);
    const precios = { mes: { D: 35, C: 90, S: 350 } };
    assert.equal(alcanzaParaSugerido(10, precios), 'Destacados sueltos');
    assert.equal(alcanzaParaSugerido(35, precios), '1 mes de Plata');
    assert.equal(alcanzaParaSugerido(105, precios), '1 mes de Oro + 15');
    assert.equal(alcanzaParaSugerido(1150, precios), '3 meses de Star + 100');
    assert.ok(validarPacks(PACKS_DEFAULT.map((p) => ({ ...p }))).valor);
    assert.match(validarPacks([{ nombre: 'Mal', pagaUsd: 50, recibe: 40 }]).error, /iguales o mayores/);
    assert.match(validarPacks([{ nombre: 'Chico', pagaUsd: 5, recibe: 5 }]).error, /al menos USD 10/);
  });
});

describe('ajustes nuevos del admin', () => {
  test('packs, contacto, cotización, comisión, mensajes y destacado con validación', async () => {
    const put = (clave, valor) => admPost(`/ajustes/${clave}`, { valor }, { method: 'PUT' });
    let all = await (await adm('/ajustes')).json();
    assert.equal(all.packs.length, 5);
    assert.deepEqual(all.packs.map((p) => [p.id, p.pagaUsd, p.recibe, p.bonus]),
      [['inicial', 10, 10, 0], ['mes-plata', 35, 35, 0], ['trimestre-plata', 95, 105, 10], ['trimestre-oro', 240, 280, 40], ['trimestre-star', 980, 1150, 170]]);
    assert.equal(all.packs.find((p) => p.masElegido).id, 'trimestre-plata');
    assert.deepEqual(all.destacado, { E: { dia: 1, semana: 5 }, D: { dia: 2, semana: 9 }, C: { dia: 4, semana: 20 } });
    assert.deepEqual(all.comision, { porcentaje: 10, saldoNegativoMax: 20 });
    assert.equal(all.contacto.whatsapp, '');
    assert.match(all.mensajes.whatsapp.pt, /\{codigo\}/);

    assert.equal((await put('packs', [{ nombre: 'Mal', pagaUsd: 50, recibe: 40 }])).status, 400);
    const packs = [...PACKS_DEFAULT.map((p) => ({ ...p })), { nombre: 'Prueba Grande', pagaUsd: 100, recibe: 105, alcanzaPara: '', orden: 9 }];
    let r = await put('packs', packs);
    assert.equal(r.status, 200);
    const nuevo = (await r.json()).valor.find((p) => p.nombre === 'Prueba Grande');
    assert.equal(nuevo.id, 'prueba-grande');
    assert.equal(nuevo.alcanzaPara, '');
    assert.equal(nuevo.alcanzaParaSugerido, '1 mes de Oro + 15');
    const c = await nuevaCuenta();
    const cr = await (await cta(c.id, '/creditos')).json();
    assert.equal(cr.packs.find((p) => p.id === 'prueba-grande').alcanzaPara, '1 mes de Oro + 15');
    assert.equal(cr.cargaMinima, 10);
    assert.equal(cr.horasPedido, 48);
    assert.deepEqual(cr.canales, { whatsapp: false, telegram: false });
    assert.equal((await put('packs', PACKS_DEFAULT.map((p) => ({ ...p })))).status, 200);

    assert.equal((await put('contacto', { whatsapp: '123' })).status, 400);
    assert.equal((await put('contacto', { whatsapp: '5491122334455', telegramActivo: true })).status, 400);
    r = await put('contacto', { whatsapp: '+54 9 11 2233-4455', telegram: '@sexyrose_ar', telegramActivo: true });
    assert.equal(r.status, 200);
    assert.deepEqual((await r.json()).valor, { whatsapp: '5491122334455', telegram: 'sexyrose_ar', telegramActivo: true });
    assert.equal((await put('cotizacion', { arsPorUsd: -1 })).status, 400);
    r = await put('cotizacion', { arsPorUsd: 1450, nota: 'Blue venta' });
    assert.equal(r.status, 200);
    assert.ok((await r.json()).valor.fecha);
    assert.equal((await put('comision', { porcentaje: 95, saldoNegativoMax: 20 })).status, 400);
    assert.equal((await put('comision', { porcentaje: 10, saldoNegativoMax: 20 })).status, 200);
    assert.equal((await put('mensajes', { whatsapp: { es: 'Hola sin código' } })).status, 400);
    assert.equal((await put('destacado', { E: { dia: 0, semana: 5 }, D: { dia: 2, semana: 9 }, C: { dia: 4, semana: 20 } })).status, 400);
    assert.equal((await put('destacado', { S: { dia: 1, semana: 1 } })).status, 400);
    assert.equal((await put('destacado', { E: { dia: 1, semana: 5 }, D: { dia: 2, semana: 9 }, C: { dia: 4, semana: 20 } })).status, 200);
    assert.equal((await put('transferencia', 'CBU 000')).status, 404);
    all = await (await adm('/ajustes')).json();
    assert.equal(all.cotizacion.arsPorUsd, 1450);
    // el sitio público no recibe ni contacto interno ni cotización ni datos bancarios
    const e = await estadoSitio();
    assert.deepEqual(Object.keys(e.ajustes).sort(), ['destacado', 'portada', 'precios', 'promo', 'seo', 'textos_sitio']);
  });
});

describe('pedidos de créditos por WhatsApp', () => {
  test('pack o carga a medida → código SR-####, link de WhatsApp con el mensaje en su idioma', async () => {
    await admPost('/ajustes/contacto', { valor: { whatsapp: '5491122334455', telegram: 'sexyrose_ar', telegramActivo: true } }, { method: 'PUT' });
    const c = await nuevaCuenta();
    let r = await ctaPost(c.id, '/creditos/pedidos', { packId: 'trimestre-plata' });
    assert.equal(r.status, 201);
    const { pedido } = await r.json();
    assert.match(pedido.codigo, /^SR-\d{4}$/);
    assert.equal(pedido.pagaUsd, 95);
    assert.equal(pedido.base.creditos, '95.00');
    assert.equal(pedido.bonus.creditos, '10.00');
    assert.equal(pedido.total.creditos, '105.00');
    assert.equal(pedido.estado, 'pendiente');
    assert.ok(Math.abs(new Date(pedido.vence) - new Date(pedido.creado) - 48 * 3600000) < 5000);
    assert.equal(pedido.mensaje, `Hola, quiero comprar Trimestre Plata (105 créditos, USD 95). Pedido ${pedido.codigo}`);
    assert.ok(pedido.whatsappUrl.startsWith('https://wa.me/5491122334455?text='));
    assert.equal(decodeURIComponent(pedido.whatsappUrl.split('text=')[1]), pedido.mensaje);
    assert.equal(pedido.telegramUrl, 'https://t.me/sexyrose_ar');
    r = await ctaPost(c.id, '/creditos/pedidos', { creditos: 12, lang: 'en' });
    const p2 = (await r.json()).pedido;
    assert.equal(p2.bonus.centavos, 0);
    assert.equal(p2.total.creditos, '12.00');
    assert.equal(p2.mensaje, `Hi, I want to buy Custom top-up (12 credits, USD 12). Order ${p2.codigo}`);
    r = await ctaPost(c.id, '/creditos/pedidos', { creditos: 9 });
    assert.equal(r.status, 400);
    assert.match((await r.json()).error, /de 10 a/);
    assert.equal((await ctaPost(c.id, '/creditos/pedidos', { creditos: 10.5 })).status, 400);
    assert.equal((await ctaPost(c.id, '/creditos/pedidos', { packId: 'no-existe' })).status, 400);
    const p3 = (await (await ctaPost(c.id, '/creditos/pedidos', { creditos: 10, lang: 'pt' })).json()).pedido;
    assert.match(p3.mensaje, /^Olá, quero comprar Recarga personalizada/);
    r = await ctaPost(c.id, '/creditos/pedidos', { creditos: 10 });
    assert.equal(r.status, 409); // máximo 3 abiertos
    // cancelar uno; otra cuenta no puede
    const otra = await nuevaCuenta();
    assert.equal((await ctaPost(otra.id, `/creditos/pedidos/${p3.id}/cancelar`, {})).status, 404);
    assert.equal((await (await ctaPost(c.id, `/creditos/pedidos/${p3.id}/cancelar`, {})).json()).pedido.estado, 'cancelado');
    assert.equal((await ctaPost(c.id, `/creditos/pedidos/${p3.id}/cancelar`, {})).status, 409);
    // comprobante
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), crypto.randomBytes(64)]);
    const fd = new FormData();
    fd.append('comprobante', new Blob([png], { type: 'image/png' }), 'comp.png');
    r = await cta(c.id, `/creditos/pedidos/${pedido.id}/comprobante`, { method: 'POST', body: fd, headers: { 'x-sr': '1', origin: BASE } });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).pedido.tieneComprobante, true);
    const fd2 = new FormData();
    fd2.append('comprobante', new Blob([Buffer.from('no es imagen')], { type: 'image/png' }), 'x.png');
    r = await cta(c.id, `/creditos/pedidos/${pedido.id}/comprobante`, { method: 'POST', body: fd2, headers: { 'x-sr': '1', origin: BASE } });
    assert.equal(r.status, 400);
    const cr = await (await cta(c.id, '/creditos')).json();
    assert.deepEqual(cr.canales, { whatsapp: true, telegram: true });
    assert.equal(cr.pedidos.filter((p) => p.estado === 'pendiente').length, 2);
    assert.ok(!JSON.stringify(cr).match(/CBU|CVU|alias bancario/i));
  });

  test('admin: busca por código, pesos sugeridos, confirma (compra + regalo), avisa; rechaza, vence y reabre', async () => {
    await admPost('/ajustes/cotizacion', { valor: { arsPorUsd: 1450 } }, { method: 'PUT' });
    const c = await nuevaCuenta();
    const { pedido } = await (await ctaPost(c.id, '/creditos/pedidos', { packId: 'trimestre-plata' })).json();
    let lista = await (await adm('/pedidos-creditos?q=' + pedido.codigo.slice(3))).json();
    const it = lista.items.find((x) => x.id === pedido.id);
    assert.ok(it);
    assert.equal(it.cuenta.email, c.email);
    assert.equal(it.arsSugerido, 137800);
    assert.match(it.mensajeSugerido, new RegExp(`${pedido.codigo}.*ARS 137\\.800.*USD 95 a 1\\.450`));
    assert.ok(lista.pendientes >= 1);
    lista = await (await adm('/pedidos-creditos?estado=pendiente&q=' + encodeURIComponent(c.email))).json();
    assert.equal(lista.items.length, 1);
    const antes = mails.length;
    let r = await admPost(`/pedidos-creditos/${pedido.id}/confirmar`, {});
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.pedido.estado, 'confirmado');
    assert.deepEqual(j.movimientos.map((m) => [m.tipo, m.centavos]), [['compra', 9500], ['pack_bonus', 1000]]);
    assert.equal(j.saldo.creditos, '105.00');
    assert.equal((await admPost(`/pedidos-creditos/${pedido.id}/confirmar`, {})).status, 409);
    assert.ok(mails.length > antes);
    assert.match(mails.at(-1).subject, /Acreditamos 105 créditos/);
    assert.equal(mails.at(-1).to, c.email);
    let nots = await (await cta(c.id, '/notificaciones')).json();
    assert.equal(nots.noLeidas, 1);
    assert.equal(nots.items[0].tipo, 'creditos_acreditados');
    r = await ctaPost(c.id, '/notificaciones/leer', {});
    assert.equal((await r.json()).noLeidas, 0);
    // rechazar
    const p2 = (await (await ctaPost(c.id, '/creditos/pedidos', { creditos: 20 })).json()).pedido;
    r = await admPost(`/pedidos-creditos/${p2.id}/rechazar`, { motivo: 'No llegó el pago' });
    assert.equal((await r.json()).pedido.estado, 'rechazado');
    nots = await (await cta(c.id, '/notificaciones')).json();
    assert.match(nots.items[0].texto, /No llegó el pago/);
    assert.equal((await ctaPost(c.id, '/notificaciones/leer', { ids: [nots.items[0].id] })).status, 200);
    // vence a las 48 h y se puede reabrir
    const p3 = (await (await ctaPost(c.id, '/creditos/pedidos', { creditos: 15 })).json()).pedido;
    await db.query("UPDATE pedidos_creditos SET vence = now() - interval '1 minute' WHERE id = $1", [p3.id]);
    const planes = createPlanes({ pool: db });
    const t = await planes.ejecutarVencimientos();
    assert.ok(t.pedidosCreditosVencidos >= 1);
    assert.equal((await db.query('SELECT estado FROM pedidos_creditos WHERE id = $1', [p3.id])).rows[0].estado, 'vencido');
    assert.equal((await ctaPost(c.id, `/creditos/pedidos/${p3.id}/cancelar`, {})).status, 409);
    r = await admPost(`/pedidos-creditos/${p3.id}/reabrir`, {});
    assert.equal(r.status, 200);
    const re = (await r.json()).pedido;
    assert.equal(re.estado, 'pendiente');
    assert.equal(re.reaperturas, 1);
    assert.ok(new Date(re.vence) > new Date(Date.now() + 47 * 3600000));
    assert.equal((await admPost(`/pedidos-creditos/${pedido.id}/reabrir`, {})).status, 409);
    const resumen = await (await adm('/resumen')).json();
    assert.ok(resumen.pedidosCreditos.pendientes >= 1);
    assert.ok('pausadasSinSaldo' in resumen && 'vencen7' in resumen);
    await invariante(c.id);
  });
});

describe('renovación automática, avisos y pausa por saldo', () => {
  const capturar = () => {
    const enviados = [];
    return { enviados, planes: createPlanes({ pool: db, sendMail: async (m) => enviados.push(m), siteUrl: 'https://sexyrose.test' }) };
  };

  test('con saldo se renueva sola (y con el cambio programado); con "E" no se renueva', async () => {
    const { enviados, planes } = capturar();
    const a = await nuevaCuenta();
    await cargar(a.id, 40);
    const sA = await conPlan(a.id, 'D', { renov: true, origen: 'creditos', hasta: new Date(Date.now() + 5 * 60000) });
    const b = await nuevaCuenta();
    await cargar(b.id, 35);
    await conPlan(b.id, 'C', { renov: true, origen: 'creditos', cambio: 'D', hasta: new Date(Date.now() + 5 * 60000) });
    const z = await nuevaCuenta();
    await cargar(z.id, 100);
    await conPlan(z.id, 'D', { renov: true, origen: 'creditos', cambio: 'E', hasta: new Date(Date.now() + 5 * 60000) });
    const r = await planes.ejecutarVencimientos();
    assert.ok(r.renovadas >= 2);
    const nuevaA = (await db.query("SELECT * FROM suscripciones WHERE cuenta_id = $1 AND id <> $2", [a.id, sA.id])).rows;
    assert.equal(nuevaA.length, 1);
    assert.equal(nuevaA[0].plan, 'D');
    assert.equal(new Date(nuevaA[0].desde).getTime(), new Date(sA.hasta).getTime());
    assert.equal(nuevaA[0].renovacion_auto, true);
    assert.equal(await saldo(a.id), 500);
    assert.match(enviados.find((m) => m.to === a.email).subject, /Renovamos tu plan Plata/);
    const subsB = (await db.query('SELECT plan FROM suscripciones WHERE cuenta_id = $1 ORDER BY hasta', [b.id])).rows.map((x) => x.plan);
    assert.deepEqual(subsB, ['C', 'D']);
    assert.equal(await saldo(b.id), 0);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM suscripciones WHERE cuenta_id = $1', [z.id])).rows[0].n, 1);
    assert.equal(await saldo(z.id), 10000);
    // no se cobra dos veces
    await planes.ejecutarVencimientos();
    assert.equal(await saldo(a.id), 500);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM suscripciones WHERE cuenta_id = $1', [a.id])).rows[0].n, 2);
    const nots = await (await cta(a.id, '/notificaciones')).json();
    assert.ok(nots.items.some((x) => x.tipo === 'plan_renovado'));
    await invariante(a.id);
    await invariante(b.id);
  });

  test('sin saldo: avisos 7 y 2 días antes (una vez) y el admin la ve en "vencen en 7 días"', async () => {
    const { enviados, planes } = capturar();
    const w7 = await nuevaCuenta();
    await cargar(w7.id, 10);
    await conPlan(w7.id, 'D', { renov: true, origen: 'creditos', hasta: new Date(Date.now() + 5 * DAY) });
    const w2 = await nuevaCuenta();
    await conPlan(w2.id, 'C', { renov: true, origen: 'creditos', hasta: new Date(Date.now() + 1 * DAY) });
    const ok = await nuevaCuenta();
    await cargar(ok.id, 35);
    await conPlan(ok.id, 'D', { renov: true, origen: 'creditos', hasta: new Date(Date.now() + 5 * DAY) });
    const r = await planes.ejecutarVencimientos();
    assert.ok(r.avisosSaldo7 >= 1 && r.avisosSaldo2 >= 1);
    const m7 = enviados.filter((m) => m.to === w7.email);
    assert.equal(m7.length, 1);
    assert.match(m7[0].subject, /Te faltan 25\.00 créditos para renovar tu plan Plata/);
    assert.match(m7[0].text, /se pausa/);
    assert.match(enviados.find((m) => m.to === w2.email).subject, /Te faltan 90\.00/);
    assert.equal(enviados.filter((m) => m.to === ok.email).length, 0); // le alcanza: ni aviso de saldo ni "vence"
    await planes.ejecutarVencimientos();
    assert.equal(enviados.filter((m) => m.to === w7.email).length, 1);
    const v = await (await adm('/planes/vencen?dias=7')).json();
    const x = v.items.find((i) => i.cuentaId === w7.id);
    assert.equal(x.renueva, true);
    assert.equal(x.alcanza, false);
    assert.equal(x.costoRenovacion.creditos, '35.00');
    assert.ok(v.items.find((i) => i.cuentaId === ok.id).alcanza);
    assert.ok(v.sinSaldo >= 2);
  });

  test('vence sin saldo → perfil pausado; al cargar créditos se cobra y se reanuda solo', async () => {
    const { enviados, planes } = capturar();
    const p = await publicada('zzv-prov-pausa');
    await cargar(p.id, 5);
    const s = await conPlan(p.id, 'D', { renov: true, origen: 'creditos', hasta: new Date(Date.now() - 60000) });
    const r = await planes.ejecutarVencimientos();
    assert.ok(r.pausadas >= 1);
    let pf = (await db.query('SELECT estado, pausado_por FROM perfiles WHERE cuenta_id = $1', [p.id])).rows[0];
    assert.deepEqual(pf, { estado: 'pausado', pausado_por: 'sin_saldo' });
    assert.equal((await db.query('SELECT estado FROM suscripciones WHERE id = $1', [s.id])).rows[0].estado, 'vencida');
    const mp = enviados.filter((m) => m.to === p.email);
    assert.equal(mp.length, 1); // la pausa, sin el "venció"
    assert.match(mp[0].subject, /pausado/);
    let pl = await (await cta(p.id, '/planes')).json();
    assert.equal(pl.efectivo, 'E');
    assert.equal(pl.pausa.plan, 'D');
    assert.equal(pl.pausa.perfilPausado, true);
    assert.equal(pl.pausa.costo.creditos, '35.00');
    const pa = await (await adm('/planes/pausadas')).json();
    const item = pa.items.find((i) => i.cuentaId === p.id);
    assert.equal(item.pausado, true);
    assert.equal(item.faltan.creditos, '30.00');
    assert.ok(!(await estadoSitio()).perfiles.some((x) => x.cuentaId === p.id));
    // no paga y carga de a poco: sigue pausada
    await cargar(p.id, 10);
    pf = (await db.query('SELECT estado FROM perfiles WHERE cuenta_id = $1', [p.id])).rows[0];
    assert.equal(pf.estado, 'pausado');
    let nots = await (await cta(p.id, '/notificaciones')).json();
    assert.match(nots.items[0].texto, /Todavía faltan 20\.00 créditos/);
    // compra créditos por WhatsApp y el admin confirma → se renueva y vuelve a publicarse
    const { pedido } = await (await ctaPost(p.id, '/creditos/pedidos', { packId: 'mes-plata' })).json();
    assert.equal((await admPost(`/pedidos-creditos/${pedido.id}/confirmar`, {})).status, 200);
    pf = (await db.query('SELECT estado, pausado_por FROM perfiles WHERE cuenta_id = $1', [p.id])).rows[0];
    assert.deepEqual(pf, { estado: 'publicado', pausado_por: null });
    pl = await (await cta(p.id, '/planes')).json();
    assert.equal(pl.efectivo, 'D');
    assert.equal(pl.pausa, null);
    assert.equal(pl.base.renovacionAuto, true);
    assert.equal(pl.saldo.creditos, '15.00'); // 5 + 10 + 35 − 35
    nots = await (await cta(p.id, '/notificaciones')).json();
    assert.match(nots.items[0].texto, /se ve de nuevo/);
    assert.ok((await estadoSitio()).perfiles.some((x) => x.cuentaId === p.id && x.plan === 'D'));
    await invariante(p.id);
  });

  test('pausada que desactiva la renovación vuelve a verse con Bronce', async () => {
    const { planes } = capturar();
    const q = await publicada('zzv-prov-pausa');
    await conPlan(q.id, 'C', { renov: true, origen: 'creditos', hasta: new Date(Date.now() - 60000) });
    await planes.ejecutarVencimientos();
    assert.equal((await db.query('SELECT estado FROM perfiles WHERE cuenta_id = $1', [q.id])).rows[0].estado, 'pausado');
    const r = await ctaPost(q.id, '/plan/renovacion', { activa: false }, 'PUT');
    assert.equal(r.status, 200);
    assert.equal((await r.json()).reanudado, true);
    assert.equal((await db.query('SELECT estado FROM perfiles WHERE cuenta_id = $1', [q.id])).rows[0].estado, 'publicado');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM renovaciones_pendientes WHERE cuenta_id = $1', [q.id])).rows[0].n, 0);
    // pausa del admin no se levanta sola
    await admPost(`/acompanantes/${q.id}/estado`, { estado: 'pausado', motivo: 'Pedido de ella' });
    assert.equal((await db.query('SELECT pausado_por FROM perfiles WHERE cuenta_id = $1', [q.id])).rows[0].pausado_por, 'admin');
    await cargar(q.id, 100);
    assert.equal((await db.query('SELECT estado FROM perfiles WHERE cuenta_id = $1', [q.id])).rows[0].estado, 'pausado');
  });
});

describe('Destacado', () => {
  test('solape y próxima fecha libre', () => {
    const t = (h) => new Date(Date.UTC(2026, 10, 11, h));
    const items = [{ desde: t(0), hasta: t(10) }, { desde: t(5), hasta: t(20) }];
    assert.equal(maxSolape(items, t(0), t(4)), 1);
    assert.equal(maxSolape(items, t(4), t(6)), 2);
    assert.equal(maxSolape(items, t(20), t(30)), 0);
    assert.equal(proximaLibre(items, 2, t(0), 3600000 * 2).getTime(), t(0).getTime());
    assert.equal(proximaLibre(items, 1, t(0), 3600000 * 2).getTime(), t(20).getTime());
  });

  test('cupo 20 % (mínimo 1), 409 con próxima fecha libre, reserva, Star no, aparece en el sitio', async () => {
    const prov = 'zzv-dest-' + crypto.randomBytes(3).toString('hex');
    const [a, b, c] = [await publicada(prov), await publicada(prov), await publicada(prov)];
    for (const x of [a, b, c]) await conPlan(x.id, 'D', { dias: 20 });
    await cargar(a.id, 60);
    await cargar(b.id, 20);
    let info = await (await cta(a.id, '/destacado')).json();
    assert.equal(info.disponible, true);
    assert.equal(info.plan, 'D');
    assert.deepEqual(info.precio, { dia: { centavos: 200, creditos: '2.00' }, semana: { centavos: 900, creditos: '9.00' } });
    assert.deepEqual(info.cupo, { cupo: 1, activos: 3, ocupadosAhora: 0, porcentaje: 20 });
    assert.equal((await ctaPost(a.id, '/destacado', { dias: 3 })).status, 400);
    let r = await ctaPost(a.id, '/destacado', { dias: 1 });
    assert.equal(r.status, 201);
    let j = await r.json();
    assert.equal(j.destacado.estado, 'activo');
    assert.equal(j.destacado.plan, 'D');
    assert.equal(j.saldo.creditos, '58.00');
    const dA = j.destacado;
    let e = await estadoSitio();
    assert.equal(e.perfiles.find((x) => x.cuentaId === a.id).destacado, true);
    assert.equal(e.perfiles.find((x) => x.cuentaId === b.id).destacado, false);
    // B: cupo lleno → 409 con la próxima fecha libre y sin cobrar
    r = await ctaPost(b.id, '/destacado', { dias: 1 });
    assert.equal(r.status, 409);
    j = await r.json();
    assert.equal(j.codigo, 'cupo_lleno');
    assert.equal(j.cupo, 1);
    assert.ok(Math.abs(new Date(j.proximaFechaLibre) - new Date(dA.hasta)) < 1000);
    assert.equal(await saldo(b.id), 2000);
    // reserva para esa fecha
    r = await ctaPost(b.id, '/destacado', { dias: 7, desde: j.proximaFechaLibre });
    assert.equal(r.status, 201);
    const dB = (await r.json()).destacado;
    assert.equal(dB.estado, 'programado');
    assert.equal(await saldo(b.id), 1100);
    assert.equal((await ctaPost(b.id, '/destacado', { dias: 1, desde: new Date(Date.now() - DAY).toISOString() })).status, 400);
    assert.equal((await ctaPost(b.id, '/destacado', { dias: 1, desde: new Date(Date.now() + 90 * DAY).toISOString() })).status, 400);
    // A quiere encadenar otro día: choca con la reserva de B
    r = await ctaPost(a.id, '/destacado', { dias: 1 });
    assert.equal(r.status, 409);
    assert.ok(Math.abs(new Date((await r.json()).proximaFechaLibre) - new Date(dB.hasta)) < 1000);
    info = await (await cta(b.id, '/destacado')).json();
    assert.equal(info.mios[0].estado, 'programado');
    assert.equal(info.cupo.ocupadosAhora, 1);
    // Star no; perfil sin publicar no
    const s = await publicada(prov);
    await conPlan(s.id, 'S');
    await cargar(s.id, 10);
    r = await ctaPost(s.id, '/destacado', { dias: 1 });
    assert.equal(r.status, 409);
    assert.match((await r.json()).error, /Star/);
    assert.equal((await (await cta(s.id, '/destacado')).json()).disponible, false);
    const borr = await nuevaCuenta({ provincia: prov });
    await cargar(borr.id, 10);
    assert.equal((await ctaPost(borr.id, '/destacado', { dias: 1 })).status, 409);
    // Bronce en otra provincia: 1 crédito por día
    const br = await publicada('zzv-dest-bronce-' + crypto.randomBytes(2).toString('hex'));
    await cargar(br.id, 1);
    r = await ctaPost(br.id, '/destacado', { dias: 1 });
    assert.equal(r.status, 201);
    assert.equal((await r.json()).saldo.centavos, 0);
    assert.equal((await ctaPost(br.id, '/destacado', { dias: 1 })).status, 402);
    // admin
    const ad = await (await adm('/destacados')).json();
    assert.ok(ad.items.some((x) => x.id === dB.id && x.cuenta.email === b.email));
    const z = ad.zonas.find((x) => x.provincia === prov && x.plan === 'D');
    assert.equal(z.cupo, 1);
    assert.equal(z.reservas, 2);
    r = await admPost(`/destacados/${dB.id}/cancelar`, { devolver: true });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).devuelto.creditos, '9.00');
    assert.equal(await saldo(b.id), 2000);
    assert.equal((await admPost(`/destacados/${dB.id}/cancelar`, {})).status, 409);
    await invariante(a.id);
    await invariante(b.id);
  });

  test('atado al plan: al subir de plan se cancela y se devuelve lo no usado; la tarea activa reservas', async () => {
    const prov = 'zzv-dest2-' + crypto.randomBytes(3).toString('hex');
    const a = await publicada(prov);
    await conPlan(a.id, 'D', { dias: 20, origen: 'creditos', renov: true });
    await cargar(a.id, 100);
    const { destacado } = await (await ctaPost(a.id, '/destacado', { dias: 7 })).json();
    const reserva = (await (await ctaPost(a.id, '/destacado', { dias: 1 })).json()).destacado; // encadenado
    assert.equal(new Date(reserva.desde).getTime(), new Date(destacado.hasta).getTime());
    assert.equal(reserva.estado, 'programado');
    const antes = await saldo(a.id);
    const r = await ctaPost(a.id, '/plan/comprar', { plan: 'C', periodo: 'mes' });
    assert.equal(r.status, 201);
    const j = await r.json();
    assert.equal(j.tipo, 'subida');
    assert.ok(j.devueltoDestacado.centavos >= 200 + 890 && j.devueltoDestacado.centavos <= 1100);
    assert.equal(await saldo(a.id), antes - j.costo.centavos + j.devueltoDestacado.centavos);
    const est = (await db.query('SELECT estado FROM destacados WHERE cuenta_id = $1', [a.id])).rows.map((x) => x.estado);
    assert.deepEqual(est, ['cancelado', 'cancelado']);
    assert.equal((await estadoSitio()).perfiles.find((x) => x.cuentaId === a.id).destacado, false);
    // la tarea pasa una reserva a activa cuando empieza
    const b = await publicada(prov);
    await conPlan(b.id, 'D', { dias: 20 });
    await cargar(b.id, 10);
    const res = (await (await ctaPost(b.id, '/destacado', { dias: 1, desde: new Date(Date.now() + 3600000).toISOString() })).json()).destacado;
    assert.equal(res.estado, 'programado');
    await db.query("UPDATE destacados SET desde = desde - interval '2 hours', hasta = hasta - interval '2 hours' WHERE id = $1", [res.id]);
    const t = await createPlanes({ pool: db }).ejecutarVencimientos();
    assert.ok(t.destacadosActivados >= 1);
    assert.equal((await db.query('SELECT estado FROM destacados WHERE id = $1', [res.id])).rows[0].estado, 'activo');
    await invariante(a.id);
  });
});

describe('migración 050: frena si quedan Platino o Diamante', () => {
  test('con una suscripción activa B o un pedido abierto A no arranca; con historial vencido sí', async () => {
    const nombre = 'srv2_guard_' + crypto.randomBytes(4).toString('hex');
    await db.query(`CREATE DATABASE ${nombre}`);
    const u = new URL(DATABASE_URL);
    u.pathname = '/' + nombre;
    const g = new pg.Client({ connectionString: u.toString() });
    await g.connect();
    try {
      const leer = (f) => fs.readFile(path.join(APP, 'db', f), 'utf8');
      for (const f of ['schema.sql', '010-cuentas.sql', '020-planes.sql', '030-videos.sql', '040-preview.sql']) await g.query(await leer(f));
      await g.query(`UPDATE ajustes SET valor = '{"mes": {"E": 0, "D": 20, "C": 45, "B": 70, "A": 150, "S": 350}, "semana": {"B": 21, "A": 45, "S": 105}}' WHERE clave = 'precios'`);
      const { rows: [c] } = await g.query("INSERT INTO cuentas (email, pass_hash) VALUES ('g@example.com', 'x') RETURNING id");
      const { rows: [s] } = await g.query("INSERT INTO suscripciones (cuenta_id, plan, periodo, desde, hasta) VALUES ($1, 'B', 'mes', now() - interval '1 day', now() + interval '20 days') RETURNING id", [c.id]);
      await assert.rejects(g.query(await leer('050-planes-v2.sql')), /Planes v2: hay 1 suscripciones activas y 0 pedidos abiertos con Platino \(B\) o Diamante \(A\)/);
      await g.query("UPDATE suscripciones SET estado = 'vencida', hasta = now() - interval '1 day', desde = now() - interval '31 days' WHERE id = $1", [s.id]);
      await g.query("INSERT INTO pedidos (cuenta_id, plan, periodo, monto_usd, referencia) VALUES ($1, 'A', 'semana', 45, 'SR-GGGG')", [c.id]);
      await assert.rejects(g.query(await leer('050-planes-v2.sql')), /0 suscripciones activas y 1 pedidos abiertos/);
      await g.query("UPDATE pedidos SET estado = 'cancelado'");
      await g.query(await leer('050-planes-v2.sql'));
      await g.query(await leer('050-planes-v2.sql')); // idempotente
      await g.query(await leer('060-creditos.sql'));
      await g.query(await leer('060-creditos.sql'));
      const pr = (await g.query("SELECT valor FROM ajustes WHERE clave = 'precios'")).rows[0].valor;
      assert.deepEqual(pr, { mes: { E: 0, D: 35, C: 90, S: 350 }, semana: { C: 27, S: 105 } });
      // el historial con B queda; filas nuevas con B/A o Plata por semana no entran
      assert.equal((await g.query("SELECT count(*)::int AS n FROM suscripciones WHERE plan = 'B'")).rows[0].n, 1);
      await assert.rejects(g.query("INSERT INTO suscripciones (cuenta_id, plan, periodo, desde, hasta) VALUES ($1, 'A', 'mes', now(), now() + interval '1 day')", [c.id]), /suscripciones_plan_v2_ck/);
      await assert.rejects(g.query("INSERT INTO pedidos (cuenta_id, plan, periodo, monto_usd, referencia) VALUES ($1, 'D', 'semana', 1, 'SR-HHHH')", [c.id]), /pedidos_plan_v2_ck/);
      const packs = (await g.query("SELECT valor FROM ajustes WHERE clave = 'packs'")).rows[0].valor;
      assert.equal(packs.length, 5);
    } finally {
      await g.end();
      await db.query(`DROP DATABASE IF EXISTS ${nombre} WITH (FORCE)`);
    }
  });
});
