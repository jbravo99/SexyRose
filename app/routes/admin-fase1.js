// API del admin para Fase 1+2 (agente B). Se monta dentro del router admin existente, bajo `${A}/api`:
//   const fase1Admin = createAdminFase1Router({ pool, planes, privado, apiPost, adminUser, log });
//   admin.use('/api', fase1Admin.router);           // ANTES del 404 de admin '/api'
//   ...y en GET /api/resumen: Object.assign(respuesta, await fase1Admin.contadores())
// Mismo Basic Auth (lo aplica el router admin). Los POST/PUT/DELETE usan apiPost de Fase 0
// (JSON + X-SR-Admin: 1 + mismo origen). Errores: { error } en castellano.
import express from 'express';
import { PLAN_NOMBRE, PLANES_PAGOS, CUPO_STAR, PlanError, validarPrecios, mezclarPrecios, pedidoJson, suscripcionJson } from '../lib/planes.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID_RE = /^[a-z0-9][a-z0-9-]{0,59}$/;
const ESTADOS_PERFIL = ['borrador', 'en_revision', 'publicado', 'rechazado', 'pausado', 'suspendido'];
const ESTADOS_ADMIN = ['publicado', 'pausado', 'suspendido', 'rechazado'];
const ESTADOS_PEDIDO = ['pendiente', 'informado', 'confirmado', 'rechazado', 'cancelado', 'vencido'];
const TIPOS_UBIC = ['pais', 'provincia', 'ciudad', 'zona'];
const AJUSTES = ['precios', 'transferencia', 'portada', 'promo'];

export function slugify(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const ent = (v, def = 0) => { const n = Number(v); return Number.isInteger(n) && Math.abs(n) < 1e6 ? n : def; };
const bool = (v, def) => (typeof v === 'boolean' ? v : def);

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; this.expose = true; } }
const he = (s, m) => new HttpError(s, m);

