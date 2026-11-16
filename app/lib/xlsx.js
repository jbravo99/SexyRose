// Planilla de Excel (.xlsx) mínima, sin dependencias (16/11/2026, Admin → Métricas → Exportar).
// Por qué propia: alcanza con hojas de texto, números y fechas con formato; las bibliotecas conocidas traen ~170
// paquetes (exceljs 4.4.0, con un aviso de seguridad en uuid) o están desactualizadas en npm (xlsx/SheetJS). Un .xlsx es
// un ZIP con XML (Office Open XML, ECMA-376): se arma acá con zlib de Node (deflate) y un CRC-32 propio.
//
//   crearXlsx([{ nombre, filas, anchos?, fijarFilas? }]) → Buffer
//   filas: arreglo de filas; cada celda es null/undefined (vacía), un texto, un número o un objeto:
//     { v: número, f: 'entero' | 'decimal' | 'pct' }   (pct: fracción, 0.125 → 12,5 %)
//     { fecha: 'YYYY-MM-DD' }                           (fecha de Excel, dd/mm/aaaa)
//     { v: texto | número, b: true }                    (negrita: encabezados y totales)
import zlib from 'node:zlib';

const ESTILO = { normal: 0, negrita: 1, fecha: 2, entero: 3, decimal: 4, pct: 5, negritaEntero: 6, negritaDecimal: 7 };

const xml = (s) => String(s)
  // Caracteres que XML 1.0 no admite
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function columna(i) { // 0 → A, 26 → AA
  let s = ''; let n = i + 1;
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

const serialFecha = (iso) => {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
};

function celda(ref, c) {
  if (c == null || c === '') return '';
  const texto = (t, s) => `<c r="${ref}" t="inlineStr"${s ? ` s="${s}"` : ''}><is><t xml:space="preserve">${xml(t)}</t></is></c>`;
  const numero = (n, s) => (Number.isFinite(n) ? `<c r="${ref}"${s ? ` s="${s}"` : ''}><v>${n}</v></c>` : '');
  if (typeof c === 'string') return texto(c, 0);
  if (typeof c === 'number') return numero(c, Number.isInteger(c) ? ESTILO.entero : ESTILO.decimal);
  if (typeof c === 'object') {
    if (c.fecha) return numero(serialFecha(c.fecha), ESTILO.fecha);
    if (typeof c.v === 'string') return texto(c.v, c.b ? ESTILO.negrita : 0);
    if (typeof c.v === 'number') {
      const f = c.f || (Number.isInteger(c.v) ? 'entero' : 'decimal');
      if (f === 'pct') return numero(c.v, ESTILO.pct);
      if (c.b) return numero(c.v, f === 'entero' ? ESTILO.negritaEntero : ESTILO.negritaDecimal);
      return numero(c.v, ESTILO[f] ?? ESTILO.decimal);
    }
  }
  return '';
}

function hojaXml({ filas, anchos = [], fijarFilas = 0 }) {
  const cols = anchos.length ? `<cols>${anchos.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
  const vista = fijarFilas > 0
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${fijarFilas}" topLeftCell="A${fijarFilas + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
  const datos = filas.map((fila, i) => {
    const cs = (fila || []).map((c, j) => celda(columna(j) + (i + 1), c)).join('');
    return cs ? `<row r="${i + 1}">${cs}</row>` : '';
  }).join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + `${vista}<sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${datos}</sheetData></worksheet>`;
}

const ESTILOS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
  + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
  + '<numFmts count="2"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="0.0%"/></numFmts>'
  + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>'
  + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
  + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
  + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
  + '<cellXfs count="8">'
  + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
  + '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
  + '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
  + '<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
  + '<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
  + '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
  + '<xf numFmtId="3" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>'
  + '<xf numFmtId="4" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>'
  + '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

// Nombre de hoja válido para Excel: hasta 31 caracteres, sin : \ / ? * [ ] y sin repetir
function nombresHojas(hojas) {
  const usados = new Set();
  return hojas.map((h, i) => {
    let n = String(h.nombre || `Hoja ${i + 1}`).replace(/[:\\/?*[\]]/g, ' ').replace(/^'+|'+$/g, '').trim().slice(0, 31) || `Hoja ${i + 1}`;
    let k = 2; const base = n;
    while (usados.has(n.toLowerCase())) n = base.slice(0, 31 - String(k).length - 1) + ' ' + k++;
    usados.add(n.toLowerCase());
    return n;
  });
}

export function crearXlsx(hojas, { fecha = new Date() } = {}) {
  if (!Array.isArray(hojas) || !hojas.length) throw new Error('El libro necesita al menos una hoja.');
  const nombres = nombresHojas(hojas);
  const archivos = [
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
      + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
      + '</Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
      + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
      + '</Relationships>'],
    ['docProps/core.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
      + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
      + `<dc:creator>SexyRose</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${fecha.toISOString().replace(/\.\d+Z$/, 'Z')}</dcterms:created>`
      + '</cp:coreProperties>'],
    ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
      + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + `<bookViews><workbookView/></bookViews><sheets>${nombres.map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
      + `<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
      + '</Relationships>'],
    ['xl/styles.xml', ESTILOS],
    ...hojas.map((h, i) => [`xl/worksheets/sheet${i + 1}.xml`, hojaXml(h)]),
  ];
  return zip(archivos.map(([nombre, txt]) => ({ nombre, datos: Buffer.from(txt, 'utf8') })), fecha);
}

/* ---------- ZIP (deflate) ---------- */
const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = TABLA_CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function zip(entradas, fecha) {
  const d = fecha instanceof Date ? fecha : new Date();
  const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const dia = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const locales = []; const central = []; let offset = 0;
  for (const e of entradas) {
    const nombre = Buffer.from(e.nombre, 'utf8');
    const comp = zlib.deflateRawSync(e.datos, { level: 9 });
    const crc = crc32(e.datos);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8);
    lh.writeUInt16LE(hora, 10); lh.writeUInt16LE(dia, 12); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(e.datos.length, 22); lh.writeUInt16LE(nombre.length, 26); lh.writeUInt16LE(0, 28);
    locales.push(lh, nombre, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10);
    ch.writeUInt16LE(hora, 12); ch.writeUInt16LE(dia, 14); ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(e.datos.length, 24); ch.writeUInt16LE(nombre.length, 28);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, nombre);
    offset += 30 + nombre.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(entradas.length, 8); fin.writeUInt16LE(entradas.length, 10);
  fin.writeUInt32LE(cd.length, 12); fin.writeUInt32LE(offset, 16);
  return Buffer.concat([...locales, cd, fin]);
}
