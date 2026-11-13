// Admin (13/11/2026): moderación de pedidos personalizados y chats, bloqueo de interesados, registro de acciones,
// créditos de todas, interesados y ficha completa (destacadas, packs, Mercado Pago, pedidos). Mercado Pago simulado.
//   DATABASE_URL=postgres://postgres@localhost:55432/<db> node --test test/admin-moderacion.test.js
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

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('Falta DATABASE_URL.'); process.exit(1); }
const db = new pg.Pool({ connectionString: DATABASE_URL, max: 4 });
const A = '/panel-pruebas-moderacion-0123456789';
const USER = 'adm'; const PASS = 'clave-de-prueba-larga-123';
const AUTH = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
const SITE = 'https://sexyrose.test';
const APP = { id: '4444444444444444', nombre: 'Cuenta de Juan', clientId: '4444444444444444', clientSecret: 'secreto-app-m', webhookSecret: 'webhook-m' };
let instance; let BASE; let tmpData;

// ---------- Mercado Pago simulado (solo OAuth) ----------
const MP = { codigos: new Map() };
const resp = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
async function mpFetch(url, opts = {}) {
  const u = new URL(url);
  if (u.pathname === '/oauth/token') {
    const f = Object.fromEntries(new URLSearchParams(opts.body));
    const c = MP.codigos.get(f.code);
    if (!c) return resp(400, { error: 'invalid_grant' });
    MP.codigos.delete(f.code);
    return resp(200, { access_token: c.access, refresh_token: 'RT-' + crypto.randomBytes(4).toString('hex'), expires_in: 15552000, user_id: c.user });
  }
  return resp(404, {});
}

// ---------- Ayudas ----------
const ip = () => '2001:db8::' + crypto.randomBytes(2).toString('hex');
const req = (p, { method = 'GET', body, cookie = '' } = {}) => fetch(BASE + '/api' + p, {
  method, redirect: 'manual',
  headers: { ...(cookie ? { cookie } : {}), ...(method !== 'GET' ? { 'content-type': 'application/json', 'x-sr': '1', origin: BASE } : {}), 'cf-connecting-ip': ip() },
  ...(method !== 'GET' ? { body: JSON.stringify(body ?? {}) } : {}),
});
const post = (p, body, cookie) => req(p, { method: 'POST', body, cookie });
const adm = (p, { method = 'GET', body, headers = {}, auth = AUTH } = {}) => fetch(`${BASE}${A}/api${p}`, {
  method,
  headers: { ...(auth ? { authorization: auth } : {}), ...(method !== 'GET' ? { 'content-type': 'application/json', 'x-sr-admin': '1', origin: BASE } : {}), ...headers },
  ...(method !== 'GET' ? { body: JSON.stringify(body ?? {}) } : {}),
});
const admJson = async (p, o) => { const r = await adm(p, o); assert.equal(r.status, 200, `${p}: ${await r.clone().text()}`); return r.json(); };
const token = () => crypto.randomBytes(32).toString('base64url');
const sha = (t) => crypto.createHash('sha256').update(t).digest();
let n = 0;

