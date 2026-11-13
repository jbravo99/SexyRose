// Cuenta del interesado (cliente): /api/cliente/...
//   Registro (usuario, email, contraseña, 18+ y Términos), confirmación del email, ingreso, salida, recuperar contraseña.
//   GET  /yo                         → { cliente: { usuario, email, emailVerificado }, pedidosNoLeidos }
//   GET  /compras                    → packs comprados (Tu espacio → Mis compras)
//   Pedidos personalizados (lib/solicitudes.js), con email confirmado:
//   GET  /pedidos                    → lista · POST /pedidos {slug, texto} → { id }
//   GET  /pedidos/:id?since=<id>     → detalle + mensajes nuevos (el chat lo consulta cada ~4 s)
//   POST /pedidos/:id/mensajes {texto} · POST /pedidos/:id/cerrar · POST /pedidos/:id/verificar-pagos
//   POST /pedidos/items/:item/pagar  → { url } (Checkout Pro) · GET /pedidos/items/:item/archivo[?preview=1]
// Las mutaciones exigen mismo origen + X-SR: 1 (como /api/cuenta). Sesión propia (cookie sr_cliente, lib/clientes.js).
import express from 'express';
import { hashPassword, sha256, tokenAleatorio, verifyDummy, verifyPassword } from '../lib/auth.js';
import { USUARIO_RE, normUsuario } from '../lib/clientes.js';
import { plantillas, sendMail, urlSitio } from '../lib/mail.js';
import { SolicitudError } from '../lib/solicitudes.js';
import { ContenidoError } from '../lib/contenido.js';
import * as storage from '../lib/storage.js';
import { crearLimitesAuth } from '../lib/seguridad.js';
import { prelanzamientoEn, REGISTRO_CLIENTE_CERRADO } from '../lib/prelanzamiento.js';

const HOUR = 60 * 60 * 1000;
const EMAIL_RE = /^[^\s@<>()[\]",;:\\]+@[^\s@<>()[\]",;:\\]+\.[^\s@<>()[\]",;:\\]{2,}$/;
const normEmail = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : '');
const validEmail = (s) => s.length <= 254 && EMAIL_RE.test(s);
// Respuesta del registro: igual exista o no el email (no se revela si ya hay una cuenta con ese email).
export const REGISTRO_CLIENTE_OK = { ok: true, revisarEmail: true, mensaje: 'Revisá tu email para continuar. Te mandamos un link para confirmar tu cuenta.' };
function errorPassword(pw, email) {
  if (typeof pw !== 'string' || [...pw].length < 10) return 'La contraseña tiene que tener al menos 10 caracteres.';
  if (pw.length > 200) return 'La contraseña es demasiado larga.';
  if (pw.toLowerCase() === String(email || '').toLowerCase()) return 'La contraseña no puede ser igual a tu email.';
  if (/^(.)\1+$/.test(pw)) return 'Elegí una contraseña menos predecible.';
  return null;
}

