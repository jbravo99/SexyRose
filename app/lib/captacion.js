// Captación (16/11/2026, decisión de Juan): invitar por WhatsApp a acompañantes que publican en otros sitios.
// Semiautomático: Juan importa su planilla (sexyrose-contactos.xlsx, hoja "Contactos"), el admin le arma "los N del día"
// y él toca "Abrir chat" (wa.me con el mensaje listo) y envía desde WhatsApp Web con el chip del asistente. El agente
// (lib/asistente.js) ve ese mensaje saliente, marca el contacto "enviado" SIN silenciar el bot, y si ella responde la
// atiende el asistente con el contexto de la invitación. Ver FASE1-CONTRATO.md → "Mensajería" → "Captación".
//
// Lo usan el app (routes/admin-captacion.js: importar, cola, estados) y el agente (lib/asistente.js).
// Seguridad: nombres o notas con palabras que sugieren una menor o alguien muy joven → "revisar" (nunca entra en la
// cola hasta que Juan lo revise uno por uno). Igual para números extranjeros o inválidos.
import { telefonoComparable } from './asistente-comun.js';

export const ESTADOS = Object.freeze(['pendiente', 'abierto', 'enviado', 'respondio', 'se_registro', 'no_escribir', 'revisar', 'descartado', 'en_sitio']);
export const ESTADO_NOMBRE = Object.freeze({
  pendiente: 'Pendiente', abierto: 'Abierto', enviado: 'Enviado', respondio: 'Respondió', se_registro: 'Se registró',
  no_escribir: 'No escribir', revisar: 'Revisar', descartado: 'Descartado', en_sitio: 'Ya está en el sitio',
});
export const POR_DIA_DEFAULT = 30;
export const POR_DIA_MAX = 200;
export const MENSAJE_MAX = 1000;
// Texto aprobado por Juan (13/11/2026; sin línea de baja, decisión suya).
export const MENSAJE_DEFAULT = 'Hola, ¿cómo estás? Te escribimos de SexyRose (sexyrose.net). Vimos tu perfil publicado en otro sitio y nos encantaría que formes parte de nuestra plataforma.\n\n'
  + 'SexyRose es un sitio para crear tu propio perfil con fotos, videos e historias, y vender tu contenido si querés. Crear el perfil *es gratis* con el plan Bronce. Si te interesa, registrate en sexyrose.net.\n\n'
  + 'Cualquier duda, respondé este mensaje.';
export const RESPUESTA_NO_ESCRIBIR = 'Perfecto, no te vamos a escribir más. Disculpá la molestia.';
export const RESPUESTA_ORIGEN = 'Tu número lo vimos en tu aviso publicado en otro sitio.';

const esObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
// minúsculas, sin tildes ni signos, espacios simples
export const normalizar = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9ñ]+/g, ' ').trim();

// ---------- Ajustes (ajustes.clave = 'captacion': { mensaje, porDia }) ----------
export function mezclarAjustesCaptacion(v) {
  const o = esObj(v) ? v : {};
  const n = Number(o.porDia);
  return {
    mensaje: typeof o.mensaje === 'string' && o.mensaje.trim() ? o.mensaje : MENSAJE_DEFAULT,
    porDia: Number.isInteger(n) && n >= 1 && n <= POR_DIA_MAX ? n : POR_DIA_DEFAULT,
  };
}
export function validarAjustesCaptacion(v, actual = {}) {
  if (!esObj(v)) return { error: 'Formato inválido: {mensaje, porDia}.' };
  const out = mezclarAjustesCaptacion(actual);
  if (v.mensaje !== undefined) {
    if (typeof v.mensaje !== 'string') return { error: 'El mensaje tiene que ser texto.' };
    const t = v.mensaje.replace(/\r\n?/g, '\n').trim();
    if (t.length > MENSAJE_MAX) return { error: `El mensaje admite hasta ${MENSAJE_MAX} caracteres.` };
    if (t && t.length < 20) return { error: 'El mensaje es muy corto.' };
    out.mensaje = t || MENSAJE_DEFAULT; // vacío = el texto aprobado
  }
  if (v.porDia !== undefined) {
    const n = Number(v.porDia);
    if (!Number.isInteger(n) || n < 1 || n > POR_DIA_MAX) return { error: `Por día: un número entero de 1 a ${POR_DIA_MAX}.` };
    out.porDia = n;
  }
  return { valor: out };
}
export async function leerAjustesCaptacion(db) {
  const { rows } = await db.query("SELECT valor FROM ajustes WHERE clave = 'captacion'");
  return mezclarAjustesCaptacion(rows[0] && rows[0].valor);
}

