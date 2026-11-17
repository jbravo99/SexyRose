// Historias en el perfil, como Instagram (17/11/2026, pedido de Juan). Bug: "cuando toco ver la historia de mi perfil
// me muestra las imágenes de LA GALERÍA". Causa: el avatar del perfil tenía siempre un anillo gris (igual al de una
// historia ya vista y al de las destacadas) y, sin historias activas, abría la galería (pubLightbox) en la foto 1.
// Ahora: el anillo solo con historias activas (24 h) y abre solo esas; sin historias, ni anillo ni visor (nunca la
// galería). Además: "+" para subir una historia en su propio perfil (y en la vista previa) y "Tu historia" primero en
// la fila de historias del inicio, solo para acompañantes con sesión.
//   DATABASE_URL=postgres://... node --test test/historias-perfil.test.js
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import sharp from 'sharp';
import { start } from '../server.js';
import { invalidarCatalogos } from '../lib/catalogos.js';
import { invalidarSitio } from '../routes/sitio.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MVP = path.join(HERE, '..', '..', 'mvp');
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('Falta DATABASE_URL.'); process.exit(1); }

/* ---------- Front: views-public.js dibujado en una caja (sin navegador) ---------- */
// Un HH mínimo: lo que la vista necesita para el perfil y el inicio; el resto responde [] (vacío en listas y en texto).
function cargarVistas() {
  const routes = {};
  const P = { userId: 'A', slug: 'ana', displayName: 'Ana', photos: ['https://cdn.example/galeria-0.jpg', 'https://cdn.example/galeria-1.jpg'], city: 'X', verified: 'verified', status: 'active', createdAt: '2026-11-01T00:00:00Z' };
  const st = { stories: [], own: null, me: null, order: [] };
  const base = {
    esc: (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`),
    icon: (n) => `<svg data-i="${n}"></svg>`,
    photo: (p, i) => `<div class="media"><img src="${p.photos[i]}"></div>`,
    route: (k, fn) => { routes[k] = fn; },
    storiesOf: (id) => st.stories.filter((x) => x.workerId === id),
    storyOrder: () => st.order,
    storyRing: (p) => `<button class="story-ring" data-action="openStories" data-id="${p.userId}"></button>`,
    seenStories: () => ({}),
    me: () => st.me, profileBySlug: (s) => (s === P.slug ? P : null), publishedProfiles: () => [P],
    t: (x) => x, plural: (n, a, b) => (n === 1 ? a : b || a + 's'), ui: {}, actions: {},
    db: new Proxy({}, { get: (t, k) => (k in t ? t[k] : []) }),
  };
  Object.defineProperty(base, 'storyUploadOn', { get: () => st.own, enumerable: true, configurable: true });
  const HH = new Proxy(base, { get: (t, k) => (k in t ? t[k] : () => []), set: (t, k, v) => { t[k] = v; return true; } });
  const noop = () => {};
  const ctx = { HH, document: { getElementById: () => ({}), head: { appendChild: noop }, createElement: () => ({}), addEventListener: noop }, window: { addEventListener: noop }, location: { href: '' }, console };
  vm.createContext(ctx);
  return { ctx, routes, P, st };
}
const avatar = (html) => (html.match(/<div class="pf-av">[\s\S]*?<\/div>\s*<div class="pf-head">/) || [''])[0];

describe('perfil: el avatar solo abre historias reales (nunca la galería)', () => {
  const src = fsSync.readFileSync(path.join(MVP, 'src', 'views-public.js'), 'utf8');
  const { ctx, routes, P, st } = cargarVistas();
  vm.runInContext(src, ctx);
  const perfil = () => ctx.HH.profileView(P.slug);

  test('sin historias activas (con o sin destacadas): sin anillo, sin visor y sin galería', () => {
    st.stories = []; st.own = null; st.me = null;
    const a = avatar(perfil());
    assert.ok(a, 'cabecera del perfil');
    assert.match(a, /<div class="pf-thumb no-st">/, 'el avatar no es un botón para un visitante');
    assert.doesNotMatch(a, /pubLightbox|openStories|has-st|pf-add/);
  });

  test('con una historia activa: anillo que abre sus historias (openStories), no la galería', () => {
    st.stories = [{ id: 'h1', workerId: 'A', src: 'https://cdn.example/historia.jpg' }];
    const a = avatar(perfil());
    assert.match(a, /<button type="button" class="pf-thumb has-st" data-action="openStories" data-id="A"/);
    assert.doesNotMatch(a, /pubLightbox/);
    assert.doesNotMatch(a, /pf-add/, 'sin "+" para un visitante');
    // Las historias de otra acompañante no le ponen anillo
    st.stories = [{ id: 'h2', workerId: 'B', src: 'https://cdn.example/otra.jpg' }];
    assert.match(avatar(perfil()), /pf-thumb no-st/);
  });

  test('su propio perfil: "+" abajo a la derecha; sin historias el avatar también sube una', () => {
    st.own = (p) => !p || p.userId === 'A';
    st.stories = [];
    let a = avatar(perfil());
    assert.match(a, /<button type="button" class="pf-add" data-action="spStoryAdd"/);
    assert.match(a, /<button type="button" class="pf-thumb no-st" data-action="spStoryAdd"/);
    st.stories = [{ id: 'h1', workerId: 'A', src: 'https://cdn.example/historia.jpg' }];
    a = avatar(perfil());
    assert.match(a, /class="pf-thumb has-st" data-action="openStories"/, 'tocar el avatar sigue abriendo sus historias');
    assert.match(a, /class="pf-add" data-action="spStoryAdd"/);
    // Perfil de otra: nunca el "+"
    st.own = (p) => !p || p.userId === 'OTRA';
    assert.doesNotMatch(avatar(perfil()), /pf-add|spStoryAdd/);
  });

  test('inicio: "Tu historia" primero solo para acompañantes con sesión, aunque no haya otras historias', () => {
    st.order = []; st.own = null;
    assert.doesNotMatch(routes.inicio(), /stories-row/, 'visitante sin historias: sin fila');
    st.own = () => true;
    let h = routes.inicio();
    assert.match(h, /<div class="stories-row" aria-label="Historias"><div class="st st-add"><button type="button" class="story-add" data-action="spStoryAdd"[^>]*>[\s\S]*?<span class="n">Tu historia<\/span><\/div><\/div>/, 'solo "Tu historia"');
    st.order = [{ ...P, userId: 'B', slug: 'bea', displayName: 'Bea' }];
    h = routes.inicio();
    assert.ok(h.indexOf('story-add') < h.indexOf('data-id="B"'), '"Tu historia" va antes que las demás');
    st.own = () => false; // cliente o visitante
    h = routes.inicio();
    assert.doesNotMatch(h, /story-add|Tu historia/);
    assert.match(h, /data-id="B"/);
  });
});

describe('subida desde el perfil y el inicio: misma API, límites y mensajes que el panel', () => {
  test('prod-sitio.js: misma ruta, mismo texto del cupo que el servidor, recarga sus datos y se queda en la página', async () => {
    const sitio = await fs.readFile(path.join(MVP, 'src', 'prod-sitio.js'), 'utf8');
    const cuenta = await fs.readFile(path.join(HERE, '..', 'routes', 'cuenta.js'), 'utf8');
    const msg = 'Tu plan permite ${max} ${max === 1 ? \'historia\' : \'historias\'} por día. Subí de plan para publicar más.';
    assert.ok(cuenta.includes(msg), 'el servidor');
    assert.ok(sitio.includes('const histLimiteMsg = (max) => `' + msg + '`'), 'el sitio usa el mismo texto');
    assert.match(sitio, /upload\(video \? '\/cuenta\/historias\/video' : '\/cuenta\/historias', fd/);
    assert.match(sitio, /HH\.storyUploadOn = \(p\) => !!\(S\.yo && S\.yo\.id && S\.yo\.perfil && \(!p \|\| p\.userId === S\.yo\.id\)\)/, 'solo la acompañante con sesión, y en su perfil');
    assert.match(sitio, /maxlength="120"/);
    assert.match(sitio, /await loadYo\(true, true\);\s*if \(esVP\(HH\.currentHash\(\)\)\) \{ await loadVP\(\); return; \}\s*await loadEstado\(\);/);
    const err = await fs.readFile(path.join(MVP, 'src', 'prod-sitio-errores.js'), 'utf8');
    const ctx = { HH: {} }; vm.runInNewContext(err, ctx);
    for (const k of ['Tu plan permite {n} historia por día. Subí de plan para publicar más.', 'Tu plan permite {n} historias por día. Subí de plan para publicar más.']) {
      assert.ok(ctx.HH.I18N[k] && ctx.HH.I18N[k][0] && ctx.HH.I18N[k][1], 'inglés y portugués: ' + k);
    }
  });
});

/* ---------- Datos: historias, destacadas y galería no se mezclan (sitio y vista previa) ---------- */
describe('historias, destacadas y galería en el estado del sitio y en la vista previa', () => {
  const db = new pg.Pool({ connectionString: DATABASE_URL, max: 4 });
  const A = '/panel-pruebas-historias-perfil-01';
  const USER = 'admin-hp'; const PASS = 'clave-de-prueba-larga-hp-1';
  const AUTH = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
  let instance; let BASE; let tmpData;
  const sesiones = new Map();
  const ip = () => '2001:db8::' + crypto.randomBytes(2).toString('hex');
  async function cookieDe(id) {
    if (!sesiones.has(id)) {
      const t = crypto.randomBytes(24).toString('base64url');
      await db.query("INSERT INTO sesiones (token_hash, cuenta_id, expira) VALUES (sha256($1::bytea), $2, now() + interval '1 hour')", [Buffer.from(t), id]);
      sesiones.set(id, 'sr_sesion=' + t);
    }
    return sesiones.get(id);
  }
  const get = async (p, quien) => fetch(BASE + p, { headers: { ...(quien ? { cookie: await cookieDe(quien.id) } : {}) } }).then((r) => r.json());
  const ponerPre = async (activo) => {
    const r = await fetch(BASE + A + '/api/ajustes/prelanzamiento', { method: 'PUT', body: JSON.stringify({ valor: { activo } }), headers: { authorization: AUTH, 'content-type': 'application/json', 'x-sr-admin': '1', origin: BASE } });
    assert.equal(r.status, 200);
  };
  const historiaFoto = async (quien, texto) => {
    const fd = new FormData();
    const jpg = await sharp({ create: { width: 400, height: 700, channels: 3, background: { r: 30, g: 90, b: 200 } } }).jpeg().toBuffer();
    fd.append('foto', new Blob([jpg], { type: 'image/jpeg' }), 'h.jpg'); fd.append('texto', texto || '');
    const r = await fetch(BASE + '/api/cuenta/historias', { method: 'POST', body: fd, headers: { origin: BASE, 'x-sr': '1', 'cf-connecting-ip': ip(), cookie: await cookieDe(quien.id) } });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const fotoUrl = (id, i) => `https://cdn.example/zzhp/${id}/galeria-${i}.jpg`;
  async function acompanante(nombre, { historia = false, destacada = false, estado = 'publicado' } = {}) {
    const email = `zzhp-${crypto.randomBytes(4).toString('hex')}@example.com`;
    const { rows } = await db.query("INSERT INTO cuentas (email, pass_hash, email_verificado) VALUES ($1, 'x', now()) RETURNING id", [email]);
    const id = rows[0].id; const slug = `zzhp-${nombre.toLowerCase()}-${id.slice(0, 6)}`;
    const datos = { displayName: nombre, genero: 'mujer', fechaNacimiento: '1996-05-01', pais: 'argentina', provincia: 'provincia-de-buenos-aires', ciudad: 'san-isidro', whatsapp: '+5491122223333' };
    await db.query('INSERT INTO perfiles (cuenta_id, slug, datos, estado, verificacion, publicado_en) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, slug, JSON.stringify(datos), estado, estado === 'publicado' ? 'verificada' : 'sin_enviar', estado === 'publicado' ? new Date() : null]);
    for (let i = 0; i < 5; i++) await db.query('INSERT INTO fotos (cuenta_id, orden, clave, url, url_mini, ancho, alto) VALUES ($1, $2, $3, $4, $4, 800, 1000)', [id, i, `zzhp/${id}/${i}.jpg`, fotoUrl(id, i)]);
    if (historia) await db.query("INSERT INTO historias (cuenta_id, url, url_mini, estado, expira) VALUES ($1, $2, $2, 'listo', now() + interval '10 hours')", [id, `https://cdn.example/zzhp/${id}/historia.jpg`]);
    // Una vencida: nunca aparece
    await db.query("INSERT INTO historias (cuenta_id, url, url_mini, estado, creado, expira) VALUES ($1, $2, $2, 'listo', now() - interval '25 hours', now() - interval '1 hour')", [id, `https://cdn.example/zzhp/${id}/vencida.jpg`]);
    if (destacada) {
      const { rows: d } = await db.query("INSERT INTO destacadas (cuenta_id, titulo) VALUES ($1, 'Viajes') RETURNING id", [id]);
      await db.query("INSERT INTO destacada_items (destacada_id, cuenta_id, tipo, estado, url, url_mini) VALUES ($1, $2, 'foto', 'listo', $3, $3)", [d[0].id, id, `https://cdn.example/zzhp/${id}/destacada.jpg`]);
    }
    return { id, slug };
  }
  let conHist; let soloDest; let nada; let borrador;
  before(async () => {
    tmpData = await fs.mkdtemp(path.join(os.tmpdir(), 'srhp-data-'));
    instance = await start({
      prelanzamientoPorDefecto: false, storage: 'local',
      port: 0, host: '127.0.0.1', databaseUrl: DATABASE_URL, adminPath: A, adminUser: USER, adminPassword: PASS,
      ipHashSalt: 'sal', siteUrl: 'https://sexyrose.test', dataDir: tmpData, log: () => {}, tareaPlanes: false, sendMail: async () => {},
    });
    BASE = `http://127.0.0.1:${instance.port}`;
    await instance.ready;
    await db.query("DELETE FROM cuentas WHERE email LIKE 'zzhp-%'");
    await db.query("DELETE FROM ajustes WHERE clave = 'prelanzamiento'"); invalidarCatalogos(); invalidarSitio();
    conHist = await acompanante('Hanna', { historia: true, destacada: true });
    soloDest = await acompanante('Dana', { destacada: true });
    nada = await acompanante('Nora');
    borrador = await acompanante('Bruna', { estado: 'borrador' });
    invalidarSitio();
  });
  after(async () => {
    await instance?.close();
    await db.query("DELETE FROM ajustes WHERE clave = 'prelanzamiento'");
    await db.query("DELETE FROM cuentas WHERE email LIKE 'zzhp-%'");
    await db.end();
    await fs.rm(tmpData, { recursive: true, force: true });
  });

  const urlsGaleria = (id) => [0, 1, 2, 3, 4].map((i) => fotoUrl(id, i));
  const sinGaleria = (urls, id) => { for (const u of urls) assert.ok(!urlsGaleria(id).includes(u), 'una foto de la galería no es una historia: ' + u); };

  test('sitio público: cada una con sus historias activas (sin fotos de la galería) y sus destacadas con sus propios elementos', async () => {
    const e = await get('/api/sitio/estado');
    const de = (id) => e.historias.filter((h) => h.cuentaId === id).map((h) => h.url);
    assert.deepEqual(de(conHist.id), [`https://cdn.example/zzhp/${conHist.id}/historia.jpg`]);
    assert.deepEqual(de(soloDest.id), [], 'solo destacada: ninguna historia');
    assert.deepEqual(de(nada.id), [], 'nada: ninguna historia');
    for (const c of [conHist, soloDest, nada]) {
      sinGaleria(de(c.id), c.id);
      const p = e.perfiles.find((x) => x.cuentaId === c.id);
      assert.ok(p, 'publicada');
      const items = (p.destacadas || []).flatMap((d) => d.items.map((i) => i.url));
      sinGaleria(items, c.id);
      assert.deepEqual(items, c === nada ? [] : [`https://cdn.example/zzhp/${c.id}/destacada.jpg`]);
    }
  });

  test('vista previa (home provisoria prendida): lo mismo, solo lo suyo', async () => {
    await ponerPre(true);
    try {
      for (const c of [conHist, soloDest, nada, borrador]) {
        const v = await get('/api/cuenta/vista-previa', c);
        assert.equal(v.ok, true);
        const hs = v.historias.map((h) => h.url);
        assert.deepEqual(hs, c === conHist ? [`https://cdn.example/zzhp/${c.id}/historia.jpg`] : []);
        assert.ok(v.historias.every((h) => h.cuentaId === c.id));
        sinGaleria(hs, c.id);
        sinGaleria((v.perfil.destacadas || []).flatMap((d) => d.items.map((i) => i.url)), c.id);
      }
    } finally { await ponerPre(false); }
  });

  test('subir desde el perfil o el inicio (misma API): aparece como historia, no toca la galería; el cupo responde el mismo mensaje', async () => {
    const r = await historiaFoto(nada, 'Hola desde el perfil');
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const e = await get('/api/sitio/estado');
    const hs = e.historias.filter((h) => h.cuentaId === nada.id);
    assert.equal(hs.length, 1); assert.equal(hs[0].texto, 'Hola desde el perfil');
    sinGaleria(hs.map((h) => h.url), nada.id);
    assert.deepEqual(e.perfiles.find((x) => x.cuentaId === nada.id).fotos.map((f) => f.url), urlsGaleria(nada.id), 'la galería sigue igual');
    // Bronce: 1 por día
    const r2 = await historiaFoto(nada);
    assert.equal(r2.status, 400);
    assert.equal(r2.body.error, 'Tu plan permite 1 historia por día. Subí de plan para publicar más.');
    // Sin publicar: se sube igual (se ve en el sitio cuando esté publicado, como dice el panel) y la vista previa la muestra
    const r3 = await historiaFoto(borrador);
    assert.equal(r3.status, 201, JSON.stringify(r3.body));
    assert.equal((await get('/api/sitio/estado')).historias.some((h) => h.cuentaId === borrador.id), false);
    assert.equal((await get('/api/cuenta/vista-previa', borrador)).historias.length, 1);
  });
});
