// Avisos a la acompañante sobre su perfil y su verificación (18/11/2026, pedido de Juan: "mientras espera nuestra
// verificación estaría bueno que le avisemos, y que reciba un email y notificación en la misma plataforma al verificarse").
// Cada aviso es una notificación del panel (Avisos y la campana del encabezado) + un email, una sola vez por evento:
//   - perfil_en_revision     el perfil pasó solo a revisión (lib/revision-auto.js, en la misma transacción del cambio)
//   - verificacion_aprobada  el admin aprobó la identidad y el perfil todavía no se publica
//   - perfil_publicado       el admin publicó el perfil; si lo publica la misma aprobación de la identidad, UN aviso
//                            combinado ("Te verificamos y …") en lugar de dos
//   - verificacion_rechazada / perfil_rechazado: el mismo texto que el email, con el motivo que escribió el admin
// Con la home provisoria prendida, "publicado" no dice que ya se ve: dice que está aprobado y que abrimos muy pronto
// (el mismo texto que Mi perfil). Los emails salen en castellano (las cuentas no guardan idioma); las notificaciones se
// traducen en el panel (mvp/src/prod-sitio.js, "Avisos (textos del servidor)").
// El link de cada aviso (a qué sección del panel lleva) lo pone el panel según el tipo (NOTIF_LINK en prod-sitio.js) y
// el email lleva el mismo destino (LINK_EMAIL).
// Publicar antes de verificar (19/11/2026, decisión de Juan): si el admin publica un perfil sin la identidad verificada,
// el aviso de publicado suma el plazo de 7 días para mandar la verificación; a 2 días del final, "verificacion_plazo";
// si vence sin mandarla, "verificacion_vencida" (el perfil se pausa; lib/plazo-verificacion.js).
import { emailBasico, sendMail as enviarMail, urlSitio } from './mail.js';

export const ABRIMOS_PRONTO = 'Todavía no se ve en el sitio: abrimos muy pronto.';
// Días para mandar la verificación después de publicar. 0 = sin plazo (25/11/2026, Juan: "tiempo ilimitado; yo las
// contacto por WhatsApp para que manden su ID"): al publicar no se fija plazo y nadie se pausa por no verificar.
export const DIAS_VERIFICACION = 0;
// Fecha del plazo como en los demás avisos ("26 de noviembre de 2026")
const fmtPlazo = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: 'numeric', month: 'long', year: 'numeric' });
export const fechaPlazo = (d) => (d ? fmtPlazo.format(new Date(d)) : '');
const plazoTxt = (plazo) => `Tenés hasta el ${plazo} para verificar tu identidad desde tu panel. Si no, tu perfil se pausa hasta que la mandes.`;
const LINK_EMAIL = {
  perfil_en_revision: '/panel', verificacion_aprobada: '/panel/verificacion', perfil_publicado: '/panel/mi-perfil',
  verificacion_rechazada: '/panel/verificacion', perfil_rechazado: '/panel',
  verificacion_plazo: '/panel/verificacion', verificacion_vencida: '/panel/verificacion',
};
const BOTON = { perfil_publicado: 'Ver mi perfil', verificacion_rechazada: 'Ir a mi verificación', verificacion_plazo: 'Verificar mi identidad', verificacion_vencida: 'Verificar mi identidad' };

