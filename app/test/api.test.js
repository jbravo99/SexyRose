// Pruebas de la API y el servidor (node:test + fetch).
//
// Modo por defecto: levanta el servidor en este mismo proceso, en un puerto libre, con una carpeta
// public/ de prueba temporal. Necesita DATABASE_URL (una base Postgres de pruebas).
//   DATABASE_URL=postgres://... npm test
//
// Modo externo: prueba un servidor ya corriendo (por ejemplo el contenedor).
//   TEST_BASE_URL=http://127.0.0.1:3000 DATABASE_URL=... ADMIN_USER=... ADMIN_PASSWORD=... ADMIN_PATH=/p-... npm test
// En modo externo se omiten las pruebas que dependen de la carpeta public/ de prueba.
//
// Las filas creadas por las pruebas se borran al final.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';

const EXTERNAL = Boolean(process.env.TEST_BASE_URL);
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('Falta DATABASE_URL para correr las pruebas.');
  process.exit(1);
}

const OPERATOR = 'Operadora & <Prueba>';
let BASE;
let ADMIN_USER = process.env.ADMIN_USER;
let ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
// Dirección secreta del admin (en modo externo, la del servidor probado).
let A = process.env.ADMIN_PATH || '';
const logs = [];
let instance;
let tmpPublic;
const db = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
const createdNames = [];
const createdDenuncias = [];

const rand = () => crypto.randomBytes(4).toString('hex');
const randomIp = () => `2001:db8:${rand().slice(0, 4)}:${rand().slice(0, 4)}::${rand().slice(0, 4)}`;
const adminAuth = () => 'Basic ' + Buffer.from(`${ADMIN_USER}:${ADMIN_PASSWORD}`).toString('base64');

function post(pathname, body, { ip = randomIp(), headers = {} } = {}) {
  return fetch(BASE + pathname, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function validPre(overrides = {}) {
  const nombre = overrides.nombre_artistico ?? `zztest-${rand()}`;
  createdNames.push(nombre);
  return {
    nombre_artistico: nombre,
    genero: 'mujer',
    provincia: 'Buenos Aires',
    ciudad: 'Merlo',
    contacto_tipo: 'whatsapp',
    contacto: '+54 9 11 1234-5678',
    plan_interes: 'oro',
    mayor_edad: true,
    acepta_terminos: true,
    website: '',
    ...overrides,
    ...(overrides.nombre_artistico ? {} : { nombre_artistico: nombre }),
  };
}

// Página de inicio de prueba con marcadores de textos editables (claves *.zztest.* para poder limpiarlas).
const INDEX_PRUEBA = '<!doctype html><html><head><title><!--t:index.zztest.titulo-pagina-->Inicio<!--/t--></title>'
  + '<meta name="description" content="<!--t:index.zztest.desc-->Descripción &quot;por defecto&quot;<!--/t-->"></head><body>'
  + '<p>Operado por {{OPERADOR}} · {{ CONTACT_EMAIL }} · {{FECHA_LEGAL}} · {{DESCONOCIDO}}</p>'
  + '<h1><!--e:index.zztest.titulo-->Título <strong>original</strong><!--/e--></h1>'
  + '<p><!--e:index.zztest.p1-->Texto con <a href="/terminos">enlace</a> &amp; más<!--/e--></p>'
  + '<select><option value="a"><!--t:index.zztest.opcion-->Opción<!--/t--></option></select>'
  + '<footer><!--e:comun.zztest.pie-->Pie común<!--/e--></footer></body></html>';

const validDen = (o = {}) =>({ categoria: 'otro', url: '', descripcion: '[zztest] descripción de prueba suficientemente larga', email: '', website: '', ...o });

async function countPre(nombre) {
  const { rows } = await db.query('SELECT count(*)::int AS n FROM preregistros WHERE nombre_artistico = $1', [nombre]);
  return rows[0].n;
}

before(async () => {
  if (EXTERNAL) {
    BASE = process.env.TEST_BASE_URL.replace(/\/+$/, '');
    if (!A) throw new Error('En modo externo falta ADMIN_PATH (la dirección del admin del servidor probado).');
    return;
  }
  tmpPublic = await fs.mkdtemp(path.join(os.tmpdir(), 'sexyrose-public-'));
  await fs.mkdir(path.join(tmpPublic, 'demo'));
  await fs.mkdir(path.join(tmpPublic, 'css'));
  await fs.writeFile(path.join(tmpPublic, 'index.html'), INDEX_PRUEBA);
  await fs.writeFile(path.join(tmpPublic, 'terminos.html'), '<!doctype html><title>Términos</title><p>{{SITE_URL}} {{REPORT_EMAIL}} {{PRIVACY_EMAIL}}</p>'
    + '<p><!--e:terminos.zztest.p-->Términos por defecto<!--/e--></p><footer><!--e:comun.zztest.pie-->Pie común<!--/e--></footer>');
  await fs.writeFile(path.join(tmpPublic, '404.html'), '<!doctype html><title>404</title><p>pagina-404-propia {{OPERADOR}}</p>');
  await fs.writeFile(path.join(tmpPublic, 'demo', 'index.html'), '<!doctype html><title>Demo</title><p>demo</p>');
  await fs.writeFile(path.join(tmpPublic, 'css', 'site.css'), 'body{color:#fff}');
  ADMIN_USER = 'admin-pruebas';
  ADMIN_PASSWORD = 'clave-de-pruebas-123';
  A = '/p-' + crypto.randomBytes(12).toString('hex');
  const { start } = await import('../server.js');
  instance = await start({
    port: 0,
    host: '127.0.0.1',
    databaseUrl: DATABASE_URL,
    publicDir: tmpPublic,
    adminUser: ADMIN_USER,
    adminPassword: ADMIN_PASSWORD,
    adminPath: A,
    ipHashSalt: 'sal-de-pruebas',
    operatorName: OPERATOR,
    siteUrl: 'https://sexyrose.net',
    telegramToken: '',
    telegramChatId: '',
    log: (...a) => logs.push(a.join(' ')),
  });
  BASE = `http://127.0.0.1:${instance.port}`;
  let timer;
  await Promise.race([instance.ready, new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('la base no respondió en 20 s')), 20000); })]);
  clearTimeout(timer);
});

const limpiarTextosPrueba = async () => {
  await db.query("DELETE FROM textos WHERE clave LIKE '%.zztest.%'");
  await db.query("DELETE FROM textos_historial WHERE clave LIKE '%.zztest.%'");
};

