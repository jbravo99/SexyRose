// Mis números (panel de la acompañante), de dónde vienen las visitas (Admin → Métricas → Tráfico) y Exportar a Excel
// (16/11/2026). Las series se prueban con un "ahora" fijo en 2032 (config.metricasAhora).
//   DATABASE_URL=postgres://postgres@localhost:55432/<db> node --test test/numeros.test.js
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { start } from '../server.js';
import { invalidarSitio } from '../routes/sitio.js';
import { crearXlsx } from '../lib/xlsx.js';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('Falta DATABASE_URL.'); process.exit(1); }
const HERE = path.dirname(fileURLToPath(import.meta.url));
const MVP = path.join(HERE, '..', '..', 'mvp');
const db = new pg.Pool({ connectionString: DATABASE_URL, max: 4 });
const A = '/panel-pruebas-numeros-0123456789';
const USER = 'adm'; const PASS = 'clave-de-prueba-larga-123';
const AUTH = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const AHORA = '2032-06-16T15:00:00Z'; // miércoles, 12:00 en Argentina
let instance; let BASE; let tmpData;

let n = 0;
async function cuenta({ creado = null, publicada = false, nombre = 'Números' } = {}) {
  const email = `zznum-${Date.now()}-${n++}@example.com`;
  const { rows } = await db.query("INSERT INTO cuentas (email, pass_hash, email_verificado, creado) VALUES ($1, 'x', now(), COALESCE($2::timestamptz, now())) RETURNING id", [email, creado]);
  const id = rows[0].id; const slug = 'zznum-' + id.slice(0, 8);
  await db.query('INSERT INTO perfiles (cuenta_id, slug, datos, estado, verificacion) VALUES ($1, $2, $3, $4, $5)',
    [id, slug, JSON.stringify({ displayName: nombre }), publicada ? 'publicado' : 'borrador', publicada ? 'verificada' : 'sin_enviar']);
  return { id, slug };
}
const cookies = new Map();
async function cookieDe(id) {
  if (!cookies.has(id)) {
    const t = crypto.randomBytes(24).toString('base64url');
    await db.query("INSERT INTO sesiones (token_hash, cuenta_id, expira) VALUES (sha256($1::bytea), $2, now() + interval '1 hour')", [Buffer.from(t), id]);
    cookies.set(id, 'sr_sesion=' + t);
  }
  return cookies.get(id);
}
const numeros = async (id, per) => {
  const r = await fetch(`${BASE}/api/cuenta/numeros${per ? '?periodo=' + per : ''}`, { headers: id ? { cookie: await cookieDe(id) } : {} });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const adm = (p, { auth = AUTH } = {}) => fetch(`${BASE}${A}/api${p}`, { headers: auth ? { authorization: auth } : {} });
const evento = (body, { ip = '2001:db8::' + crypto.randomBytes(2).toString('hex') } = {}) => fetch(BASE + '/api/sitio/evento', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-sr': '1', origin: BASE, 'user-agent': UA, 'cf-connecting-ip': ip }, body: JSON.stringify(body),
});
const hoy = async () => (await db.query("SELECT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date::text AS d")).rows[0].d;

async function limpiar() {
  await db.query("DELETE FROM cuentas WHERE email LIKE 'zznum-%'");
  await db.query("DELETE FROM metricas_sitio_dia WHERE dia >= '2031-05-01'");
  await db.query("DELETE FROM metricas_origen_dia WHERE dia >= '2031-05-01'");
}