// ---------- Teléfonos (Argentina, E.164 +549…) ----------
// Devuelve { telefono: '+549XXXXXXXXXX' | '+<dígitos>' , comparable, motivo: null | 'extranjero' | 'invalido' }.
// Acepta +54 9 11 2233-4455, +54 11 2233 4455, 011 15 2233-4455, 11 2233 4455, 5491122334455, etc.
export function normalizarTelefono(raw) {
  const s = String(raw || '').trim();
  let d = s.replace(/\D/g, '');
  if (!d) return { telefono: null, comparable: '', motivo: 'invalido' };
  const conMas = /^\s*\+/.test(s) || s.startsWith('00');
  if (s.startsWith('00')) d = d.replace(/^00/, '');
  const nacional = (n) => { // 10 dígitos: característica + número, sin 0 ni 15
    if (n.length === 12) { // con el 15: 11 15 xxxx xxxx, 351 15 xxx xxxx, 2944 15 xx xxxx
      for (const k of [2, 3, 4]) if (n.slice(k, k + 2) === '15' && (k !== 2 || n.startsWith('11'))) return n.slice(0, k) + n.slice(k + 2);
      return null;
    }
    return n.length === 10 && /^[1-9]/.test(n) ? n : null;
  };
  let nac = null;
  if (d.startsWith('549')) nac = d.length === 13 ? d.slice(3) : null;
  else if (d.startsWith('54')) nac = nacional(d.slice(2));
  else if (conMas) return { telefono: '+' + d.slice(0, 15), comparable: d.slice(0, 15), motivo: d.length >= 8 && d.length <= 15 ? 'extranjero' : 'invalido' };
  else if (d.startsWith('0')) nac = nacional(d.replace(/^0+/, ''));
  else nac = nacional(d);
  if (!nac || !/^[1-9]\d{9}$/.test(nac)) return { telefono: '+' + d.slice(0, 15), comparable: telefonoComparable(d.slice(0, 15)), motivo: 'invalido' };
  const e164 = '+549' + nac;
  return { telefono: e164, comparable: telefonoComparable(e164), motivo: null };
}

// ---------- Palabras que sugieren una menor o alguien muy joven (seguridad) ----------
// Sobre el texto normalizado (sin tildes, minúsculas). "niña" se busca antes de normalizar (Nina es un nombre).
const JOVEN = [
  [/\bpendej\w*/, 'pendeja'], [/\bjovencit\w*/, 'jovencita'], [/\bnenit\w*/, 'nenita'], [/\bnenas?\b/, 'nena'],
  [/\blolit\w*/, 'lolita'], [/\bcolegial\w*/, 'colegiala'], [/\bteens?\b|\bteenager\w*/, 'teen'], [/\bmenor(es|cit\w*)?\b/, 'menor'],
  [/\badolescent\w*/, 'adolescente'], [/\brecien cumplid\w*/, 'recién cumplidos'], [/\bpibit\w*/, 'pibita'],
  [/\bchiquilin\w*/, 'chiquilina'], [/\bninit\w*/, 'niñita'], [/\bschool ?girl\w*/, 'schoolgirl'], [/\bbarely legal\b/, 'barely legal'],
  [/\bsecundari\w*/, 'secundaria'],
  [/\b(1[0-7])\s*(anos|anitos|anios)\b/, 'menos de 18 años'], [/\btengo (1[0-7])\b/, 'menos de 18 años'],
];
export function motivoJoven(texto) {
  const crudo = String(texto || '').toLowerCase();
  if (/\bniñ[ao]s?\b/u.test(crudo)) return 'niña';
  const t = normalizar(texto);
  if (!t) return null;
  for (const [re, nombre] of JOVEN) if (re.test(t)) return nombre;
  return null;
}