after(async () => {
  if (!EXTERNAL) await limpiarTextosPrueba().catch(() => {});
  if (createdNames.length) await db.query('DELETE FROM preregistros WHERE nombre_artistico = ANY($1)', [createdNames]);
  await db.query("DELETE FROM denuncias WHERE descripcion LIKE '[zztest]%' OR id = ANY($1::uuid[])", [createdDenuncias]);
  await db.end();
  if (instance) await instance.close();
  if (tmpPublic) await fs.rm(tmpPublic, { recursive: true, force: true });
});

describe('salud y SEO', () => {
  test('GET /healthz → 200 {"ok":true}', async () => {
    const r = await fetch(BASE + '/healthz');
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true });
  });

  test('robots.txt bloquea /demo, no menciona el admin y apunta al sitemap', async () => {
    const r = await fetch(BASE + '/robots.txt');
    assert.equal(r.status, 200);
    const t = await r.text();
    assert.doesNotMatch(t, /admin/i);
    assert.ok(!t.includes(A), 'robots.txt no incluye la dirección del admin');
    assert.match(t, /Disallow: \/demo/);
    assert.match(t, /Sitemap: https?:\/\/[^\s]+\/sitemap\.xml/);
  });

  test('sitemap.xml es XML válido y no lista /admin ni /demo', async () => {
    const r = await fetch(BASE + '/sitemap.xml');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /xml/);
    const t = await r.text();
    assert.match(t, /<urlset/);
    assert.doesNotMatch(t, /admin|\/demo/);
    assert.ok(!t.includes(A));
    if (!EXTERNAL) {
      assert.match(t, /<loc>https:\/\/sexyrose\.net\/<\/loc>/);
      assert.match(t, /<loc>https:\/\/sexyrose\.net\/terminos<\/loc>/);
      assert.doesNotMatch(t, /privacidad/); // no existe en la carpeta de prueba
    }
  });
});

describe('cabeceras de seguridad', () => {
  test('presentes en páginas y API', async () => {
    for (const p of ['/', '/healthz', '/no-existe']) {
      const r = await fetch(BASE + p);
      const csp = r.headers.get('content-security-policy') || '';
      assert.match(csp, /default-src 'self'/, p);
      assert.match(csp, /script-src 'self'(;|$)/, p);
      assert.doesNotMatch(csp, /unsafe-inline/, p);
      assert.match(csp, /frame-ancestors 'none'/, p);
      assert.match(csp, /fonts\.googleapis\.com/, p);
      assert.equal(r.headers.get('x-content-type-options'), 'nosniff', p);
      assert.equal(r.headers.get('referrer-policy'), 'strict-origin-when-cross-origin', p);
      assert.ok(r.headers.get('permissions-policy'), p);
      assert.equal(r.headers.get('x-powered-by'), null, p);
      assert.equal(r.headers.get('x-robots-tag'), null, p);
    }
  });

  test('/demo/ tiene noindex y CSP propia con inline permitido', async () => {
    const r = await fetch(BASE + '/demo/');
    if (!EXTERNAL) assert.equal(r.status, 200);
    assert.match(r.headers.get('x-robots-tag') || '', /noindex/);
    const csp = r.headers.get('content-security-policy') || '';
    assert.match(csp, /script-src 'self' 'unsafe-inline'/);
    assert.match(csp, /img-src 'self' data: blob: https:/);
    assert.match(csp, /frame-ancestors 'none'/);
    const r2 = await fetch(BASE + '/demo', { redirect: 'manual' });
    assert.equal(r2.status, 301);
    assert.equal(r2.headers.get('location'), '/demo/');
    assert.match(r2.headers.get('x-robots-tag') || '', /noindex/);
  });

  test('el admin tiene noindex y no-store aun sin autenticar', async () => {
    const r = await fetch(BASE + A, { headers: { 'cf-connecting-ip': randomIp() } });
    assert.match(r.headers.get('x-robots-tag') || '', /noindex/);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.match(r.headers.get('content-security-policy') || '', /default-src 'none'/);
  });
});

describe('páginas estáticas', { skip: EXTERNAL && 'usa la carpeta public/ de prueba' }, () => {
  test('placeholders reemplazados y escapados', async () => {
    const r = await fetch(BASE + '/');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /text\/html/);
    const t = await r.text();
    assert.ok(t.includes('Operado por Operadora &amp; &lt;Prueba&gt;'), t);
    assert.ok(t.includes('contacto@sexyrose.net'));
    assert.ok(t.includes('4 de noviembre de 2026'));
    assert.ok(t.includes('{{DESCONOCIDO}}'), 'los marcadores desconocidos no se tocan');
  });

  test('ruta limpia /terminos y redirección de /terminos.html', async () => {
    const r = await fetch(BASE + '/terminos');
    assert.equal(r.status, 200);
    const t = await r.text();
    assert.ok(t.includes('https://sexyrose.net contacto@sexyrose.net contacto@sexyrose.net'));
    const r2 = await fetch(BASE + '/terminos.html?x=1', { redirect: 'manual' });
    assert.equal(r2.status, 301);
    assert.equal(r2.headers.get('location'), '/terminos?x=1');
    const r3 = await fetch(BASE + '/terminos/', { redirect: 'manual' });
    assert.equal(r3.status, 301);
  });

  test('404 propia con status 404', async () => {
    for (const p of ['/no-existe', '/404', '/css/nada.css', '/../server.js', '/%2e%2e/server.js']) {
      const r = await fetch(BASE + p);
      assert.equal(r.status, 404, p);
      const t = await r.text();
      assert.ok(t.includes('pagina-404-propia'), p);
    }
  });

  test('ningún .html se sirve en crudo (sin reemplazar {{...}})', async () => {
    for (const p of ['/404.html', '/%34%30%34.html', '/terminos%2Ehtml', '/demo%2Findex.html']) {
      const r = await fetch(BASE + p);
      assert.equal(r.status, 404, p);
      const t = await r.text();
      assert.ok(!t.includes('{{'), p);
    }
  });

  test('archivos estáticos', async () => {
    const r = await fetch(BASE + '/css/site.css');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /text\/css/);
  });
});

