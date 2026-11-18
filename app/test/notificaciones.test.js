// Notificaciones de la acompañante (18/11/2026, pedidos de Juan): ingreso → Resumen, avisos del perfil y la verificación
// (notificación del panel + email, una vez por evento), "Ahora sos …" en los planes y la campana del encabezado.
//   DATABASE_URL=postgres://... node --test test/notificaciones.test.js
// Contrato: FASE1-CONTRATO.md → "Notificaciones de la acompañante".
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
import { mailsEnviados } from '../lib/mail.js';
import { avisos, ABRIMOS_PRONTO } from '../lib/avisos-cuenta.js';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('Falta DATABASE_URL.'); process.exit(1); }
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITIO = path.join(HERE, '..', '..', 'mvp', 'src', 'prod-sitio.js');

const db = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
const A = '/panel-notif-0123456789';
const USER = 'admin-notif';
const PASS = 'clave-de-prueba-larga-789';
const mails = []; // emails de planes, admin y avisos (config.sendMail); los de la cuenta (links) van a mailsEnviados
let instance; let BASE; let tmpData; let tmpPublic;
const rand = () => crypto.randomBytes(4).toString('hex');

before(async () => {
  tmpData = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-notif-data-'));
  tmpPublic = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-notif-pub-'));
  await fs.writeFile(path.join(tmpPublic, 'index.html'), '<!doctype html><title>x</title>');
  instance = await start({ prelanzamientoPorDefecto: false,
    port: 0, host: '127.0.0.1', databaseUrl: DATABASE_URL, publicDir: tmpPublic, dataDir: tmpData, storage: 'local',
    adminPath: A, adminUser: USER, adminPassword: PASS, ipHashSalt: 'sal-notif', siteUrl: 'https://sexyrose.net',
    telegramToken: '', telegramChatId: '', mailgunApiKey: '', log: () => {}, tareaPlanes: false,
    sendMail: async (m) => { mails.push(m); },
  });
  BASE = `http://127.0.0.1:${instance.port}`;
  await instance.ready;
  await db.query("DELETE FROM ajustes WHERE clave = 'prelanzamiento'");
});

after(async () => {
  await db.query("DELETE FROM cuentas WHERE email LIKE 'zznotif-%@example.com'");
  await db.query("DELETE FROM ajustes WHERE clave = 'prelanzamiento'");
  await db.end();
  if (instance) await instance.close();
  await fs.rm(tmpData, { recursive: true, force: true });
  await fs.rm(tmpPublic, { recursive: true, force: true });
});

