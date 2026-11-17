// Historias destacadas (como las de Instagram): círculos con nombre que quedan fijos en el perfil.
// Decisión de Juan (12/11/2026): las historias vencidas se borran, así que una destacada no se arma con historias
// viejas: la acompañante sube directamente desde su dispositivo lo que quiere mostrar (foto o video).
// - Cantidad por plan: LIMITES[plan].destacadas (Bronce 1, Plata 2, Oro 5, Star ilimitadas).
// - Si baja de plan, en el perfil se ven las primeras que entran (por fecha de creación) y el resto queda guardado
//   (en su panel figura "no se ve: supera el límite de tu plan").
// - Nombre hasta 16 caracteres; hasta 100 elementos por destacada; no vencen.
// - Portada (17/11/2026, pedido de Juan, como "Editar portada" de Instagram; migración 250):
//     automática  el primer elemento listo (si es un video, su portada), como hasta ahora;
//     de un elemento  una foto de ESA destacada (o la portada de uno de sus videos ya listo);
//     subida aparte   una imagen de su dispositivo: procesarPortada (sin metadatos, cuadrada al centro, marca de agua).
//   Si se borra el elemento elegido vuelve la automática (ON DELETE SET NULL). El archivo subido se borra al cambiar la
//   portada, al volver a la automática y al borrar la destacada.
// - Fotos: el mismo proceso que las fotos de las historias. Videos: la misma cola que las historias en video (lib/videos.js,
//   hasta 60 s, solo con almacenamiento externo).
// - Borrar una destacada o un elemento borra sus archivos.
import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import { ImagenInvalida, procesarFoto, procesarPortada } from './imagenes.js';
import { limitesDe, planEfectivo, planesEfectivos } from './planes-ref.js';

export const TITULO_MAX = 16;
export const MAX_ITEMS = 100;

export class DestacadaError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const he = (status, msg) => new DestacadaError(status, msg);

const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;

export function validarTitulo(v) {
  const t = String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return { error: 'Ponele un nombre a la destacada.' };
  if ([...t].length > TITULO_MAX) return { error: `El nombre puede tener hasta ${TITULO_MAX} caracteres.` };
  return { valor: t };
}

export const itemJson = (x) => ({
  id: x.id, tipo: x.tipo || 'foto', estado: x.estado || 'listo', url: x.url || null, urlMini: x.url_mini || x.url || null,
  segundos: x.segundos == null ? null : Number(x.segundos), ancho: x.ancho ?? null, alto: x.alto ?? null, error: x.error || null, creado: x.creado,
});

// Portada elegida (null = automática). items: los elementos de esa destacada (filas).
// Panel: { tipo: 'item', itemId, url } | { tipo: 'subida', url }. En el sitio público solo va la URL.
function portadaDe(d, items) {
  if (d.portada_url) return { tipo: 'subida', url: d.portada_url };
  if (!d.portada_item) return null;
  const it = items.find((x) => x.id === d.portada_item && (x.estado || 'listo') === 'listo');
  return it ? { tipo: 'item', itemId: it.id, url: it.url_mini || it.url } : null;
}