describe('POST /api/preregistro', () => {
  test('válido → 201 y se guarda (sin IP en claro)', async () => {
    const ip = randomIp();
    const body = validPre();
    const r = await post('/api/preregistro', body, { ip });
    assert.equal(r.status, 201);
    assert.deepEqual(await r.json(), { ok: true });
    const { rows } = await db.query('SELECT * FROM preregistros WHERE nombre_artistico = $1', [body.nombre_artistico]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].contacto, '+5491112345678');
    assert.equal(rows[0].estado, 'nuevo');
    assert.match(rows[0].ip_hash, /^[0-9a-f]{64}$/);
    assert.ok(!JSON.stringify(rows[0]).includes(ip));
  });

  test('contacto por Telegram y email se normalizan', async () => {
    const a = validPre({ contacto_tipo: 'telegram', contacto: 't.me/rosa_prueba' });
    assert.equal((await post('/api/preregistro', a)).status, 201);
    const b = validPre({ contacto_tipo: 'email', contacto: 'rosa@example.com', plan_interes: 'no_se', genero: 'trans' });
    assert.equal((await post('/api/preregistro', b)).status, 201);
    const { rows } = await db.query('SELECT contacto FROM preregistros WHERE nombre_artistico = $1', [a.nombre_artistico]);
    assert.equal(rows[0].contacto, '@rosa_prueba');
  });

  test('faltan campos → 400 con error en castellano', async () => {
    const r = await post('/api/preregistro', { nombre_artistico: 'Rosa' });
    assert.equal(r.status, 400);
    const j = await r.json();
    assert.equal(j.ok, false);
    assert.match(j.error, /género/);
    for (const [field, value, re] of [
      ['nombre_artistico', 'R', /entre 2 y 40/],
      ['genero', 'otro', /género/],
      ['provincia', '', /provincia/],
      ['ciudad', '', /ciudad/],
      ['contacto_tipo', 'sms', /WhatsApp, Telegram o email/],
      ['contacto', 'abc', /WhatsApp no es válido/],
      ['plan_interes', 'gold', /plan/],
      ['acepta_terminos', false, /Términos/],
    ]) {
      const rr = await post('/api/preregistro', validPre({ [field]: value }));
      assert.equal(rr.status, 400, field);
      assert.match((await rr.json()).error, re, field);
    }
    const re = await post('/api/preregistro', validPre({ contacto_tipo: 'email', contacto: 'no-es-email' }));
    assert.match((await re.json()).error, /email no es válido/);
  });

  test('mayor_edad false → 400', async () => {
    const body = validPre({ mayor_edad: false });
    const r = await post('/api/preregistro', body);
    assert.equal(r.status, 400);
    assert.match((await r.json()).error, /mayor de 18/);
    assert.equal(await countPre(body.nombre_artistico), 0);
  });

  test('honeypot → 201 sin guardar', async () => {
    const body = validPre({ website: 'http://spam.example' });
    const r = await post('/api/preregistro', body);
    assert.equal(r.status, 201);
    assert.deepEqual(await r.json(), { ok: true });
    assert.equal(await countPre(body.nombre_artistico), 0);
  });

  test('límite de 5 por IP por hora → 429', async () => {
    const ip = randomIp();
    for (let i = 0; i < 5; i++) {
      const r = await post('/api/preregistro', validPre(), { ip });
      assert.equal(r.status, 201, `envío ${i + 1}`);
    }
    const r = await post('/api/preregistro', validPre(), { ip });
    assert.equal(r.status, 429);
    assert.ok(Number(r.headers.get('retry-after')) > 0);
    const j = await r.json();
    assert.equal(j.ok, false);
    assert.match(j.error, /demasiados/);
    // Otra IP no se ve afectada
    assert.equal((await post('/api/preregistro', validPre())).status, 201);
  });

  test('X-Forwarded-For se ignora y un CF-Connecting-IP inválido cae a la IP del socket', { skip: EXTERNAL && 'comparte la IP del socket entre corridas' }, async () => {
    // Sin CF-Connecting-IP válido, todas comparten la IP del socket (127.0.0.1) aunque cambie XFF.
    const send = (i) => fetch(BASE + '/api/preregistro', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': randomIp(), ...(i % 2 ? { 'cf-connecting-ip': 'no-es-ip' } : {}) },
      body: JSON.stringify(validPre()),
    });
    for (let i = 0; i < 5; i++) assert.equal((await send(i)).status, 201, `envío ${i + 1}`);
    assert.equal((await send(5)).status, 429);
  });

  test('JSON inválido, tipo incorrecto y cuerpo grande', async () => {
    const r1 = await post('/api/preregistro', '{"nombre_artistico":');
    assert.equal(r1.status, 400);
    assert.match((await r1.json()).error, /Formato/);
    const r2 = await fetch(BASE + '/api/preregistro', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'hola' });
    assert.equal(r2.status, 415);
    const r3 = await post('/api/preregistro', validPre({ ciudad: 'x'.repeat(25 * 1024) }));
    assert.equal(r3.status, 413);
    assert.match((await r3.json()).error, /demasiado grandes/);
    const r4 = await post('/api/preregistro', '[1,2]');
    assert.equal(r4.status, 400);
  });
});

describe('POST /api/denuncia', () => {
  test('válida → 201 con id', async () => {
    const r = await post('/api/denuncia', validDen({ categoria: 'trata', url: 'sexyrose.net/perfil/x', email: 'alguien@example.com' }));
    assert.equal(r.status, 201);
    const j = await r.json();
    assert.equal(j.ok, true);
    assert.match(j.id, /^[0-9a-f-]{36}$/);
    createdDenuncias.push(j.id);
    const { rows } = await db.query('SELECT * FROM denuncias WHERE id = $1', [j.id]);
    assert.equal(rows[0].categoria, 'trata');
    assert.equal(rows[0].url, 'https://sexyrose.net/perfil/x');
    assert.equal(rows[0].estado, 'nueva');
    assert.equal(rows[0].resuelto, null);
  });

  test('inválida → 400', async () => {
    for (const [o, re] of [
      [{ categoria: 'spam' }, /categoría/],
      [{ descripcion: 'corto' }, /entre 10 y 4000/],
      [{ descripcion: 'x'.repeat(4001) }, /entre 10 y 4000/],
      [{ descripcion: '' }, /descripción/],
      [{ email: 'mal@' }, /email no es válido/],
      [{ url: 'javascript:alert(1)' }, /enlace no es válido/],
    ]) {
      const r = await post('/api/denuncia', validDen(o));
      assert.equal(r.status, 400, JSON.stringify(o).slice(0, 60));
      const j = await r.json();
      assert.equal(j.ok, false);
      assert.match(j.error, re);
    }
  });

  test('honeypot → 201 sin guardar', async () => {
    const marker = `[zztest] honeypot ${rand()}`;
    const r = await post('/api/denuncia', validDen({ descripcion: marker, website: 'x' }));
    assert.equal(r.status, 201);
    const { rows } = await db.query('SELECT count(*)::int AS n FROM denuncias WHERE descripcion = $1', [marker]);
    assert.equal(rows[0].n, 0);
  });

  test('límite de 10 por IP por hora → 429', async () => {
    const ip = randomIp();
    for (let i = 0; i < 10; i++) {
      const r = await post('/api/denuncia', validDen(), { ip });
      assert.equal(r.status, 201, `envío ${i + 1}`);
    }
    const r = await post('/api/denuncia', validDen(), { ip });
    assert.equal(r.status, 429);
    assert.match((await r.json()).error, /contacto@sexyrose\.net|demasiadas/);
  });
});

