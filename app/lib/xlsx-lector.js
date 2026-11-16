// Lector mínimo de planillas (.xlsx y .csv), sin dependencias (16/11/2026, Admin → Mensajería → Captación).
// Por qué propio: mismo motivo que lib/xlsx.js (las bibliotecas conocidas traen avisos de seguridad o están
// desactualizadas). Lee solo lo necesario para una tabla de texto: un .xlsx es un ZIP con XML (ECMA-376); se abren
// xl/workbook.xml, sus relaciones, xl/sharedStrings.xml y la hoja pedida. Nunca se evalúan fórmulas (se toma el valor
// guardado) ni se procesan DTD o entidades externas (el XML se recorre con expresiones simples).
//
// Límites (planillas armadas por Juan; nada de archivos raros): archivo ≤ 8 MB, ≤ 2000 archivos dentro del ZIP,
// cada XML ≤ 40 MB descomprimido y ≤ 120 MB en total (corta "bombas zip"), ≤ 20000 filas y ≤ 60 columnas.
//
//   leerXlsx(buffer, { hoja }) → { hoja: nombre, filas: string[][] }   (hoja: nombre preferido; si no está, la primera)
//   leerCsv(texto)             → string[][]                             (separador , o ; ; comillas dobles RFC 4180)
//   leerPlanilla(buffer, nombreArchivo, { hoja }) → { tipo: 'xlsx' | 'csv', hoja, filas }
import zlib from 'node:zlib';

export const MAX_ARCHIVO = 8 * 1024 * 1024;
const MAX_ENTRADAS = 2000;
const MAX_XML = 40 * 1024 * 1024;
const MAX_TOTAL = 120 * 1024 * 1024;
export const MAX_FILAS = 20000;
const MAX_COLUMNAS = 60;
const MAX_CELDA = 2000;

export class PlanillaError extends Error { constructor(m) { super(m); this.expose = true; this.status = 400; } }
const mal = (m) => new PlanillaError(m);

// ---------- ZIP ----------
function entradasZip(buf) {
  if (buf.length < 22) throw mal('El archivo no es una planilla de Excel válida.');
  // Fin del directorio central: firma 0x06054b50 dentro de los últimos 64 KB + 22 bytes
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw mal('El archivo no es una planilla de Excel válida.');
  const total = buf.readUInt16LE(eocd + 10);
  const tam = buf.readUInt32LE(eocd + 12);
  const ini = buf.readUInt32LE(eocd + 16);
  if (total > MAX_ENTRADAS) throw mal('La planilla tiene demasiados archivos internos.');
  if (ini === 0xffffffff || tam === 0xffffffff || ini + tam > buf.length) throw mal('El archivo no es una planilla de Excel válida.');
  const out = new Map();
  let p = ini;
  for (let n = 0; n < total; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw mal('La planilla está dañada.');
    const metodo = buf.readUInt16LE(p + 10);
    const comp = buf.readUInt32LE(p + 20);
    const desc = buf.readUInt32LE(p + 24);
    const ln = buf.readUInt16LE(p + 28); const le = buf.readUInt16LE(p + 30); const lc = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const nombre = buf.toString('utf8', p + 46, p + 46 + ln);
    out.set(nombre.replace(/^\/+/, ''), { metodo, comp, desc, local });
    p += 46 + ln + le + lc;
  }
  return out;
}

function extraer(buf, e, usado) {
  if (!e) return null;
  if (e.local + 30 > buf.length || buf.readUInt32LE(e.local) !== 0x04034b50) throw mal('La planilla está dañada.');
  const ini = e.local + 30 + buf.readUInt16LE(e.local + 26) + buf.readUInt16LE(e.local + 28);
  if (ini + e.comp > buf.length) throw mal('La planilla está dañada.');
  const datos = buf.subarray(ini, ini + e.comp);
  const max = Math.min(MAX_XML, MAX_TOTAL - usado.n);
  let r;
  if (e.metodo === 0) r = Buffer.from(datos);
  else if (e.metodo === 8) {
    try { r = zlib.inflateRawSync(datos, { maxOutputLength: max }); } catch (err) {
      throw mal(err && err.code === 'ERR_BUFFER_TOO_LARGE' ? 'La planilla es demasiado grande.' : 'La planilla está dañada.');
    }
  } else throw mal('La planilla usa una compresión que no se puede leer. Guardala de nuevo como .xlsx.');
  if (r.length > max) throw mal('La planilla es demasiado grande.');
  usado.n += r.length;
  return r.toString('utf8');
}

