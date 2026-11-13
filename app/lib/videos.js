// Videos de la galería (hasta 30 s), procesados en el servidor con ffmpeg y publicados en el almacenamiento externo
// (bunny.net). Nunca se sirven desde el propio servidor: pasarían por el proxy de Cloudflare (lib/storage.js
// videosHabilitados()).
//
// Proceso de cada video (uno por vez, en una cola dentro del proceso):
//   1. ffprobe: tiene que haber una pista de video, durar como máximo 31 s y tener dimensiones razonables.
//   2. ffmpeg: H.264 (yuv420p) de hasta 720 px del lado mayor, CRF 26 con tope de 2,5 Mbps, AAC 96 kbps (o sin
//      audio si no tiene), +faststart (reproduce antes de bajar todo), sin metadatos (ni ubicación ni equipo),
//      girado según la matriz de rotación del celular, con la marca de agua "SexyRose" (la misma de las fotos).
//   3. Portada WebP de un cuadro cerca del segundo 1 (sale del video ya marcado).
//   4. Sube v/<id>.mp4 y v/<id>.webp, borra el temporal y marca el video como listo (o error con el motivo).
// ffmpeg y ffprobe se llaman con spawn y listas de argumentos (nunca un shell), con tiempo máximo y prioridad baja.
//
// Historias en video (tabla historias, tipo 'video'): el mismo proceso, hasta 60 s (como las de Instagram). Se publican
// en h/<id>.mp4 y h/<id>.webp; recién cuando quedan listas corren sus 24 h.
// Videos de las historias destacadas (tabla destacada_items): igual que las historias en video (hasta 60 s), pero no
// vencen. Se publican en d/<id>.mp4 y d/<id>.webp.
//
// Clip de la tarjeta (planes Oro en adelante; tabla previews): 5 s sin audio recortados de un video ya procesado
// (que ya trae la marca de agua), de hasta 480 px del lado mayor, CRF 28 con tope de 900 kbps, +faststart y sin
// metadatos. Se publica en p/<cuentaId>-<hash>.mp4 y se borra el anterior. Va por la misma cola que los videos.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { marcaPng } from './imagenes.js';

export const MAX_SEGUNDOS = 30;
export const MAX_SEGUNDOS_HISTORIA = 60;
export const MAX_BYTES_SUBIDA = 95 * 1024 * 1024; // Cloudflare gratis corta los envíos de más de 100 MB
const TOLERANCIA_S = 1; // un clip de "30 s" puede durar 30,4 s
const MAX_LADO_ENTRADA = 8192;
const LADO_SALIDA = 720;
const TIMEOUT_PROBE_MS = 20000;
const TIMEOUT_FFMPEG_MS = 180000;

export class VideoInvalido extends Error {}

// Detecta el contenedor por los primeros bytes (no por la extensión ni el tipo que manda el navegador).
// MP4 / MOV / 3GP: una caja ISO-BMFF ('ftyp', o 'moov'/'wide'/'free'/'mdat'/'skip' en QuickTime viejo) en el byte 4.
// WebM / Matroska: cabecera EBML 1A 45 DF A3.
export function contenedorPorFirma(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'webm';
  const caja = buf.subarray(4, 8).toString('latin1');
  if (caja === 'ftyp') {
    const marca = buf.subarray(8, 12).toString('latin1');
    return /^(qt {2})$/.test(marca) ? 'mov' : /^3g/.test(marca) ? '3gp' : 'mp4';
  }
  if (['moov', 'wide', 'free', 'mdat', 'skip'].includes(caja)) return 'mov';
  return null;
}

export async function leerFirma(file) {
  const fh = await fsp.open(file, 'r');
  try {
    const b = Buffer.alloc(32);
    const { bytesRead } = await fh.read(b, 0, 32, 0);
    return b.subarray(0, bytesRead);
  } finally { await fh.close(); }
}

// Endurecimiento: ffmpeg/ffprobe solo leen archivos locales (sin red ni listas tipo HLS) y solo los formatos de video
// que aceptamos (MP4/MOV/3GP y Matroska/WebM). Va delante de cada -i de un archivo subido.
export const ENTRADA_SEGURA = ['-protocol_whitelist', 'file', '-format_whitelist', 'mov,mp4,m4a,3gp,3g2,mj2,matroska,webm'];

