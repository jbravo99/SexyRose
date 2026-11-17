// "Nueva" destacada desde Mi perfil (17/11/2026, pedido de Juan: "En el perfil necesito que esté para agregar historia
// destacada, como en Instagram, al ir al perfil de uno mismo como acompañante… decir algo como 'new'").
// Front (prod-sitio.js + highlights.js + views-public.js): el círculo "Nueva" (igual a "Tu historia" del inicio) va
// primero en la fila de destacadas SOLO en Mi perfil (opts.own); la hoja «Nueva destacada» crea la destacada y sube los
// archivos con la misma API que el panel; con el cupo lleno, el aviso del panel; la portada se elige antes de crear
// (17/11/2026). Servidor: el flujo crear + elementos + portada.
//   DATABASE_URL=postgres://... node --test test/destacada-nueva.test.js
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
import { invalidarSitio } from '../routes/sitio.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..', '..', 'mvp', 'src');
const leer = (f) => fsSync.readFileSync(path.join(SRC, f), 'utf8');
const sitio = leer('prod-sitio.js');
// Un trozo de prod-sitio.js, desde `desde` hasta `hasta` (incluido)
const trozo = (desde, hasta) => { const i = sitio.indexOf(desde); assert.ok(i >= 0, desde); const j = sitio.indexOf(hasta, i); assert.ok(j > i, hasta); return sitio.slice(i, j + hasta.length); };