export function createAdminFase1Router({ pool, planes, privado, apiPost, adminUser = 'admin', log = () => {} }) {
  const r = express.Router();
  r.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  const invalidar = () => planes.invalidar();
  const uuid = (req) => { if (!UUID_RE.test(req.params.id)) throw he(404, 'No encontrado.'); return req.params.id; };
  const body = (req) => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {});

  // ---------- Acompañantes ----------
  r.get('/acompanantes', ah(async (req, res) => {
    const estado = typeof req.query.estado === 'string' ? req.query.estado : '';
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : '';
    const conds = []; const args = [];
    if (estado === 'verificacion_pendiente') conds.push("p.verificacion = 'pendiente'");
    else if (ESTADOS_PERFIL.includes(estado)) { args.push(estado); conds.push(`p.estado = $${args.length}`); }
    if (q) {
      args.push('%' + q.replace(/[\\%_]/g, (c) => '\\' + c) + '%');
      const i = args.length;
      conds.push(`(c.email ILIKE $${i} OR p.slug ILIKE $${i} OR p.datos->>'displayName' ILIKE $${i} OR p.datos->>'ciudad' ILIKE $${i})`);
    }
    const { rows } = await pool.query(
      `SELECT c.id, c.email, c.email_verificado, c.estado AS cuenta_estado, c.creado, p.slug, p.datos, p.estado, p.verificacion, p.oculto,
              (SELECT count(*)::int FROM fotos f WHERE f.cuenta_id = c.id) AS n_fotos,
              (SELECT f.url_mini FROM fotos f WHERE f.cuenta_id = c.id ORDER BY f.orden, f.creado LIMIT 1) AS foto_mini
       FROM cuentas c JOIN perfiles p ON p.cuenta_id = c.id
       ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''}
       ORDER BY (p.verificacion = 'pendiente') DESC, (p.estado = 'en_revision') DESC, c.creado DESC LIMIT 500`, args);
    const efect = await planes.planesEfectivos(rows.map((x) => x.id));
    res.json({
      items: rows.map((x) => ({
        cuentaId: x.id, email: x.email, emailVerificado: Boolean(x.email_verificado), cuentaEstado: x.cuenta_estado,
        slug: x.slug, displayName: (x.datos && x.datos.displayName) || '', ciudad: (x.datos && x.datos.ciudad) || '',
        provincia: (x.datos && x.datos.provincia) || '', estado: x.estado, verificacion: x.verificacion, oculto: x.oculto,
        plan: efect.get(x.id) || 'E', creado: x.creado, fotos: x.n_fotos, fotoPrincipal: x.foto_mini || null,
      })),
      total: rows.length,
    });
  }));

  r.get('/acompanantes/:id', ah(async (req, res) => {
    const id = uuid(req);
    const { rows } = await pool.query(
      `SELECT c.id, c.email, c.email_verificado, c.estado AS cuenta_estado, c.creado, c.ultimo_login, c.acepto_terminos, c.mayor_edad_declarada,
              p.slug, p.datos, p.estado, p.motivo_rechazo, p.verificacion, p.oculto, p.creado AS p_creado, p.actualizado, p.publicado_en
       FROM cuentas c JOIN perfiles p ON p.cuenta_id = c.id WHERE c.id = $1`, [id]);
    const x = rows[0];
    if (!x) throw he(404, 'Acompañante no encontrada.');
    const [fotos, verifs, hist, resumen] = await Promise.all([
      pool.query('SELECT id, orden, url, url_mini, ancho, alto, creado FROM fotos WHERE cuenta_id = $1 ORDER BY orden, creado', [id]),
      pool.query('SELECT id, estado, motivo, creado, revisado, revisado_por, selfie_ruta IS NOT NULL AS s, documento_ruta IS NOT NULL AS d FROM verificaciones WHERE cuenta_id = $1 ORDER BY creado DESC', [id]),
      pool.query('SELECT id, url, url_mini, texto, creado, expira FROM historias WHERE cuenta_id = $1 ORDER BY creado DESC LIMIT 50', [id]),
      planes.resumenPlan(id),
    ]);
    res.json({
      cuenta: { id: x.id, email: x.email, emailVerificado: x.email_verificado, estado: x.cuenta_estado, creado: x.creado, ultimoLogin: x.ultimo_login, aceptoTerminos: x.acepto_terminos, mayorEdadDeclarada: x.mayor_edad_declarada },
      perfil: { slug: x.slug, datos: x.datos || {}, estado: x.estado, motivoRechazo: x.motivo_rechazo, verificacion: x.verificacion, oculto: x.oculto, creado: x.p_creado, actualizado: x.actualizado, publicadoEn: x.publicado_en },
      fotos: fotos.rows.map((f) => ({ id: f.id, orden: f.orden, url: f.url, urlMini: f.url_mini, ancho: f.ancho, alto: f.alto, creado: f.creado })),
      verificaciones: verifs.rows.map((v) => ({ id: v.id, estado: v.estado, motivo: v.motivo, creado: v.creado, revisado: v.revisado, revisadoPor: v.revisado_por, tieneSelfie: v.s, tieneDocumento: v.d })),
      historias: hist.rows.map((h) => ({ id: h.id, url: h.url, urlMini: h.url_mini, texto: h.texto, creado: h.creado, expira: h.expira })),
      plan: resumen.efectivo,
      suscripciones: resumen.suscripciones,
      pedidos: resumen.pedidos,
    });
  }));

  const enviarPrivado = async (res, ruta, nombre) => {
    const f = ruta ? await privado.abrir(ruta) : null;
    if (!f) throw he(404, 'Archivo no encontrado.');
    res.set({
      'Content-Type': f.tipo, 'Content-Length': String(f.size), 'Cache-Control': 'no-store, private',
      'Content-Disposition': `inline; filename="${nombre}"`, 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    });
    f.stream.on('error', () => res.destroy());
    f.stream.pipe(res);
  };
  r.get('/verificaciones/:id/:archivo(selfie|documento)', ah(async (req, res) => {
    const id = uuid(req);
    const { rows } = await pool.query('SELECT selfie_ruta, documento_ruta FROM verificaciones WHERE id = $1', [id]);
    if (!rows[0]) throw he(404, 'Verificación no encontrada.');
    const ruta = req.params.archivo === 'selfie' ? rows[0].selfie_ruta : rows[0].documento_ruta;
    await enviarPrivado(res, ruta, req.params.archivo);
  }));

  r.post('/acompanantes/:id/verificacion', apiPost, ah(async (req, res) => {
    const id = uuid(req);
    const b = body(req);
    if (!['aprobar', 'rechazar'].includes(b.decision)) throw he(400, 'Decisión inválida: aprobar o rechazar.');
    const motivo = str(b.motivo, 500);
    if (b.decision === 'rechazar' && !motivo) throw he(400, 'Escribí el motivo del rechazo: se lo mandamos a la acompañante.');
    const client = await pool.connect();
    let perfil;
    try {
      await client.query('BEGIN');
      const v = await client.query("SELECT id FROM verificaciones WHERE cuenta_id = $1 AND estado = 'pendiente' ORDER BY creado DESC LIMIT 1 FOR UPDATE", [id]);
      if (!v.rows[0]) throw he(409, 'No hay una verificación pendiente para revisar.');
      const aprobar = b.decision === 'aprobar';
      await client.query('UPDATE verificaciones SET estado = $2, motivo = $3, revisado = now(), revisado_por = $4 WHERE id = $1',
        [v.rows[0].id, aprobar ? 'aprobada' : 'rechazada', motivo || null, adminUser]);
      const p = await client.query(
        `UPDATE perfiles SET verificacion = $2, actualizado = now(),
           estado = CASE WHEN $3 AND estado = 'en_revision' THEN 'publicado'
                         WHEN NOT $3 AND estado = 'en_revision' THEN 'borrador' ELSE estado END,
           publicado_en = CASE WHEN $3 AND estado = 'en_revision' THEN now() ELSE publicado_en END,
           motivo_rechazo = CASE WHEN $3 THEN NULL ELSE $4 END
         WHERE cuenta_id = $1 RETURNING slug, estado, verificacion, motivo_rechazo, publicado_en`,
        [id, aprobar ? 'verificada' : 'rechazada', aprobar, motivo || null]);
      perfil = p.rows[0];
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
    invalidar();
    if (b.decision === 'aprobar') {
      await planes.mail(id, perfil.estado === 'publicado' ? 'Tu perfil está publicado en SexyRose' : 'Verificamos tu identidad',
        perfil.estado === 'publicado'
          ? 'Hola:\n\nRevisamos tu verificación y tu perfil ya está publicado en SexyRose.\n\nSexyRose'
          : 'Hola:\n\nRevisamos tu verificación: tu identidad quedó verificada. Cuando completes tu perfil y lo envíes a revisión, lo publicamos.\n\nSexyRose');
    } else {
      await planes.mail(id, 'Tu verificación no fue aprobada',
        `Hola:\n\nNo pudimos aprobar tu verificación.\nMotivo: ${motivo}\n\nPodés volver a enviar la selfie y el documento desde tu panel.\n\nSexyRose`);
    }
    res.json({ ok: true, perfil });
  }));

  r.post('/acompanantes/:id/estado', apiPost, ah(async (req, res) => {
    const id = uuid(req);
    const b = body(req);
    if (!ESTADOS_ADMIN.includes(b.estado)) throw he(400, `Estado inválido: ${ESTADOS_ADMIN.join(', ')}.`);
    const motivo = str(b.motivo, 500);
    if (['rechazado', 'suspendido'].includes(b.estado) && !motivo) throw he(400, 'Escribí el motivo: se lo mandamos a la acompañante.');
    const cur = await pool.query('SELECT estado, verificacion FROM perfiles WHERE cuenta_id = $1', [id]);
    if (!cur.rows[0]) throw he(404, 'Acompañante no encontrada.');
    if (b.estado === 'publicado' && cur.rows[0].verificacion !== 'verificada') throw he(409, 'No se puede publicar: la identidad no está verificada.');
    const { rows } = await pool.query(
      `UPDATE perfiles SET estado = $2, motivo_rechazo = $3, actualizado = now(),
         publicado_en = CASE WHEN $2 = 'publicado' THEN COALESCE(publicado_en, now()) ELSE publicado_en END
       WHERE cuenta_id = $1 RETURNING slug, estado, verificacion, motivo_rechazo, publicado_en`,
      [id, b.estado, b.estado === 'publicado' ? null : (motivo || null)]);
    invalidar();
    const textos = {
      publicado: ['Tu perfil está publicado en SexyRose', 'Hola:\n\nTu perfil ya está publicado en SexyRose.\n\nSexyRose'],
      pausado: ['Tu perfil quedó pausado', `Hola:\n\nPausamos tu perfil: por ahora no se ve en el sitio.${motivo ? `\nMotivo: ${motivo}` : ''}\n\nSexyRose`],
      suspendido: ['Tu perfil fue suspendido', `Hola:\n\nSuspendimos tu perfil.\nMotivo: ${motivo}\n\nSi creés que es un error, respondé este email.\n\nSexyRose`],
      rechazado: ['Tu perfil no fue aprobado', `Hola:\n\nNo pudimos aprobar tu perfil.\nMotivo: ${motivo}\n\nCorregilo desde tu panel y volvé a enviarlo a revisión.\n\nSexyRose`],
    };
    if (cur.rows[0].estado !== b.estado) await planes.mail(id, ...textos[b.estado]);
    res.json({ ok: true, perfil: rows[0] });
  }));

  r.post('/acompanantes/:id/plan', apiPost, ah(async (req, res) => {
    const id = uuid(req);
    const b = body(req);
    const s = await planes.asignarManual(id, { plan: b.plan, dias: b.dias, nota: str(b.nota, 300), por: adminUser });
    res.json({ ok: true, suscripcion: s, plan: await planes.planEfectivo(id) });
  }));

  // ---------- Pedidos y suscripciones ----------
  r.get('/pedidos', ah(async (req, res) => {
    const estado = typeof req.query.estado === 'string' ? req.query.estado : '';
    const args = []; let where = '';
    if (estado === 'abiertos') where = "WHERE pe.estado IN ('pendiente', 'informado')";
    else if (ESTADOS_PEDIDO.includes(estado)) { args.push(estado); where = 'WHERE pe.estado = $1'; }
    const { rows } = await pool.query(
      `SELECT pe.*, c.email, p.slug, p.datos->>'displayName' AS display_name, p.datos->>'provincia' AS provincia
       FROM pedidos pe JOIN cuentas c ON c.id = pe.cuenta_id LEFT JOIN perfiles p ON p.cuenta_id = pe.cuenta_id
       ${where}
       ORDER BY array_position(ARRAY['informado','pendiente'], pe.estado) NULLS LAST, pe.creado DESC LIMIT 500`, args);
    const n = await pool.query("SELECT count(*) FILTER (WHERE estado = 'pendiente')::int AS pendientes, count(*) FILTER (WHERE estado = 'informado')::int AS informados FROM pedidos");
    res.json({
      items: rows.map((x) => ({ ...pedidoJson(x), cuenta: { email: x.email, slug: x.slug, displayName: x.display_name || '', provincia: x.provincia || '' } })),
      total: rows.length, ...n.rows[0],
    });
  }));

  r.get('/pedidos/:id/comprobante', ah(async (req, res) => {
    const id = uuid(req);
    const { rows } = await pool.query('SELECT comprobante_ruta, referencia FROM pedidos WHERE id = $1', [id]);
    if (!rows[0]) throw he(404, 'Pedido no encontrado.');
    await enviarPrivado(res, rows[0].comprobante_ruta, `comprobante-${rows[0].referencia}`);
  }));

  r.post('/pedidos/:id/confirmar', apiPost, ah(async (req, res) => {
    const id = uuid(req);
    res.json({ ok: true, ...(await planes.confirmar(id, { por: adminUser })) });
  }));

  r.post('/pedidos/:id/rechazar', apiPost, ah(async (req, res) => {
    const id = uuid(req);
    res.json({ ok: true, pedido: await planes.rechazar(id, { motivo: str(body(req).motivo, 500), por: adminUser }) });
  }));

  r.get('/suscripciones', ah(async (req, res) => {
    const estado = req.query.estado === 'todas' ? null : (['activa', 'vencida', 'cancelada'].includes(req.query.estado) ? req.query.estado : 'activa');
    const { rows } = await pool.query(
      `SELECT s.*, c.email, p.slug, p.datos->>'displayName' AS display_name, p.datos->>'provincia' AS provincia
       FROM suscripciones s JOIN cuentas c ON c.id = s.cuenta_id LEFT JOIN perfiles p ON p.cuenta_id = s.cuenta_id
       ${estado ? 'WHERE s.estado = $1' : ''} ORDER BY s.hasta DESC LIMIT 500`, estado ? [estado] : []);
    const ahora = Date.now();
    res.json({ items: rows.map((x) => ({ ...suscripcionJson(x, ahora), cuenta: { email: x.email, slug: x.slug, displayName: x.display_name || '', provincia: x.provincia || '' } })), total: rows.length });
  }));

  r.post('/suscripciones/:id/cancelar', apiPost, ah(async (req, res) => {
    res.json({ ok: true, suscripcion: await planes.cancelarSuscripcion(uuid(req)) });
  }));

  // ---------- Stars ----------
  r.get('/stars', ah(async (req, res) => {
    const [prov, stars] = await Promise.all([
      pool.query("SELECT id, nombre FROM ubicaciones WHERE tipo = 'provincia' AND activa ORDER BY orden, nombre"),
      pool.query(
        `SELECT DISTINCT ON (s.cuenta_id) s.cuenta_id, max(s.hasta) OVER (PARTITION BY s.cuenta_id) AS hasta,
                p.slug, p.datos->>'displayName' AS display_name, btrim(p.datos->>'provincia') AS provincia
         FROM suscripciones s JOIN perfiles p ON p.cuenta_id = s.cuenta_id
         WHERE s.plan = 'S' AND s.estado = 'activa' AND s.desde <= now() AND s.hasta > now()`),
    ]);
    const mapa = new Map();
    const clave = (n) => String(n || '').trim().toLowerCase();
    // datos.provincia guarda el id de la ubicación (ej. provincia-de-cordoba): se agrupa por id y se muestra el nombre
    for (const p of prov.rows) mapa.set(clave(p.id), { provinciaId: p.id, provincia: p.nombre, stars: [] });
    const porNombre = new Map(prov.rows.map((p) => [clave(p.nombre), clave(p.id)]));
    for (const s of stars.rows) {
      const k = porNombre.get(clave(s.provincia)) || clave(s.provincia || '(sin provincia)');
      if (!mapa.has(k)) mapa.set(k, { provinciaId: s.provincia || null, provincia: s.provincia || '(sin provincia)', stars: [] });
      mapa.get(k).stars.push({ cuentaId: s.cuenta_id, slug: s.slug, displayName: s.display_name || '', hasta: s.hasta });
    }
    const provincias = [...mapa.values()].map((p) => ({ ...p, ocupadas: p.stars.length, libres: Math.max(0, CUPO_STAR - p.stars.length) }));
    res.json({ cupo: CUPO_STAR, provincias });
  }));

  // ---------- Ajustes ----------
  const leerAjustes = async () => {
    const { rows } = await pool.query('SELECT clave, valor, actualizado FROM ajustes WHERE clave = ANY($1)', [AJUSTES]);
    const m = new Map(rows.map((x) => [x.clave, x]));
    const v = (k, def) => (m.has(k) ? m.get(k).valor : def);
    return {
      precios: mezclarPrecios(v('precios', null)),
      transferencia: typeof v('transferencia', '') === 'string' ? v('transferencia', '') : (v('transferencia', {}).texto || ''),
      portada: { titulo: '', subtitulo: '', ...(v('portada', {}) || {}) },
      promo: typeof v('promo', '') === 'string' ? v('promo', '') : (v('promo', {}).texto || ''),
      actualizado: Object.fromEntries(rows.map((x) => [x.clave, x.actualizado])),
    };
  };
  r.get('/ajustes', ah(async (req, res) => res.json(await leerAjustes())));
  r.get('/ajustes/:clave', ah(async (req, res) => {
    if (!AJUSTES.includes(req.params.clave)) throw he(404, 'Ajuste desconocido.');
    const a = await leerAjustes();
    res.json({ clave: req.params.clave, valor: a[req.params.clave] });
  }));
  const validarAjuste = (clave, v) => {
    if (clave === 'precios') return validarPrecios(v);
    if (clave === 'transferencia' || clave === 'promo') {
      const max = clave === 'promo' ? 500 : 2000;
      if (typeof v !== 'string') return { error: 'Tiene que ser texto.' };
      if (v.length > max) return { error: `Máximo ${max} caracteres.` };
      return { valor: v.replace(/\r\n?/g, '\n').trim() };
    }
    if (clave === 'portada') {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return { error: 'Formato inválido: {titulo, subtitulo}.' };
      if (typeof v.titulo !== 'string' || typeof v.subtitulo !== 'string') return { error: 'Faltan el título y el subtítulo.' };
      if (v.titulo.length > 120 || v.subtitulo.length > 300) return { error: 'El título admite 120 caracteres y el subtítulo 300.' };
      return { valor: { titulo: v.titulo.trim(), subtitulo: v.subtitulo.trim() } };
    }
    return { error: 'Ajuste desconocido.' };
  };
  r.put('/ajustes/:clave', apiPost, ah(async (req, res) => {
    const clave = req.params.clave;
    if (!AJUSTES.includes(clave)) throw he(404, 'Ajuste desconocido.');
    const b = body(req);
    if (!('valor' in b)) throw he(400, 'Falta el valor.');
    const v = validarAjuste(clave, b.valor);
    if (v.error) throw he(400, v.error);
    await pool.query(
      'INSERT INTO ajustes (clave, valor, actualizado) VALUES ($1, $2::jsonb, now()) ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado = now()',
      [clave, JSON.stringify(v.valor)]);
    invalidar();
    res.json({ ok: true, clave, valor: (await leerAjustes())[clave] });
  }));

  // ---------- Ubicaciones, categorías, intereses ----------
  const crud = ({ tabla, campos, orden, validar, enUso }) => {
    const base = '/' + tabla;
    const fila = (x) => x;
    r.get(base, ah(async (req, res) => {
      const { rows } = await pool.query(`SELECT * FROM ${tabla} ORDER BY ${orden}`);
      res.json({ items: rows.map(fila) });
    }));
    r.post(base, apiPost, ah(async (req, res) => {
      const b = body(req);
      const v = await validar(b, null);
      const id = b.id ? String(b.id) : slugify(v.nombre);
      if (!ID_RE.test(id)) throw he(400, 'El identificador solo puede tener a-z, 0-9 y guiones.');
      const cols = ['id', ...campos];
      const vals = [id, ...campos.map((c) => v[c])];
      try {
        const { rows } = await pool.query(
          `INSERT INTO ${tabla} (${cols.join(', ')}) VALUES (${cols.map((_, i) => '$' + (i + 1)).join(', ')}) RETURNING *`, vals);
        invalidar();
        res.status(201).json({ ok: true, item: rows[0] });
      } catch (e) {
        if (e.code === '23505') throw he(409, `Ya existe "${id}".`);
        throw e;
      }
    }));
    r.put(base + '/:id', apiPost, ah(async (req, res) => {
      const id = req.params.id;
      const cur = await pool.query(`SELECT * FROM ${tabla} WHERE id = $1`, [id]);
      if (!cur.rows[0]) throw he(404, 'No encontrado.');
      const v = await validar({ ...cur.rows[0], ...body(req), id }, cur.rows[0]);
      const { rows } = await pool.query(
        `UPDATE ${tabla} SET ${campos.map((c, i) => `${c} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING *`,
        [id, ...campos.map((c) => v[c])]);
      invalidar();
      res.json({ ok: true, item: rows[0] });
    }));
    r.delete(base + '/:id', apiPost, ah(async (req, res) => {
      const id = req.params.id;
      const cur = await pool.query(`SELECT * FROM ${tabla} WHERE id = $1`, [id]);
      if (!cur.rows[0]) throw he(404, 'No encontrado.');
      const uso = await enUso(cur.rows[0]);
      if (uso) throw he(409, uso);
      await pool.query(`DELETE FROM ${tabla} WHERE id = $1`, [id]);
      invalidar();
      res.json({ ok: true });
    }));
  };

  crud({
    tabla: 'ubicaciones', campos: ['nombre', 'tipo', 'padre', 'activa', 'orden'], orden: "array_position(ARRAY['pais','provincia','ciudad','zona'], tipo), orden, nombre",
    validar: async (b, cur) => {
      const nombre = str(b.nombre, 80);
      if (nombre.length < 2) throw he(400, 'Escribí el nombre (mínimo 2 letras).');
      if (!TIPOS_UBIC.includes(b.tipo)) throw he(400, `Tipo inválido: ${TIPOS_UBIC.join(', ')}.`);
      const padre = b.padre ? String(b.padre) : null;
      if (b.tipo !== 'pais' && !padre) throw he(400, 'Elegí a qué lugar pertenece (padre).');
      if (padre) {
        if (cur && padre === cur.id) throw he(400, 'Un lugar no puede ser su propio padre.');
        const p = await pool.query('SELECT tipo FROM ubicaciones WHERE id = $1', [padre]);
        if (!p.rows[0]) throw he(400, 'El lugar padre no existe.');
        if (TIPOS_UBIC.indexOf(p.rows[0].tipo) >= TIPOS_UBIC.indexOf(b.tipo)) throw he(400, 'El padre tiene que ser de un nivel superior.');
      }
      return { nombre, tipo: b.tipo, padre, activa: bool(b.activa, cur ? cur.activa : true), orden: ent(b.orden, cur ? cur.orden : 0) };
    },
    enUso: async (u) => {
      const h = await pool.query('SELECT count(*)::int AS n FROM ubicaciones WHERE padre = $1', [u.id]);
      if (h.rows[0].n) return `No se puede borrar: tiene ${h.rows[0].n} lugares adentro. Borralos o movelos primero (o desactivalo).`;
      const p = await pool.query(
        `SELECT count(*)::int AS n FROM perfiles WHERE lower(btrim(datos->>'provincia')) IN (lower($1), lower($2))
           OR lower(btrim(datos->>'ciudad')) IN (lower($1), lower($2)) OR lower(btrim(datos->>'zona')) IN (lower($1), lower($2))`, [u.id, u.nombre]);
      return p.rows[0].n ? `No se puede borrar: lo usan ${p.rows[0].n} perfiles. Podés desactivarlo.` : null;
    },
  });
  crud({
    tabla: 'categorias', campos: ['nombre', 'icono', 'orden', 'activa'], orden: 'orden, nombre',
    validar: async (b, cur) => {
      const nombre = str(b.nombre, 40);
      if (nombre.length < 2) throw he(400, 'Escribí el nombre (mínimo 2 letras).');
      const icono = str(b.icono, 30) || (cur && cur.icono) || 'sparkles';
      if (icono && !/^[a-zA-Z0-9-]+$/.test(icono)) throw he(400, 'Ícono inválido.');
      return { nombre, icono, orden: ent(b.orden, cur ? cur.orden : 0), activa: bool(b.activa, cur ? cur.activa : true) };
    },
    enUso: async (c) => {
      const p = await pool.query("SELECT count(*)::int AS n FROM perfiles WHERE jsonb_typeof(datos->'salidas') = 'array' AND datos->'salidas' ? $1", [c.id]);
      return p.rows[0].n ? `No se puede borrar: la usan ${p.rows[0].n} perfiles. Podés desactivarla.` : null;
    },
  });
  crud({
    tabla: 'intereses', campos: ['nombre', 'nombre_en', 'nombre_pt', 'orden'], orden: 'orden, nombre',
    validar: async (b, cur) => {
      const nombre = str(b.nombre, 40);
      if (nombre.length < 2) throw he(400, 'Escribí el nombre (mínimo 2 letras).');
      return { nombre, nombre_en: str(b.nombre_en, 40), nombre_pt: str(b.nombre_pt, 40), orden: ent(b.orden, cur ? cur.orden : 0) };
    },
    enUso: async (i) => {
      const p = await pool.query("SELECT count(*)::int AS n FROM perfiles WHERE jsonb_typeof(datos->'intereses') = 'array' AND datos->'intereses' ? $1", [i.id]);
      return p.rows[0].n ? `No se puede borrar: lo eligieron ${p.rows[0].n} perfiles.` : null;
    },
  });

  // Errores propios con mensaje; el resto sigue al manejador de errores del admin.
  r.use((e, req, res, next) => {
    if (e instanceof PlanError || e instanceof HttpError || e.expose) return res.status(e.status || 400).json({ error: e.message });
    next(e);
  });

  async function contadores() {
    const [a, v, p] = await Promise.all([
      pool.query("SELECT count(*)::int AS total, count(*) FILTER (WHERE estado = 'en_revision')::int AS en_revision, count(*) FILTER (WHERE estado = 'publicado')::int AS publicadas FROM perfiles"),
      pool.query("SELECT count(*)::int AS n FROM perfiles WHERE verificacion = 'pendiente'"),
      pool.query("SELECT count(*) FILTER (WHERE estado = 'pendiente')::int AS pendientes, count(*) FILTER (WHERE estado = 'informado')::int AS informados FROM pedidos"),
    ]);
    return {
      acompanantes: { total: a.rows[0].total, enRevision: a.rows[0].en_revision, publicadas: a.rows[0].publicadas },
      verificacionesPendientes: v.rows[0].n,
      pedidos: p.rows[0],
    };
  }

  return { router: r, contadores, planesNombres: PLAN_NOMBRE, planesPagos: PLANES_PAGOS };
}
