// Compresión y caché HTTP para lo que más pesa del sitio: el JS/CSS del SPA, su cáscara HTML y /api/sitio/estado.
// Express no trae compresión y no agregamos dependencias: brotli/gzip con node:zlib, calculados una sola vez por
// contenido (se guardan en memoria junto al buffer original). Cloudflare también comprime, pero no dependemos de eso.
import crypto from 'node:crypto';
import zlib from 'node:zlib';

const MIN = 1024; // por debajo de 1 KB no vale la pena comprimir

// Mejor codificación aceptada por el navegador: br > gzip > sin comprimir
export function codificacion(req) {
  const ae = String(req.headers['accept-encoding'] || '').toLowerCase();
  const acepta = (n) => new RegExp(`(^|[\\s,])${n}(;q=(?!0(\\.0*)?(\\s|,|$))[0-9.]+)?(\\s*(,|$))`).test(ae);
  if (acepta('br')) return 'br';
  if (acepta('gzip')) return 'gzip';
  return null;
}

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
    if (enc === 'br' && b.length <= 512 * 1024) return (p.br = zlib.brotliCompressSync(b, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: Math.min(calidadBr, 5), [zlib.constants.BROTLI_PARAM_SIZE_HINT]: b.length } }));
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
export function enviar(req, res, p, headers = {}) {
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.setHeader('ETag', p.etag);
  res.setHeader('Vary', 'Accept-Encoding');
  if (fresco(req, p.etag)) return res.status(304).end();
  const enc = codificacion(req);
  const cuerpo = p.cod(enc);
  if (cuerpo) res.setHeader('Content-Encoding', enc);
  const out = cuerpo || p.buf;
  res.setHeader('Content-Length', out.length);
  if (req.method === 'HEAD') return res.status(200).end();
  return res.status(200).end(out);
}