export function createClienteRouter({ pool, rl, ipHash, auth, authCli, solicitudes, contenido, state, log = () => {}, dormirAuth }) {
  const r = express.Router();
  const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  const fail = (res, status, error, extra = {}) => res.status(status).json({ ok: false, error, ...extra });
  // Ingreso: límite duro por IP y por (IP, email); por email solo demora (nadie puede bloquear la cuenta de otro).
  const limLogin = crearLimitesAuth(rl, { prefijo: 'cli-login', dormirImpl: dormirAuth });
  const limit = (req, res, key, max, windowMs, msg) => {
    if (!rl.allowed(key, max, windowMs)) { res.set('Retry-After', String(rl.retryAfterSec(key, windowMs))); fail(res, 429, msg); return false; }
    return true;
  };
  r.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (state && !state.dbReady) return fail(res, 503, 'El servicio no está disponible en este momento. Probá en unos minutos.');
    next();
  });
  r.use(auth.guardMutacion);
  r.use(express.json({ limit: '16kb', strict: true, type: 'application/json' }));
  const body = (req) => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {});

  const tokenEmail = async (clienteId, tipo, horas) => {
    const token = tokenAleatorio(32);
    await pool.query('UPDATE tokens_email_clientes SET usado = now() WHERE cliente_id = $1 AND tipo = $2 AND usado IS NULL', [clienteId, tipo]);
    await pool.query(`INSERT INTO tokens_email_clientes (token_hash, cliente_id, tipo, expira) VALUES ($1, $2, $3, now() + make_interval(hours => $4))`,
      [sha256(token), clienteId, tipo, horas]);
    return token;
  };
  const enviarVerificacion = async (clienteId, email, usuario) => {
    const token = await tokenEmail(clienteId, 'verificar', 48);
    await sendMail({ to: email, ...plantillas.verificarCliente({ usuario, url: urlSitio('/cliente/verificar?token=' + token) }) });
  };
  const yoJson = async (c) => ({
    id: c.id, usuario: c.usuario, email: c.email, emailVerificado: Boolean(c.email_verificado), estado: c.estado, creado: c.creado,
    pedidosNoLeidos: solicitudes ? await solicitudes.contarNoLeidos('cliente', c.id) : 0,
  });
  const leer = async (id) => (await pool.query('SELECT id, usuario, email, email_verificado, estado, creado FROM clientes WHERE id = $1', [id])).rows[0];

  // --- Registro / ingreso ----------------------------------------------------------------------
  r.post('/registro', ah(async (req, res) => {
    // Home provisoria (Admin → Ajustes): el registro de interesados está cerrado; las cuentas que ya existen ingresan igual
    if (await prelanzamientoEn(pool)) return fail(res, 403, REGISTRO_CLIENTE_CERRADO, { registroCerrado: true });
    const ipKey = 'cli-reg:' + ipHash(req);
    if (!limit(req, res, ipKey, 5, HOUR, 'Se crearon demasiadas cuentas desde tu conexión. Probá de nuevo en una hora.')) return;
    const b = body(req);
    const usuario = normUsuario(b.usuario);
    if (!USUARIO_RE.test(usuario)) return fail(res, 400, 'El nombre de usuario tiene que tener entre 3 y 20 caracteres: letras, números, punto, guion o guion bajo.');
    const email = normEmail(b.email);
    if (!validEmail(email)) return fail(res, 400, 'El email no es válido.');
    const pwErr = errorPassword(b.password, email);
    if (pwErr) return fail(res, 400, pwErr);
    if (b.mayorEdad !== true) return fail(res, 400, 'Tenés que confirmar que sos mayor de 18 años.');
    if (b.aceptaTerminos !== true) return fail(res, 400, 'Tenés que aceptar los Términos y la Política de privacidad.');
    // El nombre de usuario es público: si está tomado se avisa (con el límite por IP). El email nunca se revela.
    const { rowCount: usado } = await pool.query('SELECT 1 FROM clientes WHERE usuario_norm = $1', [usuario.toLowerCase()]);
    if (usado) { rl.hit(ipKey); return fail(res, 409, 'Ese nombre de usuario ya está en uso. Elegí otro.'); }
    const hash = await hashPassword(b.password);
    let id = null;
    const { rowCount: emailUsado } = await pool.query('SELECT 1 FROM clientes WHERE email = $1', [email]);
    if (!emailUsado) {
      try {
        const { rows } = await pool.query(
          `INSERT INTO clientes (usuario, usuario_norm, email, pass_hash, acepto_terminos, mayor_edad_declarada) VALUES ($1, $2, $3, $4, now(), true) RETURNING id`,
          [usuario, usuario.toLowerCase(), email, hash]);
        id = rows[0].id;
      } catch (e) {
        if (e.code !== '23505') throw e;
        rl.hit(ipKey);
        if (String(e.constraint || '').includes('usuario')) return fail(res, 409, 'Ese nombre de usuario ya está en uso. Elegí otro.');
        id = null; // carrera: el email se registró recién
      }
    }
    rl.hit(ipKey);
    // Misma respuesta en los dos casos. La sesión se abre con el link del email.
    if (id) await enviarVerificacion(id, email, usuario).catch((e) => log('mail verificación (cliente):', e.message));
    else {
      // Aviso a la dueña del email: como mucho 1 por hora por email (que no sirva para mandarle spam).
      const k = 'cli-intreg:' + sha256(email).toString('hex');
      if (rl.allowed(k, 1, HOUR)) {
        rl.hit(k);
        await sendMail({ to: email, ...plantillas.intentoRegistro({ urlIngresar: urlSitio('/cliente/ingresar') }) })
          .catch((e) => log('mail intento de registro (cliente):', e.message));
      }
    }
    res.status(201).json(REGISTRO_CLIENTE_OK);
  }));

  r.post('/login', ah(async (req, res) => {
    const b = body(req);
    const email = normEmail(b.email);
    const quien = { ip: ipHash(req), email };
    if (!(await limLogin.revisar(req, res, quien))) return;
    const pw = typeof b.password === 'string' ? b.password : '';
    const { rows } = validEmail(email) ? await pool.query('SELECT id, pass_hash, estado FROM clientes WHERE email = $1', [email]) : { rows: [] };
    const c = rows[0];
    const ok = c && c.estado !== 'baja' ? await verifyPassword(pw, c.pass_hash) : await verifyDummy(pw);
    if (!ok) { limLogin.fallo(quien); return fail(res, 401, 'Email o contraseña incorrectos.'); }
    // Bloqueado desde el admin: no entra (la contraseña ya se comprobó, así no se revela si la cuenta existe)
    if (c.estado === 'suspendida') return fail(res, 403, 'Tu cuenta está suspendida. Escribinos a contacto@sexyrose.net.', { suspendida: true });
    await pool.query('UPDATE clientes SET ultimo_login = now() WHERE id = $1', [c.id]);
    await authCli.crearSesion(res, c.id, req);
    res.json({ ok: true, cliente: await yoJson(await leer(c.id)) });
  }));

  r.post('/logout', ah(async (req, res) => { await authCli.cerrarSesion(req, res); res.json({ ok: true }); }));

  r.post('/verificar-email', ah(async (req, res) => {
    const t = String(body(req).token || '');
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(t)) return fail(res, 400, 'El link no es válido.');
    const { rows } = await pool.query(
      `UPDATE tokens_email_clientes SET usado = now() WHERE token_hash = $1 AND tipo = 'verificar' AND usado IS NULL AND expira > now() RETURNING cliente_id`, [sha256(t)]);
    if (!rows[0]) return fail(res, 400, 'El link venció o ya se usó. Pedí uno nuevo desde Tu espacio.');
    const id = rows[0].cliente_id;
    const { rows: cs } = await pool.query(
      "UPDATE clientes SET email_verificado = COALESCE(email_verificado, now()) WHERE id = $1 AND estado NOT IN ('baja', 'suspendida') RETURNING id", [id]);
    if (!cs[0]) return fail(res, 400, 'El link venció o ya se usó. Pedí uno nuevo desde Tu espacio.');
    // El link del email abre la sesión (el registro ya no la abre, para no revelar si el email existía).
    const actual = await authCli.clienteDeReq(req).catch(() => null);
    if (!actual || actual.id !== id) await authCli.crearSesion(res, id, req);
    res.json({ ok: true, cliente: await yoJson(await leer(id)) });
  }));

  r.post('/reenviar-verificacion', authCli.requireCliente, ah(async (req, res) => {
    const c = req.cliente;
    if (c.email_verificado) return res.json({ ok: true, yaVerificado: true });
    if (!limit(req, res, 'cli-reenv:' + c.id, 3, HOUR, 'Ya te mandamos varios emails. Probá de nuevo en una hora.')) return;
    rl.hit('cli-reenv:' + c.id);
    await enviarVerificacion(c.id, c.email, c.usuario);
    res.json({ ok: true });
  }));

  r.post('/olvide', ah(async (req, res) => {
    const email = normEmail(body(req).email);
    const ipKey = 'cli-olv:' + ipHash(req);
    if (!limit(req, res, ipKey, 10, HOUR, 'Demasiados pedidos. Probá de nuevo en una hora.')) return;
    rl.hit(ipKey);
    const respuesta = { ok: true, mensaje: 'Si hay una cuenta con ese email, te mandamos un link para cambiar la contraseña.' };
    if (!validEmail(email)) return res.json(respuesta);
    const emKey = 'cli-olvem:' + sha256(email).toString('hex');
    if (!rl.allowed(emKey, 3, HOUR)) return res.json(respuesta);
    rl.hit(emKey);
    const { rows } = await pool.query("SELECT id FROM clientes WHERE email = $1 AND estado <> 'baja'", [email]);
    if (rows[0]) {
      const token = await tokenEmail(rows[0].id, 'restablecer', 1);
      await sendMail({ to: email, ...plantillas.restablecerCliente({ url: urlSitio('/cliente/restablecer?token=' + token) }) }).catch((e) => log('mail olvide (cliente):', e.message));
    }
    res.json(respuesta);
  }));

  r.post('/restablecer', ah(async (req, res) => {
    const b = body(req);
    const t = String(b.token || '');
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(t)) return fail(res, 400, 'El link no es válido.');
    const ipKey = 'cli-rest:' + ipHash(req);
    if (!limit(req, res, ipKey, 20, HOUR, 'Demasiados intentos. Probá de nuevo en una hora.')) return;
    rl.hit(ipKey);
    const { rows: ts0 } = await pool.query(
      `SELECT c.email FROM tokens_email_clientes t JOIN clientes c ON c.id = t.cliente_id
        WHERE t.token_hash = $1 AND t.tipo = 'restablecer' AND t.usado IS NULL AND t.expira > now() AND c.estado <> 'baja'`, [sha256(t)]);
    if (!ts0[0]) return fail(res, 400, 'El link venció o ya se usó. Pedí uno nuevo.');
    const pwErr = errorPassword(b.password, ts0[0].email);
    if (pwErr) return fail(res, 400, pwErr);
    const hash = await hashPassword(b.password);
    // El token se consume en un solo paso: si dos pedidos llegan juntos, solo uno cambia la contraseña.
    const { rows: ts } = await pool.query(
      `UPDATE tokens_email_clientes t SET usado = now() FROM clientes c
        WHERE t.token_hash = $1 AND t.tipo = 'restablecer' AND t.usado IS NULL AND t.expira > now()
          AND c.id = t.cliente_id AND c.estado <> 'baja'
        RETURNING t.cliente_id, c.email`, [sha256(t)]);
    if (!ts[0]) return fail(res, 400, 'El link venció o ya se usó. Pedí uno nuevo.');
    await pool.query('UPDATE clientes SET pass_hash = $2, email_verificado = COALESCE(email_verificado, now()) WHERE id = $1', [ts[0].cliente_id, hash]);
    await authCli.cerrarOtrasSesiones(ts[0].cliente_id, null);
    await authCli.crearSesion(res, ts[0].cliente_id, req);
    res.json({ ok: true, cliente: await yoJson(await leer(ts[0].cliente_id)) });
  }));

  // --- Con sesión ------------------------------------------------------------------------------
  r.get('/yo', authCli.requireCliente, ah(async (req, res) => res.json({ ok: true, cliente: await yoJson(req.cliente) })));
  r.get('/compras', authCli.requireCliente, ah(async (req, res) => res.json({ ok: true, items: await contenido.comprasDeCliente(req.cliente.id) })));

  // --- Pedidos personalizados ------------------------------------------------------------------
  const conVerif = [authCli.requireCliente, authCli.requireVerificado];
  r.get('/pedidos', authCli.requireCliente, ah(async (req, res) => res.json(await solicitudes.listar('cliente', req.cliente.id))));
  r.post('/pedidos', conVerif, ah(async (req, res) => {
    const key = 'cli-ped:' + req.cliente.id;
    if (!limit(req, res, key, 10, 24 * HOUR, 'Hiciste muchos pedidos hoy. Probá mañana.')) return;
    const b = body(req);
    const out = await solicitudes.crear(req.cliente.id, { slug: b.slug, texto: b.texto });
    rl.hit(key);
    res.status(201).json({ ok: true, ...out });
  }));
  r.get('/pedidos/:id', authCli.requireCliente, ah(async (req, res) => res.json(await solicitudes.detalle('cliente', req.cliente.id, req.params.id, { since: req.query.since }))));
  r.post('/pedidos/:id/mensajes', conVerif, ah(async (req, res) => {
    const key = 'cli-msg:' + req.cliente.id;
    if (!limit(req, res, key, 30, 60 * 1000, 'Estás mandando mensajes muy rápido. Esperá un momento.')) return;
    rl.hit(key);
    res.status(201).json(await solicitudes.mensaje('cliente', req.cliente.id, req.params.id, body(req).texto));
  }));
  r.post('/pedidos/:id/cerrar', authCli.requireCliente, ah(async (req, res) => res.json(await solicitudes.cerrar('cliente', req.cliente.id, req.params.id))));
  r.post('/pedidos/:id/verificar-pagos', authCli.requireCliente, ah(async (req, res) => {
    const key = 'cli-verpago:' + req.cliente.id;
    if (!limit(req, res, key, 60, HOUR, 'Demasiados intentos. Probá más tarde.')) return;
    rl.hit(key);
    res.json(await solicitudes.verificarPagos(req.cliente.id, req.params.id, { paymentId: body(req).paymentId || null }));
  }));
  r.post('/pedidos/items/:item/pagar', conVerif, ah(async (req, res) => {
    const key = 'cli-pagar:' + req.cliente.id;
    if (!limit(req, res, key, 20, HOUR, 'Demasiados intentos. Probá más tarde.')) return;
    rl.hit(key);
    res.json({ ok: true, ...(await solicitudes.pagar(req.cliente.id, req.params.item)) });
  }));
  r.get('/pedidos/items/:item/archivo', authCli.requireCliente, ah(async (req, res) => {
    const rel = await solicitudes.archivo('cliente', req.cliente.id, req.params.item, { preview: req.query.preview === '1' });
    await storage.enviarPrivadoRango(req, res, rel);
  }));

  // eslint-disable-next-line no-unused-vars
  r.use((err, req, res, next) => {
    if (err instanceof SolicitudError || err instanceof ContenidoError) return fail(res, err.status, err.message, err.solicitudId ? { solicitudId: err.solicitudId } : {});
    if (err.code === 'SR_OCUPADO') { res.set('Retry-After', '5'); return fail(res, 503, err.message); }
    if (err.type === 'entity.parse.failed') return fail(res, 400, 'Formato de datos inválido.');
    if (err.type === 'entity.too.large') return fail(res, 413, 'Los datos enviados son demasiado grandes.');
    log('error: cliente:', err.code || '', err.message);
    return fail(res, 500, 'Ocurrió un error. Probá de nuevo en unos minutos.');
  });
  return r;
}
