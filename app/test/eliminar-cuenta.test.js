// Eliminar la cuenta de una acompañante desde el admin (18/11/2026, pedido de Juan): se borra todo (filas y archivos,
// también en el disco local), se cierran sus sesiones, le llega un email (con el WhatsApp del sitio o, sin número,
// contacto@) y queda una fila mínima en cuentas_eliminadas con el motivo. Lista con búsqueda en el admin.
//   DATABASE_URL=postgres://postgres@127.0.0.1:55432/<db> node --test test/eliminar-cuenta.test.js
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import sharp from 'sharp';
import { start } from '../server.js';
import { emailEliminada, validarMotivo, whatsappRegistro } from '../lib/cuentas-eliminadas.js';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('Falta DATABASE_URL.'); process.exit(1); }
const db = new pg.Pool({ connectionString: DATABASE_URL, max: 4 });
const A = '/panel-pruebas-eliminar-0123456789';
const USER = 'juan-admin'; const PASS = 'clave-de-prueba-larga-eliminar';
const AUTH = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
const SITE = 'https://sexyrose.test';
const MOTIVO = 'Publicaste fotos que no son tuyas.\nYa te lo habíamos avisado dos veces.';
let instance; let BASE; let tmpData;
const MAILS = []; let mailFalla = false;

const ip = () => '2001:db8::' + crypto.randomBytes(2).toString('hex');
const adm = (p, { method = 'GET', body, headers = {}, auth = AUTH } = {}) => fetch(`${BASE}${A}/api${p}`, {
  method,
  headers: { ...(auth ? { authorization: auth } : {}), ...(method !== 'GET' ? { 'content-type': 'application/json', 'x-sr-admin': '1', origin: BASE } : {}), ...headers },
  ...(method !== 'GET' ? { body: JSON.stringify(body ?? {}) } : {}),
});
const eliminar = (id, motivo = MOTIVO, o = {}) => adm(`/acompanantes/${id}/eliminar`, { method: 'POST', body: { motivo }, ...o });
const sha = (t) => crypto.createHash('sha256').update(t).digest();
const media = (clave) => path.join(tmpData, 'media', clave);
const priv = (rel) => path.join(tmpData, 'privado', rel);
const existe = (abs) => fs.access(abs).then(() => true, () => false);
async function escribir(abs) { await fs.mkdir(path.dirname(abs), { recursive: true }); await fs.writeFile(abs, 'x'); return abs; }
const hex = () => crypto.randomBytes(16).toString('hex');
let n = 0;

async function acompanante({ whatsapp = '+5491155557001', nombre = 'Zz Rocío', nombreCompleto = 'Zz Rocío Fernández' } = {}) {
  const email = `zzelim-${Date.now()}-${n++}@example.com`;
  const { rows: [c] } = await db.query("INSERT INTO cuentas (email, pass_hash, email_verificado, nombre_completo) VALUES ($1, 'x', now(), $2) RETURNING id", [email, nombreCompleto]);
  await db.query("INSERT INTO perfiles (cuenta_id, slug, datos, estado, verificacion) VALUES ($1, $2, $3, 'publicado', 'verificada')",
    [c.id, 'zzelim-' + c.id.slice(0, 8), JSON.stringify({ displayName: nombre, ...(whatsapp ? { whatsapp } : {}) })]);
  const t = crypto.randomBytes(32).toString('base64url');
  await db.query("INSERT INTO sesiones (token_hash, cuenta_id, expira) VALUES ($1, $2, now() + interval '1 day')", [sha(t), c.id]);
  return { id: c.id, email, cookie: 'sr_sesion=' + t };
}
const cuenta = (p, cookie, o = {}) => fetch(BASE + '/api/cuenta' + p, { ...o, headers: { cookie, 'x-sr': '1', origin: BASE, 'cf-connecting-ip': ip(), ...(o.headers || {}) } });