async function sesionAcomp(id) {
  const t = token();
  await db.query("INSERT INTO sesiones (token_hash, cuenta_id, expira) VALUES ($1, $2, now() + interval '1 day')", [sha(t), id]);
  return 'sr_sesion=' + t;
}
async function vendedora({ plan = 'C', conectar = true } = {}) {
  const email = `zzmod-${Date.now()}-${n++}@example.com`;
  const { rows } = await db.query("INSERT INTO cuentas (email, pass_hash, email_verificado) VALUES ($1, 'x', now()) RETURNING id", [email]);
  const id = rows[0].id; const slug = 'zzmod-' + id.slice(0, 8);
  await db.query("INSERT INTO perfiles (cuenta_id, slug, datos, estado, verificacion) VALUES ($1, $2, $3, 'publicado', 'verificada')", [id, slug, JSON.stringify({ displayName: 'Moderada ' + n })]);
  if (plan !== 'E') await db.query("INSERT INTO suscripciones (cuenta_id, plan, periodo, desde, hasta) VALUES ($1, $2, 'manual', now() - interval '1 hour', now() + interval '30 days')", [id, plan]);
  const cookie = await sesionAcomp(id);
  if (conectar) {
    const r = await post('/cuenta/contenido/mp/conectar', {}, cookie);
    assert.equal(r.status, 200, await r.clone().text());
    const url = new URL((await r.json()).url);
    const code = 'code-' + crypto.randomBytes(4).toString('hex');
    MP.codigos.set(code, { access: 'AT-' + crypto.randomBytes(4).toString('hex'), user: 7000 + n });
    const cb = await req(`/cuenta/contenido/mp/callback?code=${code}&state=${url.searchParams.get('state')}`, { cookie });
    assert.equal(cb.status, 303);
  }
  return { id, slug, cookie };
}
async function cliente({ verificado = true, password = null } = {}) {
  const u = 'zzmodcli' + crypto.randomBytes(3).toString('hex');
  let hash = 'x';
  if (password) { const { hashPassword } = await import('../lib/auth.js'); hash = await hashPassword(password); }
  const { rows } = await db.query(
    `INSERT INTO clientes (usuario, usuario_norm, email, pass_hash, acepto_terminos, mayor_edad_declarada, email_verificado)
     VALUES ($1, $1, $2, $3, now(), true, $4) RETURNING id`, [u, u + '@example.com', hash, verificado ? new Date() : null]);
  const t = token();
  await db.query("INSERT INTO sesiones_clientes (token_hash, cliente_id, expira) VALUES ($1, $2, now() + interval '1 day')", [sha(t), rows[0].id]);
  return { id: rows[0].id, usuario: u, email: u + '@example.com', cookie: 'sr_cliente=' + t };
}
async function pedidoAceptado(c, v, texto = 'Quiero una foto') {
  const r = await post('/cliente/pedidos', { slug: v.slug, texto }, c.cookie);
  assert.equal(r.status, 201, await r.clone().text());
  const { id } = await r.json();
  assert.equal((await post(`/cuenta/solicitudes/${id}/aceptar`, {}, v.cookie)).status, 200);
  return id;
}
async function subirFoto(cookie, solicitudId) {
  const buf = await sharp({ create: { width: 900, height: 600, channels: 3, background: { r: 20, g: 120, b: 200 } } }).jpeg().toBuffer();
  const fd = new FormData(); fd.append('precio', '2500'); fd.append('archivo', new Blob([buf], { type: 'image/jpeg' }), 'f.jpg');
  const r = await fetch(`${BASE}/api/cuenta/solicitudes/${solicitudId}/items`, { method: 'POST', body: fd, headers: { cookie, 'x-sr': '1', origin: BASE } });
  assert.equal(r.status, 201, await r.clone().text());
  return (await r.json()).itemId;
}
const existe = (rel) => fs.access(path.join(tmpData, 'privado', rel)).then(() => true, () => false);

before(async () => {
  tmpData = await fs.mkdtemp(path.join(os.tmpdir(), 'srmod-data-'));
  instance = await start({
    port: 0, host: '127.0.0.1', databaseUrl: DATABASE_URL, adminPath: A, adminUser: USER, adminPassword: PASS,
    ipHashSalt: 'sal', siteUrl: SITE, dataDir: tmpData, log: () => {}, tareaPlanes: false, tareaContenido: false, tareaCotizacion: false,
    mpCuentas: [APP], mpFetch, cookieSecure: false,
  });
  BASE = `http://127.0.0.1:${instance.port}`;
  await instance.ready;
  await db.query("DELETE FROM cuentas WHERE email LIKE 'zzmod-%'");
  await db.query("DELETE FROM clientes WHERE email LIKE 'zzmod%'");
});
after(async () => {
  await instance?.close();
  await db.query("DELETE FROM cuentas WHERE email LIKE 'zzmod-%'");
  await db.query("DELETE FROM clientes WHERE email LIKE 'zzmod%'");
  await db.end();
  await fs.rm(tmpData, { recursive: true, force: true });
});

describe('admin: acceso', () => {
  test('las rutas nuevas piden la contraseña del panel y las mutaciones la cabecera del panel', async () => {
    for (const p of ['/solicitudes', '/clientes', '/creditos-resumen', '/acciones']) {
      assert.equal((await adm(p, { auth: null })).status, 401, p);
      assert.equal((await adm(p)).status, 200, p);
    }
    const c = await cliente();
    assert.equal((await adm(`/clientes/${c.id}/bloquear`, { method: 'POST', body: { motivo: 'x x x' }, headers: { 'x-sr-admin': '' } })).status, 403);
    assert.equal((await adm(`/clientes/${c.id}/bloquear`, { method: 'POST', body: { motivo: 'x x x' }, auth: null })).status, 401);
    assert.equal((await adm('/solicitudes/no-es-uuid')).status, 404);
  });
});

