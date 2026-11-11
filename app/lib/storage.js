// Almacenamiento de archivos.
//
// Público (fotos de perfil, historias): driver `local` (DATA_DIR/media, servido por Express en /media/...) o
// `bunny` (bunny.net Storage + CDN). Misma interfaz: put(clave, buffer, contentType) → url pública; del(clave).
//
// Privado (selfie, documento, comprobantes): siempre en DATA_DIR/privado, con nombres aleatorios. Nunca se publica:
// el admin lo ve con enviarPrivado(res, ruta), que transmite el archivo con Cache-Control: no-store.
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const st = { driver: 'local', dataDir: path.resolve('data'), cdnUrl: '', bunny: null, custom: null, log: console.log };

export function configurarStorage(config = {}) {
  st.dataDir = path.resolve(config.dataDir || st.dataDir);
  st.driver = config.storage === 'bunny' ? 'bunny' : 'local';
  st.log = config.log || st.log;
  st.custom = null;
  // Driver inyectado (solo pruebas): { put(clave, buffer, tipo) → url, del(clave), origin }. Cuenta como almacenamiento externo.
  if (config.storageDriver && typeof config.storageDriver.put === 'function') {
    st.driver = 'custom';
    st.custom = config.storageDriver;
    return { driver: st.driver };
  }
  if (st.driver === 'bunny') {
    const zone = config.bunnyStorageZone; const key = config.bunnyStorageKey;
    const host = (config.bunnyStorageHost || 'storage.bunnycdn.com').replace(/^https?:\/\//, '').replace(/\/+$/, '');
    const cdn = String(config.bunnyCdnUrl || '').replace(/\/+$/, '');
    if (!zone || !key || !cdn) {
      st.log('AVISO: STORAGE=bunny pero faltan BUNNY_STORAGE_ZONE, BUNNY_STORAGE_KEY o BUNNY_CDN_URL: se usa el disco local.');
      st.driver = 'local';
    } else {
      st.bunny = { zone, key, host };
      st.cdnUrl = cdn;
    }
  }
  return { driver: st.driver };
}

export const dataDir = () => st.dataDir;
export const mediaDir = () => path.join(st.dataDir, 'media');
export const privadoDir = () => path.join(st.dataDir, 'privado');
export const driverActual = () => st.driver;
// Origen público de las imágenes (para la CSP). '' = el propio sitio.
export const mediaOrigin = () => {
  if (st.driver === 'custom') return st.custom.origin || '';
  return st.driver === 'bunny' && st.cdnUrl ? new URL(st.cdnUrl).origin : '';
};
// Los videos solo se habilitan con almacenamiento externo (bunny.net): nunca se sirven desde el propio servidor,
// porque pasarían por el proxy de Cloudflare (el plan gratis no permite servir video).
export const videosHabilitados = () => st.driver !== 'local';

const CLAVE_RE = /^[a-z0-9][a-z0-9/_-]{0,180}\.(webp|jpg|jpeg|png|mp4)$/;
const validaClave = (clave) => {
  if (!CLAVE_RE.test(clave) || clave.includes('..') || clave.includes('//')) throw new Error('clave de archivo inválida');
};

export async function put(clave, buffer, contentType) {
  validaClave(clave);
  if (st.driver === 'custom') return st.custom.put(clave, buffer, contentType);
  if (st.driver === 'bunny') {
    const { zone, key, host } = st.bunny;
    const r = await fetch(`https://${host}/${encodeURIComponent(zone)}/${clave}`, {
      method: 'PUT',
      headers: { AccessKey: key, 'Content-Type': contentType || 'application/octet-stream' },
      body: buffer,
      // Los videos (hasta ~10 MB) pueden tardar más que una foto.
      signal: AbortSignal.timeout(buffer.length > 4 * 1024 * 1024 ? 180000 : 30000),
    });
    if (!r.ok) throw new Error(`bunny.net respondió ${r.status} al subir`);
    return `${st.cdnUrl}/${clave}`;
  }
  const abs = path.join(mediaDir(), clave);
  await fsp.mkdir(path.dirname(abs), { recursive: true });
  await fsp.writeFile(abs, buffer, { mode: 0o644 });
  return `/media/${clave}`;
}

// Lee un archivo público ya guardado (lo usa la cola de videos para recortar el clip de la tarjeta).
export async function get(clave) {
  validaClave(clave);
  if (st.driver === 'custom') {
    if (typeof st.custom.get === 'function') return st.custom.get(clave);
    throw new Error('el almacenamiento no permite leer archivos');
  }
  if (st.driver === 'bunny') {
    const { zone, key, host } = st.bunny;
    const r = await fetch(`https://${host}/${encodeURIComponent(zone)}/${clave}`, { headers: { AccessKey: key }, signal: AbortSignal.timeout(120000) });
    if (!r.ok) throw new Error(`bunny.net respondió ${r.status} al leer`);
    return Buffer.from(await r.arrayBuffer());
  }
  return fsp.readFile(path.join(mediaDir(), clave));
}

export async function del(clave) {
  if (!clave) return;
  try { validaClave(clave); } catch { return; }
  if (st.driver === 'custom') { try { await st.custom.del(clave); } catch { /* */ } return; }
  if (st.driver === 'bunny') {
    const { zone, key, host } = st.bunny;
    try {
      const r = await fetch(`https://${host}/${encodeURIComponent(zone)}/${clave}`, { method: 'DELETE', headers: { AccessKey: key }, signal: AbortSignal.timeout(15000) });
      if (!r.ok && r.status !== 404) st.log('bunny.net: no se pudo borrar', r.status);
    } catch (e) { st.log('bunny.net: no se pudo borrar', e.name); }
    return;
  }
  await fsp.rm(path.join(mediaDir(), clave), { force: true });
}

// --- Privado ---------------------------------------------------------------
const PRIV_RE = /^[a-z0-9_-]{1,40}\/[a-f0-9]{32}(-[a-z0-9]{1,20})?\.(jpg|jpeg|png|webp|pdf)$/;

// Guarda un archivo privado y devuelve su ruta relativa (lo que se guarda en la base).
export async function guardarPrivado(subdir, buffer, ext = 'jpg', sufijo = '') {
  const nombre = crypto.randomBytes(16).toString('hex') + (sufijo ? '-' + sufijo : '') + '.' + ext;
  const rel = `${subdir}/${nombre}`;
  if (!PRIV_RE.test(rel)) throw new Error('ruta privada inválida');
  const abs = path.join(privadoDir(), rel);
  await fsp.mkdir(path.dirname(abs), { recursive: true, mode: 0o700 });
  await fsp.writeFile(abs, buffer, { mode: 0o600 });
  return rel;
}

export function rutaPrivadaAbs(rel) {
  if (typeof rel !== 'string' || !PRIV_RE.test(rel)) return null;
  const abs = path.resolve(privadoDir(), rel);
  return abs.startsWith(privadoDir() + path.sep) ? abs : null;
}

export async function borrarPrivado(rel) {
  const abs = rutaPrivadaAbs(rel);
  if (abs) await fsp.rm(abs, { force: true });
}

const TIPOS = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' };

// Transmite un archivo privado (para las rutas del admin). Responde 404 si no existe.
export async function enviarPrivado(res, rel) {
  const abs = rutaPrivadaAbs(rel);
  let stat = null;
  if (abs) { try { stat = await fsp.stat(abs); } catch { stat = null; } }
  if (!stat || !stat.isFile()) return res.status(404).json({ ok: false, error: 'Archivo no encontrado.' });
  const ext = path.extname(abs).slice(1).toLowerCase();
  res.set({
    'Content-Type': TIPOS[ext] || 'application/octet-stream',
    'Content-Length': String(stat.size),
    'Cache-Control': 'no-store, private',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': 'inline',
    'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
  });
  await new Promise((resolve, reject) => {
    const s = fs.createReadStream(abs);
    s.on('error', reject);
    res.on('finish', resolve);
    res.on('close', resolve);
    s.pipe(res);
  });
}
