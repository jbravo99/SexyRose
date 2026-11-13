// Rendimiento del sitio público: assets con hash (caché inmutable), compresión brotli/gzip negociada, cáscara HTML
// con CSP sin JS en línea (script-src 'self'), ETag/304 en la cáscara y en /api/sitio/estado, y el build en piezas.
//   DATABASE_URL=postgres://... node --test test/sitio-rendimiento.test.js
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { codificacion, enviar, fresco, paquete } from '../lib/compresion.js';
import { createSpaSitioRouter } from '../routes/spa-sitio.js';
import { start } from '../server.js';
import { invalidarSitio } from '../routes/sitio.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('Falta DATABASE_URL.'); process.exit(1); }

// GET crudo (sin descomprimir) para ver exactamente lo que manda el servidor
function pedir(base, p, headers = {}, method = 'GET') {
  return new Promise((ok, mal) => {
    const req = http.request(base + p, { method, headers }, (res) => {
      const partes = []; res.on('data', (c) => partes.push(c)); res.on('end', () => ok({ status: res.statusCode, headers: res.headers, body: Buffer.concat(partes) }));
    });
    req.on('error', mal); req.end();
  });
}
const descomprimir = (r) => (r.headers['content-encoding'] === 'br' ? zlib.brotliDecompressSync(r.body) : r.headers['content-encoding'] === 'gzip' ? zlib.gunzipSync(r.body) : r.body);
const sha12 = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 12);

describe('lib/compresion', () => {
  test('codificacion: br antes que gzip, respeta q=0 y sin cabecera no comprime', () => {
    const c = (ae) => codificacion({ headers: ae == null ? {} : { 'accept-encoding': ae } });
    assert.equal(c('gzip, deflate, br'), 'br');
    assert.equal(c('gzip, deflate'), 'gzip');
    assert.equal(c('br;q=0, gzip'), 'gzip');
    assert.equal(c('br;q=0.0, gzip;q=0'), null);
    assert.equal(c('br;q=0.5'), 'br');
    assert.equal(c('identity'), null);
    assert.equal(c(null), null);
    assert.equal(c('xbr, gzipx'), null);
  });
  test('paquete: br y gzip vuelven al original; chico no se comprime; ETag estable', async () => {
    const txt = 'hola mundo '.repeat(500);
    const p = paquete(txt);
    assert.equal(zlib.brotliDecompressSync(p.cod('br')).toString(), txt);
    assert.equal(zlib.gunzipSync(p.cod('gzip')).toString(), txt);
    await p.preparar();
    assert.equal(zlib.brotliDecompressSync(p.cod('br')).toString(), txt);
    assert.equal(p.cod(null), null);
    assert.equal(paquete('chico').cod('br'), null);
    assert.equal(paquete(txt).etag, p.etag);
    assert.notEqual(paquete(txt + '!').etag, p.etag);
    assert.match(p.etag, /^"[A-Za-z0-9_-]{27}"$/);
  });
  test('enviar: archivo grande con el brotli todavía sin preparar → gzip (nunca gzip con cabecera br)', async () => {
    const grande = crypto.randomBytes(400 * 1024).toString('hex'); // 800 KB de texto
    const p = paquete(grande);
    const res = { h: {}, code: 0, body: null, setHeader(k, v) { this.h[k.toLowerCase()] = v; }, status(c) { this.code = c; return this; }, end(b) { this.body = b; return this; } };
    enviar({ method: 'GET', headers: { 'accept-encoding': 'br, gzip' } }, res, p, {});
    assert.equal(res.h['content-encoding'], 'gzip');
    assert.equal(zlib.gunzipSync(res.body).toString(), grande);
    const res2 = { ...res, h: {} };
    enviar({ method: 'GET', headers: { 'accept-encoding': 'br' } }, res2, p, {});
    assert.equal(res2.h['content-encoding'], undefined);
    assert.equal(res2.body.toString(), grande);
    await p.preparar();
    const res3 = { ...res, h: {} };
    enviar({ method: 'GET', headers: { 'accept-encoding': 'br' } }, res3, p, {});
    assert.equal(res3.h['content-encoding'], 'br');
    assert.equal(zlib.brotliDecompressSync(res3.body).toString(), grande);
    const res4 = { ...res, h: {} };
    enviar({ method: 'GET', headers: { 'if-none-match': p.etag } }, res4, p, {}, 404);
    assert.equal(res4.code, 404);
  });
  test('fresco: If-None-Match con el ETag (también débil o en lista)', () => {
    const e = '"abc"';
    assert.equal(fresco({ headers: { 'if-none-match': '"abc"' } }, e), true);
    assert.equal(fresco({ headers: { 'if-none-match': 'W/"abc"' } }, e), true);
    assert.equal(fresco({ headers: { 'if-none-match': '"x", "abc"' } }, e), true);
    assert.equal(fresco({ headers: { 'if-none-match': '"x"' } }, e), false);
    assert.equal(fresco({ headers: {} }, e), false);
  });
});