describe('admin: pedidos personalizados', () => {
  test('lista, chat completo, archivos privados, borrar mensaje y contenido (con archivos), cerrar con motivo y registro', async () => {
    const c = await cliente(); const v = await vendedora({ plan: 'S' });
    const id = await pedidoAceptado(c, v, 'Una foto en el parque');
    await post(`/cliente/pedidos/${id}/mensajes`, { texto: 'Hola, ¿podés hoy?' }, c.cookie);
    const m2 = await (await post(`/cuenta/solicitudes/${id}/mensajes`, { texto: 'Sí, te la mando' }, v.cookie)).json();
    const itemId = await subirFoto(v.cookie, id);

    const lista = await admJson('/solicitudes');
    const fila = lista.items.find((x) => x.id === id);
    assert.ok(fila, 'aparece en la lista');
    assert.equal(fila.estado, 'aceptada'); assert.equal(fila.cliente.usuario, c.usuario); assert.equal(fila.items, 1);
    assert.equal(fila.ultimoMensaje.contenido, true, 'el último mensaje es el contenido');
    assert.ok(lista.conteo.aceptada >= 1);
    assert.ok((await admJson('/solicitudes?estado=aceptada')).items.some((x) => x.id === id));
    assert.ok(!(await admJson('/solicitudes?estado=cerrada')).items.some((x) => x.id === id));

    let d = await admJson('/solicitudes/' + id);
    assert.equal(d.solicitud.cliente.email, c.email, 'el admin ve el email');
    assert.deepEqual(d.mensajes.map((m) => m.autor), ['sistema', 'cliente', 'acompanante', 'acompanante']);
    const it = d.items.find((x) => x.id === itemId);
    assert.equal(it.archivo, true); assert.equal(it.pagado, false);
    // Archivos privados: original y vista previa, solo con la sesión del panel
    const org = await adm(`/solicitudes/items/${itemId}/archivo`);
    assert.equal(org.status, 200); assert.equal(org.headers.get('cache-control'), 'no-store, private');
    assert.equal((await adm(`/solicitudes/items/${itemId}/archivo?preview=1`)).status, 200);
    assert.equal((await adm(`/solicitudes/items/${itemId}/archivo`, { auth: null })).status, 401);

    // Borrar un mensaje de texto
    assert.equal((await adm(`/solicitudes/${id}/mensajes/${m2.mensaje.id}`, { method: 'DELETE' })).status, 200);
    d = await admJson('/solicitudes/' + id);
    assert.ok(!d.mensajes.some((m) => m.id === m2.mensaje.id));
    const sis = d.mensajes.find((m) => m.autor === 'sistema');
    assert.equal((await adm(`/solicitudes/${id}/mensajes/${sis.id}`, { method: 'DELETE' })).status, 400, 'los avisos del sistema no se borran');
    // Borrar el contenido: se borran los archivos
    const { rows: [f] } = await db.query('SELECT ruta, ruta_preview FROM solicitud_items WHERE id = $1', [itemId]);
    assert.ok(await existe(f.ruta) && await existe(f.ruta_preview));
    assert.equal((await adm(`/solicitudes/items/${itemId}`, { method: 'DELETE' })).status, 200);
    assert.ok(!(await existe(f.ruta)) && !(await existe(f.ruta_preview)), 'archivos borrados');
    assert.equal((await db.query('SELECT 1 FROM solicitud_items WHERE id = $1', [itemId])).rowCount, 0);
    const vc = await (await req(`/cliente/pedidos/${id}`, { cookie: c.cookie })).json();
    assert.ok(!vc.items.some((x) => x.id === itemId) && !vc.mensajes.some((m) => m.itemId === itemId), 'el cliente ya no lo ve');

    // Cerrar: pide motivo; queda de solo lectura
    assert.equal((await adm(`/solicitudes/${id}/cerrar`, { method: 'POST', body: {} })).status, 400);
    assert.equal((await adm(`/solicitudes/${id}/cerrar`, { method: 'POST', body: { motivo: 'Contenido no permitido' } })).status, 200);
    assert.equal((await adm(`/solicitudes/${id}/cerrar`, { method: 'POST', body: { motivo: 'otra vez' } })).status, 409);
    assert.equal((await post(`/cliente/pedidos/${id}/mensajes`, { texto: 'hola?' }, c.cookie)).status, 409);
    assert.equal((await post(`/cuenta/solicitudes/${id}/mensajes`, { texto: 'hola?' }, v.cookie)).status, 409);
    d = await admJson('/solicitudes/' + id);
    assert.equal(d.solicitud.estado, 'cerrada'); assert.equal(d.solicitud.cerradaPor, 'admin'); assert.equal(d.solicitud.motivoCierre, 'Contenido no permitido');
    // Registro del admin
    const acc = d.acciones.map((a) => a.accion);
    assert.deepEqual(acc.sort(), ['borrar_contenido', 'borrar_mensaje', 'cerrar_pedido'].sort());
    assert.ok(d.acciones.every((a) => a.por === USER));
    const cerrar = d.acciones.find((a) => a.accion === 'cerrar_pedido');
    assert.equal(cerrar.detalle.motivo, 'Contenido no permitido');
  });
});