describe('admin', () => {
  test('sin credenciales → 401 con WWW-Authenticate', async () => {
    const r = await fetch(BASE + A, { headers: { 'cf-connecting-ip': randomIp() } });
    assert.equal(r.status, 401);
    assert.match(r.headers.get('www-authenticate') || '', /^Basic/);
    for (const p of [A + '/preregistros.csv', A + '/denuncias.csv']) {
      assert.equal((await fetch(BASE + p, { headers: { 'cf-connecting-ip': randomIp() } })).status, 401, p);
    }
  });

  test('contraseña incorrecta → 401', async () => {
    const bad = 'Basic ' + Buffer.from(`${ADMIN_USER}:incorrecta-123456`).toString('base64');
    const r = await fetch(BASE + A, { headers: { authorization: bad, 'cf-connecting-ip': randomIp() } });
    assert.equal(r.status, 401);
  });

  test('con credenciales → 200, HTML escapado y sin caché', async () => {
    const evil = validPre({ nombre_artistico: '<img src=x>zz' + rand().slice(0, 4) });
    assert.equal((await post('/api/preregistro', evil)).status, 201);
    const r = await fetch(BASE + A, { headers: { authorization: adminAuth() } });
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /text\/html/);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.match(r.headers.get('content-security-policy') || '', /style-src 'nonce-/);
    const t = await r.text();
    assert.ok(t.includes('Pre-registros') && t.includes('Denuncias'));
    assert.equal((t.match(/<table/g) || []).length, 2);
    assert.ok(t.includes('&lt;img src=x&gt;zz'));
    assert.ok(!t.includes('<img src=x>'));
  });

  test('CSV de pre-registros y denuncias, a prueba de fórmulas', async () => {
    const formula = validPre({ nombre_artistico: '=HYPERLINK("x")' + rand().slice(0, 4) });
    assert.equal((await post('/api/preregistro', formula)).status, 201);
    const r = await fetch(BASE + A + '/preregistros.csv', { headers: { authorization: adminAuth() } });
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /text\/csv/);
    assert.match(r.headers.get('content-disposition'), /attachment; filename="preregistros-\d{4}-\d{2}-\d{2}\.csv"/);
    const t = Buffer.from(await r.arrayBuffer()).toString('utf8');
    assert.ok(t.startsWith('\uFEFF"id"'), 'CSV con BOM UTF-8 para Excel');
    assert.ok(t.includes(`"'=HYPERLINK(""x"")`), 'la fórmula queda neutralizada');
    assert.ok(t.includes(`"'+5491112345678"`), 'teléfono con + también se neutraliza');
    assert.ok(!t.includes('ip_hash'));

    const r2 = await fetch(BASE + A + '/denuncias.csv', { headers: { authorization: adminAuth() } });
    assert.equal(r2.status, 200);
    const t2 = await r2.text();
    assert.match(t2, /"categoria"/);
    assert.ok(t2.includes('[zztest]'));
  });

  test('marcar denuncia resuelta: exige mismo origen y token', async () => {
    const r0 = await post('/api/denuncia', validDen({ categoria: 'imagen_sin_consentimiento' }));
    const { id } = await r0.json();
    createdDenuncias.push(id);
    const page = await (await fetch(BASE + A, { headers: { authorization: adminAuth() } })).text();
    const token = /name="csrf" value="([0-9a-f]+)"/.exec(page)?.[1];
    assert.ok(token, 'el admin incluye el token');
    const url = `${BASE}${A}/denuncias/${id}/resolver`;
    const form = (csrf) => new URLSearchParams({ csrf }).toString();
    const host = new URL(BASE).host;
    const base = { authorization: adminAuth(), 'content-type': 'application/x-www-form-urlencoded' };

    let r = await fetch(url, { method: 'POST', headers: base, body: form(token), redirect: 'manual' });
    assert.equal(r.status, 403, 'sin Origin');
    r = await fetch(url, { method: 'POST', headers: { ...base, origin: 'https://evil.example' }, body: form(token), redirect: 'manual' });
    assert.equal(r.status, 403, 'otro origen');
    r = await fetch(url, { method: 'POST', headers: { ...base, origin: `http://${host}` }, body: form('mal'), redirect: 'manual' });
    assert.equal(r.status, 403, 'token incorrecto');
    r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: `http://${host}`, 'cf-connecting-ip': randomIp() }, body: form(token), redirect: 'manual' });
    assert.equal(r.status, 401, 'sin credenciales');

    r = await fetch(url, { method: 'POST', headers: { ...base, origin: `http://${host}` }, body: form(token), redirect: 'manual' });
    assert.equal(r.status, 303);
    assert.equal(r.headers.get('location'), `${A}#denuncias`);
    const { rows } = await db.query('SELECT estado, resuelto FROM denuncias WHERE id = $1', [id]);
    assert.equal(rows[0].estado, 'resuelta');
    assert.ok(rows[0].resuelto instanceof Date);

    r = await fetch(`${BASE}${A}/denuncias/00000000-0000-0000-0000-000000000000/resolver`, { method: 'POST', headers: { ...base, origin: `http://${host}` }, body: form(token), redirect: 'manual' });
    assert.equal(r.status, 404);
  });
});

