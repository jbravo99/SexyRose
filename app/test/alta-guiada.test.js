// Alta guiada (decisión de Juan, 18/11/2026):
//  1. Envío automático a revisión (lib/revision-auto.js): ya no hay botón; apenas el perfil tiene todo lo obligatorio
//     pasa solo a 'en_revision', con el aviso por Telegram 'perfil_revisar' (uno solo, aunque lleguen guardados juntos).
//     Desde borrador siempre; desde rechazado solo cuando ella cambia algo; nunca desde los otros estados.
//  2. Primeros pasos (/panel/primeros-pasos, prod-sitio.js): guía paso a paso que se abre sola la primera vez
//     (GET /cuenta/yo → guia.abrir) y se cierra con "Seguir después" o "Listo" (POST /cuenta/guia/vista).
//   DATABASE_URL=postgres://... node --test test/alta-guiada.test.js
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import sharp from 'sharp';
import { start } from '../server.js';
import { AYUDA } from '../lib/asistente-ayuda.js';
import { plantillas } from '../lib/mail.js';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('Falta DATABASE_URL.'); process.exit(1); }
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..', '..', 'mvp', 'src');

const db = new pg.Pool({ connectionString: DATABASE_URL, max: 3 });
let instance; let BASE; let tmpData; let tmpPublic;
const avisos = []; // lo que iría a Telegram
const rand = () => crypto.randomBytes(4).toString('hex');
const sha = (t) => crypto.createHash('sha256').update(t).digest();
const revisar = () => avisos.filter((a) => a.tipo === 'perfil_revisar');
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

before(async () => {
  tmpData = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-data-'));
  tmpPublic = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-pub-'));
  await fs.writeFile(path.join(tmpPublic, 'index.html'), '<!doctype html><title>x</title>');
  instance = await start({ prelanzamientoPorDefecto: true,
    port: 0, host: '127.0.0.1', databaseUrl: DATABASE_URL, publicDir: tmpPublic, dataDir: tmpData, storage: 'local',
    adminUser: '', adminPassword: '', adminPath: '', ipHashSalt: 'sal', siteUrl: 'https://sexyrose.net',
    telegramToken: '', telegramChatId: '', mailgunApiKey: '', tareaPlanes: false, log: () => {}, dormirAuth: async () => {},
  });
  BASE = `http://127.0.0.1:${instance.port}`;
  await instance.ready;
  instance.ctx.notify = (texto, tipo) => { avisos.push({ texto, tipo }); };
});
after(async () => {
  await db.query("DELETE FROM cuentas WHERE email LIKE 'zzag-%@example.com'");
  await db.end();
  if (instance) await instance.close();
  await fs.rm(tmpData, { recursive: true, force: true });
  await fs.rm(tmpPublic, { recursive: true, force: true });
});

const DATOS_OK = { displayName: 'Zz Alta', genero: 'mujer', tipo: 'acompanante', fechaNacimiento: '1995-04-10', pais: 'argentina', provincia: 'provincia-de-cordoba', ciudad: 'cordoba', whatsapp: '+5493511234567' };
const jpeg = () => sharp({ create: { width: 500, height: 600, channels: 3, background: { r: 200, g: 60, b: 120 } } }).jpeg().toBuffer();