/* ---------- Dibujo: views-public.js + highlights.js + lo del sitio (prod-sitio.js), en una caja sin navegador ---------- */
function cargarPerfil() {
  const P = { userId: 'A', slug: 'ana', displayName: 'Ana', photos: ['https://cdn.example/a.jpg'], city: 'X', verified: 'verified', status: 'active', createdAt: '2026-11-01T00:00:00Z' };
  const st = { own: null, highlights: [] };
  const base = {
    esc: (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`),
    icon: (n) => `<svg data-i="${n}"></svg>`,
    photo: (p, i) => `<div class="media"><img src="${p.photos[i]}"></div>`,
    route: () => {}, storiesOf: () => [], storyOrder: () => [], seenStories: () => ({}),
    storyMedia: (c) => `<img src="${c.src || ''}">`,
    me: () => null, profileBySlug: (s) => (s === P.slug ? P : null), publishedProfiles: () => [P],
    t: (x) => x, plural: (n, a, b) => (n === 1 ? a : b || a + 's'), ui: {}, actions: {},
    db: new Proxy({}, { get: (t, k) => (k === 'highlights' ? st.highlights : k in t ? t[k] : []) }),
    // Como prod-sitio.js: acompañante con sesión y (con p) es su perfil
    storyUploadOn: (p) => !!(st.own && (!p || p.userId === st.own)),
  };
  const HH = new Proxy(base, { get: (t, k) => (k in t ? t[k] : () => []), set: (t, k, v) => { t[k] = v; return true; } });
  const noop = () => {};
  const ctx = { HH, document: { getElementById: () => ({}), head: { appendChild: noop }, createElement: () => ({}), addEventListener: noop }, window: { addEventListener: noop }, location: { href: '' }, console };
  vm.createContext(ctx);
  vm.runInContext(leer('views-public.js'), ctx);
  vm.runInContext(leer('highlights.js'), ctx);
  // Lo de prod-sitio.js: el reemplazo de la fila (sitio) y el círculo "Nueva"
  const fila = trozo('  const hlRow0 = HH.highlightsRow;', "HH.highlightNewHtml(p) : '' }) : '');");
  const nueva = trozo('  HH.highlightNewHtml = (p) => (', "    : '');");
  vm.runInContext(`(function () { const icon = HH.icon;\n${fila}\n${nueva}\n})();`, ctx);
  return { ctx, P, st };
}
const fila = (html) => (html.match(/<section class="hl-row"[\s\S]*?<\/section>/) || [''])[0];
const NUEVA = /<div class="hl-it hl-add"><button type="button" class="story-add" data-action="spHlNew" aria-label="Nueva destacada"><svg data-i="plus"><\/svg><\/button><span class="hl-n">Nueva<\/span><\/div>/;

describe('Mi perfil: el círculo "Nueva" de las destacadas (solo en su propio perfil, en Mi perfil)', () => {
  const { ctx, P, st } = cargarPerfil();
  const view = (opts) => ctx.HH.profileView(P.slug, opts);
  const conDestacada = () => { st.highlights = [{ id: 'h1', workerId: 'A', title: 'Viajes', items: [{ id: 'i1', src: 'https://cdn.example/d.jpg' }] }]; };

  test('Mi perfil (own) sin destacadas: la fila aparece solo con "Nueva", igual a "Tu historia" del inicio', () => {
    st.own = 'A'; st.highlights = [];
    const f = fila(view({ own: true, acciones: '' }));
    assert.ok(f, 'hay fila aunque no tenga destacadas');
    assert.match(f, NUEVA);
    assert.equal((f.match(/class="hl-it/g) || []).length, 1, 'solo "Nueva"');
  });

  test('Mi perfil (own) con destacadas: "Nueva" primero, después las suyas', () => {
    st.own = 'A'; conDestacada();
    const f = fila(view({ own: true, acciones: '' }));
    assert.match(f, NUEVA);
    assert.ok(f.indexOf('spHlNew') < f.indexOf('data-action="hlOpen" data-id="h1"'), '"Nueva" va antes');
  });

  test('nunca fuera de Mi perfil: vista previa, su perfil público, visitantes, clientes y perfiles ajenos', () => {
    conDestacada();
    // Vista previa (solo para mirar)
    st.own = 'A';
    assert.doesNotMatch(view({ preview: true }), /spHlNew|hl-add|>Nueva</);
    // Su perfil público (sin own) con sesión
    assert.doesNotMatch(view(), /spHlNew|hl-add/);
    // Visitante o cliente (sin sesión de acompañante)
    st.own = null;
    assert.doesNotMatch(view(), /spHlNew|hl-add/);
    assert.doesNotMatch(view({ own: true, acciones: '' }), /spHlNew|hl-add/, 'own sin su sesión: nada');
    // Otra acompañante con sesión mirando este perfil
    st.own = 'B';
    assert.doesNotMatch(view(), /spHlNew|hl-add/);
    assert.doesNotMatch(view({ own: true, acciones: '' }), /spHlNew|hl-add/);
    // Sin destacadas y fuera de Mi perfil: sin fila
    st.highlights = []; st.own = 'A';
    assert.equal(fila(view()), '');
    assert.equal(fila(view({ preview: true })), '');
  });

  test('textos en inglés y portugués (Nueva → New / Nova) y estilo reusado de "Tu historia"', () => {
    const ini = sitio.indexOf("  Object.assign(HH.I18N = HH.I18N || {}, {\n    'Nueva': ");
    assert.ok(ini > 0);
    const c = { HH: {} }; vm.createContext(c);
    vm.runInContext(sitio.slice(ini, sitio.indexOf('});', ini) + 3), c);
    assert.deepEqual([...c.HH.I18N.Nueva], ['New', 'Nova']);
    for (const k of ['Nueva destacada', 'Elegí fotos o videos', 'Elegí fotos', 'Subiendo…', 'Subiendo tu destacada…', 'Destacada creada. Los videos se suman apenas terminen de procesarse.', 'Se subieron {n} de {n}.', 'Una destacada puede tener hasta {n} fotos y videos.']) {
      const v = c.HH.I18N[k]; assert.ok(v && v[0] && v[1], k);
      assert.equal((k.match(/\{n\}/g) || []).length, (v[0].match(/\{n\}/g) || []).length, k);
      assert.equal((k.match(/\{n\}/g) || []).length, (v[1].match(/\{n\}/g) || []).length, k);
    }
    // El mismo círculo del inicio (.story-add de app.css), del tamaño de las destacadas en la computadora
    assert.match(leer('app.css'), /\.story-add \{ width: 72px; height: 72px; border-radius: 50%;/);
    assert.ok(sitio.includes('@media(min-width:720px){.hl-add .story-add{width:80px;height:80px}}'));
  });
});

/* ---------- Hoja «Nueva destacada»: cupo, misma API que el panel, fallas parciales (prod-sitio.js en una caja) ---------- */
function cargarHoja({ lim = 1, usadas = 0, videos = false } = {}) {
  const els = new Map();
  const el = (id) => {
    if (!els.has(id)) els.set(id, { id, value: '', disabled: false, hidden: true, innerHTML: '', isConnected: true, style: {}, focus() {}, querySelectorAll: () => [], addEventListener() {} });
    return els.get(id);
  };
  const calls = []; const toasts = []; const modales = [];
  const fallar = new Set(); // nombres de archivo cuya subida falla
  const state = { modalAbierto: false };
  const document = {
    getElementById: (id) => (state.modalAbierto && /^srDn/.test(id) ? el(id) : null),
    querySelector: (sel) => (state.modalAbierto && sel === '#srDnProg i' ? el('srDnProgBar') : null),
    querySelectorAll: () => [], createElement: () => ({ addEventListener() {}, click() {}, remove() {} }), body: { appendChild() {} },
  };
  const S = { yo: { id: 'A', perfil: { slug: 'ana' }, videosHabilitados: videos, limites: { destacadas: lim }, destacadas: Array.from({ length: usadas }, (_, i) => ({ id: 'd' + i })) } };
  const HH = {
    I18N: {}, actions: {}, t: (x) => x, esc: (s) => String(s), hueGradient: () => '#000',
    storyUploadOn: () => true,
    toast: (m, o) => toasts.push([m, (o && o.type) || '']),
    modal: (m) => { modales.push(m); state.modalAbierto = true; },
    closeModal: () => { state.modalAbierto = false; },
  };
  const api = async (method, p, body) => {
    calls.push([method, p, body]);
    if (method === 'POST' && p === '/cuenta/destacadas') return { ok: true, destacada: { id: 'D1', titulo: body.titulo } };
    return { ok: true };
  };
  const upload = async (p, fd, onProgress) => {
    const f = fd.get('foto') || fd.get('video');
    calls.push(['UPLOAD', p, fd.has('video') ? 'video' : 'foto', f.name]);
    if (onProgress) onProgress(0.5);
    if (fallar.has(f.name)) { const e = new Error('El archivo no es una imagen válida.'); e.status = 400; throw e; }
    // Cada subida devuelve el id del elemento (it-<nombre>); la portada aparte, la portada
    return /\/portada$/.test(p) ? { ok: true, portada: { tipo: 'subida', url: 'u' } } : { ok: true, item: { id: 'it-' + f.name } };
  };
  const ctx = { HH, S, document, api, upload, FormData, URL: { createObjectURL: () => '', revokeObjectURL() {} }, console };
  vm.createContext(ctx);
  const hlTit = trozo('  const HL_TITULO_MAX = 16;', '16;');
  const bloque = trozo('  const HL_MAX_ITEMS = 100;', "    spHlPortadaAuto: () => dnPortadaAuto(),\n  });");
  vm.runInContext(`const esc = HH.esc, icon = () => '';
    const hash = () => 1; const HIST_FOTOS = 'image/jpeg'; const HIST_VIDEOS = ',video/mp4';
    const fieldErr = (id) => '<div id="' + id + '"></div>';
    function showErr(id, msg) { const e = document.getElementById(id); if (e) e.innerHTML = msg ? '<span>' + msg + '</span>' : ''; }
    async function duracionVideo() { return 10; }
    let recargas = 0; async function recargarPropias() { recargas++; }
    ${hlTit}\n${bloque}
    this.T = { DN, dnSumar, dnCrear, hlLleno, recargas: () => recargas };`, ctx);
  const archivo = (name, type = 'image/jpeg') => new File([Buffer.from('x')], name, { type });
  // Los objetos se arman dentro de la caja (otro "realm"): se comparan como JSON
  const plano = (x) => JSON.parse(JSON.stringify(x));
  return { ctx, HH, S, calls, plano, toasts, modales, el, fallar, state, archivo, recargas: () => ctx.T.recargas() };
}

describe('hoja «Nueva destacada»', () => {
  test('cupo lleno: el aviso del panel (toast) y no se abre la hoja ni el selector', () => {
    const h = cargarHoja({ lim: 1, usadas: 1 });
    h.HH.actions.spHlNew();
    assert.equal(h.modales.length, 0);
    assert.deepEqual(h.toasts, [['Llegaste al límite de destacadas de tu plan.', 'warn']]);
    // Es el mismo texto del panel (Historias → Destacadas)
    assert.ok(sitio.includes('<span>Llegaste al límite de destacadas de tu plan.</span>'));
    // Con lugar o ilimitadas (Star: null), se abre
    const h2 = cargarHoja({ lim: 2, usadas: 1 }); h2.HH.actions.spHlNew();
    assert.equal(h2.modales.length, 1); assert.equal(h2.modales[0].title, 'Nueva destacada');
    const h3 = cargarHoja({ lim: null, usadas: 40 }); h3.HH.actions.spHlNew();
    assert.equal(h3.modales.length, 1);
    assert.match(h3.modales[0].body, /maxlength="16"/, 'mismo límite de nombre que el panel');
    assert.match(h3.modales[0].body, /Elegí fotos</, 'sin videos habilitados: solo fotos');
    const h4 = cargarHoja({ videos: true }); h4.HH.actions.spHlNew();
    assert.match(h4.modales[0].body, /Elegí fotos o videos/, 'con videos habilitados');
  });

  test('crear: POST /cuenta/destacadas y después cada archivo a /fotos o /videos (la misma API que el panel)', async () => {
    const h = cargarHoja({ lim: 2, videos: true });
    h.HH.actions.spHlNew();
    h.el('srDnTit').value = '  Mis   viajes ';
    await h.ctx.T.dnSumar([h.archivo('a.jpg'), h.archivo('b.mp4', 'video/mp4')]);
    await h.ctx.T.dnCrear();
    assert.deepEqual(h.plano(h.calls), [
      ['POST', '/cuenta/destacadas', { titulo: 'Mis viajes' }],
      ['UPLOAD', '/cuenta/destacadas/D1/fotos', 'foto', 'a.jpg'],
      ['UPLOAD', '/cuenta/destacadas/D1/videos', 'video', 'b.mp4'],
    ]);
    assert.equal(h.state.modalAbierto, false, 'se cierra la hoja');
    assert.deepEqual(h.toasts.at(-1), ['Destacada creada. Los videos se suman apenas terminen de procesarse.', 'ok']);
    assert.equal(h.recargas(), 1, 'se vuelven a pedir sus datos y Mi perfil');
    assert.equal(h.ctx.T.DN.files.length, 0);
  });

  test('validaciones antes de llamar al servidor: nombre y al menos un archivo; video solo si están habilitados', async () => {
    const h = cargarHoja({ lim: 2 });
    h.HH.actions.spHlNew();
    await h.ctx.T.dnCrear();
    assert.match(h.el('srDnErr').innerHTML, /Ponele un nombre a la destacada\./);
    h.el('srDnTit').value = 'Viajes';
    await h.ctx.T.dnCrear();
    assert.match(h.el('srDnErr').innerHTML, /Elegí una foto\./);
    await h.ctx.T.dnSumar([h.archivo('v.mp4', 'video/mp4')]);
    assert.deepEqual(h.toasts.at(-1), ['Elegí una foto.', 'warn'], 'sin videos habilitados no se suma un video');
    assert.equal(h.ctx.T.DN.files.length, 0);
    assert.deepEqual(h.calls, []);
  });

  test('falla parcial: lo subido queda, se muestra el error y el reintento sigue en la misma destacada', async () => {
    const h = cargarHoja({ lim: 2 });
    h.HH.actions.spHlNew();
    h.el('srDnTit').value = 'Noche';
    await h.ctx.T.dnSumar([h.archivo('ok.jpg'), h.archivo('mala.jpg')]);
    h.fallar.add('mala.jpg');
    await h.ctx.T.dnCrear();
    assert.equal(h.state.modalAbierto, true, 'la hoja sigue abierta');
    assert.match(h.el('srDnErr').innerHTML, /<span>Se subieron 1 de 2\.<\/span> <span>El archivo no es una imagen válida\.<\/span>/);
    assert.equal(h.ctx.T.DN.id, 'D1');
    assert.equal(h.el('srDnTit').disabled, true, 'el nombre ya quedó guardado');
    assert.equal(h.recargas(), 1, 'lo subido ya se ve en Mi perfil');
    assert.ok(!h.calls.some((c) => c[0] === 'DELETE'), 'no se borra lo subido');
    // Reintento: solo lo que falta, sin crear otra destacada
    h.fallar.clear(); h.calls.length = 0;
    await h.ctx.T.dnCrear();
    assert.deepEqual(h.calls, [['UPLOAD', '/cuenta/destacadas/D1/fotos', 'foto', 'mala.jpg']]);
    assert.deepEqual(h.toasts.at(-1), ['Destacada creada.', 'ok']);
  });

  test('si no se subió nada, la destacada vacía se borra (no ocupa el cupo)', async () => {
    const h = cargarHoja({ lim: 2 });
    h.HH.actions.spHlNew();
    h.el('srDnTit').value = 'Vacía';
    await h.ctx.T.dnSumar([h.archivo('mala.jpg')]);
    h.fallar.add('mala.jpg');
    await h.ctx.T.dnCrear();
    assert.deepEqual(h.calls.at(-1).slice(0, 2), ['DELETE', '/cuenta/destacadas/D1']);
    assert.equal(h.ctx.T.DN.id, null);
    assert.match(h.el('srDnErr').innerHTML, /^<div class="notice danger"><span><span>El archivo no es una imagen válida\.<\/span><\/span><\/div>$/);
    assert.equal(h.recargas(), 0);
  });
});

/* ---------- Portada antes de crear (17/11/2026, Juan: "no me deja elegir la portada, deberá ser 'cover' antes de publicarla") ---------- */
describe('hoja «Nueva destacada»: la portada', () => {
  const PT = (id) => '/cuenta/destacadas/' + id + '/portada';
  async function lista(opts, nombres = ['a.jpg', 'b.jpg', 'c.jpg']) {
    const h = cargarHoja({ lim: 3, ...opts });
    h.HH.actions.spHlNew();
    h.el('srDnTit').value = 'Viajes';
    await h.ctx.T.dnSumar(nombres.map((n) => (/\.mp4$/.test(n) ? h.archivo(n, 'video/mp4') : h.archivo(n))));
    return h;
  }
  const portadaCalls = (h) => h.plano(h.calls).filter((c) => /\/portada$/.test(c[1]));

  test('por defecto, la primera elegida (automática): cartel «Portada» en la primera y no se pide nada al servidor', async () => {
    const h = await lista();
    const tiles = h.el('srDnGrid').innerHTML.split('<div class="sr-dn-t').slice(1);
    assert.match(tiles[0], /^ pt"/); assert.match(tiles[0], /sr-dn-tag">Portada</);
    assert.doesNotMatch(tiles[1] + tiles[2], /Portada</);
    assert.match(h.el('srDnPt').innerHTML, /Automática: la primera foto o video\./);
    assert.match(h.el('srDnPt').innerHTML, /Tocá una para usarla de portada/);
    assert.doesNotMatch(h.el('srDnPt').innerHTML, /spHlPortadaAuto/, 'ya es la automática');
    await h.ctx.T.dnCrear();
    assert.deepEqual(portadaCalls(h), [], 'la automática es el primer elemento: nada que pedir');
    assert.deepEqual(h.plano(h.calls).filter((c) => c[0] === 'UPLOAD').map((c) => c[3]), ['a.jpg', 'b.jpg', 'c.jpg'], 'en el orden elegido');
    assert.deepEqual(h.toasts.at(-1), ['Destacada creada.', 'ok']);
  });

  test('elegida: tocar una foto la marca y, después de subir, PUT …/portada con el id que devolvió su subida', async () => {
    const h = await lista();
    h.HH.actions.spHlPortada({ dataset: { i: '1' } });
    const tiles = h.el('srDnGrid').innerHTML.split('<div class="sr-dn-t').slice(1);
    assert.match(tiles[1], /^ pt"/); assert.doesNotMatch(tiles[0], /Portada</);
    assert.match(h.el('srDnPt').innerHTML, /La elegiste vos\./);
    assert.match(h.el('srDnPt').innerHTML, /data-action="spHlPortadaAuto"/);
    await h.ctx.T.dnCrear();
    const c = h.plano(h.calls);
    assert.deepEqual(c.at(-1), ['PUT', PT('D1'), { itemId: 'it-b.jpg' }], 'la portada va al final, con el id de esa foto');
    assert.equal(c.filter((x) => x[0] === 'UPLOAD').length, 3);
    // Sacar la elegida vuelve a la automática
    const h2 = await lista();
    h2.HH.actions.spHlPortada({ dataset: { i: '2' } }); h2.HH.actions.spHlQuitar({ dataset: { i: '2' } });
    await h2.ctx.T.dnCrear();
    assert.deepEqual(portadaCalls(h2), []);
  });

  test('imagen aparte: «Subir otra imagen» (solo imágenes, 12 MB) → POST …/portada después de subir los elementos', async () => {
    const h = await lista();
    h.HH.actions.spHlPortadaArchivo({ files: [h.archivo('v.mp4', 'video/mp4')] });
    assert.match(h.el('srDnErr').innerHTML, /Elegí una imagen\./);
    const grande = new File([Buffer.alloc(12 * 1024 * 1024 + 1)], 'g.jpg', { type: 'image/jpeg' });
    h.HH.actions.spHlPortadaArchivo({ files: [grande] });
    assert.match(h.el('srDnErr').innerHTML, /La imagen pesa más de 12 MB\./);
    h.HH.actions.spHlPortadaArchivo({ files: [h.archivo('tapa.jpg')] });
    assert.equal(h.el('srDnErr').innerHTML, '');
    assert.doesNotMatch(h.el('srDnGrid').innerHTML, /Portada</, 'ninguna miniatura es la portada');
    assert.match(h.el('srDnPt').innerHTML, /La elegiste vos\./);
    await h.ctx.T.dnCrear();
    const c = h.plano(h.calls);
    assert.deepEqual(c.at(-1), ['UPLOAD', PT('D1'), 'foto', 'tapa.jpg']);
    assert.deepEqual(c.slice(1, 4).map((x) => x[3]), ['a.jpg', 'b.jpg', 'c.jpg'], 'primero los elementos');
    assert.deepEqual(h.toasts.at(-1), ['Destacada creada.', 'ok']);
    assert.equal(h.state.modalAbierto, false);
    // «Usar la automática» la descarta
    const h2 = await lista();
    h2.HH.actions.spHlPortadaArchivo({ files: [h2.archivo('tapa.jpg')] }); h2.HH.actions.spHlPortadaAuto();
    await h2.ctx.T.dnCrear();
    assert.deepEqual(portadaCalls(h2), []);
  });

  test('la foto elegida de portada no se subió: queda la automática y se avisa; el reintento la aplica al final', async () => {
    const h = await lista();
    h.HH.actions.spHlPortada({ dataset: { i: '1' } });
    h.fallar.add('b.jpg');
    await h.ctx.T.dnCrear();
    assert.deepEqual(portadaCalls(h), [], 'sin PUT: queda la automática');
    const err = h.el('srDnErr').innerHTML;
    assert.match(err, /<span>Se subieron 2 de 3\.<\/span> <span>El archivo no es una imagen válida\.<\/span> <span>La foto elegida de portada no se subió: por ahora queda la automática\.<\/span>/);
    assert.equal(h.state.modalAbierto, true);
    // Reintento: sube la que faltaba y recién ahí pone la portada (misma destacada)
    h.fallar.clear(); h.calls.length = 0;
    await h.ctx.T.dnCrear();
    assert.deepEqual(h.plano(h.calls), [['UPLOAD', '/cuenta/destacadas/D1/fotos', 'foto', 'b.jpg'], ['PUT', PT('D1'), { itemId: 'it-b.jpg' }]]);
    assert.deepEqual(h.toasts.at(-1), ['Destacada creada.', 'ok']);
  });

  test('ya aplicada no se repite; si el servidor rechaza la portada, la hoja queda y el reintento solo pide la portada', async () => {
    const h = await lista();
    h.HH.actions.spHlPortada({ dataset: { i: '0' } });
    h.fallar.add('c.jpg');
    await h.ctx.T.dnCrear();
    assert.deepEqual(portadaCalls(h), [['PUT', PT('D1'), { itemId: 'it-a.jpg' }]]);
    h.fallar.clear(); h.calls.length = 0;
    await h.ctx.T.dnCrear();
    assert.deepEqual(h.plano(h.calls), [['UPLOAD', '/cuenta/destacadas/D1/fotos', 'foto', 'c.jpg']], 'la portada ya estaba puesta');
    // Error del servidor al poner la portada (todo subido)
    const h2 = await lista();
    h2.HH.actions.spHlPortadaArchivo({ files: [h2.archivo('tapa.jpg')] });
    h2.fallar.add('tapa.jpg');
    await h2.ctx.T.dnCrear();
    assert.equal(h2.state.modalAbierto, true);
    assert.match(h2.el('srDnErr').innerHTML, /El archivo no es una imagen válida\./);
    assert.doesNotMatch(h2.el('srDnErr').innerHTML, /Se subieron/, 'los elementos se subieron todos');
    h2.fallar.clear(); h2.calls.length = 0;
    await h2.ctx.T.dnCrear();
    assert.deepEqual(h2.plano(h2.calls), [['UPLOAD', PT('D1'), 'foto', 'tapa.jpg']], 'solo la portada');
    assert.equal(h2.state.modalAbierto, false);
  });

  test('videos: no se eligen de portada (quedan con la automática hasta que terminen de procesarse)', async () => {
    const h = await lista({ videos: true }, ['a.jpg', 'v.mp4']);
    assert.match(h.el('srDnPt').innerHTML, /Los videos quedan con la portada automática hasta que terminen de procesarse\./);
    h.HH.actions.spHlPortada({ dataset: { i: '1' } });
    assert.deepEqual(h.toasts.at(-1), ['Los videos quedan con la portada automática hasta que terminen de procesarse.', '']);
    assert.match(h.el('srDnGrid').innerHTML.split('<div class="sr-dn-t')[1], /^ pt"/, 'sigue la automática (la primera)');
    await h.ctx.T.dnCrear();
    assert.deepEqual(portadaCalls(h), []);
  });

  test('textos de la portada en inglés y portugués', () => {
    const ini = sitio.indexOf("  Object.assign(HH.I18N = HH.I18N || {}, {\n    'Nueva': ");
    const c = { HH: {} }; vm.createContext(c);
    vm.runInContext(sitio.slice(ini, sitio.indexOf('});', ini) + 3), c);
    for (const k of ['Portada', 'Tocá una para usarla de portada', 'Los videos quedan con la portada automática hasta que terminen de procesarse.', 'La foto elegida de portada no se subió: por ahora queda la automática.']) {
      const v = c.HH.I18N[k]; assert.ok(v && v[0] && v[1], k);
    }
    // Los que ya existían (hoja «Cambiar portada»)
    for (const k of ['Subir otra imagen', 'Usar la automática', 'La elegiste vos.', 'Automática: la primera foto o video.', 'Usar de portada']) assert.ok(sitio.includes(`'${k}': ['`), k);
  });
});

