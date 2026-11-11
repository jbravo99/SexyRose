// Compresión y caché HTTP para lo que más pesa del sitio: el JS/CSS del SPA, su cáscara HTML y /api/sitio/estado.
// Express no trae compresión y no agregamos dependencias: brotli/gzip con node:zlib, calculados una sola vez por
// contenido (se guardan en memoria junto al buffer original). Cloudflare también comprime, pero no dependemos de eso.
import crypto from 'node:crypto';
import zlib from 'node:zlib';

const MIN = 1024; // por debajo de 1 KB no vale la pena comprimir

// Mejor codificación aceptada por el navegador: br > gzip > sin comprimir
const acepta = (req, n) => new RegExp(`(^|[\\s,])${n}(;q=(?!0(\\.0*)?(\\s|,|$))[0-9.]+)?(\\s*(,|$))`).test(String(req.headers['accept-encoding'] || '').toLowerCase());
export function codificacion(req) {
  if (acepta(req, 'br')) return 'br';
  if (acepta(req, 'gzip')) return 'gzip';
  return null;
}
const MAX_BR_SYNC = 512 * 1024; // brotli en el momento solo hasta acá (más grande espera al de segundo plano)

export const etagDe = (buf) => '"' + crypto.createHash('sha256').update(buf).digest('base64url').slice(0, 27) + '"';

// Paquete listo para servir: buffer original, ETag y versiones comprimidas.
// - preparar(): calcula brotli (calidad alta) y gzip en segundo plano (sin bloquear el proceso), para archivos grandes
//   que se sirven muchas veces (el JS del sitio).
// - Si llega un pedido antes de que estén listas, se usa gzip rápido en el momento (y queda guardado).
export function paquete(buf, { calidadBr = 11 } = {}) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf), 'utf8');
  const p = { buf: b, etag: etagDe(b), br: null, gzip: null, listo: null };
  p.preparar = () => (p.listo ||= Promise.all([
    new Promise((ok) => zlib.brotliCompress(b, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: calidadBr, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: b.length } }, (e, r) => { if (!e) p.br = r; ok(); })),
    new Promise((ok) => zlib.gzip(b, { level: 9 }, (e, r) => { if (!e) p.gzip = r; ok(); })),
  ]).then(() => p));
  p.cod = (enc) => {
    if (!enc || b.length < MIN) return null;
    if (enc === 'br' && p.br) return p.br;
    if (enc === 'br' && b.length <= MAX_BR_SYNC) return (p.br = zlib.brotliCompressSync(b, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: Math.min(calidadBr, 5), [zlib.constants.BROTLI_PARAM_SIZE_HINT]: b.length } }));
    // Pidió brotli de un archivo grande que todavía no está listo: nada (nunca gzip con la cabecera de brotli)
    if (enc !== 'gzip') return null;
    if (p.gzip) return p.gzip;
    return (p.gzip = zlib.gzipSync(b, { level: 6 }));
  };
  return p;
}

// ¿El navegador ya tiene esta versión? (If-None-Match con nuestro ETag, débil o fuerte)
export function fresco(req, etag) {
  const inm = req.headers['if-none-match'];
  if (!inm) return false;
  return String(inm).split(',').map((s) => s.trim().replace(/^W\//, '')).some((t) => t === etag || t === '*');
}

// Envía un paquete con ETag, 304 y la mejor codificación. headers: Content-Type, Cache-Control, etc.
// status: 200 por defecto; con otro (404 de una página que no existe) no hay 304.
export function enviar(req, res, p, headers = {}, status = 200) {
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.setHeader('ETag', p.etag);
  res.setHeader('Vary', 'Accept-Encoding');
  if (status === 200 && fresco(req, p.etag)) return res.status(304).end();
  let enc = codificacion(req);
  // Archivo grande con el brotli todavía en preparación (recién arrancado o recién publicado): gzip si lo acepta
  if (enc === 'br' && !p.br && p.buf.length > MAX_BR_SYNC) enc = acepta(req, 'gzip') ? 'gzip' : null;
  const cuerpo = p.cod(enc);
  if (cuerpo) res.setHeader('Content-Encoding', enc);
  const out = cuerpo || p.buf;
  res.setHeader('Content-Length', out.length);
  if (req.method === 'HEAD') return res.status(status).end();
  return res.status(status).end(out);
}