function correr(bin, args, { timeoutMs, stdin = 'ignore', binario = false } = {}) {
  return new Promise((resolve, reject) => {
    const ch = spawn(bin, args, { stdio: [stdin, 'pipe', 'pipe'] });
    try { os.setPriority(ch.pid, 10); } catch { /* sin permiso o sin pid: sigue con prioridad normal */ }
    const out = []; let err = '';
    ch.stdout.on('data', (d) => out.push(d));
    ch.stderr.on('data', (d) => { if (err.length < 20000) err += d; });
    const t = setTimeout(() => { ch.kill('SIGKILL'); }, timeoutMs);
    ch.on('error', (e) => { clearTimeout(t); reject(e); });
    ch.on('close', (code, signal) => {
      clearTimeout(t);
      const data = Buffer.concat(out);
      if (code === 0) return resolve(binario ? data : data.toString('utf8'));
      const e = new Error(`${path.basename(bin)} terminó con ${signal || code}`);
      e.stderr = err; e.timeout = signal === 'SIGKILL';
      reject(e);
    });
  });
}

// Rotación de la pantalla (celulares graban acostados y marcan la rotación).
function rotacionDe(stream) {
  const sd = (stream.side_data_list || []).find((x) => x.rotation !== undefined);
  const r = sd ? Number(sd.rotation) : Number((stream.tags || {}).rotate || 0);
  return ((Math.round(r / 90) * 90) % 360 + 360) % 360;
}

export async function analizar(file, { ffprobe = 'ffprobe', maxSegundos = MAX_SEGUNDOS } = {}) {
  let info;
  try {
    const out = await correr(ffprobe, ['-v', 'error', ...ENTRADA_SEGURA, '-print_format', 'json', '-show_streams', '-show_format', '--', file], { timeoutMs: TIMEOUT_PROBE_MS });
    info = JSON.parse(out);
  } catch {
    throw new VideoInvalido('El archivo no es un video válido.');
  }
  const v = (info.streams || []).find((s) => s.codec_type === 'video' && !(s.disposition && s.disposition.attached_pic));
  if (!v) throw new VideoInvalido('El archivo no tiene imagen de video.');
  const a = (info.streams || []).find((s) => s.codec_type === 'audio');
  const dur = Number((info.format && info.format.duration) || v.duration || 0);
  if (!Number.isFinite(dur) || dur <= 0) throw new VideoInvalido('No pudimos leer la duración del video.');
  if (dur > maxSegundos + TOLERANCIA_S) throw new VideoInvalido(`El video dura ${Math.round(dur)} s. Hasta ${maxSegundos} segundos.`);
  if (dur < 1) throw new VideoInvalido('El video es demasiado corto (mínimo 1 segundo).');
  const w = Number(v.width); const h = Number(v.height);
  if (!w || !h || w < 64 || h < 64 || w > MAX_LADO_ENTRADA || h > MAX_LADO_ENTRADA) throw new VideoInvalido('Las dimensiones del video no son válidas.');
  const rot = rotacionDe(v);
  const [dw, dh] = rot === 90 || rot === 270 ? [h, w] : [w, h];
  return { duracion: dur, ancho: dw, alto: dh, audio: Boolean(a), rotacion: rot };
}

// Tamaño de salida: lado mayor ≤ 720 px, sin agrandar, números pares.
export function tamanoSalida(ancho, alto, max = LADO_SALIDA) {
  const k = Math.min(1, max / Math.max(ancho, alto));
  const par = (n) => Math.max(2, Math.round((n * k) / 2) * 2);
  return { ancho: par(ancho), alto: par(alto) };
}

