// Cuenta de la acompañante: /api/cuenta/...
// Registro, login, email, contraseña, perfil, fotos, verificación de identidad e historias.
// Todas las mutaciones exigen mismo origen + cabecera X-SR: 1 (ver lib/auth.js).
import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import express from 'express';
import multer from 'multer';
import { hashPassword, sha256, tokenAleatorio, verifyDummy, verifyPassword } from '../lib/auth.js';
import { cargarCatalogos } from '../lib/catalogos.js';
import { ImagenInvalida, MAX_BYTES, procesarFoto, procesarPrivada } from '../lib/imagenes.js';
import { plantillas, sendMail, urlSitio } from '../lib/mail.js';
import { GENEROS, MIN_FOTOS, SLUGS_RESERVADOS, edadDe, faltantesDe, linea, slugify, validarDatos } from '../lib/perfiles.js';
import { limitesDe, planEfectivo, resumenPlan } from '../lib/planes-ref.js';
import * as storage from '../lib/storage.js';
import { MAX_BYTES_SUBIDA, contenedorPorFirma, inicioValido, leerFirma } from '../lib/videos.js';
import { invalidarSitio } from './sitio.js';

const HOUR = 60 * 60 * 1000;
const EMAIL_RE = /^[^\s@<>()[\]",;:\\]+@[^\s@<>()[\]",;:\\]+\.[^\s@<>()[\]",;:\\]{2,}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TZ = 'America/Argentina/Buenos_Aires';
// Video de 5 s en la tarjeta: desde Oro (C) en adelante.
export const PLANES_PREVIEW = new Set(['C', 'B', 'A', 'S']);

const normEmail = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : '');
const validEmail = (s) => s.length <= 254 && EMAIL_RE.test(s);

function errorPassword(pw, email) {
  if (typeof pw !== 'string' || [...pw].length < 10) return 'La contraseña tiene que tener al menos 10 caracteres.';
  if (pw.length > 200) return 'La contraseña es demasiado larga.';
  if (pw.toLowerCase() === String(email || '').toLowerCase()) return 'La contraseña no puede ser igual a tu email.';
  if (/^(.)\1+$/.test(pw)) return 'Elegí una contraseña menos predecible.';
  return null;
}

