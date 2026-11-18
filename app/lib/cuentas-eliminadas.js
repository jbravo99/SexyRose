// Eliminar la cuenta de una acompañante desde el admin (18/11/2026, pedido de Juan) y registro de cuentas eliminadas.
//
// Se borra TODO lo de la cuenta: la fila de `cuentas` arrastra (ON DELETE CASCADE) perfil, fotos, videos, clip de la
// tarjeta, historias, destacadas, verificaciones, sesiones, tokens, pedidos y suscripciones, créditos (libro, saldo y
// pedidos), Destacados, packs y sus ventas, pedidos personalizados con sus chats, conexión de Mercado Pago y Mis números.
// Los archivos se borran después de confirmar la transacción, igual que los borrados que ya existían: públicos en
// bunny.net o en el disco (storage.del), privados del disco (verificación y contenidos de pedidos con
// storage.borrarPrivado; comprobantes con privado.borrar) y los temporales de videos que se estaban procesando.
//
// Queda (porque así lo hace el código de antes, no se agrega nada): los chats del asistente de WhatsApp (cuenta_id pasa
// a NULL; se limpian solos a los 90 días), el contacto de captación (cuenta_id NULL), el registro de acciones del admin
// (admin_acciones, con el id de la cuenta como texto) y los totales diarios del sitio (sin datos personales).
// Además queda una fila en `cuentas_eliminadas` (db/260): fecha, email, WhatsApp, nombre artístico, nombre completo,
// motivo y quién la eliminó.
//
// Email a la acompañante: "tu cuenta fue eliminada; si querés saber el motivo, escribinos por WhatsApp" (el número del
// chip del asistente; sin número, contacto@). Si el email falla, la cuenta queda eliminada igual (se registra en el log).
import fsp from 'node:fs/promises';
import { texto } from './perfiles.js';

export const MOTIVO_MIN = 10;
export const MOTIVO_MAX = 500;
const largo = (s) => [...s].length;

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; this.expose = true; } }

// Motivo: texto de 10 a 500 caracteres (saltos de línea normalizados). { valor } o { error }.
export function validarMotivo(v) {
  const t = texto(v);
  if (!t) return { error: 'Escribí el motivo: queda guardado por si después pregunta.' };
  if (largo(t) < MOTIVO_MIN) return { error: `El motivo es muy corto: mínimo ${MOTIVO_MIN} caracteres.` };
  if (largo(t) > MOTIVO_MAX) return { error: `El motivo es muy largo: máximo ${MOTIVO_MAX} caracteres.` };
  return { valor: t };
}

// WhatsApp tal como se guarda en el registro: +dígitos (o null).
export function whatsappRegistro(v) {
  const d = String(v || '').replace(/\D/g, '');
  return d.length >= 8 && d.length <= 15 ? '+' + d : null;
}

// Texto del email (sin detalles internos). numero: dígitos del WhatsApp del sitio o ''. tenia: si tenía WhatsApp en el perfil.
export function emailEliminada({ numero = '', tenia = false, contacto = 'contacto@sexyrose.net' } = {}) {
  const parrafos = ['Tu cuenta de SexyRose fue eliminada. Tu perfil ya no se ve en el sitio y no vas a poder volver a entrar con esta cuenta.'];
  if (numero) {
    parrafos.push(`Si querés saber el motivo, escribinos por WhatsApp al +${numero}${tenia ? ', desde el número que tenías en tu perfil' : ''}: https://wa.me/${numero}`);
  } else {
    parrafos.push(`Si querés saber el motivo, escribinos a ${contacto}.`);
  }
  return { subject: 'Tu cuenta de SexyRose fue eliminada', titulo: 'Tu cuenta fue eliminada', parrafos, pie: 'Este es un mensaje automático de SexyRose.' };
}