/* ---------- Servidor: el flujo que usa la hoja (crear + elementos) y el cupo ---------- */
describe('API: crear la destacada, subir sus elementos y el límite del plan', () => {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) { console.error('Falta DATABASE_URL.'); process.exit(1); }
  const db = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
  let s; let BASE; let tmpData; let tmpPublic;
  const ip = () => '2001:db8:' + crypto.randomBytes(2).toString('hex') + '::' + crypto.randomBytes(2).toString('hex');
  async function acompanante(plan = 'E') {
    const email = `zzdn-${crypto.randomBytes(4).toString('hex')}@example.com`;
    const { rows } = await db.query("INSERT INTO cuentas (email, pass_hash, email_verificado) VALUES ($1, 'x', now()) RETURNING id", [email]);
    const id = rows[0].id;
    const datos = { displayName: 'Zz Dn', genero: 'mujer', fechaNacimiento: '1995-03-03', pais: 'argentina', provincia: 'provincia-de-buenos-aires', ciudad: 'san-isidro', whatsapp: '+5491122223333' };
    await db.query("INSERT INTO perfiles (cuenta_id, slug, datos, estado, verificacion, publicado_en) VALUES ($1, $2, $3, 'publicado', 'verificada', now())", [id, 'zzdn-' + id.slice(0, 8), JSON.stringify(datos)]);
    if (plan !== 'E') await db.query("INSERT INTO suscripciones (cuenta_id, plan, periodo, desde, hasta) VALUES ($1, $2, 'manual', now() - interval '1 hour', now() + interval '30 days')", [id, plan]);
    const t = crypto.randomBytes(24).toString('base64url');
    await db.query("INSERT INTO sesiones (token_hash, cuenta_id, expira) VALUES (sha256($1::bytea), $2, now() + interval '1 hour')", [Buffer.from(t), id]);
    invalidarSitio();
    const headers = (extra = {}) => ({ origin: BASE, 'x-sr': '1', 'cf-connecting-ip': ip(), cookie: 'sr_sesion=' + t, ...extra });
    return {
      id,
      json: async (method, p, body) => { const r = await fetch(BASE + p, { method, headers: headers({ 'content-type': 'application/json' }), body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => null) }; },
      foto: async (destId, buf) => {
        const fd = new FormData(); fd.append('foto', new Blob([buf], { type: 'image/jpeg' }), 'f.jpg');
        const r = await fetch(`${BASE}/api/cuenta/destacadas/${destId}/fotos`, { method: 'POST', body: fd, headers: headers() });
        return { status: r.status, body: await r.json().catch(() => null) };
      },
      get: async (p) => (await fetch(BASE + p, { headers: headers() })).json(),
    };
  }
  const jpg = (r) => sharp({ create: { width: 400, height: 700, channels: 3, background: { r, g: 80, b: 120 } } }).jpeg().toBuffer();

  before(async () => {
    tmpData = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-dn-data-'));
    tmpPublic = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-dn-pub-'));
    await fs.writeFile(path.join(tmpPublic, 'index.html'), '<!doctype html><title>x</title>');
    s = await start({ prelanzamientoPorDefecto: true, storage: 'local', port: 0, host: '127.0.0.1', databaseUrl: DATABASE_URL, publicDir: tmpPublic, dataDir: tmpData,
      adminUser: '', adminPassword: '', adminPath: '', ipHashSalt: 'sal', siteUrl: 'https://sexyrose.test', telegramToken: '', telegramChatId: '', mailgunApiKey: '', tareaPlanes: false, log: () => {}, sendMail: async () => {} });
    await s.ready;
    BASE = `http://127.0.0.1:${s.port}`;
  });
  after(async () => {
    if (s) await s.close();
    await db.query("DELETE FROM cuentas WHERE email LIKE 'zzdn-%@example.com'");
    await db.end();
    for (const d of [tmpData, tmpPublic]) if (d) await fs.rm(d, { recursive: true, force: true });
  });

  test('crear + varios elementos: aparece en Mi perfil (vista previa, home provisoria prendida) con sus elementos en orden', async () => {
    const c = await acompanante('D');
    const r = await c.json('POST', '/api/cuenta/destacadas', { titulo: 'Viajes' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const id = r.body.destacada.id;
    const f1 = await c.foto(id, await jpg(10)); const f2 = await c.foto(id, await jpg(200));
    assert.equal(f1.status, 201, JSON.stringify(f1.body)); assert.equal(f2.status, 201);
    const vp = await c.get('/api/cuenta/vista-previa');
    const d = (vp.perfil.destacadas || []).find((x) => x.id === id);
    assert.ok(d, 'la destacada nueva está en los datos de Mi perfil');
    assert.equal(d.titulo, 'Viajes');
    assert.deepEqual(d.items.map((x) => x.id), [f1.body.item.id, f2.body.item.id]);
    // Lo que usa la hoja para el cupo: /yo → limites.destacadas y la lista
    const yo = await c.get('/api/cuenta/yo');
    assert.equal(yo.cuenta.limites.destacadas, 2);
    assert.equal(yo.cuenta.destacadas.length, 1);
  });

  test('portada: sin pedir nada es la automática (el primer elemento); con el id que devolvió la subida, esa foto', async () => {
    const c = await acompanante('D');
    const crear = async (t) => (await c.json('POST', '/api/cuenta/destacadas', { titulo: t })).body.destacada.id;
    const auto = await crear('Auto');
    const a1 = (await c.foto(auto, await jpg(10))).body.item; await c.foto(auto, await jpg(90));
    const elegida = await crear('Elegida');
    await c.foto(elegida, await jpg(30)); const e2 = (await c.foto(elegida, await jpg(220))).body.item;
    const put = await c.json('PUT', `/api/cuenta/destacadas/${elegida}/portada`, { itemId: e2.id });
    assert.equal(put.status, 200, JSON.stringify(put.body));
    const vp = await c.get('/api/cuenta/vista-previa');
    const d = (id) => vp.perfil.destacadas.find((x) => x.id === id);
    assert.equal(d(auto).portada, null, 'automática');
    assert.equal(d(auto).items[0].id, a1.id, 'el círculo usa el primer elemento');
    assert.equal(d(elegida).portada, e2.urlMini);
  });

  test('nombre: mismas reglas que el panel (vacío o más de 16 caracteres → 400)', async () => {
    const c = await acompanante();
    const vacio = await c.json('POST', '/api/cuenta/destacadas', { titulo: '   ' });
    assert.equal(vacio.status, 400); assert.equal(vacio.body.error, 'Ponele un nombre a la destacada.');
    const largo = await c.json('POST', '/api/cuenta/destacadas', { titulo: 'x'.repeat(17) });
    assert.equal(largo.status, 400); assert.equal(largo.body.error, 'El nombre puede tener hasta 16 caracteres.');
  });

  test('límite del plan (Bronce: 1): la segunda responde el mensaje del plan; borrar la vacía libera el cupo', async () => {
    const c = await acompanante('E');
    const a = await c.json('POST', '/api/cuenta/destacadas', { titulo: 'Una' });
    assert.equal(a.status, 201);
    const b = await c.json('POST', '/api/cuenta/destacadas', { titulo: 'Dos' });
    assert.equal(b.status, 400);
    assert.equal(b.body.error, 'Tu plan permite 1 destacada. Subí de plan para sumar más.');
    // Lo que hace la hoja si no se subió nada: borra la vacía y el cupo vuelve
    assert.equal((await c.json('DELETE', '/api/cuenta/destacadas/' + a.body.destacada.id)).status, 200);
    assert.equal((await c.json('POST', '/api/cuenta/destacadas', { titulo: 'Dos' })).status, 201);
  });
});