describe('dirección secreta del admin (ADMIN_PATH)', () => {
  // Cabeceras comparables entre dos respuestas (sin las que dependen del momento o de la conexión).
  const cabeceras = (r) => {
    const o = Object.fromEntries(r.headers);
    for (const k of ['date', 'keep-alive', 'connection']) delete o[k];
    return o;
  };
  const respuesta = async (p, init) => {
    const r = await fetch(BASE + p, { redirect: 'manual', ...init });
    return { status: r.status, body: await r.text(), headers: cabeceras(r) };
  };
  // La respuesta de p tiene que ser idéntica a la de una ruta inexistente cualquiera.
  const igualA404 = async (p, init = {}) => {
    const ref = await respuesta('/no-existe-' + rand(), init);
    const got = await respuesta(p, init);
    assert.equal(ref.status, 404);
    assert.equal(got.status, 404, p);
    assert.equal(got.body, ref.body, p);
    assert.deepEqual(got.headers, ref.headers, p);
    assert.equal(got.headers['www-authenticate'], undefined, p);
    assert.equal(got.headers['x-robots-tag'], undefined, p);
    return got;
  };

  test('/admin y /admin/* dan la misma 404 pública que cualquier ruta desconocida', async () => {
    const rutas = ['/admin', '/admin/', '/admin/textos', '/admin/textos/index', '/admin/preregistros.csv', '/admin/denuncias.csv', '/ADMIN', '/Admin/textos', '/admin.html'];
    for (const p of rutas) {
      await igualA404(p);
      await igualA404(p, { headers: { authorization: adminAuth() } });
    }
    if (!EXTERNAL) assert.ok((await igualA404('/admin')).body.includes('pagina-404-propia'));
    const post = {
      method: 'POST',
      headers: { authorization: adminAuth(), 'content-type': 'application/x-www-form-urlencoded', origin: BASE },
      body: 'csrf=x',
    };
    await igualA404('/admin/denuncias/00000000-0000-0000-0000-000000000000/resolver', post);
    await igualA404('/admin/textos/index', post);
  });

  test('el admin responde solo en ADMIN_PATH exacto, con Basic Auth', async () => {
    assert.match(A, /^\/[a-z0-9-]{16,}$/);
    const r = await fetch(BASE + A, { headers: { 'cf-connecting-ip': randomIp() } });
    assert.equal(r.status, 401);
    assert.match(r.headers.get('www-authenticate') || '', /^Basic/);
    const ok = await fetch(BASE + A, { headers: { authorization: adminAuth() } });
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('referrer-policy'), 'same-origin');
    const slash = await fetch(BASE + A + '/', { headers: { authorization: adminAuth() }, redirect: 'manual' });
    assert.equal(slash.status, 301);
    assert.equal(slash.headers.get('location'), A);
    // Variantes parecidas no son el admin.
    for (const p of [A.toUpperCase(), A + 'x', A.slice(0, -1), A + '.html']) {
      await igualA404(p, { headers: { authorization: adminAuth() } });
    }
  });

  test('validAdminPath: reglas de ADMIN_PATH', { skip: EXTERNAL && 'prueba en el mismo proceso' }, async () => {
    const { validAdminPath } = await import('../server.js');
    for (const v of ['/p-' + 'a1'.repeat(12), '/' + 'a'.repeat(16), '/abc-def-0123456789']) assert.equal(validAdminPath(v), true, v);
    for (const v of [undefined, '', '/', '/admin', '/' + 'a'.repeat(15), 'p-' + 'a'.repeat(20), '/P-' + 'A'.repeat(20),
      '/p_' + 'a'.repeat(20), '/p-' + 'a'.repeat(20) + '/', '/p-' + 'a'.repeat(20) + '/x', '/p-' + 'a'.repeat(20) + '?x', ' /p-' + 'a'.repeat(20)]) {
      assert.equal(validAdminPath(v), false, String(v));
    }
  });

  test('ADMIN_PATH ausente o inválida: admin deshabilitado (404) y aviso en el log sin el valor', { skip: EXTERNAL && 'levanta servidores propios' }, async () => {
    const { createApp, loadConfig } = await import('../server.js');
    const hex = crypto.randomBytes(12).toString('hex');
    const candidatos = [undefined, '', 'p-' + hex, '/p-corta', '/P-' + hex.toUpperCase(), '/p_' + hex, '/p-' + hex + '/', '/p-' + hex + '/sub'];
    for (const v of candidatos) {
      const lineas = [];
      const { app, shutdown } = createApp({
        ...loadConfig({ DATABASE_URL }),
        publicDir: tmpPublic,
        adminUser: ADMIN_USER,
        adminPassword: ADMIN_PASSWORD,
        adminPath: v,
        ipHashSalt: 'sal-de-pruebas',
        log: (...a) => lineas.push(a.join(' ')),
      });
      const srv = app.listen(0, '127.0.0.1');
      await once(srv, 'listening');
      try {
        const base = `http://127.0.0.1:${srv.address().port}`;
        const rutas = ['/admin', '/admin/textos', '/admin/preregistros.csv', A];
        if (v && v.startsWith('/')) rutas.push(v, v.replace(/\/+$/, '') + '/textos');
        for (const p of rutas) {
          const r = await fetch(base + p, { headers: { authorization: adminAuth() } });
          assert.equal(r.status, 404, `${v} → ${p}`);
          assert.equal(r.headers.get('www-authenticate'), null, `${v} → ${p}`);
          assert.equal(r.headers.get('x-robots-tag'), null, `${v} → ${p}`);
          assert.ok((await r.text()).includes('pagina-404-propia'), `${v} → ${p}`);
        }
        assert.ok(lineas.some((l) => l.includes('admin deshabilitado: ADMIN_PATH falta o no es válida')), String(v));
        assert.ok(!lineas.some((l) => l.includes('admin habilitado')), String(v));
        if (v) assert.ok(!lineas.some((l) => l.includes(v) || l.includes(hex)), `el log no muestra el valor (${v})`);
      } finally {
        await new Promise((res) => srv.close(res));
        await shutdown();
      }
    }
  });

  test('la dirección no aparece en páginas públicas, 404, errores, robots ni cabeceras', async () => {
    const secreto = A.slice(1);
    const revisar = async (r, etiqueta) => {
      const body = await r.text();
      assert.ok(!body.includes(secreto), `${etiqueta}: cuerpo`);
      for (const [k, val] of r.headers) assert.ok(!val.includes(secreto), `${etiqueta}: cabecera ${k}`);
    };
    for (const p of ['/', '/terminos', '/no-existe', '/404', '/admin', '/admin/textos', '/robots.txt', '/sitemap.xml', '/demo/', '/demo', '/healthz', '/api/nada', '/css/site.css', '/terminos.html']) {
      await revisar(await fetch(BASE + p, { redirect: 'manual' }), p);
    }
    await revisar(await post('/api/preregistro', { nombre_artistico: 'x' }), 'preregistro 400');
    await revisar(await post('/api/denuncia', '{"roto":'), 'denuncia 400');
    await revisar(await fetch(BASE + '/%E0%A4%A'), 'URL mal codificada');
  });
});