// Todo lo que puede tener una cuenta, con sus archivos en el disco local (públicos y privados)
async function cargarTodo(a) {
  const f = {};
  const id = a.id; const q = (sql, args) => db.query(sql, args);
  // Una foto subida de verdad (storage local → DATA_DIR/media)
  const jpg = await sharp({ create: { width: 700, height: 900, channels: 3, background: '#c0306a' } }).jpeg().toBuffer();
  const fd = new FormData(); fd.append('foto', new Blob([jpg], { type: 'image/jpeg' }), 'f.jpg');
  const r = await cuenta('/fotos', a.cookie, { method: 'POST', body: fd });
  assert.equal(r.status, 201, await r.clone().text());
  const { rows: [foto] } = await q('SELECT clave, clave_mini FROM fotos WHERE cuenta_id = $1', [id]);
  f.foto = media(foto.clave); f.fotoMini = media(foto.clave_mini);
  assert.ok(await existe(f.foto) && await existe(f.fotoMini), 'la foto quedó en el disco');
  // Historia (foto) y historia en video procesándose (archivo temporal)
  const h = `h/${hex()}.webp`; f.historia = await escribir(media(h));
  await q("INSERT INTO historias (cuenta_id, clave, url, tipo) VALUES ($1, $2, '/media/x', 'foto')", [id, h]);
  const { rows: [hv] } = await q("INSERT INTO historias (cuenta_id, tipo, estado) VALUES ($1, 'video', 'procesando') RETURNING id", [id]);
  f.temporalHistoria = await escribir(path.join(tmpData, 'tmp', 'videos', `${hv.id}.subida`));
  // Video de la galería + clip de la tarjeta
  const vm = `v/${hex()}.mp4`; const vp = `v/${hex()}.webp`;
  f.video = await escribir(media(vm)); f.poster = await escribir(media(vp));
  const { rows: [v] } = await q("INSERT INTO videos (cuenta_id, estado, clave_mp4, clave_poster, url) VALUES ($1, 'listo', $2, $3, '/media/v') RETURNING id", [id, vm, vp]);
  f.temporalVideo = await escribir(path.join(tmpData, 'tmp', 'videos', `${v.id}.subida`));
  const pc = `p/${hex()}.mp4`; f.clip = await escribir(media(pc));
  await q("INSERT INTO previews (cuenta_id, video_id, estado, clave, url) VALUES ($1, $2, 'listo', $3, '/media/p')", [id, v.id, pc]);
  // Destacada con un elemento y portada subida
  const dc = `d/${hex()}.webp`; const dm = `d/${hex()}.webp`; const dp = `d/${hex()}.webp`;
  f.destacada = await escribir(media(dc)); f.destacadaMini = await escribir(media(dm)); f.portada = await escribir(media(dp));
  const { rows: [d] } = await q("INSERT INTO destacadas (cuenta_id, titulo, portada_clave, portada_url) VALUES ($1, 'Viajes', $2, '/media/d') RETURNING id", [id, dp]);
  await q("INSERT INTO destacada_items (destacada_id, cuenta_id, clave, clave_mini, url) VALUES ($1, $2, $3, $4, '/media/d')", [d.id, id, dc, dm]);
  // Verificación de identidad (privado, como lib/storage.js guardarPrivado) con nombre enviado
  const vs = `verif/${hex()}-selfie.jpg`; const vd = `verif/${hex()}-doc.jpg`; const vo = `verif/${hex()}-dorso.jpg`;
  f.selfie = await escribir(priv(vs)); f.documento = await escribir(priv(vd)); f.dorso = await escribir(priv(vo));
  await q("INSERT INTO verificaciones (cuenta_id, selfie_ruta, documento_ruta, dorso_ruta, estado, formato, nombre_completo) VALUES ($1, $2, $3, $4, 'aprobada', 2, 'Zz Rocío Fernández')", [id, vs, vd, vo]);
  // Pedido de créditos con comprobante (privado, como lib/privado.js) y créditos
  const cp = `comprobantes/2026/11/${crypto.randomUUID()}.jpg`; f.comprobante = await escribir(priv(cp));
  await q("INSERT INTO pedidos_creditos (codigo, cuenta_id, pack_nombre, paga_usd, base_centavos, comprobante_ruta) VALUES ('SR-' || (1000 + floor(random() * 9000))::int, $1, 'Mes Plata', 35, 3500, $2)", [id, cp]);
  await q("INSERT INTO creditos_movimientos (cuenta_id, tipo, centavos, saldo_despues, motivo) VALUES ($1, 'ajuste_admin', 4200, 4200, 'prueba')", [id]);
  await q("INSERT INTO creditos_cuentas (cuenta_id, centavos) VALUES ($1, 4200) ON CONFLICT (cuenta_id) DO NOTHING", [id]);
  await q("INSERT INTO suscripciones (cuenta_id, plan, periodo, desde, hasta) VALUES ($1, 'C', 'manual', now() - interval '1 hour', now() + interval '30 days')", [id]);
  // Pack y pedido personalizado con un contenido bloqueado (privado)
  await q("INSERT INTO contenido_items (cuenta_id, titulo, precio_centavos, link) VALUES ($1, 'Pack', 250000, 'https://example.com/pack')", [id]);
  const u = 'zzelimcli' + crypto.randomBytes(3).toString('hex');
  const { rows: [cl] } = await q("INSERT INTO clientes (usuario, usuario_norm, email, pass_hash, acepto_terminos, mayor_edad_declarada) VALUES ($1, $1, $2, 'x', now(), true) RETURNING id", [u, u + '@example.com']);
  const { rows: [s] } = await q("INSERT INTO solicitudes (cliente_id, cuenta_id, texto, estado) VALUES ($1, $2, 'Una foto', 'aceptada') RETURNING id", [cl.id, id]);
  const sr = `pedidos/${hex()}.webp`; const sp = `pedidos/${hex()}-prev.webp`;
  f.pedido = await escribir(priv(sr)); f.pedidoPrev = await escribir(priv(sp));
  await q("INSERT INTO solicitud_items (solicitud_id, cuenta_id, tipo, estado, precio_centavos, ruta, ruta_preview) VALUES ($1, $2, 'foto', 'listo', 250000, $3, $4)", [s.id, id, sr, sp]);
  await q("INSERT INTO notificaciones (cuenta_id, tipo, titulo) VALUES ($1, 'otro', 'Aviso')", [id]).catch(() => {});
  // Chat del asistente identificado con esta cuenta (queda: cuenta_id pasa a NULL)
  const { rows: [conv] } = await q("INSERT INTO asistente_conversaciones (jid, telefono, cuenta_id) VALUES ($1, '5491155557001', $2) RETURNING id", [`zzelim-${hex()}@s.whatsapp.net`, id]);
  return { archivos: f, clienteId: cl.id, convId: conv.id };
}