export function createDestacadas({ pool, storage, videos = () => null, planes = () => null, invalidar = () => {}, log = () => {} }) {
  const vids = () => (typeof videos === 'function' ? videos() : videos);
  const limite = async (cuentaId) => limitesDe(await planEfectivo(cuentaId, planes())).destacadas;

  async function borrarClave(clave) {
    if (!clave) return;
    try { await storage.del(clave); } catch (e) { log('destacada: no se pudo borrar el archivo', clave, e.code || e.message); }
  }

  async function borrarArchivos(items) {
    for (const it of items) {
      for (const clave of [it.clave, it.clave_mini]) {
        if (!clave) continue;
        try { await storage.del(clave); } catch (e) { log('destacada: no se pudo borrar el archivo', clave, e.code || e.message); }
      }
      if (it.tipo === 'video' && vids() && vids().rutaTemporal) await fsp.rm(vids().rutaTemporal(it.id), { force: true }).catch(() => {});
    }
  }

  // Panel: todas, con sus elementos (también los que se procesan o fallaron) y si se ven en el perfil.
  async function listar(cuentaId) {
    const [lim, { rows: ds }, { rows: its }] = await Promise.all([
      limite(cuentaId),
      pool.query('SELECT id, titulo, creado, portada_item, portada_url FROM destacadas WHERE cuenta_id = $1 ORDER BY creado, id', [cuentaId]),
      pool.query('SELECT * FROM destacada_items WHERE cuenta_id = $1 ORDER BY creado, id', [cuentaId]),
    ]);
    const de = new Map(ds.map((d) => [d.id, []]));
    for (const it of its) if (de.has(it.destacada_id)) de.get(it.destacada_id).push(it);
    return {
      limite: lim,
      usadas: ds.length,
      destacadas: ds.map((d, i) => ({
        id: d.id, titulo: d.titulo, creado: d.creado, visible: lim === null || i < lim,
        portada: portadaDe(d, de.get(d.id)), items: de.get(d.id).map(itemJson),
      })),
    };
  }

  async function crear(cuentaId, titulo) {
    const v = validarTitulo(titulo); if (v.error) throw he(400, v.error);
    const lim = await limite(cuentaId);
    // El cupo se controla en la misma consulta: dos pedidos simultáneos no pueden pasarlo.
    const { rows } = await pool.query(
      `INSERT INTO destacadas (cuenta_id, titulo)
       SELECT $1, $2 WHERE $3::int IS NULL OR (SELECT count(*) FROM destacadas WHERE cuenta_id = $1) < $3::int
       RETURNING id, titulo, creado`,
      [cuentaId, v.valor, lim],
    );
    if (!rows[0]) throw he(400, `Tu plan permite ${plural(lim, 'destacada', 'destacadas')}. Subí de plan para sumar más.`);
    invalidar();
    return { id: rows[0].id, titulo: rows[0].titulo, creado: rows[0].creado, portada: null, items: [] };
  }

  async function renombrar(cuentaId, id, titulo) {
    const v = validarTitulo(titulo); if (v.error) throw he(400, v.error);
    const { rowCount } = await pool.query('UPDATE destacadas SET titulo = $3, actualizado = now() WHERE id = $1 AND cuenta_id = $2', [id, cuentaId, v.valor]);
    if (!rowCount) throw he(404, 'No encontramos esa destacada.');
    invalidar();
    return { ok: true };
  }

  async function borrar(cuentaId, id) {
    const { rows: its } = await pool.query('SELECT id, tipo, clave, clave_mini FROM destacada_items WHERE destacada_id = $1 AND cuenta_id = $2', [id, cuentaId]);
    const { rows } = await pool.query('DELETE FROM destacadas WHERE id = $1 AND cuenta_id = $2 RETURNING portada_clave', [id, cuentaId]);
    if (!rows[0]) throw he(404, 'No encontramos esa destacada.');
    await borrarArchivos(its);
    await borrarClave(rows[0].portada_clave);
    invalidar();
    return { ok: true };
  }

  async function propia(cuentaId, destId) {
    const { rows } = await pool.query('SELECT id FROM destacadas WHERE id = $1 AND cuenta_id = $2', [destId, cuentaId]);
    if (!rows[0]) throw he(404, 'No encontramos esa destacada.');
  }
  const cupoItems = async (destId) => {
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM destacada_items WHERE destacada_id = $1 AND estado <> 'error'", [destId]);
    if (rows[0].n >= MAX_ITEMS) throw he(400, `Una destacada puede tener hasta ${MAX_ITEMS} fotos y videos.`);
  };

  async function agregarFoto(cuentaId, destId, buffer) {
    await propia(cuentaId, destId);
    await cupoItems(destId);
    let img;
    try { img = await procesarFoto(buffer); } catch (e) { if (e instanceof ImagenInvalida) throw he(400, e.message); throw e; }
    const id = crypto.randomUUID();
    const clave = `d/${id}.webp`; const claveMini = `d/${id}-m.webp`;
    const url = await storage.put(clave, img.grande.buffer, img.grande.tipo);
    const urlMini = await storage.put(claveMini, img.mini.buffer, img.mini.tipo);
    const { rows } = await pool.query(
      `INSERT INTO destacada_items (id, destacada_id, cuenta_id, tipo, estado, clave, clave_mini, url, url_mini, ancho, alto)
       SELECT $1, $2, $3, 'foto', 'listo', $4, $5, $6, $7, $8, $9
        WHERE EXISTS (SELECT 1 FROM destacadas WHERE id = $2 AND cuenta_id = $3)
       RETURNING *`,
      [id, destId, cuentaId, clave, claveMini, url, urlMini, img.grande.ancho ?? null, img.grande.alto ?? null],
    );
    if (!rows[0]) { await borrarArchivos([{ id, tipo: 'foto', clave, clave_mini: claveMini }]); throw he(404, 'No encontramos esa destacada.'); }
    await pool.query('UPDATE destacadas SET actualizado = now() WHERE id = $1', [destId]);
    invalidar();
    return itemJson(rows[0]);
  }

  // Video: la ruta ya guardó el archivo temporal con este id; acá se crea la fila 'procesando' y se encola.
  async function agregarVideo(cuentaId, destId, itemId) {
    await propia(cuentaId, destId);
    await cupoItems(destId);
    const { rows } = await pool.query(
      `INSERT INTO destacada_items (id, destacada_id, cuenta_id, tipo, estado)
       SELECT $1, $2, $3, 'video', 'procesando' WHERE EXISTS (SELECT 1 FROM destacadas WHERE id = $2 AND cuenta_id = $3)
       RETURNING *`,
      [itemId, destId, cuentaId],
    );
    if (!rows[0]) throw he(404, 'No encontramos esa destacada.');
    vids().encolar('d:' + itemId);
    return itemJson(rows[0]);
  }

  async function borrarItem(cuentaId, itemId) {
    const { rows } = await pool.query('DELETE FROM destacada_items WHERE id = $1 AND cuenta_id = $2 RETURNING id, tipo, clave, clave_mini', [itemId, cuentaId]);
    if (!rows[0]) throw he(404, 'No encontramos ese elemento.');
    await borrarArchivos(rows);
    invalidar();
    return { ok: true };
  }

  // --- Portada ---
  // Cambia la portada de una destacada suya y devuelve la clave del archivo subido que tenía antes (para borrarlo).
  // La fila se bloquea para leer la anterior: dos cambios simultáneos no dejan un archivo huérfano.
  async function cambiarPortada(cuentaId, destId, { item = null, clave = null, url = null }) {
    const { rows } = await pool.query(
      `UPDATE destacadas d SET portada_item = $3, portada_clave = $4, portada_url = $5, actualizado = now()
         FROM (SELECT id, portada_clave FROM destacadas WHERE id = $1 AND cuenta_id = $2 FOR UPDATE) antes
        WHERE d.id = antes.id
          AND ($3::uuid IS NULL OR EXISTS (SELECT 1 FROM destacada_items WHERE id = $3 AND destacada_id = $1 AND cuenta_id = $2 AND estado = 'listo'))
       RETURNING antes.portada_clave AS vieja`,
      [destId, cuentaId, item, clave, url],
    );
    if (!rows[0]) return { ok: false };
    if (rows[0].vieja && rows[0].vieja !== clave) await borrarClave(rows[0].vieja);
    invalidar();
    return { ok: true };
  }
  async function portadaActual(cuentaId, destId) {
    const { rows: [d] } = await pool.query('SELECT id, portada_item, portada_url FROM destacadas WHERE id = $1 AND cuenta_id = $2', [destId, cuentaId]);
    if (!d) return null;
    const { rows: its } = d.portada_item ? await pool.query('SELECT * FROM destacada_items WHERE id = $1', [d.portada_item]) : { rows: [] };
    return portadaDe(d, its);
  }

  // Uno de los elementos de esa destacada (foto, o un video ya listo: se usa su portada).
  async function portadaDeItem(cuentaId, destId, itemId) {
    await propia(cuentaId, destId);
    const { rows: [it] } = await pool.query('SELECT estado FROM destacada_items WHERE id = $1 AND destacada_id = $2 AND cuenta_id = $3', [itemId, destId, cuentaId]);
    if (!it) throw he(404, 'No encontramos ese elemento.');
    if (it.estado !== 'listo') throw he(400, 'Elegí una foto o un video que ya esté listo.');
    if (!(await cambiarPortada(cuentaId, destId, { item: itemId })).ok) throw he(404, 'No encontramos ese elemento.');
    return { ok: true, portada: await portadaActual(cuentaId, destId) };
  }

  // Una imagen de su dispositivo: mismo proceso que las fotos públicas, cuadrada (en el perfil se ve en un círculo).
  async function subirPortada(cuentaId, destId, buffer) {
    await propia(cuentaId, destId);
    let img;
    try { img = await procesarPortada(buffer); } catch (e) { if (e instanceof ImagenInvalida) throw he(400, e.message); throw e; }
    const clave = `d/p-${crypto.randomUUID()}.webp`;
    const url = await storage.put(clave, img.buffer, img.tipo);
    if (!(await cambiarPortada(cuentaId, destId, { clave, url })).ok) { await borrarClave(clave); throw he(404, 'No encontramos esa destacada.'); }
    return { ok: true, portada: { tipo: 'subida', url } };
  }

  // Vuelve a la automática (el primer elemento).
  async function portadaAutomatica(cuentaId, destId) {
    if (!(await cambiarPortada(cuentaId, destId, {})).ok) throw he(404, 'No encontramos esa destacada.');
    return { ok: true, portada: null };
  }

  // Sitio público: por acompañante, solo las que entran en su plan y con elementos listos (las vacías no se muestran).
  async function publicas(ids, planesMap) {
    const out = new Map();
    if (!ids.length) return out;
    const [{ rows: ds }, { rows: its }] = await Promise.all([
      pool.query('SELECT id, cuenta_id, titulo, creado, portada_item, portada_url FROM destacadas WHERE cuenta_id = ANY($1) ORDER BY cuenta_id, creado, id', [ids]),
      pool.query("SELECT * FROM destacada_items WHERE cuenta_id = ANY($1) AND estado = 'listo' ORDER BY creado, id", [ids]),
    ]);
    const itemsDe = new Map();
    for (const it of its) { if (!itemsDe.has(it.destacada_id)) itemsDe.set(it.destacada_id, []); itemsDe.get(it.destacada_id).push(it); }
    const porCuenta = new Map();
    for (const d of ds) { if (!porCuenta.has(d.cuenta_id)) porCuenta.set(d.cuenta_id, []); porCuenta.get(d.cuenta_id).push(d); }
    const pm = planesMap || await planesEfectivos(ids, planes());
    for (const [cuentaId, lista] of porCuenta) {
      const lim = limitesDe(pm.get(cuentaId) || 'E').destacadas;
      const vis = lim === null ? lista : lista.slice(0, lim);
      // portada: la URL de la que eligió (null = automática: el primer elemento)
      const pub = vis.map((d) => ({
        id: d.id, titulo: d.titulo, creado: d.creado, portada: (portadaDe(d, itemsDe.get(d.id) || []) || {}).url || null,
        items: (itemsDe.get(d.id) || []).map((x) => ({
          id: x.id, tipo: x.tipo, url: x.url, urlMini: x.url_mini || x.url, creado: x.creado,
          ...(x.tipo === 'video' ? { segundos: x.segundos == null ? null : Number(x.segundos), ancho: x.ancho, alto: x.alto } : {}),
        })),
      })).filter((d) => d.items.length);
      if (pub.length) out.set(cuentaId, pub);
    }
    return out;
  }

  return { listar, crear, renombrar, borrar, agregarFoto, agregarVideo, borrarItem, portadaDeItem, subirPortada, portadaAutomatica, publicas, limite };
}