before(async () => {
  tmpData = await fs.mkdtemp(path.join(os.tmpdir(), 'srnum-data-'));
  instance = await start({ prelanzamientoPorDefecto: false,
    port: 0, host: '127.0.0.1', databaseUrl: DATABASE_URL, adminPath: A, adminUser: USER, adminPassword: PASS,
    ipHashSalt: 'sal', siteUrl: 'https://sexyrose.test', dataDir: tmpData, log: () => {}, tareaPlanes: false, tareaContenido: false, tareaCotizacion: false,
    cookieSecure: false, metricasAhora: () => AHORA, asistenteEscuchar: false,
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

/* ---------- Datos de 2032 ---------- */
const S = {};
async function sembrar() {
  S.ana = await cuenta({ creado: '2031-06-01T12:00:00Z', publicada: true, nombre: 'Ana Números' });
  S.bea = await cuenta({ creado: '2031-06-01T12:00:00Z', publicada: true, nombre: 'Bea Números' });
  S.cami = await cuenta({ creado: '2032-06-12T15:00:00Z', publicada: true }); // cuenta nueva: el período anterior no existía
  S.dani = await cuenta({ creado: '2031-06-01T12:00:00Z' }); // sin datos
  const tr = (c, dia, v, w, t) => db.query('INSERT INTO metricas_perfil_dia (cuenta_id, dia, vistas, whatsapp, telegram) VALUES ($1, $2, $3, $4, $5)', [c.id, dia, v, w, t]);
  await tr(S.ana, '2032-06-16', 10, 2, 1); await tr(S.ana, '2032-06-12', 5, 1, 0);
  await tr(S.ana, '2032-06-05', 4, 0, 1); // período anterior (7 d)
  await tr(S.ana, '2032-05-01', 3, 0, 0);
  await tr(S.bea, '2032-06-16', 100, 50, 9); await tr(S.bea, '2032-06-05', 70, 1, 1);
  await tr(S.cami, '2032-06-13', 3, 1, 0);
  // Medición del sitio desde el 1/6/2031 (así el período anterior de 7, 30 y 90 días se midió entero)
  await db.query("INSERT INTO metricas_sitio_dia (dia, vistas) VALUES ('2031-06-01', 1), ('2032-06-16', 20)");
  // Orígenes (solo admin): páginas vistas del 16/6 → 6 buscadores + 3 redes; el resto (11) queda "sin dato"
  await db.query("INSERT INTO metricas_origen_dia (dia, origen, vistas) VALUES ('2032-06-16', 'buscadores', 6), ('2032-06-16', 'redes', 3)");
  await db.query("INSERT INTO metricas_perfil_origen_dia (cuenta_id, dia, origen, vistas) VALUES ($1, '2032-06-16', 'buscadores', 4)", [S.ana.id]);
  await db.query(`INSERT INTO pedidos_creditos (codigo, cuenta_id, pack_nombre, paga_usd, base_centavos, estado, confirmado, moneda_asistente)
                  VALUES ($1, $2, 'Pack', 50, 5000, 'confirmado', '2032-06-15T15:00:00Z', 'ARS')`, ['SR-N' + crypto.randomBytes(3).toString('hex'), S.ana.id]);
}

describe('Mis números: GET /api/cuenta/numeros', () => {
  before(sembrar);

  test('pide sesión y valida el período (sin 12 meses)', async () => {
    assert.equal((await numeros(null, '7d')).status, 401);
    assert.equal((await numeros(S.ana.id, '12m')).status, 400);
    assert.equal((await numeros(S.ana.id, 'x')).status, 400);
    const d = (await numeros(S.ana.id)).body;
    assert.equal(d.periodo, '30d', '30 días por defecto');
  });

  test('7 días: solo sus números, por día, con el período anterior', async () => {
    const { status, body: d } = await numeros(S.ana.id, '7d');
    assert.equal(status, 200);
    assert.equal(d.granularidad, 'dia');
    assert.deepEqual(d.tramos, ['2032-06-10', '2032-06-11', '2032-06-12', '2032-06-13', '2032-06-14', '2032-06-15', '2032-06-16']);
    assert.deepEqual(d.vistas, { serie: [0, 0, 5, 0, 0, 0, 10], total: 15, anterior: 4 });
    assert.deepEqual(d.whatsapp, { serie: [0, 0, 1, 0, 0, 0, 2], total: 3, anterior: 0 });
    assert.deepEqual(d.telegram, { serie: [0, 0, 0, 0, 0, 0, 1], total: 1, anterior: 1 });
    assert.deepEqual(d.clics, { serie: [0, 0, 1, 0, 0, 0, 3], total: 4, anterior: 1 });
    assert.deepEqual(d.contacto, { total: 26.7, anterior: 25 });
    assert.equal(d.comparable, true); assert.equal(d.hayDatos, true);
    assert.equal(d.desde, '2032-06-10'); assert.equal(d.hasta, '2032-06-16'); assert.equal(d.anteriorDesde, '2032-06-03');
    // Nada de otras cuentas, orígenes ni posiciones
    const txt = JSON.stringify(d);
    assert.doesNotMatch(txt, /origen|buscadores|redes|directo|top|ranking|posicion|cuentaId|slug/i);
    assert.ok(!txt.includes(S.bea.id) && !txt.includes(S.bea.slug));
    const bea = (await numeros(S.bea.id, '7d')).body;
    assert.equal(bea.vistas.total, 100, 'cada una ve lo suyo');
  });

  test('30 días por día y 90 días por semana (de lunes a domingo)', async () => {
    const d30 = (await numeros(S.ana.id, '30d')).body;
    assert.equal(d30.tramos.length, 30); assert.equal(d30.tramos[0], '2032-05-18');
    assert.equal(d30.vistas.total, 19); assert.equal(d30.vistas.anterior, 3); assert.equal(d30.comparable, true);
    const d90 = (await numeros(S.ana.id, '90d')).body;
    assert.equal(d90.granularidad, 'semana'); assert.equal(d90.tramos.length, 13);
    assert.equal(d90.tramos[0], '2032-03-22'); assert.equal(d90.tramos[12], '2032-06-14');
    assert.deepEqual(d90.vistas.serie, [0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 4, 5, 10]);
    assert.equal(d90.vistas.total, 22); assert.equal(d90.comparable, true);
  });

  test('cuenta nueva: sin comparación (el período anterior no se midió para ella)', async () => {
    const d = (await numeros(S.cami.id, '7d')).body;
    assert.equal(d.comparable, false);
    assert.equal(d.desdeMedicion, '2032-06-12');
    assert.equal(d.vistas.total, 3); assert.equal(d.contacto.anterior, null);
  });

  test('sin datos todavía: hayDatos false y todo en cero', async () => {
    const d = (await numeros(S.dani.id, '30d')).body;
    assert.equal(d.hayDatos, false);
    assert.equal(d.vistas.total, 0); assert.equal(d.clics.total, 0); assert.equal(d.contacto.total, null);
    assert.ok(d.vistas.serie.every((v) => v === 0));
  });
});

describe('De dónde vienen las visitas (solo admin)', () => {
  let p;
  before(async () => { p = await cuenta({ publicada: true }); invalidarSitio(); });
  const filaOrigen = async (o) => (await db.query('SELECT vistas FROM metricas_origen_dia WHERE dia = $1::date AND origen = $2', [await hoy(), o])).rows[0]?.vistas || 0;
  const filaPerfilOrigen = async (o) => (await db.query('SELECT vistas FROM metricas_perfil_origen_dia WHERE cuenta_id = $1 AND dia = $2::date AND origen = $3', [p.id, await hoy(), o])).rows[0]?.vistas || 0;

  test('el aviso guarda solo la categoría por día; sin origen = sin dato; valida la lista fija', async () => {
    const b0 = await filaOrigen('buscadores'); const r0 = await filaOrigen('redes'); const d0 = await filaOrigen('directo');
    assert.equal((await evento({ tipo: 'pagina', origen: 'buscadores' })).status, 204);
    assert.equal((await evento({ tipo: 'vista', perfil: p.slug, origen: 'redes' })).status, 204);
    assert.equal((await evento({ tipo: 'whatsapp', perfil: p.slug, origen: 'directo' })).status, 204);
    assert.equal((await evento({ tipo: 'pagina' })).status, 204, 'clientes viejos sin origen siguen contando');
    assert.equal(await filaOrigen('buscadores'), b0 + 1);
    assert.equal(await filaOrigen('redes'), r0 + 1);
    assert.equal(await filaOrigen('directo'), d0, 'los clics no son visitas: no suman origen');
    assert.equal(await filaPerfilOrigen('redes'), 1);
    for (const o of ['google', 'https://www.google.com/', 'Buscadores', '', 7, ['redes']]) {
      assert.equal((await evento({ tipo: 'pagina', origen: o })).status, 400, `origen ${JSON.stringify(o)}`);
    }
  });

  test('solo totales por día y categoría: ninguna columna con dirección, dominio, IP ni identificadores', async () => {
    const { rows } = await db.query(
      "SELECT table_name, column_name FROM information_schema.columns WHERE table_name IN ('metricas_origen_dia', 'metricas_perfil_origen_dia') ORDER BY table_name, ordinal_position");
    assert.deepEqual(rows.map((r) => `${r.table_name}.${r.column_name}`), [
      'metricas_origen_dia.dia', 'metricas_origen_dia.origen', 'metricas_origen_dia.vistas',
      'metricas_perfil_origen_dia.cuenta_id', 'metricas_perfil_origen_dia.dia', 'metricas_perfil_origen_dia.origen', 'metricas_perfil_origen_dia.vistas',
    ]);
    await assert.rejects(db.query("INSERT INTO metricas_origen_dia (dia, origen, vistas) VALUES ('2032-01-01', 'google.com', 1)"), /check/i);
  });

  test('Admin → Métricas: páginas vistas por categoría y "sin dato" (lo de antes o sin origen)', async () => {
    const d = await (await adm('/metricas?periodo=7d')).json();
    const O = d.trafico.origenes;
    assert.deepEqual(O.paginas.buscadores.serie, [0, 0, 0, 0, 0, 0, 6]);
    assert.equal(O.paginas.redes.total, 3); assert.equal(O.paginas.directo.total, 0);
    assert.deepEqual(O.paginas.sinDato, { serie: [0, 0, 0, 0, 0, 0, 11], total: 11, anterior: 0 });
    assert.equal(O.perfiles.buscadores.total, 4);
    assert.equal(O.perfiles.sinDato.total, d.trafico.vistas.total - 4);
    assert.equal(O.desde <= '2032-06-16', true);
  });
});

/* ---------- El clasificador del navegador (mvp/src/prod-metricas.js) en una caja aislada ---------- */
async function cajaBeacon({ href = 'https://sexyrose.net/', referrer = '', store = new Map(), storageRoto = false } = {}) {
  const src = await fs.readFile(path.join(MVP, 'src', 'prod-metricas.js'), 'utf8');
  const enviados = []; const oyentes = {};
  const sessionStorage = {
    getItem(k) { if (storageRoto) throw new Error('bloqueado'); return store.has(k) ? store.get(k) : null; },
    setItem(k, v) { if (storageRoto) throw new Error('bloqueado'); store.set(k, String(v)); },
  };
  const u = new URL(href);
  const ctx = {
    HH_PROD: 'sitio', URL, JSON, Promise,
    location: { href, pathname: u.pathname, hostname: u.hostname },
    document: { referrer, addEventListener(t, fn) { (oyentes[t] = oyentes[t] || []).push(fn); } },
    sessionStorage,
    fetch(url, opt) { enviados.push(JSON.parse(opt.body)); return Promise.resolve({}); },
    HH: { db: { _ajustes: {} }, me: () => null, profileBySlug: (s) => ({ slug: s, userId: 'u-' + s }), profileOf: (id) => ({ slug: 'p-' + id, userId: 'u-' + id }) },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  const render = (p) => (oyentes['hh:rendered'] || []).forEach((fn) => fn({ detail: { path: p } }));
  const clic = (id) => (oyentes.click || []).forEach((fn) => fn({ target: { closest: () => ({ getAttribute: (a) => (a === 'data-track' ? 'wa' : id) }) } }));
  return { ctx, enviados, render, clic, store };
}

describe('Origen de la visita: clasificación en el navegador', () => {
  let clasificar;
  before(async () => { clasificar = (await cajaBeacon()).ctx.HH.origenTrafico.clasificar; });
  const c = (ref, url = 'https://sexyrose.net/') => clasificar(url, ref, 'sexyrose.net');

  test('buscadores, redes, WhatsApp y Telegram, otros sitios y directo', () => {
    for (const r of ['https://www.google.com/', 'https://www.google.com.ar/', 'https://google.es/search?q=x', 'https://www.bing.com/', 'https://duckduckgo.com/',
      'https://search.yahoo.com/', 'https://yandex.ru/', 'https://www.ecosia.org/', 'https://search.brave.com/', 'android-app://com.google.android.googlequicksearchbox/']) assert.equal(c(r), 'buscadores', r);
    for (const r of ['https://www.instagram.com/', 'https://l.instagram.com/?u=x', 'https://m.facebook.com/', 'https://l.facebook.com/l.php', 'https://lm.facebook.com/',
      'https://t.co/abc', 'https://x.com/', 'https://twitter.com/', 'https://www.tiktok.com/', 'https://www.reddit.com/', 'https://out.reddit.com/', 'android-app://com.instagram.android/']) assert.equal(c(r), 'redes', r);
    for (const r of ['https://wa.me/', 'https://web.whatsapp.com/', 'https://api.whatsapp.com/', 'https://t.me/canal', 'https://web.telegram.org/', 'android-app://org.telegram.messenger/']) assert.equal(c(r), 'mensajeria', r);
    for (const r of ['https://foro.example.com/hilo', 'https://googleusercontent.com.evil.example/', 'https://notgoogle.example/', 'android-app://com.algo.app/', 'no es una url']) assert.equal(c(r), 'otros', r);
    assert.equal(c(''), 'directo');
  });

  test('el propio sitio no es un origen (navegación interna)', () => {
    assert.equal(c('https://sexyrose.net/perfil/ana'), null);
    assert.equal(c('https://www.sexyrose.net/'), null);
    assert.equal(clasificar('http://127.0.0.1:3000/', 'http://127.0.0.1:3000/cerca', '127.0.0.1'), null);
  });

  test('utm_source manda y se lleva a las mismas categorías (desconocido → otros sitios)', () => {
    assert.equal(c('https://www.instagram.com/', 'https://sexyrose.net/?utm_source=google&utm_medium=cpc'), 'buscadores');
    assert.equal(c('', 'https://sexyrose.net/?utm_source=ig'), 'redes');
    assert.equal(c('', 'https://sexyrose.net/?utm_source=Facebook_Ads'), 'redes');
    assert.equal(c('', 'https://sexyrose.net/?utm_source=instagram.com'), 'redes');
    assert.equal(c('', 'https://sexyrose.net/perfil/ana?utm_source=whatsapp'), 'mensajeria');
    assert.equal(c('https://www.google.com/', 'https://sexyrose.net/?utm_source=newsletter'), 'otros');
    assert.equal(c('', 'https://sexyrose.net/?utm_source=volante-zona-norte'), 'otros');
  });

  test('la pestaña conserva el primer origen: la navegación interna no lo convierte en "Directo"', async () => {
    const store = new Map();
    const b1 = await cajaBeacon({ href: 'https://sexyrose.net/', referrer: 'https://www.google.com/', store });
    b1.render('inicio'); b1.render('perfil.ana'); b1.render('lugar.caba');
    b1.clic('c1');
    assert.deepEqual(b1.enviados, [
      { tipo: 'pagina', origen: 'buscadores' },
      { tipo: 'vista', perfil: 'ana', origen: 'buscadores' },
      { tipo: 'pagina', origen: 'buscadores' },
      { tipo: 'whatsapp', perfil: 'p-c1' },
    ]);
    assert.deepEqual([...store.entries()].filter(([k]) => k === 'sr_origen'), [['sr_origen', 'buscadores']], 'solo la categoría queda guardada');
    // Recarga dentro del sitio (referrer propio) en la misma pestaña: sigue siendo buscadores
    const b2 = await cajaBeacon({ href: 'https://sexyrose.net/perfil/bea', referrer: 'https://sexyrose.net/', store });
    b2.render('perfil.bea');
    assert.deepEqual(b2.enviados, [{ tipo: 'vista', perfil: 'bea', origen: 'buscadores' }]);
    // Sin almacenamiento y llegando desde el propio sitio: no se sabe → sin origen ("sin dato"), nunca "directo"
    const b3 = await cajaBeacon({ href: 'https://sexyrose.net/', referrer: 'https://sexyrose.net/perfil/ana', storageRoto: true });
    b3.render('inicio');
    assert.deepEqual(b3.enviados, [{ tipo: 'pagina' }]);
    // Pestaña nueva sin sitio de origen → directo
    const b4 = await cajaBeacon({ href: 'https://sexyrose.net/', referrer: '' });
    b4.render('inicio');
    assert.deepEqual(b4.enviados, [{ tipo: 'pagina', origen: 'directo' }]);
    // Nunca viaja la dirección ni el dominio de donde vino
    assert.doesNotMatch(JSON.stringify([b1.enviados, b2.enviados]), /google|http/);
  });
});

/* ---------- Exportar a Excel ---------- */
// Lector mínimo de .xlsx para la prueba: ZIP (directorio central + deflate) y celdas de cada hoja
function leerZip(buf) {
  let eocd = buf.length - 22; while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  assert.ok(eocd >= 0, 'fin del ZIP');
  const total = buf.readUInt16LE(eocd + 10); let p = buf.readUInt32LE(eocd + 16);
  const out = new Map();
  for (let i = 0; i < total; i++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50);
    const met = buf.readUInt16LE(p + 10); const comp = buf.readUInt32LE(p + 20); const largo = buf.readUInt32LE(p + 24);
    const ln = buf.readUInt16LE(p + 28); const le = buf.readUInt16LE(p + 30); const lc = buf.readUInt16LE(p + 32); const off = buf.readUInt32LE(p + 42);
    const nombre = buf.toString('utf8', p + 46, p + 46 + ln);
    const lnl = buf.readUInt16LE(off + 26); const lel = buf.readUInt16LE(off + 28);
    const datos = buf.subarray(off + 30 + lnl + lel, off + 30 + lnl + lel + comp);
    const plano = met === 8 ? zlib.inflateRawSync(datos) : datos;
    assert.equal(plano.length, largo);
    out.set(nombre, plano.toString('utf8'));
    p += 46 + ln + le + lc;
  }
  return out;
}
const desXml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
function leerXlsx(buf) {
  const z = leerZip(buf);
  const nombres = [...z.get('xl/workbook.xml').matchAll(/<sheet name="([^"]+)"/g)].map((m) => desXml(m[1]));
  const hojas = {};
  nombres.forEach((nm, i) => {
    const celdas = {};
    for (const m of z.get(`xl/worksheets/sheet${i + 1}.xml`).matchAll(/<c r="([A-Z]+\d+)"([^>]*)>([\s\S]*?)<\/c>/g)) {
      celdas[m[1]] = /t="inlineStr"/.test(m[2]) ? desXml((m[3].match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1] || '') : Number((m[3].match(/<v>([^<]*)<\/v>/) || [])[1]);
    }
    hojas[nm] = celdas;
  });
  return { nombres, hojas, zip: z };
}

describe('Admin → Métricas → Exportar (.xlsx)', () => {
  test('pide la contraseña del panel y valida el período', async () => {
    assert.equal((await adm('/metricas/exportar?periodo=7d', { auth: null })).status, 401);
    assert.equal((await adm('/metricas/exportar?periodo=1a')).status, 400);
  });

  test('una hoja por sección con encabezados, unidades y números como números', async () => {
    const r = await adm('/metricas/exportar?periodo=7d');
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    assert.match(r.headers.get('content-disposition'), /^attachment; filename="sexyrose-metricas-7d-\d{4}-\d{2}-\d{2}\.xlsx"$/);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    const buf = Buffer.from(await r.arrayBuffer());
    const d = await (await adm('/metricas?periodo=7d')).json();
    const { nombres, hojas } = leerXlsx(buf);
    assert.deepEqual(nombres, ['Resumen', 'Ingresos', 'Acompañantes', 'Créditos y renovaciones', 'Interesados y contenido', 'Tráfico', 'De dónde vienen', 'Top 10 por visitas', 'Top 10 por clics']);
    // Resumen: período, granularidad, generado y los indicadores (actual vs. anterior)
    const R = hojas.Resumen;
    assert.equal(R.A3, 'Período'); assert.equal(R.B3, '7 días');
    assert.equal(R.A4, 'Desde'); assert.equal(R.B4, 48375, 'fecha de Excel del 10/6/2032');
    assert.equal(R.A7, 'Granularidad'); assert.equal(R.B7, 'Por día');
    assert.equal(R.A8, 'Generado'); assert.match(R.B8, /\(hora Argentina\)$/);
    assert.deepEqual([R.A10, R.B10, R.C10, R.D10, R.E10, R.F10], ['Sección', 'Indicador', 'Unidad', 'Período', 'Período anterior', 'Variación (%)']);
    assert.deepEqual([R.A11, R.B11, R.C11, R.D11], ['Ingresos', 'Créditos vendidos', 'USD', 50]);
    const filaInd = (nm) => Object.keys(R).find((k) => /^B\d+$/.test(k) && R[k] === nm).slice(1);
    const fv = filaInd('Visitas a perfiles');
    assert.equal(R['D' + fv], d.trafico.vistas.total); assert.equal(R['E' + fv], d.trafico.vistas.anterior);
    // Ingresos: filas = días, columnas con unidad
    const I = hojas.Ingresos;
    assert.equal(I.A1, 'Día'); assert.equal(I.B1, 'Créditos vendidos (USD)'); assert.equal(I.C1, 'Transferidos en pesos (USD)'); assert.equal(I.F1, 'Pedidos confirmados (cantidad)'); assert.equal(I.G1, 'Venta de contenido (ARS)');
    assert.equal(I.A2, 48375); assert.equal(I.A8, 48381);
    assert.equal(I.B7, 50, '15/6: US$ 50'); assert.equal(typeof I.B7, 'number'); assert.equal(I.C7, 50);
    assert.equal(I.A9, 'Total del período'); assert.equal(I.B9, d.ingresos.creditosUsd.total);
    // Tráfico y orígenes
    const T = hojas['Tráfico'];
    assert.deepEqual([T.B1, T.C1, T.F1], ['Páginas vistas (cantidad)', 'Visitas a perfiles (cantidad)', 'Contacto (%)']);
    assert.equal(T.C8, d.trafico.vistas.serie[6]);
    const O = hojas['De dónde vienen'];
    assert.equal(O.B1, 'Páginas vistas: Google y buscadores (cantidad)'); assert.equal(O.G1, 'Páginas vistas: sin dato (cantidad)');
    assert.equal(O.B8, d.trafico.origenes.paginas.buscadores.serie[6]); assert.equal(O.G8, d.trafico.origenes.paginas.sinDato.serie[6]);
    // Top 10
    const V = hojas['Top 10 por visitas'];
    assert.deepEqual([V.A1, V.B1, V.D1], ['#', 'Perfil', 'Visitas (cantidad)']);
    assert.equal(V.B2, d.trafico.topVistas[0].nombre); assert.equal(V.D2, d.trafico.topVistas[0].vistas);
    for (const nm of ['Acompañantes', 'Créditos y renovaciones', 'Interesados y contenido']) assert.ok(Object.keys(hojas[nm]).length > 10, nm);

    // Si hay Python con openpyxl (como Excel o LibreOffice: lector independiente), también tiene que abrir
    let py = null;
    try { execFileSync('python3', ['-c', 'import openpyxl'], { stdio: 'ignore' }); py = true; } catch { py = false; }
    if (py) {
      const f = path.join(tmpData, 'm.xlsx'); await fs.writeFile(f, buf);
      const out = JSON.parse(execFileSync('python3', ['-I', '-c', `import json,sys,openpyxl
wb = openpyxl.load_workbook(sys.argv[1])
ws = wb['Ingresos']
print(json.dumps({'hojas': wb.sheetnames, 'b7': ws['B7'].value, 'a2': ws['A2'].value.isoformat(), 'fmt': ws['A2'].number_format}))`, f], { encoding: 'utf8' }));
      assert.equal(out.hojas.length, 9); assert.equal(out.b7, 50); assert.equal(out.a2, '2032-06-10T00:00:00'); assert.equal(out.fmt, 'dd/mm/yyyy');
    }
  });

  test('escritor: textos con caracteres especiales, nombres de hoja inválidos y vacías', () => {
    const buf = crearXlsx([{ nombre: 'A/B:C*D?[x]', filas: [['<&"\u0001>', null, 3.5, { v: 0.125, f: 'pct' }], [], [{ fecha: '2026-11-16' }]] }, { nombre: 'A/B:C*D?[x]', filas: [] }]);
    const { nombres, hojas } = leerXlsx(buf);
    assert.deepEqual(nombres, ['A B C D  x', 'A B C D  x 2']);
    const h = hojas[nombres[0]];
    assert.equal(h.A1, '<&">'); assert.equal(h.B1, undefined); assert.equal(h.C1, 3.5); assert.equal(h.D1, 0.125); assert.equal(h.A3, 46342);
  });
});

/* ---------- Panel de la acompañante y builds ---------- */
describe('Panel agrupado y builds', () => {
  test('grupos del panel en el orden de Juan, con Mis números y las mismas secciones de antes', async () => {
    const src = await fs.readFile(path.join(MVP, 'src', 'prod-sitio.js'), 'utf8');
    const m = src.match(/const PANEL_GRUPOS = (\[[\s\S]*?\n {2}\]);/);
    assert.ok(m, 'PANEL_GRUPOS');
    const grupos = JSON.parse(JSON.stringify(vm.runInNewContext(m[1]))); // (otro contexto: se copia)
    assert.deepEqual(grupos.map((g) => [g.grupo, g.tabs.map((t) => t.id)]), [
      ['Inicio', ['resumen', 'numeros']],
      ['Mi aviso', ['perfil', 'fotos', 'verificacion', 'historias']],
      ['Visibilidad', ['plan', 'destacado', 'creditos']],
      ['Ventas', ['contenido', 'pedidos']],
      ['Cuenta', ['avisos', 'cuenta']],
    ]);
    assert.equal(grupos.find((g) => g.grupo === 'Inicio').tabs[1].label, 'Mis números');
    // Cada sección sigue teniendo su vista (las direcciones /panel/<sección> no cambian)
    for (const id of grupos.flatMap((g) => g.tabs.map((t) => t.id))) assert.match(src, new RegExp(`\\b${id}: `), id);
    // Textos nuevos de la acompañante con inglés y portugués
    for (const k of ['Mis números', 'Mi aviso', 'Visitas a tu perfil', 'Toques en WhatsApp', 'Tasa de contacto', '¿Qué cuenta?', 'No incluye tus propias visitas.', 'Todavía no hay números']) {
      assert.match(src, new RegExp(`'${k.replace(/[?¿.]/g, '\\$&')}': \\['[^']+', '[^']+'\\]`), k);
    }
  });

  test('el origen viaja solo en el sitio real: ni la demo ni el admin; los gráficos van al sitio y al admin', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'srnum-build-'));
    try {
      await fs.cp(path.join(MVP, 'src'), path.join(tmp, 'src'), { recursive: true });
      await fs.copyFile(path.join(MVP, 'build.py'), path.join(tmp, 'build.py'));
      const build = (env) => execFileSync('python3', [path.join(tmp, 'build.py')], { cwd: tmp, env: { ...process.env, ...env }, stdio: 'ignore' });
      build({ HH_TARGET: 'sitio' });
      const sitio = await fs.readFile(path.join(tmp, 'build', 'sitio.html'), 'utf8');
      assert.match(sitio, /sr_origen/); assert.match(sitio, /graficos\.js/); assert.match(sitio, /\/cuenta\/numeros/);
      build({ HH_TARGET: 'sitio', HH_SITIO_DEMO: '1' });
      const demo = await fs.readFile(path.join(tmp, 'build', 'sitio.html'), 'utf8');
      assert.doesNotMatch(demo, /sr_origen|\/api\/sitio\/evento|prod-metricas\.js/);
      build({ HH_TARGET: 'admin' });
      const admin = await fs.readFile(path.join(tmp, 'build', 'admin.html'), 'utf8');
      assert.match(admin, /graficos\.js/); assert.match(admin, /metricas\/exportar/);
      assert.doesNotMatch(admin, /sr_origen|\/api\/sitio\/evento|prod-metricas\.js/);
    } finally { await fs.rm(tmp, { recursive: true, force: true }); }
  });
});