export function createCuentaRouter(ctx) {
  const { pool, rl, ipHash, auth, log, state } = ctx;
  const planes = () => ctx.planes;
  const r = express.Router();
  const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  const fail = (res, status, error, extra = {}) => res.status(status).json({ ok: false, error, ...extra });
  const limit = (req, res, key, max, windowMs, msg) => {
    if (!rl.allowed(key, max, windowMs)) {
      res.set('Retry-After', String(rl.retryAfterSec(key, windowMs)));
      fail(res, 429, msg);
      return false;
    }
    return true;
  };

  r.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (state && !state.dbReady) return fail(res, 503, 'El servicio no está disponible en este momento. Probá en unos minutos.');
    next();
  });
  r.use(auth.guardMutacion);
  r.use(express.json({ limit: '64kb', strict: true, type: 'application/json' }));
  const body = (req) => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {});

  // --- Subidas (multipart en memoria; sharp valida el contenido real) ---------
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_BYTES, files: 2, fields: 6, fieldSize: 2048, parts: 10, fieldNameSize: 50 },
  });
  const subir = (campos) => (req, res, next) => {
    if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('multipart/form-data')) {
      return fail(res, 415, 'Enviá el archivo como multipart/form-data.');
    }
    upload.fields(campos)(req, res, (err) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE') return fail(res, 413, 'La imagen pesa más de 12 MB.');
      if (err instanceof multer.MulterError) return fail(res, 400, 'No pudimos leer el archivo enviado.');
      next(err);
    });
  };
  const archivo = (req, campo) => (req.files && req.files[campo] && req.files[campo][0]) || null;

  // --- Armado de "Yo" ---------------------------------------------------------
  const tokenEmail = async (cuentaId, tipo, horas) => {
    const token = tokenAleatorio(32);
    await pool.query('UPDATE tokens_email SET usado = now() WHERE cuenta_id = $1 AND tipo = $2 AND usado IS NULL', [cuentaId, tipo]);
    await pool.query(
      `INSERT INTO tokens_email (token_hash, cuenta_id, tipo, expira) VALUES ($1, $2, $3, now() + make_interval(hours => $4))`,
      [sha256(token), cuentaId, tipo, horas],
    );
    return token;
  };
  const enviarVerificacion = async (cuentaId, email, nombre) => {
    const token = await tokenEmail(cuentaId, 'verificar', 48);
    const m = plantillas.verificar({ nombre, url: urlSitio('/cuenta/verificar?token=' + token) });
    await sendMail({ to: email, ...m });
  };

  const historiasHoy = async (cuentaId) => {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM historias
        WHERE cuenta_id = $1 AND creado >= (date_trunc('day', now() AT TIME ZONE '${TZ}') AT TIME ZONE '${TZ}')`,
      [cuentaId],
    );
    return rows[0].n;
  };

  const videoJson = (v) => ({
    id: v.id, orden: v.orden, estado: v.estado, url: v.url || null, poster: v.url_poster || null,
    segundos: v.segundos == null ? null : Number(v.segundos), ancho: v.ancho, alto: v.alto, error: v.error || null, creado: v.creado,
  });

  const construirYo = async (cuentaId) => {
    const [{ rows: cs }, { rows: ps }, { rows: fs }, { rows: hs }, { rows: vs }] = await Promise.all([
      pool.query('SELECT id, email, email_verificado, estado, creado FROM cuentas WHERE id = $1', [cuentaId]),
      pool.query('SELECT slug, datos, estado, motivo_rechazo, verificacion, oculto, publicado_en FROM perfiles WHERE cuenta_id = $1', [cuentaId]),
      pool.query('SELECT id, url, url_mini, orden, ancho, alto FROM fotos WHERE cuenta_id = $1 ORDER BY orden, creado', [cuentaId]),
      pool.query('SELECT id, url, url_mini, texto, creado, expira FROM historias WHERE cuenta_id = $1 AND expira > now() ORDER BY creado DESC', [cuentaId]),
      pool.query('SELECT estado, motivo, creado, revisado FROM verificaciones WHERE cuenta_id = $1 ORDER BY creado DESC LIMIT 1', [cuentaId]),
    ]);
    const { rows: vids } = await pool.query(
      'SELECT id, orden, estado, url, url_poster, segundos, ancho, alto, error, creado FROM videos WHERE cuenta_id = $1 ORDER BY orden, creado', [cuentaId]);
    const { rows: prv } = await pool.query('SELECT video_id, inicio, elegido, estado, url, error FROM previews WHERE cuenta_id = $1', [cuentaId]);
    const c = cs[0];
    if (!c) return null;
    const p = ps[0] || { slug: null, datos: {}, estado: 'borrador', verificacion: 'sin_enviar', oculto: false };
    const plan = await resumenPlan(cuentaId, planes());
    const efectivo = plan && plan.efectivo ? plan.efectivo : 'E';
    const lim = limitesDe(efectivo);
    const faltantes = faltantesDe({ datos: p.datos, fotosN: fs.length, emailVerificado: Boolean(c.email_verificado), verificacion: p.verificacion });
    const datos = { ...p.datos };
    return {
      id: c.id,
      email: c.email,
      emailVerificado: Boolean(c.email_verificado),
      estado: c.estado,
      creado: c.creado,
      perfil: {
        slug: p.slug,
        estado: p.estado,
        motivoRechazo: p.motivo_rechazo || null,
        verificacion: p.verificacion,
        ultimaVerificacion: vs[0] ? { estado: vs[0].estado, motivo: vs[0].motivo || null, creado: vs[0].creado, revisado: vs[0].revisado } : null,
        oculto: p.oculto,
        publicadoEn: p.publicado_en || null,
        edad: edadDe(datos.fechaNacimiento),
        datos,
        fotos: fs.map((f) => ({ id: f.id, url: f.url, urlMini: f.url_mini || f.url, orden: f.orden, ancho: f.ancho, alto: f.alto })),
        videos: vids.map(videoJson),
        preview: prv[0] ? { videoId: prv[0].video_id, inicio: Number(prv[0].inicio), elegido: prv[0].elegido, estado: prv[0].estado, url: prv[0].url || null, error: prv[0].error || null } : null,
        completo: faltantes.length === 0,
        faltantes,
      },
      plan: plan || { efectivo: 'E', suscripciones: [], pedidos: [] },
      limites: { fotos: lim.fotos, videos: lim.videos, historiasDia: lim.historiasDia, minFotos: MIN_FOTOS, historiasHoy: await historiasHoy(cuentaId) },
      videosHabilitados: storage.videosHabilitados(),
      previewHabilitado: storage.videosHabilitados() && PLANES_PREVIEW.has(efectivo),
      historias: hs.map((h) => ({ id: h.id, url: h.url, urlMini: h.url_mini || h.url, texto: h.texto, creado: h.creado, expira: h.expira })),
    };
  };
  ctx.construirYo = construirYo;

  const slugLibre = async (base, client = pool) => {
    let b = slugify(base) || 'perfil';
    if (b.length < 2 || SLUGS_RESERVADOS.has(b)) b = (b + '-sr').replace(/^-/, '');
    for (let i = 1; i < 500; i++) {
      const s = i === 1 ? b : `${b}-${i}`;
      const { rowCount } = await client.query('SELECT 1 FROM perfiles WHERE slug = $1', [s]);
      if (!rowCount) return s;
    }
    return `${b}-${crypto.randomBytes(3).toString('hex')}`;
  };

  // --- Registro / login ---------------------------------------------------------
  r.post('/registro', ah(async (req, res) => {
    const ipKey = 'reg:' + ipHash(req);
    if (!limit(req, res, ipKey, 5, HOUR, 'Se crearon demasiadas cuentas desde tu conexión. Probá de nuevo en una hora.')) return;
    const b = body(req);
    const email = normEmail(b.email);
    if (!validEmail(email)) return fail(res, 400, 'El email no es válido.');
    const pwErr = errorPassword(b.password, email);
    if (pwErr) return fail(res, 400, pwErr);
    if (b.aceptaTerminos !== true) return fail(res, 400, 'Tenés que aceptar los Términos y la Política de privacidad.');
    if (b.mayorEdad !== true) return fail(res, 400, 'Tenés que confirmar que sos mayor de 18 años.');
    const cat = await cargarCatalogos(pool);
    const v = validarDatos({ displayName: b.displayName, fechaNacimiento: b.fechaNacimiento, genero: b.genero }, {}, cat);
    if (v.error) return fail(res, 400, v.error);
    if (!v.datos.displayName || !v.datos.fechaNacimiento || !GENEROS.includes(v.datos.genero)) {
      return fail(res, 400, 'Completá tu nombre artístico, tu fecha de nacimiento y tu género.');
    }
    const hash = await hashPassword(b.password);
    const client = await pool.connect();
    let cuentaId;
    try {
      await client.query('BEGIN');
      const ex = await client.query('SELECT 1 FROM cuentas WHERE email = $1', [email]);
      if (ex.rowCount) { await client.query('ROLLBACK'); rl.hit(ipKey); return fail(res, 409, 'Ya existe una cuenta con ese email. Iniciá sesión o recuperá tu contraseña.'); }
      const { rows } = await client.query(
        `INSERT INTO cuentas (email, pass_hash, acepto_terminos, mayor_edad_declarada) VALUES ($1, $2, now(), true) RETURNING id`,
        [email, hash],
      );
      cuentaId = rows[0].id;
      const slug = await slugLibre(v.datos.displayName, client);
      await client.query('INSERT INTO perfiles (cuenta_id, slug, datos) VALUES ($1, $2, $3)', [cuentaId, slug, { ...v.datos, pais: 'argentina' }]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      if (e.code === '23505') return fail(res, 409, 'Ya existe una cuenta con ese email. Iniciá sesión o recuperá tu contraseña.');
      throw e;
    } finally {
      client.release();
    }
    rl.hit(ipKey);
    await auth.crearSesion(res, cuentaId, req);
    await enviarVerificacion(cuentaId, email, v.datos.displayName).catch((e) => log('mail verificación:', e.message));
    if (ctx.notify) ctx.notify('Nueva cuenta de acompañante registrada.');
    res.status(201).json({ ok: true, cuenta: await construirYo(cuentaId) });
  }));

  r.post('/login', ah(async (req, res) => {
    const b = body(req);
    const email = normEmail(b.email);
    const ipKey = 'login:' + ipHash(req);
    const emKey = 'loginem:' + sha256(email).toString('hex');
    if (!limit(req, res, ipKey, 20, 15 * 60 * 1000, 'Demasiados intentos. Probá de nuevo en 15 minutos.')) return;
    if (!limit(req, res, emKey, 10, 15 * 60 * 1000, 'Demasiados intentos para esta cuenta. Probá de nuevo en 15 minutos.')) return;
    const pw = typeof b.password === 'string' ? b.password : '';
    const { rows } = validEmail(email) ? await pool.query('SELECT id, pass_hash, estado FROM cuentas WHERE email = $1', [email]) : { rows: [] };
    const c = rows[0];
    const ok = c && c.estado !== 'baja' ? await verifyPassword(pw, c.pass_hash) : await verifyDummy(pw);
    if (!ok) { rl.hit(ipKey); rl.hit(emKey); return fail(res, 401, 'Email o contraseña incorrectos.'); }
    await pool.query('UPDATE cuentas SET ultimo_login = now() WHERE id = $1', [c.id]);
    await auth.crearSesion(res, c.id, req);
    res.json({ ok: true, cuenta: await construirYo(c.id) });
  }));

  r.post('/logout', ah(async (req, res) => {
    await auth.cerrarSesion(req, res);
    res.json({ ok: true });
  }));

  // --- Email ---------------------------------------------------------------------
  r.post('/verificar-email', ah(async (req, res) => {
    const t = String(body(req).token || '');
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(t)) return fail(res, 400, 'El link no es válido.');
    const { rows } = await pool.query(
      `UPDATE tokens_email SET usado = now() WHERE token_hash = $1 AND tipo = 'verificar' AND usado IS NULL AND expira > now() RETURNING cuenta_id`,
      [sha256(t)],
    );
    if (!rows[0]) return fail(res, 400, 'El link venció o ya se usó. Pedí uno nuevo desde tu panel.');
    await pool.query('UPDATE cuentas SET email_verificado = COALESCE(email_verificado, now()) WHERE id = $1', [rows[0].cuenta_id]);
    res.json({ ok: true });
  }));

  r.post('/reenviar-verificacion', auth.requireCuenta, ah(async (req, res) => {
    const c = req.cuenta;
    if (c.email_verificado) return res.json({ ok: true, yaVerificado: true });
    if (!limit(req, res, 'reenv:' + c.id, 3, HOUR, 'Ya te mandamos varios emails. Probá de nuevo en una hora.')) return;
    rl.hit('reenv:' + c.id);
    const { rows } = await pool.query('SELECT datos FROM perfiles WHERE cuenta_id = $1', [c.id]);
    await enviarVerificacion(c.id, c.email, rows[0]?.datos?.displayName);
    res.json({ ok: true });
  }));

  r.post('/olvide', ah(async (req, res) => {
    const email = normEmail(body(req).email);
    const ipKey = 'olv:' + ipHash(req);
    if (!limit(req, res, ipKey, 10, HOUR, 'Demasiados pedidos. Probá de nuevo en una hora.')) return;
    rl.hit(ipKey);
    const respuesta = { ok: true, mensaje: 'Si hay una cuenta con ese email, te mandamos un link para cambiar la contraseña.' };
    if (!validEmail(email)) return res.json(respuesta);
    const emKey = 'olvem:' + sha256(email).toString('hex');
    if (!rl.allowed(emKey, 3, HOUR)) return res.json(respuesta);
    rl.hit(emKey);
    const { rows } = await pool.query("SELECT id FROM cuentas WHERE email = $1 AND estado <> 'baja'", [email]);
    if (rows[0]) {
      const token = await tokenEmail(rows[0].id, 'restablecer', 1);
      await sendMail({ to: email, ...plantillas.restablecer({ url: urlSitio('/cuenta/restablecer?token=' + token) }) }).catch((e) => log('mail olvide:', e.message));
    }
    res.json(respuesta);
  }));

  r.post('/restablecer', ah(async (req, res) => {
    const b = body(req);
    const t = String(b.token || '');
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(t)) return fail(res, 400, 'El link no es válido.');
    const { rows: ts } = await pool.query(
      `SELECT t.cuenta_id, c.email FROM tokens_email t JOIN cuentas c ON c.id = t.cuenta_id
        WHERE t.token_hash = $1 AND t.tipo = 'restablecer' AND t.usado IS NULL AND t.expira > now() AND c.estado <> 'baja'`,
      [sha256(t)],
    );
    if (!ts[0]) return fail(res, 400, 'El link venció o ya se usó. Pedí uno nuevo.');
    const pwErr = errorPassword(b.password, ts[0].email);
    if (pwErr) return fail(res, 400, pwErr);
    const hash = await hashPassword(b.password);
    await pool.query("UPDATE tokens_email SET usado = now() WHERE token_hash = $1", [sha256(t)]);
    // Si pudo abrir el email, el email es suyo.
    await pool.query('UPDATE cuentas SET pass_hash = $2, email_verificado = COALESCE(email_verificado, now()) WHERE id = $1', [ts[0].cuenta_id, hash]);
    await auth.cerrarOtrasSesiones(ts[0].cuenta_id, null);
    await auth.crearSesion(res, ts[0].cuenta_id, req);
    res.json({ ok: true, cuenta: await construirYo(ts[0].cuenta_id) });
  }));

  // --- Con sesión ------------------------------------------------------------------
  r.get('/yo', auth.requireCuenta, ah(async (req, res) => {
    res.json({ ok: true, cuenta: await construirYo(req.cuenta.id) });
  }));

  r.post('/cambiar-password', auth.requireCuenta, ah(async (req, res) => {
    const b = body(req);
    const key = 'cpw:' + req.cuenta.id;
    if (!limit(req, res, key, 10, HOUR, 'Demasiados intentos. Probá más tarde.')) return;
    const { rows } = await pool.query('SELECT pass_hash, email FROM cuentas WHERE id = $1', [req.cuenta.id]);
    if (!(await verifyPassword(String(b.actual || ''), rows[0].pass_hash))) { rl.hit(key); return fail(res, 400, 'La contraseña actual no es correcta.'); }
    const pwErr = errorPassword(b.nueva, rows[0].email);
    if (pwErr) return fail(res, 400, pwErr);
    await pool.query('UPDATE cuentas SET pass_hash = $2 WHERE id = $1', [req.cuenta.id, await hashPassword(b.nueva)]);
    await auth.cerrarOtrasSesiones(req.cuenta.id, req);
    res.json({ ok: true });
  }));

  const conCuentaActiva = [auth.requireCuenta, auth.requireActiva];

  r.put('/perfil', conCuentaActiva, ah(async (req, res) => {
    const cat = await cargarCatalogos(pool);
    const { rows } = await pool.query('SELECT datos, verificacion, estado FROM perfiles WHERE cuenta_id = $1', [req.cuenta.id]);
    if (!rows[0]) return fail(res, 404, 'No encontramos tu perfil.');
    const v = validarDatos(body(req), rows[0].datos, cat, { fechaNacimiento: rows[0].verificacion === 'verificada' });
    if (v.error) return fail(res, 400, v.error);
    await pool.query('UPDATE perfiles SET datos = $2, actualizado = now() WHERE cuenta_id = $1', [req.cuenta.id, v.datos]);
    if (rows[0].estado === 'publicado') invalidarSitio();
    res.json({ ok: true, cuenta: await construirYo(req.cuenta.id) });
  }));

  r.post('/perfil/enviar-revision', conCuentaActiva, ah(async (req, res) => {
    const yo = await construirYo(req.cuenta.id);
    const p = yo.perfil;
    if (p.estado === 'suspendido') return fail(res, 403, 'Tu perfil está suspendido. Escribinos a contacto@sexyrose.net.');
    if (p.estado === 'publicado' || p.estado === 'en_revision') return res.json({ ok: true, cuenta: yo });
    if (!p.completo) return fail(res, 400, 'Todavía falta completar algunas cosas.', { faltantes: p.faltantes });
    await pool.query("UPDATE perfiles SET estado = 'en_revision', motivo_rechazo = NULL, actualizado = now() WHERE cuenta_id = $1", [req.cuenta.id]);
    if (ctx.notify) ctx.notify('Hay un perfil nuevo para revisar en el admin.');
    res.json({ ok: true, cuenta: await construirYo(req.cuenta.id) });
  }));

  r.post('/perfil/ocultar', conCuentaActiva, ah(async (req, res) => {
    const oculto = body(req).oculto;
    if (typeof oculto !== 'boolean') return fail(res, 400, 'Indicá si querés ocultar o mostrar tu perfil.');
    await pool.query('UPDATE perfiles SET oculto = $2, actualizado = now() WHERE cuenta_id = $1', [req.cuenta.id, oculto]);
    invalidarSitio();
    res.json({ ok: true, cuenta: await construirYo(req.cuenta.id) });
  }));

  // --- Fotos -----------------------------------------------------------------------
  const limiteSubidas = (req, res) => limit(req, res, 'up:' + req.cuenta.id, 60, HOUR, 'Subiste demasiados archivos en la última hora. Probá más tarde.');

  r.post('/fotos', conCuentaActiva, (req, res, next) => (limiteSubidas(req, res) ? next() : null), subir([{ name: 'foto', maxCount: 1 }]), ah(async (req, res) => {
    rl.hit('up:' + req.cuenta.id);
    const f = archivo(req, 'foto');
    if (!f) return fail(res, 400, 'Elegí una foto.');
    const plan = await planEfectivo(req.cuenta.id, planes());
    const max = limitesDe(plan).fotos;
    const { rows: cnt } = await pool.query('SELECT count(*)::int AS n, COALESCE(max(orden), -1) AS maxorden FROM fotos WHERE cuenta_id = $1', [req.cuenta.id]);
    if (cnt[0].n >= max) return fail(res, 400, `Tu plan permite hasta ${max} fotos. Borrá alguna o subí de plan.`);
    let img;
    try { img = await procesarFoto(f.buffer); } catch (e) { if (e instanceof ImagenInvalida) return fail(res, 400, e.message); throw e; }
    const id = crypto.randomUUID();
    const clave = `f/${id}.webp`; const claveMini = `f/${id}-m.webp`;
    const url = await storage.put(clave, img.grande.buffer, img.grande.tipo);
    const urlMini = await storage.put(claveMini, img.mini.buffer, img.mini.tipo);
    const { rows } = await pool.query(
      `INSERT INTO fotos (id, cuenta_id, orden, clave, clave_mini, url, url_mini, ancho, alto) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, url, url_mini, orden, ancho, alto`,
      [id, req.cuenta.id, cnt[0].maxorden + 1, clave, claveMini, url, urlMini, img.grande.ancho, img.grande.alto],
    );
    await pool.query('UPDATE perfiles SET actualizado = now() WHERE cuenta_id = $1', [req.cuenta.id]);
    invalidarSitio();
    const x = rows[0];
    res.status(201).json({ ok: true, foto: { id: x.id, url: x.url, urlMini: x.url_mini, orden: x.orden, ancho: x.ancho, alto: x.alto } });
  }));

  r.delete('/fotos/:id', conCuentaActiva, ah(async (req, res) => {
    if (!UUID_RE.test(req.params.id)) return fail(res, 404, 'Foto no encontrada.');
    const { rows } = await pool.query('DELETE FROM fotos WHERE id = $1 AND cuenta_id = $2 RETURNING clave, clave_mini', [req.params.id, req.cuenta.id]);
    if (!rows[0]) return fail(res, 404, 'Foto no encontrada.');
    await storage.del(rows[0].clave); await storage.del(rows[0].clave_mini);
    invalidarSitio();
    res.json({ ok: true });
  }));

  r.put('/fotos/orden', conCuentaActiva, ah(async (req, res) => {
    const ids = body(req).ids;
    if (!Array.isArray(ids) || ids.length > 1000 || ids.some((x) => typeof x !== 'string' || !UUID_RE.test(x))) return fail(res, 400, 'Orden inválido.');
    const { rows } = await pool.query('SELECT id FROM fotos WHERE cuenta_id = $1', [req.cuenta.id]);
    const mias = new Set(rows.map((x) => x.id));
    if (ids.length !== mias.size || new Set(ids).size !== ids.length || ids.some((x) => !mias.has(x))) return fail(res, 400, 'La lista tiene que incluir todas tus fotos, una vez cada una.');
    await pool.query('UPDATE fotos f SET orden = o.ord - 1 FROM unnest($2::uuid[]) WITH ORDINALITY AS o(id, ord) WHERE f.id = o.id AND f.cuenta_id = $1', [req.cuenta.id, ids]);
    invalidarSitio();
    res.json({ ok: true, cuenta: await construirYo(req.cuenta.id) });
  }));

  // --- Verificación de identidad (privada) --------------------------------------------
  r.post('/verificacion', conCuentaActiva, (req, res, next) => (limit(req, res, 'verif:' + req.cuenta.id, 5, 24 * HOUR, 'Ya enviaste varias verificaciones hoy. Probá mañana.') ? next() : null),
    subir([{ name: 'selfie', maxCount: 1 }, { name: 'documento', maxCount: 1 }]), ah(async (req, res) => {
      rl.hit('verif:' + req.cuenta.id);
      const { rows: ps } = await pool.query('SELECT verificacion FROM perfiles WHERE cuenta_id = $1', [req.cuenta.id]);
      if (ps[0]?.verificacion === 'verificada') return fail(res, 409, 'Tu identidad ya está verificada.');
      const s = archivo(req, 'selfie'); const d = archivo(req, 'documento');
      if (!s || !d) return fail(res, 400, 'Subí la selfie y la foto de tu documento.');
      let si; let di;
      try { si = await procesarPrivada(s.buffer); di = await procesarPrivada(d.buffer); } catch (e) { if (e instanceof ImagenInvalida) return fail(res, 400, e.message); throw e; }
      const selfie = await storage.guardarPrivado('verif', si.buffer, si.ext, 'selfie');
      const documento = await storage.guardarPrivado('verif', di.buffer, di.ext, 'doc');
      // Las verificaciones pendientes anteriores quedan reemplazadas.
      const viejas = await pool.query("DELETE FROM verificaciones WHERE cuenta_id = $1 AND estado = 'pendiente' RETURNING selfie_ruta, documento_ruta", [req.cuenta.id]);
      for (const v of viejas.rows) { await storage.borrarPrivado(v.selfie_ruta); await storage.borrarPrivado(v.documento_ruta); }
      await pool.query('INSERT INTO verificaciones (cuenta_id, selfie_ruta, documento_ruta) VALUES ($1, $2, $3)', [req.cuenta.id, selfie, documento]);
      await pool.query("UPDATE perfiles SET verificacion = 'pendiente', actualizado = now() WHERE cuenta_id = $1", [req.cuenta.id]);
      if (ctx.notify) ctx.notify('Hay una verificación de identidad nueva para revisar en el admin.');
      res.status(201).json({ ok: true, cuenta: await construirYo(req.cuenta.id) });
    }));

  // --- Historias (24 h) -----------------------------------------------------------------
  r.post('/historias', conCuentaActiva, (req, res, next) => (limiteSubidas(req, res) ? next() : null), subir([{ name: 'foto', maxCount: 1 }]), ah(async (req, res) => {
    rl.hit('up:' + req.cuenta.id);
    const f = archivo(req, 'foto');
    if (!f) return fail(res, 400, 'Elegí una foto para la historia.');
    const txt = linea(req.body && req.body.texto);
    if ([...txt].length > 120) return fail(res, 400, 'El texto de la historia puede tener hasta 120 caracteres.');
    const plan = await planEfectivo(req.cuenta.id, planes());
    const max = limitesDe(plan).historiasDia;
    if (max !== null && (await historiasHoy(req.cuenta.id)) >= max) {
      return fail(res, 400, `Tu plan permite ${max} ${max === 1 ? 'historia' : 'historias'} por día. Subí de plan para publicar más.`);
    }
    let img;
    try { img = await procesarFoto(f.buffer); } catch (e) { if (e instanceof ImagenInvalida) return fail(res, 400, e.message); throw e; }
    const id = crypto.randomUUID();
    const clave = `h/${id}.webp`; const claveMini = `h/${id}-m.webp`;
    const url = await storage.put(clave, img.grande.buffer, img.grande.tipo);
    const urlMini = await storage.put(claveMini, img.mini.buffer, img.mini.tipo);
    const { rows } = await pool.query(
      `INSERT INTO historias (id, cuenta_id, clave, clave_mini, url, url_mini, texto) VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, url, url_mini, texto, creado, expira`,
      [id, req.cuenta.id, clave, claveMini, url, urlMini, txt],
    );
    invalidarSitio();
    const h = rows[0];
    res.status(201).json({ ok: true, historia: { id: h.id, url: h.url, urlMini: h.url_mini, texto: h.texto, creado: h.creado, expira: h.expira } });
  }));

  r.delete('/historias/:id', conCuentaActiva, ah(async (req, res) => {
    if (!UUID_RE.test(req.params.id)) return fail(res, 404, 'Historia no encontrada.');
    const { rows } = await pool.query('DELETE FROM historias WHERE id = $1 AND cuenta_id = $2 RETURNING clave, clave_mini', [req.params.id, req.cuenta.id]);
    if (!rows[0]) return fail(res, 404, 'Historia no encontrada.');
    await storage.del(rows[0].clave); await storage.del(rows[0].clave_mini);
    invalidarSitio();
    res.json({ ok: true });
  }));

  // --- Videos de la galería (hasta 30 s; solo con almacenamiento externo) -------
  // Se suben a un archivo temporal (DATA_DIR/tmp/videos), se responde 202 y lib/videos.js los procesa en cola.
  const videos = () => ctx.videos;
  const subidaVideo = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, videos().tmpDir),
      filename: (req, file, cb) => { req.videoId = crypto.randomUUID(); cb(null, `${req.videoId}.subida`); },
    }),
    limits: { fileSize: MAX_BYTES_SUBIDA, files: 1, fields: 2, fieldSize: 256, parts: 4, fieldNameSize: 30 },
  });
  const borrarTemp = (req) => (req.file && req.file.path ? fsp.rm(req.file.path, { force: true }).catch(() => {}) : Promise.resolve());

  const videosActivos = (req, res, next) => {
    if (!storage.videosHabilitados() || !videos()) return fail(res, 409, 'Los videos se activan cuando el almacenamiento externo está configurado.');
    next();
  };
  const cupoVideos = ah(async (req, res, next) => {
    const plan = await planEfectivo(req.cuenta.id, planes());
    const max = limitesDe(plan).videos;
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM videos WHERE cuenta_id = $1 AND estado IN ('procesando', 'listo')", [req.cuenta.id]);
    if (rows[0].n >= max) return fail(res, 400, `Tu plan permite hasta ${max} ${max === 1 ? 'video' : 'videos'}. Borrá alguno o subí de plan.`);
    req.maxVideos = max;
    next();
  });

  r.post('/videos', conCuentaActiva, videosActivos,
    (req, res, next) => (limit(req, res, 'vid:' + req.cuenta.id, 20, HOUR, 'Subiste demasiados videos en la última hora. Probá más tarde.') ? next() : null),
    cupoVideos,
    (req, res, next) => {
      if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('multipart/form-data')) return fail(res, 415, 'Enviá el video como multipart/form-data.');
      subidaVideo.single('video')(req, res, (err) => {
        if (!err) return next();
        borrarTemp(req);
        if (err.code === 'LIMIT_FILE_SIZE') return fail(res, 413, 'El video pesa más de 95 MB. Recortalo o grabalo en menor calidad.');
        if (err instanceof multer.MulterError) return fail(res, 400, 'No pudimos leer el archivo enviado.');
        next(err);
      });
    },
    ah(async (req, res) => {
      rl.hit('vid:' + req.cuenta.id);
      const f = req.file;
      if (!f) return fail(res, 400, 'Elegí un video.');
      const tipo = contenedorPorFirma(await leerFirma(f.path).catch(() => null));
      if (!tipo) { await borrarTemp(req); return fail(res, 400, 'El archivo no es un video MP4, MOV o WebM.'); }
      // Cupo de nuevo: dos subidas simultáneas no pueden pasar el límite.
      const { rows } = await pool.query(
        `INSERT INTO videos (id, cuenta_id, orden)
         SELECT $1, $2, COALESCE((SELECT max(orden) + 1 FROM videos WHERE cuenta_id = $2), 0)
          WHERE (SELECT count(*) FROM videos WHERE cuenta_id = $2 AND estado IN ('procesando', 'listo')) < $3
         RETURNING id, orden, estado, url, url_poster, segundos, ancho, alto, error, creado`,
        [req.videoId, req.cuenta.id, req.maxVideos],
      );
      if (!rows[0]) { await borrarTemp(req); return fail(res, 400, `Tu plan permite hasta ${req.maxVideos} videos. Borrá alguno o subí de plan.`); }
      videos().encolar(rows[0].id);
      res.status(202).json({ ok: true, video: videoJson(rows[0]) });
    }));

  r.delete('/videos/:id', conCuentaActiva, ah(async (req, res) => {
    if (!UUID_RE.test(req.params.id)) return fail(res, 404, 'Video no encontrado.');
    const { rows } = await pool.query('DELETE FROM videos WHERE id = $1 AND cuenta_id = $2 RETURNING clave_mp4, clave_poster', [req.params.id, req.cuenta.id]);
    if (!rows[0]) return fail(res, 404, 'Video no encontrado.');
    await storage.del(rows[0].clave_mp4); await storage.del(rows[0].clave_poster);
    if (videos()) {
      await fsp.rm(videos().rutaTemporal(req.params.id), { force: true }).catch(() => {});
      await videos().alBorrarVideo(req.cuenta.id, req.params.id).catch((e) => log('preview: al borrar video', e.message));
    }
    invalidarSitio();
    res.json({ ok: true });
  }));

  // --- Video de la tarjeta (5 s, sin audio; planes Oro en adelante) -----------
  // PUT {videoId, inicio}: ella elige el video y el segundo desde donde arranca. DELETE: vuelve al automático.
  const conPreview = ah(async (req, res, next) => {
    const plan = await planEfectivo(req.cuenta.id, planes());
    if (!PLANES_PREVIEW.has(plan)) return fail(res, 403, 'Disponible desde Oro.');
    next();
  });
  r.put('/preview', conCuentaActiva, videosActivos, conPreview,
    (req, res, next) => (limit(req, res, 'prev:' + req.cuenta.id, 30, HOUR, 'Cambiaste el clip demasiadas veces. Probá más tarde.') ? next() : null),
    ah(async (req, res) => {
      const b = body(req);
      if (typeof b.videoId !== 'string' || !UUID_RE.test(b.videoId)) return fail(res, 400, 'Elegí uno de tus videos.');
      const { rows } = await pool.query("SELECT id, segundos FROM videos WHERE id = $1 AND cuenta_id = $2 AND estado = 'listo'", [b.videoId, req.cuenta.id]);
      if (!rows[0]) return fail(res, 404, 'Elegí uno de tus videos ya procesados.');
      if (typeof b.inicio !== 'number' && typeof b.inicio !== 'string') return fail(res, 400, 'Indicá desde qué segundo arranca.');
      const iv = inicioValido(b.inicio, Number(rows[0].segundos));
      if (!iv.ok) return fail(res, 400, `El clip tiene que arrancar entre 0 y ${String(iv.max).replace('.', ',')} s.`);
      await videos().pedirPreview(req.cuenta.id, { videoId: rows[0].id, inicio: iv.valor, elegido: true });
      res.json({ ok: true, cuenta: await construirYo(req.cuenta.id) });
    }));
  r.delete('/preview', conCuentaActiva, videosActivos, ah(async (req, res) => {
    await videos().previewAutomatico(req.cuenta.id);
    res.json({ ok: true, cuenta: await construirYo(req.cuenta.id) });
  }));

  r.put('/videos/orden', conCuentaActiva, ah(async (req, res) => {
    const ids = body(req).ids;
    if (!Array.isArray(ids) || ids.length > 1000 || ids.some((x) => typeof x !== 'string' || !UUID_RE.test(x))) return fail(res, 400, 'Orden inválido.');
    const { rows } = await pool.query('SELECT id FROM videos WHERE cuenta_id = $1', [req.cuenta.id]);
    const mios = new Set(rows.map((x) => x.id));
    if (ids.length !== mios.size || new Set(ids).size !== ids.length || ids.some((x) => !mios.has(x))) return fail(res, 400, 'La lista tiene que incluir todos tus videos, una vez cada uno.');
    await pool.query('UPDATE videos v SET orden = o.ord - 1 FROM unnest($2::uuid[]) WITH ORDINALITY AS o(id, ord) WHERE v.id = o.id AND v.cuenta_id = $1', [req.cuenta.id, ids]);
    invalidarSitio();
    res.json({ ok: true, cuenta: await construirYo(req.cuenta.id) });
  }));

  return r;
}