describe('textos editables (marcadores y editor del admin)', { skip: EXTERNAL && 'usa la carpeta public/ de prueba' }, () => {
  const formPost = (url, fields, { headers = {}, auth = true } = {}) => fetch(BASE + url, {
    method: 'POST',
    headers: {
      ...(auth ? { authorization: adminAuth() } : {}),
      'content-type': 'application/x-www-form-urlencoded',
      origin: `http://${new URL(BASE).host}`,
      'cf-connecting-ip': randomIp(),
      ...headers,
    },
    body: new URLSearchParams(fields).toString(),
    redirect: 'manual',
  });
  const adminGet = (url) => fetch(BASE + url, { headers: { authorization: adminAuth() } });
  let csrf;
  const guardar = (pagina, campos, accion = 'guardar') => formPost(A + '/textos/' + pagina, { csrf, accion, ...campos });
  const pagina = async (p) => (await fetch(BASE + p)).text();
  const fila = async (clave) => (await db.query('SELECT valor FROM textos WHERE clave = $1', [clave])).rows[0]?.valor;

  before(async () => {
    await limpiarTextosPrueba();
    const t = await (await adminGet(A + '/textos/index')).text();
    csrf = /name="csrf" value="([0-9a-f]+)"/.exec(t)?.[1];
  });

  test('sin valores guardados, la página sale idéntica al archivo sin marcadores', async () => {
    const t = await pagina('/');
    const esperado = INDEX_PRUEBA.replace(/<!--\/?[et](:[^>]*)?-->/g, '')
      .replace('{{OPERADOR}}', 'Operadora &amp; &lt;Prueba&gt;').replace('{{ CONTACT_EMAIL }}', 'contacto@sexyrose.net')
      .replace('{{FECHA_LEGAL}}', '4 de noviembre de 2026');
    assert.equal(t, esperado);
    assert.ok(!t.includes('<!--'));
  });

  test('el editor de textos exige credenciales (GET y POST)', async () => {
    for (const p of [A + '/textos', A + '/textos/index', A + '/textos/historial?clave=index.zztest.titulo']) {
      assert.equal((await fetch(BASE + p, { headers: { 'cf-connecting-ip': randomIp() } })).status, 401, p);
    }
    const r = await formPost(A + '/textos/index', { csrf, 'v.index.zztest.titulo': 'sin auth' }, { auth: false });
    assert.equal(r.status, 401);
    assert.equal(await fila('index.zztest.titulo'), undefined);
  });

  test('lista de páginas, editor y enlace desde el panel', async () => {
    const adm = await (await adminGet(A)).text();
    assert.ok(adm.includes(`href="${A}/textos"`));
    const r = await adminGet(A + '/textos');
    assert.equal(r.status, 200);
    const csp = r.headers.get('content-security-policy') || '';
    assert.match(csp, /default-src 'none'/);
    assert.match(csp, /style-src 'nonce-/);
    assert.doesNotMatch(csp, /script-src|unsafe-inline/);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    const t = await r.text();
    assert.ok(t.includes(`href="${A}/textos/index"`) && t.includes(`href="${A}/textos/terminos"`) && t.includes(`href="${A}/textos/comun"`));
    assert.ok(!t.includes('"/admin'), 'ningún enlace apunta a /admin');
    assert.ok(t.includes('/demo/'), 'aclara que la demo no se edita');
    assert.ok(!/<script/i.test(t));

    const e = await (await adminGet(A + '/textos/index')).text();
    assert.ok(csrf, 'el editor incluye el token');
    assert.match(e, /<textarea[^>]*name="v\.index\.zztest\.titulo"[^>]*>\nTítulo \*\*original\*\*<\/textarea>/);
    assert.match(e, /name="v\.index\.zztest\.p1"[^>]*>\nTexto con \[enlace\]\(\/terminos\) &amp; más<\/textarea>/);
    assert.match(e, /name="v\.index\.zztest\.desc"[^>]*>\nDescripción &quot;por defecto&quot;<\/textarea>/);
    assert.ok(!e.includes('comun.zztest.pie'), 'los textos comunes van en su propia página');
    assert.ok(e.includes('href="/" target="_blank"'), 'vista previa');
    assert.ok((await (await adminGet(A + '/textos/comun')).text()).includes('name="v.comun.zztest.pie"'));
    assert.equal((await adminGet(A + '/textos/no-existe')).status, 404);
  });

  test('guardar exige mismo origen y token CSRF', async () => {
    const campos = { 'v.index.zztest.titulo': 'Hackeado' };
    let r = await formPost(A + '/textos/index', { csrf, ...campos }, { headers: { origin: '' } });
    assert.equal(r.status, 403, 'sin Origin');
    r = await formPost(A + '/textos/index', { csrf, ...campos }, { headers: { origin: 'https://evil.example' } });
    assert.equal(r.status, 403, 'otro origen');
    r = await formPost(A + '/textos/index', { csrf: 'mal', ...campos });
    assert.equal(r.status, 403, 'token incorrecto');
    r = await formPost(A + '/textos/historial', { csrf: 'mal', id: '1' });
    assert.equal(r.status, 403, 'restaurar versión también exige token');
    assert.equal(await fila('index.zztest.titulo'), undefined);
    assert.ok(!(await pagina('/')).includes('Hackeado'));
  });

  test('guardar cambia la página pública al instante (invalida la caché)', async () => {
    assert.ok((await pagina('/')).includes('<h1>Título <strong>original</strong></h1>')); // queda en caché
    const r = await guardar('index', {
      'v.index.zztest.titulo': 'Nuevo **título**\r\nen dos líneas',
      'v.index.zztest.p1': 'Texto con [enlace](/terminos) & más', // igual al texto por defecto: no se guarda
    }, 'guardar:index.zztest.titulo');
    assert.equal(r.status, 303);
    assert.equal(r.headers.get('location'), `${A}/textos/index?ok=1#b-index.zztest.titulo`);
    const t = await pagina('/');
    assert.ok(t.includes('<h1>Nuevo <strong>título</strong><br>en dos líneas</h1>'), t);
    assert.ok(t.includes('<p>Texto con <a href="/terminos">enlace</a> &amp; más</p>'));
    assert.equal(await fila('index.zztest.titulo'), 'Nuevo **título**\nen dos líneas');
    assert.equal(await fila('index.zztest.p1'), undefined);
    const e = await (await adminGet(A + '/textos/index?ok=1')).text();
    assert.ok(e.includes('Cambios guardados: 1.'));
    assert.ok(e.includes('Modificado') && e.includes('Por defecto:</strong> Título **original**'));
  });

  test('XSS: todo se escapa; solo negrita, saltos y enlaces seguros', async () => {
    const valor = '<script>alert(1)</script> <img src=x onerror=alert(1)> [ok](https://example.com/a?b=1&c=2) [rel](/terminos#x) '
      + '[mail](mailto:a@b.co) [ancla](#top) [malo](javascript:alert(1)) [malo2](JaVaScRiPt:alert(1)) [malo3](data:text/html,x) '
      + '[q](/x"onmouseover=alert(1)) [v](vbscript:x) **negrita**\nlínea 2';
    const r = await guardar('index', {
      'v.index.zztest.p1': valor,
      'v.index.zztest.opcion': '<b>x</b> **y**\n[z](/a)',
      'v.index.zztest.desc': 'Desc "con comillas" <x> \' fin',
      'v.index.zztest.titulo-pagina': '</title><script>alert(1)</script>',
    });
    assert.equal(r.status, 303);
    const t = await pagina('/');
    assert.ok(!/<script/i.test(t), 'no hay <script>');
    assert.ok(!/<img/i.test(t), 'no hay <img>');
    assert.ok(!/href="(javascript|vbscript|data):/i.test(t), 'sin esquemas peligrosos');
    assert.ok(!/onmouseover="?alert/i.test(t.replace(/&quot;onmouseover/g, '')));
    assert.ok(t.includes('&lt;script&gt;alert(1)&lt;/script&gt; &lt;img src=x onerror=alert(1)&gt;'));
    assert.ok(t.includes('<a href="https://example.com/a?b=1&amp;c=2">ok</a>'));
    assert.ok(t.includes('<a href="/terminos#x">rel</a>'));
    assert.ok(t.includes('<a href="mailto:a@b.co">mail</a>'));
    assert.ok(t.includes('<a href="#top">ancla</a>'));
    assert.ok(t.includes('[malo](javascript:alert(1))') && t.includes('[malo2](JaVaScRiPt:alert(1))') && t.includes('[malo3](data:text/html,x)'));
    assert.ok(t.includes('<strong>negrita</strong><br>línea 2'));
    assert.ok(t.includes('<option value="a">&lt;b&gt;x&lt;/b&gt; **y** [z](/a)</option>'), 'solo texto en <option>');
    assert.ok(t.includes('content="Desc &quot;con comillas&quot; &lt;x&gt; &#39; fin"'), 'atributo escapado');
    assert.ok(t.includes('<title>&lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt;</title>'));
    // El admin muestra el valor escapado dentro del textarea
    const e = await (await adminGet(A + '/textos/index')).text();
    assert.ok(e.includes('&lt;/title&gt;&lt;script&gt;'));
    assert.ok(!/<script/i.test(e));
  });

  test('los marcadores {{...}} funcionan dentro de los valores', async () => {
    const r = await guardar('index', { 'v.index.zztest.p1': 'Escribí a [{{CONTACT_EMAIL}}](mailto:{{CONTACT_EMAIL}}) · {{OPERADOR}} · [inicio]({{SITE_URL}}/) · {{DESCONOCIDO}}' });
    assert.equal(r.status, 303);
    const t = await pagina('/');
    assert.ok(t.includes('<p>Escribí a <a href="mailto:contacto@sexyrose.net">contacto@sexyrose.net</a> · Operadora &amp; &lt;Prueba&gt; · <a href="https://sexyrose.net/">inicio</a> · {{DESCONOCIDO}}</p>'), t);
  });

  test('los textos comunes se editan una vez para todas las páginas', async () => {
    assert.ok((await pagina('/terminos')).includes('<footer>Pie común</footer>'));
    const r = await guardar('comun', { 'v.comun.zztest.pie': 'Pie **nuevo**' });
    assert.equal(r.status, 303);
    for (const p of ['/', '/terminos']) assert.ok((await pagina(p)).includes('<footer>Pie <strong>nuevo</strong></footer>'), p);
    // Una página no guarda claves de otra
    await guardar('index', { 'v.terminos.zztest.p': 'no corresponde' });
    assert.equal(await fila('terminos.zztest.p'), undefined);
  });

  test('historial: versiones anteriores, restaurar versión y restaurar por defecto', async () => {
    const clave = 'terminos.zztest.p';
    assert.equal((await guardar('terminos', { [`v.${clave}`]: 'versión 1' })).status, 303);
    assert.equal((await guardar('terminos', { [`v.${clave}`]: 'versión 2' })).status, 303);
    let h = (await db.query('SELECT id, valor FROM textos_historial WHERE clave = $1 ORDER BY id', [clave])).rows;
    assert.deepEqual(h.map((x) => x.valor), ['versión 1'], 'el texto por defecto no va al historial; la versión reemplazada sí');
    assert.ok((await pagina('/terminos')).includes('<p>versión 2</p>'));

    const hp = await (await adminGet(A + '/textos/historial?clave=' + clave)).text();
    assert.ok(hp.includes('versión 1') && hp.includes('Restaurar esta versión'));
    assert.ok((await (await adminGet(A + '/textos/terminos')).text()).includes('Versiones anteriores (1)'));

    let r = await formPost(A + '/textos/historial', { csrf, id: String(h[0].id) });
    assert.equal(r.status, 303);
    assert.equal(r.headers.get('location'), `${A}/textos/terminos?ok=version#b-${clave}`);
    assert.ok((await pagina('/terminos')).includes('<p>versión 1</p>'));
    h = (await db.query('SELECT valor FROM textos_historial WHERE clave = $1 ORDER BY id', [clave])).rows;
    assert.deepEqual(h.map((x) => x.valor), ['versión 1', 'versión 2']);

    // Restaurar por defecto: aunque el textarea traiga otra cosa, gana el botón; los demás cambios se guardan.
    r = await guardar('terminos', { [`v.${clave}`]: 'ignorado' }, `defecto:${clave}`);
    assert.equal(r.status, 303);
    assert.equal(r.headers.get('location'), `${A}/textos/terminos?ok=defecto#b-${clave}`);
    assert.ok((await pagina('/terminos')).includes('<p>Términos por defecto</p>'));
    assert.equal(await fila(clave), undefined);
    h = (await db.query('SELECT valor FROM textos_historial WHERE clave = $1 ORDER BY id', [clave])).rows;
    assert.deepEqual(h.map((x) => x.valor), ['versión 1', 'versión 2', 'versión 1']);

    r = await formPost(A + '/textos/historial', { csrf, id: '999999999999' });
    assert.equal(r.status, 404);
  });

  test('valor demasiado largo → 400 sin guardar', async () => {
    const r = await guardar('index', { 'v.index.zztest.titulo': 'x'.repeat(5001) });
    assert.equal(r.status, 400);
    assert.notEqual(await fila('index.zztest.titulo'), 'x'.repeat(5001));
  });
});

describe('textos editables: páginas reales de app/public', () => {
  const PUB = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'public');
  const PAGINAS = ['index', 'terminos', 'privacidad', 'contenido', 'trata', 'denunciar', '404'];
  let T;
  const archivos = {};
  before(async () => {
    T = await import('../textos.js');
    for (const p of PAGINAS) archivos[p] = await fs.readFile(path.join(PUB, p + '.html'), 'utf8');
  });

  test('marcadores bien formados, con claves de la página o comun.*', () => {
    for (const p of PAGINAS) {
      const h = archivos[p];
      const abre = h.match(/<!--[et]:/g) || [];
      const cierra = h.match(/<!--\/[et]-->/g) || [];
      assert.ok(abre.length > 10, p);
      assert.equal(abre.length, cierra.length, `${p}: marcadores sin cerrar`);
      assert.doesNotMatch(h, /<!--[et]:[^>]*-->(?:(?!<!--\/[et]-->)[\s\S])*<!--[et]:/, `${p}: marcadores anidados`);
      const out = T.aplicarTextos(h, new Map());
      assert.ok(!/<!--\/?[et]/.test(out), `${p}: quedan marcadores en la salida`);
      assert.equal(out, h.replace(/<!--\/?[et](:[^>]*)?-->/g, ''), `${p}: sin valores, solo se quitan los marcadores`);
      for (const b of T.extraerBloques(h)) assert.match(b.clave, new RegExp(`^(${p}|comun)\\.[a-z0-9-]+\\.[a-z0-9-]+$`), b.clave);
    }
  });

  test('los textos comunes son idénticos en todas las páginas', () => {
    const comun = new Map();
    for (const p of PAGINAS) {
      for (const b of T.extraerBloques(archivos[p]).filter((x) => x.clave.startsWith('comun.'))) {
        if (comun.has(b.clave)) assert.equal(comun.get(b.clave), b.def, `${p}: ${b.clave}`);
        comun.set(b.clave, b.def);
      }
    }
    assert.ok(comun.has('comun.pie.enlace5'), 'el enlace Denunciar del pie es editable');
  });

  test('cada texto por defecto pasa al formato editable y vuelve igual', () => {
    const norm = (h) => T.decodeEntities(h.replace(/[ \t\r\n]+/g, ' ').replace(/<br\s*\/?>/g, '<br>')).trim();
    for (const p of PAGINAS) {
      for (const b of T.extraerBloques(archivos[p])) {
        assert.equal(norm(T.renderValor(b.defValor, b.tipo)), norm(b.def), `${p}: ${b.clave}`);
      }
    }
  });

  test('el enlace Denunciar del pie mantiene su destino aunque se edite el texto', () => {
    for (const p of PAGINAS) assert.ok(archivos[p].includes('<a href="/denunciar"><!--t:comun.pie.enlace5-->Denunciar<!--/t--></a>'), p);
  });

  test('cada mensaje de forms.js tiene su texto editable en la página', async () => {
    const js = await fs.readFile(path.join(PUB, 'js', 'forms.js'), 'utf8');
    const claves = new Set([...js.matchAll(/T\("([a-z0-9-]+)",/g)].map((m) => m[1]));
    for (const t of ['whatsapp', 'telegram', 'email']) claves.add(`contacto-${t}-etiqueta`).add(`contacto-${t}-ayuda`);
    const enPaginas = archivos.index + archivos.denunciar;
    for (const k of claves) assert.ok(enPaginas.includes(`data-t="${k}"`), k);
  });

  test('renderValor: unidades de seguridad', () => {
    assert.equal(T.renderValor('<b>&"\'', 'e'), '&lt;b&gt;&amp;&quot;&#39;');
    assert.equal(T.renderValor('[x](javascript:alert(1))', 'e'), '[x](javascript:alert(1))');
    assert.equal(T.renderValor('[x](//evil.example)', 'e'), '<a href="//evil.example">x</a>'); // ruta que empieza con "/": no ejecuta código
    assert.equal(T.renderValor('[x](/a)', 't'), '[x](/a)');
    assert.equal(T.renderValor('a\nb', 't'), 'a b');
    assert.equal(T.renderValor('**[a](/b)**', 'e'), '<strong><a href="/b">a</a></strong>');
    assert.equal(T.renderValor('2 ** 3 y **', 'e'), '2 ** 3 y **');
  });
});

describe('logs', { skip: EXTERNAL && 'lee los logs del servidor en este proceso' }, () => {
  test('ningún log incluye la dirección del admin (tampoco los errores dentro del admin)', async () => {
    // Un parámetro mal codificado hace fallar la ruta del editor dentro del admin: el error se loguea.
    const r = await fetch(BASE + A + '/textos/%E0%A4%A', { headers: { authorization: adminAuth() } });
    assert.ok(r.status >= 400);
    assert.ok(!(await r.text()).includes(A.slice(1)));
    assert.ok(logs.some((l) => l.includes('admin habilitado')), 'avisa que el admin está habilitado');
    assert.ok(logs.some((l) => l.startsWith('error:') && l.includes('[admin]/textos/')), logs.join('\n'));
    const conRuta = logs.filter((l) => l.toLowerCase().includes(A.slice(1)));
    assert.deepEqual(conRuta, []);
  });
});