// ---------- Mensajes del chat ----------
// ¿El texto saliente es el mensaje de captación? (mismo texto, sin importar espacios, mayúsculas ni asteriscos)
const compacto = (s) => normalizar(String(s || '').replace(/\*/g, '')).replace(/\s+/g, ' ');
export function esMensajeCaptacion(texto, mensaje) {
  const a = compacto(texto); const b = compacto(mensaje || MENSAJE_DEFAULT);
  if (!a || !b) return false;
  return a === b || (b.length >= 60 && a.includes(b.slice(0, 80))) || (a.length >= 60 && b.includes(a.slice(0, 80)));
}

// Respuesta de alguien invitado que no quiere saber nada: 'rechazo', 'origen' (pregunta de dónde sacamos el número,
// que Juan también cuenta como "no escribir") o null. Solo mensajes cortos: lo largo lo resuelve la IA (herramienta
// no_contactar).
const RECHAZO = [
  /^(no+|nop+|nope|no gracias|no gracia|no, gracias|no me interesa\w*|no estoy interesad[ao]|no interesad[ao]|no quiero|paso|gracias no|no por ahora no)$/,
  /\bno me interesa\b/, /\bno estoy interesad[ao]\b/, /\bno (me|nos) (escrib|molest|contact|mand|jod|llam)\w*/, /\bdej(a|á|en|ame|enme|ate) de (escrib|molest|jod|mand)\w*/,
  /\b(dar(me)? de )?baja\b/, /\bno (vuelvan|vuelvas) a (escrib|mand)\w*/, /\bborr(a|en|ame|enme) (mi|el) (numero|contacto)\b/, /\bno molest\w*/,
  /\b(stop|unsubscribe|leave me alone|not interested|fuck off)\b/,
  /\b(hdp|hijo de puta|hija de puta|la concha|conchud\w*|pelotud\w*|boludo|boluda|forro|forra|chupala|andate a la mierda|la puta que|puto|puta madre|mierda|idiota|estupid\w*|imbecil\w*|tarad[ao]|garca|chantas?)\b/,
];
const ORIGEN = /\b(quien|quienes|de donde|como|donde) (te |les |le )?(dio|dieron|pasaron|paso|saco|sacaron|sacaste|consiguio|consiguieron|conseguiste|obtuvo|obtuvieron|tiene|tienen|tenes)\b.*\b(numero|telefono|cel|celular|contacto|whatsapp|wpp)\b|\bde donde (sacaron|sacaste|tienen|tenes) (mi|este)\b/;
export function respuestaInvitada(texto) {
  const t = normalizar(texto);
  if (!t || t.length > 160) return null;
  if (ORIGEN.test(t)) return 'origen';
  if (RECHAZO.some((re) => re.test(t))) return 'rechazo';
  return null;
}

