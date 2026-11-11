// Admin → Ajustes → «Textos del inicio»: textos de la portada del sitio público que Juan edita sin tocar código.
// Se guardan en ajustes (clave `textos_sitio`) y el sitio los recibe en /api/sitio/estado → ajustes.textos_sitio
// (los aplica mvp/src/prod-sitio.js). Se monta dentro del router admin, bajo `${A}/api` (mismo Basic Auth):
//   GET    /textos-sitio   → { valor (lo guardado o null), defaults, actualizado }
//   PUT    /textos-sitio   → { valor: { es: {...}, en?: {...}, pt?: {...} } }  guarda (valida todo)
//   DELETE /textos-sitio   → vuelve a los textos por defecto (borra el ajuste)
// Español obligatorio; inglés y portugués opcionales: un campo vacío usa el texto en español (que el sitio traduce
// solo si es el texto por defecto). Errores: { error } en castellano.
import express from 'express';
import { invalidarCatalogos } from '../lib/catalogos.js';
import { invalidarSitio } from './sitio.js';

export const CLAVE_TEXTOS_SITIO = 'textos_sitio';
const LANGS = ['es', 'en', 'pt'];
const MAX = { heroEyebrow: 60, heroTitulo: 120, heroSubtitulo: 300, faqTitulo: 120, pregunta: 160, respuesta: 1200 };
const MAX_FAQ = 12;

// Los textos que el sitio muestra hoy (no cambiar la redacción: es lo que ve el visitante si no se editó nada)
export const TEXTOS_SITIO_DEFAULT = Object.freeze({
  es: {
    heroEyebrow: 'Compañía para salidas',
    heroTitulo: 'Compañía para tu próxima *salida*.',
    heroSubtitulo: 'Elegí con quién tomar un café, recorrer un museo o ir a un evento en tu ciudad. Deslizás, abrís WhatsApp y arman el plan. Sin registro: tu identidad queda reservada.',
    faqTitulo: 'Lo que todos preguntan antes de empezar',
    faq: [
      { pregunta: '¿Es seguro?', respuesta: 'Las salidas son siempre en lugares públicos: cafés, museos, parques, eventos. Los perfiles de acompañantes pasan por verificación de identidad y cualquier conducta inapropiada se puede reportar desde el perfil. El WhatsApp se comparte solo después de que vos mostrás interés.' },
      { pregunta: '¿Qué incluye una salida?', respuesta: 'Compañía y buena conversación para la actividad que propongas: un café, una muestra, una caminata, un recital, una cena de trabajo. El plan, la duración y la tarifa los acordás directamente con la acompañante por WhatsApp.' },
      { pregunta: '¿Qué no está permitido?', respuesta: 'Ningún tipo de contenido o propuesta sexual, ni dentro ni fuera de la plataforma. Tampoco insistir después de un no, pedir datos personales que no fueron ofrecidos ni proponer encuentros en lugares privados. Quien lo hace queda fuera.' },
      { pregunta: '¿Cómo funciona la verificación?', respuesta: 'Cada acompañante envía una selfie con su documento y una foto del documento, que revisa el equipo de SexyRose: confirmamos que es mayor de edad y que es la persona de las fotos. Solo se publican los perfiles verificados.' },
      { pregunta: '¿Puedo cancelar?', respuesta: 'Las salidas se cancelan con quien las acordaste, por WhatsApp y con tiempo. Los planes de las acompañantes se pagan por mes o por semana y no se renuevan solos.' },
    ],
  },
});

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; this.expose = true; } }
const NOMBRE = { heroEyebrow: 'La línea de arriba del título', heroTitulo: 'El título', heroSubtitulo: 'El subtítulo', faqTitulo: 'El título de las preguntas frecuentes' };
const IDIOMA = { es: 'español', en: 'inglés', pt: 'portugués' };
// Texto de una línea: sin saltos ni caracteres de control; espacios repetidos a uno.
const linea = (s) => s.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
// Respuesta: admite saltos de línea (párrafos), nada más.
const parrafo = (s) => s.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

