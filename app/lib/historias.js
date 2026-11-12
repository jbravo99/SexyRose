// Borrado de historias (fotos y videos): el admin puede borrar una historia y las vencidas se borran solas.
// Una historia vencida no queda guardada en ningún lado: se borran sus archivos (foto, video y portada) y la fila.
// Si la acompañante quiere algo fijo en su perfil, lo sube aparte (decisión de Juan, 12/11/2026).
import fsp from 'node:fs/promises';

export function createHistorias({ pool, storage, videos = null, log = () => {}, invalidar = () => {} }) {
  // Borra una historia (fila + archivos). Devuelve la fila borrada o null si no existía.
  async function borrar(id, { cuentaId = null } = {}) {
    const { rows } = cuentaId
      ? await pool.query('DELETE FROM historias WHERE id = $1 AND cuenta_id = $2 RETURNING id, cuenta_id, clave, clave_mini, tipo', [id, cuentaId])
      : await pool.query('DELETE FROM historias WHERE id = $1 RETURNING id, cuenta_id, clave, clave_mini, tipo', [id]);
    const h = rows[0];
    if (!h) return null;
    await borrarArchivos(h);
    invalidar();
    return h;
  }

  async function borrarArchivos(h) {
    for (const clave of [h.clave, h.clave_mini]) {
      if (!clave) continue;
      try { await storage.del(clave); } catch (e) { log('historia: no se pudo borrar el archivo', clave, e.code || e.message); }
    }
    if (h.tipo === 'video' && videos && videos.rutaTemporal) await fsp.rm(videos.rutaTemporal(h.id), { force: true }).catch(() => {});
  }

  // Vencidas: todas las que pasaron su hora de vencimiento (las que se están procesando no: su reloj arranca al quedar
  // listas). Se puede correr las veces que haga falta.
  async function borrarVencidas({ lote = 500 } = {}) {
    let total = 0;
    for (;;) {
      const { rows } = await pool.query(
        "DELETE FROM historias WHERE id IN (SELECT id FROM historias WHERE expira <= now() AND estado <> 'procesando' ORDER BY expira LIMIT $1) RETURNING id, cuenta_id, clave, clave_mini, tipo",
        [lote],
      );
      for (const h of rows) await borrarArchivos(h);
      total += rows.length;
      if (rows.length < lote) break;
    }
    if (total) { invalidar(); log(`historias vencidas borradas: ${total}`); }
    return total;
  }

  return { borrar, borrarVencidas };
}
