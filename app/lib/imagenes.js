// Procesamiento de imágenes con sharp.
// - Fotos públicas (perfil, historias): gira según EXIF y descarta todos los metadatos (EXIF, GPS, ICC),
//   máx. 1600 px del lado mayor, WebP calidad 82, marca de agua "SexyRose" semitransparente abajo al centro,
//   y una miniatura de 480 px (también con marca).
// - Privadas (selfie, documento, comprobante): JPEG sin metadatos, máx. 2400 px, sin marca.
// Rechaza lo que no sea imagen, más de 12 MB o más de 40 megapíxeles (bombas de descompresión).
import sharp from 'sharp';

export const MAX_BYTES = 12 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;
const FORMATOS = new Set(['jpeg', 'png', 'webp', 'heif', 'avif', 'tiff', 'gif']);

sharp.cache(false);
sharp.concurrency(2);

export class ImagenInvalida extends Error {}

async function abrir(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new ImagenInvalida('No llegó ninguna imagen.');
  if (buffer.length > MAX_BYTES) throw new ImagenInvalida('La imagen pesa más de 12 MB.');
  let meta;
  try {
    meta = await sharp(buffer, { limitInputPixels: MAX_PIXELS, failOn: 'error' }).metadata();
  } catch {
    throw new ImagenInvalida('El archivo no es una imagen válida.');
  }
  if (!FORMATOS.has(meta.format)) throw new ImagenInvalida('Formato de imagen no admitido. Usá JPG, PNG, WebP o HEIC.');
  if (!meta.width || !meta.height || meta.width < 200 || meta.height < 200) throw new ImagenInvalida('La imagen es demasiado chica (mínimo 200 × 200 px).');
  return meta;
}

// Marca de agua como SVG del ancho de la imagen.
function marcaSvg(ancho, alto) {
  const fs = Math.max(14, Math.round(ancho * 0.065));
  const h = Math.round(fs * 1.9);
  const y = Math.round(h * 0.68);
  const corazon = Math.round(fs * 0.8);
  const textoAncho = Math.round(fs * 4.9);
  const total = corazon + Math.round(fs * 0.35) + textoAncho;
  const x0 = Math.round((ancho - total) / 2);
  const cy = Math.round(y - fs * 0.35);
  const s = corazon / 24;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${h}">
  <g opacity="0.42">
    <path transform="translate(${x0},${cy - corazon / 2}) scale(${s})" fill="#FFFFFF" stroke="#000000" stroke-opacity="0.35" stroke-width="1"
      d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
    <text x="${x0 + corazon + Math.round(fs * 0.35)}" y="${y}" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-weight="700"
      font-size="${fs}" fill="#FFFFFF" stroke="#000000" stroke-opacity="0.35" stroke-width="${Math.max(1, Math.round(fs / 22))}">SexyRose</text>
  </g></svg>`;
  return { input: Buffer.from(svg), top: Math.max(0, alto - h - Math.round(alto * 0.04)), left: 0 };
}

async function variante(buffer, maxLado, calidad) {
  // rotate() sin argumentos aplica la orientación EXIF; sharp no copia metadatos salvo que se pida withMetadata().
  const base = sharp(buffer, { limitInputPixels: MAX_PIXELS, failOn: 'error' })
    .rotate()
    .resize({ width: maxLado, height: maxLado, fit: 'inside', withoutEnlargement: true });
  const { data, info } = await base.toBuffer({ resolveWithObject: true });
  const out = await sharp(data).composite([marcaSvg(info.width, info.height)]).webp({ quality: calidad }).toBuffer({ resolveWithObject: true });
  return { buffer: out.data, ancho: out.info.width, alto: out.info.height, tipo: 'image/webp', ext: 'webp' };
}

export async function procesarFoto(buffer) {
  await abrir(buffer);
  const grande = await variante(buffer, 1600, 82);
  const mini = await variante(buffer, 480, 78);
  return { grande, mini };
}

export async function procesarPrivada(buffer) {
  await abrir(buffer);
  const { data, info } = await sharp(buffer, { limitInputPixels: MAX_PIXELS, failOn: 'error' })
    .rotate()
    .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  return { buffer: data, ancho: info.width, alto: info.height, tipo: 'image/jpeg', ext: 'jpg' };
}