const TABLAS = ['cuentas:id', 'perfiles', 'fotos', 'historias', 'videos', 'previews', 'destacadas', 'destacada_items', 'verificaciones', 'sesiones',
  'tokens_email', 'pedidos', 'pedidos_creditos', 'suscripciones', 'creditos_movimientos', 'creditos_cuentas', 'notificaciones', 'destacados',
  'contenido_items', 'ventas_contenido', 'solicitudes', 'solicitud_items', 'mp_conexiones', 'metricas_perfil_dia'];
async function filasDe(id) {
  const out = {};
  for (const t of TABLAS) {
    const [tabla, col] = t.split(':');
    out[tabla] = (await db.query(`SELECT count(*)::int AS n FROM ${tabla} WHERE ${col || 'cuenta_id'} = $1`, [id])).rows[0].n;
  }
  return out;
}

before(async () => {
  tmpData = await fs.mkdtemp(path.join(os.tmpdir(), 'srelim-data-'));
  instance = await start({ prelanzamientoPorDefecto: false,
    port: 0, host: '127.0.0.1', databaseUrl: DATABASE_URL, adminPath: A, adminUser: USER, adminPassword: PASS,
    ipHashSalt: 'sal', siteUrl: SITE, dataDir: tmpData, log: () => {}, tareaPlanes: false, tareaContenido: false, tareaCotizacion: false, tareaGeoref: false,
    cookieSecure: false,
    sendMail: async (m) => { if (mailFalla) throw new Error('Mailgun caído'); MAILS.push(m); return { ok: true }; },
  });
  BASE = `http://127.0.0.1:${instance.port}`;
  await instance.ready;
  await db.query("DELETE FROM cuentas WHERE email LIKE 'zzelim-%'");
  await db.query("DELETE FROM cuentas_eliminadas WHERE email LIKE 'zzelim-%'");
  await db.query('UPDATE asistente_whatsapp SET numero = NULL WHERE id = 1');
});
after(async () => {
  await instance?.close();
  await db.query("DELETE FROM cuentas WHERE email LIKE 'zzelim-%'");
  await db.query("DELETE FROM clientes WHERE email LIKE 'zzelimcli%'");
  await db.query("DELETE FROM cuentas_eliminadas WHERE email LIKE 'zzelim-%'");
  await db.query("DELETE FROM asistente_conversaciones WHERE jid LIKE 'zzelim-%'");
  await db.query('UPDATE asistente_whatsapp SET numero = NULL WHERE id = 1');
  await db.end();
  await fs.rm(tmpData, { recursive: true, force: true });
});

