// Datos del perfil: validación de lo que edita la acompañante, slug, completitud y la forma pública.
// Lo usan routes/cuenta.js, routes/sitio.js y el admin.

const BIDI_AND_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩﻿]/g;
const len = (s) => [...s].length;
export const linea = (v) => (typeof v === 'string' ? v.normalize('NFC').replace(BIDI_AND_CONTROL, '').replace(/\s+/g, ' ').trim() : '');
export const texto = (v) => (typeof v === 'string'
  ? v.normalize('NFC').replace(/\r\n?/g, '\n').replace(BIDI_AND_CONTROL, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  : '');

export const GENEROS = ['mujer', 'trans', 'hombre'];
export const CONTEXTURAS = ['delgada', 'atletica', 'mediana', 'robusta'];
export const SLUGS_RESERVADOS = new Set(['admin', 'api', 'media', 'demo', 'cuenta', 'panel', 'perfil', 'profile', 'hombres', 'men', 'homens',
  'en', 'pt', 'es', 'terminos', 'privacidad', 'contenido', 'trata', 'denunciar', 'buscar', 'swipe', 'cerca', 'shorts', 'stars', 'sitemap',
  'robots', 'inicio', 'login', 'registro', 'sexyrose', 'soporte', 'ayuda', 'contacto']);

export function slugify(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
}

export function edadDe(fecha, hoy = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fecha || ''));
  if (!m) return null;
  const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  let edad = hoy.getUTCFullYear() - y;
  if (hoy.getUTCMonth() + 1 < mo || (hoy.getUTCMonth() + 1 === mo && hoy.getUTCDate() < d)) edad--;
  return edad;
}

export function normalizarWhatsapp(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  if (!s.startsWith('+')) return null;
  const digits = s.replace(/[\s().-]/g, '').slice(1);
  if (!/^\d{8,15}$/.test(digits)) return null;
  return '+' + digits;
}

export function normalizarTelegram(v) {
  const s = String(v || '').trim().replace(/^https?:\/\/t\.me\//i, '').replace(/^@/, '');
  if (!s) return '';
  return /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(s) ? s : null;
}

function urlHttps(v) {
  const s = String(v || '').trim();
  if (!s || s.length > 300) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' || !u.hostname.includes('.') || u.username || u.password) return null;
    return u.href;
  } catch { return null; }
}