const basic = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
const admSend = async (method, p, body) => {
  const r = await fetch(BASE + A + '/api' + p, {
    method, body: JSON.stringify(body ?? {}),
    headers: { authorization: basic, 'content-type': 'application/json', 'x-sr-admin': '1', origin: BASE },
  });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const admPost = (p, body) => admSend('POST', p, body);
const prelanzamiento = async (activo) => assert.equal((await admSend('PUT', '/ajustes/prelanzamiento', { valor: { activo } })).status, 200);

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
const notifs = async (id) => (await db.query('SELECT tipo, titulo, texto, leida FROM notificaciones WHERE cuenta_id = $1 ORDER BY id', [id])).rows;
const mailsA = (email) => mails.filter((m) => m.to === email);
// El email de "en revisión" sale sin esperar (como el aviso por Telegram): se espera un momento
const esperarMails = async (email, n) => { for (let i = 0; i < 50 && mailsA(email).length < n; i++) await new Promise((r) => setTimeout(r, 20)); return mailsA(email); };

// Cuenta con el email confirmado (el link del email abre la sesión) y los datos obligatorios; sin fotos ni verificación.
async function cuentaNueva() {
  const c = new Cliente();
  const email = `zznotif-${rand()}@example.com`;
  let r = await c.json('POST', '/api/cuenta/registro', {
    email, password: 'una-clave-larga-123', displayName: `Zz Notif ${rand()}`, fechaNacimiento: '1994-02-03', genero: 'mujer', tipo: 'acompanante', aceptaTerminos: true, mayorEdad: true,
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  r = await c.json('POST', '/api/cuenta/verificar-email', { token: tokenDe(email, '/cuenta/verificar') });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  c.id = r.body.cuenta.id; c.email = email;
  r = await c.json('PUT', '/api/cuenta/perfil', { provincia: 'provincia-de-cordoba', ciudad: 'cordoba', whatsapp: '+5493511234567' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return c;
}
const fotos = async (c, n = 3) => { for (let i = 0; i < n; i++) assert.equal((await c.subir('/api/cuenta/fotos', { foto: await jpeg() })).status, 201); };
const verificacion = async (c) => {
  const r = await c.subir('/api/cuenta/verificacion', { selfie: await jpeg({ r: 10, g: 200, b: 30 }), documento: await jpeg({ r: 30, g: 30, b: 200 }), dorso: await jpeg({ r: 200, g: 200, b: 30 }), consentimiento: '1', nombreCompleto: 'Zz Notif Prueba' });
  assert.ok(r.status === 200 || r.status === 201, JSON.stringify(r.body));
  return r.body.cuenta;
};

describe('avisos del perfil y la verificación (lib/avisos-cuenta.js)', () => {
  test('textos: en revisión, publicado (con y sin home provisoria), combinado y rechazos', () => {
    const r = avisos.enRevision();
    assert.equal(r.tipo, 'perfil_en_revision');
    assert.equal(r.texto, 'Recibimos tu perfil: lo estamos revisando. Te avisamos por acá y por email cuando esté listo.');
    assert.doesNotMatch(JSON.stringify(r.email), /por acá/, 'en el email, "por acá" sería el email');
    const pub = avisos.publicado({ prelanzamiento: false });
    assert.equal(pub.titulo, 'Tu perfil ya está publicado');
    assert.match(pub.texto, /Ya se ve en el sitio/);
    const pre = avisos.publicado({ prelanzamiento: true });
    assert.equal(pre.titulo, 'Tu perfil está aprobado');
    assert.ok(pre.texto.includes(ABRIMOS_PRONTO));
    for (const a of [pre, avisos.publicado({ prelanzamiento: true, verificada: true })]) {
      assert.doesNotMatch(a.titulo + a.texto + JSON.stringify(a.email), /ya se ve|ya está publicado|te pueden ver/i, 'con la home provisoria no dice que ya la ven');
    }
    assert.equal(avisos.publicado({ verificada: true }).titulo, 'Te verificamos y tu perfil ya está publicado');
    assert.equal(avisos.verificada({ estado: 'borrador' }).texto, 'Tu identidad quedó verificada. Cuando completes lo que falta en tu perfil, pasa solo a revisión.');
    assert.equal(avisos.verificada({ estado: 'publicado' }).texto, 'Tu identidad quedó verificada.');
    const rv = avisos.verificacionRechazada('Foto borrosa');
    assert.match(rv.texto, / Motivo: Foto borrosa$/, 'el motivo va al final (el panel lo muestra sin traducir)');
    assert.deepEqual(rv.email.parrafos, ['No pudimos aprobar tu verificación.', 'Motivo: Foto borrosa', 'Podés volver a enviar las fotos de tu documento y la selfie desde tu panel.']);
    // Nunca fechas ni promesas de aprobación
    for (const a of [r, pub, pre, avisos.verificada({ estado: 'borrador' }), rv, avisos.perfilRechazado('x')]) {
      assert.doesNotMatch(a.texto, /\b(hoy|mañana|horas|días|en breve te aprobamos|vas a ser aprobada)\b/i, a.texto);
    }
  });
});

describe('en revisión, verificación y publicación: notificación + email una sola vez', () => {
  test('en revisión: una notificación y un email por transición (guardar de nuevo no repite)', async () => {
    const c = await cuentaNueva();
    await fotos(c);
    assert.deepEqual(await notifs(c.id), [], 'sin la verificación todavía no está completo');
    const yo = await verificacion(c);
    assert.equal(yo.perfil.estado, 'en_revision');
    let n = await notifs(c.id);
    assert.deepEqual(n.map((x) => [x.tipo, x.titulo, x.texto]), [['perfil_en_revision', 'Recibimos tu perfil', 'Recibimos tu perfil: lo estamos revisando. Te avisamos por acá y por email cuando esté listo.']]);
    const m = await esperarMails(c.email, 1);
    assert.equal(m.length, 1);
    assert.equal(m[0].subject, 'Recibimos tu perfil');
    assert.match(m[0].text, /https:\/\/sexyrose\.net\/panel/);
    // Guardar otra vez (sigue en revisión) no vuelve a avisar
    assert.equal((await c.json('PUT', '/api/cuenta/perfil', { titular: 'Café y museos' })).status, 200);
    assert.equal((await c.get('/api/cuenta/yo')).status, 200);
    await new Promise((r) => setTimeout(r, 100));
    n = await notifs(c.id);
    assert.equal(n.length, 1);
    assert.equal(mailsA(c.email).length, 1);
  });

  test('aprobar la identidad de un perfil en revisión lo publica: UN aviso combinado y UN email', async () => {
    const c = await cuentaNueva();
    await fotos(c); await verificacion(c);
    await esperarMails(c.email, 1);
    const antes = mailsA(c.email).length; const nAntes = (await notifs(c.id)).length;
    const ap = await admPost(`/acompanantes/${c.id}/verificacion`, { decision: 'aprobar' });
    assert.equal(ap.status, 200, JSON.stringify(ap.body));
    assert.equal(ap.body.perfil.estado, 'publicado');
    const nuevas = (await notifs(c.id)).slice(nAntes);
    assert.deepEqual(nuevas.map((x) => [x.tipo, x.titulo]), [['perfil_publicado', 'Te verificamos y tu perfil ya está publicado']]);
    assert.equal(nuevas[0].texto, 'Revisamos tu verificación y tu perfil. Ya se ve en el sitio.');
    const m = mailsA(c.email).slice(antes);
    assert.equal(m.length, 1, 'un solo email para la aprobación y la publicación');
    assert.equal(m[0].subject, 'Te verificamos y tu perfil ya está publicado');
    assert.match(m[0].html, /Ver mi perfil/);
    assert.match(m[0].text, /https:\/\/sexyrose\.net\/panel\/mi-perfil/);
    // Otra aprobación: ya no hay verificación pendiente → 409, sin avisos nuevos
    assert.equal((await admPost(`/acompanantes/${c.id}/verificacion`, { decision: 'aprobar' })).status, 409);
    assert.equal((await notifs(c.id)).length, nAntes + 1);
    assert.equal(mailsA(c.email).length, antes + 1);
  });

  test('identidad aprobada con el perfil incompleto: "Te verificamos"; después en revisión y publicado por el admin (home provisoria: aprobado, abrimos muy pronto)', async () => {
    const c = await cuentaNueva();
    await verificacion(c); // le faltan las fotos: sigue en borrador
    assert.deepEqual(await notifs(c.id), []);
    let ap = await admPost(`/acompanantes/${c.id}/verificacion`, { decision: 'aprobar' });
    assert.equal(ap.status, 200);
    assert.equal(ap.body.perfil.estado, 'borrador');
    let n = await notifs(c.id);
    assert.deepEqual(n.map((x) => [x.tipo, x.titulo, x.texto]), [['verificacion_aprobada', 'Te verificamos', 'Tu identidad quedó verificada. Cuando completes lo que falta en tu perfil, pasa solo a revisión.']]);
    assert.deepEqual(mailsA(c.email).map((m) => m.subject), ['Te verificamos']);
    await fotos(c);
    await esperarMails(c.email, 2);
    n = await notifs(c.id);
    assert.deepEqual(n.map((x) => x.tipo), ['verificacion_aprobada', 'perfil_en_revision']);
    await prelanzamiento(true);
    try {
      ap = await admPost(`/acompanantes/${c.id}/estado`, { estado: 'publicado' });
      assert.equal(ap.status, 200, JSON.stringify(ap.body));
      n = await notifs(c.id);
      assert.equal(n.length, 3);
      assert.deepEqual([n[2].tipo, n[2].titulo], ['perfil_publicado', 'Tu perfil está aprobado']);
      assert.equal(n[2].texto, 'Revisamos tu perfil. Quedó aprobado. Todavía no se ve en el sitio: abrimos muy pronto.');
      const m = mailsA(c.email);
      assert.deepEqual(m.map((x) => x.subject), ['Te verificamos', 'Recibimos tu perfil', 'Tu perfil está aprobado']);
      assert.doesNotMatch(m[2].text, /ya se ve/i);
      // Publicar de nuevo (ya publicado): nada nuevo
      assert.equal((await admPost(`/acompanantes/${c.id}/estado`, { estado: 'publicado' })).status, 200);
      assert.equal((await notifs(c.id)).length, 3);
      assert.equal(mailsA(c.email).length, 3);
    } finally { await prelanzamiento(false); }
  });

  test('rechazos: verificación y perfil, con notificación (mismo texto que el email) y un solo email cada uno', async () => {
    const c = await cuentaNueva();
    await fotos(c); await verificacion(c);
    await esperarMails(c.email, 1);
    let r = await admPost(`/acompanantes/${c.id}/verificacion`, { decision: 'rechazar', motivo: 'La foto del documento salió borrosa' });
    assert.equal(r.status, 200);
    let n = await notifs(c.id);
    assert.deepEqual([n.at(-1).tipo, n.at(-1).titulo], ['verificacion_rechazada', 'Tu verificación no fue aprobada']);
    assert.equal(n.at(-1).texto, 'No pudimos aprobar tu verificación. Podés volver a enviar las fotos de tu documento y la selfie desde tu panel. Motivo: La foto del documento salió borrosa');
    let m = mailsA(c.email);
    assert.equal(m.length, 2);
    assert.equal(m[1].subject, 'Tu verificación no fue aprobada');
    assert.match(m[1].text, /Motivo: La foto del documento salió borrosa/);
    // Vuelve a mandar la verificación → en revisión otra vez (nueva transición, nuevo aviso)
    await verificacion(c);
    await esperarMails(c.email, 3);
    assert.equal((await notifs(c.id)).filter((x) => x.tipo === 'perfil_en_revision').length, 2);
    // El admin aprueba la identidad y después rechaza el perfil
    assert.equal((await admPost(`/acompanantes/${c.id}/verificacion`, { decision: 'aprobar' })).status, 200);
    r = await admPost(`/acompanantes/${c.id}/estado`, { estado: 'rechazado', motivo: 'Las fotos tienen texto encima' });
    assert.equal(r.status, 200);
    n = await notifs(c.id);
    assert.deepEqual([n.at(-1).tipo, n.at(-1).titulo], ['perfil_rechazado', 'Tu perfil no fue aprobado']);
    assert.match(n.at(-1).texto, /^No pudimos aprobar tu perfil\. .* Motivo: Las fotos tienen texto encima$/);
    m = mailsA(c.email);
    assert.equal(m.at(-1).subject, 'Tu perfil no fue aprobado');
    assert.equal(m.filter((x) => x.subject === 'Tu perfil no fue aprobado').length, 1);
    // Pausar no crea notificación (solo el email de siempre)
    const nAntes = (await notifs(c.id)).length;
    assert.equal((await admPost(`/acompanantes/${c.id}/estado`, { estado: 'pausado' })).status, 200);
    assert.equal((await notifs(c.id)).length, nAntes);
    assert.equal(mailsA(c.email).at(-1).subject, 'Tu perfil quedó pausado');
  });
});

describe('planes: "Ahora sos …"', () => {
  test('comprar Plata con créditos y el plan asignado por el admin dicen "Ahora sos …"; la renovación anticipada no', async () => {
    const c = await cuentaNueva();
    assert.equal((await admPost(`/creditos/${c.id}/ajuste`, { creditos: 200, motivo: 'Carga de prueba' })).status, 200);
    let r = await c.json('POST', '/api/cuenta/plan/comprar', { plan: 'D', periodo: 'mes' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    let n = (await notifs(c.id)).filter((x) => x.tipo === 'plan_comprado');
    assert.equal(n.at(-1).titulo, 'Ahora sos Plata');
    assert.match(n.at(-1).texto, /^Activaste Plata hasta el .+\. Se descontaron 35(\.00)? créditos\.$/);
    r = await c.json('POST', '/api/cuenta/plan/comprar', { plan: 'D', periodo: 'mes' }); // renovación anticipada
    assert.equal(r.status, 201, JSON.stringify(r.body));
    n = (await notifs(c.id)).filter((x) => x.tipo === 'plan_comprado');
    assert.equal(n.at(-1).titulo, null, 'ya era Plata: queda el título del tipo (Plan activado)');
    r = await admPost(`/acompanantes/${c.id}/plan`, { plan: 'C', dias: 10 });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    n = (await notifs(c.id)).filter((x) => x.tipo === 'plan_asignado');
    assert.equal(n.at(-1).titulo, 'Ahora sos Oro');
    // La API de la campana devuelve el título
    const api = await c.get('/api/cuenta/notificaciones?limite=8');
    assert.ok(api.body.items.some((x) => x.titulo === 'Ahora sos Oro'));
  });
});

describe('campana: API (misma fuente que Avisos)', () => {
  test('cantidad sin leer, lista corta, marcar una y todas; solo las suyas', async () => {
    const c = await cuentaNueva(); const otra = await cuentaNueva();
    for (let i = 0; i < 12; i++) await db.query("INSERT INTO notificaciones (cuenta_id, tipo, titulo, texto) VALUES ($1, 'creditos_acreditados', NULL, $2)", [c.id, `Acreditamos ${i + 1} créditos (pedido SR-${1000 + i}).`]);
    await db.query("INSERT INTO notificaciones (cuenta_id, tipo, titulo, texto) VALUES ($1, 'perfil_publicado', 'Tu perfil ya está publicado', 'Revisamos tu perfil. Ya se ve en el sitio.')", [otra.id]);
    let r = await c.get('/api/cuenta/notificaciones?limite=8');
    assert.equal(r.status, 200);
    assert.equal(r.body.items.length, 8);
    assert.equal(r.body.noLeidas, 12);
    assert.match(r.body.items[0].texto, /Acreditamos 12 créditos/, 'la más nueva primero');
    assert.ok('titulo' in r.body.items[0]);
    assert.equal((await c.get('/api/cuenta/yo')).body.cuenta.notificaciones.noLeidas, 12, 'el mismo contador que /cuenta/yo');
    assert.equal((await c.get('/api/cuenta/notificaciones?limite=1')).body.items.length, 1);
    assert.equal((await c.get('/api/cuenta/notificaciones?limite=x')).body.items.length, 12, 'límite inválido: 30 (como antes)');
    // Marcar una
    r = await c.json('POST', '/api/cuenta/notificaciones/leer', { ids: [r.body.items[0].id] });
    assert.equal(r.status, 200);
    assert.equal(r.body.noLeidas, 11);
    // Los ids de otra cuenta no se tocan
    const ajena = (await otra.get('/api/cuenta/notificaciones')).body.items[0];
    assert.equal((await c.json('POST', '/api/cuenta/notificaciones/leer', { ids: [ajena.id] })).body.noLeidas, 11);
    assert.equal((await otra.get('/api/cuenta/notificaciones')).body.noLeidas, 1);
    // Todas
    r = await c.json('POST', '/api/cuenta/notificaciones/leer', {});
    assert.equal(r.body.noLeidas, 0);
    assert.equal((await c.get('/api/cuenta/yo')).body.cuenta.notificaciones.noLeidas, 0);
    assert.equal((await otra.get('/api/cuenta/notificaciones')).body.noLeidas, 1);
    // Sin sesión: 401; marcar exige X-SR
    assert.equal((await new Cliente().get('/api/cuenta/notificaciones')).status, 401);
    const sinXsr = await fetch(BASE + '/api/cuenta/notificaciones/leer', { method: 'POST', headers: { origin: BASE, cookie: c.cookie, 'content-type': 'application/json' }, body: '{}' });
    assert.equal(sinXsr.status, 403);
  });
});

describe('panel (prod-sitio.js): ingreso → Resumen, avisos y campana', () => {
  const sitio = () => fs.readFile(SITIO, 'utf8');
  const trozo = (s, desde, hasta) => { const i = s.indexOf(desde); assert.ok(i >= 0, desde); const j = s.indexOf(hasta, i); assert.ok(j > i, hasta); return s.slice(i, j + hasta.length); };

  test('después de ingresar va a Resumen; vuelve a una página del panel solo si la mandamos a ingresar desde ahí hace poco', async () => {
    const s = await sitio();
    const f = trozo(s, '  const NEXT_VIGENCIA', '\n  }\n');
    const ctx = { HH: { ui: {}, save() { ctx.guardado = true; } }, Date };
    vm.createContext(ctx); vm.runInContext(f + 'this.destino = destinoIngreso;', ctx);
    const d = (next, haceMs) => { ctx.HH.ui = { next, nextAt: next == null ? null : Date.now() - haceMs }; const r = ctx.destino(); assert.equal(ctx.HH.ui.next, null, 'se consume'); return r; };
    assert.equal(d(null, 0), '#panel');
    assert.equal(d('panel.vista-previa', 60 * 1000), '#panel.vista-previa');
    assert.equal(d('#panel.plan', 60 * 1000), '#panel.plan');
    assert.equal(d('panel.avisos', 2 * 3600 * 1000), '#panel', 'un destino viejo (sesión vencida hace horas) no cuenta');
    assert.equal(d('panel', 1000), '#panel');
    assert.equal(d('inicio', 1000), '#panel');
    assert.equal(d('cliente.pedidos', 1000), '#panel');
    ctx.HH.ui = { next: 'panel.plan' }; assert.equal(ctx.destino(), '#panel', 'sin la hora en que se guardó (versión anterior) no cuenta');
    // Ingreso con contraseña, link de contraseña nueva y confirmación del email: todos a Resumen
    const login = trozo(s, '    async spLogin(form, ev, data) {', '\n    },\n');
    assert.match(login, /HH\.go\(destinoIngreso\(\)\)/);
    assert.match(trozo(s, '    async spRestablecer(form, ev, data) {', '\n    },\n'), /destinoIngreso\(\)/);
    assert.match(trozo(s, '  function verificarView() {', '\n  }\n'), /HH\.go\('#panel', \{ replace: true \}\)/);
    // El destino se guarda con la hora solo cuando el panel la manda a ingresar
    assert.match(s, /HH\.ui\.next = HH\.currentHash\(\); HH\.ui\.nextAt = Date\.now\(\); HH\.save\(\); HH\.go\('#login'/);
    // Los primeros pasos se siguen abriendo solos desde el panel
    assert.match(s, /if \(S\.yo\.guia && S\.yo\.guia\.abrir && !S\.guiaVista\)/);
  });

  test('cada tipo de aviso tiene ícono, título, link a su sección y traducción', async () => {
    const s = await sitio();
    const N = trozo(s, '  const NOTIF = {', '\n  };\n'); const L = trozo(s, '  const NOTIF_LINK = {', ' };\n');
    const ctx = {}; vm.createContext(ctx); vm.runInContext(N + L + 'this.N = NOTIF; this.L = NOTIF_LINK;', ctx);
    const tipos = ['perfil_en_revision', 'verificacion_aprobada', 'perfil_publicado', 'verificacion_rechazada', 'perfil_rechazado', 'plan_comprado', 'plan_asignado', 'creditos_acreditados'];
    for (const t of tipos) { assert.ok(ctx.N[t], 'ícono y título: ' + t); assert.ok(ctx.L[t], 'link: ' + t); }
    assert.equal(ctx.L.perfil_en_revision, 'resumen');
    assert.equal(ctx.L.verificacion_aprobada, 'verificacion');
    assert.equal(ctx.L.perfil_publicado, 'mi-perfil');
    assert.equal(ctx.L.plan_comprado, 'plan');
    // Todo lo que el servidor puede mandar (títulos y textos) se traduce
    const textos = [avisos.enRevision(), avisos.verificada({ estado: 'borrador' }), avisos.verificada({ estado: 'publicado' }),
      ...[false, true].flatMap((pre) => [avisos.publicado({ prelanzamiento: pre }), avisos.publicado({ prelanzamiento: pre, verificada: true })])]
      .flatMap((a) => [a.titulo, a.texto]);
    for (const a of [avisos.verificacionRechazada('x'), avisos.perfilRechazado('x')]) textos.push(a.titulo, a.texto.slice(0, a.texto.indexOf(' Motivo: ')));
    for (const t of [...new Set(textos)]) assert.ok(s.includes(`['${t}', '`), 'falta traducción: ' + t);
    assert.ok(s.includes("['Ahora sos {P}', 'You are now {P}', 'Agora você é {P}']"));
    for (const t of ['Notificaciones: {n} sin leer', 'Marcar todas como leídas', 'No tenés notificaciones', 'Recién', 'Hace {n} min', 'Hace {n} h', 'Hace {n} días']) assert.ok(s.includes(`['${t}', '`), 'falta traducción: ' + t);
  });

  test('campana: solo con la sesión de una acompañante, con la cantidad sin leer (hasta 9+), la lista corta y "Ver todos"', async () => {
    const s = await sitio();
    // Se agrega al encabezado solo con su sesión (logged = !!S.yo), al lado del botón de Mi cuenta (☰ / su foto)
    assert.match(s, /const logged = !!S\.yo;/);
    assert.match(s, /if \(actions && logged && !actions\.querySelector\('\.sp-bell'\)\) \{ const b = actions\.querySelector\('\[data-action="openUserMenu"\]'\); if \(b\) b\.insertAdjacentHTML\('beforebegin', campanaBtn\(\)\); \}/);
    assert.match(s, /if \(!logged\) campanaCerrar\(false\);/);
    assert.match(trozo(s, '  function campanaAbrir() {', '\n  }\n'), /if \(!S\.yo\) return;/);
    // Interesados (prod-clientes.js) no tienen notificaciones: no hay campana ahí
    assert.doesNotMatch(await fs.readFile(path.join(HERE, '..', '..', 'mvp', 'src', 'prod-clientes.js'), 'utf8'), /sp-bell|campana/i);
    // Cantidad: hasta 9+
    const ctx = { S: { yo: { notificaciones: { noLeidas: 0 } } }, CAMP: { abierta: false }, icon: () => '<svg></svg>' };
    vm.createContext(ctx);
    vm.runInContext('const noLeidas = () => (S.yo && S.yo.notificaciones && Number(S.yo.notificaciones.noLeidas)) || 0;\n'
      + trozo(s, '  const campN = ', ';\n') + trozo(s, '  function campanaBtn() {', '\n  }\n') + 'this.btn = campanaBtn;', ctx);
    assert.doesNotMatch(ctx.btn(), /sp-bell-n/);
    assert.match(ctx.btn(), /aria-label="Notificaciones"/);
    ctx.S.yo.notificaciones.noLeidas = 3; assert.match(ctx.btn(), /<span class="sp-bell-n num" aria-hidden="true">3<\/span>/);
    assert.match(ctx.btn(), /aria-label="Notificaciones: 3 sin leer"/);
    ctx.S.yo.notificaciones.noLeidas = 14; assert.match(ctx.btn(), />9\+</);
    // Lista: las últimas 8 de la misma API que Avisos; "Ver todos" lleva a Avisos
    assert.match(s, /const CAMP_LIM = 8;/);
    assert.match(s, /api\('GET', '\/cuenta\/notificaciones\?limite=' \+ CAMP_LIM\)/);
    assert.match(trozo(s, '  function campanaHtml() {', '\n  }\n'), /data-go="#panel\.avisos"/);
    // Sin consultas periódicas: al volver a la pestaña, como mucho una vez por minuto
    assert.doesNotMatch(trozo(s, '  const CAMP_LIM', '  function panelCuenta() {'), /setInterval/);
    assert.match(s, /document\.addEventListener\('visibilitychange', campanaVolver\)/);
    // Estilos: celular de lado a lado, sin tapar la barra inferior; computadora colgado de la campana
    const css = await fs.readFile(path.join(HERE, '..', '..', 'mvp', 'src', 'sitio.css'), 'utf8');
    assert.match(css, /\.sp-bell-panel\{position:fixed/);
    assert.match(css, /env\(safe-area-inset-bottom,0px\) - 96px/);
  });
});