describe('admin: interesados', () => {
  test('bloquear: sale de sus sesiones, no entra, no compra ni pide, y sus chats quedan de solo lectura; desbloquear', async () => {
    const pw = 'contraseña-muy-larga';
    const c = await cliente({ password: pw }); const v = await vendedora();
    const id = await pedidoAceptado(c, v, 'Antes del bloqueo');
    assert.equal((await adm(`/clientes/${c.id}/bloquear`, { method: 'POST', body: {} })).status, 400, 'pide motivo');
    assert.equal((await adm(`/clientes/${c.id}/bloquear`, { method: 'POST', body: { motivo: 'Acoso a una acompañante' } })).status, 200);
    assert.equal((await adm(`/clientes/${c.id}/bloquear`, { method: 'POST', body: { motivo: 'otra vez' } })).status, 409);
    assert.equal((await req('/cliente/yo', { cookie: c.cookie })).status, 401, 'se cerraron sus sesiones');
    const l = await post('/cliente/login', { email: c.email, password: pw });
    assert.equal(l.status, 403); assert.equal((await l.json()).suspendida, true);
    assert.equal((await post('/cliente/login', { email: c.email, password: 'mal-mal-mal-mal' })).status, 401, 'con la contraseña mal no revela nada');
    // Aunque tuviera una sesión, no puede pedir ni escribir
    const t = token();
    await db.query("INSERT INTO sesiones_clientes (token_hash, cliente_id, expira) VALUES ($1, $2, now() + interval '1 day')", [sha(t), c.id]);
    const ck = 'sr_cliente=' + t;
    const v2 = await vendedora();
    assert.equal((await post('/cliente/pedidos', { slug: v2.slug, texto: 'Quiero algo' }, ck)).status, 403);
    assert.equal((await post(`/cliente/pedidos/${id}/mensajes`, { texto: 'hola' }, ck)).status, 403);
    // La acompañante tampoco puede seguir el chat
    assert.equal((await post(`/cuenta/solicitudes/${id}/mensajes`, { texto: 'hola' }, v.cookie)).status, 409);
    const dv = await (await req(`/cuenta/solicitudes/${id}`, { cookie: v.cookie })).json();
    assert.equal(dv.puedeEnviarContenido, false);
    // En la lista del admin figura bloqueado
    const lc = await admJson('/clientes?q=' + c.usuario);
    assert.equal(lc.items.length, 1); assert.equal(lc.items[0].bloqueado, true); assert.equal(lc.items[0].email, c.email);
    assert.ok(lc.conteo.bloqueados >= 1);
    assert.equal((await admJson('/solicitudes')).items.find((x) => x.id === id).cliente.bloqueado, true);
    // Desbloquear
    assert.equal((await adm(`/clientes/${c.id}/desbloquear`, { method: 'POST' })).status, 200);
    assert.equal((await post('/cliente/login', { email: c.email, password: pw })).status, 200);
    const det = await admJson('/clientes/' + c.id);
    assert.deepEqual(det.acciones.map((a) => a.accion), ['desbloquear_cliente', 'bloquear_cliente']);
    assert.equal(det.pedidos.length, 1); assert.equal(det.pedidos[0].id, id);
    assert.ok(!('pass_hash' in det.cliente) && !('passHash' in det.cliente), 'nunca la contraseña');
  });

  test('reenviar el email de confirmación', async () => {
    const c = await cliente({ verificado: false });
    const antes = mailsEnviados.length;
    assert.equal((await adm(`/clientes/${c.id}/reenviar-verificacion`, { method: 'POST' })).status, 200);
    const m = [...mailsEnviados].slice(antes).find((x) => x.to === c.email);
    assert.ok(m && /\/cliente\/verificar\?token=/.test(m.links[0]));
    const t = new URL(m.links[0]).searchParams.get('token');
    assert.equal((await post('/cliente/verificar-email', { token: t })).status, 200);
    assert.equal((await adm(`/clientes/${c.id}/reenviar-verificacion`, { method: 'POST' })).status, 409, 'ya confirmado');
  });
});

