// Endurecimientos de seguridad (auditoría del 13/11/2026):
//
// - ipCliente: la IP real del visitante. CF-Connecting-IP solo se cree cuando el pedido llega desde una red
//   privada/local (cloudflared corre en la red interna de Docker). Si alguien llega directo desde internet,
//   se usa la IP de la conexión y se ignora la cabecera (no se puede falsificar la IP para saltar límites).
// - crearSemaforo: limita cuántos cálculos de scrypt corren a la vez (evita que muchos pedidos agoten la CPU).
// - crearLimitesAuth: límites de ingreso sin que un tercero pueda bloquear una cuenta ajena:
//   por IP y por (IP, email) son límites duros; por email solo hay una demora creciente (nunca bloquea).
// - crearCfAccess: valida el JWT de Cloudflare Access (Cf-Access-Jwt-Assertion / cookie CF_Authorization) antes del admin.
import crypto from 'node:crypto';
import net from 'node:net';

// ---------------------------------------------------------------------------
// IP del cliente
// ---------------------------------------------------------------------------
const quitarV4Mapeada = (ip) => (ip && ip.startsWith('::ffff:') ? ip.slice(7) : ip);

export function esIpPrivada(ip) {
  ip = quitarV4Mapeada(String(ip || '').trim());
  if (!ip) return false;
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    return l === '::1' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80:');
  }
  return false;
}

// confiar: 'privada' (por defecto: la conexión viene de la red interna), 'nunca' o 'siempre' (solo pruebas)
export function crearIpCliente(confiar = 'privada') {
  return (req) => {
    const remota = quitarV4Mapeada(req.socket?.remoteAddress || '');
    const puedeCreer = confiar === 'siempre' || (confiar !== 'nunca' && esIpPrivada(remota));
    if (puedeCreer) {
      const cf = req.headers['cf-connecting-ip'];
      if (typeof cf === 'string' && net.isIP(cf.trim())) return cf.trim();
    }
    return remota || 'desconocida';
  };
}

// ---------------------------------------------------------------------------
// Semáforo (scrypt)
// ---------------------------------------------------------------------------
export class OcupadoError extends Error {
  constructor() { super('Hay mucha demanda en este momento. Probá de nuevo en unos segundos.'); this.code = 'SR_OCUPADO'; this.status = 503; }
}

export function crearSemaforo(max = 4, maxCola = 200) {
  let activos = 0;
  const cola = [];
  const liberar = () => {
    activos--;
    const sig = cola.shift();
    if (sig) { activos++; sig(); }
  };
  return {
    async correr(fn) {
      if (activos >= max) {
        if (cola.length >= maxCola) throw new OcupadoError();
        await new Promise((ok) => cola.push(ok));
      } else {
        activos++;
      }
      try { return await fn(); } finally { liberar(); }
    },
    estado: () => ({ activos, enCola: cola.length }),
  };
}

// ---------------------------------------------------------------------------
// Límites de ingreso
// ---------------------------------------------------------------------------
const dormir = (ms) => new Promise((ok) => { const t = setTimeout(ok, ms); if (t.unref) t.unref(); });

// rl: el limitador en memoria de server.js ({ allowed, hit, retryAfterSec }).
// Devuelve { revisar(req, res, { ip, email }) → false si ya respondió 429; fallo({ ip, email }); }
export function crearLimitesAuth(rl, {
  prefijo,
  porIp = 20, porIpYEmail = 10, ventanaMs = 15 * 60 * 1000,
  // Demora por email: desde el fallo número `demoraDesde` en la ventana, `demoraMs` por fallo extra (tope demoraMaxMs).
  demoraDesde = 5, demoraMs = 500, demoraMaxMs = 4000,
  dormirImpl = dormir,
} = {}) {
  const hEmail = (email) => crypto.createHash('sha256').update(String(email || ''), 'utf8').digest('hex');
  const k = {
    ip: (ip) => `${prefijo}:ip:${ip}`,
    ipEm: (ip, email) => `${prefijo}:ipem:${ip}:${hEmail(email)}`,
    em: (email) => `${prefijo}:em:${hEmail(email)}`,
  };
  const negar = (res, key, msg) => {
    res.set('Retry-After', String(rl.retryAfterSec(key, ventanaMs)));
    res.status(429).json({ ok: false, error: msg });
    return false;
  };
  return {
    async revisar(req, res, { ip, email }) {
      if (!rl.allowed(k.ip(ip), porIp, ventanaMs)) return negar(res, k.ip(ip), 'Demasiados intentos. Probá de nuevo en 15 minutos.');
      if (email && !rl.allowed(k.ipEm(ip, email), porIpYEmail, ventanaMs)) return negar(res, k.ipEm(ip, email), 'Demasiados intentos. Probá de nuevo en 15 minutos.');
      if (email) {
        // Nunca bloquea al dueño de la cuenta: solo lo hace esperar un poco si hubo muchos fallos con ese email.
        const n = rl.count ? rl.count(k.em(email), ventanaMs) : 0;
        if (n >= demoraDesde) await dormirImpl(Math.min(demoraMaxMs, (n - demoraDesde + 1) * demoraMs));
      }
      return true;
    },
    fallo({ ip, email }) {
      rl.hit(k.ip(ip));
      if (email) { rl.hit(k.ipEm(ip, email)); rl.hit(k.em(email)); }
    },
    claves: k,
  };
}

