// Endurecimientos de la auditoría de seguridad (13/11/2026):
// IP real detrás de cloudflared, semáforo de scrypt, límites de ingreso, JWT de Cloudflare Access en el admin,
// HSTS, token de recuperación consumido en un solo paso, ffmpeg/ffprobe solo con archivos y formatos de video,
// firma de Mercado Pago con tolerancia de 10 minutos y EXIF fuera de las fotos de verificación.
//   DATABASE_URL=postgres://... node --test test/seguridad.test.js
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import sharp from 'sharp';
import { start, createRateLimiter } from '../server.js';
import { mailsEnviados } from '../lib/mail.js';
import { crearIpCliente, crearSemaforo, crearCfAccess, crearLimitesAuth, OcupadoError, esIpPrivada } from '../lib/seguridad.js';
import { firmar, firmaValida } from '../lib/mercadopago.js';
import { analizar, ENTRADA_SEGURA } from '../lib/videos.js';
import { procesarPrivada } from '../lib/imagenes.js';
import { TOLERANCIA_FIRMA_SEG } from '../lib/contenido.js';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('Falta DATABASE_URL.'); process.exit(1); }
const rand = () => crypto.randomBytes(4).toString('hex');

// --- Cloudflare Access de prueba: clave RSA propia y "certs" servidos por un fetch simulado -------------------------
const TEAM = 'zzequipo.cloudflareaccess.com';
const AUD = 'aud-' + 'a'.repeat(40);
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const KID = 'kid-1';
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256', use: 'sig' };
let certsPedidos = 0;
let certs = { keys: [jwk] };
const fetchCerts = async (url) => {
  certsPedidos++;
  assert.equal(url, `https://${TEAM}/cdn-cgi/access/certs`);
  return { ok: true, status: 200, json: async () => certs };
};
function jwt(payload, { kid = KID, clave = privateKey, alg = 'RS256' } = {}) {
  const h = Buffer.from(JSON.stringify({ alg, kid, typ: 'JWT' })).toString('base64url');
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const firma = crypto.sign('RSA-SHA256', Buffer.from(h + '.' + p), clave).toString('base64url');
  return `${h}.${p}.${firma}`;
}
const ahoraS = () => Math.floor(Date.now() / 1000);
const tokenValido = (over = {}) => jwt({ aud: [AUD], iss: `https://${TEAM}`, email: 'juan@example.com', exp: ahoraS() + 600, iat: ahoraS(), nbf: ahoraS() - 5, ...over });

