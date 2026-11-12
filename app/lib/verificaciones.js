// Retención de la verificación de identidad (selfie y documento, en el disco privado).
// - Al decidir (aprobar o rechazar) se recomprimen: máx. 1280 px, JPEG calidad 70.
// - A los 3 meses (DIAS_RETENCION) de la decisión se borran los archivos; la fila queda con estado y fechas.
import fsp from 'node:fs/promises';
import sharp from 'sharp';

export const DIAS_RETENCION = 90;

export function createRetencionVerif({ pool, storage, log = () => {} }) {
  const recomprimirArchivo = async (rel) => {
    const abs = storage.rutaPrivadaAbs(rel);
    if (!abs || !/\.jpe?g$/i.test(abs)) return false;
    let buf;
    try { buf = await fsp.readFile(abs); } catch { return false; }
    const out = await sharp(buf, { failOn: 'none' })
      .rotate()
      .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 70, mozjpeg: true })
      .toBuffer();
    if (out.length >= buf.length) return true; // ya era chico: se deja como está
    const tmp = abs + '.tmp';
    await fsp.writeFile(tmp, out, { mode: 0o600 });
    await fsp.rename(tmp, abs);
    return true;
  };

  // Recomprime la selfie y el documento de una verificación ya decidida. Nunca tira: solo registra.
  async function comprimir(id) {
    try {
      const { rows } = await pool.query(
        "SELECT selfie_ruta, documento_ruta FROM verificaciones WHERE id = $1 AND estado <> 'pendiente' AND comprimido IS NULL AND archivos_borrados IS NULL", [id]);
      if (!rows[0]) return false;
      for (const rel of [rows[0].selfie_ruta, rows[0].documento_ruta]) {
        if (rel) await recomprimirArchivo(rel).catch((e) => log('verificación: no se pudo recomprimir', e.message));
      }
      await pool.query('UPDATE verificaciones SET comprimido = now() WHERE id = $1', [id]);
      return true;
    } catch (e) {
      log('verificación: compresión falló:', e.code || e.message);
      return false;
    }
  }

  // Borra los archivos de las verificaciones decididas hace más de `dias` días. Idempotente.
  async function purgar({ dias = DIAS_RETENCION } = {}) {
    try {
      const { rows } = await pool.query(
        `SELECT id, selfie_ruta, documento_ruta FROM verificaciones
          WHERE estado <> 'pendiente' AND archivos_borrados IS NULL AND revisado IS NOT NULL
            AND revisado < now() - ($1::int * interval '1 day')
          ORDER BY revisado LIMIT 500`, [dias]);
      for (const v of rows) {
        await storage.borrarPrivado(v.selfie_ruta);
        await storage.borrarPrivado(v.documento_ruta);
        await pool.query('UPDATE verificaciones SET selfie_ruta = NULL, documento_ruta = NULL, archivos_borrados = now() WHERE id = $1', [v.id]);
      }
      if (rows.length) log(`verificaciones: imágenes borradas a los ${dias} días: ${rows.length}`);
      return rows.length;
    } catch (e) {
      log('verificaciones: purga falló:', e.code || e.message);
      return 0;
    }
  }

  return { comprimir, purgar };
}