// catalogos: { ubic: Map(id → {id, nombre, tipo, padre, activa}), intereses: Set(ids), categorias: Set(ids activas) }
// actual: datos actuales (para merge). bloqueos: { fechaNacimiento: bool } (no se puede cambiar después de verificada).
// Devuelve { datos } (merge completo, solo campos conocidos) o { error }.
export function validarDatos(body, actual, catalogos, bloqueos = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Formato de datos inválido.' };
  const d = { ...(actual || {}) };
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
  const vacio = (v) => v === null || v === undefined || v === '';

  if (has('displayName')) {
    const v = linea(body.displayName);
    if (len(v) < 2 || len(v) > 30) return { error: 'El nombre artístico tiene que tener entre 2 y 30 caracteres.' };
    d.displayName = v;
  }
  if (has('genero')) {
    if (!GENEROS.includes(body.genero)) return { error: 'Elegí un género válido.' };
    d.genero = body.genero;
  }
  if (has('fechaNacimiento')) {
    const v = String(body.fechaNacimiento || '');
    if (bloqueos.fechaNacimiento && v !== d.fechaNacimiento) return { error: 'Tu fecha de nacimiento ya fue verificada con tu documento y no se puede cambiar. Escribinos si hay un error.' };
    const edad = edadDe(v);
    if (edad === null) return { error: 'La fecha de nacimiento no es válida (formato AAAA-MM-DD).' };
    if (edad < 18) return { error: 'Tenés que ser mayor de 18 años para publicar en SexyRose.' };
    if (edad > 99) return { error: 'La fecha de nacimiento no es válida.' };
    d.fechaNacimiento = v;
  }
  if (has('nacionalidad')) {
    const v = linea(body.nacionalidad);
    if (len(v) > 40) return { error: 'La nacionalidad es demasiado larga.' };
    d.nacionalidad = v || undefined;
  }
  // Ubicación: ids del catálogo. pais → provincia → (zona) → ciudad. La ciudad tiene que estar dentro de la provincia.
  const ubic = catalogos.ubic;
  const enCadena = (id, ancestroId) => { let cur = ubic.get(id); let g = 0; while (cur && g++ < 8) { if (cur.id === ancestroId) return true; cur = cur.padre ? ubic.get(cur.padre) : null; } return false; };
  for (const [k, tipos] of [['pais', ['pais']], ['provincia', ['provincia']], ['ciudad', ['ciudad', 'provincia']]]) {
    if (!has(k)) continue;
    if (vacio(body[k])) { d[k] = undefined; continue; }
    const u = ubic.get(String(body[k]));
    if (!u || !u.activa || !tipos.includes(u.tipo)) return { error: `Elegí ${k === 'pais' ? 'un país' : k === 'provincia' ? 'una provincia' : 'una ciudad'} de la lista.` };
    d[k] = u.id;
  }
  if (has('ciudadSugerida')) {
    const v = linea(body.ciudadSugerida);
    if (len(v) > 60) return { error: 'El nombre de la ciudad es demasiado largo.' };
    d.ciudadSugerida = v || undefined;
  }
  if (d.ciudad) {
    const c = ubic.get(d.ciudad);
    // Ciudad de Buenos Aires: es provincia y ciudad a la vez.
    if (c && c.tipo === 'provincia') d.provincia = c.id;
    if (d.provincia && !enCadena(d.ciudad, d.provincia)) return { error: 'La ciudad no pertenece a la provincia elegida.' };
    if (!d.provincia) { let cur = c; while (cur && cur.tipo !== 'provincia') cur = cur.padre ? ubic.get(cur.padre) : null; if (cur) d.provincia = cur.id; }
  }
  if (d.provincia && !d.pais) { let cur = ubic.get(d.provincia); while (cur && cur.tipo !== 'pais') cur = cur.padre ? ubic.get(cur.padre) : null; if (cur) d.pais = cur.id; }
  if (has('zona')) {
    const v = linea(body.zona);
    if (len(v) > 40) return { error: 'El barrio o zona es demasiado largo (máximo 40 caracteres).' };
    d.zona = v || undefined;
  }
  for (const [k, max, nombre] of [['titular', 80, 'El titular'], ['titularEn', 80, 'El titular en inglés']]) {
    if (!has(k)) continue;
    const v = linea(body[k]);
    if (len(v) > max) return { error: `${nombre} puede tener hasta ${max} caracteres.` };
    d[k] = v || undefined;
  }
  for (const [k, max, nombre] of [['bio', 1500, 'La presentación'], ['bioEn', 1500, 'La presentación en inglés']]) {
    if (!has(k)) continue;
    const v = texto(body[k]);
    if (len(v) > max) return { error: `${nombre} puede tener hasta ${max} caracteres.` };
    d[k] = v || undefined;
  }
  if (has('idiomas')) {
    if (!Array.isArray(body.idiomas) || body.idiomas.length > 6) return { error: 'Podés indicar hasta 6 idiomas.' };
    const v = [...new Set(body.idiomas.map(linea).filter(Boolean))];
    if (v.some((x) => len(x) > 20)) return { error: 'Cada idioma puede tener hasta 20 caracteres.' };
    d.idiomas = v;
  }
  if (has('alturaCm')) {
    if (vacio(body.alturaCm)) d.alturaCm = undefined;
    else {
      const n = Number(body.alturaCm);
      if (!Number.isInteger(n) || n < 120 || n > 220) return { error: 'La altura tiene que estar entre 120 y 220 cm.' };
      d.alturaCm = n;
    }
  }
  if (has('contextura')) {
    if (vacio(body.contextura)) d.contextura = undefined;
    else if (!CONTEXTURAS.includes(body.contextura)) return { error: 'Elegí una contextura de la lista.' };
    else d.contextura = body.contextura;
  }
  if (has('intereses')) {
    if (!Array.isArray(body.intereses)) return { error: 'Formato de intereses inválido.' };
    const v = [...new Set(body.intereses.map(String))];
    if (v.length > 6) return { error: 'Podés elegir hasta 6 intereses.' };
    if (v.some((x) => !catalogos.intereses.has(x))) return { error: 'Hay un interés que no está en la lista.' };
    d.intereses = v;
  }
  if (has('salidas')) {
    if (!Array.isArray(body.salidas)) return { error: 'Formato de salidas inválido.' };
    const v = [...new Set(body.salidas.map(String))];
    if (v.length > 20 || v.some((x) => !catalogos.categorias.has(x))) return { error: 'Hay un tipo de salida que no está en la lista.' };
    d.salidas = v;
  }
  if (has('tarifaDesde')) {
    if (vacio(body.tarifaDesde)) d.tarifaDesde = undefined;
    else {
      const n = Number(body.tarifaDesde);
      if (!Number.isInteger(n) || n < 0 || n > 100000) return { error: 'La tarifa tiene que ser un número entero de dólares.' };
      d.tarifaDesde = n;
    }
  }
  if (has('whatsapp')) {
    const v = normalizarWhatsapp(body.whatsapp);
    if (v === null) return { error: 'El WhatsApp tiene que incluir el código de país, por ejemplo +54 9 11 1234 5678.' };
    d.whatsapp = v || undefined;
  }
  if (has('telegram')) {
    const v = normalizarTelegram(body.telegram);
    if (v === null) return { error: 'El usuario de Telegram no es válido (5 a 32 letras, números o _).' };
    d.telegram = v || undefined;
  }
  if (has('links')) {
    if (!Array.isArray(body.links) || body.links.length > 4) return { error: 'Podés agregar hasta 4 links.' };
    const out = [];
    for (const l of body.links) {
      if (!l || typeof l !== 'object') return { error: 'Formato de links inválido.' };
      const url = urlHttps(l.url);
      if (!url) return { error: 'Cada link tiene que empezar con https:// y ser una dirección válida.' };
      const label = linea(l.label);
      if (len(label) > 30) return { error: 'El nombre de cada link puede tener hasta 30 caracteres.' };
      out.push({ label, url });
    }
    d.links = out;
  }
  for (const k of Object.keys(d)) if (d[k] === undefined) delete d[k];
  return { datos: d };
}