describe('admin: créditos y ficha', () => {
  test('créditos: totales del período y último movimiento de cada una', async () => {
    const v = await vendedora({ plan: 'E', conectar: false });
    const antes = await admJson('/creditos-resumen?dias=30');
    assert.equal((await adm(`/creditos/${v.id}/ajuste`, { method: 'POST', body: { creditos: '12', motivo: 'Prueba de admin' } })).status, 200);
    assert.equal((await adm(`/creditos/${v.id}/ajuste`, { method: 'POST', body: { creditos: '-2', motivo: 'Corrección' } })).status, 200);
    const r = await admJson('/creditos-resumen?dias=30');
    assert.equal(r.dias, 30);
    assert.equal(r.periodo.emitidos.centavos - antes.periodo.emitidos.centavos, 1200);
    assert.equal(r.periodo.consumidos.centavos - antes.periodo.consumidos.centavos, 200);
    assert.equal(r.ultimos[v.id].tipo, 'ajuste_admin'); assert.equal(r.ultimos[v.id].centavos.centavos, -200);
    const lista = await admJson('/creditos');
    assert.equal(lista.items.find((x) => x.cuentaId === v.id).saldo.centavos, 1000);
  });

  test('ficha: destacadas, packs, Mercado Pago y pedidos; borrar pack queda registrado', async () => {
    const v = await vendedora({ plan: 'C' });
    const c = await cliente();
    await pedidoAceptado(c, v, 'Algo para la ficha');
    const pk = await post('/cuenta/contenido/items', { titulo: 'Pack de prueba', descripcion: 'Fotos', precio: 2000, link: 'https://example.com/pack' }, v.cookie);
    assert.equal(pk.status, 201, await pk.clone().text());
    const packId = (await pk.json()).item.id;
    const dest = await post('/cuenta/destacadas', { titulo: 'Viajes' }, v.cookie);
    assert.ok([200, 201].includes(dest.status), await dest.clone().text());
    const x = await admJson(`/acompanantes/${v.id}/extra`);
    assert.equal(x.mercadoPago.estado, 'conectada'); assert.equal(x.mercadoPago.cuentaActiva, 'Cuenta de Juan');
    assert.equal(x.mercadoPago.conexiones.length, 1);
    assert.equal(x.pedidos.total, 1); assert.equal(x.pedidos.abiertos, 1);
    assert.equal(x.packs.items.length, 1); assert.equal(x.packs.items[0].aLaVenta, true); assert.equal(x.packs.max, 5);
    assert.equal(x.destacadas.destacadas.length, 1); assert.equal(x.destacadas.destacadas[0].titulo, 'Viajes');
    // Borrar pack y destacada desde el admin
    assert.equal((await adm(`/acompanantes/${v.id}/packs/${packId}`, { method: 'DELETE' })).status, 200);
    assert.equal((await adm(`/acompanantes/${v.id}/destacadas/${x.destacadas.destacadas[0].id}`, { method: 'DELETE' })).status, 200);
    const y = await admJson(`/acompanantes/${v.id}/extra`);
    assert.equal(y.packs.items.length, 0); assert.equal(y.destacadas.destacadas.length, 0);
    const acc = await admJson(`/acciones?tipo=acompanante&id=${v.id}`);
    assert.deepEqual(acc.items.map((a) => a.accion), ['borrar_destacada', 'borrar_pack']);
    assert.equal((await adm(`/acompanantes/${crypto.randomUUID()}/extra`)).status, 404);
  });

  test('el resumen cuenta pedidos personalizados e interesados', async () => {
    const r = await admJson('/resumen');
    assert.ok(r.pedidosPersonalizados && typeof r.pedidosPersonalizados.abiertos === 'number');
    assert.ok(r.clientes && typeof r.clientes.total === 'number');
  });
});