// tam: tamaño de salida a medida ({ ancho, alto } pares); por defecto, lado mayor ≤ 720 px (tamanoSalida).
export async function transcodificar(entrada, salida, a, { ffmpeg = 'ffmpeg', marca = true, maxSegundos = MAX_SEGUNDOS, tam = null } = {}) {
  const { ancho, alto } = tam || tamanoSalida(a.ancho, a.alto);
  const args = ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', ...ENTRADA_SEGURA, '-i', entrada];
  let filtro = `[0:v]scale=${ancho}:${alto}:flags=bicubic,setsar=1,format=yuv420p[v]`;
  let mapV = '[v]';
  let wmFile = null;
  if (marca) {
    const wm = await marcaPng(ancho, alto);
    wmFile = salida + '.marca.png';
    await fsp.writeFile(wmFile, wm.buffer);
    args.push('-i', wmFile);
    filtro = `[0:v]scale=${ancho}:${alto}:flags=bicubic,setsar=1[b];[b][1:v]overlay=0:${wm.top},format=yuv420p[v]`;
  }
  args.push(
    '-filter_complex', filtro, '-map', mapV,
    ...(a.audio ? ['-map', '0:a:0', '-c:a', 'aac', '-b:a', '96k', '-ac', '2'] : ['-an']),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-maxrate', '2500k', '-bufsize', '5000k',
    '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-threads', '2',
    '-t', String(maxSegundos + TOLERANCIA_S),
    '-map_metadata', '-1', '-map_metadata:s:v', '-1', '-map_metadata:s:a', '-1', '-map_chapters', '-1',
    '-metadata', 'title=', '-metadata', 'encoder=',
    '-fflags', '+bitexact', '-flags:v', '+bitexact', '-flags:a', '+bitexact',
    '-movflags', '+faststart', '-f', 'mp4', salida,
  );
  try {
    await correr(ffmpeg, args, { timeoutMs: TIMEOUT_FFMPEG_MS });
  } catch (e) {
    if (e.timeout) throw new VideoInvalido('El video tardó demasiado en procesarse.');
    throw new VideoInvalido('No pudimos procesar el video. Probá con otro archivo (MP4 o MOV).');
  } finally {
    if (wmFile) await fsp.rm(wmFile, { force: true });
  }
  return { ancho, alto };
}

export const PREVIEW_SEGUNDOS = 5;
const LADO_PREVIEW = 480;
// Inicio permitido para el clip de la tarjeta: entre 0 y (duración − 5 s), con un decimal.
export function inicioValido(inicio, duracion) {
  const max = Math.max(0, Math.floor((Number(duracion) - PREVIEW_SEGUNDOS) * 10) / 10);
  const v = Math.round(Number(inicio) * 10) / 10;
  return { max, valor: Number.isFinite(v) ? Math.min(Math.max(0, v), max) : 0, ok: Number.isFinite(v) && v >= 0 && v <= max + 1e-9 };
}