describe('piezas', () => {
  test('motivo de 10 a 500 caracteres; WhatsApp como +dígitos', () => {
    assert.match(validarMotivo('').error, /Escribí el motivo/);
    assert.match(validarMotivo('   corto   ').error, /mínimo 10/);
    assert.equal(validarMotivo('  Diez letra  ').valor, 'Diez letra');
    assert.equal(validarMotivo('x'.repeat(500)).valor.length, 500);
    assert.match(validarMotivo('x'.repeat(501)).error, /máximo 500/);
    assert.equal(validarMotivo('Línea uno\r\n\r\n\r\n\r\nLínea dos').valor, 'Línea uno\n\nLínea dos');
    assert.equal(whatsappRegistro('+54 9 11 5555-0001'), '+5491155550001');
    assert.equal(whatsappRegistro(''), null);
    assert.equal(whatsappRegistro('123'), null);
  });
  test('email: con número, por WhatsApp (y "desde el número de tu perfil" si tenía); sin número, contacto@', () => {
    const c = emailEliminada({ numero: '5491100000000', tenia: true });
    assert.equal(c.subject, 'Tu cuenta de SexyRose fue eliminada');
    assert.match(c.parrafos.join(' '), /escribinos por WhatsApp al \+5491100000000, desde el número que tenías en tu perfil: https:\/\/wa\.me\/5491100000000/);
    assert.ok(!/desde el número/.test(emailEliminada({ numero: '5491100000000', tenia: false }).parrafos.join(' ')));
    const s = emailEliminada({ numero: '' });
    assert.match(s.parrafos.join(' '), /escribinos a contacto@sexyrose\.net\./);
    assert.ok(!/WhatsApp/.test(s.parrafos.join(' ')));
  });
});

