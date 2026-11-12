// Pedidos personalizados con chat (decisión de Juan, 12/11/2026; estilo OnlyFans).
//
// - El cliente (cuenta de interesado con email confirmado) escribe su pedido (hasta 500 caracteres) en el perfil de una
//   acompañante de plan Oro o Star con Mercado Pago conectado (contenido.tomaPedidos).
// - A ella le llega en su panel (Pedidos, con contador). Acepta o rechaza. Rechazado = termina ahí. Aceptado = chat entre
//   los dos para ese pedido (mensajes de texto, hasta 1000 caracteres; sin fotos ni videos gratis).
// - En el chat ella puede mandar contenido bloqueado: una foto o un video desde su dispositivo + precio en pesos. El
//   original queda en el disco privado del servidor (lib/storage.js guardarPrivado), nunca en el CDN público; en el chat
//   se ve una vista previa borrosa. Calidad máxima 720p (lado largo 1280, lado corto 720). Video: hasta 60 s, como las
//   historias, por la misma cola de ffmpeg (lib/videos.js); la vista previa es un cuadro borroso.
// - El cliente paga con Mercado Pago (lib/contenido.js pagarItemPedido: título neutro, comisión como marketplace_fee);
//   al aprobarse el pago se desbloquea solo para él (y la acompañante siempre ve lo que mandó).
// - Vence a 1 mes del pago (sin pagar: a 1 mes de enviado): se borran los archivos y el chat dice "Este contenido venció".
// - Cualquiera de los dos cierra el pedido: queda de solo lectura.
// - Casi en tiempo real: el navegador consulta mensajes nuevos (since=<último id>) cada ~4 s con el chat abierto.
import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { pesos } from './contenido.js';
import { analizar, portada, transcodificar, VideoInvalido, MAX_SEGUNDOS_HISTORIA } from './videos.js';

export const MAX_PEDIDO = 500;
export const MAX_MENSAJE = 1000;
export const MIN_PRECIO = 100;           // pesos
export const MAX_PRECIO = 10000000;      // pesos
export const LADO_LARGO = 1280;          // 720p
export const LADO_CORTO = 720;
const MAX_PIXELS = 40_000_000;

export class SolicitudError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; Object.assign(this, extra); }
}
const he = (s, m, extra) => new SolicitudError(s, m, extra);

const BIDI = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩﻿]/g;
const texto = (v) => (typeof v === 'string' ? v.normalize('NFC').replace(/\r\n?/g, '\n').replace(BIDI, '').replace(/\n{3,}/g, '\n\n').trim() : '');
const largo = (s) => [...s].length;

// Tamaño 720p como máximo (lado largo ≤ 1280 y lado corto ≤ 720), sin agrandar; números pares para el video.
export function tam720(ancho, alto, par = false) {
  const largoL = Math.max(ancho, alto); const cortoL = Math.min(ancho, alto);
  const k = Math.min(1, LADO_LARGO / largoL, LADO_CORTO / cortoL);
  const r = (n) => (par ? Math.max(2, Math.round((n * k) / 2) * 2) : Math.max(1, Math.round(n * k)));
  return { ancho: r(ancho), alto: r(alto) };
}

export function validarPrecio(v) {
  const precio = Number(typeof v === 'string' ? v.replace(',', '.') : v);
  if (!Number.isFinite(precio) || precio < MIN_PRECIO || precio > MAX_PRECIO) return { error: `El precio tiene que ser de entre $ ${MIN_PRECIO} y $ ${MAX_PRECIO.toLocaleString('es-AR')}.` };
  const centavos = Math.round(precio * 100);
  if (Math.abs(centavos - precio * 100) > 1e-6) return { error: 'El precio admite hasta 2 decimales.' };
  return { centavos };
}