describe('SPA del sitio: cáscara y assets', () => {
  let dir; let server; let BASE;
  const JS = 'window.HH_I18N_SRC="/assets/i18n.0123456789ab.js";\n' + 'console.log("sitio");\n'.repeat(400);
  const CSS = 'body{color:#fff}\n'.repeat(300);
  const DIC = 'HH.I18N=Object.assign({"Hola":["Hi","Olá"]},HH.I18N||{});\n'.repeat(50);
  const jsName = `app.${sha12(JS)}.js`; const cssName = `app.${sha12(CSS)}.css`;
  const FONT = 'wOF2' + 'f'.repeat(3000); const fontName = `manrope-latin-400.${sha12(FONT)}.woff2`;
  before(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-sitio-spa-'));
    await fs.mkdir(path.join(dir, 'assets'));
    await fs.writeFile(path.join(dir, 'assets', jsName), JS);
    await fs.writeFile(path.join(dir, 'assets', cssName), CSS);
    await fs.writeFile(path.join(dir, 'assets', 'i18n.0123456789ab.js'), DIC);
    await fs.writeFile(path.join(dir, 'assets', 'otro.0123456789ab.js'), 'no');
    await fs.mkdir(path.join(dir, 'assets', 'fonts'));
    await fs.writeFile(path.join(dir, 'assets', 'fonts', fontName), FONT);
    await fs.writeFile(path.join(dir, 'index.html'), '<!doctype html><html data-prod="sitio" data-routing="path"><head><title>x</title>\n'
      + '<!--SR:PRECONNECT-->\n<!--SR:I18N /assets/i18n.0123456789ab.js-->\n'
      + `<link rel="preload" href="/assets/${jsName}" as="script">\n<link rel="stylesheet" href="/assets/${cssName}">\n</head><body>`
      + '<main id="app"></main>' + 'x'.repeat(2000) + `<script src="/assets/${jsName}" defer></script></body></html>`);
    const app = express();
    app.use(createSpaSitioRouter({ spaPath: path.join(dir, 'index.html'), config: { publicDir: dir } }));
    app.use((req, res) => res.status(404).send('no'));
    server = app.listen(0, '127.0.0.1');
    await new Promise((ok) => server.once('listening', ok));
    BASE = `http://127.0.0.1:${server.address().port}`;
  });
  after(async () => { server.close(); await fs.rm(dir, { recursive: true, force: true }); });

  test('assets con hash: caché de un año inmutable, tipo correcto y nosniff', async () => {
    const r = await pedir(BASE, '/assets/' + jsName);
    assert.equal(r.status, 200);
    assert.equal(r.headers['cache-control'], 'public, max-age=31536000, immutable');
    assert.match(r.headers['content-type'], /^text\/javascript/);
    assert.equal(r.headers['x-content-type-options'], 'nosniff');
    assert.equal(r.headers['vary'], 'Accept-Encoding');
    assert.ok(r.headers.etag);
    assert.equal(r.body.toString(), JS);
    const c = await pedir(BASE, '/assets/' + cssName);
    assert.match(c.headers['content-type'], /^text\/css/);
    const d = await pedir(BASE, '/assets/i18n.0123456789ab.js');
    assert.equal(d.status, 200);
    assert.equal(d.body.toString(), DIC);
  });
  test('assets: compresión negociada (br, gzip, nada) y 304 con ETag', async () => {
    const br = await pedir(BASE, '/assets/' + jsName, { 'accept-encoding': 'gzip, deflate, br' });
    assert.equal(br.headers['content-encoding'], 'br');
    assert.equal(descomprimir(br).toString(), JS);
    assert.ok(br.body.length < JS.length / 5);
    assert.equal(Number(br.headers['content-length']), br.body.length);
    const gz = await pedir(BASE, '/assets/' + jsName, { 'accept-encoding': 'gzip' });
    assert.equal(gz.headers['content-encoding'], 'gzip');
    assert.equal(descomprimir(gz).toString(), JS);
    const nada = await pedir(BASE, '/assets/' + jsName, { 'accept-encoding': 'br;q=0' });
    assert.equal(nada.headers['content-encoding'], undefined);
    assert.equal(nada.body.toString(), JS);
    const n = await pedir(BASE, '/assets/' + jsName, { 'if-none-match': br.headers.etag, 'accept-encoding': 'br' });
    assert.equal(n.status, 304);
    assert.equal(n.body.length, 0);
    const h = await pedir(BASE, '/assets/' + jsName, { 'accept-encoding': 'br' }, 'HEAD');
    assert.equal(h.status, 200); assert.equal(h.body.length, 0); assert.equal(h.headers['content-encoding'], 'br');
  });
  test('fuentes (/assets/fonts/*.woff2): font/woff2, caché de un año, sin volver a comprimir', async () => {
    const r = await pedir(BASE, '/assets/fonts/' + fontName, { 'accept-encoding': 'br, gzip' });
    assert.equal(r.status, 200);
    assert.equal(r.headers['content-type'], 'font/woff2');
    assert.equal(r.headers['cache-control'], 'public, max-age=31536000, immutable');
    assert.equal(r.headers['x-content-type-options'], 'nosniff');
    assert.equal(r.headers['content-encoding'], undefined);
    assert.equal(r.body.toString(), FONT);
    for (const p of ['/assets/fonts/manrope.woff2', '/assets/fonts/x.0123456789ab.ttf', '/assets/fonts/sub/a.0123456789ab.woff2']) assert.equal((await pedir(BASE, p)).status, 404, p);
  });
  test('assets: nombres sin hash, con otra forma o inexistentes no se sirven', async () => {
    for (const p of ['/assets/app.js', '/assets/app.ZZZZZZZZ.js', '/assets/otro.0123456789ab.js', '/assets/app.0123456789ab.html',
      '/assets/app.ffffffffffff.js', '/assets/..%2Findex.html', '/assets/sub/app.0123456789ab.js']) {
      const r = await pedir(BASE, p);
      assert.equal(r.status, 404, p);
    }
  });
  test('cáscara: CSP sin JS en línea (script-src \'self\'), no-cache, comprimida, ETag y 304', async () => {
    const r = await pedir(BASE, '/', { 'accept-encoding': 'br' });
    assert.equal(r.status, 200);
    const csp = r.headers['content-security-policy'];
    assert.match(csp, /script-src 'self'(;|$)/);
    assert.doesNotMatch(csp, /nonce|unsafe-eval|script-src[^;]*unsafe-inline/);
    assert.match(csp, /default-src 'none'/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.equal(r.headers['cache-control'], 'no-cache');
    assert.match(r.headers['content-type'], /^text\/html/);
    assert.equal(r.headers['content-encoding'], 'br');
    const html = descomprimir(r).toString();
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i);
    assert.doesNotMatch(html, /<!--SR:/);
    assert.match(html, new RegExp(`<script src="/assets/${jsName.replace(/\./g, '\\.')}" defer>`));
    assert.doesNotMatch(html, /i18n\.0123456789ab\.js/); // en español no se pide el diccionario
    const n = await pedir(BASE, '/', { 'if-none-match': r.headers.etag });
    assert.equal(n.status, 304);
    const p = await pedir(BASE, '/perfil/alguien');
    assert.equal(p.status, 200);
    assert.equal(p.headers.etag, r.headers.etag);
  });
  test('cáscara en /en/ y /pt/: precarga el diccionario (otra versión, otro ETag)', async () => {
    for (const pre of ['/en/', '/pt/perfil/alguien', '/EN/swipe']) {
      const r = await pedir(BASE, pre);
      assert.equal(r.status, 200, pre);
      assert.match(r.body.toString(), /<link rel="preload" href="\/assets\/i18n\.0123456789ab\.js" as="script">/, pre);
    }
    const es = await pedir(BASE, '/'); const en = await pedir(BASE, '/en/');
    assert.notEqual(es.headers.etag, en.headers.etag);
  });
  test('la cáscara no tapa la API, el admin ni archivos', async () => {
    for (const p of ['/api/sitio/estado', '/favicon.svg', '/nada-de-nada', '/assets/']) assert.equal((await pedir(BASE, p)).status, 404, p);
  });
});