// Cada aviso: tipo, titulo y texto de la notificación; el email repite el título y los mismos párrafos.
export const avisos = {
  enRevision: () => aviso('perfil_en_revision', 'Recibimos tu perfil',
    ['Recibimos tu perfil: lo estamos revisando. Te avisamos por acá y por email cuando esté listo.'], '',
    ['Recibimos tu perfil: lo estamos revisando. Te avisamos por email y en tu panel cuando esté listo.']),
  // estado = estado del perfil después de aprobar (borrador o rechazado: le falta algo; el resto: nada que hacer)
  verificada: ({ estado } = {}) => aviso('verificacion_aprobada', 'Te verificamos',
    ['Tu identidad quedó verificada.', ...(['borrador', 'rechazado'].includes(estado) ? ['Cuando completes lo que falta en tu perfil, pasa solo a revisión.'] : [])]),
  // plazo: fecha límite para mandar la verificación (solo si se publica sin haberla mandado)
  publicado: ({ prelanzamiento = false, verificada = false, plazo = '' } = {}) => aviso('perfil_publicado',
    verificada ? (prelanzamiento ? 'Te verificamos y tu perfil está aprobado' : 'Te verificamos y tu perfil ya está publicado')
      : (prelanzamiento ? 'Tu perfil está aprobado' : 'Tu perfil ya está publicado'),
    [verificada ? 'Revisamos tu verificación y tu perfil.' : 'Revisamos tu perfil.',
      prelanzamiento ? `Quedó aprobado. ${ABRIMOS_PRONTO}` : 'Ya se ve en el sitio.', ...(plazo ? [plazoTxt(plazo)] : [])]),
  // plazo: si su perfil está publicado y todavía corre el plazo para mandarla
  verificacionRechazada: (motivo, { plazo = '' } = {}) => aviso('verificacion_rechazada', 'Tu verificación no fue aprobada',
    ['No pudimos aprobar tu verificación.', 'Podés volver a enviar las fotos de tu documento y la selfie desde tu panel.',
      ...(plazo ? [`Tenés hasta el ${plazo} para mandarla de nuevo. Si no, tu perfil se pausa hasta que la mandes.`] : [])], motivo),
  plazoVerificacion: (plazo) => aviso('verificacion_plazo', 'Te quedan 2 días para verificarte', [plazoTxt(plazo)]),
  verificacionVencida: () => aviso('verificacion_vencida', 'Tu perfil quedó pausado',
    ['No recibimos tu verificación de identidad a tiempo, así que pausamos tu perfil.', 'Mandala desde tu panel y tu perfil vuelve a verse solo.']),
  perfilRechazado: (motivo) => aviso('perfil_rechazado', 'Tu perfil no fue aprobado',
    ['No pudimos aprobar tu perfil.', 'Corregí lo necesario desde tu panel: cuando guardes los cambios, tu perfil vuelve solo a revisión.'], motivo),
};

// El motivo va al final ("… Motivo: …"): el panel lo muestra tal cual (lo escribió el admin) y traduce el resto.
// parrafosEmail: cuando el email dice otra cosa (en el email, "por acá" sería el email).
function aviso(tipo, titulo, parrafos, motivo = '', parrafosEmail = null) {
  const m = String(motivo || '').trim();
  const texto = [...parrafos, ...(m ? [`Motivo: ${m}`] : [])].join(' ');
  const pe = parrafosEmail || parrafos;
  const email = { subject: titulo, titulo, parrafos: m ? [pe[0], `Motivo: ${m}`, ...pe.slice(1)] : pe };
  return { tipo, titulo, texto: texto.slice(0, 900), email };
}

// Notificación del panel. db = la conexión de la transacción del cambio (así sale una sola vez con el cambio, o ninguna).
export async function guardarAviso(db, cuentaId, a) {
  await db.query('INSERT INTO notificaciones (cuenta_id, tipo, titulo, texto) VALUES ($1, $2, $3, $4)', [cuentaId, a.tipo, a.titulo, a.texto]);
}

// Email del aviso (formato de los emails de la cuenta: título, párrafos y botón al panel). No falla: lo registra.
export function createAvisosCuenta({ pool, sendMail = enviarMail, log = () => {} }) {
  async function email(cuentaId, a) {
    try {
      const { rows } = await pool.query("SELECT email FROM cuentas WHERE id = $1 AND estado <> 'baja'", [cuentaId]);
      if (!rows[0]) return false;
      const boton = { texto: BOTON[a.tipo] || 'Ir a mi panel', url: urlSitio(LINK_EMAIL[a.tipo] || '/panel') };
      await sendMail({ to: rows[0].email, subject: a.email.subject, ...emailBasico({ titulo: a.email.titulo, parrafos: a.email.parrafos, boton }) });
      return true;
    } catch (e) {
      log('avisos: no se pudo enviar el email:', e.code || e.message);
      return false;
    }
  }
  return { email, guardar: guardarAviso };
}