// ---------- Planilla → contactos ----------
const CAMPOS = {
  nombres: ['nombres', 'nombre', 'name', 'nombre artistico', 'alias'],
  telefono: ['telefono', 'tel', 'celular', 'whatsapp', 'numero', 'phone', 'telefono whatsapp', 'movil'],
  categoria: ['categoria', 'categorias', 'tipo', 'rubro'],
  ciudad: ['ciudad', 'ciudades', 'localidad', 'zona', 'city'],
  sitios: ['sitios', 'sitio', 'fuente', 'fuentes', 'web'],
  avisos: ['cantidad de avisos', 'avisos', 'cant avisos', 'cantidad'],
  url: ['url', 'urls', 'link', 'links', 'enlace', 'aviso'],
  fecha: ['fecha', 'fechas', 'fecha aviso'],
  estado: ['estado'],
  nota: ['nota', 'notas', 'observaciones', 'observacion', 'comentario', 'comentarios'],
};
const ALIAS_CAMPO = new Map();
for (const [k, lista] of Object.entries(CAMPOS)) for (const a of lista) ALIAS_CAMPO.set(a, k);
// Título de columna → campo. Exacto primero; si no, el título empieza con un alias seguido de más palabras
// ("Nombre / alias", "Ciudad / zona", "Sitio(s)", "Avisos con este teléfono", "URL del aviso", "Fecha de relevamiento":
// así vienen en la planilla de captación de Juan, 13/11/2026). El alias más largo gana.
const ALIAS_ORDENADOS = [...ALIAS_CAMPO.keys()].sort((a, b) => b.length - a.length);
function campoDeTitulo(h) {
  const t = normalizar(h);
  if (!t) return null;
  if (ALIAS_CAMPO.has(t)) return ALIAS_CAMPO.get(t);
  const a = ALIAS_ORDENADOS.find((x) => t.startsWith(x + ' '));
  return a ? ALIAS_CAMPO.get(a) : null;
}
const lista = (s, sep = /\s*[,;|/]\s*/) => String(s || '').split(sep).map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
const unir = (a, b, max) => { const out = [...a]; const vistos = new Set(a.map((x) => x.toLowerCase())); for (const x of b) { const k = x.toLowerCase(); if (!vistos.has(k)) { vistos.add(k); out.push(x); } } return out.slice(0, max); };
// Estado escrito a mano en la planilla (solo los que evitan escribir de más; lo demás queda "pendiente")
function estadoPlanilla(s) {
  const t = normalizar(s);
  if (!t) return null;
  if (/no escribir|no contactar|baja|no molestar/.test(t)) return 'no_escribir';
  if (/descart/.test(t)) return 'descartado';
  if (/revisar/.test(t)) return 'revisar';
  if (/enviad|contactad|escrit/.test(t)) return 'enviado';
  return null;
}