export const MIN_FOTOS = 3;

// Lo que falta para poder enviar el perfil a revisión (textos para la acompañante).
export function faltantesDe({ datos = {}, fotosN = 0, emailVerificado = false, verificacion = 'sin_enviar' }) {
  const f = [];
  if (!emailVerificado) f.push('Confirmá tu email (te mandamos un link).');
  if (!datos.displayName) f.push('Completá tu nombre artístico.');
  if (!datos.genero) f.push('Elegí tu género.');
  if (!datos.fechaNacimiento) f.push('Cargá tu fecha de nacimiento.');
  if (!datos.provincia || !datos.ciudad) f.push('Elegí tu provincia y tu ciudad.');
  if (!datos.whatsapp && !datos.telegram) f.push('Agregá tu WhatsApp o tu usuario de Telegram.');
  if (fotosN < MIN_FOTOS) f.push(`Subí al menos ${MIN_FOTOS} fotos (tenés ${fotosN}).`);
  if (verificacion === 'sin_enviar' || verificacion === 'rechazada') f.push('Enviá tu verificación de identidad (selfie y documento).');
  return f;
}

// Forma pública (lo que ve cualquiera en el sitio). ubic: Map(id → {nombre}).
export function perfilPublico({ cuentaId, slug, datos = {}, fotos = [], videos = [], preview = null, plan = 'E', actualizado, publicadoEn }, ubic) {
  const nombre = (id) => (id && ubic.get(id) ? ubic.get(id).nombre : '');
  return {
    cuentaId,
    slug,
    displayName: datos.displayName || '',
    edad: edadDe(datos.fechaNacimiento),
    genero: datos.genero || 'mujer',
    nacionalidad: datos.nacionalidad || '',
    pais: nombre(datos.pais),
    provincia: nombre(datos.provincia),
    ciudad: nombre(datos.ciudad),
    zona: datos.zona || '',
    ubicacionIds: { pais: datos.pais || null, provincia: datos.provincia || null, ciudad: datos.ciudad || null },
    titular: datos.titular || '',
    bio: datos.bio || '',
    titularEn: datos.titularEn || '',
    bioEn: datos.bioEn || '',
    idiomas: datos.idiomas || [],
    alturaCm: datos.alturaCm || null,
    contextura: datos.contextura || null,
    intereses: datos.intereses || [],
    salidas: datos.salidas || [],
    tarifaDesde: datos.tarifaDesde ?? null,
    fotos: fotos.map((x) => ({ url: x.url, urlMini: x.url_mini || x.url, ancho: x.ancho, alto: x.alto })),
    videos: videos.map((v) => ({ id: v.id, url: v.url, poster: v.url_poster || null, segundos: v.segundos == null ? null : Number(v.segundos), ancho: v.ancho, alto: v.alto })),
    preview: preview && preview.url ? { url: preview.url } : null,
    plan,
    star: plan === 'S',
    verificada: true,
    actualizado,
    publicadoEn,
    contacto: { whatsapp: datos.whatsapp || '', telegram: datos.telegram || '' },
    links: datos.links || [],
  };
}