// Valida y normaliza { es, en?, pt? }. Devuelve { valor } o { error }.
export function validarTextosSitio(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { error: 'Formato inválido: { es: {...}, en: {...}, pt: {...} }.' };
  const extra = Object.keys(v).filter((k) => !LANGS.includes(k));
  if (extra.length) return { error: `Idioma desconocido: ${extra[0]}. Solo es, en y pt.` };
  if (!v.es) return { error: 'Faltan los textos en español.' };
  const out = {};
  for (const lang of LANGS) {
    const t = v[lang];
    if (t == null) continue;
    if (typeof t !== 'object' || Array.isArray(t)) return { error: `Formato inválido en ${IDIOMA[lang]}.` };
    const o = {};
    for (const campo of ['heroEyebrow', 'heroTitulo', 'heroSubtitulo', 'faqTitulo']) {
      const x = t[campo];
      if (x != null && typeof x !== 'string') return { error: `${NOMBRE[campo]} (${IDIOMA[lang]}) tiene que ser texto.` };
      const s = linea(x || '');
      if (s.length > MAX[campo]) return { error: `${NOMBRE[campo]} (${IDIOMA[lang]}) puede tener hasta ${MAX[campo]} caracteres.` };
      if (lang === 'es' && campo !== 'heroEyebrow' && !s) return { error: `${NOMBRE[campo]} en español es obligatorio.` };
      if (s) o[campo] = s;
    }
    if (t.faq != null) {
      if (!Array.isArray(t.faq)) return { error: `Las preguntas frecuentes (${IDIOMA[lang]}) tienen que ser una lista.` };
      if (t.faq.length > MAX_FAQ) return { error: `Hasta ${MAX_FAQ} preguntas frecuentes por idioma.` };
      const faq = [];
      for (let i = 0; i < t.faq.length; i++) {
        const it = t.faq[i];
        if (!it || typeof it !== 'object' || typeof it.pregunta !== 'string' || typeof it.respuesta !== 'string') return { error: `Pregunta ${i + 1} (${IDIOMA[lang]}): falta la pregunta o la respuesta.` };
        const p = linea(it.pregunta); const r = parrafo(it.respuesta);
        if (!p && !r) continue; // fila vacía: se ignora
        if (p.length < 3 || r.length < 3) return { error: `Pregunta ${i + 1} (${IDIOMA[lang]}): completá la pregunta y la respuesta.` };
        if (p.length > MAX.pregunta) return { error: `Pregunta ${i + 1} (${IDIOMA[lang]}): la pregunta puede tener hasta ${MAX.pregunta} caracteres.` };
        if (r.length > MAX.respuesta) return { error: `Pregunta ${i + 1} (${IDIOMA[lang]}): la respuesta puede tener hasta ${MAX.respuesta} caracteres.` };
        faq.push({ pregunta: p, respuesta: r });
      }
      // En español la lista es la que se muestra (vacía = sin sección); en inglés/portugués vacía = usar la de español
      if (lang === 'es' || faq.length) o.faq = faq;
    } else if (lang === 'es') o.faq = [];
    if (lang === 'es' || Object.keys(o).length) out[lang] = o;
  }
  return { valor: out };
}

export function createAdminTextosSitioRouter({ pool, apiPost }) {
  const r = express.Router();
  const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  const invalidar = () => { invalidarCatalogos(); invalidarSitio(); };
  const leer = async () => {
    const { rows } = await pool.query('SELECT valor, actualizado FROM ajustes WHERE clave = $1', [CLAVE_TEXTOS_SITIO]);
    return { valor: rows[0] ? rows[0].valor : null, actualizado: rows[0] ? rows[0].actualizado : null, defaults: TEXTOS_SITIO_DEFAULT };
  };
  r.get('/textos-sitio', ah(async (req, res) => { res.set('Cache-Control', 'no-store'); res.json(await leer()); }));
  r.put('/textos-sitio', apiPost, ah(async (req, res) => {
    const b = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    if (!('valor' in b)) throw new HttpError(400, 'Falta el valor.');
    const v = validarTextosSitio(b.valor);
    if (v.error) throw new HttpError(400, v.error);
    await pool.query(
      'INSERT INTO ajustes (clave, valor, actualizado) VALUES ($1, $2::jsonb, now()) ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado = now()',
      [CLAVE_TEXTOS_SITIO, JSON.stringify(v.valor)]);
    invalidar();
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, ...(await leer()) });
  }));
  r.delete('/textos-sitio', apiPost, ah(async (req, res) => {
    await pool.query('DELETE FROM ajustes WHERE clave = $1', [CLAVE_TEXTOS_SITIO]);
    invalidar();
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, ...(await leer()) });
  }));
  // Errores propios con mensaje (400/404); el resto sigue al manejador de errores del admin
  r.use((e, req, res, next) => {
    if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
    next(e);
  });
  return r;
}