// ---------------------------------------------------------------------------
// Cloudflare Access (JWT RS256)
// ---------------------------------------------------------------------------
const b64urlJson = (s) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));

export function crearCfAccess({
  teamDomain = '', aud = '', requerido = false, fetchImpl = globalThis.fetch, log = () => {},
  ahora = () => Date.now(), timeoutMs = 5000, cacheMs = 60 * 60 * 1000, margenSeg = 60,
} = {}) {
  const team = String(teamDomain || '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const audiencia = String(aud || '').trim();
  const configurado = Boolean(team && audiencia);
  const iss = `https://${team}`;
  const certsUrl = `${iss}/cdn-cgi/access/certs`;
  let claves = new Map(); // kid → KeyObject
  let traidas = 0;
  let ultimoForzado = 0;

  async function traerClaves(forzar = false) {
    const t = ahora();
    if (!forzar && claves.size && t - traidas < cacheMs) return;
    if (forzar) {
      if (t - ultimoForzado < 30 * 1000) return; // por kid desconocido, como mucho una vez cada 30 s
      ultimoForzado = t;
    }
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), timeoutMs);
    if (to.unref) to.unref();
    try {
      const r = await fetchImpl(certsUrl, { signal: ctrl.signal, headers: { accept: 'application/json' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      const nuevas = new Map();
      for (const jwk of Array.isArray(j.keys) ? j.keys : []) {
        if (!jwk || jwk.kty !== 'RSA' || !jwk.kid) continue;
        try { nuevas.set(jwk.kid, crypto.createPublicKey({ key: jwk, format: 'jwk' })); } catch { /* clave inválida */ }
      }
      if (nuevas.size) { claves = nuevas; traidas = t; }
    } catch (e) {
      log('cloudflare access: no se pudieron traer las claves:', e.message);
    } finally {
      clearTimeout(to);
    }
  }

  async function validar(token) {
    if (typeof token !== 'string' || token.length > 8192) return { ok: false, motivo: 'sin token' };
    const partes = token.split('.');
    if (partes.length !== 3) return { ok: false, motivo: 'formato' };
    let cab; let datos;
    try { cab = b64urlJson(partes[0]); datos = b64urlJson(partes[1]); } catch { return { ok: false, motivo: 'formato' }; }
    const esObj = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
    if (!esObj(cab) || !esObj(datos)) return { ok: false, motivo: 'formato' };
    if (cab.alg !== 'RS256' || typeof cab.kid !== 'string' || !cab.kid) return { ok: false, motivo: 'algoritmo' };
    await traerClaves(false);
    if (!claves.has(cab.kid)) await traerClaves(true);
    const clave = claves.get(cab.kid);
    if (!clave) return { ok: false, motivo: 'clave desconocida' };
    const firmaOk = crypto.verify('RSA-SHA256', Buffer.from(partes[0] + '.' + partes[1]), clave, Buffer.from(partes[2], 'base64url'));
    if (!firmaOk) return { ok: false, motivo: 'firma' };
    const s = Math.floor(ahora() / 1000);
    const auds = Array.isArray(datos.aud) ? datos.aud : [datos.aud];
    if (!auds.includes(audiencia)) return { ok: false, motivo: 'aud' };
    if (datos.iss !== iss) return { ok: false, motivo: 'iss' };
    if (typeof datos.exp !== 'number' || datos.exp < s - margenSeg) return { ok: false, motivo: 'vencido' };
    if (typeof datos.nbf === 'number' && datos.nbf > s + margenSeg) return { ok: false, motivo: 'todavía no vale' };
    return { ok: true, email: typeof datos.email === 'string' ? datos.email : null };
  }

  const tokenDe = (req) => {
    const h = req.headers['cf-access-jwt-assertion'];
    if (typeof h === 'string' && h) return h.trim();
    const m = /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(req.headers.cookie || '');
    if (!m) return '';
    try { return decodeURIComponent(m[1]); } catch { return ''; } // cookie mal codificada → sin token (403)
  };

  if (!configurado) {
    log(requerido
      ? 'AVISO: CF_ACCESS_REQUIRED=1 pero faltan CF_ACCESS_TEAM_DOMAIN o CF_ACCESS_AUD: el admin queda cerrado (503).'
      : 'AVISO: el admin no valida Cloudflare Access (faltan CF_ACCESS_TEAM_DOMAIN y CF_ACCESS_AUD). Queda la ruta secreta + usuario y contraseña.');
  } else {
    log(`admin: valida el JWT de Cloudflare Access (${team})`);
  }

  const middleware = async (req, res, next) => {
    if (!configurado) {
      if (requerido) return res.status(503).type('text/plain; charset=utf-8').send('Admin cerrado: falta configurar Cloudflare Access.');
      return next();
    }
    try {
      const v = await validar(tokenDe(req));
      if (!v.ok) return res.status(403).type('text/plain; charset=utf-8').send('Acceso no autorizado.');
      req.cfAccessEmail = v.email;
      return next();
    } catch (e) {
      return next(e);
    }
  };
  return { middleware, validar, configurado };
}
