// Verificación de identidad en tres fotos (17/11/2026): frente y dorso del documento y selfie sosteniéndolo.
// También: las pendientes del formato anterior (selfie + frente) se siguen revisando, y "Completar" del panel
// (faltantesClaves en GET /api/cuenta/yo).
//   DATABASE_URL=postgres://... node --test test/verificacion-tres-fotos.test.js
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import sharp from 'sharp';
import { start } from '../server.js';
import { faltantesItems, faltantesDe } from '../lib/perfiles.js';
import * as storage from '../lib/storage.js';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('Falta DATABASE_URL.'); process.exit(1); }

const db = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
const A = '/panel-verif-tres-0123456789';
const USER = 'admin-v3';
const PASS = 'clave-de-prueba-larga-v3-123';
let instance; let BASE; let tmpData; let tmpPublic;
const rand = () => crypto.randomBytes(4).toString('hex');

before(async () => {
  tmpData = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-v3-data-'));
  tmpPublic = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-v3-pub-'));
  await fs.writeFile(path.join(tmpPublic, 'index.html'), '<!doctype html><title>x</title>');
  instance = await start({ prelanzamientoPorDefecto: false,
    port: 0, host: '127.0.0.1', databaseUrl: DATABASE_URL, publicDir: tmpPublic, dataDir: tmpData, storage: 'local',
    sitioSpaPath: path.join(tmpPublic, 'no-existe.html'), adminPath: A, adminUser: USER, adminPassword: PASS, ipHashSalt: 'sal-v3',
    siteUrl: 'https://sexyrose.net', telegramToken: '', telegramChatId: '', mailgunApiKey: '', log: () => {}, tareaPlanes: false,
  });
  BASE = `http://127.0.0.1:${instance.port}`;
  await instance.ready;
});

after(async () => {
  await db.query("DELETE FROM cuentas WHERE email LIKE 'zzv3-%@example.com'");
  await db.end();
  if (instance) await instance.close();
  await fs.rm(tmpData, { recursive: true, force: true });
  await fs.rm(tmpPublic, { recursive: true, force: true });
});