describe('/api/sitio/estado: caché HTTP y compresión', () => {
  let instance; let BASE; let tmpData; let tmpPublic;
  before(async () => {
    tmpData = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-rend-data-'));
    tmpPublic = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-rend-pub-'));
    await fs.writeFile(path.join(tmpPublic, 'index.html'), '<!doctype html><title>x</title>');
    instance = await start({
      port: 0, host: '127.0.0.1', databaseUrl: DATABASE_URL, publicDir: tmpPublic, dataDir: tmpData, storage: 'local',
      adminPath: '/panel-rendimiento-0123456789', adminUser: 'adm', adminPassword: 'clave-de-prueba-larga-789', ipHashSalt: 'sal',
      siteUrl: 'https://sexyrose.net', telegramToken: '', telegramChatId: '', mailgunApiKey: '', log: () => {}, tareaPlanes: false,
    });
    BASE = `http://127.0.0.1:${instance.port}`;
    await instance.ready;
  });
  after(async () => { if (instance) await instance.close(); await fs.rm(tmpData, { recursive: true, force: true }); await fs.rm(tmpPublic, { recursive: true, force: true }); });

  test('Cache-Control público corto, ETag, Vary, br/gzip y 304', async () => {
    invalidarSitio();
    const plano = await pedir(BASE, '/api/sitio/estado');
    assert.equal(plano.status, 200);
    assert.equal(plano.headers['cache-control'], 'public, max-age=30, stale-while-revalidate=60');
    assert.match(plano.headers['content-type'], /^application\/json/);
    assert.equal(plano.headers['vary'], 'Accept-Encoding');
    assert.ok(plano.headers.etag);
    const datos = JSON.parse(plano.body.toString());
    assert.ok(Array.isArray(datos.perfiles));
    const br = await pedir(BASE, '/api/sitio/estado', { 'accept-encoding': 'br, gzip' });
    assert.equal(br.headers.etag, plano.headers.etag);
    if (plano.body.length >= 1024) {
      assert.equal(br.headers['content-encoding'], 'br');
      const gz = await pedir(BASE, '/api/sitio/estado', { 'accept-encoding': 'gzip' });
      assert.equal(gz.headers['content-encoding'], 'gzip');
      assert.deepEqual(JSON.parse(descomprimir(gz).toString()), datos);
    }
    assert.deepEqual(JSON.parse(descomprimir(br).toString()), datos);
    const n = await pedir(BASE, '/api/sitio/estado', { 'if-none-match': plano.headers.etag });
    assert.equal(n.status, 304);
    assert.equal(n.body.length, 0);
    const otro = await pedir(BASE, '/api/sitio/estado', { 'if-none-match': '"otro"' });
    assert.equal(otro.status, 200);
  });
});

