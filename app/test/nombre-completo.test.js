// Nombre completo (legal) en la verificación de identidad (17/11/2026, decisiones de Juan) y fecha de nacimiento fija.
// - Se escribe en Verificación junto con las tres fotos (obligatorio; 400 si falta o no es válido).
// - Se guarda en el envío (verificaciones.nombre_completo) y, al aprobarlo, en la cuenta (cuentas.nombre_completo), donde
//   queda fijo. La purga de las imágenes a los 90 días no lo toca.
// - Nunca es público: ni en el estado/perfil público, ni en la vista previa, ni en el HTML, ni en el sitemap.
// - El admin lo ve en la revisión de la verificación, en la ficha y en el listado.
//   DATABASE_URL=postgres://... node --test test/nombre-completo.test.js
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import sharp from 'sharp';
import { start } from '../server.js';
import { invalidarSitio } from '../routes/sitio.js';
import { validarNombreCompleto } from '../lib/perfiles.js';
import { textoAyuda } from '../lib/asistente-ayuda.js';
import * as storage from '../lib/storage.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('Falta DATABASE_URL.'); process.exit(1); }

const db = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
const A = '/panel-nombre-completo-0123456789';
const USER = 'admin-nc';
const PASS = 'clave-de-prueba-larga-nc-123';
let instance; let BASE; let tmpData; let tmpSpa;
const rand = () => crypto.randomBytes(4).toString('hex');

before(async () => {
  tmpData = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-nc-data-'));
  tmpSpa = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-nc-spa-'));
  await fs.mkdir(path.join(tmpSpa, 'assets'));
  await fs.writeFile(path.join(tmpSpa, 'index.html'), '<!doctype html><html lang="es-AR"><head><title>SR</title><meta name="description" content="x"><!--SR:SEO--><!--SR:PRECONNECT--></head><body><main id="app"></main></body></html>');
  const tpl = Object.fromEntries(['es', 'en', 'pt'].map((l) => [l, Object.fromEntries(['country', 'place', 'countryMen', 'placeMen', 'profile'].map((k) => [k, { title: k + ' {lugar}', description: k }]))]));
  await fs.writeFile(path.join(tmpSpa, 'seo-datos.json'), JSON.stringify({ defaults: { siteUrl: 'https://sexyrose.test', minProfiles: 1, home: Object.fromEntries(['es', 'en', 'pt'].map((l) => [l, { title: 'Inicio', description: 'd' }])), tpl }, lugares: {}, dict: {} }));
  instance = await start({ prelanzamientoPorDefecto: false,
    port: 0, host: '127.0.0.1', databaseUrl: DATABASE_URL, dataDir: tmpData, storage: 'local', sitioSpaPath: path.join(tmpSpa, 'index.html'),
    adminPath: A, adminUser: USER, adminPassword: PASS, ipHashSalt: 'sal-nc', siteUrl: 'https://sexyrose.test',
    telegramToken: '', telegramChatId: '', mailgunApiKey: '', log: () => {}, tareaPlanes: false, sendMail: async () => {},
  });
  BASE = `http://127.0.0.1:${instance.port}`;
  await instance.ready;
  await db.query("DELETE FROM cuentas WHERE email LIKE 'zznc-%@example.com'");
});

after(async () => {
  await db.query("DELETE FROM cuentas WHERE email LIKE 'zznc-%@example.com'");
  await db.end();
  if (instance) await instance.close();
  await fs.rm(tmpData, { recursive: true, force: true });
  await fs.rm(tmpSpa, { recursive: true, force: true });
});