describe('eliminar cuenta', () => {
  test('borra todas sus filas y archivos (disco local), cierra sus sesiones y deja el registro mínimo', async () => {
    await db.query("UPDATE asistente_whatsapp SET numero = '5491100000000' WHERE id = 1");
    const a = await acompanante();
    const otra = await acompanante({ whatsapp: '+5491155557999', nombre: 'Zz Otra' });
    const { archivos, convId } = await cargarTodo(a);
    const ctrl = await escribir(media(`f/${hex()}.webp`));
    await db.query("INSERT INTO fotos (cuenta_id, clave, url) VALUES ($1, $2, '/media/x')", [otra.id, path.relative(path.join(tmpData, 'media'), ctrl)]);
    assert.equal((await cuenta('/yo', a.cookie)).status, 200);
    const antes = await filasDe(a.id);
    for (const t of ['cuentas', 'perfiles', 'fotos', 'historias', 'videos', 'previews', 'destacadas', 'destacada_items', 'verificaciones', 'sesiones', 'pedidos_creditos', 'suscripciones', 'creditos_movimientos', 'contenido_items', 'solicitudes', 'solicitud_items']) {
      assert.ok(antes[t] > 0, `la prueba no cargó ${t}`);
    }
    const r = await eliminar(a.id);
    assert.equal(r.status, 200, await r.clone().text());
    const body = await r.json();
    assert.equal(body.ok, true); assert.equal(body.mail, true);
    assert.deepEqual(Object.keys(body.registro).sort(), ['email', 'fecha', 'id', 'motivo', 'nombreArtistico', 'nombreCompleto', 'por', 'whatsapp']);
    // Filas: ninguna
    const despues = await filasDe(a.id);
    for (const [t, k] of Object.entries(despues)) assert.equal(k, 0, `quedó algo en ${t}`);
    // Archivos: ninguno (públicos, privados y temporales); los de otra cuenta no se tocan
    for (const [k, abs] of Object.entries(archivos)) assert.equal(await existe(abs), false, `quedó el archivo ${k}`);
    assert.equal(await existe(ctrl), true, 'se borró un archivo de otra cuenta');
    assert.equal((await filasDe(otra.id)).cuentas, 1);
    // Sesión cerrada
    assert.equal((await cuenta('/yo', a.cookie)).status, 401);
    // Lo que queda por diseño: el chat del asistente, sin la cuenta
    const { rows: [conv] } = await db.query('SELECT cuenta_id FROM asistente_conversaciones WHERE id = $1', [convId]);
    assert.ok(conv, 'el chat del asistente sigue'); assert.equal(conv.cuenta_id, null);
    // Registro: solo esto
    const { rows } = await db.query('SELECT * FROM cuentas_eliminadas WHERE email = $1', [a.email]);
    assert.equal(rows.length, 1);
    const x = rows[0];
    assert.deepEqual(Object.keys(x).sort(), ['email', 'fecha', 'id', 'motivo', 'nombre_artistico', 'nombre_completo', 'por', 'whatsapp']);
    assert.equal(x.whatsapp, '+5491155557001'); assert.equal(x.nombre_artistico, 'Zz Rocío'); assert.equal(x.nombre_completo, 'Zz Rocío Fernández');
    assert.equal(x.motivo, MOTIVO); assert.equal(x.por, USER);
    // Email: neutro, con el WhatsApp del sitio y sin el motivo
    const m = MAILS.find((y) => y.to === a.email);
    assert.ok(m, 'no salió el email');
    assert.equal(m.subject, 'Tu cuenta de SexyRose fue eliminada');
    assert.match(m.text, /Tu cuenta de SexyRose fue eliminada\./);
    assert.match(m.text, /Si querés saber el motivo, escribinos por WhatsApp al \+5491100000000, desde el número que tenías en tu perfil: https:\/\/wa\.me\/5491100000000/);
    assert.ok(m.html.includes('wa.me/5491100000000'));
    assert.ok(!m.text.includes('fotos que no son tuyas'), 'el motivo no va en el email');
    assert.ok(!/admin|registro|asistente|Si no fuiste vos/i.test(m.text), 'sin detalles internos');
    // Dos veces: 404
    assert.equal((await eliminar(a.id)).status, 404);
  });

  test('sin WhatsApp configurado: el email dice contacto@; sin nombre completo aprobado, guarda el último enviado', async () => {
    await db.query('UPDATE asistente_whatsapp SET numero = NULL WHERE id = 1');
    const { rows: [ct] } = await db.query("SELECT valor FROM ajustes WHERE clave = 'contacto'");
    await db.query("INSERT INTO ajustes (clave, valor) VALUES ('contacto', $1) ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor", [JSON.stringify({ ...(ct ? ct.valor : {}), whatsapp: '' })]);
    try {
      const a = await acompanante({ whatsapp: null, nombreCompleto: null });
      await db.query("INSERT INTO verificaciones (cuenta_id, estado, formato, nombre_completo, creado) VALUES ($1, 'rechazada', 2, 'Zz Nombre Viejo', now() - interval '2 days'), ($1, 'pendiente', 2, 'Zz Nombre Nuevo', now())", [a.id]);
      const r = await eliminar(a.id, 'Datos del perfil falsos.');
      assert.equal(r.status, 200, await r.clone().text());
      const m = MAILS.find((y) => y.to === a.email);
      assert.match(m.text, /Si querés saber el motivo, escribinos a contacto@sexyrose\.net\./);
      assert.ok(!/WhatsApp|wa\.me/.test(m.text));
      const { rows: [x] } = await db.query('SELECT whatsapp, nombre_completo FROM cuentas_eliminadas WHERE email = $1', [a.email]);
      assert.equal(x.whatsapp, null); assert.equal(x.nombre_completo, 'Zz Nombre Nuevo');
    } finally {
      if (ct) await db.query("UPDATE ajustes SET valor = $1 WHERE clave = 'contacto'", [JSON.stringify(ct.valor)]);
      else await db.query("DELETE FROM ajustes WHERE clave = 'contacto'");
    }
  });

  test('si el email falla, la cuenta queda eliminada igual', async () => {
    const a = await acompanante();
    mailFalla = true;
    try {
      const r = await eliminar(a.id);
      assert.equal(r.status, 200);
      assert.equal((await r.json()).mail, false);
    } finally { mailFalla = false; }
    assert.equal((await filasDe(a.id)).cuentas, 0);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM cuentas_eliminadas WHERE email = $1', [a.email])).rows[0].n, 1);
  });

  test('motivo obligatorio de 10 a 500 caracteres (400 y no se borra nada)', async () => {
    const a = await acompanante();
    for (const motivo of [undefined, '', '   ', 'Nueve car', 'x'.repeat(501), 12345678901]) {
      const r = await adm(`/acompanantes/${a.id}/eliminar`, { method: 'POST', body: motivo === undefined ? {} : { motivo } });
      assert.equal(r.status, 400, String(motivo));
      assert.match((await r.json()).error, /motivo/i);
    }
    assert.equal((await filasDe(a.id)).cuentas, 1);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM cuentas_eliminadas WHERE email = $1', [a.email])).rows[0].n, 0);
    const r = await eliminar(a.id, 'x'.repeat(500));
    assert.equal(r.status, 200);
  });

  test('solo el admin: sin contraseña 401, sin la cabecera del panel 403; id inválido o inexistente 404', async () => {
    const a = await acompanante();
    assert.equal((await eliminar(a.id, MOTIVO, { auth: null })).status, 401);
    assert.equal((await eliminar(a.id, MOTIVO, { auth: 'Basic ' + Buffer.from(`${USER}:otra-clave-cualquiera`).toString('base64') })).status, 401);
    const sinCab = await fetch(`${BASE}${A}/api/acompanantes/${a.id}/eliminar`, { method: 'POST', headers: { authorization: AUTH, 'content-type': 'application/json', origin: BASE }, body: JSON.stringify({ motivo: MOTIVO }) });
    assert.equal(sinCab.status, 403);
    assert.equal((await adm('/cuentas-eliminadas', { auth: null })).status, 401);
    // Desde el sitio (sin la ruta del panel) no existe
    const pub = await fetch(`${BASE}/api/acompanantes/${a.id}/eliminar`, { method: 'POST', headers: { 'content-type': 'application/json', origin: BASE }, body: JSON.stringify({ motivo: MOTIVO }) });
    assert.equal(pub.status, 404);
    assert.equal((await filasDe(a.id)).cuentas, 1);
    assert.equal((await eliminar('no-es-un-id')).status, 404);
    assert.equal((await eliminar(crypto.randomUUID())).status, 404);
  });

  test('lista: la más nueva primero, búsqueda por email, WhatsApp (con o sin formato) y nombres', async () => {
    const a = await acompanante({ whatsapp: '+5491155557101', nombre: 'Zz Lista Uno', nombreCompleto: 'Zz Marta Uno' });
    const b = await acompanante({ whatsapp: '+5491155557102', nombre: 'Zz Lista Dos', nombreCompleto: 'Zz Marta Dos' });
    assert.equal((await eliminar(a.id, 'Motivo de la primera.')).status, 200);
    assert.equal((await eliminar(b.id, 'Motivo de la segunda.')).status, 200);
    const todas = await (await adm('/cuentas-eliminadas')).json();
    assert.ok(todas.total >= 2);
    const i = todas.items.findIndex((x) => x.email === b.email); const j = todas.items.findIndex((x) => x.email === a.email);
    assert.ok(i >= 0 && j > i, 'la más nueva primero');
    assert.deepEqual(todas.items[i], { ...todas.items[i], email: b.email, whatsapp: '+5491155557102', nombreArtistico: 'Zz Lista Dos', nombreCompleto: 'Zz Marta Dos', motivo: 'Motivo de la segunda.', por: USER });
    const buscar = async (q) => (await (await adm('/cuentas-eliminadas?q=' + encodeURIComponent(q))).json()).items.map((x) => x.email);
    assert.deepEqual(await buscar(a.email), [a.email]);
    assert.deepEqual(await buscar('11 5555-7101'), [a.email]);
    assert.deepEqual(await buscar('+5491155557102'), [b.email]);
    assert.deepEqual(await buscar('marta dos'), [b.email]);
    assert.deepEqual(await buscar('Zz Lista'), [b.email, a.email]);
    assert.deepEqual(await buscar('nadie-así'), []);
    assert.deepEqual(await buscar('100%_'), []);
  });

  test('puede volver a registrarse con el mismo email (el registro no bloquea nada)', async () => {
    const a = await acompanante();
    assert.equal((await eliminar(a.id)).status, 200);
    const r = await fetch(BASE + '/api/cuenta/registro', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-sr': '1', origin: BASE, 'cf-connecting-ip': ip() },
      body: JSON.stringify({ email: a.email, password: 'una-clave-larga-123', displayName: 'Zz Vuelve', fechaNacimiento: '1995-04-10', genero: 'mujer', tipo: 'acompanante', aceptaTerminos: true, mayorEdad: true }),
    });
    assert.equal(r.status, 201, await r.clone().text());
    const { rows } = await db.query('SELECT id FROM cuentas WHERE email = $1', [a.email]);
    assert.equal(rows.length, 1); assert.notEqual(rows[0].id, a.id);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM cuentas_eliminadas WHERE email = $1', [a.email])).rows[0].n, 1);
    // Y se la puede volver a eliminar: queda una segunda fila
    assert.equal((await eliminar(rows[0].id, 'Segunda vez, mismo motivo.')).status, 200);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM cuentas_eliminadas WHERE email = $1', [a.email])).rows[0].n, 2);
  });
});