export function createCuentasEliminadas({ pool, storage, privado = null, videos = null, creditos = null, sendMail = null, emailBasico = null, contactEmail = 'contacto@sexyrose.net', invalidar = () => {}, log = () => {} }) {
  const borrarPublico = async (clave) => {
    if (!clave) return;
    try { await storage.del(clave); } catch (e) { log('eliminar cuenta: no se pudo borrar un archivo', e.code || e.message); }
  };
  const borrarPrivadoStorage = async (rel) => {
    if (!rel) return;
    try { await storage.borrarPrivado(rel); } catch (e) { log('eliminar cuenta: no se pudo borrar un archivo privado', e.code || e.message); }
  };
  const borrarComprobante = async (rel) => {
    if (!rel || !privado) return;
    try { await privado.borrar(rel); } catch (e) { log('eliminar cuenta: no se pudo borrar un comprobante', e.code || e.message); }
  };
  const borrarTemporal = async (id) => {
    if (!videos || !videos.rutaTemporal) return;
    await fsp.rm(videos.rutaTemporal(id), { force: true }).catch(() => {});
  };

  // Elimina la cuenta. Devuelve { registro, mail } (mail: true si se mandó). 404 si la cuenta no existe.
  async function eliminar(cuentaId, { motivo, por = null } = {}) {
    const m = validarMotivo(motivo);
    if (m.error) throw new HttpError(400, m.error);
    const db = await pool.connect();
    let cuenta; let archivos; let registro;
    try {
      await db.query('BEGIN');
      const { rows: [c] } = await db.query(
        `SELECT c.id, c.email, c.nombre_completo, p.datos->>'displayName' AS nombre, p.datos->>'whatsapp' AS whatsapp,
                (SELECT v.nombre_completo FROM verificaciones v WHERE v.cuenta_id = c.id AND v.nombre_completo IS NOT NULL ORDER BY v.creado DESC LIMIT 1) AS nombre_enviado
           FROM cuentas c LEFT JOIN perfiles p ON p.cuenta_id = c.id WHERE c.id = $1 FOR UPDATE OF c`, [cuentaId]);
      if (!c) throw new HttpError(404, 'Cuenta no encontrada.');
      cuenta = c;
      // Archivos a borrar después de confirmar (las filas desaparecen con la cuenta)
      // (una consulta por vez: es la conexión de la transacción)
      const leidas = [];
      for (const sql of [
        'SELECT clave, clave_mini FROM fotos WHERE cuenta_id = $1',
        'SELECT id, clave, clave_mini, tipo FROM historias WHERE cuenta_id = $1',
        'SELECT id, clave_mp4, clave_poster FROM videos WHERE cuenta_id = $1',
        'SELECT clave FROM previews WHERE cuenta_id = $1',
        'SELECT id, clave, clave_mini, tipo FROM destacada_items WHERE cuenta_id = $1',
        'SELECT portada_clave FROM destacadas WHERE cuenta_id = $1',
        'SELECT selfie_ruta, documento_ruta, dorso_ruta FROM verificaciones WHERE cuenta_id = $1',
        'SELECT ruta, ruta_preview FROM solicitud_items WHERE cuenta_id = $1',
        'SELECT comprobante_ruta FROM pedidos WHERE cuenta_id = $1 AND comprobante_ruta IS NOT NULL',
        'SELECT comprobante_ruta FROM pedidos_creditos WHERE cuenta_id = $1 AND comprobante_ruta IS NOT NULL',
      ]) leidas.push((await db.query(sql, [cuentaId])).rows);
      const [fotos, historias, vids, prev, dItems, dests, verifs, solItems, peds, pedsCred] = leidas;
      archivos = {
        publicos: [
          ...fotos.flatMap((f) => [f.clave, f.clave_mini]), ...historias.flatMap((h) => [h.clave, h.clave_mini]),
          ...vids.flatMap((v) => [v.clave_mp4, v.clave_poster]), ...prev.map((p) => p.clave),
          ...dItems.flatMap((i) => [i.clave, i.clave_mini]), ...dests.map((d) => d.portada_clave),
        ].filter(Boolean),
        privados: [...verifs.flatMap((v) => [v.selfie_ruta, v.documento_ruta, v.dorso_ruta]), ...solItems.flatMap((i) => [i.ruta, i.ruta_preview])].filter(Boolean),
        comprobantes: [...peds, ...pedsCred].map((p) => p.comprobante_ruta).filter(Boolean),
        temporales: [...vids.map((v) => v.id), ...historias.filter((h) => h.tipo === 'video').map((h) => h.id), ...dItems.filter((i) => i.tipo === 'video').map((i) => i.id)],
      };
      const { rows: [r] } = await db.query(
        `INSERT INTO cuentas_eliminadas (email, whatsapp, nombre_artistico, nombre_completo, motivo, por)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [c.email, whatsappRegistro(c.whatsapp), c.nombre || null, c.nombre_completo || c.nombre_enviado || null, m.valor, por || null]);
      registro = r;
      await db.query('DELETE FROM cuentas WHERE id = $1', [cuentaId]);
      await db.query('COMMIT');
    } catch (e) {
      await db.query('ROLLBACK').catch(() => {});
      throw e;
    } finally { db.release(); }

    for (const k of new Set(archivos.publicos)) await borrarPublico(k);
    for (const k of new Set(archivos.privados)) await borrarPrivadoStorage(k);
    for (const k of new Set(archivos.comprobantes)) await borrarComprobante(k);
    for (const id of archivos.temporales) await borrarTemporal(id);
    try { invalidar(); } catch { /* */ }
    log('admin: cuenta eliminada', registro.id, 'por', por || '-', `(${archivos.publicos.length} archivos públicos, ${archivos.privados.length + archivos.comprobantes.length} privados)`);

    const mail = await avisar(cuenta);
    return { registro: registroJson(registro), mail };
  }

  // Email a la acompañante. Nunca hace fallar la eliminación.
  async function avisar(c) {
    if (!sendMail) return false;
    try {
      let numero = '';
      if (creditos && creditos.contacto) numero = String((await creditos.contacto()).whatsapp || '').replace(/\D/g, '');
      const e = emailEliminada({ numero, tenia: Boolean(whatsappRegistro(c.whatsapp)), contacto: contactEmail });
      const cuerpo = emailBasico ? emailBasico({ titulo: e.titulo, parrafos: e.parrafos, pie: e.pie }) : { text: [e.titulo, '', ...e.parrafos].join('\n\n') };
      const r = await sendMail({ to: c.email, subject: e.subject, text: cuerpo.text, html: cuerpo.html });
      if (r && r.ok === false && !r.simulado) { log('eliminar cuenta: el email no salió', r.status || ''); return false; }
      return true;
    } catch (e) {
      log('eliminar cuenta: no se pudo enviar el email:', e.code || e.message);
      return false;
    }
  }

  const registroJson = (r) => ({
    id: Number(r.id), fecha: r.fecha, email: r.email, whatsapp: r.whatsapp || null, nombreArtistico: r.nombre_artistico || null,
    nombreCompleto: r.nombre_completo || null, motivo: r.motivo, por: r.por || null,
  });

  // Lista para el admin: la más nueva primero; q busca en email, nombres y WhatsApp (por dígitos).
  async function listar({ q = '', limite = 500 } = {}) {
    const t = String(q || '').trim().slice(0, 80);
    const args = []; let where = '';
    if (t) {
      args.push('%' + t.replace(/[\\%_]/g, (x) => '\\' + x) + '%');
      const conds = ['email ILIKE $1', 'nombre_artistico ILIKE $1', 'nombre_completo ILIKE $1'];
      const dig = t.replace(/\D/g, '');
      if (dig.length >= 4) { args.push('%' + dig + '%'); conds.push("regexp_replace(COALESCE(whatsapp, ''), '\\D', '', 'g') LIKE $2"); }
      where = 'WHERE ' + conds.join(' OR ');
    }
    args.push(Math.max(1, Math.min(1000, Number(limite) || 500)));
    const { rows } = await pool.query(`SELECT * FROM cuentas_eliminadas ${where} ORDER BY fecha DESC, id DESC LIMIT $${args.length}`, args);
    const { rows: [n] } = await pool.query('SELECT count(*)::int AS n FROM cuentas_eliminadas');
    return { items: rows.map(registroJson), total: n.n };
  }

  return { eliminar, listar, avisar };
}