describe('build del sitio (app/scripts/build-sitio.py)', () => {
  const py = spawnSync('python3', ['--version']);
  test('cáscara chica sin JS en línea + assets con el hash de su contenido + diccionario aparte', { skip: py.status !== 0 && 'sin python3' }, async () => {
    const out = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-build-sitio-'));
    // @fontsource de mentira (mismo formato que los paquetes reales): CSS por peso con un bloque por subconjunto
    const fsrc = path.join(out, 'fontsource');
    const FUENTES = { poppins: ['Poppins', [500, 600, 700]], manrope: ['Manrope', [400, 500, 600, 700, 800]] };
    for (const [pkg, [fam, pesos]] of Object.entries(FUENTES)) {
      await fs.mkdir(path.join(fsrc, pkg, 'files'), { recursive: true });
      for (const w of pesos) {
        let css = '';
        for (const sub of ['latin-ext', 'latin']) {
          await fs.writeFile(path.join(fsrc, pkg, 'files', `${pkg}-${sub}-${w}-normal.woff2`), `wOF2 ${pkg} ${sub} ${w}`);
          css += `/* ${pkg}-${sub}-${w}-normal */\n@font-face {\n  font-family: '${fam}';\n  font-style: normal;\n  font-display: swap;\n  font-weight: ${w};\n  src: url(./files/${pkg}-${sub}-${w}-normal.woff2) format('woff2');\n  unicode-range: ${sub === 'latin' ? 'U+0000-00FF,U+0131' : 'U+0100-02BA'};\n}\n\n`;
        }
        await fs.writeFile(path.join(fsrc, pkg, `${w}.css`), css);
      }
    }
    try {
      const r = spawnSync('python3', [path.join(HERE, '..', 'scripts', 'build-sitio.py')], { env: { ...process.env, SITIO_OUT: path.join(out, 'index.html'), NO_MINIFY: '1', FONTSOURCE_DIR: fsrc, REQUIRE_FONTS: '1' }, encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
      const html = await fs.readFile(path.join(out, 'index.html'), 'utf8');
      assert.ok(html.length < 8000, 'la cáscara tiene que ser chica: ' + html.length);
      assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i);
      assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
      assert.match(html, /<!--SR:PRECONNECT-->/);
      assert.match(html, /<link rel="preload" href="\/api\/sitio\/estado" as="fetch" crossorigin="anonymous">/);
      // Fuentes propias (sin Google Fonts): .woff2 con hash, @font-face con font-display: swap y las 2 más usadas precargadas
      assert.doesNotMatch(html, /fonts\.(googleapis|gstatic)\.com/);
      assert.match(html, /<!--SR:SEO-->/);
      const fuentes = await fs.readdir(path.join(out, 'assets', 'fonts'));
      assert.equal(fuentes.length, 16, fuentes.join(','));
      for (const n of fuentes) {
        const m = n.match(/^(poppins|manrope)-(latin|latin-ext)-(\d00)\.([0-9a-f]{12})\.woff2$/);
        assert.ok(m, n);
        assert.equal(m[4], sha12(await fs.readFile(path.join(out, 'assets', 'fonts', n))), n);
      }
      const pre = [...html.matchAll(/<link rel="preload" href="(\/assets\/fonts\/[^"]+)" as="font" type="font\/woff2" crossorigin>/g)].map((x) => x[1]);
      assert.equal(pre.length, 2);
      assert.ok(pre.some((u) => /manrope-latin-400\./.test(u)) && pre.some((u) => /poppins-latin-600\./.test(u)), pre.join(','));
      const seoDatos = JSON.parse(await fs.readFile(path.join(out, 'seo-datos.json'), 'utf8'));
      assert.ok(seoDatos.defaults.tpl.es.place.title.includes('{lugar}'));
      assert.equal(seoDatos.lugares['Ciudad de Buenos Aires'].slug, 'buenos-aires');
      assert.deepEqual(seoDatos.dict['Provincia de Buenos Aires'], ['Buenos Aires Province', 'Província de Buenos Aires']);
      // Sin actividades en el sitio (12/11/2026): sus nombres no viajan en el diccionario ni hay plantilla de lugar + actividad
      assert.equal(seoDatos.dict.Cena, undefined); assert.equal(seoDatos.defaults.tpl.es.placeAct, undefined);
      const ls = await fs.readdir(path.join(out, 'assets'));
      const js = ls.find((n) => /^app\.[0-9a-f]{12}\.js$/.test(n)); const css = ls.find((n) => /^app\.[0-9a-f]{12}\.css$/.test(n)); const dic = ls.find((n) => /^i18n\.[0-9a-f]{12}\.js$/.test(n));
      assert.ok(js && css && dic, ls.join(','));
      for (const n of [js, css, dic]) assert.equal(n.split('.')[1], sha12(await fs.readFile(path.join(out, 'assets', n))), n);
      assert.match(html, new RegExp(`<script src="/assets/${js}" defer></script>`));
      assert.match(html, new RegExp(`<link rel="stylesheet" href="/assets/${css}">`));
      assert.match(html, new RegExp(`<!--SR:I18N /assets/${dic}-->`));
      const cssCode = await fs.readFile(path.join(out, 'assets', css), 'utf8');
      assert.match(cssCode, /@font-face\{font-family:'Manrope';font-style:normal;font-display:swap;font-weight:400;src:url\(\/assets\/fonts\/manrope-latin-400\.[0-9a-f]{12}\.woff2\) format\('woff2'\);unicode-range:U\+0000-00FF,U\+0131\}/);
      assert.doesNotMatch(cssCode, /googleapis/);
      const code = await fs.readFile(path.join(out, 'assets', js), 'utf8');
      assert.ok(!code.includes('data-fonts'));
      // Mensajes del servidor en/pt: van al diccionario, no al JS principal
      assert.ok(!code.includes('Wrong email or password.'));
      assert.ok(code.includes(`window.HH_I18N_SRC="/assets/${dic}"`));
      assert.ok(!code.includes('/* ===== i18n-dict.js ===== */'));
      assert.ok(code.includes("window.HH_PROD = 'sitio'"));
      const d = await fs.readFile(path.join(out, 'assets', dic), 'utf8');
      assert.match(d, /^HH\.I18N=Object\.assign\(\{/);
      assert.ok(d.includes('Wrong email or password.'));
    } finally { await fs.rm(out, { recursive: true, force: true }); }
  });
});
