// Pruebas de integración de la Fase 1: cuentas (agente A) + planes y admin (agente B) en un mismo servidor.
//   DATABASE_URL=postgres://... node --test test/fase1-integracion.test.js
// Recorrido real: registro → email → perfil → fotos → verificación → revisión → admin aprueba → sitio público,
// créditos por WhatsApp confirmados por el admin y plan efectivo (semana de Oro pagada con créditos sobre Plata mensual).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import sharp from 'sharp';
import { start } from '../server.js';
import { mailsEnviados } from '../lib/mail.js';
import { invalidarSitio } from '../routes/sitio.js';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('Falta DATABASE_URL.'); process.exit(1); }

const db = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
const A = '/panel-integracion-fase1-0123456789';
const USER = 'admin-int';
const PASS = 'clave-de-prueba-larga-456';
let instance; let BASE; let tmpData; let tmpPublic;
const rand = () => crypto.randomBytes(4).toString('hex');

before(async () => {
  tmpData = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-int-data-'));
  tmpPublic = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-int-pub-'));
  await fs.writeFile(path.join(tmpPublic, 'index.html'), '<!doctype html><title>x</title>');
  instance = await start({
    port: 0, host: '127.0.0.1', databaseUrl: DATABASE_URL, publicDir: tmpPublic, dataDir: tmpData, storage: 'local',
    adminPath: A, adminUser: USER, adminPassword: PASS, ipHashSalt: 'sal-int', siteUrl: 'https://sexyrose.net',
    telegramToken: '', telegramChatId: '', mailgunApiKey: '', log: () => {}, tareaPlanes: false,
  });
  BASE = `http://127.0.0.1:${instance.port}`;
  await instance.ready;
});

after(async () => {
  await db.query("DELETE FROM cuentas WHERE email LIKE 'zzint-%@example.com'");
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

class Cliente {
  constructor() { this.cookie = ''; this.ip = `2001:db8:${rand().slice(0, 4)}::${rand().slice(0, 4)}`; }
  headers(extra = {}) { return { origin: BASE, 'x-sr': '1', 'cf-connecting-ip': this.ip, ...(this.cookie ? { cookie: this.cookie } : {}), ...extra }; }
  guardar(r) {
    for (const c of r.headers.getSetCookie ? r.headers.getSetCookie() : []) {
      const m = /^sr_sesion=([^;]*)/.exec(c);
      if (m) this.cookie = m[1] ? `sr_sesion=${m[1]}` : '';
    }
    return r;
  }
  async json(method, p, body) {
    const r = this.guardar(await fetch(BASE + p, { method, headers: this.headers({ 'content-type': 'application/json' }), body: body === undefined ? undefined : JSON.stringify(body) }));
    return { status: r.status, body: await r.json().catch(() => null) };
  }
  async get(p) { const r = await fetch(BASE + p, { headers: this.headers() }); return { status: r.status, body: await r.json().catch(() => null) }; }
  async subir(p, campos) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) {
      if (typeof v === 'string') fd.append(k, v); else fd.append(k, new Blob([v], { type: 'image/jpeg' }), 'x.jpg');
    }
    const r = this.guardar(await fetch(BASE + p, { method: 'POST', headers: this.headers(), body: fd }));
    return { status: r.status, body: await r.json().catch(() => null) };
  }
}

const jpeg = (color = { r: 200, g: 60, b: 120 }) => sharp({ create: { width: 640, height: 800, channels: 3, background: color } }).jpeg().toBuffer();
const tokenDe = (email, ruta) => {
  const m = [...mailsEnviados].reverse().find((x) => x.to === email && x.links.some((l) => l.includes(ruta)));
  return m ? new URL(m.links.find((l) => l.includes(ruta))).searchParams.get('token') : null;
};

