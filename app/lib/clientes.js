// Cuentas de interesados (clientes): sesión propia, separada de la de las acompañantes.
//
// Mismo mecanismo que lib/auth.js (token aleatorio en una cookie HttpOnly, SameSite=Lax, 30 días; en la base solo el
// SHA-256), pero con su propia cookie (sr_cliente) y sus propias tablas (clientes, sesiones_clientes). Así una cuenta de
// cliente nunca puede usar las rutas de la acompañante (/api/cuenta) ni al revés.
import { parseCookies, sha256, tokenAleatorio } from './auth.js';

export const COOKIE_CLIENTE = 'sr_cliente';
export const SESION_DIAS_CLIENTE = 30;
// Nombre de usuario: 3 a 20 caracteres (letras sin acentos, números, punto, guion bajo y guion), empieza con letra o número.
export const USUARIO_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{2,19}$/;
export const normUsuario = (v) => (typeof v === 'string' ? v.trim() : '');

export function createAuthClientes({ pool, config }) {
  const secure = typeof config.cookieSecure === 'boolean' ? config.cookieSecure : String(config.siteUrl || '').startsWith('https://');
  const cookieHeader = (value, maxAgeSec) => [
    `${COOKIE_CLIENTE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`, ...(secure ? ['Secure'] : []),
  ].join('; ');

  const crearSesion = async (res, clienteId, req) => {
    const token = tokenAleatorio(32);
    const ua = String((req && req.headers['user-agent']) || '').slice(0, 200);
    await pool.query(
      `INSERT INTO sesiones_clientes (token_hash, cliente_id, expira, ua) VALUES ($1, $2, now() + make_interval(days => $3), $4)`,
      [sha256(token), clienteId, SESION_DIAS_CLIENTE, ua],
    );
    res.append('Set-Cookie', cookieHeader(token, SESION_DIAS_CLIENTE * 24 * 3600));
    return token;
  };
  const tokenDeReq = (req) => {
    const t = parseCookies(req.headers.cookie)[COOKIE_CLIENTE];
    return typeof t === 'string' && /^[A-Za-z0-9_-]{20,100}$/.test(t) ? t : null;
  };
  const cerrarSesion = async (req, res) => {
    const t = tokenDeReq(req);
    if (t) await pool.query('DELETE FROM sesiones_clientes WHERE token_hash = $1', [sha256(t)]);
    res.append('Set-Cookie', cookieHeader('', 0));
  };
  const cerrarOtrasSesiones = async (clienteId, req) => {
    const t = req ? tokenDeReq(req) : null;
    if (t) await pool.query('DELETE FROM sesiones_clientes WHERE cliente_id = $1 AND token_hash <> $2', [clienteId, sha256(t)]);
    else await pool.query('DELETE FROM sesiones_clientes WHERE cliente_id = $1', [clienteId]);
  };
  // Cliente de la sesión (o null). Queda en req.cliente.
  const clienteDeReq = async (req) => {
    if (req.cliente !== undefined) return req.cliente;
    const t = tokenDeReq(req);
    let c = null;
    if (t) {
      const { rows } = await pool.query(
        `SELECT c.id, c.usuario, c.email, c.email_verificado, c.estado, c.creado
           FROM sesiones_clientes s JOIN clientes c ON c.id = s.cliente_id
          WHERE s.token_hash = $1 AND s.expira > now() AND c.estado <> 'baja'`,
        [sha256(t)],
      );
      c = rows[0] || null;
    }
    req.cliente = c;
    return c;
  };
  const requireCliente = (req, res, next) => {
    clienteDeReq(req).then((c) => {
      if (!c) return res.status(401).json({ ok: false, error: 'Tenés que iniciar sesión.', requiereLogin: true });
      next();
    }, next);
  };
  // Para comprar o pedir: cuenta activa y email confirmado.
  const requireVerificado = (req, res, next) => {
    const c = req.cliente;
    if (!c) return res.status(401).json({ ok: false, error: 'Tenés que iniciar sesión.', requiereLogin: true });
    if (c.estado !== 'activa') return res.status(403).json({ ok: false, error: 'Tu cuenta está suspendida. Escribinos a contacto@sexyrose.net.' });
    if (!c.email_verificado) return res.status(403).json({ ok: false, error: 'Confirmá tu email para seguir. Te mandamos un link cuando creaste tu cuenta.', requiereVerificacion: true });
    next();
  };
  return { crearSesion, cerrarSesion, cerrarOtrasSesiones, clienteDeReq, requireCliente, requireVerificado };
}
