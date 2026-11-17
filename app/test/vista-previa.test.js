// Vista previa del perfil de la acompañante (17/11/2026, pedido de Juan): GET /api/cuenta/vista-previa y la página
// /panel/vista-previa. Solo con su sesión y solo su propio perfil, en cualquier estado y con la home provisoria
// prendida; sin caché, fuera de los buscadores y sin sumar visitas ni toques. El público sigue sin ver ningún perfil.
//   DATABASE_URL=postgres://... node --test test/vista-previa.test.js
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { start } from '../server.js';
import { invalidarCatalogos } from '../lib/catalogos.js';
import { invalidarSitio } from '../routes/sitio.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MVP = path.join(HERE, '..', '..', 'mvp');
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('Falta DATABASE_URL.'); process.exit(1); }

describe('vista previa del perfil', () => {
  const db = new pg.Pool({ connectionString: DATABASE_URL, max: 4 });
  const A = '/panel-pruebas-vista-previa-0123';
  const USER = 'admin-vp'; const PASS = 'clave-de-prueba-larga-vp-1';
  const AUTH = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
  let instance; let BASE; let tmpData; let tmpSpa;
  let ana; let bea; // ana: borrador con fotos, video, historia y destacada; bea: otra acompañante, publicada
  const sesiones = new Map();
  async function cookieDe(id) {
    if (!sesiones.has(id)) {
      const t = crypto.randomBytes(24).toString('base64url');
      await db.query("INSERT INTO sesiones (token_hash, cuenta_id, expira) VALUES (sha256($1::bytea), $2, now() + interval '1 hour')", [Buffer.from(t), id]);
      sesiones.set(id, 'sr_sesion=' + t);
    }
    return sesiones.get(id);
  }
  const get = async (p, quien) => fetch(BASE + p, { redirect: 'manual', headers: { 'user-agent': UA, ...(quien ? { cookie: await cookieDe(quien.id) } : {}) } });
  const vista = async (quien, q = '') => get('/api/cuenta/vista-previa' + q, quien);
  const admin = (method, p, body) => fetch(BASE + A + '/api' + p, {
    method, body: body === undefined ? undefined : JSON.stringify(body),
    headers: { authorization: AUTH, ...(method !== 'GET' ? { 'content-type': 'application/json', 'x-sr-admin': '1', origin: BASE } : {}) },
  });
  const evento = (body) => fetch(BASE + '/api/sitio/evento', {
    method: 'POST', body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'x-sr': '1', origin: BASE, 'user-agent': UA, 'cf-connecting-ip': '2001:db8::' + crypto.randomBytes(2).toString('hex') },
  });
  const ponerPre = async (activo) => {
    if (activo === null) { await db.query("DELETE FROM ajustes WHERE clave = 'prelanzamiento'"); invalidarCatalogos(); invalidarSitio(); return; }
    const r = await admin('PUT', '/ajustes/prelanzamiento', { valor: { activo } });
    assert.equal(r.status, 200);
  };
  const totalMetricas = async () => {
    const a = await db.query('SELECT COALESCE(sum(vistas + whatsapp + telegram), 0)::int AS n FROM metricas_perfil_dia WHERE cuenta_id = ANY($1)', [[ana.id, bea.id]]);
    const s = await db.query('SELECT COALESCE(sum(vistas), 0)::int AS n FROM metricas_sitio_dia');
    return { perfil: a.rows[0].n, sitio: s.rows[0].n };
  };

  async function acompanante(nombre, { estado = 'borrador', verificacion = 'sin_enviar', oculto = false, fotos = 0, extra = {} } = {}) {
    const email = `zzvp-${crypto.randomBytes(4).toString('hex')}@example.com`;
    const { rows } = await db.query("INSERT INTO cuentas (email, pass_hash, email_verificado) VALUES ($1, 'x', now()) RETURNING id", [email]);
    const id = rows[0].id; const slug = `zzvp-${nombre.toLowerCase()}-${id.slice(0, 6)}`;
    const datos = { displayName: nombre, genero: 'mujer', fechaNacimiento: '1996-05-01', pais: 'argentina', provincia: 'provincia-de-buenos-aires', ciudad: 'san-isidro', whatsapp: '+5491122223333', ...extra };
    await db.query('INSERT INTO perfiles (cuenta_id, slug, datos, estado, verificacion, oculto, publicado_en) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [id, slug, JSON.stringify(datos), estado, verificacion, oculto, estado === 'publicado' ? new Date() : null]);
    for (let i = 0; i < fotos; i++) {
      await db.query('INSERT INTO fotos (cuenta_id, orden, clave, url, url_mini, ancho, alto) VALUES ($1, $2, $3, $4, $4, 800, 1000)', [id, i, `zzvp/${id}/${i}.jpg`, `https://cdn.example/zzvp/${id}/${i}.jpg`]);
    }
    return { id, slug };
  }

  before(async () => {
    tmpData = await fs.mkdtemp(path.join(os.tmpdir(), 'srvp-data-'));
    tmpSpa = await fs.mkdtemp(path.join(os.tmpdir(), 'srvp-spa-'));
    await fs.mkdir(path.join(tmpSpa, 'assets'));
    await fs.writeFile(path.join(tmpSpa, 'index.html'), '<!doctype html><html lang="es-AR"><head><title>SR</title><meta name="description" content="x"><!--SR:SEO--><!--SR:PRECONNECT--></head><body><main id="app"></main></body></html>');
    const tpl = Object.fromEntries(['es', 'en', 'pt'].map((l) => [l, Object.fromEntries(['country', 'place', 'countryMen', 'placeMen', 'profile'].map((k) => [k, { title: k + ' {lugar}', description: k }]))]));
    await fs.writeFile(path.join(tmpSpa, 'seo-datos.json'), JSON.stringify({ defaults: { siteUrl: 'https://sexyrose.test', minProfiles: 1, home: Object.fromEntries(['es', 'en', 'pt'].map((l) => [l, { title: 'Inicio', description: 'd' }])), tpl }, lugares: {}, dict: {} }));
    process.env.SITIO_SPA_PATH = path.join(tmpSpa, 'index.html');
    instance = await start({
      prelanzamientoPorDefecto: true,
      port: 0, host: '127.0.0.1', databaseUrl: DATABASE_URL, adminPath: A, adminUser: USER, adminPassword: PASS,
      ipHashSalt: 'sal', siteUrl: 'https://sexyrose.test', dataDir: tmpData, log: () => {}, tareaPlanes: false, sendMail: async () => {},
    });
    BASE = `http://127.0.0.1:${instance.port}`;
    await instance.ready;
    await db.query("DELETE FROM cuentas WHERE email LIKE 'zzvp-%'");
    await ponerPre(null); // nunca guardado: prendida (prelanzamientoPorDefecto)
    // 9 fotos con Bronce (límite 8): la vista previa muestra lo mismo que se publicaría
    ana = await acompanante('Ana', { fotos: 9, extra: { titular: 'Hola, soy Ana', bio: 'Charla, cena y buena onda.', idiomas: ['Español', 'Inglés'], telegram: 'ana_tg', tarifaDesde: 120 } });
    await db.query("INSERT INTO videos (cuenta_id, orden, estado, url, url_poster, segundos, ancho, alto) VALUES ($1, 0, 'listo', 'https://cdn.example/zzvp/v.mp4', 'https://cdn.example/zzvp/v.jpg', 12, 720, 1280)", [ana.id]);
    await db.query("INSERT INTO videos (cuenta_id, orden, estado) VALUES ($1, 1, 'procesando')", [ana.id]);
    await db.query("INSERT INTO historias (cuenta_id, url, estado, expira) VALUES ($1, 'https://cdn.example/zzvp/h.jpg', 'listo', now() + interval '10 hours')", [ana.id]);
    await db.query("INSERT INTO historias (cuenta_id, url, estado, expira) VALUES ($1, 'https://cdn.example/zzvp/vieja.jpg', 'listo', now() - interval '1 hour')", [ana.id]);
    const { rows: d } = await db.query("INSERT INTO destacadas (cuenta_id, titulo) VALUES ($1, 'Viajes') RETURNING id", [ana.id]);
    await db.query("INSERT INTO destacada_items (destacada_id, cuenta_id, tipo, estado, url) VALUES ($1, $2, 'foto', 'listo', 'https://cdn.example/zzvp/d.jpg')", [d[0].id, ana.id]);
    bea = await acompanante('Bea', { estado: 'publicado', verificacion: 'verificada', fotos: 3 });
  });
  after(async () => {
    await instance?.close();
    delete process.env.SITIO_SPA_PATH;
    await db.query("DELETE FROM ajustes WHERE clave = 'prelanzamiento'");
    await db.query("DELETE FROM cuentas WHERE email LIKE 'zzvp-%'");
    await db.end();
    await fs.rm(tmpData, { recursive: true, force: true });
    await fs.rm(tmpSpa, { recursive: true, force: true });
  });

  test('con la home provisoria prendida y el perfil en borrador: ve su perfil como se publicaría, sin caché ni buscadores', async () => {
    const r = await vista(ana);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.match(r.headers.get('x-robots-tag') || '', /noindex/);
    const b = await r.json();
    assert.equal(b.ok, true);
    assert.equal(b.publico, false);
    const p = b.perfil;
    assert.equal(p.cuentaId, ana.id);
    assert.equal(p.slug, ana.slug);
    assert.equal(p.displayName, 'Ana');
    assert.equal(p.titular, 'Hola, soy Ana');
    assert.deepEqual(p.idiomas, ['Español', 'Inglés']);
    assert.equal(p.tarifaDesde, 120);
    assert.deepEqual(p.contacto, { whatsapp: '+5491122223333', telegram: 'ana_tg' });
    assert.equal(p.ciudad, 'San Isidro');
    assert.equal(p.fotos.length, 8, 'mismo límite de fotos que el sitio (Bronce: 8)');
    assert.deepEqual(p.videos.map((v) => v.url), ['https://cdn.example/zzvp/v.mp4'], 'solo los videos listos');
    assert.deepEqual(p.destacadas.map((x) => x.titulo), ['Viajes']);
    assert.deepEqual(b.historias.map((h) => h.url), ['https://cdn.example/zzvp/h.jpg'], 'solo las historias vigentes');
    assert.equal(b.historias[0].cuentaId, ana.id);
    assert.ok(b.ubicaciones.some((u) => u.id === 'san-isidro'), 'su lugar viaja aunque el sitio no muestre lugares');
    // Nunca datos privados
    const txt = JSON.stringify(b);
    for (const x of ['fechaNacimiento', '1996-05-01', 'email', 'zzvp-' + ana.id.slice(0, 4) + '@']) assert.ok(!txt.includes(x), x);
  });

  test('en revisión, rechazado, oculto o pausado: también', async () => {
    for (const [estado, oculto] of [['en_revision', false], ['rechazado', false], ['publicado', true], ['pausado', false]]) {
      await db.query('UPDATE perfiles SET estado = $2, oculto = $3 WHERE cuenta_id = $1', [ana.id, estado, oculto]);
      const r = await vista(ana);
      assert.equal(r.status, 200, estado);
      assert.equal((await r.json()).perfil.cuentaId, ana.id, estado);
    }
    await db.query("UPDATE perfiles SET estado = 'borrador', oculto = false WHERE cuenta_id = $1", [ana.id]);
  });

  test('solo con su sesión y solo su propio perfil', async () => {
    const sin = await vista(null);
    assert.equal(sin.status, 401);
    assert.equal(sin.headers.get('cache-control'), 'no-store');
    // Otra acompañante: ve el suyo, nunca el de Ana (la ruta no acepta slug ni id)
    for (const q of ['', '?slug=' + ana.slug, '?cuenta=' + ana.id, '?id=' + ana.id]) {
      const b = await (await vista(bea, q)).json();
      assert.equal(b.perfil.cuentaId, bea.id, q);
      assert.ok(!JSON.stringify(b).includes(ana.id) && !JSON.stringify(b).includes('Ana'), q);
    }
    assert.equal((await get('/api/cuenta/vista-previa/' + ana.slug, bea)).status, 404);
    // Sesión vencida o inventada
    const falsa = await fetch(BASE + '/api/cuenta/vista-previa', { headers: { cookie: 'sr_sesion=' + crypto.randomBytes(24).toString('base64url') } });
    assert.equal(falsa.status, 401);
  });

  test('el público sigue sin ver ningún perfil: sin sesión, con la de otra acompañante y con la suya', async () => {
    for (const quien of [null, bea, ana]) {
      const quienTxt = quien ? quien.slug : 'sin sesión';
      for (const slug of [ana.slug, bea.slug]) {
        const r = await get('/api/sitio/perfil/' + slug, quien);
        assert.equal(r.status, 404, quienTxt + ' → ' + slug);
        assert.equal((await r.json()).error, 'Perfil no encontrado.');
        const h = await get('/perfil/' + slug, quien);
        assert.equal(h.status, 302, quienTxt);
        assert.equal(h.headers.get('location'), '/');
      }
      const e = await (await get('/api/sitio/estado', quien)).json();
      assert.deepEqual(e.perfiles, []);
      assert.deepEqual(e.historias, []);
    }
  });

  test('la página /panel/vista-previa (y Mi perfil, /panel/mi-perfil): abierta con la home provisoria, sin caché, noindex y fuera del sitemap', async () => {
    for (const p of ['/panel/vista-previa', '/en/panel/vista-previa', '/pt/panel/vista-previa', '/panel/mi-perfil', '/en/panel/mi-perfil', '/pt/panel/mi-perfil']) {
      const r = await get(p);
      assert.equal(r.status, 200, p);
      assert.equal(r.headers.get('cache-control'), 'no-store', p);
      assert.match(r.headers.get('x-robots-tag') || '', /noindex/, p);
      assert.match(await r.text(), /<meta name="robots" content="noindex,nofollow">/, p);
    }
    assert.equal((await get('/panel/fotos')).headers.get('cache-control'), 'no-cache', 'el resto del panel no cambia');
    const xml = await (await get('/sitemap.xml')).text();
    assert.doesNotMatch(xml, /vista-previa|mi-perfil|panel|zzvp/);
  });

  test('no suma visitas ni toques (Mis números y Admin → Métricas)', async () => {
    const antes = await totalMetricas();
    for (let i = 0; i < 5; i++) assert.equal((await vista(ana)).status, 200);
    await get('/panel/vista-previa', ana);
    await get('/panel/mi-perfil', ana);
    // Aunque el navegador mandara eventos, con la home provisoria no se cuentan, y un perfil sin publicar no existe
    for (const tipo of ['vista', 'whatsapp', 'telegram']) assert.equal((await evento({ tipo, perfil: ana.slug })).status, 204);
    assert.deepEqual(await totalMetricas(), antes);
    const n = await (await get('/api/cuenta/numeros?periodo=7d', ana)).json();
    assert.equal(n.ok, true);
    assert.equal(n.vistas.total, 0);
    assert.equal(n.clics.total, 0);
    await ponerPre(false);
    try {
      for (const tipo of ['vista', 'whatsapp']) assert.equal((await evento({ tipo, perfil: ana.slug })).status, 404, 'borrador: no existe para el sitio');
      assert.deepEqual(await totalMetricas(), antes);
    } finally { await ponerPre(null); }
  });

  test('con la home provisoria apagada y el perfil publicado: el perfil público sigue igual y la vista previa también', async () => {
    await ponerPre(false);
    try {
      const pub = await (await get('/api/sitio/perfil/' + bea.slug)).json();
      assert.equal(pub.cuentaId, bea.id);
      const b = await (await vista(bea)).json();
      assert.equal(b.publico, true);
      const { destacadas, ...sinDest } = b.perfil;
      const { destacadas: d2, ...pubSinDest } = pub;
      assert.deepEqual(sinDest, pubSinDest, 'mismo armado que el sitio público');
      assert.equal((await get('/perfil/' + bea.slug)).status, 200);
      // Ana sigue en borrador: el público no la ve
      assert.equal((await get('/api/sitio/perfil/' + ana.slug)).status, 404);
      assert.equal((await (await vista(ana)).json()).publico, false);
    } finally { await ponerPre(null); }
  });

  test('el front: entrada desde el panel, ruta del panel, sin métricas ni visitas', async () => {
    const sitio = await fs.readFile(path.join(MVP, 'src', 'prod-sitio.js'), 'utf8');
    assert.match(sitio, /api\('GET', '\/cuenta\/vista-previa'\)/);
    assert.match(sitio, /b === 'vista-previa'/);
    assert.match(sitio, /head\('Mi panel', [^\n]*vpBtn\(\)\)/, 'botón en Resumen');
    assert.match(sitio, /head\('Mi perfil', [^\n]*vpBtn\(\)\)/, 'botón en Mi perfil');
    assert.ok(sitio.includes('<a class="small pub" href="${YO_GO}" data-go="${YO_GO}">Ver mi perfil</a>'), '"Ver mi perfil" en el panel lleva a Mi perfil');
    const pub = await fs.readFile(path.join(MVP, 'src', 'views-public.js'), 'utf8');
    assert.match(pub, /if \(!mine && !opts\.preview && !own\) HH\.view\(p\.userId\)/, 'ni la vista previa ni Mi perfil suman visitas');
    const met = await fs.readFile(path.join(MVP, 'src', 'prod-metricas.js'), 'utf8');
    const esPagina = met.match(/const esPagina = [^\n]+/)[0];
    assert.doesNotMatch(esPagina, /panel/, 'las páginas del panel no se cuentan');
    assert.match(met, /if \(!p \|\| !p\.slug \|\| propio\(p\)\) return;/, 'sus propios toques no se cuentan');
  });
});
