// Textos editables desde el editor de textos del admin (ADMIN_PATH + /textos).
//
// En el HTML de app/public cada texto editable va entre marcadores de comentario:
//   <!--e:pagina.seccion.nombre-->texto por defecto<!--/e-->   texto con formato mínimo
//   <!--t:pagina.seccion.nombre-->texto por defecto<!--/t-->   solo texto (title, option, dentro de enlaces
//                                                               y botones, atributos como content="" o aria-label="")
// Al servir la página, el contenido de cada marcador se reemplaza por el valor guardado en la tabla `textos`
// (si hay) y los marcadores se quitan. Sin valor guardado, la página sale idéntica al archivo sin marcadores.
// Las claves `comun.*` (cabecera, pie y mensajes de formulario) se repiten en todas las páginas y se editan una vez.
//
// Formato de los valores (tipo e): texto plano escapado, con saltos de línea, **negrita** y [texto](url)
// (url http/https, mailto:, ruta que empieza con "/" o "#", o {{SITE_URL}}...). Nada más se interpreta como HTML.
// Tipo t: texto plano escapado; los saltos de línea pasan a espacios.

export const TEXT_PAGES = [
  { id: 'index', file: 'index.html', nombre: 'Inicio', ruta: '/' },
  { id: 'terminos', file: 'terminos.html', nombre: 'Términos y condiciones', ruta: '/terminos' },
  { id: 'privacidad', file: 'privacidad.html', nombre: 'Política de privacidad', ruta: '/privacidad' },
  { id: 'contenido', file: 'contenido.html', nombre: 'Política de contenido', ruta: '/contenido' },
  { id: 'trata', file: 'trata.html', nombre: 'Política contra la trata', ruta: '/trata' },
  { id: 'denunciar', file: 'denunciar.html', nombre: 'Denunciar', ruta: '/denunciar' },
  { id: '404', file: '404.html', nombre: 'Página no encontrada (404)', ruta: '/pagina-que-no-existe' },
];
export const COMUN_PAGE = { id: 'comun', nombre: 'Cabecera, pie y mensajes de formularios (todas las páginas)', ruta: '/' };

export const MAX_VALOR = 5000;
const MARK_RE = /<!--([et]):([a-z0-9][a-z0-9._-]*)-->([\s\S]*?)<!--\/\1-->/g;
const STRAY_RE = /<!--\/?[et](?::[a-z0-9._-]*)?-->/g;
const BIDI_AND_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩﻿]/g;

export function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', copy: '©', hellip: '…', mdash: '—', ndash: '–', laquo: '«', raquo: '»' };
export function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? Number.parseInt(e.slice(2), 16) : Number.parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(cp); } catch { return m; }
    }
    return ENT[e.toLowerCase()] ?? m;
  });
}

// Enlaces permitidos en los valores.
export function urlPermitida(url) {
  return /^(https?:\/\/[^\s]|mailto:[^\s]|\/|#|\{\{\s*SITE_URL\s*\}\})/i.test(url);
}

// Valor guardado → HTML seguro.
export function renderValor(valor, tipo) {
  const s = String(valor ?? '').replace(/\r\n?/g, '\n');
  if (tipo !== 'e') return escapeHtml(s.replace(/[ \t]*\n[ \t]*/g, ' '));
  let h = escapeHtml(s);
  h = h.replace(/\[([^\]\n]+)\]\(([^\s()*<>"']+)\)/g, (m, texto, url) => (urlPermitida(url) ? `<a href="${url}">${texto}</a>` : m));
  h = h.replace(/\*\*(\S(?:[^\n]*?\S)?)\*\*/g, '<strong>$1</strong>');
  return h.replace(/\n/g, '<br>');
}

// HTML por defecto (del archivo) → valor editable, en el mismo formato que se guarda.
export function htmlAValor(html, tipo) {
  let s = String(html).replace(/[ \t\r\n]+/g, ' ').trim();
  if (tipo === 'e') {
    s = s.replace(/ ?<br\s*\/?> ?/gi, '\n')
      .replace(/<strong>([\s\S]*?)<\/strong>/gi, '**$1**')
      .replace(/<a href="([^"]*)">([\s\S]*?)<\/a>/gi, (m, u, t) => `[${t}](${decodeEntities(u)})`);
  }
  return decodeEntities(s);
}

// Limpia lo que llega del formulario del admin.
export function limpiarValor(v) {
  if (typeof v !== 'string') return '';
  return v.normalize('NFC').replace(/\r\n?/g, '\n').replace(BIDI_AND_CONTROL, '').replace(/\n{4,}/g, '\n\n\n').trim();
}

// Reemplaza cada marcador por el valor guardado (o deja el texto por defecto) y quita los marcadores.
export function aplicarTextos(raw, valores) {
  return raw.replace(MARK_RE, (m, tipo, clave, def) => (valores.has(clave) ? renderValor(valores.get(clave), tipo) : def)).replace(STRAY_RE, '');
}

const TAG_LABEL = {
  h1: 'Título principal', h2: 'Título de sección', h3: 'Subtítulo', p: 'Párrafo', li: 'Ítem de lista',
  th: 'Encabezado de tabla', td: 'Celda de tabla', s: 'Precio normal (tachado)', a: 'Texto de enlace o botón',
  button: 'Botón', label: 'Etiqueta de campo', legend: 'Título del grupo de opciones', option: 'Opción de una lista',
  strong: 'Texto destacado', small: 'Texto de ayuda', span: 'Texto', caption: 'Descripción de la tabla (solo lectores de pantalla)',
  title: 'Título de la pestaña, buscadores y al compartir',
};
const ATTR_LABEL = {
  content: 'Descripción para buscadores y al compartir', 'aria-label': 'Texto para lectores de pantalla (no se ve)',
  placeholder: 'Texto de ejemplo dentro del campo',
};

function contexto(html, idx, clave) {
  const before = html.slice(Math.max(0, idx - 400), idx);
  if (/\.mensajes\.contacto-/.test(clave)) return 'Etiqueta o ayuda del campo de contacto, según el medio elegido';
  let m = /\s([a-z-]+)="$/i.exec(before);
  if (m) return ATTR_LABEL[m[1]] || `Atributo ${m[1]}`;
  m = /<([a-z0-9]+)(\s[^<>]*)?>$/i.exec(before);
  if (m) {
    if (/\sdata-t="/.test(m[2] || '')) return 'Mensaje del formulario (al validar o enviar)';
    return TAG_LABEL[m[1].toLowerCase()] || 'Texto';
  }
  return 'Texto';
}

// Bloques de una página, en orden y sin repetir: [{clave, tipo, def, defValor, contexto}]
export function extraerBloques(html) {
  const out = [];
  const seen = new Set();
  for (const m of html.matchAll(MARK_RE)) {
    const [, tipo, clave, def] = m;
    if (seen.has(clave)) continue;
    seen.add(clave);
    out.push({ clave, tipo, def, defValor: htmlAValor(def, tipo), contexto: contexto(html, m.index, clave) });
  }
  return out;
}