// filas (string[][]) → { contactos, filasLeidas, sinTelefono, repetidosEnArchivo, columnas } o { error }
export function contactosDeFilas(filas) {
  let cab = -1; let mapa = null;
  for (let i = 0; i < Math.min(15, filas.length); i++) {
    const m = {};
    (filas[i] || []).forEach((h, j) => { const k = campoDeTitulo(h); if (k && m[k] === undefined) m[k] = j; });
    if (m.telefono !== undefined) { cab = i; mapa = m; break; }
  }
  if (cab < 0) return { error: 'No encontré la columna del teléfono. La primera fila tiene que tener los títulos (Nombres, Teléfono, Ciudad…).' };
  const porTel = new Map();
  let leidas = 0; let sinTel = 0; let repetidos = 0;
  for (let i = cab + 1; i < filas.length; i++) {
    const f = filas[i] || [];
    const v = (k) => (mapa[k] !== undefined ? String(f[mapa[k]] || '').trim() : '');
    if (!f.some((x) => String(x || '').trim())) continue;
    leidas++;
    const tel = normalizarTelefono(v('telefono'));
    if (!tel.telefono) { sinTel++; continue; }
    const avisos = Math.max(1, Math.min(10000, parseInt(v('avisos').replace(/\D/g, ''), 10) || 1));
    const nuevo = {
      telefono: tel.telefono, comparable: tel.comparable, motivoTel: tel.motivo,
      nombres: lista(v('nombres')).map((x) => x.slice(0, 80)).slice(0, 20),
      ciudades: lista(v('ciudad')).map((x) => x.slice(0, 80)).slice(0, 10),
      categorias: lista(v('categoria')).map((x) => x.slice(0, 40)).slice(0, 5),
      sitios: lista(v('sitios')).map((x) => x.slice(0, 60)).slice(0, 10),
      urls: lista(v('url'), /\s*[\s,;|]\s*/).filter((u) => /^https?:\/\/\S+$/i.test(u)).map((x) => x.slice(0, 300)).slice(0, 10),
      avisos, fecha: v('fecha').slice(0, 40), nota: v('nota').slice(0, 500), estadoPlanilla: estadoPlanilla(v('estado')),
    };
    const ya = porTel.get(tel.telefono);
    if (ya) {
      repetidos++;
      ya.nombres = unir(ya.nombres, nuevo.nombres, 20); ya.ciudades = unir(ya.ciudades, nuevo.ciudades, 10);
      ya.categorias = unir(ya.categorias, nuevo.categorias, 5); ya.sitios = unir(ya.sitios, nuevo.sitios, 10); ya.urls = unir(ya.urls, nuevo.urls, 10);
      ya.avisos = Math.min(10000, ya.avisos + nuevo.avisos);
      ya.nota = [ya.nota, nuevo.nota].filter(Boolean).join(' · ').slice(0, 500);
      ya.estadoPlanilla = ya.estadoPlanilla || nuevo.estadoPlanilla;
      if (!ya.fecha) ya.fecha = nuevo.fecha;
    } else porTel.set(tel.telefono, nuevo);
  }
  const contactos = [...porTel.values()].map((c) => {
    // Seguridad primero: palabras de alguien muy joven en los nombres o la nota; después, el número
    const joven = motivoJoven([...c.nombres, c.nota].join(' · '));
    let estado = 'pendiente'; let motivo = null; let tipoMotivo = null;
    if (joven) { estado = 'revisar'; tipoMotivo = 'joven'; motivo = `El nombre o la nota dice "${joven}": confirmá que es mayor de edad antes de escribirle.`; }
    else if (c.motivoTel === 'extranjero') { estado = 'revisar'; tipoMotivo = 'telefono'; motivo = 'Número extranjero (no es de Argentina).'; }
    else if (c.motivoTel === 'invalido') { estado = 'revisar'; tipoMotivo = 'telefono'; motivo = 'Número inválido o incompleto.'; }
    else if (c.estadoPlanilla === 'revisar') { estado = 'revisar'; tipoMotivo = 'planilla'; motivo = `La planilla lo marca para revisar${c.nota ? `: ${c.nota.slice(0, 160)}` : '.'}`; }
    else if (c.estadoPlanilla) estado = c.estadoPlanilla;
    return { ...c, estado, motivo, tipoMotivo };
  });
  return { contactos, filasLeidas: leidas, sinTelefono: sinTel, repetidosEnArchivo: repetidos, columnas: Object.keys(mapa) };
}

