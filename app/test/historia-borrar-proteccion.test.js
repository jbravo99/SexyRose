// Dos pedidos de Juan (17/11/2026):
//  1. "Desde la misma historia, al verla el/la acompañante debe poder eliminarla, al igual que en Instagram."
//     → "⋯" en la cabecera del visor (core.js), solo en lo suyo: "Eliminar historia" (o "Quitar de la destacada") →
//     confirmar → misma API que el panel. El servidor exige que sea de su cuenta.
//  2. "Que las fotos no se puedan abrir en pestañas aparte ni que se puedan descargar." → en el sitio: sin la hoja de
//     iOS/Android al mantener apretado (CSS), sin menú contextual ni arrastre (un listener), draggable="false" y videos
//     sin descarga. Es disuasivo: no evita capturas ni que alguien lea la dirección del archivo.
//   DATABASE_URL=postgres://... node --test test/historia-borrar-proteccion.test.js
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { start } from '../server.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..', '..', 'mvp', 'src');
const leer = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('Falta DATABASE_URL.'); process.exit(1); }

/* ---------- core.js en una caja (sin navegador) ---------- */
// Un document/window de mentira: todo lo que no importa responde algo vacío; el visor de historias escribe en storyRoot.
function cargarCore() {
  const stub = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'then' ? undefined : stub()), apply: () => stub() });
  const root = { innerHTML: '', isConnected: true, querySelector: () => null, querySelectorAll: () => [], remove() {}, setAttribute() {}, appendChild() {} };
  const document = new Proxy({}, { get: (t, k) => (k === 'getElementById' ? (id) => (id === 'storyRoot' ? root : null) : stub()) });
  const window = { addEventListener() {}, matchMedia: () => ({ matches: false }), location: { hash: '', pathname: '/', href: 'http://x/' } };
  const ctx = { window, document, location: window.location, history: { pushState() {}, back() {}, state: null }, navigator: { language: 'es' },
    localStorage: { getItem: () => null, setItem() {} }, console, setTimeout, clearTimeout, requestAnimationFrame: () => 1, cancelAnimationFrame() {}, Image: function () {} };
  vm.createContext(ctx);
  vm.runInContext(leer('core.js'), ctx);
  const HH = window.HH;
  HH.db = { settings: {}, stories: [], users: [], profiles: [] };
  HH.save = () => {};
  return { HH, root };
}