// Vista previa borrosa: chica, desenfocada y agrandada (no se puede recuperar el original).
async function borrosa(buffer) {
  const chica = await sharp(buffer, { limitInputPixels: MAX_PIXELS, failOn: 'error' }).rotate()
    .resize({ width: 48, height: 48, fit: 'inside' }).toBuffer({ resolveWithObject: true });
  const k = 480 / Math.max(chica.info.width, chica.info.height);
  return sharp(chica.data).resize({ width: Math.round(chica.info.width * k), height: Math.round(chica.info.height * k) })
    .blur(18).webp({ quality: 60 }).toBuffer();
}

export function createSolicitudes({ pool, storage, contenido, videos = null, log = () => {}, tmpDir }) {
  const ROL = { cliente: 'cliente', acompanante: 'acompanante' };

  // ---------- Lectura ----------
  async function fila(id, db = pool) {
    const { rows } = await db.query('SELECT * FROM solicitudes WHERE id = $1', [id]);
    return rows[0] || null;
  }
  // El pedido, solo si es de quien pregunta.
  async function propia(rol, actorId, id) {
    if (!/^[0-9a-f-]{36}$/i.test(String(id || ''))) throw he(404, 'No encontramos ese pedido.');
    const s = await fila(id);
    if (!s || (rol === ROL.cliente ? s.cliente_id !== actorId : s.cuenta_id !== actorId)) throw he(404, 'No encontramos ese pedido.');
    return s;
  }
  const nombreDe = async (cuentaId) => {
    const { rows } = await pool.query("SELECT slug, datos->>'displayName' AS nombre FROM perfiles WHERE cuenta_id = $1", [cuentaId]);
    return rows[0] ? { nombre: rows[0].nombre || '', slug: rows[0].slug } : { nombre: '', slug: null };
  };
  const usuarioDe = async (clienteId) => {
    const { rows } = await pool.query('SELECT usuario FROM clientes WHERE id = $1', [clienteId]);
    return rows[0] ? rows[0].usuario : '';
  };

  // Estado de un contenido para quien mira (rol). Nunca devuelve rutas: el archivo se pide por /archivo.
  async function itemsDe(solicitudId, rol, clienteId) {
    const { rows } = await pool.query(
      `SELECT i.*, EXISTS (SELECT 1 FROM ventas_contenido v WHERE v.solicitud_item_id = i.id AND v.estado = 'aprobada' AND v.cliente_id = $2) AS pagado_ok,
              EXISTS (SELECT 1 FROM ventas_contenido v WHERE v.solicitud_item_id = i.id AND v.estado = 'en_proceso' AND v.cliente_id = $2) AS en_proceso
         FROM solicitud_items i WHERE i.solicitud_id = $1 ORDER BY i.creado`, [solicitudId, clienteId]);
    return rows.map((i) => {
      const vencido = i.estado === 'vencido' || !!i.borrado;
      const desbloqueado = !vencido && i.estado === 'listo' && (rol === ROL.acompanante || i.pagado_ok);
      return {
        id: i.id, tipo: i.tipo, estado: vencido ? 'vencido' : i.estado, precio: pesos(i.precio_centavos), error: i.error || null,
        segundos: i.segundos == null ? null : Number(i.segundos), ancho: i.ancho, alto: i.alto, creado: i.creado,
        pagado: !!i.pagado_ok, pagoEnProceso: !i.pagado_ok && !!i.en_proceso, vence: i.vence, desbloqueado,
        preview: !vencido && i.estado === 'listo' && i.ruta_preview ? true : false,
      };
    });
  }

  const noLeidos = (s, rol) => (rol === ROL.cliente ? `(SELECT count(*)::int FROM solicitud_mensajes m WHERE m.solicitud_id = ${s}.id AND m.autor <> 'cliente' AND m.id > ${s}.leido_cliente)`
    : `(SELECT count(*)::int FROM solicitud_mensajes m WHERE m.solicitud_id = ${s}.id AND m.autor <> 'acompanante' AND m.id > ${s}.leido_acomp)`);

  const resumenJson = (x, rol) => ({
    id: x.id, estado: x.estado, texto: x.texto, creado: x.creado, actividad: x.actividad, cerradaPor: x.cerrada_por || null,
    noLeidos: Number(x.no_leidos || 0) + (rol === ROL.acompanante && x.estado === 'pendiente' && !x.vista_acomp ? 1 : 0),
    ...(rol === ROL.cliente ? { acompanante: { nombre: x.nombre || '', slug: x.slug || null } } : { cliente: { usuario: x.usuario || '' } }),
  });

  async function listar(rol, actorId) {
    const { rows } = rol === ROL.cliente
      ? await pool.query(
        `SELECT s.*, p.slug, p.datos->>'displayName' AS nombre, ${noLeidos('s', rol)} AS no_leidos
           FROM solicitudes s LEFT JOIN perfiles p ON p.cuenta_id = s.cuenta_id WHERE s.cliente_id = $1 ORDER BY s.actividad DESC LIMIT 200`, [actorId])
      : await pool.query(
        `SELECT s.*, c.usuario, ${noLeidos('s', rol)} AS no_leidos
           FROM solicitudes s JOIN clientes c ON c.id = s.cliente_id WHERE s.cuenta_id = $1
          ORDER BY (s.estado = 'pendiente') DESC, s.actividad DESC LIMIT 200`, [actorId]);
    const items = rows.map((x) => resumenJson(x, rol));
    return { items, noLeidos: items.reduce((a, x) => a + x.noLeidos, 0) };
  }
  async function contarNoLeidos(rol, actorId) {
    const col = rol === ROL.cliente ? 'cliente_id' : 'cuenta_id';
    const extra = rol === ROL.acompanante ? " + (CASE WHEN s.estado = 'pendiente' AND s.vista_acomp IS NULL THEN 1 ELSE 0 END)" : '';
    const { rows } = await pool.query(`SELECT COALESCE(sum(${noLeidos('s', rol)}${extra}), 0)::int AS n FROM solicitudes s WHERE s.${col} = $1`, [actorId]);
    return rows[0].n;
  }

  const mensajeJson = (m) => ({ id: Number(m.id), autor: m.autor, texto: m.texto, itemId: m.item_id || null, creado: m.creado });

  // Detalle + mensajes (desde "since"): lo que pide el chat cada pocos segundos. Marca como leído.
  async function detalle(rol, actorId, id, { since = 0 } = {}) {
    const s = await propia(rol, actorId, id);
    const desde = Number.isSafeInteger(Number(since)) && Number(since) > 0 ? Number(since) : 0;
    const { rows: ms } = await pool.query('SELECT * FROM solicitud_mensajes WHERE solicitud_id = $1 AND id > $2 ORDER BY id LIMIT 500', [s.id, desde]);
    const ultimo = ms.length ? Number(ms[ms.length - 1].id) : 0;
    if (rol === ROL.cliente && ultimo > Number(s.leido_cliente)) await pool.query('UPDATE solicitudes SET leido_cliente = GREATEST(leido_cliente, $2) WHERE id = $1', [s.id, ultimo]);
    if (rol === ROL.acompanante && (ultimo > Number(s.leido_acomp) || !s.vista_acomp)) await pool.query('UPDATE solicitudes SET leido_acomp = GREATEST(leido_acomp, $2), vista_acomp = COALESCE(vista_acomp, now()) WHERE id = $1', [s.id, ultimo]);
    const otro = rol === ROL.cliente ? { acompanante: await nombreDe(s.cuenta_id) } : { cliente: { usuario: await usuarioDe(s.cliente_id) } };
    return {
      solicitud: { id: s.id, estado: s.estado, texto: s.texto, creado: s.creado, respondida: s.respondida, cerrada: s.cerrada, cerradaPor: s.cerrada_por || null, ...otro },
      mensajes: ms.map(mensajeJson), items: await itemsDe(s.id, rol, s.cliente_id), ultimo: ultimo || desde,
      puedeEnviarContenido: rol === ROL.acompanante && s.estado === 'aceptada' ? await contenido.tomaPedidos(s.cuenta_id) : false,
    };
  }

  // ---------- Cambios ----------
  async function crear(clienteId, { slug, texto: t }) {
    const txt = texto(t);
    if (largo(txt) < 3) throw he(400, 'Contale a la acompañante qué querés pedir.');
    if (largo(txt) > MAX_PEDIDO) throw he(400, `El pedido puede tener hasta ${MAX_PEDIDO} caracteres.`);
    if (typeof slug !== 'string' || !/^[a-z0-9-]{1,80}$/.test(slug)) throw he(404, 'Perfil no encontrado.');
    const { rows: [p] } = await pool.query(
      `SELECT p.cuenta_id FROM perfiles p JOIN cuentas c ON c.id = p.cuenta_id
        WHERE p.slug = $1 AND p.estado = 'publicado' AND p.verificacion = 'verificada' AND NOT p.oculto AND c.estado = 'activa'`, [slug]);
    if (!p) throw he(404, 'Perfil no encontrado.');
    if (!(await contenido.tomaPedidos(p.cuenta_id))) throw he(409, 'Esta acompañante no toma pedidos personalizados.');
    // Un solo pedido sin responder por acompañante
    const { rows: ab } = await pool.query("SELECT id FROM solicitudes WHERE cliente_id = $1 AND cuenta_id = $2 AND estado = 'pendiente' LIMIT 1", [clienteId, p.cuenta_id]);
    if (ab[0]) throw he(409, 'Ya tenés un pedido esperando respuesta de esta acompañante.', { solicitudId: ab[0].id });
    const { rows: [s] } = await pool.query('INSERT INTO solicitudes (cliente_id, cuenta_id, texto) VALUES ($1, $2, $3) RETURNING *', [clienteId, p.cuenta_id, txt]);
    return { id: s.id, estado: s.estado };
  }

  async function responder(cuentaId, id, acepta) {
    const s = await propia(ROL.acompanante, cuentaId, id);
    if (s.estado !== 'pendiente') throw he(409, 'Este pedido ya fue respondido.');
    if (acepta && !(await contenido.tomaPedidos(cuentaId))) throw he(409, 'Para aceptar pedidos necesitás el plan Oro o Star y tu cuenta de Mercado Pago conectada.');
    const estado = acepta ? 'aceptada' : 'rechazada';
    const { rowCount } = await pool.query(
      "UPDATE solicitudes SET estado = $2, respondida = now(), actividad = now(), vista_acomp = COALESCE(vista_acomp, now()) WHERE id = $1 AND estado = 'pendiente'", [s.id, estado]);
    if (!rowCount) throw he(409, 'Este pedido ya fue respondido.');
    await pool.query("INSERT INTO solicitud_mensajes (solicitud_id, autor, texto) VALUES ($1, 'sistema', $2)", [s.id, acepta ? 'aceptada' : 'rechazada']);
    return { ok: true, estado };
  }

  async function mensaje(rol, actorId, id, t) {
    const s = await propia(rol, actorId, id);
    if (s.estado !== 'aceptada') throw he(409, s.estado === 'pendiente' ? 'El chat se abre cuando la acompañante acepta el pedido.' : 'Este pedido está cerrado.');
    const txt = texto(t);
    if (!txt) throw he(400, 'Escribí un mensaje.');
    if (largo(txt) > MAX_MENSAJE) throw he(400, `El mensaje puede tener hasta ${MAX_MENSAJE} caracteres.`);
    const { rows: [m] } = await pool.query('INSERT INTO solicitud_mensajes (solicitud_id, autor, texto) VALUES ($1, $2, $3) RETURNING *', [s.id, rol, txt]);
    const col = rol === ROL.cliente ? 'leido_cliente' : 'leido_acomp';
    await pool.query(`UPDATE solicitudes SET actividad = now(), ${col} = GREATEST(${col}, $2) WHERE id = $1`, [s.id, m.id]);
    return { ok: true, mensaje: mensajeJson(m) };
  }

  async function cerrar(rol, actorId, id) {
    const s = await propia(rol, actorId, id);
    if (s.estado === 'cerrada' || s.estado === 'rechazada') return { ok: true, estado: s.estado };
    await pool.query("UPDATE solicitudes SET estado = 'cerrada', cerrada = now(), cerrada_por = $2, actividad = now() WHERE id = $1", [s.id, rol]);
    await pool.query("INSERT INTO solicitud_mensajes (solicitud_id, autor, texto) VALUES ($1, 'sistema', $2)", [s.id, 'cerrada:' + rol]);
    return { ok: true, estado: 'cerrada' };
  }

  // ---------- Contenido bloqueado ----------
  // Foto: se procesa en el momento (720p máx., sin metadatos) + vista previa borrosa. Video: queda "procesando" y va a
  // la cola de ffmpeg. buffer (foto) o archivo temporal (video, ya escrito en tmpDir con el id del item).
  async function subirItem(cuentaId, id, { tipo, precio, buffer = null, archivo = null, itemId = null }) {
    const s = await propia(ROL.acompanante, cuentaId, id);
    if (s.estado !== 'aceptada') throw he(409, 'Solo podés mandar contenido en un pedido aceptado y abierto.');
    if (!(await contenido.tomaPedidos(cuentaId))) throw he(409, 'Para mandar contenido necesitás el plan Oro o Star y tu cuenta de Mercado Pago conectada.');
    const p = validarPrecio(precio);
    if (p.error) throw he(400, p.error);
    if (tipo === 'foto') {
      let meta;
      try { meta = await sharp(buffer, { limitInputPixels: MAX_PIXELS, failOn: 'error' }).metadata(); } catch { throw he(400, 'El archivo no es una imagen válida.'); }
      if (!meta.width || !meta.height) throw he(400, 'El archivo no es una imagen válida.');
      const girada = await sharp(buffer, { limitInputPixels: MAX_PIXELS, failOn: 'error' }).rotate().toBuffer({ resolveWithObject: true });
      const t = tam720(girada.info.width, girada.info.height);
      const out = await sharp(girada.data).resize({ width: t.ancho, height: t.alto, fit: 'inside', withoutEnlargement: true }).webp({ quality: 84 }).toBuffer({ resolveWithObject: true });
      const prev = await borrosa(out.data);
      const ruta = await storage.guardarPrivado('pedidos', out.data, 'webp');
      const rutaPrev = await storage.guardarPrivado('pedidos', prev, 'webp', 'prev');
      const { rows: [i] } = await pool.query(
        `INSERT INTO solicitud_items (solicitud_id, cuenta_id, tipo, estado, precio_centavos, ruta, ruta_preview, ancho, alto)
         VALUES ($1, $2, 'foto', 'listo', $3, $4, $5, $6, $7) RETURNING *`,
        [s.id, cuentaId, p.centavos, ruta, rutaPrev, out.info.width, out.info.height]);
      await pool.query("INSERT INTO solicitud_mensajes (solicitud_id, autor, item_id) VALUES ($1, 'acompanante', $2)", [s.id, i.id]);
      await pool.query('UPDATE solicitudes SET actividad = now() WHERE id = $1', [s.id]);
      return { ok: true, itemId: i.id, estado: 'listo' };
    }
    if (tipo !== 'video' || !archivo || !itemId) throw he(400, 'Elegí una foto o un video.');
    if (!videos) throw he(503, 'Los videos no están disponibles en este momento.');
    const { rows: [i] } = await pool.query(
      `INSERT INTO solicitud_items (id, solicitud_id, cuenta_id, tipo, estado, precio_centavos) VALUES ($1, $2, $3, 'video', 'procesando', $4) RETURNING *`,
      [itemId, s.id, cuentaId, p.centavos]);
    await pool.query("INSERT INTO solicitud_mensajes (solicitud_id, autor, item_id) VALUES ($1, 'acompanante', $2)", [s.id, i.id]);
    await pool.query('UPDATE solicitudes SET actividad = now() WHERE id = $1', [s.id]);
    videos.encolar('x:' + i.id);
    return { ok: true, itemId: i.id, estado: 'procesando' };
  }

  // Cola de ffmpeg: video a 720p máx. (sin marca de agua, sin metadatos) + cuadro borroso. Nunca tira error (la cola sigue).
  async function procesarVideo(id) {
    const entrada = path.join(tmpDir, `${id}.subida`);
    const salida = path.join(tmpDir, `${id}.mp4`);
    const fallar = (msg) => pool.query("UPDATE solicitud_items SET estado = 'error', error = $2 WHERE id = $1 AND estado = 'procesando'", [id, msg.slice(0, 300)]).catch(() => {});
    try {
      const { rows } = await pool.query("SELECT id FROM solicitud_items WHERE id = $1 AND estado = 'procesando'", [id]);
      if (!rows[0]) return;
      const a = await analizar(entrada, { ffprobe: videos.ffprobe, maxSegundos: MAX_SEGUNDOS_HISTORIA });
      const t = tam720(a.ancho, a.alto, true);
      const dims = await transcodificar(entrada, salida, a, { ffmpeg: videos.ffmpeg, marca: false, maxSegundos: MAX_SEGUNDOS_HISTORIA, tam: t });
      const final = await analizar(salida, { ffprobe: videos.ffprobe, maxSegundos: MAX_SEGUNDOS_HISTORIA });
      const pos = await portada(salida, final.duracion, { ffmpeg: videos.ffmpeg });
      const prev = await borrosa(pos.buffer);
      const ruta = await storage.guardarPrivado('pedidos', await fsp.readFile(salida), 'mp4');
      const rutaPrev = await storage.guardarPrivado('pedidos', prev, 'webp', 'prev');
      const { rowCount } = await pool.query(
        `UPDATE solicitud_items SET estado = 'listo', ruta = $2, ruta_preview = $3, segundos = $4, ancho = $5, alto = $6, error = NULL
          WHERE id = $1 AND estado = 'procesando'`, [id, ruta, rutaPrev, Math.round(final.duracion * 10) / 10, dims.ancho, dims.alto]);
      if (!rowCount) { await storage.borrarPrivado(ruta); await storage.borrarPrivado(rutaPrev); }
    } catch (e) {
      if (e instanceof VideoInvalido) await fallar(e.message);
      else { log('pedido: error al procesar un video', id, e.code || e.message); await fallar('No pudimos procesar el video. Probá con otro archivo.'); }
    } finally {
      await fsp.rm(entrada, { force: true }).catch(() => {});
      await fsp.rm(salida, { force: true }).catch(() => {});
    }
  }
  if (videos && typeof videos.registrar === 'function') videos.registrar('x', (id) => procesarVideo(id).catch(() => {}));

  // Al arrancar: los videos que quedaron a medio procesar vuelven a la cola (si sigue el temporal) o pasan a error.
  async function recuperar() {
    const { rows } = await pool.query("SELECT id FROM solicitud_items WHERE estado = 'procesando' AND tipo = 'video'");
    for (const { id } of rows) {
      try { await fsp.access(path.join(tmpDir, `${id}.subida`)); if (videos) videos.encolar('x:' + id); }
      catch { await pool.query("UPDATE solicitud_items SET estado = 'error', error = 'Se interrumpió el procesamiento. Mandalo de nuevo.' WHERE id = $1", [id]); }
    }
  }

  // Ruta del archivo que puede ver quien pregunta (o error). preview = la borrosa (ambos); si no, el original
  // (la acompañante siempre; el cliente solo con el pago aprobado).
  async function archivo(rol, actorId, itemId, { preview = false } = {}) {
    if (!/^[0-9a-f-]{36}$/i.test(String(itemId || ''))) throw he(404, 'Archivo no encontrado.');
    const { rows: [i] } = await pool.query(
      'SELECT i.*, s.cliente_id, s.cuenta_id AS s_cuenta FROM solicitud_items i JOIN solicitudes s ON s.id = i.solicitud_id WHERE i.id = $1', [itemId]);
    if (!i) throw he(404, 'Archivo no encontrado.');
    const esDueno = rol === ROL.acompanante ? i.s_cuenta === actorId : i.cliente_id === actorId;
    if (!esDueno) throw he(404, 'Archivo no encontrado.');
    if (i.estado !== 'listo' || i.borrado) throw he(410, 'Este contenido venció.');
    if (preview) return i.ruta_preview;
    if (rol === ROL.cliente) {
      const { rows: [v] } = await pool.query("SELECT 1 FROM ventas_contenido WHERE solicitud_item_id = $1 AND cliente_id = $2 AND estado = 'aprobada' LIMIT 1", [i.id, actorId]);
      if (!v) throw he(403, 'Pagá el contenido para verlo.');
    }
    return i.ruta;
  }

  async function pagar(clienteId, itemId) {
    if (!/^[0-9a-f-]{36}$/i.test(String(itemId || ''))) throw he(404, 'No encontramos ese contenido.');
    const { rows: [i] } = await pool.query(
      'SELECT i.*, s.cliente_id, s.estado AS s_estado FROM solicitud_items i JOIN solicitudes s ON s.id = i.solicitud_id WHERE i.id = $1', [itemId]);
    if (!i || i.cliente_id !== clienteId) throw he(404, 'No encontramos ese contenido.');
    if (i.estado !== 'listo' || i.borrado) throw he(409, i.estado === 'procesando' ? 'Todavía se está procesando.' : 'Este contenido venció.');
    const { rows: [ya] } = await pool.query("SELECT 1 FROM ventas_contenido WHERE solicitud_item_id = $1 AND cliente_id = $2 AND estado = 'aprobada' LIMIT 1", [i.id, clienteId]);
    if (ya) throw he(409, 'Ya pagaste este contenido.');
    return contenido.pagarItemPedido({ clienteId, item: i, solicitudId: i.solicitud_id });
  }
  // Al volver de Mercado Pago: confirma los pagos abiertos de los contenidos de este pedido.
  async function verificarPagos(clienteId, id, { paymentId = null } = {}) {
    const s = await propia(ROL.cliente, clienteId, id);
    const { rows } = await pool.query(
      `SELECT DISTINCT i.id FROM solicitud_items i JOIN ventas_contenido v ON v.solicitud_item_id = i.id
        WHERE i.solicitud_id = $1 AND v.cliente_id = $2 AND v.estado IN ('pendiente', 'en_proceso')`, [s.id, clienteId]);
    for (const r of rows) await contenido.verificarItemPedido(clienteId, r.id, { paymentId });
    return { ok: true };
  }

  // Vencimientos: a 1 mes del pago (sin pagar, a 1 mes de enviado) se borran los archivos.
  async function vencer() {
    const { rows } = await pool.query(
      `SELECT id, ruta, ruta_preview FROM solicitud_items
        WHERE borrado IS NULL AND ((pagado IS NOT NULL AND COALESCE(vence, pagado + interval '1 month') <= now())
           OR (pagado IS NULL AND creado + interval '1 month' <= now()))
        LIMIT 500`);
    for (const i of rows) {
      await storage.borrarPrivado(i.ruta).catch(() => {});
      await storage.borrarPrivado(i.ruta_preview).catch(() => {});
      await pool.query("UPDATE solicitud_items SET estado = 'vencido', borrado = now(), ruta = NULL, ruta_preview = NULL WHERE id = $1", [i.id]);
    }
    if (rows.length) log(`pedidos: ${rows.length} contenidos vencidos borrados`);
    return rows.length;
  }

  // Ventas del panel de la acompañante y de Admin ya salen de ventas_contenido (tipo 'pedido').
  return {
    listar, contarNoLeidos, detalle, crear, aceptar: (c, id) => responder(c, id, true), rechazar: (c, id) => responder(c, id, false),
    mensaje, cerrar, subirItem, procesarVideo, recuperar, archivo, pagar, verificarPagos, vencer,
    nuevoId: () => crypto.randomUUID(),
  };
}
