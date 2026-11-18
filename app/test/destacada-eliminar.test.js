// Destacadas sin elementos y eliminar la destacada completa (17/11/2026, pedidos de Juan):
//  1. "Si elimino todas las fotos de una destacada, elimino esa destacada." → al borrar el último elemento (listo o en
//     proceso; los que fallaron no cuentan) el servidor borra la destacada en la misma operación, con su portada subida
//     (lib/destacadas.js → borrarItem: { ok, destacadaBorrada, destacadaId }). En el visor, la confirmación lo dice.
//  2. "Debo poder eliminar la destacada completa desde el perfil." → "⋯" del visor en su destacada → «Eliminar
//     destacada» (con confirmación) → DELETE /api/cuenta/destacadas/:id. Nunca para otras, visitantes ni la vista previa.
//   DATABASE_URL=postgres://... node --test test/destacada-eliminar.test.js
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
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('Falta DATABASE_URL.'); process.exit(1); }

const ULTIMA = 'Es la última de esta destacada: se elimina la destacada completa. No se puede deshacer.';

/* ---------- prod-sitio.js: el "⋯" del visor en sus destacadas ---------- */
describe('visor: «Eliminar destacada» y quitar la última (HH.storyOwnMenu, prod-sitio.js)', () => {
  const trozo = sitio.slice(sitio.indexOf('  const esPropia = '), sitio.indexOf('  async function recargarPropias()'));
  const llamadas = []; const S = { yo: null };
  const HH = { db: { stories: [], highlights: [{ id: 'd1', items: [{ id: 'i1' }, { id: 'i2' }] }, { id: 'd2', items: [{ id: 'j1' }] }] } };
  let respuesta = { ok: true };
  const ctx = { HH, S, api: async (m, p) => { llamadas.push([m, p]); return respuesta; }, recargarPropias: () => llamadas.push(['recargar']), abrirPortada: () => {} };
  vm.createContext(ctx); vm.runInContext(trozo, ctx);
  const menu = (id, hid) => ctx.HH.storyOwnMenu({ id, workerId: 'A', highlightId: hid }, { workerId: 'A', highlight: true });
  const conYo = (destacadas) => { S.yo = { id: 'A', destacadas }; };

  test('su destacada: «Eliminar destacada» (rojo, con el nombre en la confirmación) → DELETE /cuenta/destacadas/:id, cierra el visor', async () => {
    conYo([{ id: 'd1', titulo: 'Viajes', items: [{ id: 'i1', estado: 'listo' }, { id: 'i2', estado: 'listo' }] }]);
    const m = menu('i1', 'd1');
    assert.equal(m.label, 'Quitar de la destacada');
    assert.equal(m.confirm, '¿Quitar esto de la destacada? Se borra la foto o el video y no se puede deshacer.', 'no es la última');
    assert.ok(!m.cierra);
    assert.equal(m.danger.length, 1);
    const e = m.danger[0];
    assert.equal(e.label, 'Eliminar destacada');
    assert.equal(e.confirm, '¿Eliminar la destacada «Viajes» completa? Se borran todas sus fotos y videos. No se puede deshacer.');
    assert.equal(e.okLabel, 'Eliminar'); assert.equal(e.done, 'Destacada eliminada.'); assert.equal(e.cierra, true);
    llamadas.length = 0;
    await e.run();
    assert.deepEqual(llamadas, [['DELETE', '/cuenta/destacadas/d1'], ['recargar']], 'el mismo endpoint que «Borrar destacada» del panel');
    assert.deepEqual(HH.db.highlights.map((h) => h.id), ['d2'], 'sale de lo que se ve ya mismo');
  });

  test('quitar la última: la confirmación avisa que se elimina la destacada; «Destacada eliminada.» y se cierra el visor', async () => {
    conYo([{ id: 'd2', titulo: 'Noche', items: [{ id: 'j1', estado: 'listo' }, { id: 'jx', estado: 'error' }] }]);
    const m = menu('j1', 'd2');
    assert.equal(m.confirm, ULTIMA, 'un video que falló no cuenta');
    assert.equal(m.done, 'Destacada eliminada.'); assert.equal(m.cierra, true);
    respuesta = { ok: true, destacadaBorrada: true, destacadaId: 'd2' };
    llamadas.length = 0;
    const r = await m.run();
    assert.deepEqual(llamadas, [['DELETE', '/cuenta/destacadas/items/j1'], ['recargar']]);
    assert.equal(r.destacadaBorrada, true);
    assert.deepEqual(HH.db.highlights.map((h) => h.id), [], 'la destacada sale de lo que se ve');
    respuesta = { ok: true };
  });

  test('un video en proceso cuenta: quitar la única foto no es «la última»', () => {
    conYo([{ id: 'd3', titulo: 'Playa', items: [{ id: 'k1', estado: 'listo' }, { id: 'kv', estado: 'procesando' }] }]);
    const m = menu('k1', 'd3');
    assert.notEqual(m.confirm, ULTIMA); assert.ok(!m.cierra);
  });

  test('nunca para otras, visitantes ni la vista previa', () => {
    conYo([{ id: 'd1', titulo: 'Viajes', items: [{ id: 'i1', estado: 'listo' }] }]);
    ctx.HH.esVistaPrevia = () => true;
    assert.equal(menu('i1', 'd1'), null, 'vista previa');
    delete ctx.HH.esVistaPrevia;
    S.yo = null; assert.equal(menu('i1', 'd1'), null, 'visitante o cliente');
    S.yo = { id: 'B', destacadas: [] };
    assert.equal(menu('i1', 'd1'), null, 'otra acompañante');
    // Una destacada que no está entre las suyas: sin «Eliminar destacada» ni «Cambiar portada»
    conYo([]);
    const m = menu('i1', 'd9');
    assert.deepEqual([m.extra.length, m.danger.length], [0, 0]);
  });

  test('panel (Historias → Destacadas): borrar el último elemento avisa lo mismo y, si el servidor la borró, «Destacada eliminada.»', () => {
    const f = sitio.slice(sitio.indexOf('    async spDestItemBorrar(el) {'), sitio.indexOf('    async spDestSubir(form) {'));
    assert.match(f, /text: ultima \? DEST_ULTIMA : '¿Querés borrar este elemento de la destacada\?'/);
    assert.match(f, /afterYoChange\(r && r\.destacadaBorrada \? 'Destacada eliminada\.' : 'Borrado\.'\)/);
  });

  test('core.js: las opciones destructivas extra van en rojo, cada una con su confirmación; «cierra» cierra el visor', () => {
    const core = leer('core.js');
    assert.match(core, /\$\{\(m\.danger \|\| \[\]\)\.map\(\(x, k\) => `<button type="button" class="story-sheet-item danger" role="menuitem" data-story="del" data-k="\$\{k\}">/);
    assert.match(core, /if \(a === 'del'\) \{ acc = b\.dataset\.k != null \? Number\(b\.dataset\.k\) : -1; pintarMenu\('confirm'\); return; \}/);
    assert.match(core, /if \(a === 'more'\) \{ acc = -1; pintarMenu\('menu'\); return; \}/);
    assert.match(core, /<p class="story-cf-tx" id="storyCfTx">\$\{HH\.esc\(a\.confirm\)\}<\/p>/);
    assert.match(core, /HH\.toast\(a\.done, \{ type: 'ok' \}\);\s*if \(!root\.isConnected\) return;\s*if \(a\.cierra\) close\(\); else quitada\(st\.id\);/);
  });

  test('textos en inglés y portugués', () => {
    const c = { HH: {} }; vm.createContext(c);
    const ini = sitio.indexOf("  Object.assign(HH.I18N = HH.I18N || {}, {\n    'Más opciones'");
    vm.runInContext(sitio.slice(ini, sitio.indexOf('});', ini) + 3), c);
    for (const k of ['Eliminar destacada', '¿Eliminar la destacada «{x}» completa? Se borran todas sus fotos y videos. No se puede deshacer.', ULTIMA, 'Destacada eliminada.']) {
      const v = c.HH.I18N[k]; assert.ok(v && v[0] && v[1], k);
      assert.equal((k.match(/\{x\}/g) || []).length, (v[0].match(/\{x\}/g) || []).length, k);
      assert.equal((k.match(/\{x\}/g) || []).length, (v[1].match(/\{x\}/g) || []).length, k);
    }
  });
});

/* ---------- Servidor ---------- */
describe('servidor: el último elemento se lleva la destacada; eliminar la destacada; solo lo suyo', () => {
  const db = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
  const guardados = new Map();
  const driver = {
    origin: 'https://cdn.prueba.test',
    async put(clave, buffer, tipo) { guardados.set(clave, { buffer: Buffer.from(buffer), tipo }); return `https://cdn.prueba.test/${clave}`; },
    async del(clave) { guardados.delete(clave); },
  };
  let s; let BASE; let tmpData; let tmpPublic;
  const ip = () => '2001:db8:' + crypto.randomBytes(2).toString('hex') + '::' + crypto.randomBytes(2).toString('hex');
  const jpg = (r) => sharp({ create: { width: 400, height: 700, channels: 3, background: { r, g: 80, b: 120 } } }).jpeg().toBuffer();
  async function acompanante() {
    const email = `zzde-${crypto.randomBytes(4).toString('hex')}@example.com`;
    const { rows } = await db.query("INSERT INTO cuentas (email, pass_hash, email_verificado) VALUES ($1, 'x', now()) RETURNING id", [email]);
    const id = rows[0].id;
    const datos = { displayName: 'Zz De', genero: 'mujer', fechaNacimiento: '1995-03-03', pais: 'argentina', provincia: 'provincia-de-buenos-aires', ciudad: 'san-isidro', whatsapp: '+5491122223333' };
    await db.query("INSERT INTO perfiles (cuenta_id, slug, datos, estado, verificacion, publicado_en) VALUES ($1, $2, $3, 'publicado', 'verificada', now())", [id, 'zzde-' + id.slice(0, 8), JSON.stringify(datos)]);
    await db.query("INSERT INTO suscripciones (cuenta_id, plan, periodo, desde, hasta) VALUES ($1, 'C', 'manual', now() - interval '1 hour', now() + interval '30 days')", [id]);
    const t = crypto.randomBytes(24).toString('base64url');
    await db.query("INSERT INTO sesiones (token_hash, cuenta_id, expira) VALUES (sha256($1::bytea), $2, now() + interval '1 hour')", [Buffer.from(t), id]);
    invalidarSitio();
    const headers = (extra = {}) => ({ origin: BASE, 'x-sr': '1', 'cf-connecting-ip': ip(), cookie: 'sr_sesion=' + t, ...extra });
    const multipart = async (p, buf) => {
      const fd = new FormData(); fd.append('foto', new Blob([buf], { type: 'image/jpeg' }), 'f.jpg');
      const r = await fetch(BASE + p, { method: 'POST', body: fd, headers: headers() });
      return { status: r.status, body: await r.json().catch(() => null) };
    };
    const c = {
      id,
      json: async (method, p, body) => { const r = await fetch(BASE + p, { method, headers: headers({ 'content-type': 'application/json' }), body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => null) }; },
      crear: async (titulo) => (await c.json('POST', '/api/cuenta/destacadas', { titulo })).body.destacada.id,
      foto: async (destId, r = 10) => (await multipart(`/api/cuenta/destacadas/${destId}/fotos`, await jpg(r))).body.item,
      portada: async (destId) => multipart(`/api/cuenta/destacadas/${destId}/portada`, await jpg(250)),
      quitar: (itemId) => c.json('DELETE', '/api/cuenta/destacadas/items/' + itemId),
      vista: async () => (await (await fetch(BASE + '/api/cuenta/vista-previa', { headers: headers() })).json()).perfil.destacadas || [],
    };
    return c;
  }
  const existe = async (id) => (await db.query('SELECT 1 FROM destacadas WHERE id = $1', [id])).rowCount === 1;
  const claves = async (destId) => (await db.query('SELECT clave, clave_mini FROM destacada_items WHERE destacada_id = $1', [destId])).rows.flatMap((r) => [r.clave, r.clave_mini]).filter(Boolean);

  before(async () => {
    tmpData = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-de-data-'));
    tmpPublic = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-de-pub-'));
    await fs.writeFile(path.join(tmpPublic, 'index.html'), '<!doctype html><title>x</title>');
    s = await start({ prelanzamientoPorDefecto: false, port: 0, host: '127.0.0.1', databaseUrl: DATABASE_URL, publicDir: tmpPublic, dataDir: tmpData, storageDriver: driver,
      adminUser: '', adminPassword: '', adminPath: '', ipHashSalt: 'sal', siteUrl: 'https://sexyrose.test', telegramToken: '', telegramChatId: '', mailgunApiKey: '', tareaPlanes: false, log: () => {}, sendMail: async () => {} });
    await s.ready;
    BASE = `http://127.0.0.1:${s.port}`;
  });
  after(async () => {
    if (s) await s.close();
    await db.query("DELETE FROM cuentas WHERE email LIKE 'zzde-%@example.com'");
    await db.end();
    for (const d of [tmpData, tmpPublic]) if (d) await fs.rm(d, { recursive: true, force: true });
  });

  test('quitar un elemento que no es el último: destacadaBorrada false y la destacada sigue', async () => {
    const c = await acompanante();
    const d = await c.crear('Viajes'); const a = await c.foto(d); const b = await c.foto(d, 90);
    const r = await c.quitar(a.id);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { ok: true, destacadaBorrada: false, destacadaId: d });
    assert.ok(await existe(d));
    assert.deepEqual((await c.vista()).find((x) => x.id === d).items.map((x) => x.id), [b.id]);
  });

  test('quitar el último: se borra la destacada con sus archivos y su portada subida (deja de verse)', async () => {
    const c = await acompanante();
    const d = await c.crear('Noche'); const a = await c.foto(d);
    const pr = await c.portada(d); assert.equal(pr.status, 200, JSON.stringify(pr.body));
    const { rows: [{ portada_clave: pc }] } = await db.query('SELECT portada_clave FROM destacadas WHERE id = $1', [d]);
    const archivos = (await claves(d)).concat(pc);
    assert.ok(archivos.every((k) => guardados.has(k)), 'antes, los archivos están');
    const r = await c.quitar(a.id);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { ok: true, destacadaBorrada: true, destacadaId: d });
    assert.equal(await existe(d), false);
    assert.ok(archivos.every((k) => !guardados.has(k)), 'fotos y portada subida borradas del almacenamiento');
    assert.equal((await c.vista()).some((x) => x.id === d), false);
    // El cupo vuelve
    assert.equal((await c.json('GET', '/api/cuenta/destacadas')).body.usadas, 0);
  });

  test('un video en proceso cuenta como elemento: quitar la única foto no borra la destacada', async () => {
    const c = await acompanante();
    const d = await c.crear('Playa'); const a = await c.foto(d);
    await db.query("INSERT INTO destacada_items (destacada_id, cuenta_id, tipo, estado) VALUES ($1, $2, 'video', 'procesando')", [d, c.id]);
    const r = await c.quitar(a.id);
    assert.deepEqual(r.body, { ok: true, destacadaBorrada: false, destacadaId: d });
    assert.ok(await existe(d));
  });

  test('los que fallaron no cuentan: quitar el último listo borra la destacada y también esos', async () => {
    const c = await acompanante();
    const d = await c.crear('Fiesta'); const a = await c.foto(d);
    await db.query("INSERT INTO destacada_items (destacada_id, cuenta_id, tipo, estado, error) VALUES ($1, $2, 'video', 'error', 'No se pudo procesar.')", [d, c.id]);
    const r = await c.quitar(a.id);
    assert.equal(r.body.destacadaBorrada, true);
    assert.equal(await existe(d), false);
    assert.equal((await db.query('SELECT 1 FROM destacada_items WHERE destacada_id = $1', [d])).rowCount, 0);
  });

  test('una destacada recién creada, todavía sin elementos (el panel crea primero y después sube), no se toca', async () => {
    const c = await acompanante();
    const d = await c.crear('Vacía');
    const otra = await c.crear('Llena'); const a = await c.foto(otra);
    await c.quitar(a.id);
    assert.ok(await existe(d), 'la vacía sigue (solo se borra la que se quedó sin elementos al quitar)');
  });

  test('eliminar la destacada completa (DELETE /destacadas/:id) borra sus elementos, archivos y portada', async () => {
    const c = await acompanante();
    const d = await c.crear('Todo'); await c.foto(d); await c.foto(d, 120); await c.portada(d);
    const { rows: [{ portada_clave: pc }] } = await db.query('SELECT portada_clave FROM destacadas WHERE id = $1', [d]);
    const archivos = (await claves(d)).concat(pc);
    const r = await c.json('DELETE', '/api/cuenta/destacadas/' + d);
    assert.equal(r.status, 200);
    assert.equal(await existe(d), false);
    assert.ok(archivos.every((k) => !guardados.has(k)));
  });

  test('solo lo suyo: otra acompañante recibe 404 al quitar un elemento o eliminar la destacada, y nada cambia', async () => {
    const duena = await acompanante(); const otra = await acompanante();
    const d = await duena.crear('Mía'); const a = await duena.foto(d);
    const r1 = await otra.quitar(a.id);
    assert.equal(r1.status, 404); assert.equal(r1.body.error, 'No encontramos ese elemento.');
    const r2 = await otra.json('DELETE', '/api/cuenta/destacadas/' + d);
    assert.equal(r2.status, 404); assert.equal(r2.body.error, 'No encontramos esa destacada.');
    assert.ok(await existe(d));
    assert.equal((await db.query('SELECT 1 FROM destacada_items WHERE id = $1', [a.id])).rowCount, 1);
    // Sin sesión: 401
    const r3 = await fetch(BASE + '/api/cuenta/destacadas/items/' + a.id, { method: 'DELETE', headers: { origin: BASE, 'x-sr': '1' } });
    assert.equal(r3.status, 401);
  });

  test('dos borrados a la vez de los dos últimos: la destacada no queda vacía', async () => {
    const c = await acompanante();
    const d = await c.crear('Doble'); const a = await c.foto(d); const b = await c.foto(d, 60);
    const [r1, r2] = await Promise.all([c.quitar(a.id), c.quitar(b.id)]);
    assert.equal(r1.status, 200); assert.equal(r2.status, 200);
    assert.equal([r1.body.destacadaBorrada, r2.body.destacadaBorrada].filter(Boolean).length, 1, 'una de las dos la borra');
    assert.equal(await existe(d), false);
  });
});
