// Envío automático a revisión (decisión de Juan, 18/11/2026): no hay más botón "Enviar a revisión". Apenas el perfil
// tiene todo lo obligatorio (lib/perfiles.js → faltantesItems), pasa solo a 'en_revision', con lo mismo que hacía el
// envío a mano: motivo_rechazo en NULL, actualizado = now() y el aviso por Telegram 'perfil_revisar'.
//
// Reglas:
//   - Desde 'borrador': siempre que esté completo.
//   - Desde 'rechazado': solo cuando ella cambió algo después del rechazo (cambio = true: guardó datos distintos,
//     subió, borró u ordenó fotos, confirmó el email o mandó la verificación) y está completo. Mirar el panel no cuenta.
//   - Nunca desde en_revision, publicado, pausado ni suspendido; tampoco si está oculto o la cuenta no está activa.
//   - Un perfil publicado que pierde un requisito (por ejemplo, queda con menos de 3 fotos) sigue publicado, como antes.
// Aviso a ella (18/11/2026, lib/avisos-cuenta.js): la notificación "Recibimos tu perfil" se guarda en la MISMA transacción
// del cambio de estado (una por transición) y el email sale después, sin esperar (opción email = avisos.email).
// Seguro con pedidos simultáneos: la fila del perfil se bloquea (FOR UPDATE) y el cambio de estado es condicional, así
// que dos guardados al mismo tiempo hacen una sola transición y mandan un solo aviso.
// Devuelve true si el perfil pasó a revisión con este llamado.
import { faltantesItems } from './perfiles.js';
import { avisos, guardarAviso } from './avisos-cuenta.js';

export const AVISO_REVISION = 'Hay un perfil nuevo para revisar en el admin.';

export async function revisionAutomatica(pool, cuentaId, { cambio = false, notify = null, email = null, log = () => {} } = {}) {
  const client = await pool.connect();
  let paso = false;
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT p.estado, p.oculto, p.datos, p.verificacion, c.estado AS cuenta_estado, c.email_verificado
         FROM perfiles p JOIN cuentas c ON c.id = p.cuenta_id WHERE p.cuenta_id = $1 FOR UPDATE OF p`, [cuentaId]);
    const p = rows[0];
    const puede = p && p.cuenta_estado === 'activa' && !p.oculto
      && (p.estado === 'borrador' || (p.estado === 'rechazado' && cambio));
    if (puede) {
      const { rows: fs } = await client.query('SELECT count(*)::int AS n FROM fotos WHERE cuenta_id = $1', [cuentaId]);
      const falta = faltantesItems({ datos: p.datos || {}, fotosN: fs[0].n, emailVerificado: Boolean(p.email_verificado), verificacion: p.verificacion });
      if (!falta.length) {
        const r = await client.query(
          "UPDATE perfiles SET estado = 'en_revision', motivo_rechazo = NULL, actualizado = now() WHERE cuenta_id = $1 AND estado = $2",
          [cuentaId, p.estado]);
        paso = r.rowCount === 1;
        if (paso) await guardarAviso(client, cuentaId, avisos.enRevision());
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  // Como el envío a mano: el aviso sale sin esperar a Telegram (la respuesta no se demora)
  if (paso && notify) Promise.resolve().then(() => notify(AVISO_REVISION, 'perfil_revisar')).catch((e) => log('aviso de perfil para revisar:', e.message));
  if (paso && email) Promise.resolve().then(() => email(cuentaId, avisos.enRevision())).catch((e) => log('email de perfil en revisión:', e.message));
  return paso;
}
