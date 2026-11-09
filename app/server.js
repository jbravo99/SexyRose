// SexyRose v1-lanzamiento: sitio estático, API de pre-registro y denuncias, admin mínimo y demo.
// Un solo servicio Node 22 (Express + pg). Ver V1-CONTRATO.md en la raíz del repo.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import pg from 'pg';
import { COMUN_PAGE, MAX_VALOR, TEXT_PAGES, aplicarTextos, escapeHtml, extraerBloques, limpiarValor } from './textos.js';
import { createAuth, sameOrigin as mismoOrigen } from './lib/auth.js';
import { configurarMail, emailBasico, sendMail as enviarMail } from './lib/mail.js';
import { invalidarCatalogos } from './lib/catalogos.js';
import * as storage from './lib/storage.js';
import { createCuentaRouter } from './routes/cuenta.js';
import { createSitioRouter, invalidarSitio } from './routes/sitio.js';

// ---- Fase 1 (agente B): imports ----
import { createPlanes } from './lib/planes.js';
import { createPrivado } from './lib/privado.js';
import { createAdminFase1Router } from './routes/admin-fase1.js';
import { createCuentaPlanesRouter } from './routes/cuenta-planes.js';
import { createSpaSitioRouter } from './routes/spa-sitio.js';
// ---- fin Fase 1 (agente B): imports ----
export { escapeHtml };

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const TZ = 'America/Argentina/Buenos_Aires';

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------
export function loadConfig(env = process.env) {
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  return {
    port: Number.parseInt(env.PORT, 10) || 3000,
    host: str(env.HOST) || '0.0.0.0',
    databaseUrl: str(env.DATABASE_URL),
    adminUser: str(env.ADMIN_USER),
    adminPassword: typeof env.ADMIN_PASSWORD === 'string' ? env.ADMIN_PASSWORD : '',
    adminPath: str(env.ADMIN_PATH),
    ipHashSalt: typeof env.IP_HASH_SALT === 'string' ? env.IP_HASH_SALT : '',
    siteUrl: (str(env.SITE_URL) || 'https://sexyrose.net').replace(/\/+$/, ''),
    operatorName: str(env.OPERATOR_NAME) || 'SexyRose',
    contactEmail: str(env.CONTACT_EMAIL) || 'contacto@sexyrose.net',
    reportEmail: str(env.REPORT_EMAIL) || 'contacto@sexyrose.net',
    privacyEmail: str(env.PRIVACY_EMAIL) || 'contacto@sexyrose.net',
    telegramToken: str(env.TELEGRAM_BOT_TOKEN),
    telegramChatId: str(env.TELEGRAM_CHAT_ID),
    publicDir: path.resolve(str(env.PUBLIC_DIR) || path.join(HERE, 'public')),
    schemaPath: path.join(HERE, 'db', 'schema.sql'),
    // Todos los .sql de esta carpeta se aplican en orden alfabético en cada arranque (son idempotentes).
    dbDir: path.join(HERE, 'db'),
    // Fase 1: archivos subidos (DATA_DIR/media público si STORAGE=local; DATA_DIR/privado siempre privado).
    dataDir: path.resolve(str(env.DATA_DIR) || path.join(HERE, '..', 'data')),
    storage: str(env.STORAGE) === 'bunny' ? 'bunny' : 'local',
    bunnyStorageZone: str(env.BUNNY_STORAGE_ZONE),
    bunnyStorageKey: str(env.BUNNY_STORAGE_KEY),
    bunnyStorageHost: str(env.BUNNY_STORAGE_HOST) || 'storage.bunnycdn.com',
    bunnyCdnUrl: str(env.BUNNY_CDN_URL).replace(/\/+$/, ''),
    mailgunApiKey: str(env.MAILGUN_API_KEY),
    mailgunDomain: str(env.MAILGUN_DOMAIN) || 'mg.sexyrose.net',
    mailgunApiBase: str(env.MAILGUN_API_BASE) || 'https://api.eu.mailgun.net',
    mailFrom: str(env.MAIL_FROM) || 'SexyRose <no-responder@sexyrose.net>',
    // Cookie de sesión con Secure: por defecto si SITE_URL es https. COOKIE_SECURE=0/1 para forzarlo.
    cookieSecure: str(env.COOKIE_SECURE) === '' ? undefined : str(env.COOKIE_SECURE) === '1',
    // Panel de administración (SPA del MVP) generado por app/scripts/build-admin.py.
    adminSpaPath: path.resolve(str(env.ADMIN_SPA_PATH) || path.join(HERE, 'admin-spa', 'index.html')),
    fechaLegal: '4 de noviembre de 2026',
    log: (...a) => console.log(new Date().toISOString(), ...a),
  };
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
const sha256 = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest();

const escapeXml = escapeHtml;

export function csvCell(v) {
  let s = v == null ? '' : String(v);
  // Inyección de fórmulas en planillas: neutralizar celdas que empiezan con = + - @ (o tab / CR).
  if (/^[=+\-@\t\r]/.test(s) || /^\s+[=+\-@]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

export function toCsv(header, rows) {
  return '\uFEFF' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

// Igualdad en tiempo constante (se comparan los hashes para no filtrar la longitud).
function safeEqual(a, b) {
  return crypto.timingSafeEqual(sha256(a), sha256(b));
}

const fmtShort = new Intl.DateTimeFormat('es-AR', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' });
const fmtIso = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, dateStyle: 'short', timeStyle: 'medium' });
const fmtDate = (d) => (d ? fmtShort.format(new Date(d)) : '');
const fmtCsvDate = (d) => (d ? fmtIso.format(new Date(d)) : '');

const BIDI_AND_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

// Texto de una línea: sin caracteres de control, espacios colapsados.
function cleanLine(v) {
  if (typeof v === 'number' && Number.isFinite(v)) v = String(v);
  if (typeof v !== 'string') return '';
  return v.normalize('NFC').replace(BIDI_AND_CONTROL, '').replace(/[\t\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Texto multilínea: conserva saltos de línea.
function cleanText(v) {
  if (typeof v !== 'string') return '';
  return v.normalize('NFC').replace(/\r\n?/g, '\n').replace(BIDI_AND_CONTROL, '').replace(/\n{4,}/g, '\n\n\n').trim();
}

const len = (s) => [...s].length;
const isTrue = (v) => v === true || v === 'true' || v === 'on' || v === 1 || v === '1';
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const honeypotFilled = (v) => (typeof v === 'string' ? v.trim() !== '' : v != null && v !== false && v !== '');
const EMAIL_RE = /^[^\s@<>()[\]",;:\\]+@[^\s@<>()[\]",;:\\]+\.[^\s@<>()[\]",;:\\]{2,}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizePhone(s) {
  if (/[^0-9+\s().-]/.test(s)) return null;
  if (s.indexOf('+') > 0 || (s.match(/\+/g) || []).length > 1) return null;
  const digits = s.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
  return (s.startsWith('+') ? '+' : '') + digits;
}

// Dirección secreta del admin (ADMIN_PATH): "/" + al menos 16 caracteres a-z, 0-9 o "-".
// Misma regla que infra/server/admin-path.sh.
export function validAdminPath(p) {
  return typeof p === 'string' && /^\/[a-z0-9-]{16,}$/.test(p);
}

function validEmail(s) {
  return s.length <= 254 && EMAIL_RE.test(s);
}

// ---------------------------------------------------------------------------
// Validación
// ---------------------------------------------------------------------------
const GENEROS = ['mujer', 'trans', 'hombre'];
const CONTACTO_TIPOS = ['whatsapp', 'telegram', 'email'];
const PLANES = ['bronce', 'plata', 'oro', 'platino', 'diamante', 'star', 'no_se'];
const PLAN_LABEL = { bronce: 'Bronce', plata: 'Plata', oro: 'Oro', platino: 'Platino', diamante: 'Diamante', star: 'Star', no_se: 'Todavía no sabe' };
const CATEGORIAS = ['abuso_infantil', 'imagen_sin_consentimiento', 'trata', 'otro'];
const CATEGORIA_LABEL = {
  abuso_infantil: 'Abuso sexual infantil',
  imagen_sin_consentimiento: 'Imagen íntima sin consentimiento',
  trata: 'Trata de personas',
  otro: 'Otro',
};
const CATEGORIAS_URGENTES = new Set(['abuso_infantil', 'imagen_sin_consentimiento', 'trata']);

export function validatePreregistro(b) {
  const nombre = cleanLine(b.nombre_artistico);
  if (!nombre) return { error: 'Ingresá tu nombre artístico.' };
  if (len(nombre) < 2 || len(nombre) > 40) return { error: 'El nombre artístico tiene que tener entre 2 y 40 caracteres.' };

  const genero = cleanLine(b.genero).toLowerCase();
  if (!GENEROS.includes(genero)) return { error: 'Elegí un género válido: mujer, trans u hombre.' };

  const provincia = cleanLine(b.provincia);
  if (len(provincia) < 2) return { error: 'Indicá tu provincia.' };
  if (len(provincia) > 60) return { error: 'El nombre de la provincia es demasiado largo.' };

  const ciudad = cleanLine(b.ciudad);
  if (len(ciudad) < 2) return { error: 'Indicá tu ciudad o localidad.' };
  if (len(ciudad) > 80) return { error: 'El nombre de la ciudad es demasiado largo.' };

  const tipo = cleanLine(b.contacto_tipo).toLowerCase();
  if (!CONTACTO_TIPOS.includes(tipo)) return { error: 'Elegí cómo querés que te contactemos: WhatsApp, Telegram o email.' };

  const raw = cleanLine(b.contacto);
  if (!raw) return { error: 'Ingresá tu dato de contacto.' };
  if (len(raw) > 254) return { error: 'El dato de contacto es demasiado largo.' };
  let contacto = null;
  if (tipo === 'whatsapp') {
    contacto = normalizePhone(raw);
    if (!contacto) return { error: 'El número de WhatsApp no es válido. Escribilo con código de área, por ejemplo +54 9 11 1234-5678.' };
  } else if (tipo === 'telegram') {
    const user = raw.replace(/^(https?:\/\/)?(www\.)?t\.me\//i, '').replace(/^@/, '');
    if (/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(user)) contacto = '@' + user;
    else contacto = normalizePhone(raw);
    if (!contacto) return { error: 'El usuario de Telegram no es válido. Usá tu @usuario (de 5 a 32 letras, números o guiones bajos) o tu número con código de área.' };
  } else {
    if (!validEmail(raw)) return { error: 'El email no es válido. Revisalo, por ejemplo nombre@dominio.com.' };
    contacto = raw;
  }

  const plan = cleanLine(b.plan_interes).toLowerCase();
  if (!PLANES.includes(plan)) return { error: 'Elegí el plan que te interesa (o "Todavía no sé").' };

  if (!isTrue(b.mayor_edad)) return { error: 'Tenés que confirmar que sos mayor de 18 años.' };
  if (!isTrue(b.acepta_terminos)) return { error: 'Tenés que aceptar los Términos y condiciones y la Política de privacidad.' };

  return { value: { nombre_artistico: nombre, genero, provincia, ciudad, contacto_tipo: tipo, contacto, plan_interes: plan } };
}

export function validateDenuncia(b) {
  const categoria = cleanLine(b.categoria).toLowerCase();
  if (!CATEGORIAS.includes(categoria)) return { error: 'Elegí una categoría para la denuncia.' };

  let url = null;
  const rawUrl = cleanLine(b.url);
  if (rawUrl) {
    if (rawUrl.length > 2000) return { error: 'El enlace es demasiado largo.' };
    let u = null;
    try { u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(rawUrl) ? rawUrl : 'https://' + rawUrl); } catch { u = null; }
    if (!u || !['http:', 'https:'].includes(u.protocol) || !u.hostname.includes('.')) {
      return { error: 'El enlace no es válido. Pegá la dirección completa, por ejemplo https://sexyrose.net/... o dejalo vacío.' };
    }
    url = u.href;
  }

  const descripcion = cleanText(b.descripcion);
  if (!descripcion) return { error: 'Contanos qué pasó en la descripción.' };
  if (len(descripcion) < 10 || len(descripcion) > 4000) return { error: 'La descripción tiene que tener entre 10 y 4000 caracteres.' };

  let email = null;
  const rawEmail = cleanLine(b.email);
  if (rawEmail) {
    if (!validEmail(rawEmail)) return { error: 'El email no es válido. Si preferís no dejarlo, dejá el campo vacío.' };
    email = rawEmail;
  }
  return { value: { categoria, url, descripcion, email } };
}

// ---------------------------------------------------------------------------
// Límite de envíos en memoria (por ip_hash)
// ---------------------------------------------------------------------------
function createRateLimiter() {
  const hits = new Map();
  const recent = (key, windowMs) => {
    const now = Date.now();
    const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (arr.length) hits.set(key, arr); else hits.delete(key);
    return arr;
  };
  return {
    allowed: (key, limit, windowMs) => recent(key, windowMs).length < limit,
    retryAfterSec: (key, windowMs) => {
      const arr = recent(key, windowMs);
      return arr.length ? Math.max(1, Math.ceil((arr[0] + windowMs - Date.now()) / 1000)) : 1;
    },
    hit: (key) => { const arr = hits.get(key) || []; arr.push(Date.now()); hits.set(key, arr); },
    sweep: (windowMs) => { for (const key of [...hits.keys()]) recent(key, windowMs); },
  };
}

// ---------------------------------------------------------------------------
// Cabeceras de seguridad
// ---------------------------------------------------------------------------
const CSP_SITE = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
].join('; ');

const CSP_DEMO = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  "connect-src 'self'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
].join('; ');

const cspAdmin = (nonce) => [
  "default-src 'none'",
  nonce ? `style-src 'nonce-${nonce}'` : "style-src 'none'",
  "img-src 'self'",
  "form-action 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ');

// Panel de administración (SPA): scripts solo con nonce; estilos inline permitidos (el panel usa style="").
const cspAdminSpa = (nonce) => [
  "default-src 'none'",
  `script-src 'nonce-${nonce}'`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self'",
  "media-src 'self' data: blob:",
  "base-uri 'none'",
  "form-action 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
].join('; ');

const PERMISSIONS_SITE = 'camera=(), microphone=(), geolocation=(), payment=(), usb=()';
const PERMISSIONS_DEMO = 'camera=(), microphone=(), geolocation=(self), payment=(), usb=()';

// ---------------------------------------------------------------------------
// Aplicación
// ---------------------------------------------------------------------------
// Agrega el origen de las imágenes (CDN de bunny.net) a img-src y media-src de una CSP.
const conMedia = (csp, origin) => (origin ? csp.replace(/(img-src [^;]*)/, `$1 ${origin}`).replace(/(media-src [^;]*)/, `$1 ${origin}`) : csp);

export function createApp(config) {
  const log = config.log;
  const state = { dbReady: false, stopping: false };
  const rl = createRateLimiter();
  const adminEnabled = Boolean(config.adminUser) && typeof config.adminPassword === 'string' && config.adminPassword.length >= 12;
  // El admin vive solo en ADMIN_PATH. Sin una dirección válida no se monta nada (todas sus rutas dan la 404 pública).
  // La dirección nunca se escribe en los logs ni en respuestas públicas.
  const A = validAdminPath(config.adminPath) ? config.adminPath : '';
  const isAdminPath = (p) => Boolean(A) && (p === A || p.startsWith(A + '/'));
  // Para logs: la ruta sin la dirección secreta (también en mayúsculas/minúsculas mezcladas).
  const logPath = (p) => {
    const lower = String(p).toLowerCase();
    return A && (lower === A || lower.startsWith(A + '/')) ? '[admin]' + String(p).slice(A.length) : p;
  };

  let salt = config.ipHashSalt;
  if (!salt) {
    salt = crypto.randomBytes(32).toString('hex');
    log('AVISO: falta IP_HASH_SALT; se usa una sal aleatoria temporal (los ip_hash cambian en cada reinicio).');
  }
  if (!A) {
    log('AVISO: admin deshabilitado: ADMIN_PATH falta o no es válida (tiene que empezar con "/", usar solo a-z, 0-9 y "-", '
      + 'y tener al menos 16 caracteres después de la barra). Generala con: bash infra/server/admin-path.sh');
  } else if (!adminEnabled) {
    log('AVISO: admin deshabilitado (falta ADMIN_USER o ADMIN_PASSWORD tiene menos de 12 caracteres).');
  } else {
    log('admin habilitado (en la dirección secreta de ADMIN_PATH)');
  }
  if (!config.databaseUrl) log('AVISO: falta DATABASE_URL; se usan las variables PG* por defecto.');

  const pool = new pg.Pool({
    connectionString: config.databaseUrl || undefined,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    statement_timeout: 10000,
  });
  pool.on('error', (e) => log('pg: error en conexión inactiva:', e.code || e.message));

  const clientIp = (req) => {
    const cf = req.headers['cf-connecting-ip'];
    if (typeof cf === 'string' && net.isIP(cf.trim())) return cf.trim();
    let ip = req.socket.remoteAddress || '';
    if (ip.startsWith('::ffff:')) ip = ip.slice(7);
    return ip || 'desconocida';
  };
  const ipHash = (req) => crypto.createHash('sha256').update(salt + clientIp(req), 'utf8').digest('hex');

  // Avisos por Telegram (opcional). Nunca incluyen datos de contacto ni el texto de la denuncia.
  const notify = async (text) => {
    if (!config.telegramToken || !config.telegramChatId) return;
    try {
      const r = await fetch(`https://api.telegram.org/bot${config.telegramToken}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: config.telegramChatId, text, disable_web_page_preview: true }),
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) log('telegram: respuesta', r.status);
    } catch (e) {
      log('telegram: no se pudo enviar el aviso:', e.name, e.cause?.code || '');
    }
  };

  // Placeholders {{...}} en HTML
  const placeholders = {
    OPERADOR: config.operatorName,
    CONTACT_EMAIL: config.contactEmail,
    REPORT_EMAIL: config.reportEmail,
    PRIVACY_EMAIL: config.privacyEmail,
    SITE_URL: config.siteUrl,
    FECHA_LEGAL: config.fechaLegal,
  };
  const PH_RE = /\{\{\s*(OPERADOR|CONTACT_EMAIL|REPORT_EMAIL|PRIVACY_EMAIL|SITE_URL|FECHA_LEGAL)\s*\}\}/g;

  // Textos editados desde el editor de textos del admin (tabla `textos`), en memoria. Cada cambio sube `ver` y eso
  // invalida las páginas en caché. Sin base o sin valores, las páginas salen con el texto del archivo.
  const textos = { valores: new Map(), ver: 0 };
  const cargarTextos = async () => {
    const { rows } = await pool.query('SELECT clave, valor FROM textos');
    textos.valores = new Map(rows.map((r) => [r.clave, r.valor]));
    textos.ver++;
  };

  const htmlCache = new Map();
  const renderHtml = async (rel) => {
    const file = path.resolve(config.publicDir, rel);
    if (!file.startsWith(config.publicDir + path.sep)) return null;
    let st;
    try { st = await fs.stat(file); } catch { return null; }
    if (!st.isFile()) return null;
    const hit = htmlCache.get(file);
    const sameFile = hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size;
    if (sameFile && hit.ver === textos.ver) return hit.html;
    const raw = sameFile ? hit.raw : await fs.readFile(file, 'utf8');
    const ver = textos.ver;
    // Primero los textos (escapados) y después los {{...}}, así los marcadores funcionan también dentro de los valores.
    const html = aplicarTextos(raw, textos.valores).replace(PH_RE, (_, k) => escapeHtml(placeholders[k]));
    htmlCache.set(file, { mtimeMs: st.mtimeMs, size: st.size, raw, ver, html });
    return html;
  };
  const exists = async (rel) => { try { return (await fs.stat(path.join(config.publicDir, rel))).isFile(); } catch { return false; } };

  const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  const fail = (res, status, error) => res.status(status).json({ ok: false, error });
  const sendHtml = (res, html, status = 200, cache = 'no-cache') => res.status(status).type('text/html; charset=utf-8').set('Cache-Control', cache).send(html);
  const queryString = (req) => { const i = req.url.indexOf('?'); return i >= 0 ? req.url.slice(i) : ''; };

  // --- Fase 1: almacenamiento, emails y sesiones ------------------------------
  storage.configurarStorage(config);
  configurarMail(config);
  const MEDIA = storage.mediaOrigin();
  const CSP_SITE_X = conMedia(CSP_SITE, MEDIA);
  const CSP_DEMO_X = conMedia(CSP_DEMO, MEDIA);
  const auth = createAuth({ pool, config });
  // Planes y cobros (lib/planes.js): UNA instancia por app, compartida por cuenta, sitio y admin.
  // Los emails de planes y del admin salen con el mismo formato que los de la cuenta (emailBasico).
  const sendMailBase = config.sendMail || enviarMail;
  const sendMailPlanes = (m) => {
    const parrafos = String(m.text || '').split(/\n{2,}/).map((x) => x.trim()).filter((x) => x && !/^(SexyRose|Hola:?)$/.test(x));
    return sendMailBase({ ...m, html: emailBasico({ titulo: m.subject || 'SexyRose', parrafos }).html });
  };
  const planes = createPlanes({ pool, sendMail: sendMailPlanes, log, siteUrl: config.siteUrl });
  // Cualquier cambio de planes, perfiles o catálogos desde el admin invalida el estado público y los catálogos.
  planes.setInvalidarSitio(() => { invalidarCatalogos(); invalidarSitio(); });
  // Archivos privados: misma raíz DATA_DIR/privado para verificaciones (lib/storage.js) y comprobantes (lib/privado.js).
  const privado = createPrivado({ dataDir: storage.dataDir() });
  // Contexto compartido por los módulos de rutas (routes/*.js).
  const ctx = { pool, config, log, rl, ipHash, auth, notify, state, validateDenuncia, planes, privado };

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false);
  app.set('query parser', 'simple');

  app.use((req, res, next) => {
    const p = req.path;
    const isDemo = p === '/demo' || p.startsWith('/demo/');
    const isAdmin = isAdminPath(p);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // En el admin, el Referer (que lleva la dirección secreta) no sale hacia otros sitios.
    res.setHeader('Referrer-Policy', isAdmin ? 'same-origin' : 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', isDemo ? PERMISSIONS_DEMO : PERMISSIONS_SITE);
    res.setHeader('Content-Security-Policy', isAdmin ? cspAdmin() : isDemo ? CSP_DEMO_X : CSP_SITE_X);
    if (isDemo || isAdmin) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    next();
  });

  // --- Salud, robots, sitemap ---------------------------------------------
  app.get('/healthz', ah(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!state.dbReady) return res.status(503).json({ ok: false, error: 'base de datos no lista' });
    try {
      await pool.query('SELECT 1');
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false, error: 'base de datos no disponible' });
    }
  }));

  app.get('/robots.txt', (req, res) => {
    res.type('text/plain; charset=utf-8').set('Cache-Control', 'public, max-age=3600')
      .send(`User-agent: *\nDisallow: /demo\nAllow: /\n\nSitemap: ${config.siteUrl}/sitemap.xml\n`);
  });

  const SITEMAP_PAGES = [['', 'index.html'], ['terminos', 'terminos.html'], ['privacidad', 'privacidad.html'],
    ['contenido', 'contenido.html'], ['trata', 'trata.html'], ['denunciar', 'denunciar.html']];
  app.get('/sitemap.xml', ah(async (req, res) => {
    const urls = [];
    for (const [route, file] of SITEMAP_PAGES) {
      if (await exists(file)) urls.push(`  <url><loc>${escapeXml(config.siteUrl + '/' + route)}</loc></url>`);
    }
    res.type('application/xml; charset=utf-8').set('Cache-Control', 'public, max-age=3600')
      .send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);
  }));

  // --- API -----------------------------------------------------------------
  const api = express.Router();
  api.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  api.use(express.json({ limit: '20kb', strict: true, type: 'application/json' }));
  const requireJson = (req, res, next) => {
    if (!req.is('application/json')) return fail(res, 415, 'Enviá los datos en formato JSON.');
    if (!isPlainObject(req.body)) return fail(res, 400, 'Formato de datos inválido.');
    next();
  };

  api.post('/preregistro', requireJson, ah(async (req, res) => {
    const hash = ipHash(req);
    const key = 'pre:' + hash;
    if (!rl.allowed(key, 5, HOUR)) {
      res.set('Retry-After', String(rl.retryAfterSec(key, HOUR)));
      return fail(res, 429, 'Recibimos demasiados pre-registros desde tu conexión. Probá de nuevo en una hora.');
    }
    if (honeypotFilled(req.body.website)) { rl.hit(key); return res.status(201).json({ ok: true }); }
    const v = validatePreregistro(req.body);
    if (v.error) return fail(res, 400, v.error);
    if (!state.dbReady) return fail(res, 503, 'El servicio no está disponible en este momento. Probá de nuevo en unos minutos.');
    const d = v.value;
    await pool.query(
      `INSERT INTO preregistros (nombre_artistico, genero, provincia, ciudad, contacto_tipo, contacto, plan_interes, mayor_edad, acepta_terminos, ip_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,true,true,$8)`,
      [d.nombre_artistico, d.genero, d.provincia, d.ciudad, d.contacto_tipo, d.contacto, d.plan_interes, hash],
    );
    rl.hit(key);
    res.status(201).json({ ok: true });
    notify(`Nuevo pre-registro\nPlan: ${PLAN_LABEL[d.plan_interes]}`);
  }));

  api.post('/denuncia', requireJson, ah(async (req, res) => {
    const hash = ipHash(req);
    const key = 'den:' + hash;
    if (!rl.allowed(key, 10, HOUR)) {
      res.set('Retry-After', String(rl.retryAfterSec(key, HOUR)));
      return fail(res, 429, `Recibimos demasiadas denuncias desde tu conexión. Probá de nuevo más tarde o escribí a ${config.reportEmail}.`);
    }
    if (honeypotFilled(req.body.website)) { rl.hit(key); return res.status(201).json({ ok: true, id: crypto.randomUUID() }); }
    const v = validateDenuncia(req.body);
    if (v.error) return fail(res, 400, v.error);
    if (!state.dbReady) return fail(res, 503, `El servicio no está disponible en este momento. Probá de nuevo en unos minutos o escribí a ${config.reportEmail}.`);
    const d = v.value;
    const { rows } = await pool.query(
      `INSERT INTO denuncias (categoria, url, descripcion, email, ip_hash) VALUES ($1,$2,$3,$4,$5) RETURNING id, creado`,
      [d.categoria, d.url, d.descripcion, d.email, hash],
    );
    rl.hit(key);
    const { id, creado } = rows[0];
    res.status(201).json({ ok: true, id });
    if (CATEGORIAS_URGENTES.has(d.categoria)) {
      notify(`Denuncia urgente\nCategoría: ${CATEGORIA_LABEL[d.categoria]}\nID: ${id}\nHora: ${fmtDate(creado)} (hora Argentina)\nRevisar en el panel de admin.`);
    }
  }));

  api.use((req, res) => fail(res, 404, 'No encontrado.'));
  // Fase 1: cuentas de acompañantes y API pública del sitio (antes del router general de /api, que termina en 404).
  // Planes y pedidos de la acompañante (/api/cuenta/planes, /api/cuenta/pedidos…): mismo requireCuenta y mismas
  // reglas de mutación (mismo origen + X-SR: 1). Va antes del router de cuenta, que no tiene esas rutas.
  app.use('/api/cuenta', createCuentaPlanesRouter({
    planes, privado, sameOrigin: mismoOrigen, pool, log,
    // config.requireCuenta solo existe en pruebas (se pasa por código, nunca por variables de entorno).
    requireCuenta: typeof config.requireCuenta === 'function' ? config.requireCuenta : auth.requireCuenta,
  }));
  app.use('/api/cuenta', createCuentaRouter(ctx));
  app.use('/api/sitio', createSitioRouter(ctx));
  app.use('/api', api);

  // Archivos públicos subidos (STORAGE=local). Nombres aleatorios e inmutables: caché larga. Sin listado de carpetas.
  if (storage.driverActual() === 'local') {
    app.use('/media', express.static(storage.mediaDir(), {
      index: false, redirect: false, dotfiles: 'deny', fallthrough: true, immutable: true, maxAge: '365d',
      setHeaders: (res) => { res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Cross-Origin-Resource-Policy', 'same-site'); },
    }));
  }

  // --- Admin ---------------------------------------------------------------
  const csrfToken = adminEnabled
    ? crypto.createHmac('sha256', config.adminPassword).update('csrf:' + config.adminUser).digest('hex')
    : '';
  const sameOrigin = (req) => {
    const host = req.headers.host;
    if (!host) return false;
    const sfs = req.headers['sec-fetch-site'];
    if (sfs && sfs !== 'same-origin') return false;
    const src = req.headers.origin || req.headers.referer;
    if (!src) return false;
    try { return new URL(src).host === host; } catch { return false; }
  };

  const admin = express.Router();
  admin.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!adminEnabled) {
      return res.status(503).type('text/plain; charset=utf-8')
        .send('Admin deshabilitado: falta configurar ADMIN_USER y ADMIN_PASSWORD (mínimo 12 caracteres).');
    }
    const failKey = 'adm:' + ipHash(req);
    if (!rl.allowed(failKey, 20, 15 * 60 * 1000)) {
      return res.status(429).type('text/plain; charset=utf-8').send('Demasiados intentos fallidos. Probá de nuevo en 15 minutos.');
    }
    const m = /^Basic\s+([A-Za-z0-9+/=]+)\s*$/i.exec(req.headers.authorization || '');
    if (m) {
      const decoded = Buffer.from(m[1], 'base64').toString('utf8');
      const i = decoded.indexOf(':');
      const user = i >= 0 ? decoded.slice(0, i) : decoded;
      const pass = i >= 0 ? decoded.slice(i + 1) : '';
      const okUser = safeEqual(user, config.adminUser);
      const okPass = safeEqual(pass, config.adminPassword);
      if (okUser && okPass) return next();
      rl.hit(failKey);
    }
    res.set('WWW-Authenticate', 'Basic realm="SexyRose admin", charset="UTF-8"');
    res.status(401).type('text/plain; charset=utf-8').send('Autenticación requerida.');
  });
  admin.use((req, res, next) => {
    if (!state.dbReady) return res.status(503).type('text/plain; charset=utf-8').send('La base de datos todavía no está lista.');
    next();
  });

  const PRE_COLS = 'id, creado, nombre_artistico, genero, provincia, ciudad, contacto_tipo, contacto, plan_interes, estado';
  const DEN_COLS = 'id, creado, categoria, url, descripcion, email, estado, resuelto';
  const ADMIN_LIMIT = 500;

  // Admin clásico (HTML sin JavaScript) en A/clasico, mientras dura la transición al panel nuevo.
  const C = A + '/clasico';

  admin.get('/clasico', ah(async (req, res) => {
    const [pre, den, preN, denN] = await Promise.all([
      pool.query(`SELECT ${PRE_COLS} FROM preregistros ORDER BY creado DESC LIMIT ${ADMIN_LIMIT}`),
      pool.query(`SELECT ${DEN_COLS} FROM denuncias ORDER BY (resuelto IS NOT NULL), creado DESC LIMIT ${ADMIN_LIMIT}`),
      pool.query('SELECT count(*)::int AS n FROM preregistros'),
      pool.query("SELECT count(*)::int AS n, count(*) FILTER (WHERE resuelto IS NULL)::int AS abiertas FROM denuncias"),
    ]);
    const nonce = crypto.randomBytes(16).toString('base64');
    res.setHeader('Content-Security-Policy', cspAdmin(nonce));
    const e = escapeHtml;
    const td = (v, cls) => `<td${cls ? ` class="${cls}"` : ''}>${e(v)}</td>`;
    const preRows = pre.rows.map((r) => `<tr>${td(fmtDate(r.creado), 'nw')}${td(r.nombre_artistico)}${td(r.genero)}${td(r.provincia)}${td(r.ciudad)}${td(r.contacto_tipo)}${td(r.contacto, 'nw')}${td(PLAN_LABEL[r.plan_interes] || r.plan_interes)}${td(r.estado)}</tr>`).join('\n');
    const denRows = den.rows.map((r) => {
      const action = r.resuelto
        ? `<td class="nw">Resuelta ${e(fmtDate(r.resuelto))}</td>`
        : `<td><form method="post" action="${C}/denuncias/${e(r.id)}/resolver"><input type="hidden" name="csrf" value="${e(csrfToken)}"><button type="submit">Marcar resuelta</button></form></td>`;
      const urgent = CATEGORIAS_URGENTES.has(r.categoria) && !r.resuelto;
      return `<tr${urgent ? ' class="urg"' : ''}>${td(fmtDate(r.creado), 'nw')}${td(CATEGORIA_LABEL[r.categoria] || r.categoria)}${td(r.url || '', 'url')}${td(r.descripcion, 'desc')}${td(r.email || '')}${td(r.estado)}${action}${td(r.id, 'id')}</tr>`;
    }).join('\n');
    const more = (shown, total) => (total > shown ? `<p class="muted">Se muestran los ${shown} más recientes de ${total}. El CSV tiene todos.</p>` : '');
    sendHtml(res, `<!doctype html>
<html lang="es-AR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>SexyRose — Admin</title>
<style nonce="${nonce}">
:root{color-scheme:dark}body{margin:0;padding:16px;background:#15131A;color:#F7F3F6;font:14px/1.45 system-ui,sans-serif}
h1{font-size:20px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 8px;color:#FF5C8A}a{color:#FF5C8A}.muted{color:#b9b1bd}
.wrap{overflow-x:auto;border:1px solid #3a3541;border-radius:10px}table{border-collapse:collapse;width:100%;min-width:900px}
th,td{padding:7px 9px;border-bottom:1px solid #2d2934;text-align:left;vertical-align:top}th{background:#221F28;position:sticky;top:0}
.nw{white-space:nowrap}.desc{white-space:pre-wrap;max-width:420px;overflow-wrap:anywhere}.url{max-width:220px;overflow-wrap:anywhere}.id{font:11px ui-monospace,monospace;color:#8f8796}
tr.urg td{background:#3a1424}button{background:#FF5C8A;color:#15131A;border:0;border-radius:8px;padding:6px 10px;font-weight:700;cursor:pointer}
</style></head><body>
<h1>SexyRose — Admin</h1>
<p><a href="${A}">Ir al panel nuevo</a> · <a href="${C}/textos">Editar los textos del sitio</a></p>
<p class="muted">Pre-registros: ${preN.rows[0].n} · Denuncias: ${denN.rows[0].n} (abiertas: ${denN.rows[0].abiertas}) · Hora Argentina</p>
<h2 id="denuncias">Denuncias</h2>
<p><a href="${A}/denuncias.csv">Descargar CSV de denuncias</a></p>
${more(den.rows.length, denN.rows[0].n)}
<div class="wrap"><table><thead><tr><th>Fecha</th><th>Categoría</th><th>Enlace</th><th>Descripción</th><th>Email</th><th>Estado</th><th>Acción</th><th>ID</th></tr></thead>
<tbody>
${denRows || '<tr><td colspan="8" class="muted">Sin denuncias.</td></tr>'}
</tbody></table></div>
<h2 id="preregistros">Pre-registros</h2>
<p><a href="${A}/preregistros.csv">Descargar CSV de pre-registros</a></p>
${more(pre.rows.length, preN.rows[0].n)}
<div class="wrap"><table><thead><tr><th>Fecha</th><th>Nombre artístico</th><th>Género</th><th>Provincia</th><th>Ciudad</th><th>Contacto por</th><th>Contacto</th><th>Plan</th><th>Estado</th></tr></thead>
<tbody>
${preRows || '<tr><td colspan="9" class="muted">Sin pre-registros.</td></tr>'}
</tbody></table></div>
</body></html>`, 200, 'no-store');
  }));

  const sendCsv = (res, name, csv) => {
    const date = fmtCsvDate(new Date()).slice(0, 10);
    res.type('text/csv; charset=utf-8').set('Content-Disposition', `attachment; filename="${name}-${date}.csv"`).send(csv);
  };

  admin.get('/preregistros.csv', ah(async (req, res) => {
    const { rows } = await pool.query(`SELECT ${PRE_COLS} FROM preregistros ORDER BY creado DESC`);
    sendCsv(res, 'preregistros', toCsv(
      ['id', 'creado (hora Argentina)', 'nombre_artistico', 'genero', 'provincia', 'ciudad', 'contacto_tipo', 'contacto', 'plan_interes', 'estado'],
      rows.map((r) => [r.id, fmtCsvDate(r.creado), r.nombre_artistico, r.genero, r.provincia, r.ciudad, r.contacto_tipo, r.contacto, r.plan_interes, r.estado]),
    ));
  }));

  admin.get('/denuncias.csv', ah(async (req, res) => {
    const { rows } = await pool.query(`SELECT ${DEN_COLS} FROM denuncias ORDER BY creado DESC`);
    sendCsv(res, 'denuncias', toCsv(
      ['id', 'creado (hora Argentina)', 'categoria', 'url', 'descripcion', 'email', 'estado', 'resuelto (hora Argentina)'],
      rows.map((r) => [r.id, fmtCsvDate(r.creado), r.categoria, r.url, r.descripcion, r.email, r.estado, fmtCsvDate(r.resuelto)]),
    ));
  }));

  admin.post('/clasico/denuncias/:id/resolver', express.urlencoded({ extended: false, limit: '2kb' }), ah(async (req, res) => {
    if (!sameOrigin(req)) return res.status(403).type('text/plain; charset=utf-8').send('Solicitud rechazada: origen no válido.');
    const token = typeof req.body?.csrf === 'string' ? req.body.csrf : '';
    if (!safeEqual(token, csrfToken)) return res.status(403).type('text/plain; charset=utf-8').send('Solicitud rechazada: token inválido.');
    if (!UUID_RE.test(req.params.id)) return res.status(404).type('text/plain; charset=utf-8').send('Denuncia no encontrada.');
    const r = await pool.query(
      "UPDATE denuncias SET estado = 'resuelta', resuelto = now() WHERE id = $1 AND resuelto IS NULL RETURNING id",
      [req.params.id],
    );
    if (!r.rowCount) {
      const ex = await pool.query('SELECT 1 FROM denuncias WHERE id = $1', [req.params.id]);
      if (!ex.rowCount) return res.status(404).type('text/plain; charset=utf-8').send('Denuncia no encontrada.');
    }
    log('admin: denuncia marcada como resuelta', req.params.id);
    res.redirect(303, `${C}#denuncias`);
  }));

  // --- Admin: textos del sitio -------------------------------------------------
  // Formularios HTML sin JavaScript (CSP del admin sin scripts). Mismo Basic Auth, mismo origen y token CSRF.
  const rejectPost = (req, res) => {
    if (!sameOrigin(req)) { res.status(403).type('text/plain; charset=utf-8').send('Solicitud rechazada: origen no válido.'); return true; }
    const token = typeof req.body?.csrf === 'string' ? req.body.csrf : '';
    if (!safeEqual(token, csrfToken)) { res.status(403).type('text/plain; charset=utf-8').send('Solicitud rechazada: token inválido.'); return true; }
    return false;
  };

  // Bloques editables, leídos de los HTML de public/ (solo lectura). Las claves comun.* van a su propia página.
  const registroTextos = async () => {
    const paginas = [];
    const comun = { ...COMUN_PAGE, bloques: [] };
    const porClave = new Map();
    for (const p of TEXT_PAGES) {
      let html = '';
      try { html = await fs.readFile(path.join(config.publicDir, p.file), 'utf8'); } catch { continue; }
      const pagina = { ...p, bloques: [] };
      for (const b of extraerBloques(html)) {
        const pre = b.clave.split('.')[0];
        const dest = pre === 'comun' ? comun : pre === p.id ? pagina : null;
        if (!dest || porClave.has(b.clave)) continue;
        const bloque = { ...b, pagina: dest.id };
        dest.bloques.push(bloque);
        porClave.set(b.clave, bloque);
      }
      paginas.push(pagina);
    }
    if (comun.bloques.length) paginas.push(comun);
    return { paginas, porClave };
  };

  // Guarda cambios [{clave, valor|null}] (null = volver al texto por defecto). El valor reemplazado va al historial.
  const guardarTextos = async (cambios) => {
    if (!cambios.length) return;
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      for (const { clave, valor } of cambios) {
        const old = await c.query('SELECT valor, actualizado FROM textos WHERE clave = $1 FOR UPDATE', [clave]);
        if (old.rowCount) {
          if (old.rows[0].valor === valor) continue;
          await c.query('INSERT INTO textos_historial (clave, valor, guardado) VALUES ($1, $2, $3)', [clave, old.rows[0].valor, old.rows[0].actualizado]);
        }
        if (valor === null) await c.query('DELETE FROM textos WHERE clave = $1', [clave]);
        else {
          await c.query(
            'INSERT INTO textos (clave, valor) VALUES ($1, $2) ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado = now()',
            [clave, valor],
          );
        }
      }
      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      c.release();
    }
    for (const { clave, valor } of cambios) {
      if (valor === null) textos.valores.delete(clave); else textos.valores.set(clave, valor);
    }
    textos.ver++;
    log('admin: textos guardados:', cambios.map((x) => x.clave).join(', '));
  };

  const ADMIN_TEXT_CSS = `
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;padding:16px 16px 96px;background:#15131A;color:#F7F3F6;font:15px/1.5 system-ui,sans-serif}
.wrap{max-width:860px;margin:0 auto}h1{font-size:21px;margin:4px 0 8px}h2{font-size:16px;margin:26px 0 8px;color:#FF5C8A;text-transform:uppercase;letter-spacing:.04em}
a{color:#FF5C8A}.muted{color:#b9b1bd}.small{font-size:13px}code{font:12px ui-monospace,monospace;color:#c9c1cc;overflow-wrap:anywhere}
.box{background:#221F28;border:1px solid #3a3541;border-radius:10px;padding:12px 14px;margin:12px 0}.box p{margin:4px 0}
.ok{border-color:#3d6b4f;background:#1b2a21}.pages{list-style:none;padding:0;margin:0}.pages li{background:#221F28;border:1px solid #3a3541;border-radius:10px;padding:12px 14px;margin:10px 0}
.pages .name{font-weight:700;font-size:16px}.links a{display:inline-block;margin:6px 14px 0 0}
.blk{background:#221F28;border:1px solid #3a3541;border-radius:10px;padding:12px;margin:10px 0}.blk.mod{border-color:#FF5C8A}
.lbl{display:block;margin:0 0 6px}.ctx{font-weight:600}.tag{display:inline-block;font-size:12px;font-weight:700;color:#15131A;background:#FF5C8A;border-radius:6px;padding:0 6px;margin-left:6px}
textarea{width:100%;min-height:44px;background:#15131A;color:#F7F3F6;border:1px solid #4a4452;border-radius:8px;padding:8px 10px;font:16px/1.45 system-ui,sans-serif;resize:vertical}
textarea:focus{outline:2px solid #FF5C8A;outline-offset:1px}
.def{white-space:pre-wrap;overflow-wrap:anywhere;color:#b9b1bd;font-size:13px;margin:8px 0 0;padding:6px 8px;border-left:3px solid #4a4452}
.acts{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;margin-top:8px}
button{background:#FF5C8A;color:#15131A;border:0;border-radius:8px;padding:9px 14px;font:700 14px system-ui,sans-serif;cursor:pointer;min-height:40px}
button.sec{background:transparent;color:#F7F3F6;border:1px solid #6a6272}
.bar{position:fixed;left:0;right:0;bottom:0;background:#221F28ee;border-top:1px solid #3a3541;padding:10px 16px}
.bar .in{max-width:860px;margin:0 auto;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.ver{background:#221F28;border:1px solid #3a3541;border-radius:10px;padding:12px;margin:10px 0}.ver .txt{white-space:pre-wrap;overflow-wrap:anywhere;margin:6px 0 10px}
.filters a{margin-right:14px}`;

  const adminTextPage = (res, title, body) => {
    const nonce = crypto.randomBytes(16).toString('base64');
    res.setHeader('Content-Security-Policy', cspAdmin(nonce));
    sendHtml(res, `<!doctype html>
<html lang="es-AR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${escapeHtml(title)} — SexyRose admin</title>
<style nonce="${nonce}">${ADMIN_TEXT_CSS}</style></head><body><div class="wrap">
${body}
</div></body></html>`, 200, 'no-store');
  };

  const FORMATO_AYUDA = `<div class="box small">
<p><strong>Formato.</strong> Escribí texto normal. Enter hace un salto de línea. <code>**así**</code> queda en negrita. <code>[texto del enlace](/terminos)</code> crea un enlace (la dirección puede empezar con <code>/</code>, <code>#</code>, <code>https://</code> o <code>mailto:</code>).</p>
<p>Los textos marcados «solo texto» no admiten negrita, enlaces ni saltos de línea. <code>{{CONTACT_EMAIL}}</code>, <code>{{REPORT_EMAIL}}</code>, <code>{{PRIVACY_EMAIL}}</code>, <code>{{OPERADOR}}</code>, <code>{{SITE_URL}}</code> y <code>{{FECHA_LEGAL}}</code> se reemplazan solos.</p>
</div>`;

  admin.get('/clasico/textos', ah(async (req, res) => {
    const { paginas } = await registroTextos();
    const items = paginas.map((p) => {
      const mod = p.bloques.filter((b) => textos.valores.has(b.clave)).length;
      return `<li><div class="name">${escapeHtml(p.nombre)}</div>
<div class="muted small">${p.bloques.length} textos${mod ? ` · ${mod} modificados` : ''}</div>
<div class="links"><a href="${C}/textos/${escapeHtml(p.id)}">Editar textos</a><a href="${escapeHtml(p.ruta)}" target="_blank" rel="noopener noreferrer">Vista previa</a></div></li>`;
    }).join('\n');
    adminTextPage(res, 'Textos del sitio', `<p class="small"><a href="${C}">Volver al admin</a></p>
<h1>Textos del sitio</h1>
<p class="muted">Cambiá cualquier texto de las páginas públicas. Los cambios se ven al instante y cada cambio guarda la versión anterior, que se puede restaurar.</p>
${FORMATO_AYUDA}
<ul class="pages">
${items || '<li class="muted">No se encontraron páginas con textos editables.</li>'}
</ul>
<p class="muted small">La demostración (/demo/) no se edita desde acá: sus perfiles y textos ficticios vienen del MVP.</p>
<p class="muted small">Los mensajes de error que arma el servidor al validar un envío (por ejemplo, «El email no es válido») tampoco se editan acá.</p>`);
  }));

  admin.get('/clasico/textos/historial', ah(async (req, res) => {
    const { porClave } = await registroTextos();
    const clave = typeof req.query.clave === 'string' ? req.query.clave : '';
    const b = porClave.get(clave);
    if (!b) return res.status(404).type('text/plain; charset=utf-8').send('Texto no encontrado.');
    const { rows } = await pool.query('SELECT id, valor, guardado FROM textos_historial WHERE clave = $1 ORDER BY id DESC LIMIT 50', [clave]);
    const actual = textos.valores.has(clave) ? textos.valores.get(clave) : b.defValor;
    const e = escapeHtml;
    const versiones = rows.map((r) => `<div class="ver"><div class="muted small">Guardada el ${e(fmtDate(r.guardado))}${r.valor === actual ? ' · igual al texto actual' : ''}</div>
<div class="txt">${e(r.valor)}</div>
<form method="post" action="${C}/textos/historial"><input type="hidden" name="csrf" value="${e(csrfToken)}"><input type="hidden" name="id" value="${e(r.id)}"><button type="submit">Restaurar esta versión</button></form></div>`).join('\n');
    adminTextPage(res, 'Versiones anteriores', `<p class="small"><a href="${C}/textos/${e(b.pagina)}#b-${e(clave)}">Volver a los textos</a></p>
<h1>Versiones anteriores</h1>
<p><span class="ctx">${e(b.contexto)}</span> <code>${e(clave)}</code></p>
<div class="box"><p class="muted small">Texto actual${textos.valores.has(clave) ? '' : ' (es el texto por defecto)'}</p><div class="def">${e(actual)}</div>
<p class="muted small">Por defecto</p><div class="def">${e(b.defValor)}</div></div>
${versiones || '<p class="muted">Todavía no hay versiones anteriores de este texto.</p>'}`);
  }));

  admin.post('/clasico/textos/historial', express.urlencoded({ extended: false, limit: '4kb' }), ah(async (req, res) => {
    if (rejectPost(req, res)) return;
    const id = typeof req.body.id === 'string' && /^\d{1,18}$/.test(req.body.id) ? req.body.id : null;
    const { rows } = id ? await pool.query('SELECT clave, valor FROM textos_historial WHERE id = $1', [id]) : { rows: [] };
    const { porClave } = await registroTextos();
    const b = rows[0] && porClave.get(rows[0].clave);
    if (!b) return res.status(404).type('text/plain; charset=utf-8').send('Versión no encontrada.');
    const valor = rows[0].valor === b.defValor ? null : rows[0].valor;
    const actual = textos.valores.has(b.clave) ? textos.valores.get(b.clave) : null;
    if (valor !== actual) await guardarTextos([{ clave: b.clave, valor }]);
    res.redirect(303, `${C}/textos/${encodeURIComponent(b.pagina)}?ok=version#b-${b.clave}`);
  }));

  admin.get('/clasico/textos/:pagina', ah(async (req, res) => {
    const { paginas } = await registroTextos();
    const p = paginas.find((x) => x.id === req.params.pagina);
    if (!p) return res.status(404).type('text/plain; charset=utf-8').send('Página no encontrada.');
    const soloMod = req.query.filtro === 'modificados';
    const claves = p.bloques.map((b) => b.clave);
    const hist = new Map((await pool.query(
      'SELECT clave, count(*)::int AS n FROM textos_historial WHERE clave = ANY($1) GROUP BY clave', [claves],
    )).rows.map((r) => [r.clave, r.n]));
    const e = escapeHtml;
    let seccion = null;
    const partes = [];
    for (const b of p.bloques) {
      const mod = textos.valores.has(b.clave);
      if (soloMod && !mod) continue;
      const sec = b.clave.split('.')[1] || '';
      if (sec !== seccion) { seccion = sec; partes.push(`<h2>${e(sec.replace(/-/g, ' '))}</h2>`); }
      const valor = mod ? textos.valores.get(b.clave) : b.defValor;
      const lineas = valor.split('\n').length;
      const rows = Math.min(14, Math.max(b.tipo === 't' ? 1 : 2, Math.ceil(valor.length / 42) + lineas - 1));
      const n = hist.get(b.clave) || 0;
      partes.push(`<div class="blk${mod ? ' mod' : ''}" id="b-${e(b.clave)}">
<label class="lbl" for="t-${e(b.clave)}"><span class="ctx">${e(b.contexto)}</span>${b.tipo === 't' ? ' <span class="muted small">(solo texto)</span>' : ''}${mod ? '<span class="tag">Modificado</span>' : ''}<br><code>${e(b.clave)}</code></label>
<textarea id="t-${e(b.clave)}" name="v.${e(b.clave)}" rows="${rows}" maxlength="${MAX_VALOR}">
${e(valor)}</textarea>
${mod ? `<p class="def"><strong>Por defecto:</strong> ${e(b.defValor)}</p>` : ''}
<div class="acts"><button type="submit" name="accion" value="guardar:${e(b.clave)}">Guardar</button>${mod ? `<button type="submit" class="sec" name="accion" value="defecto:${e(b.clave)}">Restaurar valor por defecto</button>` : ''}${n ? `<a href="${C}/textos/historial?clave=${encodeURIComponent(b.clave)}">Versiones anteriores (${n})</a>` : ''}</div>
</div>`);
    }
    const ok = typeof req.query.ok === 'string' ? req.query.ok : '';
    const flash = ok === 'version' ? 'Versión restaurada.'
      : ok === 'defecto' ? 'Se restauró el texto por defecto.'
        : /^\d+$/.test(ok) ? (ok === '0' ? 'No había cambios para guardar.' : `Cambios guardados: ${ok}.`) : '';
    const nMod = p.bloques.filter((b) => textos.valores.has(b.clave)).length;
    adminTextPage(res, `Textos: ${p.nombre}`, `<p class="small"><a href="${C}/textos">Textos del sitio</a> · <a href="${C}">Admin</a></p>
<h1>${e(p.nombre)}</h1>
${p.id === 'comun' ? '<p class="muted small">Estos textos aparecen en todas las páginas: se editan una sola vez acá.</p>' : ''}
${flash ? `<div class="box ok" role="status"><p>${e(flash)}</p></div>` : ''}
<p class="filters small">${soloMod ? `<a href="${C}/textos/${e(p.id)}">Ver todos (${p.bloques.length})</a>` : `<a href="${C}/textos/${e(p.id)}?filtro=modificados">Ver solo modificados (${nMod})</a>`}<a href="${e(p.ruta)}" target="_blank" rel="noopener noreferrer">Vista previa</a></p>
${FORMATO_AYUDA}
<p class="muted small">Cualquier botón «Guardar» guarda todos los cambios de esta página.</p>
<form method="post" action="${C}/textos/${e(p.id)}">
<input type="hidden" name="csrf" value="${e(csrfToken)}">
${partes.join('\n') || '<p class="muted">No hay textos modificados en esta página.</p>'}
<div class="bar"><div class="in"><button type="submit" name="accion" value="guardar">Guardar todos los cambios</button><a href="${e(p.ruta)}" target="_blank" rel="noopener noreferrer">Vista previa</a></div></div>
</form>`);
  }));

  admin.post('/clasico/textos/:pagina', express.urlencoded({ extended: false, limit: '1mb', parameterLimit: 2000 }), ah(async (req, res) => {
    if (rejectPost(req, res)) return;
    const { paginas } = await registroTextos();
    const p = paginas.find((x) => x.id === req.params.pagina);
    if (!p) return res.status(404).type('text/plain; charset=utf-8').send('Página no encontrada.');
    const accion = typeof req.body.accion === 'string' ? req.body.accion : 'guardar';
    const restaurar = accion.startsWith('defecto:') ? accion.slice(8) : null;
    const cambios = [];
    for (const b of p.bloques) {
      const raw = req.body['v.' + b.clave];
      if (typeof raw !== 'string' || b.clave === restaurar) continue;
      const v = limpiarValor(raw);
      if ([...v].length > MAX_VALOR) {
        return res.status(400).type('text/plain; charset=utf-8').send(`El texto ${b.clave} es demasiado largo (máximo ${MAX_VALOR} caracteres).`);
      }
      const actual = textos.valores.has(b.clave) ? textos.valores.get(b.clave) : b.defValor;
      if (v === actual) continue;
      cambios.push({ clave: b.clave, valor: v === b.defValor ? null : v });
    }
    let okMsg = String(cambios.length);
    if (restaurar && p.bloques.some((b) => b.clave === restaurar) && textos.valores.has(restaurar)) {
      cambios.push({ clave: restaurar, valor: null });
      okMsg = 'defecto';
    }
    await guardarTextos(cambios);
    const foco = restaurar || (accion.startsWith('guardar:') ? accion.slice(8) : '');
    const ancla = foco && p.bloques.some((b) => b.clave === foco) ? `#b-${foco}` : '';
    res.redirect(303, `${C}/textos/${encodeURIComponent(p.id)}?ok=${okMsg}${ancla}`);
  }));

  // --- Admin: panel nuevo (SPA del MVP) ----------------------------------------
  // app/admin-spa/index.html lo genera app/scripts/build-admin.py (en Docker, dentro del build). Se lee una vez y se
  // vuelve a leer si cambia el archivo. Cada respuesta lleva un nonce nuevo en los <script>.
  const spa = { mtimeMs: -1, size: -1, html: null };
  const loadSpa = async () => {
    let st;
    try { st = await fs.stat(config.adminSpaPath); } catch { spa.html = null; spa.mtimeMs = -1; return null; }
    if (spa.html !== null && st.mtimeMs === spa.mtimeMs && st.size === spa.size) return spa.html;
    spa.html = await fs.readFile(config.adminSpaPath, 'utf8');
    spa.mtimeMs = st.mtimeMs; spa.size = st.size;
    return spa.html;
  };
  admin.get('/', ah(async (req, res) => {
    if (req.originalUrl.split('?')[0] === A + '/') return res.redirect(301, A);
    const html = await loadSpa();
    if (html === null) {
      return res.status(503).type('text/plain; charset=utf-8').send('Falta generar el panel: python3 app/scripts/build-admin.py');
    }
    const nonce = crypto.randomBytes(16).toString('base64');
    res.setHeader('Content-Security-Policy', conMedia(cspAdminSpa(nonce), MEDIA));
    sendHtml(res, html.replace(/<script\b/gi, `<script nonce="${nonce}"`), 200, 'no-store');
  }));

  // Direcciones viejas del editor de textos → admin clásico.
  admin.get(['/textos', '/textos/*'], (req, res) => res.redirect(301, C + req.url));

  // --- Admin: API JSON del panel ---------------------------------------------------
  // Mismo Basic Auth. Los POST exigen JSON, la cabecera X-SR-Admin: 1 y el mismo origen (una página de otro
  // sitio no puede mandar esa cabecera sin preflight CORS, y el servidor no responde CORS).
  const ESTADOS_PRE = ['nuevo', 'contactado', 'invitado', 'descartado'];
  const URGENTES = [...CATEGORIAS_URGENTES];
  const apiErr = (res, status, error) => res.status(status).json({ error });
  const apiPost = [
    (req, res, next) => {
      if (!req.is('application/json')) return apiErr(res, 403, 'Solicitud rechazada: tiene que ser JSON.');
      if (req.get('x-sr-admin') !== '1') return apiErr(res, 403, 'Solicitud rechazada: falta la cabecera del panel.');
      if (!sameOrigin(req)) return apiErr(res, 403, 'Solicitud rechazada: origen no válido.');
      next();
    },
    express.json({ limit: '1mb' }),
  ];
  const preItem = (r) => ({ ...r, plan_label: PLAN_LABEL[r.plan_interes] || r.plan_interes });
  const denItem = (r) => ({ ...r, categoria_label: CATEGORIA_LABEL[r.categoria] || r.categoria, urgente: CATEGORIAS_URGENTES.has(r.categoria) });
  const AYUDA_TEXTOS = 'Escribí texto normal; Enter hace un salto de línea. **así** queda en negrita. [texto del enlace](/terminos) crea un enlace '
    + '(la dirección puede empezar con /, #, https:// o mailto:). Los textos «solo texto» no admiten negrita, enlaces ni saltos de línea. '
    + '{{CONTACT_EMAIL}}, {{REPORT_EMAIL}}, {{PRIVACY_EMAIL}}, {{OPERADOR}}, {{SITE_URL}} y {{FECHA_LEGAL}} se reemplazan por sus valores. '
    + 'Dejar un texto vacío vuelve al texto por defecto.';

  // ---- Fase 1 (agente B) ----
  // API del admin de Fase 1 (acompañantes, verificaciones, pedidos, suscripciones, Stars, ajustes, catálogos) y
  // tarea de vencimientos de planes. La instancia `planes` y `privado` se crean arriba, junto a ctx.
  const fase1Admin = createAdminFase1Router({ pool, planes, privado, apiPost, adminUser: config.adminUser || 'admin', log });
  admin.use('/api', fase1Admin.router);
  if (config.tareaPlanes !== false) planes.iniciarTarea({ listo: () => state.dbReady && !state.stopping });
  // ---- fin Fase 1 (agente B) ----

  admin.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  admin.get('/api/resumen', ah(async (req, res) => {
    const [pre, den, { paginas }] = await Promise.all([
      pool.query("SELECT count(*)::int AS total, count(*) FILTER (WHERE estado = 'nuevo')::int AS nuevos, count(*) FILTER (WHERE creado > now() - interval '7 days')::int AS ultimos7 FROM preregistros"),
      pool.query('SELECT count(*)::int AS total, count(*) FILTER (WHERE resuelto IS NULL)::int AS abiertas, count(*) FILTER (WHERE resuelto IS NULL AND categoria = ANY($1))::int AS urgentes FROM denuncias', [URGENTES]),
      registroTextos(),
    ]);
    const bloques = paginas.flatMap((p) => p.bloques);
    res.json({
      preregistros: pre.rows[0],
      denuncias: den.rows[0],
      textos: { modificados: bloques.filter((b) => textos.valores.has(b.clave)).length, total: bloques.length },
      generado: new Date().toISOString(),
      ...(await fase1Admin.contadores().catch(() => ({}))), // Fase 1 (agente B)
    });
  }));

  admin.get('/api/preregistros', ah(async (req, res) => {
    const [{ rows }, n] = await Promise.all([
      pool.query(`SELECT ${PRE_COLS} FROM preregistros ORDER BY creado DESC LIMIT ${ADMIN_LIMIT}`),
      pool.query('SELECT count(*)::int AS n FROM preregistros'),
    ]);
    res.json({ items: rows.map(preItem), total: n.rows[0].n, estados: ESTADOS_PRE });
  }));

  admin.post('/api/preregistros/:id/estado', apiPost, ah(async (req, res) => {
    if (!UUID_RE.test(req.params.id)) return apiErr(res, 404, 'Pre-registro no encontrado.');
    const estado = typeof req.body?.estado === 'string' ? req.body.estado : '';
    if (!ESTADOS_PRE.includes(estado)) return apiErr(res, 400, `Estado no válido. Usá: ${ESTADOS_PRE.join(', ')}.`);
    const { rows } = await pool.query(`UPDATE preregistros SET estado = $2 WHERE id = $1 RETURNING ${PRE_COLS}`, [req.params.id, estado]);
    if (!rows.length) return apiErr(res, 404, 'Pre-registro no encontrado.');
    log('admin: pre-registro', req.params.id, '→', estado);
    res.json({ ok: true, item: preItem(rows[0]) });
  }));

  admin.get('/api/denuncias', ah(async (req, res) => {
    const [{ rows }, n] = await Promise.all([
      pool.query(`SELECT ${DEN_COLS} FROM denuncias ORDER BY (resuelto IS NOT NULL), (categoria = ANY($1)) DESC, creado DESC LIMIT ${ADMIN_LIMIT}`, [URGENTES]),
      pool.query('SELECT count(*)::int AS n, count(*) FILTER (WHERE resuelto IS NULL)::int AS abiertas FROM denuncias'),
    ]);
    res.json({ items: rows.map(denItem), total: n.rows[0].n, abiertas: n.rows[0].abiertas });
  }));

  admin.post('/api/denuncias/:id/resolver', apiPost, ah(async (req, res) => {
    if (!UUID_RE.test(req.params.id)) return apiErr(res, 404, 'Denuncia no encontrada.');
    const r = await pool.query(
      "UPDATE denuncias SET estado = 'resuelta', resuelto = now() WHERE id = $1 AND resuelto IS NULL RETURNING id",
      [req.params.id],
    );
    const { rows } = await pool.query(`SELECT ${DEN_COLS} FROM denuncias WHERE id = $1`, [req.params.id]);
    if (!rows.length) return apiErr(res, 404, 'Denuncia no encontrada.');
    if (r.rowCount) log('admin: denuncia marcada como resuelta', req.params.id);
    res.json({ ok: true, item: denItem(rows[0]) });
  }));

  admin.get('/api/textos', ah(async (req, res) => {
    const { paginas } = await registroTextos();
    res.json({
      paginas: paginas.map((p) => ({
        id: p.id, nombre: p.nombre, ruta: p.ruta, total: p.bloques.length,
        modificados: p.bloques.filter((b) => textos.valores.has(b.clave)).length,
      })),
      ayuda: AYUDA_TEXTOS,
      maxValor: MAX_VALOR,
    });
  }));

  admin.get('/api/textos/historial', ah(async (req, res) => {
    const { porClave } = await registroTextos();
    const clave = typeof req.query.clave === 'string' ? req.query.clave : '';
    const b = porClave.get(clave);
    if (!b) return apiErr(res, 404, 'Texto no encontrado.');
    const { rows } = await pool.query('SELECT id::text AS id, valor, guardado FROM textos_historial WHERE clave = $1 ORDER BY id DESC LIMIT 50', [clave]);
    res.json({
      clave, contexto: b.contexto, pagina: b.pagina, tipo: b.tipo, defValor: b.defValor,
      actual: textos.valores.has(clave) ? textos.valores.get(clave) : b.defValor,
      modificado: textos.valores.has(clave),
      versiones: rows,
    });
  }));

  admin.post('/api/textos/historial/:id/restaurar', apiPost, ah(async (req, res) => {
    const id = /^\d{1,18}$/.test(req.params.id) ? req.params.id : null;
    const { rows } = id ? await pool.query('SELECT clave, valor FROM textos_historial WHERE id = $1', [id]) : { rows: [] };
    const { porClave } = await registroTextos();
    const b = rows[0] && porClave.get(rows[0].clave);
    if (!b) return apiErr(res, 404, 'Versión no encontrada.');
    const valor = rows[0].valor === b.defValor ? null : rows[0].valor;
    const actual = textos.valores.has(b.clave) ? textos.valores.get(b.clave) : null;
    if (valor !== actual) await guardarTextos([{ clave: b.clave, valor }]);
    res.json({ ok: true, pagina: b.pagina, clave: b.clave });
  }));

  admin.get('/api/textos/:pagina', ah(async (req, res) => {
    const { paginas } = await registroTextos();
    const p = paginas.find((x) => x.id === req.params.pagina);
    if (!p) return apiErr(res, 404, 'Página no encontrada.');
    const claves = p.bloques.map((b) => b.clave);
    const hist = new Map((await pool.query(
      'SELECT clave, count(*)::int AS n FROM textos_historial WHERE clave = ANY($1) GROUP BY clave', [claves],
    )).rows.map((r) => [r.clave, r.n]));
    res.json({
      pagina: { id: p.id, nombre: p.nombre, ruta: p.ruta },
      bloques: p.bloques.map((b) => ({
        clave: b.clave, contexto: b.contexto, tipo: b.tipo, defValor: b.defValor,
        valor: textos.valores.has(b.clave) ? textos.valores.get(b.clave) : null,
        modificado: textos.valores.has(b.clave),
        versiones: hist.get(b.clave) || 0,
      })),
    });
  }));

  admin.post('/api/textos/:pagina', apiPost, ah(async (req, res) => {
    const { paginas } = await registroTextos();
    const p = paginas.find((x) => x.id === req.params.pagina);
    if (!p) return apiErr(res, 404, 'Página no encontrada.');
    const entrada = req.body?.cambios;
    if (!isPlainObject(entrada)) return apiErr(res, 400, 'Faltan los cambios: {"cambios": {"clave": "texto"}}.');
    const cambios = [];
    for (const b of p.bloques) {
      if (!Object.hasOwn(entrada, b.clave)) continue;
      const raw = entrada[b.clave];
      if (raw !== null && typeof raw !== 'string') return apiErr(res, 400, `El texto ${b.clave} no es válido.`);
      const v = raw === null ? '' : limpiarValor(raw);
      if ([...v].length > MAX_VALOR) return apiErr(res, 400, `El texto ${b.clave} es demasiado largo (máximo ${MAX_VALOR} caracteres).`);
      const valor = v === '' || v === b.defValor ? null : v;
      const actual = textos.valores.has(b.clave) ? textos.valores.get(b.clave) : null;
      if (valor === actual) continue;
      cambios.push({ clave: b.clave, valor });
    }
    await guardarTextos(cambios);
    res.json({ ok: true, guardados: cambios.length });
  }));

  admin.use('/api', (req, res) => apiErr(res, 404, 'No encontrado.'));
  // eslint-disable-next-line no-unused-vars
  admin.use('/api', (err, req, res, next) => {
    if (err.type === 'entity.too.large') return apiErr(res, 413, 'Los datos enviados son demasiado grandes.');
    if (err.type === 'entity.parse.failed') return apiErr(res, 400, 'Formato de datos inválido.');
    log('error:', req.method, logPath(req.originalUrl.split('?')[0]), err.code || '', err.message);
    if (res.headersSent) return res.end();
    apiErr(res, 500, 'Ocurrió un error. Probá de nuevo en unos minutos.');
  });

  admin.use((req, res) => res.status(404).type('text/plain; charset=utf-8').send('No encontrado.'));
  if (A) {
    // Coincidencia exacta de mayúsculas/minúsculas (Express por defecto las ignora).
    const adminMount = express.Router({ caseSensitive: true });
    adminMount.use(A, admin);
    app.use(adminMount);
  }
  // /admin y /admin/* no tienen nada especial: caen en la 404 pública como cualquier otra ruta.

  // --- Sitio público real (SPA del MVP, HH_PROD='sitio'). Sin build, sigue la portada vieja. ---
  app.use(createSpaSitioRouter({ config, log, pool }));

  // --- Páginas HTML (rutas limpias + placeholders) ---------------------------
  const PAGE = /^\/([a-z0-9][a-z0-9-]{0,63})(\.html|\/)?$/;
  app.use(ah(async (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const p = req.path;
    const qs = queryString(req);
    if (p === '/') {
      const html = await renderHtml('index.html');
      return html === null ? next() : sendHtml(res, html);
    }
    if (p === '/index.html') return res.redirect(301, '/' + qs);
    if (p === '/demo') return res.redirect(301, '/demo/' + qs);
    if (p === '/demo/' || p === '/demo/index.html') {
      const html = await renderHtml('demo/index.html');
      return html === null ? next() : sendHtml(res, html);
    }
    const m = PAGE.exec(p);
    if (m && m[1] !== '404') {
      const [, name, suffix] = m;
      if (!(await exists(name + '.html'))) return next();
      if (suffix) return res.redirect(301, '/' + name + qs); // /terminos.html y /terminos/ → /terminos
      return sendHtml(res, await renderHtml(name + '.html'));
    }
    if (/\.html?$/i.test(p)) {
      // Cualquier otro .html se sirve con placeholders reemplazados (nunca en crudo por express.static).
      let rel;
      try { rel = decodeURIComponent(p).replace(/^\/+/, ''); } catch { return next(); }
      if (path.basename(rel) === '404.html') return next();
      // La demo solo por /demo/ (con su CSP y noindex), no por rutas codificadas como /demo%2Findex.html.
      if (path.resolve(config.publicDir, rel).startsWith(path.join(config.publicDir, 'demo') + path.sep)) return next();
      const html = await renderHtml(rel);
      return html === null ? next() : sendHtml(res, html);
    }
    next();
  }));

  const serveStatic = express.static(config.publicDir, {
    index: false,
    redirect: false,
    dotfiles: 'ignore',
    maxAge: '1h',
  });
  // express.static nunca sirve .html (quedarían los {{...}} sin reemplazar: /404.html, /terminos%2Ehtml).
  app.use((req, res, next) => {
    let p;
    try { p = decodeURIComponent(req.path); } catch { return next(); }
    if (/\.html?$/i.test(p)) return next();
    serveStatic(req, res, next);
  });

  // --- 404 y errores -------------------------------------------------------
  const NOT_FOUND_FALLBACK = '<!doctype html><html lang="es-AR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Página no encontrada — SexyRose</title></head><body><h1>Página no encontrada</h1><p><a href="/">Volver al inicio</a></p></body></html>';
  app.use(ah(async (req, res) => {
    const html = await renderHtml('404.html');
    sendHtml(res, html ?? NOT_FOUND_FALLBACK, 404);
  }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const isApi = req.path.startsWith('/api/');
    if (err.type === 'entity.too.large') return isApi ? fail(res, 413, 'Los datos enviados son demasiado grandes.') : res.status(413).end();
    if (err.type === 'entity.parse.failed') return isApi ? fail(res, 400, 'Formato de datos inválido.') : res.status(400).end();
    log('error:', req.method, logPath(req.path), err.code || '', err.message);
    if (res.headersSent) return res.end();
    if (isApi) return fail(res, 500, 'Ocurrió un error. Probá de nuevo en unos minutos.');
    res.status(500).type('text/plain; charset=utf-8').send('Ocurrió un error. Probá de nuevo en unos minutos.');
  });

  // --- Base de datos: esquema con reintentos y purga de ip_hash --------------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms).unref());
  const purgeIpHashes = async () => {
    if (!state.dbReady) return;
    try {
      const a = await pool.query("UPDATE preregistros SET ip_hash = NULL WHERE ip_hash IS NOT NULL AND creado < now() - interval '30 days'");
      const b = await pool.query("UPDATE denuncias SET ip_hash = NULL WHERE ip_hash IS NOT NULL AND creado < now() - interval '30 days'");
      log(`purga de ip_hash (>30 días): ${a.rowCount} pre-registros, ${b.rowCount} denuncias`);
    } catch (e) {
      log('purga de ip_hash falló:', e.code || e.message);
    }
  };
  const leerEsquema = async () => {
    let files = [];
    try { files = (await fs.readdir(config.dbDir)).filter((f) => f.endsWith('.sql')).sort(); } catch { files = []; }
    if (!files.length) return [await fs.readFile(config.schemaPath, 'utf8')];
    return Promise.all(files.map((f) => fs.readFile(path.join(config.dbDir, f), 'utf8')));
  };
  const initDb = async () => {
    const sqls = await leerEsquema();
    for (let attempt = 1; !state.stopping; attempt++) {
      try {
        for (const sql of sqls) await pool.query(sql);
        state.dbReady = true;
        log('base de datos lista (esquema aplicado)');
        try {
          await cargarTextos();
          log(`textos editados cargados: ${textos.valores.size}`);
        } catch (e) {
          log('no se pudieron cargar los textos editados (se usan los del archivo):', e.code || e.message);
        }
        await purgeIpHashes();
        return;
      } catch (e) {
        const delay = Math.min(30000, 1000 * 2 ** Math.min(attempt - 1, 5));
        log(`base de datos no disponible (intento ${attempt}: ${e.code || e.message}); reintento en ${delay / 1000} s`);
        await sleep(delay);
      }
    }
  };

  // Sesiones vencidas y tokens de email viejos.
  const limpiarSesiones = async () => {
    if (!state.dbReady) return;
    try {
      await pool.query('DELETE FROM sesiones WHERE expira < now()');
      await pool.query("DELETE FROM tokens_email WHERE expira < now() - interval '7 days'");
    } catch (e) { log('limpieza de sesiones falló:', e.code || e.message); }
  };
  const timers = [
    setInterval(purgeIpHashes, DAY),
    setInterval(limpiarSesiones, 6 * HOUR),
    setInterval(() => rl.sweep(HOUR), 10 * 60 * 1000),
  ];
  timers.forEach((t) => t.unref());

  const shutdown = async () => {
    planes.detenerTarea();
    state.stopping = true;
    timers.forEach(clearInterval);
    await pool.end().catch(() => {});
  };

  return { app, initDb, shutdown, state, ctx };
}

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------
export async function start(overrides = {}) {
  const config = { ...loadConfig(), ...overrides };
  const { app, initDb, shutdown, state } = createApp(config);
  const server = app.listen(config.port, config.host);
  server.requestTimeout = 30000;
  server.headersTimeout = 20000;
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const port = server.address().port;
  config.log(`SexyRose escuchando en ${config.host}:${port}`);
  const ready = initDb();
  const close = async () => {
    await new Promise((r) => server.close(() => r()));
    await shutdown();
  };
  return { server, port, ready, close, state };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const instance = await start();
  let closing = false;
  const onSignal = (sig) => {
    if (closing) return;
    closing = true;
    console.log(new Date().toISOString(), `${sig} recibido: cerrando...`);
    setTimeout(() => process.exit(1), 10000).unref();
    instance.close().then(() => process.exit(0), () => process.exit(1));
  };
  process.on('SIGTERM', () => onSignal('SIGTERM'));
  process.on('SIGINT', () => onSignal('SIGINT'));
}