describe('visor de historias: "⋯" solo en lo propio (core.js)', () => {
  const { HH, root } = cargarCore();
  const P = { userId: 'A', slug: 'ana', displayName: 'Ana', photos: ['https://cdn.example/a.jpg'], city: 'X' };
  const B = { ...P, userId: 'B', slug: 'bea', displayName: 'Bea' };
  const fut = new Date(Date.now() + 3600e3).toISOString(); const ant = new Date(Date.now() - 3600e3).toISOString();
  HH.db.stories = [{ id: 'h1', workerId: 'A', src: 'https://cdn.example/h1.jpg', createdAt: ant, expiresAt: fut }, { id: 'h2', workerId: 'B', src: 'https://cdn.example/h2.jpg', createdAt: ant, expiresAt: fut }];
  HH.profileOf = (id) => ({ A: P, B }[id]);
  HH.me = () => null;
  const abrir = (id, opts) => { root.innerHTML = ''; HH.openStories(id, 0, null, opts); return root.innerHTML; };

  test('sin el gancho del sitio (prototipo, demo): nunca hay "⋯"', () => {
    delete HH.storyOwnMenu;
    assert.match(abrir('A'), /class="story-view/);
    assert.doesNotMatch(root.innerHTML, /story-more|data-story="more"/);
  });
  test('con el gancho: "⋯" solo cuando dice que es suya; recibe la acompañante y si es destacada', () => {
    const vistos = [];
    HH.storyOwnMenu = (st, c) => { vistos.push([st.id, c.workerId, c.highlight]); return c.workerId === 'A' ? { label: 'Eliminar historia', confirm: 'x', okLabel: 'Eliminar', done: 'y', run: async () => {} } : null; };
    const suya = abrir('A');
    assert.match(suya, /<button type="button" class="icon-btn sm story-more" data-story="more" aria-label="Más opciones" aria-haspopup="menu" aria-expanded="false">/);
    assert.ok(suya.indexOf('story-more') < suya.indexOf('data-story="close"'), 'antes de la X, como en Instagram');
    assert.doesNotMatch(abrir('B'), /story-more/, 'la historia de otra: sin menú');
    abrir('A', { items: [{ id: 'd1', workerId: 'A', src: 'https://cdn.example/d1.jpg', createdAt: ant }], title: 'Viajes' });
    assert.deepEqual(vistos, [['h1', 'A', false], ['h2', 'B', false], ['d1', 'A', true]]);
  });
  test('el menú pausa la historia, Escape lo cierra y al borrar sigue con la próxima o se cierra', () => {
    const core = leer('core.js');
    assert.match(core, /const pintarMenu = \(estado\) => \{[\s\S]*?if \(!estado\) \{ pausar\(false\);[\s\S]*?pausar\(true\);/);
    assert.match(core, /const onKey = \(ev\) => \{ if \(menu\) \{ if \(ev\.key === 'Escape' && menu !== 'busy'\) pintarMenu\(null\); return; \}/);
    assert.match(core, /root\.onpointerdown = \(ev\) => \{\s*if \(menu\) return;/, 'mantener apretado no reanuda con el menú abierto');
    assert.match(core, /if \(!list\.length \|\| i >= list\.length\) \{ close\(\); return; \}\s*render\(\);/);
    // El aviso "Historia eliminada." se ve encima del visor
    const css = leer('app.css');
    const z = (sel) => Number((css.match(new RegExp('\\' + sel + ' \\{[^}]*z-index: (\\d+)')) || [])[1]);
    assert.ok(z('.toast-root') > z('.story-root') && z('.toast-root') > z('.lb-root'), 'toast sobre los visores');
  });
});

/* ---------- prod-sitio.js: quién ve el menú y qué API llama ---------- */
describe('prod-sitio.js: HH.storyOwnMenu', () => {
  const src = leer('prod-sitio.js');
  const trozo = src.slice(src.indexOf('  const esPropia = '), src.indexOf('  async function recargarPropias()'));
  const llamadas = []; const S = { yo: null };
  const ctx = { HH: { db: { stories: [{ id: 'h1', workerId: 'A' }, { id: 'h2', workerId: 'A' }], highlights: [{ id: 'd', items: [{ id: 'i1' }, { id: 'i2' }] }] } }, S, api: async (m, p) => { llamadas.push([m, p]); return { ok: true }; }, recargarPropias: () => llamadas.push(['recargar']) };
  vm.createContext(ctx); vm.runInContext(trozo, ctx);
  const menu = (st, c) => ctx.HH.storyOwnMenu(st, c);

  test('visitante, cliente u otra acompañante: null (sin menú)', () => {
    assert.equal(menu({ id: 'h1', workerId: 'A' }, { workerId: 'A', highlight: false }), null, 'sin sesión');
    S.yo = { id: 'B' };
    assert.equal(menu({ id: 'h1', workerId: 'A' }, { workerId: 'A', highlight: false }), null, 'otra acompañante');
    S.yo = { id: 'A' };
    assert.equal(menu({ id: 'h9', workerId: 'B' }, { workerId: 'A', highlight: false }), null, 'una historia que no es suya');
  });
  test('su historia: "Eliminar historia" → DELETE /cuenta/historias/:id, sale de lo que se ve y recarga', async () => {
    S.yo = { id: 'A' };
    const m = menu({ id: 'h1', workerId: 'A' }, { workerId: 'A', highlight: false });
    assert.equal(m.label, 'Eliminar historia');
    assert.equal(m.confirm, '¿Eliminar esta historia? No se puede deshacer.');
    assert.equal(m.okLabel, 'Eliminar'); assert.equal(m.done, 'Historia eliminada.');
    await m.run();
    assert.deepEqual(llamadas.splice(0), [['DELETE', '/cuenta/historias/h1'], ['recargar']]);
    assert.deepEqual(ctx.HH.db.stories.map((x) => x.id), ['h2']);
  });
  test('su destacada: "Quitar de la destacada" → DELETE /cuenta/destacadas/items/:id (la API del panel)', async () => {
    const m = menu({ id: 'i1', workerId: 'A' }, { workerId: 'A', highlight: true });
    assert.equal(m.label, 'Quitar de la destacada');
    await m.run();
    assert.deepEqual(llamadas.splice(0), [['DELETE', '/cuenta/destacadas/items/i1'], ['recargar']]);
    assert.deepEqual(ctx.HH.db.highlights[0].items.map((x) => x.id), ['i2']);
    assert.ok(src.includes("api('DELETE', '/cuenta/destacadas/items/' + encodeURIComponent(el.dataset.id))"), 'la misma ruta que usa el panel');
  });
  test('en la vista previa (solo para mirar, 17/11): null, sin "⋯"; en Mi perfil y el resto del sitio, sí', () => {
    S.yo = { id: 'A' };
    ctx.HH.esVistaPrevia = () => true;
    assert.equal(menu({ id: 'h2', workerId: 'A' }, { workerId: 'A', highlight: false }), null, 'su historia');
    assert.equal(menu({ id: 'i2', workerId: 'A' }, { workerId: 'A', highlight: true }), null, 'su destacada');
    ctx.HH.esVistaPrevia = () => false;
    assert.equal(menu({ id: 'h2', workerId: 'A' }, { workerId: 'A', highlight: false }).label, 'Eliminar historia');
    assert.equal(menu({ id: 'i2', workerId: 'A' }, { workerId: 'A', highlight: true }).label, 'Quitar de la destacada');
    delete ctx.HH.esVistaPrevia;
  });
  test('textos en inglés y portugués', () => {
    const ctx2 = { HH: {} }; vm.createContext(ctx2);
    const ini = src.indexOf("  Object.assign(HH.I18N = HH.I18N || {}, {\n    'Más opciones'");
    vm.runInContext(src.slice(ini, src.indexOf('});', ini) + 3), ctx2);
    for (const k of ['Más opciones', 'Eliminar historia', '¿Eliminar esta historia? No se puede deshacer.', 'Eliminar', 'Eliminando…', 'Historia eliminada.', 'Quitar de la destacada', '¿Quitar esto de la destacada? Se borra la foto o el video y no se puede deshacer.', 'Quitar', 'Quitado de la destacada.']) {
      const v = ctx2.HH.I18N[k]; assert.ok(v && v[0] && v[1], k);
    }
  });
});

/* ---------- Servidor: solo puede borrar lo suyo ---------- */
describe('servidor: borrar una historia o un elemento de destacada desde el visor', () => {
  const db = new pg.Pool({ connectionString: DATABASE_URL, max: 3 });
  let instance; let BASE; let tmpData; let ana; let bea;
  const driver = { origin: 'https://cdn.prueba.test', async put(k) { return 'https://cdn.prueba.test/' + k; }, async del() {} };
  const cookie = async (id) => {
    const t = crypto.randomBytes(24).toString('base64url');
    await db.query("INSERT INTO sesiones (token_hash, cuenta_id, expira) VALUES (sha256($1::bytea), $2, now() + interval '1 hour')", [Buffer.from(t), id]);
    return 'sr_sesion=' + t;
  };
  const borrar = (p, ck) => fetch(BASE + '/api/cuenta' + p, { method: 'DELETE', body: '{}', headers: { 'content-type': 'application/json', 'x-sr': '1', origin: BASE, ...(ck ? { cookie: ck } : {}) } });
  async function acompanante() {
    const { rows } = await db.query("INSERT INTO cuentas (email, pass_hash, email_verificado) VALUES ($1, 'x', now()) RETURNING id", [`zzhbp-${crypto.randomBytes(4).toString('hex')}@example.com`]);
    const id = rows[0].id;
    await db.query("INSERT INTO perfiles (cuenta_id, slug, datos, estado, verificacion) VALUES ($1, $2, '{\"displayName\":\"Prueba\"}', 'publicado', 'verificada')", [id, 'zzhbp-' + id.slice(0, 8)]);
    const h = await db.query("INSERT INTO historias (cuenta_id, url, url_mini, clave, clave_mini, estado, expira) VALUES ($1, 'https://cdn.prueba.test/h.webp', 'https://cdn.prueba.test/h-m.webp', 'h.webp', 'h-m.webp', 'listo', now() + interval '5 hours') RETURNING id", [id]);
    const d = await db.query("INSERT INTO destacadas (cuenta_id, titulo) VALUES ($1, 'Viajes') RETURNING id", [id]);
    const it = await db.query("INSERT INTO destacada_items (destacada_id, cuenta_id, tipo, estado, url, url_mini) VALUES ($1, $2, 'foto', 'listo', 'https://cdn.prueba.test/d.webp', 'https://cdn.prueba.test/d.webp') RETURNING id", [d.rows[0].id, id]);
    return { id, historia: h.rows[0].id, item: it.rows[0].id, ck: await cookie(id) };
  }
  const existe = async (tabla, id) => (await db.query(`SELECT 1 FROM ${tabla} WHERE id = $1`, [id])).rowCount === 1;
  before(async () => {
    tmpData = await fsp.mkdtemp(path.join(os.tmpdir(), 'sr-hbp-'));
    instance = await start({ prelanzamientoPorDefecto: false, port: 0, host: '127.0.0.1', databaseUrl: DATABASE_URL, storageDriver: driver, dataDir: tmpData,
      adminPath: '/panel-pruebas-hbp-0123456789', adminUser: 'adm-hbp', adminPassword: 'clave-de-prueba-larga-hbp', ipHashSalt: 'sal', siteUrl: 'https://sexyrose.test',
      telegramToken: '', telegramChatId: '', mailgunApiKey: '', tareaPlanes: false, tareaContenido: false, tareaCotizacion: false, log: () => {}, sendMail: async () => {} });
    BASE = `http://127.0.0.1:${instance.port}`;
    await instance.ready;
    ana = await acompanante(); bea = await acompanante();
  });
  after(async () => {
    await instance?.close();
    await db.query("DELETE FROM cuentas WHERE email LIKE 'zzhbp-%@example.com'");
    await db.end();
    await fsp.rm(tmpData, { recursive: true, force: true });
  });

  test('la historia de otra: 404 y sigue publicada; sin sesión: 401', async () => {
    let r = await borrar('/historias/' + bea.historia, ana.ck);
    assert.equal(r.status, 404); assert.equal((await r.json()).error, 'Historia no encontrada.');
    assert.ok(await existe('historias', bea.historia));
    r = await borrar('/historias/' + bea.historia, null);
    assert.equal(r.status, 401);
    assert.ok(await existe('historias', bea.historia));
  });
  test('el elemento de la destacada de otra: 404 y sigue', async () => {
    const r = await borrar('/destacadas/items/' + bea.item, ana.ck);
    assert.equal(r.status, 404);
    assert.ok(await existe('destacada_items', bea.item));
  });
  test('lo suyo: se borra (historia y elemento de destacada)', async () => {
    let r = await borrar('/historias/' + ana.historia, ana.ck);
    assert.equal(r.status, 200, await r.text());
    assert.equal(await existe('historias', ana.historia), false);
    r = await borrar('/destacadas/items/' + ana.item, ana.ck);
    assert.equal(r.status, 200);
    assert.equal(await existe('destacada_items', ana.item), false);
    const e = await fetch(BASE + '/api/sitio/estado').then((x) => x.json());
    assert.equal(e.historias.some((h) => h.id === ana.historia), false, 'ya no está en el sitio');
  });
});

/* ---------- Fotos y videos: que no se abran aparte ni se descarguen con un toque largo ---------- */
// Módulos del sitio (mvp/build.py con HH_TARGET=sitio; la demo es el mismo paquete) que dibujan fotos o videos
const SITIO = ['core.js', 'views-public.js', 'highlights.js', 'prod-sitio.js', 'prod-shorts.js', 'prod-contenido.js', 'prod-clientes.js', 'prod-mapa.js', 'prod-demo.js', 'prod-prelanzamiento.js'];
const VID = 'controlslist="nodownload noplaybackrate noremoteplayback" disablepictureinpicture disableremoteplayback';
const sinComentarios = (s) => s.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

describe('fotos y videos: protección en el sitio', () => {
  test('sitio.css: sin la hoja de iOS/Android, sin selección ni arrastre; los campos de texto quedan como siempre', () => {
    const css = leer('sitio.css');
    const sel = ['img', 'video', 'picture', '.media', '.avatar', '.story-media', '.story-view', '.pf-thumb', '.pf-tile', '.lb-stage', '.swipe-card', '.bn-av', '.hl-c', '.sh-item', '.pc2-media'];
    const regla = css.split('\n').find((l) => l.endsWith('{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}'));
    assert.ok(regla, 'regla de fotos y contenedores');
    const lista = regla.slice(0, regla.indexOf('{')).split(',');
    for (const s of sel) assert.ok(lista.includes('html[data-prod="sitio"] ' + s), s);
    assert.ok(css.includes('html[data-prod="sitio"] img,html[data-prod="sitio"] video{-webkit-user-drag:none}'));
    assert.ok(css.includes('html[data-prod="sitio"] a:has(img,video){-webkit-touch-callout:none}'), 'tarjetas (links con foto): sin la vista previa de iOS');
    assert.match(css, /html\[data-prod="sitio"\] input,html\[data-prod="sitio"\] textarea,html\[data-prod="sitio"\] select,html\[data-prod="sitio"\] \[contenteditable\]\{-webkit-touch-callout:default;-webkit-user-select:auto;user-select:auto\}/);
    // Mismos contenedores en el CSS y en el listener
    const js = leer('prod-sitio.js');
    const m = js.match(/const MEDIA_SEL = '([^']+)';/);
    assert.ok(m); assert.deepEqual(m[1].split(','), lista.map((s) => s.replace('html[data-prod="sitio"] ', '')));
    // El admin no carga sitio.css
    const build = fs.readFileSync(path.join(SRC, '..', 'build.py'), 'utf8');
    const admin = build.slice(build.indexOf("if TARGET == 'admin':\n    import re"), build.indexOf("if TARGET == 'sitio':\n    import re"));
    assert.ok(admin && !admin.includes('sitio.css'));
  });

  test('cada <img> de las plantillas del sitio lleva draggable="false" y cada <video> no se descarga', () => {
    for (const f of SITIO) {
      const s = sinComentarios(leer(f));
      const img = s.match(/<img\s(?!draggable="false")[^\n]{0,60}/g);
      assert.equal(img, null, f + ': ' + (img || []).join(' | '));
      const vid = s.match(new RegExp('<video\\s(?!' + VID + ')[^\\n]{0,60}', 'g'));
      assert.equal(vid, null, f + ': ' + (vid || []).join(' | '));
    }
  });

  test('ningún link apunta al archivo de una foto o un video (las fotos abren el visor con botones)', () => {
    for (const f of SITIO) {
      const s = sinComentarios(leer(f));
      assert.equal(s.match(/<a\b[^>]*\bhref="[^"]*\.(?:jpe?g|png|webp|gif|mp4|mov|webm)(?:[?#"])/gi), null, f);
      for (const m of s.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)) {
        if (!/<img|<video|HH\.(?:photo|avatar|storyMedia|videoMedia|contentThumb|storyRing)\(/.test(m[2])) continue;
        const href = (m[1].match(/\bhref="([^"]*)"/) || [])[1] || '';
        assert.doesNotMatch(href, /\b(?:src|poster|urlMini|url|photos?|fotos?|archivo|mini|grande)\b/i, `${f}: <a href="${href}"> envuelve una foto`);
      }
    }
  });

  test('lo que dibuja core.js: avatares, fotos, historias y videos', () => {
    const { HH } = cargarCore();
    const p = { userId: 'A', displayName: 'Ana', photos: ['https://cdn.example/a.jpg', 'https://cdn.example/b.jpg'], hue: 10 };
    const html = [HH.avatar(p, 40), HH.photo(p, 0), HH.photo(p, 1, { fit: true }), HH.contentThumb({ src: 'https://cdn.example/c.jpg', title: 'x', type: 'photo' }, { noLock: true }),
      HH.storyMedia({ src: 'https://cdn.example/h.jpg' }, p), HH.storyMedia({ video: true, src: 'https://cdn.example/h.mp4', poster: 'https://cdn.example/h.webp' }, p),
      HH.videoMedia({ src: 'https://cdn.example/v.mp4' }, { controls: true })].join('\n');
    const imgs = html.match(/<img\b[^>]*>/g); const vids = html.match(/<video\b[^>]*>/g);
    assert.equal(imgs.length, 7);
    for (const t of imgs) { assert.match(t, /\bdraggable="false"/, t); assert.match(t, /\balt="/, 'el alt queda: ' + t); }
    assert.equal(vids.length, 2);
    for (const t of vids) for (const a of ['controlslist="nodownload noplaybackrate noremoteplayback"', 'disablepictureinpicture', 'disableremoteplayback']) assert.ok(t.includes(a), a + ': ' + t);
  });

  test('prod-sitio.js: un listener en captura para el menú contextual y el arrastre, y lo que se dibuje después también', () => {
    const js = leer('prod-sitio.js');
    assert.match(js, /document\.addEventListener\('contextmenu', protegerMedia, true\);\s*document\.addEventListener\('dragstart', protegerMedia, true\);/);
    assert.match(js, /const esCampo = \(t\) => !!\(t\.closest\('input,textarea,select,\[contenteditable=""\],\[contenteditable="true"\]'\)\);/);
    assert.match(js, /if \(!t \|\| !t\.closest \|\| esCampo\(t\)\) return false;/, 'los campos de texto no se tocan');
    assert.doesNotMatch(js, /addEventListener\('(?:touchstart|pointerdown|selectstart)', protegerMedia/, 'tocar y deslizar siguen igual');
    assert.match(js, /new MutationObserver\(\(muts\) => \{\s*muts\.forEach\(\(m\) => m\.addedNodes\.forEach/);
    // blindarMedia sobre un DOM de mentira
    const ini = js.indexOf('  const VIDEO_ATR = '); const fin = js.indexOf('  HH.blindarMedia = blindarMedia;');
    const ctx = {}; vm.createContext(ctx); vm.runInContext(js.slice(ini, fin) + '\nthis.blindarMedia = blindarMedia;', ctx);
    const nodo = (tag) => { const at = {}; return { nodeType: 1, tagName: tag, at, getAttribute: (k) => (k in at ? at[k] : null), setAttribute: (k, v) => { at[k] = v; } }; };
    const im = nodo('IMG'); const v = nodo('VIDEO');
    const raiz = { nodeType: 1, tagName: 'DIV', querySelectorAll: (q) => (q.startsWith('img') ? [im] : q === 'video' ? [v] : []) };
    ctx.blindarMedia(raiz);
    assert.equal(im.at.draggable, 'false');
    assert.deepEqual(v.at, { controlslist: 'nodownload noplaybackrate noremoteplayback', disablepictureinpicture: '', disableremoteplayback: '' });
  });

  test('paquete armado (si existe): el CSS y el listener viajan al sitio y a la demo', (t) => {
    const dirs = [path.join(HERE, '..', 'sitio-spa', 'assets'), path.join(HERE, '..', 'public', 'demo', 'assets')].filter((d) => fs.existsSync(d));
    if (!dirs.length) { t.skip('sin build'); return; }
    for (const d of dirs) {
      const files = fs.readdirSync(d);
      const css = files.filter((f) => /^app\..*\.css$/.test(f)).map((f) => fs.readFileSync(path.join(d, f), 'utf8')).join('\n');
      const js = files.filter((f) => /^app\..*\.js$/.test(f)).map((f) => fs.readFileSync(path.join(d, f), 'utf8')).join('\n');
      if (!css || !js) continue;
      assert.ok(css.includes('-webkit-touch-callout:none;-webkit-user-select:none;user-select:none'), d);
      assert.ok(js.includes('"contextmenu"') || js.includes("'contextmenu'"), d);
      assert.ok(js.includes('nodownload noplaybackrate noremoteplayback'), d);
      assert.equal(js.match(/<a [^>]*href="[^"]*\.(?:jpe?g|png|webp|mp4)"/gi), null, d);
    }
  });
});