// ---------- Base ----------
// Importa (o vuelve a importar) sin duplicar: une nombres, ciudades, sitios y enlaces; avisos = el mayor; el estado
// guardado se respeta, salvo que un contacto pendiente sin revisar traiga ahora palabras de alguien muy joven (pasa a
// "revisar"). Los teléfonos que ya son de un perfil del sitio quedan "ya está en el sitio".
export async function importarContactos(pool, contactos) {
  const lote = contactos.map((c) => ({
    telefono: c.telefono, comparable: c.comparable, nombres: c.nombres, ciudades: c.ciudades, categorias: c.categorias, sitios: c.sitios,
    urls: c.urls, avisos: c.avisos, fecha_aviso: c.fecha || null, nota: c.nota || null, estado: c.estado, motivo: c.motivo, tipo_motivo: c.tipoMotivo,
  }));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `INSERT INTO captacion_contactos AS c (telefono, comparable, nombres, ciudades, categorias, sitios, urls, avisos, fecha_aviso, nota, estado, motivo, tipo_motivo)
       SELECT x.telefono, x.comparable, x.nombres, x.ciudades, x.categorias, x.sitios, x.urls, x.avisos, x.fecha_aviso, x.nota, x.estado, x.motivo, x.tipo_motivo
         FROM jsonb_to_recordset($1::jsonb) AS x(telefono text, comparable text, nombres text[], ciudades text[], categorias text[], sitios text[], urls text[],
              avisos int, fecha_aviso text, nota text, estado text, motivo text, tipo_motivo text)
       ON CONFLICT (telefono) DO UPDATE SET
         nombres = (SELECT COALESCE(array_agg(v ORDER BY o), '{}') FROM (SELECT DISTINCT ON (lower(v)) v, o FROM unnest(c.nombres || EXCLUDED.nombres) WITH ORDINALITY AS u(v, o) ORDER BY lower(v), o) z)[1:20],
         ciudades = (SELECT COALESCE(array_agg(v ORDER BY o), '{}') FROM (SELECT DISTINCT ON (lower(v)) v, o FROM unnest(c.ciudades || EXCLUDED.ciudades) WITH ORDINALITY AS u(v, o) ORDER BY lower(v), o) z)[1:10],
         categorias = (SELECT COALESCE(array_agg(v ORDER BY o), '{}') FROM (SELECT DISTINCT ON (lower(v)) v, o FROM unnest(c.categorias || EXCLUDED.categorias) WITH ORDINALITY AS u(v, o) ORDER BY lower(v), o) z)[1:5],
         sitios = (SELECT COALESCE(array_agg(v ORDER BY o), '{}') FROM (SELECT DISTINCT ON (lower(v)) v, o FROM unnest(c.sitios || EXCLUDED.sitios) WITH ORDINALITY AS u(v, o) ORDER BY lower(v), o) z)[1:10],
         urls = (SELECT COALESCE(array_agg(v ORDER BY o), '{}') FROM (SELECT DISTINCT ON (v) v, o FROM unnest(c.urls || EXCLUDED.urls) WITH ORDINALITY AS u(v, o) ORDER BY v, o) z)[1:10],
         avisos = GREATEST(c.avisos, EXCLUDED.avisos),
         fecha_aviso = COALESCE(EXCLUDED.fecha_aviso, c.fecha_aviso),
         nota = COALESCE(EXCLUDED.nota, c.nota),
         estado = CASE WHEN c.estado IN ('pendiente', 'abierto') AND c.revisado IS NULL AND EXCLUDED.estado = 'revisar' AND EXCLUDED.tipo_motivo = 'joven' THEN 'revisar' ELSE c.estado END,
         motivo = CASE WHEN c.estado IN ('pendiente', 'abierto') AND c.revisado IS NULL AND EXCLUDED.estado = 'revisar' AND EXCLUDED.tipo_motivo = 'joven' THEN EXCLUDED.motivo ELSE c.motivo END,
         tipo_motivo = CASE WHEN c.estado IN ('pendiente', 'abierto') AND c.revisado IS NULL AND EXCLUDED.estado = 'revisar' AND EXCLUDED.tipo_motivo = 'joven' THEN 'joven' ELSE c.tipo_motivo END,
         actualizado = now()
       RETURNING (xmax = 0) AS nuevo`, [JSON.stringify(lote)]);
    const nuevos = r.rows.filter((x) => x.nuevo).length;
    // Ya están en el sitio (WhatsApp de un perfil): se excluyen de la cola
    const enSitio = await client.query(
      `UPDATE captacion_contactos cc SET estado = 'en_sitio', cuenta_id = p.cuenta_id, actualizado = now()
         FROM perfiles p
        WHERE cc.estado IN ('pendiente', 'abierto') AND COALESCE(p.datos->>'whatsapp', '') <> ''
          AND cc.comparable = captacion_comparable(p.datos->>'whatsapp')
          AND cc.comparable = ANY($1::text[])
       RETURNING cc.id`, [lote.map((x) => x.comparable)]);
    await client.query('COMMIT');
    return { nuevos, actualizados: r.rows.length - nuevos, enSitio: enSitio.rowCount };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// Contacto de captación de un teléfono (dígitos de WhatsApp) o null
export async function contactoPorTelefono(db, telefono) {
  const comp = telefonoComparable(telefono);
  if (comp.length < 8) return null;
  const { rows } = await db.query('SELECT * FROM captacion_contactos WHERE comparable = $1 ORDER BY creado LIMIT 1', [comp]);
  return rows[0] || null;
}