const basic = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
const adm = (p) => fetch(BASE + A + '/api' + p, { headers: { authorization: basic } });
const admPost = async (p, body) => {
  const r = await fetch(BASE + A + '/api' + p, {
    method: 'POST', body: JSON.stringify(body ?? {}),
    headers: { authorization: basic, 'content-type': 'application/json', 'x-sr-admin': '1', origin: BASE },
  });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const jpeg = (w, h, color) => sharp({ create: { width: w, height: h, channels: 3, background: color } })
  .jpeg().withExif({ IFD0: { Copyright: 'dato-secreto-exif', Artist: 'gps-test' } }).toBuffer();

// Cuenta nueva con sesión (fila en sesiones + cookie sr_sesion, como la que crea el login)
async function cuenta() {
  const id = crypto.randomUUID();
  await db.query("INSERT INTO cuentas (id, email, pass_hash, acepto_terminos, mayor_edad_declarada) VALUES ($1, $2, 'x', now(), true)", [id, `zzv3-${rand()}@example.com`]);
  await db.query("INSERT INTO perfiles (cuenta_id, slug, datos) VALUES ($1, $2, $3::jsonb)", [id, 'zzv3-' + rand(), JSON.stringify({ displayName: 'Zz V3', genero: 'mujer', fechaNacimiento: '1994-02-03' })]);
  const t = crypto.randomBytes(24).toString('hex');
  await db.query("INSERT INTO sesiones (token_hash, cuenta_id, expira) VALUES (sha256($1::bytea), $2, now() + interval '1 hour')", [Buffer.from(t), id]);
  const ip = `2001:db8:${rand().slice(0, 4)}::${rand().slice(0, 4)}`;
  const headers = () => ({ origin: BASE, 'x-sr': '1', 'cf-connecting-ip': ip, cookie: 'sr_sesion=' + t });
  return {
    id,
    async subir(campos) {
      const fd = new FormData();
      for (const [k, v] of Object.entries(campos)) {
        if (typeof v === 'string') fd.append(k, v); else fd.append(k, new Blob([v], { type: 'image/jpeg' }), 'x.jpg');
      }
      const r = await fetch(BASE + '/api/cuenta/verificacion', { method: 'POST', headers: headers(), body: fd });
      return { status: r.status, body: await r.json().catch(() => null) };
    },
    async yo() { return (await (await fetch(BASE + '/api/cuenta/yo', { headers: headers() })).json()).cuenta; },
  };
}
const FRENTE = () => jpeg(900, 600, { r: 30, g: 30, b: 200 });
const DORSO = () => jpeg(900, 600, { r: 200, g: 200, b: 30 });
const SELFIE = () => jpeg(600, 800, { r: 10, g: 200, b: 30 });
const NOMBRE = 'Zz Verónica Prueba';
const existe = (rel) => fs.stat(path.join(tmpData, 'privado', rel)).then(() => true, () => false);

describe('verificación en tres fotos', () => {
  test('falta una foto → 400 y no se guarda nada; las tres → 201, privadas y sin EXIF', async () => {
    const c = await cuenta();
    for (const campos of [
      { frente: await FRENTE(), dorso: await DORSO() },
      { frente: await FRENTE(), selfie: await SELFIE() },
      { dorso: await DORSO(), selfie: await SELFIE() },
      { selfie: await SELFIE(), documento: await FRENTE() }, // lo que mandaba el panel de antes
    ]) {
      const r = await c.subir({ ...campos, consentimiento: '1', nombreCompleto: NOMBRE });
      assert.equal(r.status, 400, JSON.stringify(Object.keys(campos)));
      assert.equal(r.body.error, 'Subí las tres fotos: el frente y el dorso de tu documento y una selfie sosteniéndolo.');
    }
    assert.equal((await db.query('SELECT 1 FROM verificaciones WHERE cuenta_id = $1', [c.id])).rows.length, 0);
    const sinOk = await c.subir({ frente: await FRENTE(), dorso: await DORSO(), selfie: await SELFIE() });
    assert.equal(sinOk.status, 400); assert.match(sinOk.body.error, /aceptar el uso de tu documento/);

    // (5 envíos por día por cuenta: el bueno va en otra cuenta)
    const b = await cuenta();
    const r = await b.subir({ frente: await FRENTE(), dorso: await DORSO(), selfie: await SELFIE(), consentimiento: '1', nombreCompleto: NOMBRE });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.cuenta.perfil.verificacion, 'pendiente');
    const { rows } = await db.query('SELECT selfie_ruta, documento_ruta, dorso_ruta, formato FROM verificaciones WHERE cuenta_id = $1', [b.id]);
    assert.equal(rows.length, 1); assert.equal(rows[0].formato, 2);
    assert.match(rows[0].documento_ruta, /^verif\/[0-9a-f]{32}-doc\.jpg$/);
    assert.match(rows[0].dorso_ruta, /^verif\/[0-9a-f]{32}-dorso\.jpg$/);
    assert.match(rows[0].selfie_ruta, /^verif\/[0-9a-f]{32}-selfie\.jpg$/);
    for (const rel of [rows[0].documento_ruta, rows[0].dorso_ruta, rows[0].selfie_ruta]) {
      const abs = path.join(tmpData, 'privado', rel);
      assert.equal((await fs.stat(abs)).mode & 0o077, 0, 'permisos solo del dueño');
      assert.equal((await sharp(await fs.readFile(abs)).metadata()).exif, undefined, 'sin EXIF');
      for (const u of ['/media/' + rel, '/privado/' + rel, '/media/../privado/' + rel]) assert.notEqual((await fetch(BASE + u)).status, 200, u);
    }
    // "documento" sigue valiendo como nombre del frente
    const c2 = await cuenta();
    assert.equal((await c2.subir({ documento: await FRENTE(), dorso: await DORSO(), selfie: await SELFIE(), consentimiento: '1', nombreCompleto: NOMBRE })).status, 201);
  });

  test('reenviar reemplaza la pendiente y borra sus tres archivos', async () => {
    const c = await cuenta();
    await c.subir({ frente: await FRENTE(), dorso: await DORSO(), selfie: await SELFIE(), consentimiento: '1', nombreCompleto: NOMBRE });
    const antes = (await db.query('SELECT selfie_ruta, documento_ruta, dorso_ruta FROM verificaciones WHERE cuenta_id = $1', [c.id])).rows[0];
    assert.equal((await c.subir({ frente: await FRENTE(), dorso: await DORSO(), selfie: await SELFIE(), consentimiento: '1', nombreCompleto: NOMBRE })).status, 201);
    assert.equal((await db.query('SELECT 1 FROM verificaciones WHERE cuenta_id = $1', [c.id])).rows.length, 1);
    for (const rel of Object.values(antes)) assert.equal(await existe(rel), false, rel);
  });

  test('el admin ve las tres fotos, aprueba, se recomprimen y la purga de los 3 meses borra las tres', async () => {
    const c = await cuenta();
    await c.subir({ frente: await FRENTE(), dorso: await DORSO(), selfie: await SELFIE(), consentimiento: '1', nombreCompleto: NOMBRE });
    const det = await (await adm('/acompanantes/' + c.id)).json();
    const v = det.verificaciones[0];
    assert.equal(v.formato, 2); assert.ok(v.tieneDocumento && v.tieneDorso && v.tieneSelfie);
    for (const archivo of ['documento', 'dorso', 'selfie']) {
      const r = await adm(`/verificaciones/${v.id}/${archivo}`);
      assert.equal(r.status, 200, archivo); assert.equal(r.headers.get('content-type'), 'image/jpeg');
      assert.match(r.headers.get('cache-control'), /no-store/);
      assert.equal((await sharp(Buffer.from(await r.arrayBuffer())).metadata()).format, 'jpeg');
      assert.equal((await fetch(BASE + A + `/api/verificaciones/${v.id}/${archivo}`)).status, 401, 'sin Basic Auth no sale');
    }
    assert.equal((await adm(`/verificaciones/${v.id}/otro`)).status, 404);
    assert.equal((await admPost(`/acompanantes/${c.id}/verificacion`, { decision: 'aprobar' })).status, 200);

    let fila = (await db.query('SELECT id, selfie_ruta, documento_ruta, dorso_ruta, comprimido FROM verificaciones WHERE cuenta_id = $1', [c.id])).rows[0];
    assert.ok(fila.comprimido, 'al decidir se recomprime');
    const rutas = [fila.selfie_ruta, fila.documento_ruta, fila.dorso_ruta];
    for (const rel of rutas) assert.equal(await existe(rel), true);
    await db.query("UPDATE verificaciones SET revisado = now() - interval '89 days' WHERE id = $1", [fila.id]);
    await instance.ctx.retencionVerif.purgar();
    for (const rel of rutas) assert.equal(await existe(rel), true, 'antes de los 3 meses no borra');
    await db.query("UPDATE verificaciones SET revisado = now() - interval '91 days' WHERE id = $1", [fila.id]);
    assert.ok(await instance.ctx.retencionVerif.purgar() >= 1);
    for (const rel of rutas) assert.equal(await existe(rel), false, 'borrada: ' + rel);
    fila = (await db.query('SELECT estado, selfie_ruta, documento_ruta, dorso_ruta, archivos_borrados FROM verificaciones WHERE id = $1', [fila.id])).rows[0];
    assert.equal(fila.estado, 'aprobada'); assert.ok(fila.archivos_borrados);
    assert.equal(fila.selfie_ruta, null); assert.equal(fila.documento_ruta, null); assert.equal(fila.dorso_ruta, null);
    const det2 = await (await adm('/acompanantes/' + c.id)).json();
    assert.ok(det2.verificaciones[0].archivosBorrados && !det2.verificaciones[0].tieneDorso);
    assert.equal((await adm(`/verificaciones/${v.id}/dorso`)).status, 404);
  });

  test('formato anterior (selfie + frente, sin dorso): pendiente, se ve en el admin, no se le pide reenviar y se aprueba igual', async () => {
    const c = await cuenta();
    // Como quedaron las de antes de la migración 230: formato 1, sin dorso
    const selfie = await storage.guardarPrivado('verif', await SELFIE(), 'jpg', 'selfie');
    const doc = await storage.guardarPrivado('verif', await FRENTE(), 'jpg', 'doc');
    await db.query('INSERT INTO verificaciones (cuenta_id, selfie_ruta, documento_ruta, consentimiento_at) VALUES ($1, $2, $3, now())', [c.id, selfie, doc]);
    await db.query("UPDATE perfiles SET verificacion = 'pendiente' WHERE cuenta_id = $1", [c.id]);
    const yo = await c.yo();
    assert.equal(yo.perfil.verificacion, 'pendiente');
    assert.ok(!yo.perfil.faltantesClaves.includes('verificacion'), 'no se le pide que la mande de nuevo');
    const v = (await (await adm('/acompanantes/' + c.id)).json()).verificaciones[0];
    assert.equal(v.formato, 1); assert.equal(v.tieneSelfie, true); assert.equal(v.tieneDocumento, true); assert.equal(v.tieneDorso, false);
    assert.equal((await adm(`/verificaciones/${v.id}/selfie`)).status, 200);
    assert.equal((await adm(`/verificaciones/${v.id}/documento`)).status, 200);
    assert.equal((await adm(`/verificaciones/${v.id}/dorso`)).status, 404);
    // Rechazada: ahí sí tiene que mandar las tres
    assert.equal((await admPost(`/acompanantes/${c.id}/verificacion`, { decision: 'rechazar', motivo: 'El documento no se lee completo.' })).status, 200);
    assert.ok((await c.yo()).perfil.faltantesClaves.includes('verificacion'));
    await db.query("UPDATE verificaciones SET revisado = now() - interval '91 days' WHERE cuenta_id = $1", [c.id]);
    assert.ok(await instance.ctx.retencionVerif.purgar() >= 1, 'la purga no se traba con el dorso vacío');
    assert.equal(await existe(selfie), false); assert.equal(await existe(doc), false);
  });
});

describe('"Completar" en Para publicar te falta', () => {
  test('cada cosa que falta trae su clave, en el mismo orden que el texto', async () => {
    const todo = faltantesItems({});
    assert.deepEqual(todo.map((x) => x.clave), ['email', 'nombre', 'genero', 'nacimiento', 'ubicacion', 'contacto', 'fotos', 'verificacion']);
    assert.deepEqual(faltantesDe({}), todo.map((x) => x.texto));
    assert.deepEqual(faltantesItems({ datos: { displayName: 'x', genero: 'mujer', fechaNacimiento: '1990-01-01', provincia: 'p', ciudad: 'c', whatsapp: '+54' }, fotosN: 3, emailVerificado: true, verificacion: 'pendiente' }), []);
    const c = await cuenta();
    const p = (await c.yo()).perfil;
    assert.equal(p.faltantesClaves.length, p.faltantes.length);
    assert.deepEqual(p.faltantesClaves, ['email', 'ubicacion', 'contacto', 'fotos', 'verificacion']);
  });
});
