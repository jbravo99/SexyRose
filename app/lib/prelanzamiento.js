// Home provisoria (modo pre-lanzamiento). Decisión de Juan (13/11/2026): mientras el sitio está vacío, en / se ve
// solo una portada que invita a las acompañantes a publicar su perfil; el resto del sitio público (lugares, perfiles,
// Cerca, Swipe, Shorts, Stars, favoritos, links) no se muestra y el registro de interesados queda cerrado.
// Se prende y se apaga desde Admin → Ajustes (ajuste `prelanzamiento` = { activo: bool }). Si nunca se guardó, está
// PRENDIDO (el sitio arranca vacío).
//
// Lo usan: routes/sitio.js (estado público vacío), routes/spa-sitio.js (302 de lo oculto y SEO de la portada),
// server.js (sitemap y packs por perfil), routes/cliente.js (registro de interesados) y routes/admin-fase1.js.
// El front (mvp/src/prod-prelanzamiento.js) arma la portada y repite estos títulos y descripciones.
import { cargarCatalogos } from './catalogos.js';

export const CLAVE_PRELANZAMIENTO = 'prelanzamiento';

// Valor cuando el ajuste nunca se guardó: prendido. Solo las pruebas lo cambian (config.prelanzamientoPorDefecto,
// por código: nunca por variables de entorno).
let porDefecto = true;
export function configurarPrelanzamiento({ porDefecto: d } = {}) { if (typeof d === 'boolean') porDefecto = d; }

export function prelanzamientoActivo(ajustes) {
  const v = ajustes ? ajustes[CLAVE_PRELANZAMIENTO] : null;
  if (v && typeof v === 'object' && typeof v.activo === 'boolean') return v.activo;
  return porDefecto;
}

// ¿Está prendido? (catálogos con caché de 1 minuto; el admin los invalida al guardar). Sin base: apagado (no hay
// datos que esconder). Si la base falla: el valor por defecto.
export async function prelanzamientoEn(pool) {
  if (!pool) return false;
  try { return prelanzamientoActivo((await cargarCatalogos(pool)).ajustes); } catch { return porDefecto; }
}

export function validarPrelanzamiento(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v) || typeof v.activo !== 'boolean') return { error: 'Formato inválido: { activo: true | false }.' };
  return { valor: { activo: v.activo } };
}

// Mensaje neutro del registro de interesados mientras está prendido
export const REGISTRO_CLIENTE_CERRADO = 'Por ahora no se pueden crear cuentas nuevas. Probá de nuevo más adelante.';

// Título y descripción de la portada provisoria (iguales en mvp/src/prod-prelanzamiento.js)
export const SEO_PRELANZAMIENTO = Object.freeze({
  es: {
    title: 'Escorts y acompañantes en Argentina | SexyRose',
    description: 'SexyRose: avisos de acompañantes y escorts en Argentina. Abrimos muy pronto: si sos acompañante, ya podés crear tu perfil.',
  },
  en: {
    title: 'Escorts and companions in Argentina | SexyRose',
    description: 'SexyRose: companion and escort ads in Argentina. Opening very soon: if you are a companion, you can already create your profile.',
  },
  pt: {
    title: 'Acompanhantes e escorts na Argentina | SexyRose',
    description: 'SexyRose: anúncios de acompanhantes e escorts na Argentina. Abrimos muito em breve: se você é acompanhante, já pode criar seu perfil.',
  },
});

// Secciones del SPA que siguen abiertas (primera palabra, es/en/pt): registro e ingreso de acompañantes, su panel,
// confirmar email y nueva contraseña (/cuenta/…), la vuelta de una compra y la cuenta de interesados (salvo el registro).
const ABIERTAS = new Set(['registro', 'sign-up', 'cadastro', 'ingresar', 'login', 'entrar', 'panel', 'cuenta', 'compra', 'cliente']);

// segs = tramos de la dirección en minúsculas, sin /en o /pt. true = no se muestra (302 a la portada).
export function ocultaEnPrelanzamiento(segs) {
  if (!segs.length) return false;
  if (segs[0] === 'cliente') return segs[1] === 'registro';
  return !ABIERTAS.has(segs[0]);
}
