// Cuentas de acompañantes: contraseñas (scrypt), sesiones con cookie y protección de las mutaciones.
//
// - Contraseña: scrypt N=2^15 r=8 p=1, sal de 16 bytes, clave de 64 bytes. Formato guardado:
//   scrypt$N$r$p$salBase64$hashBase64 (así se pueden subir los parámetros sin romper las cuentas viejas).
// - Sesión: token aleatorio de 32 bytes en la cookie `sr_sesion` (HttpOnly, SameSite=Lax, Path=/, 30 días, Secure en https).
//   En la base solo queda el SHA-256 del token.
// - Mutaciones (POST/PUT/DELETE): mismo origen + cabecera `X-SR: 1` + JSON o multipart.
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { crearSemaforo } from './seguridad.js';

const scryptCrudo = promisify(crypto.scrypt);
// Como mucho 4 cálculos de scrypt a la vez (cada uno usa ~32 MB y CPU); el resto espera en cola (tope 200 → 503).
const semaforoScrypt = crearSemaforo(4, 200);
const scryptAsync = (...a) => semaforoScrypt.correr(() => scryptCrudo(...a));
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, keylen: 64 };
export const COOKIE = 'sr_sesion';
export const SESION_DIAS = 30;

export const sha256 = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest();
export const tokenAleatorio = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const { N, r, p, keylen } = SCRYPT;
  const key = await scryptAsync(String(password).normalize('NFKC'), salt, keylen, { N, r, p, maxmem: 128 * N * r * 2 });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    // Igual se hace un cálculo para no revelar por el tiempo de respuesta si la cuenta existe.
    await hashPassword(password);
    return false;
  }
  const N = Number(parts[1]); const r = Number(parts[2]); const p = Number(parts[3]);
  const salt = Buffer.from(parts[4], 'base64');
  const expected = Buffer.from(parts[5], 'base64');
  if (!N || !r || !p || !salt.length || !expected.length) return false;
  const key = await scryptAsync(String(password).normalize('NFKC'), salt, expected.length, { N, r, p, maxmem: 128 * N * r * 2 });
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

// Hash "falso" ya calculado, para el login con emails que no existen.
let dummyHash = null;
export async function verifyDummy(password) {
  if (!dummyHash) dummyHash = await hashPassword('x'.repeat(12));
  await verifyPassword(password, dummyHash);
  return false;
}

export function parseCookies(header) {
  const out = {};
  if (typeof header !== 'string') return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!k || k in out) continue;
    try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch { out[k] = part.slice(i + 1).trim(); }
  }
  return out;
}

// Mismo origen: Sec-Fetch-Site (si viene) tiene que ser same-origin, y Origin o Referer tienen que ser este host.
export function sameOrigin(req) {
  const host = req.headers.host;
  if (!host) return false;
  const sfs = req.headers['sec-fetch-site'];
  if (sfs && sfs !== 'same-origin') return false;
  const src = req.headers.origin || req.headers.referer;
  if (!src) return false;
  try { return new URL(src).host === host; } catch { return false; }
}

export function createAuth({ pool, config }) {
  const secure = typeof config.cookieSecure === 'boolean' ? config.cookieSecure : String(config.siteUrl || '').startsWith('https://');

  const cookieHeader = (value, maxAgeSec) => [
    `${COOKIE}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSec}`,
    ...(secure ? ['Secure'] : []),
  ].join('; ');

  const crearSesion = async (res, cuentaId, req) => {
    const token = tokenAleatorio(32);
    const ua = String((req && req.headers['user-agent']) || '').slice(0, 200);
    await pool.query(
      `INSERT INTO sesiones (token_hash, cuenta_id, expira, ua) VALUES ($1, $2, now() + make_interval(days => $3), $4)`,
      [sha256(token), cuentaId, SESION_DIAS, ua],
    );
    res.append('Set-Cookie', cookieHeader(token, SESION_DIAS * 24 * 3600));
    return token;
  };

  const tokenDeReq = (req) => {
    const t = parseCookies(req.headers.cookie)[COOKIE];
    return typeof t === 'string' && /^[A-Za-z0-9_-]{20,100}$/.test(t) ? t : null;
  };

  const cerrarSesion = async (req, res) => {
    const t = tokenDeReq(req);
    if (t) await pool.query('DELETE FROM sesiones WHERE token_hash = $1', [sha256(t)]);
    res.append('Set-Cookie', cookieHeader('', 0));
  };

  // Cierra todas las sesiones de la cuenta salvo (opcionalmente) la actual.
  const cerrarOtrasSesiones = async (cuentaId, req) => {
    const t = req ? tokenDeReq(req) : null;
    if (t) await pool.query('DELETE FROM sesiones WHERE cuenta_id = $1 AND token_hash <> $2', [cuentaId, sha256(t)]);
    else await pool.query('DELETE FROM sesiones WHERE cuenta_id = $1', [cuentaId]);
  };

  // Cuenta de la sesión (o null). Guarda el resultado en req.cuenta.
  const cuentaDeReq = async (req) => {
    if (req.cuenta !== undefined) return req.cuenta;
    const t = tokenDeReq(req);
    let cuenta = null;
    if (t) {
      const { rows } = await pool.query(
        `SELECT c.id, c.email, c.email_verificado, c.estado, c.creado
           FROM sesiones s JOIN cuentas c ON c.id = s.cuenta_id
          WHERE s.token_hash = $1 AND s.expira > now() AND c.estado <> 'baja'`,
        [sha256(t)],
      );
      cuenta = rows[0] || null;
    }
    req.cuenta = cuenta;
    return cuenta;
  };

  const requireCuenta = (req, res, next) => {
    cuentaDeReq(req).then((c) => {
      if (!c) return res.status(401).json({ ok: false, error: 'Tenés que iniciar sesión.' });
      next();
    }, next);
  };

  // Las cuentas suspendidas pueden entrar y ver su estado, pero no cambiar nada.
  const requireActiva = (req, res, next) => {
    if (req.cuenta && req.cuenta.estado !== 'activa') {
      return res.status(403).json({ ok: false, error: 'Tu cuenta está suspendida. Escribinos a contacto@sexyrose.net.' });
    }
    next();
  };

  // POST/PUT/PATCH/DELETE: mismo origen + X-SR: 1 + JSON o multipart.
  const guardMutacion = (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
    if (!sameOrigin(req)) return res.status(403).json({ ok: false, error: 'Origen no permitido.' });
    if (req.headers['x-sr'] !== '1') return res.status(403).json({ ok: false, error: 'Falta la cabecera de seguridad.' });
    const ct = String(req.headers['content-type'] || '').toLowerCase();
    const hasBody = Number(req.headers['content-length'] || 0) > 0 || req.headers['transfer-encoding'];
    if (hasBody && !ct.startsWith('application/json') && !ct.startsWith('multipart/form-data')) {
      return res.status(415).json({ ok: false, error: 'Formato de datos no admitido.' });
    }
    next();
  };

  return { crearSesion, cerrarSesion, cerrarOtrasSesiones, cuentaDeReq, requireCuenta, requireActiva, guardMutacion, cookieSecure: secure };
}