export async function recortarPreview(entrada, salida, inicio, a, { ffmpeg = 'ffmpeg' } = {}) {
  const { ancho, alto } = tamanoSalida(a.ancho, a.alto, LADO_PREVIEW);
  const args = ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
    '-ss', String(Math.max(0, Number(inicio) || 0)), ...ENTRADA_SEGURA, '-i', entrada, '-t', String(PREVIEW_SEGUNDOS),
    '-map', '0:v:0', '-an', '-vf', `scale=${ancho}:${alto}:flags=bicubic,setsar=1,format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-maxrate', '900k', '-bufsize', '1800k',
    '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-threads', '2', '-g', '60',
    '-map_metadata', '-1', '-map_metadata:s:v', '-1', '-map_chapters', '-1', '-metadata', 'title=', '-metadata', 'encoder=',
    '-fflags', '+bitexact', '-flags:v', '+bitexact', '-movflags', '+faststart', '-f', 'mp4', salida];
  try {
    await correr(ffmpeg, args, { timeoutMs: TIMEOUT_FFMPEG_MS });
  } catch (e) {
    throw new VideoInvalido(e.timeout ? 'El clip tardó demasiado en procesarse.' : 'No pudimos armar el clip de la tarjeta. Probá con otro video.');
  }
  return { ancho, alto };
}

export async function portada(mp4, segundos, { ffmpeg = 'ffmpeg' } = {}) {
  const t = Math.min(1, Math.max(0, segundos * 0.4)).toFixed(2);
  const png = await correr(ffmpeg, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-ss', t, ...ENTRADA_SEGURA, '-i', mp4, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-'],
    { timeoutMs: 30000, binario: true });
  const out = await sharp(png).webp({ quality: 80 }).toBuffer({ resolveWithObject: true });
  return { buffer: out.data, ancho: out.info.width, alto: out.info.height };
}

// Cola de procesamiento (una tarea por vez).
// deps: pool, storage (put/del), log, invalidar (estado público), tmpDir, ffmpeg/ffprobe (rutas), marca (bool).
export function createVideos({ pool, storage, log = () => {}, invalidar = () => {}, tmpDir, ffmpeg = 'ffmpeg', ffprobe = 'ffprobe', marca = true }) {
  const cola = [];
  let activo = null;
  let detenido = false;
  const esperando = new Set(); // para las pruebas: resolvers de "cola vacía"

  const rutaTemporal = (id) => path.join(tmpDir, `${id}.subida`);

  async function marcarError(id, msg) {
    await pool.query("UPDATE videos SET estado = 'error', error = $2 WHERE id = $1 AND estado = 'procesando'", [id, msg.slice(0, 300)]);
  }

  async function procesarUno(id) {
    const entrada = rutaTemporal(id);
    const salida = path.join(tmpDir, `${id}.mp4`);
    try {
      const { rows } = await pool.query("SELECT id, cuenta_id FROM videos WHERE id = $1 AND estado = 'procesando'", [id]);
      if (!rows[0]) return; // lo borró antes de procesarse
      const a = await analizar(entrada, { ffprobe });
      const dims = await transcodificar(entrada, salida, a, { ffmpeg, marca });
      const final = await analizar(salida, { ffprobe });
      const pos = await portada(salida, final.duracion, { ffmpeg });
      const mp4 = await fsp.readFile(salida);
      const claveMp4 = `v/${id}.mp4`; const clavePoster = `v/${id}.webp`;
      const url = await storage.put(claveMp4, mp4, 'video/mp4');
      const urlPoster = await storage.put(clavePoster, pos.buffer, 'image/webp');
      const { rowCount } = await pool.query(
        `UPDATE videos SET estado = 'listo', clave_mp4 = $2, url = $3, clave_poster = $4, url_poster = $5, segundos = $6,
                ancho = $7, alto = $8, bytes = $9, error = NULL
          WHERE id = $1 AND estado = 'procesando'`,
        [id, claveMp4, url, clavePoster, urlPoster, Math.round(final.duracion * 10) / 10, dims.ancho, dims.alto, mp4.length],
      );
      if (!rowCount) { await storage.del(claveMp4); await storage.del(clavePoster); return; } // borrado mientras se procesaba
      await pool.query('UPDATE perfiles SET actualizado = now() WHERE cuenta_id = $1', [rows[0].cuenta_id]);
      invalidar();
      await asegurarPreview(rows[0].cuenta_id).catch((e) => log('preview: no se pudo pedir el automático', e.message));
    } catch (e) {
      if (e instanceof VideoInvalido) await marcarError(id, e.message);
      else {
        log('video: error al procesar', id, e.code || e.message);
        await marcarError(id, 'No pudimos procesar el video. Borralo y probá de nuevo.').catch(() => {});
      }
    } finally {
      await fsp.rm(entrada, { force: true }).catch(() => {});
      await fsp.rm(salida, { force: true }).catch(() => {});
    }
  }

  /* ---------- Historias en video (tabla historias) ---------- */
  async function marcarErrorHistoria(id, msg) {
    await pool.query("UPDATE historias SET estado = 'error', error = $2 WHERE id = $1 AND estado = 'procesando'", [id, msg.slice(0, 300)]);
  }

  async function procesarHistoria(id) {
    const entrada = rutaTemporal(id);
    const salida = path.join(tmpDir, `${id}.mp4`);
    try {
      const { rows } = await pool.query("SELECT id, cuenta_id FROM historias WHERE id = $1 AND estado = 'procesando'", [id]);
      if (!rows[0]) return; // la borró antes de procesarse
      const a = await analizar(entrada, { ffprobe, maxSegundos: MAX_SEGUNDOS_HISTORIA });
      const dims = await transcodificar(entrada, salida, a, { ffmpeg, marca, maxSegundos: MAX_SEGUNDOS_HISTORIA });
      const final = await analizar(salida, { ffprobe, maxSegundos: MAX_SEGUNDOS_HISTORIA });
      const pos = await portada(salida, final.duracion, { ffmpeg });
      const mp4 = await fsp.readFile(salida);
      const claveMp4 = `h/${id}.mp4`; const clavePoster = `h/${id}.webp`;
      const url = await storage.put(claveMp4, mp4, 'video/mp4');
      const urlPoster = await storage.put(clavePoster, pos.buffer, 'image/webp');
      const { rowCount } = await pool.query(
        `UPDATE historias SET estado = 'listo', clave = $2, url = $3, clave_mini = $4, url_mini = $5, segundos = $6,
                ancho = $7, alto = $8, error = NULL, expira = now() + interval '24 hours'
          WHERE id = $1 AND estado = 'procesando'`,
        [id, claveMp4, url, clavePoster, urlPoster, Math.round(final.duracion * 10) / 10, dims.ancho, dims.alto],
      );
      if (!rowCount) { await storage.del(claveMp4); await storage.del(clavePoster); return; } // borrada mientras se procesaba
      invalidar();
    } catch (e) {
      if (e instanceof VideoInvalido) await marcarErrorHistoria(id, e.message);
      else {
        log('historia: error al procesar', id, e.code || e.message);
        await marcarErrorHistoria(id, 'No pudimos procesar el video. Borralo y probá de nuevo.').catch(() => {});
      }
    } finally {
      await fsp.rm(entrada, { force: true }).catch(() => {});
      await fsp.rm(salida, { force: true }).catch(() => {});
    }
  }

  /* ---------- Videos de las historias destacadas (tabla destacada_items) ----------
     Mismo proceso y mismo tope que las historias en video (60 s). No vencen. Archivos en d/<id>.mp4 + d/<id>.webp. */
  async function marcarErrorDestacada(id, msg) {
    await pool.query("UPDATE destacada_items SET estado = 'error', error = $2 WHERE id = $1 AND estado = 'procesando'", [id, msg.slice(0, 300)]);
  }

  async function procesarDestacada(id) {
    const entrada = rutaTemporal(id);
    const salida = path.join(tmpDir, `${id}.mp4`);
    try {
      const { rows } = await pool.query("SELECT id, cuenta_id FROM destacada_items WHERE id = $1 AND estado = 'procesando'", [id]);
      if (!rows[0]) return; // lo borró antes de procesarse
      const a = await analizar(entrada, { ffprobe, maxSegundos: MAX_SEGUNDOS_HISTORIA });
      const dims = await transcodificar(entrada, salida, a, { ffmpeg, marca, maxSegundos: MAX_SEGUNDOS_HISTORIA });
      const final = await analizar(salida, { ffprobe, maxSegundos: MAX_SEGUNDOS_HISTORIA });
      const pos = await portada(salida, final.duracion, { ffmpeg });
      const mp4 = await fsp.readFile(salida);
      const claveMp4 = `d/${id}.mp4`; const clavePoster = `d/${id}.webp`;
      const url = await storage.put(claveMp4, mp4, 'video/mp4');
      const urlPoster = await storage.put(clavePoster, pos.buffer, 'image/webp');
      const { rowCount } = await pool.query(
        `UPDATE destacada_items SET estado = 'listo', clave = $2, url = $3, clave_mini = $4, url_mini = $5, segundos = $6,
                ancho = $7, alto = $8, error = NULL
          WHERE id = $1 AND estado = 'procesando'`,
        [id, claveMp4, url, clavePoster, urlPoster, Math.round(final.duracion * 10) / 10, dims.ancho, dims.alto],
      );
      if (!rowCount) { await storage.del(claveMp4); await storage.del(clavePoster); return; } // borrado mientras se procesaba
      invalidar();
    } catch (e) {
      if (e instanceof VideoInvalido) await marcarErrorDestacada(id, e.message);
      else {
        log('destacada: error al procesar', id, e.code || e.message);
        await marcarErrorDestacada(id, 'No pudimos procesar el video. Borralo y probá de nuevo.').catch(() => {});
      }
    } finally {
      await fsp.rm(entrada, { force: true }).catch(() => {});
      await fsp.rm(salida, { force: true }).catch(() => {});
    }
  }

  /* ---------- Clip de la tarjeta (tabla previews) ---------- */
  const primerVideoListo = async (cuentaId, excepto = null) => (await pool.query(
    "SELECT id FROM videos WHERE cuenta_id = $1 AND estado = 'listo' AND ($2::uuid IS NULL OR id <> $2) ORDER BY orden, creado LIMIT 1",
    [cuentaId, excepto])).rows[0] || null;

  // Pide (o vuelve a pedir) el clip: guarda el pedido con una versión nueva y lo encola.
  async function pedirPreview(cuentaId, { videoId, inicio = 0, elegido }) {
    await pool.query(
      `INSERT INTO previews (cuenta_id, video_id, inicio, elegido, estado, version, error, actualizado)
       VALUES ($1, $2, $3, $4, 'procesando', 1, NULL, now())
       ON CONFLICT (cuenta_id) DO UPDATE SET video_id = EXCLUDED.video_id, inicio = EXCLUDED.inicio, elegido = EXCLUDED.elegido,
         estado = 'procesando', version = previews.version + 1, error = NULL, actualizado = now()`,
      [cuentaId, videoId, inicio, elegido]);
    encolar('p:' + cuentaId);
  }

  // Sin clip todavía (o automático sin video de origen): arma el automático con el comienzo del primer video listo.
  async function asegurarPreview(cuentaId) {
    const { rows } = await pool.query('SELECT video_id, elegido, estado FROM previews WHERE cuenta_id = $1', [cuentaId]);
    const p = rows[0];
    if (p && p.video_id && (p.elegido || p.estado !== 'error')) return false;
    const v = await primerVideoListo(cuentaId);
    if (!v) return false;
    await pedirPreview(cuentaId, { videoId: v.id, inicio: 0, elegido: false });
    return true;
  }

  // Se borró un video: si era el del clip, vuelve al automático con el siguiente; si no queda ninguno, se borra el clip.
  async function alBorrarVideo(cuentaId, videoId) {
    const { rows } = await pool.query('SELECT video_id, clave FROM previews WHERE cuenta_id = $1', [cuentaId]);
    const p = rows[0];
    if (!p || (p.video_id && p.video_id !== videoId)) return;
    const v = await primerVideoListo(cuentaId, videoId);
    if (v) { await pedirPreview(cuentaId, { videoId: v.id, inicio: 0, elegido: false }); return; }
    const { rows: del } = await pool.query('DELETE FROM previews WHERE cuenta_id = $1 RETURNING clave', [cuentaId]);
    if (del[0] && del[0].clave) await storage.del(del[0].clave);
    invalidar();
  }

  // "Usar automático": el comienzo del primer video listo (o nada si no hay videos).
  async function previewAutomatico(cuentaId) {
    const v = await primerVideoListo(cuentaId);
    if (v) { await pedirPreview(cuentaId, { videoId: v.id, inicio: 0, elegido: false }); return true; }
    const { rows: del } = await pool.query('DELETE FROM previews WHERE cuenta_id = $1 RETURNING clave', [cuentaId]);
    if (del[0] && del[0].clave) await storage.del(del[0].clave);
    invalidar();
    return false;
  }

  async function procesarPreview(cuentaId) {
    const { rows } = await pool.query(
      `SELECT p.video_id, p.inicio, p.version, p.clave, v.clave_mp4, v.segundos, v.ancho, v.alto, v.estado AS vestado
         FROM previews p LEFT JOIN videos v ON v.id = p.video_id WHERE p.cuenta_id = $1 AND p.estado = 'procesando'`, [cuentaId]);
    const p = rows[0];
    if (!p) return;
    const fallar = (msg) => pool.query("UPDATE previews SET estado = 'error', error = $3, actualizado = now() WHERE cuenta_id = $1 AND version = $2", [cuentaId, p.version, msg]);
    if (!p.video_id || p.vestado !== 'listo' || !p.clave_mp4) { await fallar('El video elegido ya no está disponible.'); return; }
    const tag = crypto.randomBytes(6).toString('hex');
    const entrada = path.join(tmpDir, `p-${cuentaId}-${tag}.src.mp4`);
    const salida = path.join(tmpDir, `p-${cuentaId}-${tag}.mp4`);
    try {
      await fsp.writeFile(entrada, await storage.get(p.clave_mp4));
      const a = await analizar(entrada, { ffprobe });
      const ini = inicioValido(p.inicio, a.duracion).valor;
      await recortarPreview(entrada, salida, ini, a, { ffmpeg });
      const buf = await fsp.readFile(salida);
      const clave = `p/${cuentaId}-${crypto.createHash('sha256').update(`${p.video_id}:${ini}:${tag}`).digest('hex').slice(0, 12)}.mp4`;
      const url = await storage.put(clave, buf, 'video/mp4');
      const { rows: up } = await pool.query(
        `UPDATE previews SET estado = 'listo', clave = $3, url = $4, inicio = $5, error = NULL, actualizado = now()
          WHERE cuenta_id = $1 AND version = $2 RETURNING cuenta_id`, [cuentaId, p.version, clave, url, ini]);
      if (!up[0]) { await storage.del(clave); return; } // hubo un pedido más nuevo mientras se procesaba
      if (p.clave && p.clave !== clave) await storage.del(p.clave);
      invalidar();
    } catch (e) {
      if (e instanceof VideoInvalido) await fallar(e.message);
      else { log('preview: error al procesar', cuentaId, e.code || e.message); await fallar('No pudimos armar el clip de la tarjeta. Probá de nuevo.').catch(() => {}); }
    } finally {
      await fsp.rm(entrada, { force: true }).catch(() => {});
      await fsp.rm(salida, { force: true }).catch(() => {});
    }
  }

  // Tareas de otros módulos que usan la misma cola (una por vez): registrar('x', fn) → encolar('x:<id>') llama fn(id).
  const extra = new Map();
  function registrar(prefijo, fn) { extra.set(prefijo, fn); }

  function encolar(id) { if (cola.includes(id)) return; cola.push(id); setImmediate(() => { bucle().catch((e) => log('video: cola', e.message)); }); }

  async function bucle() {
    if (activo || detenido) return;
    while (cola.length && !detenido) {
      const id = cola.shift();
      const pre = id.split(':')[0];
      activo = id.includes(':') && extra.has(pre) ? extra.get(pre)(id.slice(pre.length + 1)) : id.startsWith('p:') ? procesarPreview(id.slice(2)) : id.startsWith('h:') ? procesarHistoria(id.slice(2)) : id.startsWith('d:') ? procesarDestacada(id.slice(2)) : procesarUno(id);
      await activo;
      activo = null;
    }
    if (!cola.length) { for (const r of esperando) r(); esperando.clear(); }
  }

  return {
    rutaTemporal,
    tmpDir,
    async preparar() { await fsp.mkdir(tmpDir, { recursive: true, mode: 0o700 }); },
    encolar, registrar, ffmpeg, ffprobe,
    pedirPreview, asegurarPreview, alBorrarVideo, previewAutomatico,
    // Al arrancar: los que quedaron "procesando" vuelven a la cola si el archivo temporal sigue; si no, pasan a error.
    async recuperar() {
      await fsp.mkdir(tmpDir, { recursive: true, mode: 0o700 });
      const { rows } = await pool.query("SELECT id FROM videos WHERE estado = 'procesando' ORDER BY creado");
      for (const { id } of rows) {
        if (fs.existsSync(rutaTemporal(id))) encolar(id);
        else await marcarError(id, 'Se interrumpió el procesamiento. Borralo y subilo de nuevo.');
      }
      // Historias en video que quedaron a medio procesar
      const { rows: hs } = await pool.query("SELECT id FROM historias WHERE estado = 'procesando' ORDER BY creado");
      for (const { id } of hs) {
        if (fs.existsSync(rutaTemporal(id))) encolar('h:' + id);
        else await marcarErrorHistoria(id, 'Se interrumpió el procesamiento. Borrala y subila de nuevo.');
      }
      // Videos de destacadas que quedaron a medio procesar
      const { rows: ds } = await pool.query("SELECT id FROM destacada_items WHERE estado = 'procesando' ORDER BY creado");
      for (const { id } of ds) {
        if (fs.existsSync(rutaTemporal(id))) encolar('d:' + id);
        else await marcarErrorDestacada(id, 'Se interrumpió el procesamiento. Borralo y subilo de nuevo.');
      }
      // Los clips de tarjeta pendientes se rehacen desde el video ya publicado.
      const { rows: pv } = await pool.query("SELECT cuenta_id FROM previews WHERE estado = 'procesando' ORDER BY actualizado");
      for (const { cuenta_id: c } of pv) encolar('p:' + c);
      return rows.length;
    },
    // Promesa que se resuelve cuando la cola queda vacía (pruebas).
    vacia() { return !activo && !cola.length ? Promise.resolve() : new Promise((r) => esperando.add(r)); },
    detener() { detenido = true; cola.length = 0; },
  };
}
