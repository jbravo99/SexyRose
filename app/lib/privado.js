// Archivos privados (selfie, documento, comprobantes): viven en ${DATA_DIR}/privado/..., nunca en /media ni en el CDN.
// Las rutas guardadas en la base son RELATIVAS a ${DATA_DIR}/privado (ej. "comprobantes/2026/11/<uuid>.jpg").
// Si el agente A trae su propio helper con la misma idea, se puede reemplazar: la interfaz es
//   guardar(subdir, buffer, ext) → ruta relativa;  abrir(ruta) → { stream, size, tipo } | null.
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const TIPOS = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf', heic: 'image/heic' };

// Detecta el tipo real por los primeros bytes (no confía en el nombre ni en el Content-Type del navegador).
export function tipoPorFirma(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (buf.subarray(4, 8).toString('latin1') === 'ftyp' && /^(heic|heix|mif1|msf1|hevc)/.test(buf.subarray(8, 12).toString('latin1'))) return 'heic';
  return null;
}

export function createPrivado({ dataDir }) {
  const base = path.resolve(dataDir, 'privado');
  const resolver = (ruta) => {
    if (typeof ruta !== 'string' || !ruta || ruta.includes('\0') || path.isAbsolute(ruta)) return null;
    const abs = path.resolve(base, ruta);
    return abs.startsWith(base + path.sep) ? abs : null;
  };
  return {
    base,
    async guardar(subdir, buffer, ext) {
      if (!/^[a-z0-9-]+$/.test(subdir) || !TIPOS[ext]) throw new Error('privado: subdir o tipo inválido');
      const d = new Date();
      const rel = path.posix.join(subdir, String(d.getUTCFullYear()), String(d.getUTCMonth() + 1).padStart(2, '0'),
        `${crypto.randomUUID()}.${ext}`);
      const abs = resolver(rel);
      await fsp.mkdir(path.dirname(abs), { recursive: true, mode: 0o700 });
      await fsp.writeFile(abs, buffer, { mode: 0o600, flag: 'wx' });
      return rel;
    },
    async abrir(ruta) {
      const abs = resolver(ruta);
      if (!abs) return null;
      try {
        const st = await fsp.stat(abs);
        if (!st.isFile()) return null;
        const ext = path.extname(abs).slice(1).toLowerCase();
        return { stream: fs.createReadStream(abs), size: st.size, tipo: TIPOS[ext] || 'application/octet-stream' };
      } catch {
        return null;
      }
    },
  };
}