// Cuenta con sesión, armada directo en la base. fotos: cuántas filas de fotos (sin archivos: alcanza para contar).
async function cuenta({ datos = DATOS_OK, fotos = 3, email = true, verificacion = 'pendiente', estado = 'borrador', oculto = false, motivo = null } = {}) {
  const em = `zzag-${rand()}@example.com`;
  const { rows } = await db.query(`INSERT INTO cuentas (email, pass_hash, email_verificado) VALUES ($1, 'x', ${email ? 'now()' : 'NULL'}) RETURNING id`, [em]);
  const id = rows[0].id;
  await db.query('INSERT INTO perfiles (cuenta_id, slug, datos, estado, verificacion, oculto, motivo_rechazo) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [id, 'zzag-' + rand(), JSON.stringify(datos), estado, verificacion, oculto, motivo]);
  for (let i = 0; i < fotos; i++) {
    await db.query('INSERT INTO fotos (cuenta_id, orden, clave, url, url_mini, ancho, alto) VALUES ($1, $2, $3, $4, $4, 500, 600)', [id, i, `zzag/${id}-${i}`, `/media/zzag-${i}.webp`]);
  }
  const token = crypto.randomBytes(32).toString('base64url');
  await db.query("INSERT INTO sesiones (token_hash, cuenta_id, expira, ua) VALUES ($1, $2, now() + interval '1 day', '')", [sha(token), id]);
  const h = { origin: BASE, 'x-sr': '1', cookie: 'sr_sesion=' + token };
  const json = async (method, p, body) => {
    const r = await fetch(BASE + '/api/cuenta' + p, { method, headers: { ...h, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const subir = async (p, campos) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) { if (typeof v === 'string') fd.append(k, v); else fd.append(k, new Blob([v], { type: 'image/jpeg' }), 'x.jpg'); }
    const r = await fetch(BASE + '/api/cuenta' + p, { method: 'POST', headers: h, body: fd });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const estadoDb = async () => (await db.query('SELECT estado, motivo_rechazo FROM perfiles WHERE cuenta_id = $1', [id])).rows[0];
  return { id, email: em, json, subir, estadoDb, yo: async () => (await json('GET', '/yo')).body.cuenta };
}
const verifCampos = async () => ({ frente: await jpeg(), dorso: await jpeg(), selfie: await jpeg(), consentimiento: '1', nombreCompleto: 'Zz Alta Guiada' });

describe('envío automático a revisión (lib/revision-auto.js)', () => {
  test('al guardar el último dato obligatorio: pasa a revisión y avisa una vez', async () => {
    const { whatsapp, ...sin } = DATOS_OK;
    const a = await cuenta({ datos: sin });
    avisos.length = 0;
    let r = await a.json('PUT', '/perfil', { titular: 'Hola' });
    assert.equal(r.status, 200); assert.equal(r.body.cuenta.perfil.estado, 'borrador', 'sin contacto sigue en borrador');
    assert.deepEqual(r.body.cuenta.perfil.faltantesClaves, ['contacto']);
    r = await a.json('PUT', '/perfil', { whatsapp });
    assert.equal(r.status, 200); assert.equal(r.body.cuenta.perfil.estado, 'en_revision', 'la respuesta ya trae el estado nuevo');
    await esperar(30);
    assert.equal(revisar().length, 1);
    assert.equal(revisar()[0].texto, 'Hay un perfil nuevo para revisar en el admin.');
    // Otro guardado no vuelve a avisar
    await a.json('PUT', '/perfil', { titular: 'Otra cosa' });
    await esperar(30);
    assert.equal(revisar().length, 1);
    assert.equal((await a.estadoDb()).estado, 'en_revision');
  });

  test('al subir la tercera foto', async () => {
    const a = await cuenta({ fotos: 2 });
    avisos.length = 0;
    const r = await a.subir('/fotos', { foto: await jpeg() });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal((await a.estadoDb()).estado, 'en_revision');
    await esperar(30);
    assert.equal(revisar().length, 1);
  });

  test('al confirmar el email (link del email y cambio de contraseña)', async () => {
    const a = await cuenta({ email: false });
    avisos.length = 0;
    assert.equal((await a.yo()).perfil.estado, 'borrador', 'sin email confirmado no pasa');
    const tok = crypto.randomBytes(24).toString('base64url');
    await db.query("INSERT INTO tokens_email (token_hash, cuenta_id, tipo, expira) VALUES ($1, $2, 'verificar', now() + interval '1 hour')", [sha(tok), a.id]);
    const r = await fetch(BASE + '/api/cuenta/verificar-email', { method: 'POST', headers: { origin: BASE, 'x-sr': '1', 'content-type': 'application/json' }, body: JSON.stringify({ token: tok }) });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).cuenta.perfil.estado, 'en_revision');
    await esperar(30);
    assert.equal(revisar().length, 1);

    const b = await cuenta({ email: false });
    const t2 = crypto.randomBytes(24).toString('base64url');
    await db.query("INSERT INTO tokens_email (token_hash, cuenta_id, tipo, expira) VALUES ($1, $2, 'restablecer', now() + interval '1 hour')", [sha(t2), b.id]);
    const r2 = await fetch(BASE + '/api/cuenta/restablecer', { method: 'POST', headers: { origin: BASE, 'x-sr': '1', 'content-type': 'application/json' }, body: JSON.stringify({ token: t2, password: 'una-clave-nueva-123' }) });
    assert.equal(r2.status, 200);
    assert.equal((await b.estadoDb()).estado, 'en_revision');
  });

  test('al mandar la verificación de identidad (y el aviso de verificación sigue saliendo)', async () => {
    const a = await cuenta({ verificacion: 'sin_enviar' });
    avisos.length = 0;
    const r = await a.subir('/verificacion', await verifCampos());
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.cuenta.perfil.estado, 'en_revision');
    await esperar(30);
    assert.equal(revisar().length, 1);
    assert.equal(avisos.filter((x) => x.tipo === 'verificacion').length, 1);
  });

  test('guardados al mismo tiempo: una sola transición y un solo aviso', async () => {
    const { whatsapp, ...sin } = DATOS_OK;
    const a = await cuenta({ datos: sin });
    avisos.length = 0;
    const rs = await Promise.all(Array.from({ length: 6 }, (_, i) => a.json('PUT', '/perfil', { whatsapp, titular: 'Hola ' + i })));
    assert.ok(rs.every((r) => r.status === 200));
    assert.equal((await a.estadoDb()).estado, 'en_revision');
    await esperar(50);
    assert.equal(revisar().length, 1);
    // Fotos subidas en paralelo
    const b = await cuenta({ fotos: 1 });
    avisos.length = 0;
    const fs2 = await Promise.all([1, 2, 3].map(async () => b.subir('/fotos', { foto: await jpeg() })));
    assert.ok(fs2.every((r) => r.status === 201));
    assert.equal((await b.estadoDb()).estado, 'en_revision');
    await esperar(50);
    assert.equal(revisar().length, 1);
  });

  test('un borrador completo (de antes) pasa al abrir el panel; uno incompleto no', async () => {
    const a = await cuenta();
    avisos.length = 0;
    assert.equal((await a.yo()).perfil.estado, 'en_revision');
    const b = await cuenta({ fotos: 2 });
    assert.equal((await b.yo()).perfil.estado, 'borrador');
    await esperar(30);
    assert.equal(revisar().length, 1);
  });

  test('nunca desde publicado, en revisión, pausado, suspendido, oculto ni con la cuenta suspendida', async () => {
    avisos.length = 0;
    for (const estado of ['publicado', 'en_revision', 'pausado', 'suspendido']) {
      const a = await cuenta({ estado, fotos: 2 });
      if (estado !== 'suspendido') assert.equal((await a.subir('/fotos', { foto: await jpeg() })).status, 201);
      await a.json('PUT', '/perfil', { titular: 'x' });
      await a.yo();
      assert.equal((await a.estadoDb()).estado, estado, estado);
    }
    const o = await cuenta({ oculto: true, fotos: 2 });
    await o.subir('/fotos', { foto: await jpeg() });
    assert.equal((await o.estadoDb()).estado, 'borrador', 'oculto');
    const s = await cuenta({ email: false });
    await db.query("UPDATE cuentas SET estado = 'suspendida' WHERE id = $1", [s.id]);
    const tok = crypto.randomBytes(24).toString('base64url');
    await db.query("INSERT INTO tokens_email (token_hash, cuenta_id, tipo, expira) VALUES ($1, $2, 'verificar', now() + interval '1 hour')", [sha(tok), s.id]);
    await fetch(BASE + '/api/cuenta/verificar-email', { method: 'POST', headers: { origin: BASE, 'x-sr': '1', 'content-type': 'application/json' }, body: JSON.stringify({ token: tok }) });
    assert.equal((await s.estadoDb()).estado, 'borrador', 'cuenta suspendida');
    await esperar(30);
    assert.equal(revisar().length, 0);
  });

  test('publicado que pierde un requisito (queda con menos de 3 fotos): sigue publicado, como antes', async () => {
    const a = await cuenta({ estado: 'publicado', verificacion: 'verificada', fotos: 0 });
    for (let i = 0; i < 3; i++) assert.equal((await a.subir('/fotos', { foto: await jpeg() })).status, 201);
    const yo = await a.yo();
    const r = await a.json('DELETE', '/fotos/' + yo.perfil.fotos[0].id);
    assert.equal(r.status, 200);
    const yo2 = await a.yo();
    assert.equal(yo2.perfil.estado, 'publicado');
    assert.deepEqual(yo2.perfil.faltantesClaves, ['fotos'], 'el panel le muestra qué le falta');
  });

  test('rechazado: vuelve solo a revisión cuando ella cambia algo y está completo (mirar o guardar lo mismo no cuenta)', async () => {
    avisos.length = 0;
    const a = await cuenta({ estado: 'rechazado', motivo: 'La foto principal no se ve bien.' });
    assert.equal((await a.yo()).perfil.estado, 'rechazado', 'abrir el panel no lo manda');
    let r = await a.json('PUT', '/perfil', { whatsapp: DATOS_OK.whatsapp, displayName: DATOS_OK.displayName });
    assert.equal(r.body.cuenta.perfil.estado, 'rechazado', 'guardar lo mismo no cuenta como cambio');
    r = await a.json('PUT', '/perfil', { titular: 'Nuevo titular' });
    assert.equal(r.body.cuenta.perfil.estado, 'en_revision');
    assert.equal((await a.estadoDb()).motivo_rechazo, null, 'el motivo se borra, como en el envío a mano');
    await esperar(30);
    assert.equal(revisar().length, 1);
    // Con un cambio pero incompleto: sigue rechazado hasta que esté todo
    const b = await cuenta({ estado: 'rechazado', fotos: 3, motivo: 'Fotos borrosas.' });
    const yo = await b.yo();
    await b.json('DELETE', '/fotos/' + yo.perfil.fotos[0].id);
    assert.equal((await b.estadoDb()).estado, 'rechazado');
    await b.subir('/fotos', { foto: await jpeg() });
    assert.equal((await b.estadoDb()).estado, 'en_revision');
    // Ordenar las fotos también es un cambio
    const c = await cuenta({ estado: 'rechazado', motivo: 'Cambiá la principal.' });
    const ids = (await c.yo()).perfil.fotos.map((f) => f.id).reverse();
    assert.equal((await c.json('PUT', '/fotos/orden', { ids })).body.cuenta.perfil.estado, 'en_revision');
  });

  test('el endpoint viejo (pestaña abierta con el panel anterior) hace lo mismo, sin avisar dos veces', async () => {
    const { whatsapp, ...sin } = DATOS_OK;
    const a = await cuenta({ datos: sin });
    let r = await a.json('POST', '/perfil/enviar-revision', {});
    assert.equal(r.status, 400); assert.deepEqual(r.body.faltantes, ['Agregá tu WhatsApp o tu usuario de Telegram.']);
    avisos.length = 0;
    await a.json('PUT', '/perfil', { whatsapp });
    r = await a.json('POST', '/perfil/enviar-revision', {});
    assert.equal(r.status, 200); assert.equal(r.body.cuenta.perfil.estado, 'en_revision');
    await esperar(30);
    assert.equal(revisar().length, 1);
  });
});

describe('primeros pasos: cuándo se abre sola (GET /cuenta/yo → guia.abrir)', () => {
  test('cuenta nueva incompleta: se abre hasta que la cierra con "Seguir después" o "Listo"', async () => {
    const a = await cuenta({ datos: { displayName: 'Zz Nueva', genero: 'mujer', tipo: 'acompanante', fechaNacimiento: '1996-01-01', pais: 'argentina' }, fotos: 0, verificacion: 'sin_enviar' });
    let yo = await a.yo();
    assert.deepEqual(yo.guia, { abrir: true });
    assert.deepEqual(yo.perfil.faltantesClaves, ['ubicacion', 'contacto', 'fotos', 'verificacion'], 'los pasos salen de acá: empieza en Tus datos');
    assert.equal((await a.json('POST', '/guia/vista', {})).status, 200);
    yo = await a.yo();
    assert.deepEqual(yo.guia, { abrir: false });
    const { rows } = await db.query('SELECT guia_vista FROM cuentas WHERE id = $1', [a.id]);
    assert.ok(rows[0].guia_vista);
    // Retoma en el primer paso sin completar: con los datos guardados, lo que falta empieza por las fotos
    await a.json('PUT', '/perfil', { provincia: 'provincia-de-cordoba', ciudad: 'cordoba', whatsapp: '+5493511234567' });
    assert.deepEqual((await a.yo()).perfil.faltantesClaves, ['fotos', 'verificacion']);
  });

  test('completas, en revisión, publicadas o rechazadas: nunca', async () => {
    for (const o of [{}, { estado: 'en_revision' }, { estado: 'publicado', verificacion: 'verificada' }, { estado: 'publicado', fotos: 1 }, { estado: 'rechazado', fotos: 1 }]) {
      const a = await cuenta(o);
      assert.equal((await a.yo()).guia.abrir, false, JSON.stringify(o));
    }
  });

  test('sin sesión de acompañante no hay guía (las cuentas de clientes no usan /api/cuenta)', async () => {
    const r = await fetch(BASE + '/api/cuenta/yo', { headers: { origin: BASE } });
    assert.equal(r.status, 401);
    const v = await fetch(BASE + '/api/cuenta/guia/vista', { method: 'POST', headers: { origin: BASE, 'x-sr': '1', 'content-type': 'application/json' }, body: '{}' });
    assert.equal(v.status, 401);
  });

  test('la dirección /panel/primeros-pasos se sirve con la home provisoria prendida y fuera de los buscadores', async () => {
    const r = await fetch(BASE + '/panel/primeros-pasos/fotos', { redirect: 'manual' });
    assert.notEqual(r.status, 302, 'el panel sigue abierto con la home provisoria');
    if (r.status === 200) assert.match(r.headers.get('x-robots-tag') || '', /noindex/);
  });
});

describe('textos y panel (prod-sitio.js)', () => {
  const sitio = () => fs.readFile(path.join(SRC, 'prod-sitio.js'), 'utf8');
  const trozo = (s, desde, hasta) => { const i = s.indexOf(desde); assert.ok(i >= 0, desde); const j = s.indexOf(hasta, i); assert.ok(j > i, hasta); return s.slice(i, j + hasta.length); };

  test('ningún texto para la acompañante pide "Enviar a revisión"', async () => {
    const s = await sitio();
    assert.doesNotMatch(s, /Enviar a revisi[oó]n|envialo a revisi[oó]n|volvé a enviarlo|spEnviarRevision|enviar-revision/i);
    for (const t of Object.values(AYUDA)) assert.doesNotMatch(t, /Enviar a revisi[oó]n|Enviá tu perfil a revisi|volvé a enviarlo/i);
    assert.match(AYUDA.publicar, /pasa solo a revisión/);
    assert.match(AYUDA.registro, /pasa solo a revisión/);
    const m = plantillas.perfilRechazado({ nombre: 'Ana', motivo: 'x', url: 'https://sexyrose.net/panel' });
    assert.doesNotMatch(JSON.stringify(m), /volvé a enviarlo/);
    const adm = await fs.readFile(path.join(HERE, '..', 'routes', 'admin-fase1.js'), 'utf8');
    assert.doesNotMatch(adm, /envíes a revisión|enviarlo a revisión/);
    const asis = await fs.readFile(path.join(HERE, '..', 'lib', 'asistente.js'), 'utf8');
    assert.doesNotMatch(asis, /no se envió a revisión/);
  });

  test('estados: borrador y rechazado explican que pasa solo, con su inglés y portugués', async () => {
    const s = await sitio();
    const E = trozo(s, '  const ESTADO_PERFIL = {', '\n  };\n');
    const ctx = {}; vm.createContext(ctx); vm.runInContext(E + 'this.E = ESTADO_PERFIL;', ctx);
    assert.equal(ctx.E.borrador[2], 'Completá lo que falta y tu perfil pasa solo a revisión. Nadie lo ve todavía.');
    assert.match(ctx.E.rechazado[2], /vuelve solo a revisión/);
    for (const t of [ctx.E.borrador[2], ctx.E.rechazado[2], 'Seguir con los pasos', 'Primeros pasos', 'Seguir después', 'Paso {n} de {n}', 'Enviar y seguir', 'Te falta:', 'Te falta poco']) {
      assert.ok(s.includes(`'${t}': ['`), 'falta traducción: ' + t);
    }
  });

  test('ruta, apertura una vez por carga y retomar en el primer paso sin completar', async () => {
    const s = await sitio();
    assert.ok(s.includes("if (b === 'primeros-pasos' && parts.length <= 3) return guiaView(parts[2]);"));
    const ov = trozo(s, '  function ownView(parts) {', '\n  }\n');
    assert.ok(ov.indexOf("if (!S.yo) {") < ov.indexOf('S.yo.guia && S.yo.guia.abrir && !S.guiaVista'), 'solo con la sesión de una acompañante');
    assert.match(s, /esGuia\(key\) \? 'Primeros pasos'/);
    // guiaPasos + guiaProximo con datos del servidor
    const f = trozo(s, '  const GUIA_DATOS = [', '; };');
    const ctx = { S: null }; vm.createContext(ctx);
    vm.runInContext(f + '\nthis.pasos = guiaPasos; this.prox = guiaProximo;', ctx);
    const yo = (claves, email = true) => { ctx.S = Object.assign(ctx.S || {}, { yo: { id: 'A', emailVerificado: email, perfil: { faltantesClaves: claves } } }); vm.runInContext('S = this.S', ctx); };
    vm.runInContext('var S = this.S;', ctx);
    yo(['ubicacion', 'contacto', 'fotos', 'verificacion']);
    assert.deepEqual([...ctx.pasos().map((x) => x.id)], ['datos', 'fotos', 'verificacion', 'listo'], 'sin el paso del email si ya está confirmado');
    assert.equal(ctx.prox(ctx.pasos()), 'datos');
    yo(['fotos', 'verificacion']);
    assert.equal(ctx.prox(ctx.pasos()), 'fotos', 'retoma en el primero sin completar');
    assert.equal(ctx.prox(ctx.pasos(), 'fotos'), 'verificacion');
    yo(['email', 'verificacion'], false);
    assert.deepEqual([...ctx.pasos().map((x) => x.id)], ['datos', 'fotos', 'verificacion', 'email', 'listo']);
    assert.equal(ctx.prox(ctx.pasos(), 'verificacion'), 'email');
    yo([], true);
    assert.deepEqual([...ctx.pasos().map((x) => x.id)], ['datos', 'fotos', 'verificacion', 'email', 'listo'], 'el paso del email queda (hecho) si lo confirmó en el medio');
    assert.equal(ctx.prox(ctx.pasos()), 'listo');
  });

  test('Resumen, Mi perfil y la barra lateral muestran qué falta con "Completar"; sin botón de envío', async () => {
    const s = await sitio();
    const res = trozo(s, '  function panelResumen() {', '\n  }\n');
    assert.ok(res.includes('${f.length ? faltaCard(p) : \'\'}'));
    assert.doesNotMatch(res, /data-action="spEnviar/);
    const card = trozo(s, '  function faltaCard(p) {', '\n  }\n');
    assert.ok(card.includes('faltaLista(p)') && card.includes('Seguir con los pasos'));
    const aviso = trozo(s, '  function yoAviso() {', '\n  }\n');
    assert.ok(aviso.includes('faltaLista(p, true)'), 'Mi perfil: lo que falta con Completar');
    assert.ok(s.includes('${ladoFalta(p)}'), 'barra lateral');
    // Fuera del panel, "Completar" del email lleva al Resumen (ahí está el aviso con "Reenviar")
    const cb = trozo(s, '  function completarBtn(clave, fuera) {', '\n  }\n');
    assert.ok(cb.includes("if (fuera && !x.tab) x = { tab: 'resumen', campo: x.campo };"));
  });
});