const basic = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
const adm = async (p) => (await fetch(BASE + A + '/api' + p, { headers: { authorization: basic } })).json();
const admPost = async (p, body) => {
  const r = await fetch(BASE + A + '/api' + p, {
    method: 'POST', body: JSON.stringify(body ?? {}),
    headers: { authorization: basic, 'content-type': 'application/json', 'x-sr-admin': '1', origin: BASE },
  });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const jpeg = (w, h, color) => sharp({ create: { width: w, height: h, channels: 3, background: color } }).jpeg().toBuffer();
const FOTOS = async () => ({ frente: await jpeg(900, 600, { r: 30, g: 30, b: 200 }), dorso: await jpeg(900, 600, { r: 200, g: 200, b: 30 }), selfie: await jpeg(600, 800, { r: 10, g: 200, b: 30 }) });

// Cuenta nueva con sesión. Con `publicada`: perfil publicado y verificado, con fotos y ubicación (lo ve cualquiera).
async function cuenta({ publicada = false } = {}) {
  const id = crypto.randomUUID();
  const slug = 'zznc-' + rand();
  await db.query("INSERT INTO cuentas (id, email, pass_hash, email_verificado, acepto_terminos, mayor_edad_declarada) VALUES ($1, $2, 'x', now(), now(), true)", [id, `zznc-${rand()}@example.com`]);
  const datos = { displayName: 'Zz Artística', genero: 'mujer', fechaNacimiento: '1994-02-03', pais: 'argentina', provincia: 'provincia-de-buenos-aires', ciudad: 'san-isidro', whatsapp: '+5491122223333', bio: 'Hola' };
  await db.query('INSERT INTO perfiles (cuenta_id, slug, datos, estado, verificacion, publicado_en) VALUES ($1, $2, $3::jsonb, $4, $5, $6)',
    [id, slug, JSON.stringify(datos), publicada ? 'publicado' : 'borrador', publicada ? 'verificada' : 'sin_enviar', publicada ? new Date() : null]);
  for (let i = 0; i < 3; i++) await db.query('INSERT INTO fotos (cuenta_id, orden, clave, url, url_mini, ancho, alto) VALUES ($1, $2, $3, $4, $4, 800, 1000)', [id, i, `zznc/${id}/${i}.jpg`, `https://cdn.example/zznc/${id}/${i}.jpg`]);
  const t = crypto.randomBytes(24).toString('hex');
  await db.query("INSERT INTO sesiones (token_hash, cuenta_id, expira) VALUES (sha256($1::bytea), $2, now() + interval '1 hour')", [Buffer.from(t), id]);
  const ip = `2001:db8:${rand().slice(0, 4)}::${rand().slice(0, 4)}`;
  const headers = () => ({ origin: BASE, 'x-sr': '1', 'cf-connecting-ip': ip, cookie: 'sr_sesion=' + t });
  return {
    id, slug,
    async subir(campos) {
      const fd = new FormData();
      for (const [k, v] of Object.entries(campos)) {
        if (typeof v === 'string') fd.append(k, v); else fd.append(k, new Blob([v], { type: 'image/jpeg' }), 'x.jpg');
      }
      const r = await fetch(BASE + '/api/cuenta/verificacion', { method: 'POST', headers: headers(), body: fd });
      return { status: r.status, body: await r.json().catch(() => null) };
    },
    async put(p, body) {
      const r = await fetch(BASE + '/api/cuenta' + p, { method: 'PUT', headers: { ...headers(), 'content-type': 'application/json' }, body: JSON.stringify(body) });
      return { status: r.status, body: await r.json().catch(() => null) };
    },
    async get(p) { return fetch(BASE + p, { headers: headers() }); },
    async yo() { return (await (await fetch(BASE + '/api/cuenta/yo', { headers: headers() })).json()).cuenta; },
  };
}
const filas = async (id) => (await db.query('SELECT estado, nombre_completo FROM verificaciones WHERE cuenta_id = $1 ORDER BY creado', [id])).rows;
const nombreCuenta = async (id) => (await db.query('SELECT nombre_completo FROM cuentas WHERE id = $1', [id])).rows[0].nombre_completo;

describe('nombre completo: validación', () => {
  test('normaliza espacios; 3 a 80 caracteres; letras, espacios, apóstrofos, guiones y puntos', () => {
    assert.deepEqual(validarNombreCompleto('  María   José\tD\'Angelo-Pérez '), { valor: "María José D'Angelo-Pérez" });
    assert.deepEqual(validarNombreCompleto('Ana M. Núñez'), { valor: 'Ana M. Núñez' });
    assert.deepEqual(validarNombreCompleto('Joana D’Ávila Gonçalves'), { valor: 'Joana D’Ávila Gonçalves' });
    assert.equal(validarNombreCompleto('Li').error, 'Tu nombre completo tiene que tener entre 3 y 80 caracteres.');
    assert.equal(validarNombreCompleto('a'.repeat(81)).error, 'Tu nombre completo tiene que tener entre 3 y 80 caracteres.');
    assert.ok(validarNombreCompleto('a'.repeat(80)).valor);
    for (const malo of ['Ana 123', 'Ana <b>', 'Ana@Gómez', '...', "'- .", 'Ana_Gómez']) {
      assert.equal(validarNombreCompleto(malo).error, 'Tu nombre completo solo puede tener letras, espacios, apóstrofos, guiones y puntos.', malo);
    }
    for (const vacio of [undefined, null, '', '   ', 42]) assert.equal(validarNombreCompleto(vacio).error, 'Escribí tu nombre completo, como figura en tu documento.');
  });
});

describe('nombre completo en la verificación', () => {
  test('sin nombre (o inválido) → 400 y no se guarda nada; con nombre → se guarda normalizado y ella lo ve', async () => {
    const c = await cuenta();
    let r = await c.subir({ ...(await FOTOS()), consentimiento: '1' });
    assert.equal(r.status, 400); assert.equal(r.body.error, 'Escribí tu nombre completo, como figura en tu documento.');
    r = await c.subir({ ...(await FOTOS()), consentimiento: '1', nombreCompleto: 'Ana 2' });
    assert.equal(r.status, 400); assert.match(r.body.error, /solo puede tener letras/);
    assert.equal((await filas(c.id)).length, 0);
    assert.equal((await c.yo()).perfil.verificacion, 'sin_enviar');

    r = await c.subir({ ...(await FOTOS()), consentimiento: '1', nombreCompleto: '  Zz   Lucía  Pérez ' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.deepEqual(await filas(c.id), [{ estado: 'pendiente', nombre_completo: 'Zz Lucía Pérez' }]);
    assert.equal(await nombreCuenta(c.id), null, 'hasta que se apruebe no queda en la cuenta');
    const yo = await c.yo();
    assert.equal(yo.perfil.ultimaVerificacion.nombreCompleto, 'Zz Lucía Pérez');
    assert.equal(yo.perfil.nombreCompleto, null);
    assert.equal(yo.perfil.datos.nombreCompleto, undefined, 'no va a los datos del perfil (que son públicos)');
  });

  test('admin: lo ve en la revisión, la ficha y el listado (también por búsqueda); aprobado → a la cuenta y fijo', async () => {
    const c = await cuenta();
    const nombre = 'Zz Romina ' + rand().replace(/\d/g, 'x');
    assert.equal((await c.subir({ ...(await FOTOS()), consentimiento: '1', nombreCompleto: nombre })).status, 201);
    let det = await adm('/acompanantes/' + c.id);
    assert.equal(det.verificaciones[0].nombreCompleto, nombre);
    assert.equal(det.cuenta.nombreCompleto, null);
    let lista = await adm('/acompanantes?q=' + encodeURIComponent(nombre));
    assert.equal(lista.items.length, 1); assert.equal(lista.items[0].cuentaId, c.id);
    assert.equal(lista.items[0].nombreCompleto, nombre); assert.equal(lista.items[0].nombreCompletoVerificado, false);

    assert.equal((await admPost(`/acompanantes/${c.id}/verificacion`, { decision: 'aprobar' })).status, 200);
    assert.equal(await nombreCuenta(c.id), nombre);
    det = await adm('/acompanantes/' + c.id);
    assert.equal(det.cuenta.nombreCompleto, nombre);
    lista = await adm('/acompanantes?q=' + encodeURIComponent(nombre));
    assert.equal(lista.items[0].nombreCompletoVerificado, true);
    assert.equal((await c.yo()).perfil.nombreCompleto, nombre);

    // Fijo: no puede mandar otra verificación ni cambiarlo editando el perfil
    const r = await c.subir({ ...(await FOTOS()), consentimiento: '1', nombreCompleto: 'Zz Otro Nombre' });
    assert.equal(r.status, 409);
    assert.equal((await c.put('/perfil', { displayName: 'Zz Artística', nombreCompleto: 'Zz Otro Nombre' })).status, 200);
    assert.equal(await nombreCuenta(c.id), nombre);
    assert.equal((await c.yo()).perfil.datos.nombreCompleto, undefined);
    // Aunque la verificación volviera a estar abierta, un envío nuevo conserva el nombre aprobado
    await db.query("UPDATE perfiles SET verificacion = 'rechazada' WHERE cuenta_id = $1", [c.id]);
    assert.equal((await c.subir({ ...(await FOTOS()), consentimiento: '1', nombreCompleto: 'Zz Otro Nombre' })).status, 201);
    assert.equal((await filas(c.id)).at(-1).nombre_completo, nombre);
    assert.equal((await c.subir({ ...(await FOTOS()), consentimiento: '1' })).status, 201, 'con nombre aprobado no hace falta mandarlo');
    assert.equal(await nombreCuenta(c.id), nombre);
  });

  test('rechazada: puede mandar otra con el nombre corregido', async () => {
    const c = await cuenta();
    await c.subir({ ...(await FOTOS()), consentimiento: '1', nombreCompleto: 'Zz Nombre Mal' });
    assert.equal((await admPost(`/acompanantes/${c.id}/verificacion`, { decision: 'rechazar', motivo: 'El nombre no coincide con el documento.' })).status, 200);
    assert.equal(await nombreCuenta(c.id), null);
    const yo = await c.yo();
    assert.equal(yo.perfil.verificacion, 'rechazada'); assert.equal(yo.perfil.ultimaVerificacion.nombreCompleto, 'Zz Nombre Mal');
    assert.ok(!yo.perfil.faltantesClaves.includes('verificacion'), '25/11/2026: la verificación ya no figura en lo que falta');
    assert.equal((await c.subir({ ...(await FOTOS()), consentimiento: '1', nombreCompleto: 'Zz Nombre Bien' })).status, 201);
    assert.equal((await admPost(`/acompanantes/${c.id}/verificacion`, { decision: 'aprobar' })).status, 200);
    assert.equal(await nombreCuenta(c.id), 'Zz Nombre Bien');
    assert.deepEqual((await filas(c.id)).map((f) => f.nombre_completo), ['Zz Nombre Mal', 'Zz Nombre Bien']);
  });

  test('la purga de las imágenes a los 90 días no borra el nombre', async () => {
    const c = await cuenta();
    await c.subir({ ...(await FOTOS()), consentimiento: '1', nombreCompleto: 'Zz Purga Prueba' });
    await admPost(`/acompanantes/${c.id}/verificacion`, { decision: 'aprobar' });
    await db.query("UPDATE verificaciones SET revisado = now() - interval '91 days' WHERE cuenta_id = $1", [c.id]);
    assert.ok(await instance.ctx.retencionVerif.purgar() >= 1);
    const v = (await db.query('SELECT archivos_borrados, selfie_ruta, nombre_completo FROM verificaciones WHERE cuenta_id = $1', [c.id])).rows[0];
    assert.ok(v.archivos_borrados); assert.equal(v.selfie_ruta, null);
    assert.equal(v.nombre_completo, 'Zz Purga Prueba');
    assert.equal(await nombreCuenta(c.id), 'Zz Purga Prueba');
    assert.equal((await adm('/acompanantes/' + c.id)).cuenta.nombreCompleto, 'Zz Purga Prueba');
  });

  test('formato anterior sin nombre: se revisa igual (—), no se le pide reenviar y al aprobar la cuenta queda sin nombre', async () => {
    const c = await cuenta();
    const selfie = await storage.guardarPrivado('verif', await jpeg(600, 800, { r: 1, g: 2, b: 3 }), 'jpg', 'selfie');
    const doc = await storage.guardarPrivado('verif', await jpeg(900, 600, { r: 3, g: 2, b: 1 }), 'jpg', 'doc');
    await db.query('INSERT INTO verificaciones (cuenta_id, selfie_ruta, documento_ruta, consentimiento_at) VALUES ($1, $2, $3, now())', [c.id, selfie, doc]);
    await db.query("UPDATE perfiles SET verificacion = 'pendiente' WHERE cuenta_id = $1", [c.id]);
    assert.ok(!(await c.yo()).perfil.faltantesClaves.includes('verificacion'));
    const det = await adm('/acompanantes/' + c.id);
    assert.equal(det.verificaciones[0].nombreCompleto, null);
    assert.equal((await admPost(`/acompanantes/${c.id}/verificacion`, { decision: 'aprobar' })).status, 200);
    assert.equal(await nombreCuenta(c.id), null);
  });
});

describe('nombre completo: nunca es público', () => {
  test('ni estado ni perfil público, ni HTML, ni vista previa, ni sitemap, ni el asistente', async () => {
    const c = await cuenta({ publicada: true });
    const nombre = 'Zz Secreta Legal ' + rand().replace(/\d/g, 'q');
    await db.query('UPDATE cuentas SET nombre_completo = $2 WHERE id = $1', [c.id, nombre]);
    await db.query("INSERT INTO verificaciones (cuenta_id, estado, nombre_completo, formato, revisado) VALUES ($1, 'aprobada', $2, 2, now())", [c.id, nombre]);
    invalidarSitio();
    const textos = [];
    const est = await fetch(BASE + '/api/sitio/estado'); assert.equal(est.status, 200);
    const estJ = await est.text(); assert.ok(estJ.includes(c.slug), 'el perfil está publicado'); textos.push(estJ);
    const pub = await fetch(BASE + '/api/sitio/perfil/' + c.slug); assert.equal(pub.status, 200); textos.push(await pub.text());
    const html = await fetch(BASE + '/perfil/' + c.slug); assert.equal(html.status, 200); textos.push(await html.text());
    const vp = await c.get('/api/cuenta/vista-previa'); assert.equal(vp.status, 200); textos.push(await vp.text());
    const sm = await fetch(BASE + '/sitemap.xml'); assert.equal(sm.status, 200); const xml = await sm.text(); assert.ok(xml.includes(c.slug)); textos.push(xml);
    for (const t of textos) {
      assert.ok(!t.includes(nombre), 'se filtró el nombre completo');
      assert.ok(!/nombreCompleto|nombre_completo/.test(t), 'se filtró el campo');
    }
    // Su panel sí lo muestra
    assert.equal((await c.yo()).perfil.nombreCompleto, nombre);
    // El asistente de WhatsApp no lee el nombre completo (estado de cuenta, ayuda, herramientas)
    for (const f of ['asistente.js', 'asistente-llm.js', 'asistente-ayuda.js', 'asistente-app.js']) {
      const src = await fs.readFile(path.join(HERE, '..', 'lib', f), 'utf8').catch(() => '');
      assert.ok(!/nombre_completo|nombreCompleto/.test(src), f);
      // Cuentas eliminadas (18/11/2026): el asistente lee solo fecha y motivo (ni email ni nombres)
      const lecturas = src.match(/SELECT[^`'"]*FROM cuentas_eliminadas/g) || [];
      for (const q of lecturas) assert.match(q, /^SELECT fecha, motivo FROM cuentas_eliminadas$/, f);
      if (f === 'asistente.js') assert.equal(lecturas.length, 1, 'la herramienta motivo_eliminacion');
    }
    assert.match(textoAyuda('verificacion', 'https://sexyrose.test'), /nombre completo, como figura en tu documento \(no se publica\)/);
  });
});

describe('panel: fecha de nacimiento y nombre fijos una vez verificados', () => {
  test('la fecha verificada se muestra como texto (dd/mm/aaaa), no como campo; el servidor sigue rechazando cambios', async () => {
    const src = await fs.readFile(path.join(HERE, '..', '..', 'mvp', 'src', 'prod-sitio.js'), 'utf8');
    const i = src.indexOf('function panelPerfil()');
    const bloque = src.slice(i, src.indexOf('</form>', i));
    assert.match(bloque, /locked\s*\?\s*`<div class="field"><span class="label">Fecha de nacimiento<\/span>\$\{datoFijo\('spPBirth', fechaDMA\(d\.fechaNacimiento\)\)\}<span class="hint">Ya fue verificada con tu documento\.<\/span><\/div>`/);
    assert.ok(!/readonly/.test(bloque), 'ya no es un campo de solo lectura');
    assert.match(src, /'Como figura en tu documento\. No se publica\.'/);
    assert.match(src, /name="nombreCompleto"/);
    // fechaDMA
    const m = /const fechaDMA = (\(f\) => \{[^\n]+\});/.exec(src);
    const fechaDMA = (0, eval)(m[1]);
    assert.equal(fechaDMA('1994-02-03'), '03/02/1994');
    // Servidor: con la verificación aprobada no cambia
    const c = await cuenta({ publicada: true });
    const r = await c.put('/perfil', { displayName: 'Zz Artística', fechaNacimiento: '1990-01-01' });
    assert.equal(r.status, 400); assert.match(r.body.error, /ya fue verificada con tu documento/);
    assert.equal((await c.put('/perfil', { displayName: 'Zz Artística' })).status, 200);
    assert.equal((await c.yo()).perfil.datos.fechaNacimiento, '1994-02-03');
  });

  test('CSS: los campos de fecha con el mismo alto que los demás y texto a la izquierda (iOS)', async () => {
    const css = await fs.readFile(path.join(HERE, '..', '..', 'mvp', 'src', 'app.css'), 'utf8');
    assert.match(css, /\.input\[type=date\][^{]*\{[^}]*appearance: none;[^}]*height: calc\(1\.5em \+ 24px\)/);
    assert.match(css, /::-webkit-date-and-time-value \{ text-align: left;/);
    const sitio = await fs.readFile(path.join(HERE, '..', '..', 'mvp', 'src', 'prod-sitio.js'), 'utf8');
    assert.match(sitio, /\.sp-2>\.field,\.sp-3>\.field\{align-content:start\}/);
  });
});
