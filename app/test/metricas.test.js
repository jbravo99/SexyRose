// Admin → Métricas (16/11/2026): GET ${A}/api/metricas (series por período y comparación) y contadores de tráfico sin
// datos personales (POST /api/sitio/evento). Las series se prueban con un "ahora" fijo en 2031 (config.metricasAhora)
// para que los datos de otras pruebas no se mezclen.
//   DATABASE_URL=postgres://postgres@localhost:55432/<db> node --test test/metricas.test.js
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { start } from '../server.js';
import { invalidarSitio } from '../routes/sitio.js';
import { invalidarCatalogos } from '../lib/catalogos.js';
import { esBot } from '../lib/metricas.js';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('Falta DATABASE_URL.'); process.exit(1); }
const HERE = path.dirname(fileURLToPath(import.meta.url));
const db = new pg.Pool({ connectionString: DATABASE_URL, max: 4 });
const A = '/panel-pruebas-metricas-0123456789';
const USER = 'adm'; const PASS = 'clave-de-prueba-larga-123';
const AUTH = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const AHORA = '2031-03-15T15:00:00Z'; // 12:00 en Argentina
let ahora = AHORA;
let instance; let BASE; let tmpData;

const ipAzar = () => '2001:db8::' + crypto.randomBytes(2).toString('hex');
const evento = (body, { ip = ipAzar(), ua = UA, headers = {} } = {}) => fetch(BASE + '/api/sitio/evento', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-sr': '1', origin: BASE, 'user-agent': ua, 'cf-connecting-ip': ip, ...headers },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});
const adm = (p, { auth = AUTH } = {}) => fetch(`${BASE}${A}/api${p}`, { headers: auth ? { authorization: auth } : {} });
const metricas = async (per) => { const r = await adm('/metricas?periodo=' + per); assert.equal(r.status, 200, await r.clone().text()); return r.json(); };
let n = 0;
async function cuenta({ creado = null, publicada = false } = {}) {
  const email = `zzmet-${Date.now()}-${n++}@example.com`;
  const { rows } = await db.query('INSERT INTO cuentas (email, pass_hash, email_verificado, creado) VALUES ($1, \'x\', now(), COALESCE($2::timestamptz, now())) RETURNING id', [email, creado]);
  const id = rows[0].id; const slug = 'zzmet-' + id.slice(0, 8);
  await db.query(`INSERT INTO perfiles (cuenta_id, slug, datos, estado, verificacion) VALUES ($1, $2, $3, $4, $5)`,
    [id, slug, JSON.stringify({ displayName: 'Métrica ' + n }), publicada ? 'publicado' : 'borrador', publicada ? 'verificada' : 'sin_enviar']);
  return { id, slug };
}
const hoy = async () => (await db.query("SELECT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date::text AS d")).rows[0].d;
const filaPerfil = async (id) => (await db.query('SELECT vistas, whatsapp, telegram FROM metricas_perfil_dia WHERE cuenta_id = $1 AND dia = $2::date', [id, await hoy()])).rows[0] || { vistas: 0, whatsapp: 0, telegram: 0 };
const vistasSitio = async () => (await db.query('SELECT vistas FROM metricas_sitio_dia WHERE dia = $1::date', [await hoy()])).rows[0]?.vistas || 0;

async function limpiar() {
  await db.query("DELETE FROM cuentas WHERE email LIKE 'zzmet-%'");
  await db.query("DELETE FROM clientes WHERE email LIKE 'zzmet%'");
  await db.query("DELETE FROM asistente_conversaciones WHERE jid LIKE 'zzmet%'");
  await db.query("DELETE FROM metricas_sitio_dia WHERE dia >= '2030-01-01'");
}

before(async () => {
  tmpData = await fs.mkdtemp(path.join(os.tmpdir(), 'srmet-data-'));
  instance = await start({ prelanzamientoPorDefecto: false,
    port: 0, host: '127.0.0.1', databaseUrl: DATABASE_URL, adminPath: A, adminUser: USER, adminPassword: PASS,
    ipHashSalt: 'sal', siteUrl: 'https://sexyrose.test', dataDir: tmpData, log: () => {}, tareaPlanes: false, tareaContenido: false, tareaCotizacion: false,
    cookieSecure: false, metricasAhora: () => ahora, asistenteEscuchar: false,
  });
  BASE = `http://127.0.0.1:${instance.port}`;
  await instance.ready;
  await limpiar();
});
after(async () => {
  await instance?.close();
  await limpiar();
  await db.end();
  await fs.rm(tmpData, { recursive: true, force: true });
});

/* ---------- Datos de 2031 para las series ---------- */
const S = {};
async function sembrar() {
  const c1 = await cuenta({ creado: '2031-03-10T12:00:00Z' });
  const c2 = await cuenta({ creado: '2031-03-14T12:00:00Z' });
  const c3 = await cuenta({ creado: '2031-03-05T12:00:00Z' }); // período anterior (7 d)
  const c4 = await cuenta({ creado: '2031-01-20T12:00:00Z' });
  Object.assign(S, { c1, c2, c3, c4 });
  // Pedidos de créditos
  const ped = (cta, usd, estado, confirmado, moneda) => db.query(
    `INSERT INTO pedidos_creditos (codigo, cuenta_id, pack_nombre, paga_usd, base_centavos, estado, confirmado, moneda_asistente)
     VALUES ($1, $2, 'Pack', $3, $4, $5, $6, $7)`, ['SR-' + String(9000 + n++), cta.id, usd, Math.round(usd * 100), estado, confirmado, moneda]);
  await ped(c1, 35, 'confirmado', '2031-03-15T10:00:00Z', 'ARS');
  await ped(c1, 95, 'confirmado', '2031-03-10T02:00:00Z', 'USD'); // 9/3 a las 23:00 en Argentina
  await ped(c2, 10, 'confirmado', '2031-03-05T12:00:00Z', null); // período anterior
  await ped(c2, 240, 'confirmado', '2031-03-01T12:00:00Z', null); // antes del período anterior
  await ped(c2, 980, 'pendiente', null, null);
  // Ventas de contenido
  const venta = (cta, tipo, estado, monto, pagado) => db.query(
    `INSERT INTO ventas_contenido (token, cuenta_id, app_id, titulo, monto_centavos, comision_pct, comision_centavos, estado, pagado, tipo)
     VALUES ($1, $2, 'app', 'x', $3, 10, $4, $5, $6, $7)`, [crypto.randomBytes(12).toString('hex'), cta.id, monto, monto / 10, estado, pagado, tipo]);
  await venta(c1, 'pack', 'aprobada', 500000, '2031-03-12T15:00:00Z');
  await venta(c1, 'pedido', 'aprobada', 200000, '2031-03-14T15:00:00Z');
  await venta(c1, 'pack', 'rechazada', 900000, null);
  await venta(c1, 'pack', 'reembolsada', 700000, '2031-03-13T15:00:00Z');
  // Verificaciones: c1 se verifica en el período; c2 ya estaba verificada desde febrero
  const verif = (cta, estado, revisado) => db.query("INSERT INTO verificaciones (cuenta_id, estado, revisado) VALUES ($1, $2, $3)", [cta.id, estado, revisado]);
  await verif(c1, 'aprobada', '2031-03-11T15:00:00Z');
  await verif(c2, 'aprobada', '2031-02-01T15:00:00Z');
  await verif(c2, 'aprobada', '2031-03-12T15:00:00Z');
  await verif(c3, 'rechazada', '2031-03-12T15:00:00Z');
  // Movimientos de créditos
  const mov = (cta, tipo, centavos, creado) => db.query(
    'INSERT INTO creditos_movimientos (cuenta_id, tipo, centavos, saldo_despues, creado) VALUES ($1, $2, $3, 0, $4)', [cta.id, tipo, centavos, creado]);
  await mov(c1, 'compra', 13000, '2031-03-12T15:00:00Z');
  await mov(c1, 'renovacion_plan', -3500, '2031-03-13T15:00:00Z');
  await mov(c1, 'destacado', -500, '2031-03-13T15:00:00Z');
  await mov(c1, 'destacado', 500, '2031-03-14T15:00:00Z'); // devolución
  await mov(c1, 'comision_venta', -5000, '2031-03-14T15:00:00Z');
  await mov(c1, 'ajuste_admin', -1000, '2031-03-14T15:00:00Z');
  await mov(c1, 'semana', -2700, '2031-03-05T15:00:00Z'); // período anterior
  // Suscripciones: c1 Oro → baja a Plata al renovar; c2 Plata termina; c3 Star queda en pausa; c4 renueva al cargar
  const sus = (cta, plan, desde, hasta, estado, nota, creado, periodo = 'mes') => db.query(
    `INSERT INTO suscripciones (cuenta_id, plan, periodo, desde, hasta, estado, origen, nota, creado, renovacion_auto)
     VALUES ($1, $2, $3, $4, $5, $6, 'creditos', $7, $8, true) RETURNING id`, [cta.id, plan, periodo, desde, hasta, estado, nota, creado]);
  await sus(c1, 'C', '2031-02-11T12:00:00Z', '2031-03-13T12:00:00Z', 'vencida', 'Plan Oro', '2031-02-11T12:00:00Z');
  await sus(c1, 'D', '2031-03-13T12:00:00Z', '2031-04-12T12:00:00Z', 'activa', 'Renovación automática (cambio de Oro)', '2031-03-13T11:55:00Z');
  await sus(c2, 'D', '2031-02-10T12:00:00Z', '2031-03-12T12:00:00Z', 'vencida', null, '2031-02-10T12:00:00Z');
  const { rows: [s3] } = await sus(c3, 'S', '2031-02-12T00:00:00Z', '2031-03-14T00:00:00Z', 'vencida', null, '2031-02-12T00:00:00Z');
  await db.query("INSERT INTO avisos_plan (suscripcion_id, tipo, enviado) VALUES ($1, 'pausa', '2031-03-14T00:05:00Z')", [s3.id]);
  await db.query("INSERT INTO renovaciones_pendientes (cuenta_id, plan) VALUES ($1, 'S')", [c3.id]);
  await sus(c4, 'C', '2031-03-14T12:00:00Z', '2031-04-13T12:00:00Z', 'activa', 'Renovación al cargar créditos', '2031-03-14T12:00:00Z');
  await sus(c4, 'S', '2031-03-14T12:00:00Z', '2031-03-21T12:00:00Z', 'cancelada', null, '2031-03-14T12:00:00Z', 'semana');
  // Interesados, pedidos personalizados y asistente
  const cli = async (creado) => (await db.query(
    "INSERT INTO clientes (usuario, usuario_norm, email, pass_hash, acepto_terminos, creado) VALUES ($1, $1, $2, 'x', now(), $3) RETURNING id",
    ['zzmet' + n, `zzmet${n++}@example.com`, creado])).rows[0].id;
  const k1 = await cli('2031-03-10T15:00:00Z'); await cli('2031-03-11T15:00:00Z'); await cli('2031-03-03T15:00:00Z');
  await db.query("INSERT INTO solicitudes (cliente_id, cuenta_id, texto, creado) VALUES ($1, $2, 'hola', '2031-03-11T15:00:00Z')", [k1, c1.id]);
  const { rows: [cv] } = await db.query("INSERT INTO asistente_conversaciones (jid, creado) VALUES ($1, '2031-03-12T15:00:00Z') RETURNING id", ['zzmet' + n++ + '@s.whatsapp.net']);
  for (const [dir, origen] of [['in', 'usuario'], ['in', 'usuario'], ['out', 'bot']]) {
    await db.query("INSERT INTO asistente_mensajes (conversacion_id, dir, origen, texto, creado) VALUES ($1, $2, $3, 'x', '2031-03-12T15:00:00Z')", [cv.id, dir, origen]);
  }
  // Tráfico (por día, fecha argentina)
  const tr = (cta, dia, v, w, t) => db.query('INSERT INTO metricas_perfil_dia (cuenta_id, dia, vistas, whatsapp, telegram) VALUES ($1, $2, $3, $4, $5)', [cta.id, dia, v, w, t]);
  await tr(c1, '2031-03-15', 10, 2, 1); await tr(c1, '2031-03-09', 5, 1, 0); await tr(c1, '2031-03-08', 7, 0, 0);
  await tr(c2, '2031-03-14', 20, 0, 0);
  // 1/3: antes del período anterior (7 d), para que la medición cubra el período anterior entero aun con la base vacía
  await db.query("INSERT INTO metricas_sitio_dia (dia, vistas) VALUES ('2031-03-15', 50), ('2031-03-08', 30), ('2031-03-01', 4)");
}

describe('Admin → Métricas: API', () => {
  before(sembrar);

  test('pide la contraseña del panel y valida el período', async () => {
    assert.equal((await adm('/metricas?periodo=7d', { auth: null })).status, 401);
    assert.equal((await adm('/metricas?periodo=1a')).status, 400);
    assert.equal((await adm('/metricas')).status, 200); // 30 d por defecto
  });

  test('7 días: tramos por día en hora Argentina y comparación con los 7 días anteriores', async () => {
    const d = await metricas('7d');
    assert.equal(d.granularidad, 'dia');
    assert.deepEqual(d.tramos, ['2031-03-09', '2031-03-10', '2031-03-11', '2031-03-12', '2031-03-13', '2031-03-14', '2031-03-15']);
    assert.equal(d.desde, '2031-03-09T03:00:00.000Z');
    assert.equal(d.anteriorDesde, '2031-03-02T15:00:00.000Z');
    // Ingresos
    const I = d.ingresos;
    assert.deepEqual(I.creditosUsd, { serie: [95, 0, 0, 0, 0, 0, 35], total: 130, anterior: 10 });
    assert.equal(I.pedidos.total, 2); assert.equal(I.pedidos.anterior, 1);
    assert.equal(I.porMoneda.ARS.total, 35); assert.equal(I.porMoneda.USD.total, 95); assert.equal(I.porMoneda.sin.total, 0);
    assert.equal(I.porMoneda.sin.anterior, 10);
    assert.deepEqual(I.contenido.ventas, { serie: [0, 0, 0, 1, 0, 1, 0], total: 2, anterior: 0 });
    assert.equal(I.contenido.monto.total, 7000); assert.equal(I.contenido.comision.total, 700);
    // Acompañantes
    const Ac = d.acompanantes;
    assert.equal(Ac.registros.total, 2); assert.equal(Ac.registros.anterior, 1);
    assert.deepEqual(Ac.registros.serie, [0, 1, 0, 0, 0, 1, 0]);
    assert.equal(Ac.verificadas.total, 1, 'solo la primera aprobación de cada cuenta');
    assert.deepEqual(Ac.planesPagos, { D: [1, 1, 1, 0, 1, 1, 1], C: [1, 1, 1, 1, 0, 1, 1], S: [1, 1, 1, 1, 0, 0, 0] });
    const { porPlan, ahora: foto } = Ac;
    assert.equal(porPlan.E + porPlan.D + porPlan.C + porPlan.S, foto.publicadas);
    // Créditos
    const K = d.creditos;
    assert.equal(K.gastados.total, 85); assert.equal(K.gastados.anterior, 27);
    assert.equal(K.porTipo.renovacion_plan.total, 35); assert.equal(K.porTipo.destacado.total, 0); assert.equal(K.porTipo.comision_venta.total, 50);
    assert.equal(K.porTipo.semana.anterior, 27);
    assert.equal(K.renovaciones.total, 2); assert.equal(K.bajasAlRenovar.total, 1);
    assert.equal(K.pausas.total, 1);
    assert.ok(K.pausadasAhora >= 1);
    assert.deepEqual(K.terminados.serie, [0, 0, 0, 1, 0, 0, 0], 'Plata de c2 termina el 12/3; Oro de c1 siguió (Plata) y Star de c3 quedó en pausa');
    // Interesados y contenido
    const N = d.interesados;
    assert.equal(N.registros.total, 2); assert.equal(N.registros.anterior, 1);
    assert.equal(N.packs.total, 1); assert.equal(N.pedidosPagados.total, 1); assert.equal(N.pedidosCreados.total, 1);
    assert.equal(N.conversaciones.total, 1); assert.equal(N.mensajes.total, 2); assert.equal(N.mensajesDesde, null);
    // Tráfico
    const F = d.trafico;
    assert.deepEqual(F.vistas, { serie: [5, 0, 0, 0, 0, 20, 10], total: 35, anterior: 7 });
    assert.equal(F.whatsapp.total, 3); assert.equal(F.telegram.total, 1);
    assert.deepEqual(F.sitio, { serie: [0, 0, 0, 0, 0, 0, 50], total: 50, anterior: 30 });
    assert.deepEqual(F.topVistas.map((x) => [x.cuentaId, x.vistas]), [[S.c2.id, 20], [S.c1.id, 15]]);
    assert.deepEqual(F.topClics.map((x) => [x.cuentaId, x.clics, x.slug]), [[S.c1.id, 4, S.c1.slug]]);
    assert.match(F.topVistas[0].nombre, /^Métrica/);
    assert.ok(F.desdeMedicion <= '2031-03-02'); assert.equal(F.comparable, true); assert.equal(F.dias.anteriorDesde, '2031-03-02');
  });

  test('30 días, 90 días (semanas) y 12 meses (meses)', async () => {
    const d30 = await metricas('30d');
    assert.equal(d30.tramos.length, 30); assert.equal(d30.tramos[0], '2031-02-14');
    assert.equal(d30.ingresos.creditosUsd.total, 380);
    assert.equal(d30.trafico.vistas.total, 42);
    const d90 = await metricas('90d');
    assert.equal(d90.granularidad, 'semana'); assert.equal(d90.tramos.length, 13);
    assert.equal(d90.tramos[12], '2031-03-10', 'semanas de lunes a domingo');
    assert.equal(d90.ingresos.creditosUsd.total, 380);
    assert.equal(d90.ingresos.creditosUsd.serie.reduce((a, b) => a + b, 0), 380);
    assert.deepEqual(d90.ingresos.creditosUsd.serie.slice(10), [240, 105, 35], 'el pedido del domingo 9/3 a las 23 h (hora Argentina) va a la semana del 3/3');
    const d12 = await metricas('12m');
    assert.equal(d12.granularidad, 'mes'); assert.equal(d12.tramos.length, 12);
    assert.equal(d12.tramos[0], '2030-04-01'); assert.equal(d12.tramos[11], '2031-03-01');
    assert.equal(d12.ingresos.creditosUsd.serie[11], 380);
    assert.equal(d12.acompanantes.registros.serie[9], 1, 'enero');
    assert.ok(d12.interesados.mensajesDesde, 'los mensajes del asistente solo existen 90 días');
  });

  test('sin datos: series en cero, sin tops y sin errores', async () => {
    ahora = '2040-06-15T15:00:00Z';
    try {
      for (const per of ['7d', '30d', '90d', '12m']) {
        const d = await metricas(per);
        assert.ok(d.tramos.length >= 7);
        assert.equal(d.ingresos.creditosUsd.total, 0); assert.equal(d.ingresos.creditosUsd.anterior, 0);
        assert.ok(d.ingresos.creditosUsd.serie.every((v) => v === 0));
        assert.equal(d.trafico.vistas.total, 0); assert.deepEqual(d.trafico.topVistas, []); assert.deepEqual(d.trafico.topClics, []);
        assert.ok(Object.values(d.acompanantes.planesPagos).every((s) => s.every((v) => v === 0)));
        assert.equal(d.creditos.terminados.total, 0);
      }
    } finally { ahora = AHORA; }
  });
});

describe('Tráfico: POST /api/sitio/evento', () => {
  let p;
  before(async () => { p = await cuenta({ publicada: true }); invalidarSitio(); });

  test('suma visitas, clics y páginas vistas por día', async () => {
    const sitio0 = await vistasSitio();
    assert.equal((await evento({ tipo: 'vista', perfil: p.slug })).status, 204);
    assert.equal((await evento({ tipo: 'whatsapp', perfil: p.slug })).status, 204);
    assert.equal((await evento({ tipo: 'whatsapp', perfil: p.slug })).status, 204);
    assert.equal((await evento({ tipo: 'telegram', perfil: p.slug })).status, 204);
    assert.equal((await evento({ tipo: 'pagina' })).status, 204);
    assert.deepEqual(await filaPerfil(p.id), { vistas: 1, whatsapp: 2, telegram: 1 });
    assert.equal(await vistasSitio(), sitio0 + 2, 'la visita al perfil también es una página vista');
  });

  test('la misma conexión repitiendo el mismo clic: desde el 4.º en la hora no suma', async () => {
    const ip = ipAzar();
    const antes = (await filaPerfil(p.id)).telegram;
    for (let i = 0; i < 5; i++) assert.equal((await evento({ tipo: 'telegram', perfil: p.slug }, { ip })).status, 204);
    assert.equal((await filaPerfil(p.id)).telegram, antes + 3);
  });

  test('rechaza tipos, perfiles y orígenes inválidos', async () => {
    const antes = await filaPerfil(p.id);
    assert.equal((await evento({ tipo: 'compra', perfil: p.slug })).status, 400);
    assert.equal((await evento({ tipo: 'vista' })).status, 400);
    assert.equal((await evento({ tipo: 'vista', perfil: 'NO VALE' })).status, 400);
    assert.equal((await evento({ tipo: 'vista', perfil: 'zzmet-no-existe' })).status, 404);
    const borrador = await cuenta(); invalidarSitio();
    assert.equal((await evento({ tipo: 'vista', perfil: borrador.slug })).status, 404, 'solo perfiles publicados');
    assert.equal((await evento({ tipo: 'vista', perfil: p.slug }, { headers: { 'x-sr': '' } })).status, 403);
    assert.equal((await evento({ tipo: 'vista', perfil: p.slug }, { headers: { origin: 'https://otro.example' } })).status, 403);
    assert.equal((await evento('[1]')).status, 415);
    assert.equal((await evento({ tipo: 'pagina', relleno: 'x'.repeat(3000) })).status, 413);
    assert.deepEqual(await filaPerfil(p.id), antes);
  });

  test('robots y navegadores automáticos no cuentan', async () => {
    assert.equal(esBot('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'), true);
    assert.equal(esBot('facebookexternalhit/1.1'), true);
    assert.equal(esBot(''), true);
    assert.equal(esBot(UA), false);
    const antes = await filaPerfil(p.id); const sitio0 = await vistasSitio();
    for (const ua of ['Mozilla/5.0 (compatible; Googlebot/2.1)', 'curl/8.4.0', 'Mozilla/5.0 HeadlessChrome/120.0', '']) {
      assert.equal((await evento({ tipo: 'vista', perfil: p.slug }, { ua })).status, 204);
    }
    assert.deepEqual(await filaPerfil(p.id), antes);
    assert.equal(await vistasSitio(), sitio0);
  });

  test('límite por conexión: 120 eventos cada 10 minutos', async () => {
    const ip = ipAzar();
    for (let i = 0; i < 120; i++) assert.equal((await evento({ tipo: 'pagina' }, { ip })).status, 204);
    assert.equal((await evento({ tipo: 'pagina' }, { ip })).status, 429);
    assert.equal((await evento({ tipo: 'pagina' })).status, 204, 'otra conexión sigue pudiendo');
  });

  test('solo se guardan totales por día: ninguna columna con IP, navegador ni identificadores', async () => {
    const { rows } = await db.query(
      "SELECT table_name, column_name FROM information_schema.columns WHERE table_name IN ('metricas_perfil_dia', 'metricas_sitio_dia') ORDER BY table_name, ordinal_position");
    assert.deepEqual(rows.map((r) => `${r.table_name}.${r.column_name}`), [
      'metricas_perfil_dia.cuenta_id', 'metricas_perfil_dia.dia', 'metricas_perfil_dia.vistas', 'metricas_perfil_dia.whatsapp', 'metricas_perfil_dia.telegram',
      'metricas_sitio_dia.dia', 'metricas_sitio_dia.vistas',
    ]);
  });

  test('home provisoria (pre-lanzamiento): no cuenta nada y no falla', async () => {
    const previo = (await db.query("SELECT valor FROM ajustes WHERE clave = 'prelanzamiento'")).rows[0];
    await db.query("INSERT INTO ajustes (clave, valor) VALUES ('prelanzamiento', '{\"activo\": true}') ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor");
    invalidarCatalogos(); invalidarSitio();
    try {
      const antes = await filaPerfil(p.id); const sitio0 = await vistasSitio();
      assert.equal((await evento({ tipo: 'vista', perfil: p.slug })).status, 204);
      assert.equal((await evento({ tipo: 'pagina' })).status, 204);
      assert.deepEqual(await filaPerfil(p.id), antes);
      assert.equal(await vistasSitio(), sitio0);
    } finally {
      if (previo) await db.query("UPDATE ajustes SET valor = $1 WHERE clave = 'prelanzamiento'", [previo.valor]);
      else await db.query("DELETE FROM ajustes WHERE clave = 'prelanzamiento'");
      invalidarCatalogos(); invalidarSitio();
    }
  });
});

describe('builds: el aviso de tráfico solo viaja al sitio real', () => {
  test('ni la demo ni el admin incluyen prod-metricas.js', async () => {
    const MVP = path.join(HERE, '..', '..', 'mvp');
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'srmet-build-'));
    try {
      await fs.cp(path.join(MVP, 'src'), path.join(tmp, 'src'), { recursive: true });
      await fs.copyFile(path.join(MVP, 'build.py'), path.join(tmp, 'build.py'));
      const build = (env) => {
        execFileSync('python3', [path.join(tmp, 'build.py')], { cwd: tmp, env: { ...process.env, ...env }, stdio: 'ignore' });
      };
      build({ HH_TARGET: 'sitio' });
      const sitio = await fs.readFile(path.join(tmp, 'build', 'sitio.html'), 'utf8');
      assert.match(sitio, /\/api\/sitio\/evento/);
      build({ HH_TARGET: 'sitio', HH_SITIO_DEMO: '1' });
      const demo = await fs.readFile(path.join(tmp, 'build', 'sitio.html'), 'utf8');
      assert.match(demo, /prod-demo\.js/);
      assert.doesNotMatch(demo, /\/api\/sitio\/evento|prod-metricas\.js/);
      build({ HH_TARGET: 'admin' });
      const admin = await fs.readFile(path.join(tmp, 'build', 'admin.html'), 'utf8');
      assert.match(admin, /prod-admin-metricas\.js/);
      assert.doesNotMatch(admin, /\/api\/sitio\/evento|prod-metricas\.js/);
    } finally { await fs.rm(tmp, { recursive: true, force: true }); }
  });
});