// ---------- XML ----------
const ENT = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
export function desescapar(s) {
  return String(s)
    .replace(/&(?:#(\d{1,7})|#x([0-9a-fA-F]{1,6})|(lt|gt|amp|quot|apos));/g, (m, d, h, n) => {
      if (n) return ENT[n];
      const c = d ? Number(d) : parseInt(h, 16);
      try { return String.fromCodePoint(c); } catch { return ''; }
    })
    .replace(/_x([0-9a-fA-F]{4})_/g, (m, h) => String.fromCharCode(parseInt(h, 16))); // escapes de Office (_x000D_)
}
function atributos(tag) {
  const a = {};
  const re = /([A-Za-z_][\w.:-]*)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(tag))) a[m[1]] = desescapar(m[2]);
  return a;
}
// Texto de un <si> o <is>: todos los <t> (sin la fonética <rPh>)
const textoRico = (x) => {
  const sin = x.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  let t = ''; const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g; let m;
  while ((m = re.exec(sin))) t += desescapar(m[1]);
  return t;
};
const colIndice = (ref) => {
  const m = /^([A-Z]{1,3})/.exec(String(ref || '').toUpperCase());
  if (!m) return -1;
  let n = 0; for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};
const corte = (s) => (s.length > MAX_CELDA ? s.slice(0, MAX_CELDA) : s);