// Cuenta completa en revisión, lista para que el admin la apruebe.
async function cuentaEnRevision() {
  const c = new Cliente();
  const email = `zzint-${rand()}@example.com`;
  let r = await c.json('POST', '/api/cuenta/registro', {
    email, password: 'una-clave-larga-123', displayName: `Zz Int ${rand()}`, fechaNacimiento: '1994-02-03', genero: 'mujer', aceptaTerminos: true, mayorEdad: true,
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  c.id = r.body.cuenta.id; c.email = email;
  r = await new Cliente().json('POST', '/api/cuenta/verificar-email', { token: tokenDe(email, '/cuenta/verificar') });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await c.json('PUT', '/api/cuenta/perfil', { provincia: 'provincia-de-cordoba', ciudad: 'cordoba', whatsapp: '+5493511234567', titular: 'Café y museos' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  for (let i = 0; i < 3; i++) assert.equal((await c.subir('/api/cuenta/fotos', { foto: await jpeg() })).status, 201);
  c.selfie = await jpeg({ r: 10, g: 200, b: 30 });
  r = await c.subir('/api/cuenta/verificacion', { selfie: c.selfie, documento: await jpeg({ r: 30, g: 30, b: 200 }), consentimiento: '1' });
  assert.ok(r.status === 200 || r.status === 201, JSON.stringify(r.body));
  r = await c.json('POST', '/api/cuenta/perfil/enviar-revision', {});
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.cuenta.perfil.estado, 'en_revision');
  return c;
}

const estadoPublico = async () => { invalidarSitio(); return (await new Cliente().get('/api/sitio/estado')).body; };

describe('integración cuentas + admin + planes', () => {
  test('registro → verificación → el admin ve la selfie, aprueba → publicado en /api/sitio/estado con plan E', async () => {
    const c = await cuentaEnRevision();
    let e = await estadoPublico();
    assert.ok(!e.perfiles.some((p) => p.cuentaId === c.id), 'en revisión no se publica');

    const lista = await (await adm('/acompanantes?estado=verificacion_pendiente')).json();
    assert.ok(lista.items.some((x) => x.cuentaId === c.id));
    const det = await (await adm(`/acompanantes/${c.id}`)).json();
    const v = det.verificaciones[0];
    assert.ok(v && v.tieneSelfie && v.tieneDocumento);
    const sf = await adm(`/verificaciones/${v.id}/selfie`);
    assert.equal(sf.status, 200);
    assert.equal(sf.headers.get('content-type'), 'image/jpeg');
    assert.match(sf.headers.get('cache-control') || '', /no-store/);
    const meta = await sharp(Buffer.from(await sf.arrayBuffer())).metadata();
    assert.ok(meta.width > 0 && meta.format === 'jpeg', 'la selfie que sube A se transmite por el admin de B');
    assert.equal((await fetch(BASE + A + `/api/verificaciones/${v.id}/selfie`)).status, 401, 'sin Basic Auth no sale');

    const ap = await admPost(`/acompanantes/${c.id}/verificacion`, { decision: 'aprobar' });
    assert.equal(ap.status, 200, JSON.stringify(ap.body));
    assert.equal(ap.body.perfil.estado, 'publicado');
    const mail = [...mailsEnviados].reverse().find((m) => m.to === c.email);
    assert.match(mail.subject, /publicado/i);

    e = await estadoPublico();
    const p = e.perfiles.find((x) => x.cuentaId === c.id);
    assert.ok(p, 'aparece en el sitio público');
    assert.equal(p.plan, 'E');
    assert.equal(p.fotos.length, 3);
    const yo = (await c.get('/api/cuenta/yo')).body.cuenta;
    assert.equal(yo.plan.efectivo, 'E');
    assert.equal(yo.limites.fotos, 8);

    // Retención: al decidir se recomprime; a los 3 meses de la decisión se borran selfie y documento.
    let fila = (await db.query('SELECT id, selfie_ruta, documento_ruta, comprimido, archivos_borrados FROM verificaciones WHERE cuenta_id = $1', [c.id])).rows[0];
    assert.ok(fila.comprimido, 'recomprimida al decidir');
    const absS = path.join(tmpData, 'privado', fila.selfie_ruta); const absD = path.join(tmpData, 'privado', fila.documento_ruta);
    const m2 = await sharp(await fs.readFile(absS)).metadata();
    assert.ok(m2.format === 'jpeg' && m2.width <= 1280 && m2.height <= 1280);
    assert.equal(await instance.ctx.retencionVerif.purgar(), 0, 'antes de los 3 meses no borra nada');
    await db.query("UPDATE verificaciones SET revisado = now() - interval '89 days' WHERE id = $1", [fila.id]);
    assert.equal(await instance.ctx.retencionVerif.purgar(), 0);
    await db.query("UPDATE verificaciones SET revisado = now() - interval '91 days' WHERE id = $1", [fila.id]);
    assert.equal(await instance.ctx.retencionVerif.purgar(), 1);
    assert.equal(await instance.ctx.retencionVerif.purgar(), 0, 'idempotente');
    fila = (await db.query('SELECT estado, selfie_ruta, documento_ruta, archivos_borrados FROM verificaciones WHERE id = $1', [fila.id])).rows[0];
    assert.equal(fila.estado, 'aprobada'); assert.equal(fila.selfie_ruta, null); assert.equal(fila.documento_ruta, null); assert.ok(fila.archivos_borrados);
    await assert.rejects(fs.stat(absS)); await assert.rejects(fs.stat(absD));
    const det2 = await (await adm(`/acompanantes/${c.id}`)).json();
    assert.ok(det2.verificaciones[0].archivosBorrados && !det2.verificaciones[0].tieneSelfie);
    assert.equal((await adm(`/verificaciones/${v.id}/selfie`)).status, 404);
    assert.equal((await c.get('/api/cuenta/yo')).body.cuenta.perfil.verificacion, 'verificada', 'la cuenta sigue verificada');
  });

  test('créditos por WhatsApp → el admin confirma → paga Plata y una semana de Oro con créditos; la semana termina y vuelve a Plata', async () => {
    const c = await cuentaEnRevision();
    assert.equal((await admPost(`/acompanantes/${c.id}/verificacion`, { decision: 'aprobar' })).status, 200);

    // Los planes ya no se piden por transferencia.
    let r = await c.json('POST', '/api/cuenta/pedidos', { plan: 'D', periodo: 'mes' });
    assert.equal(r.status, 410);

    r = await c.json('POST', '/api/cuenta/creditos/pedidos', { packId: 'trimestre-plata', lang: 'es' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const pedido = r.body.pedido;
    assert.match(pedido.codigo, /^SR-\d{4}$/);
    assert.equal(pedido.total.creditos, '105.00');
    assert.equal((await admPost(`/pedidos-creditos/${pedido.id}/confirmar`, {})).status, 200);
    const mail = [...mailsEnviados].reverse().find((m) => m.to === c.email);
    assert.match(mail.subject, /Acreditamos 105 créditos/);

    let yo = (await c.get('/api/cuenta/yo')).body.cuenta;
    assert.deepEqual(yo.creditos.saldo, { centavos: 10500, creditos: '105.00' });
    assert.equal(yo.notificaciones.noLeidas, 1);
    assert.equal(yo.plan.efectivo, 'E');

    r = await c.json('POST', '/api/cuenta/plan/comprar', { plan: 'D', periodo: 'mes' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.saldo.creditos, '70.00');
    yo = (await c.get('/api/cuenta/yo')).body.cuenta;
    assert.equal(yo.plan.efectivo, 'D');
    assert.equal(yo.limites.fotos, 30);
    assert.equal(yo.limites.destacadas, 2);
    assert.equal(yo.previewHabilitado, false); // videos sin bunny.net en esta prueba

    r = await c.json('POST', '/api/cuenta/plan/comprar', { plan: 'C', periodo: 'semana' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.tipo, 'subida_temporal');
    yo = (await c.get('/api/cuenta/yo')).body.cuenta;
    assert.equal(yo.plan.efectivo, 'C', 'la semana de Oro sube el plan');
    assert.equal(yo.limites.fotos, 500);
    assert.equal(yo.creditos.saldo.creditos, '43.00');
    let e = await estadoPublico();
    assert.equal(e.perfiles.find((x) => x.cuentaId === c.id).plan, 'C');

    // Termina la semana: vuelve sola a Plata (la suscripción mensual sigue vigente).
    await db.query("UPDATE suscripciones SET desde = now() - interval '8 days', hasta = now() - interval '1 minute' WHERE cuenta_id = $1 AND periodo = 'semana'", [c.id]);
    yo = (await c.get('/api/cuenta/yo')).body.cuenta;
    assert.equal(yo.plan.efectivo, 'D');
    assert.equal(yo.limites.fotos, 30);
    e = await estadoPublico();
    assert.equal(e.perfiles.find((x) => x.cuentaId === c.id).plan, 'D');

    // Las mutaciones de planes exigen la cabecera de seguridad y una sesión.
    const sinCabecera = await fetch(BASE + '/api/cuenta/plan/comprar', { method: 'POST', headers: { origin: BASE, 'content-type': 'application/json', cookie: c.cookie }, body: '{"plan":"C","periodo":"mes"}' });
    assert.equal(sinCabecera.status, 403);
    assert.equal((await new Cliente().get('/api/cuenta/planes')).status, 401);
    assert.equal((await new Cliente().get('/api/cuenta/creditos')).status, 401);

    // Pausada por falta de saldo: no puede volver a publicarse mandando el perfil a revisión.
    await db.query("UPDATE perfiles SET estado = 'pausado', pausado_por = 'sin_saldo' WHERE cuenta_id = $1", [c.id]);
    r = await c.json('POST', '/api/cuenta/perfil/enviar-revision', {});
    assert.equal(r.status, 409);
    assert.match(r.body.error, /créditos/);
    yo = (await c.get('/api/cuenta/yo')).body.cuenta;
    assert.equal(yo.perfil.pausadoPorSaldo, true);
  });

  test('el límite de fotos sigue al plan: con Bronce no se suben más de 8', async () => {
    const c = await cuentaEnRevision();
    for (let i = 3; i < 8; i++) assert.equal((await c.subir('/api/cuenta/fotos', { foto: await jpeg() })).status, 201);
    const r = await c.subir('/api/cuenta/fotos', { foto: await jpeg() });
    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.equal((await admPost(`/acompanantes/${c.id}/plan`, { plan: 'D', dias: 30, nota: 'prueba' })).status, 200);
    assert.equal((await c.subir('/api/cuenta/fotos', { foto: await jpeg() })).status, 201, 'con Plata (manual) entran 30');
  });
});