describe('piezas sueltas', () => {
  test('IP real: CF-Connecting-IP solo si la conexión viene de la red interna', () => {
    const ipDe = crearIpCliente('privada');
    const req = (remota, cf) => ({ socket: { remoteAddress: remota }, headers: cf ? { 'cf-connecting-ip': cf } : {} });
    assert.equal(ipDe(req('172.18.0.5', '200.1.2.3')), '200.1.2.3', 'cloudflared en la red de Docker');
    assert.equal(ipDe(req('::ffff:127.0.0.1', '200.1.2.3')), '200.1.2.3');
    assert.equal(ipDe(req('190.10.10.10', '1.1.1.1')), '190.10.10.10', 'directo desde internet: la cabecera no se cree');
    assert.equal(ipDe(req('172.18.0.5', 'no-es-ip')), '172.18.0.5');
    assert.equal(crearIpCliente('nunca')(req('172.18.0.5', '200.1.2.3')), '172.18.0.5');
    assert.ok(esIpPrivada('10.0.0.1') && esIpPrivada('192.168.1.1') && esIpPrivada('fd00::1') && esIpPrivada('::1'));
    assert.ok(!esIpPrivada('8.8.8.8') && !esIpPrivada('172.32.0.1') && !esIpPrivada('2001:db8::1'));
  });

  test('semáforo: como mucho N a la vez y, con la cola llena, 503', async () => {
    const sem = crearSemaforo(2, 3);
    let activos = 0; let max = 0;
    const tarea = () => sem.correr(async () => { activos++; max = Math.max(max, activos); await new Promise((r) => setTimeout(r, 20)); activos--; return 1; });
    const r = await Promise.allSettled(Array.from({ length: 6 }, tarea));
    assert.equal(max, 2);
    assert.equal(r.filter((x) => x.status === 'fulfilled').length, 5, '2 corriendo + 3 en cola');
    const rech = r.find((x) => x.status === 'rejected');
    assert.ok(rech.reason instanceof OcupadoError); assert.equal(rech.reason.status, 503);
  });

  test('límites de ingreso: duro por IP y por (IP, email); por email solo demora', async () => {
    const mem = new Map();
    const rl = {
      allowed: (k, n) => (mem.get(k) || 0) < n, hit: (k) => mem.set(k, (mem.get(k) || 0) + 1), count: (k) => mem.get(k) || 0, retryAfterSec: () => 9,
    };
    const demoras = [];
    const lim = crearLimitesAuth(rl, { prefijo: 't', porIp: 5, porIpYEmail: 3, demoraDesde: 2, dormirImpl: async (ms) => demoras.push(ms) });
    const res = () => ({ h: {}, s: 0, b: null, set(k, v) { this.h[k] = v; }, status(s) { this.s = s; return this; }, json(b) { this.b = b; return this; } });
    // Muchas IPs contra un email: nunca se corta
    for (let i = 0; i < 10; i++) { assert.equal(await lim.revisar({}, res(), { ip: 'ip' + i, email: 'v@x' }), true); lim.fallo({ ip: 'ip' + i, email: 'v@x' }); }
    assert.ok(demoras.length >= 8 && demoras.at(-1) >= demoras[0]);
    // Una IP: 3 fallos con ese email → corta
    for (let i = 0; i < 3; i++) lim.fallo({ ip: 'mala', email: 'otra@x' });
    const r = res();
    assert.equal(await lim.revisar({}, r, { ip: 'mala', email: 'otra@x' }), false);
    assert.equal(r.s, 429); assert.equal(r.h['Retry-After'], '9');
  });

  test('Cloudflare Access: firma, aud, iss, vencimiento y claves rotadas', async () => {
    certsPedidos = 0; certs = { keys: [jwk] };
    const cf = crearCfAccess({ teamDomain: TEAM, aud: AUD, fetchImpl: fetchCerts });
    assert.ok((await cf.validar(tokenValido())).ok);
    assert.equal(certsPedidos, 1);
    assert.ok((await cf.validar(tokenValido())).ok); assert.equal(certsPedidos, 1, 'las claves quedan en caché');
    assert.equal((await cf.validar(tokenValido({ aud: ['otra'] }))).motivo, 'aud');
    assert.equal((await cf.validar(tokenValido({ iss: 'https://otro.cloudflareaccess.com' }))).motivo, 'iss');
    assert.equal((await cf.validar(tokenValido({ exp: ahoraS() - 3600 }))).motivo, 'vencido');
    assert.equal((await cf.validar(tokenValido({ nbf: ahoraS() + 3600 }))).motivo, 'todavía no vale');
    const otra = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    assert.equal((await cf.validar(jwt({ aud: [AUD], iss: `https://${TEAM}`, exp: ahoraS() + 60 }, { clave: otra }))).motivo, 'firma');
    assert.equal((await cf.validar(jwt({ aud: [AUD] }, { alg: 'HS256' }))).motivo, 'algoritmo');
    assert.equal((await cf.validar('no.es.jwt')).ok, false);
    assert.equal((await cf.validar('')).ok, false);
    // Rotación: aparece un kid nuevo → se vuelven a pedir las claves
    const nueva = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    certs = { keys: [jwk, { ...nueva.publicKey.export({ format: 'jwk' }), kid: 'kid-2' }] };
    assert.ok((await cf.validar(jwt({ aud: [AUD], iss: `https://${TEAM}`, exp: ahoraS() + 60 }, { kid: 'kid-2', clave: nueva.privateKey }))).ok);
    assert.equal(certsPedidos, 2);
  });

  test('Cloudflare Access sin configurar: sigue (con aviso) salvo que sea obligatorio', async () => {
    const avisos = [];
    const libre = crearCfAccess({ log: (m) => avisos.push(m) });
    let paso = false;
    await libre.middleware({ headers: {} }, {}, () => { paso = true; });
    assert.ok(paso); assert.match(avisos[0], /no valida Cloudflare Access/);
    const cerrado = crearCfAccess({ requerido: true, log: () => {} });
    const res = { s: 0, status(s) { this.s = s; return this; }, type() { return this; }, send() { return this; } };
    await cerrado.middleware({ headers: {} }, res, () => assert.fail('no tenía que pasar'));
    assert.equal(res.s, 503);
  });

  test('Mercado Pago: la firma vieja (más de 10 minutos) no vale', () => {
    assert.equal(TOLERANCIA_FIRMA_SEG, 600);
    const ok = (ts) => firmaValida({ secret: 's', header: `ts=${ts},v1=${firmar('s', { dataId: 'p1', requestId: 'r', ts })}`, requestId: 'r', dataId: 'p1', toleranciaSeg: TOLERANCIA_FIRMA_SEG });
    assert.ok(ok(String(ahoraS())));
    assert.ok(!ok(String(ahoraS() - 20 * 60)));
    assert.ok(!ok(String(ahoraS() + 20 * 60)));
  });

  test('ffmpeg/ffprobe: solo archivos locales y formatos de video (una lista HLS disfrazada se rechaza)', async () => {
    assert.deepEqual(ENTRADA_SEGURA.slice(0, 2), ['-protocol_whitelist', 'file']);
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-ff-'));
    try {
      const falso = path.join(dir, 'video.mp4');
      await fs.writeFile(falso, '#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXTINF:1,\nfile:///etc/passwd\n#EXT-X-ENDLIST\n');
      await assert.rejects(analizar(falso), /no es un video válido/);
      const bueno = path.join(dir, 'bueno.mp4');
      const r = spawnSync('ffmpeg', ['-nostdin', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=10', '-t', '2', '-pix_fmt', 'yuv420p', bueno]);
      assert.equal(r.status, 0, String(r.stderr));
      const a = await analizar(bueno);
      assert.ok(a.duracion > 1.5 && a.ancho === 320);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  test('fotos de verificación: sin EXIF ni GPS', async () => {
    const con = await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 1, g: 2, b: 3 } } })
      .jpeg().withExif({ IFD0: { Artist: 'gps-secreto', Copyright: 'dato-exif' } }).toBuffer();
    assert.ok((await sharp(con).metadata()).exif);
    const out = await procesarPrivada(con);
    const meta = await sharp(out.buffer).metadata();
    assert.ok(!meta.exif, 'sin EXIF');
    assert.ok(!out.buffer.includes(Buffer.from('gps-secreto')));
  });
});

describe('segunda pasada (13/11/2026)', () => {
  test('Cloudflare Access: cabecera o cuerpo que no son objetos, kid raro y cookie mal codificada → 403, nunca error 500', async () => {
    const cf = crearCfAccess({ teamDomain: TEAM, aud: AUD, fetchImpl: fetchCerts });
    const firmar = (cab, cuerpo) => { const s = Buffer.from(cab).toString('base64url') + '.' + Buffer.from(cuerpo).toString('base64url'); return s + '.' + crypto.sign('RSA-SHA256', Buffer.from(s), privateKey).toString('base64url'); };
    for (const t of [
      firmar(JSON.stringify({ alg: 'RS256', kid: KID }), 'null'),
      firmar(JSON.stringify({ alg: 'RS256', kid: KID }), '[1,2]'),
      firmar('null', JSON.stringify({ aud: AUD })),
      firmar(JSON.stringify({ alg: 'RS256', kid: { x: 1 } }), JSON.stringify({ aud: AUD })),
    ]) assert.equal((await cf.validar(t)).ok, false);
    let estado = 0; let error = null;
    const res = { status(s) { estado = s; return this; }, type() { return this; }, send() { return this; } };
    await cf.middleware({ headers: { cookie: 'CF_Authorization=%E0%A4%A' } }, res, (e) => { error = e || 'siguió'; });
    assert.equal(error, null); assert.equal(estado, 403);
  });

  test('límite en memoria: con muchísimas claves distintas no crece sin tope', () => {
    const rl = createRateLimiter();
    for (let i = 0; i < 100005; i++) rl.hit('k' + i);
    assert.ok(rl.size() <= 100000, 'tope de claves');
    rl.hit('nueva'); assert.equal(rl.count('nueva', 60000), 1);
  });
});

describe('servidor', () => {
  const db = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
  let instance; let BASE; let tmpData; let tmpPublic;
  const ADMIN = '/panel-zzsec-1234567890';
  const basic = { authorization: 'Basic ' + Buffer.from('zzsecadmin:clave-larga-zzsec-123').toString('base64') };

  before(async () => {
    tmpData = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-sec-'));
    tmpPublic = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-sec-pub-'));
    await fs.writeFile(path.join(tmpPublic, 'index.html'), '<!doctype html><title>x</title>');
    certs = { keys: [jwk] };
    instance = await start({
      port: 0, host: '127.0.0.1', databaseUrl: DATABASE_URL, publicDir: tmpPublic, dataDir: tmpData, storage: 'local',
      adminUser: 'zzsecadmin', adminPassword: 'clave-larga-zzsec-123', adminPath: ADMIN, ipHashSalt: 'sal', siteUrl: 'https://sexyrose.net',
      telegramToken: '', telegramChatId: '', mailgunApiKey: '', tareaPlanes: false, log: () => {},
      cfAccessTeamDomain: TEAM, cfAccessAud: AUD, cfAccessFetch: fetchCerts,
    });
    BASE = `http://127.0.0.1:${instance.port}`;
    await instance.ready;
  });
  after(async () => {
    await db.query("DELETE FROM cuentas WHERE email LIKE 'zzsec-%@example.com'");
    await db.end();
    if (instance) await instance.close();
    await fs.rm(tmpData, { recursive: true, force: true });
    await fs.rm(tmpPublic, { recursive: true, force: true });
  });

  test('HSTS en las respuestas (el sitio es https)', async () => {
    const r = await fetch(BASE + '/healthz');
    assert.equal(r.headers.get('strict-transport-security'), 'max-age=31536000; includeSubDomains');
  });

  test('admin: sin el JWT de Cloudflare Access → 403 (aunque la contraseña sea correcta); con JWT válido → entra', async () => {
    const ip = { 'cf-connecting-ip': '203.0.113.' + (1 + Math.floor(Math.random() * 200)) };
    assert.equal((await fetch(BASE + ADMIN + '/', { headers: { ...basic, ...ip } })).status, 403);
    assert.equal((await fetch(BASE + ADMIN + '/', { headers: { ...basic, ...ip, 'cf-access-jwt-assertion': tokenValido({ aud: ['otra'] }) } })).status, 403);
    const ok = await fetch(BASE + ADMIN + '/', { headers: { ...basic, ...ip, 'cf-access-jwt-assertion': tokenValido() } });
    assert.notEqual(ok.status, 403); assert.notEqual(ok.status, 401);
    // También con la cookie CF_Authorization
    const ok2 = await fetch(BASE + ADMIN + '/api/resumen', { headers: { ...basic, ...ip, cookie: 'CF_Authorization=' + tokenValido() } });
    assert.equal(ok2.status, 200);
    // JWT bien pero sin usuario y contraseña → 401 (las capas se suman)
    assert.equal((await fetch(BASE + ADMIN + '/api/resumen', { headers: { ...ip, 'cf-access-jwt-assertion': tokenValido() } })).status, 401);
  });

  test('restablecer contraseña: dos pedidos a la vez con el mismo link → solo uno funciona', async () => {
    const email = `zzsec-${rand()}@example.com`;
    const h = { 'content-type': 'application/json', origin: BASE, 'x-sr': '1', 'cf-connecting-ip': '198.51.100.' + (1 + Math.floor(Math.random() * 200)) };
    const post = (p, b) => fetch(BASE + p, { method: 'POST', headers: h, body: JSON.stringify(b) });
    const r = await post('/api/cuenta/registro', {
      email, password: 'una-clave-larga-123', displayName: `Zz Sec ${rand()}`, fechaNacimiento: '1994-02-03', genero: 'mujer', tipo: 'acompanante', aceptaTerminos: true, mayorEdad: true,
    });
    assert.equal(r.status, 201);
    assert.equal((await post('/api/cuenta/olvide', { email })).status, 200);
    const m = [...mailsEnviados].reverse().find((x) => x.to === email && x.links.some((l) => l.includes('/cuenta/restablecer')));
    const token = new URL(m.links.find((l) => l.includes('/cuenta/restablecer'))).searchParams.get('token');
    const [a, b] = await Promise.all([
      post('/api/cuenta/restablecer', { token, password: 'clave-nueva-uno-11' }),
      post('/api/cuenta/restablecer', { token, password: 'clave-nueva-dos-22' }),
    ]);
    const estados = [a.status, b.status].sort();
    assert.deepEqual(estados, [200, 400]);
  });
  test('registro con un email que ya tiene cuenta: misma respuesta y como mucho 1 aviso por hora a la dueña (no sirve para spam)', async () => {
    const email = `zzsec-${rand()}@example.com`;
    const reg = (ip) => fetch(BASE + '/api/cuenta/registro', { method: 'POST', headers: { 'content-type': 'application/json', origin: BASE, 'x-sr': '1', 'cf-connecting-ip': ip }, body: JSON.stringify({
      email, password: 'una-clave-larga-123', displayName: `Zz Sec ${rand()}`, fechaNacimiento: '1994-02-03', genero: 'mujer', tipo: 'acompanante', aceptaTerminos: true, mayorEdad: true,
    }) });
    const r1 = await reg('192.0.2.11');
    const r2 = await reg('192.0.2.12');
    const r3 = await reg('192.0.2.13');
    assert.equal(r1.status, 201); assert.equal(r2.status, 201); assert.equal(r3.status, 201);
    const [j1, j2] = [await r1.json(), await r2.json()];
    assert.deepEqual(j1, j2, 'misma respuesta exista o no');
    const avisos = mailsEnviados.filter((m) => m.to === email && /intentó crear una cuenta/.test(m.subject));
    assert.equal(avisos.length, 1, 'un solo aviso por hora aunque lo intenten desde varias IPs');
  });
});