export function leerXlsx(buf, { hoja = null } = {}) {
  if (!Buffer.isBuffer(buf)) throw mal('Falta el archivo.');
  if (buf.length > MAX_ARCHIVO) throw mal('El archivo pesa más de 8 MB.');
  if (buf.readUInt32LE(0) !== 0x04034b50) throw mal('El archivo no es una planilla de Excel (.xlsx).');
  const ent = entradasZip(buf);
  const usado = { n: 0 };
  const wb = extraer(buf, ent.get('xl/workbook.xml'), usado);
  if (!wb) throw mal('El archivo no es una planilla de Excel (.xlsx).');
  const hojas = [];
  const reS = /<sheet\b([^>]*)\/?>/g; let m;
  while ((m = reS.exec(wb))) {
    const a = atributos(m[1]);
    const rid = Object.keys(a).find((k) => /(^|:)id$/.test(k) && k !== 'sheetId');
    hojas.push({ nombre: a.name || '', rid: rid ? a[rid] : null });
  }
  if (!hojas.length) throw mal('La planilla no tiene hojas.');
  const rels = extraer(buf, ent.get('xl/_rels/workbook.xml.rels'), usado) || '';
  const destino = new Map();
  const reR = /<Relationship\b([^>]*)\/?>/g;
  while ((m = reR.exec(rels))) { const a = atributos(m[1]); if (a.Id && a.Target) destino.set(a.Id, a.Target); }
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const elegida = (hoja && hojas.find((h) => norm(h.nombre) === norm(hoja))) || hojas[0];
  let ruta = destino.get(elegida.rid) || '';
  ruta = ruta.startsWith('/') ? ruta.slice(1) : 'xl/' + ruta.replace(/^\.\//, '');
  // ".." (no debería aparecer): se resuelve dentro del ZIP, nunca en disco
  const partes = []; for (const p of ruta.split('/')) { if (p === '..') partes.pop(); else if (p && p !== '.') partes.push(p); }
  const xmlHoja = extraer(buf, ent.get(partes.join('/')), usado);
  if (!xmlHoja) throw mal('No se pudo leer la hoja ' + (elegida.nombre || '1') + '.');
  const compartidos = [];
  const ss = extraer(buf, ent.get('xl/sharedStrings.xml'), usado);
  if (ss) { const reSi = /<si>([\s\S]*?)<\/si>|<si\/>/g; while ((m = reSi.exec(ss))) compartidos.push(m[1] ? textoRico(m[1]) : ''); }

  const filas = [];
  const reRow = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
  let rm; let siguiente = 0;
  while ((rm = reRow.exec(xmlHoja))) {
    const ra = atributos(rm[1]);
    const nFila = ra.r ? Number(ra.r) - 1 : siguiente;
    siguiente = nFila + 1;
    if (nFila >= MAX_FILAS + 50) throw mal(`La planilla tiene más de ${MAX_FILAS} filas.`);
    const fila = [];
    const reC = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm; let col = 0;
    while ((cm = reC.exec(rm[2] || ''))) {
      const ca = atributos(cm[1]);
      const idx = ca.r ? colIndice(ca.r) : col;
      col = idx + 1;
      if (idx < 0 || idx >= MAX_COLUMNAS) continue;
      const cuerpo = cm[2] || '';
      let v = '';
      const vm = /<v>([\s\S]*?)<\/v>/.exec(cuerpo);
      if (ca.t === 's') v = vm ? (compartidos[Number(vm[1])] ?? '') : '';
      else if (ca.t === 'inlineStr') v = textoRico(cuerpo);
      else v = vm ? desescapar(vm[1]) : '';
      fila[idx] = corte(String(v).trim());
    }
    for (let i = 0; i < fila.length; i++) if (fila[i] === undefined) fila[i] = '';
    filas[nFila] = fila;
  }
  for (let i = 0; i < filas.length; i++) if (!filas[i]) filas[i] = [];
  return { hoja: elegida.nombre, filas };
}

export function leerCsv(texto) {
  let s = String(texto || '');
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  const primera = s.split(/\r?\n/, 1)[0] || '';
  const sep = (primera.match(/;/g) || []).length > (primera.match(/,/g) || []).length ? ';'
    : (primera.match(/\t/g) || []).length > (primera.match(/,/g) || []).length ? '\t' : ',';
  const filas = []; let fila = []; let celda = ''; let q = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { celda += '"'; i++; } else q = false; }
      else celda += ch;
      continue;
    }
    if (ch === '"' && celda === '') q = true;
    else if (ch === sep) { fila.push(corte(celda.trim())); celda = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      fila.push(corte(celda.trim())); filas.push(fila.slice(0, MAX_COLUMNAS)); fila = []; celda = '';
      if (filas.length > MAX_FILAS + 50) throw mal(`La planilla tiene más de ${MAX_FILAS} filas.`);
    } else celda += ch;
  }
  if (celda !== '' || fila.length) { fila.push(corte(celda.trim())); filas.push(fila.slice(0, MAX_COLUMNAS)); }
  return filas;
}

export function leerPlanilla(buf, nombre = '', { hoja = null } = {}) {
  if (!Buffer.isBuffer(buf) || !buf.length) throw mal('Falta el archivo.');
  if (buf.length > MAX_ARCHIVO) throw mal('El archivo pesa más de 8 MB.');
  const esZip = buf.length >= 4 && buf.readUInt32LE(0) === 0x04034b50;
  if (esZip) { const r = leerXlsx(buf, { hoja }); return { tipo: 'xlsx', hoja: r.hoja, filas: r.filas }; }
  if (/\.xlsx?$/i.test(nombre)) throw mal(/\.xls$/i.test(nombre) ? 'Ese es un Excel viejo (.xls): guardalo como .xlsx o .csv.' : 'El archivo no es una planilla de Excel válida.');
  const texto = buf.toString('utf8');
  if (texto.includes('\u0000')) throw mal('El archivo no es una planilla (.xlsx) ni un .csv.');
  return { tipo: 'csv', hoja: null, filas: leerCsv(texto) };
}
