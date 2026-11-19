// Plazo para verificar la identidad (19/11/2026, decisión de Juan): "yo le doy en publicar cuando carguen las fotos de su
// perfil aunque sea, luego ya tienen 7 días para verificar enviando su DNI. Si no verifican en ese tiempo se les suspende
// de momento el perfil".
//   - Al publicar un perfil sin la identidad verificada, el admin fija perfiles.verificacion_limite = ahora + 7 días
//     (routes/admin-fase1.js) y el aviso de publicado dice hasta cuándo tiene.
//   - El plazo corre hasta que la MANDA (verificacion = 'pendiente'): con la verificación enviada ya no se pausa, aunque
//     Juan todavía no la haya revisado. Si Juan la rechaza, vuelve a correr el MISMO plazo (si ya pasó, se pausa en la
//     próxima pasada).
//   - Faltando 2 días: aviso "Te quedan 2 días" (notificación + email), una sola vez por plazo (verificacion_aviso2).
//   - Vencido sin mandarla: el perfil se pausa (pausado_por = 'sin_verificacion') con aviso. Vuelve a publicarse solo
//     cuando la manda (routes/cuenta.js → POST /verificacion, con reactivarSiPausado).
// Corre al arrancar y cada hora (server.js). Seguro con dos pasadas a la vez: cada cambio es condicional.
import { avisos, fechaPlazo, guardarAviso } from './avisos-cuenta.js';

const SIN_MANDAR = "p.verificacion IN ('sin_enviar', 'rechazada')";

export function createPlazoVerificacion({ pool, avisosCuenta = null, invalidar = () => {}, log = () => {} }) {
  const email = async (cuentaId, a) => { if (avisosCuenta) await avisosCuenta.email(cuentaId, a); };

  async function ejecutar() {
    const out = { avisos2: 0, pausados: 0 };
    // 1) Faltan 2 días o menos (y todavía no venció): aviso, una vez por plazo
    const { rows: av } = await pool.query(
      `UPDATE perfiles p SET verificacion_aviso2 = now()
        WHERE p.estado = 'publicado' AND ${SIN_MANDAR} AND p.verificacion_limite IS NOT NULL
          AND p.verificacion_limite > now() AND p.verificacion_limite <= now() + interval '2 days' AND p.verificacion_aviso2 IS NULL
        RETURNING p.cuenta_id, p.verificacion_limite`);
    for (const r of av) {
      const a = avisos.plazoVerificacion(fechaPlazo(r.verificacion_limite));
      try { await guardarAviso(pool, r.cuenta_id, a); } catch (e) { log('plazo de verificación: aviso falló:', e.message); }
      await email(r.cuenta_id, a);
      out.avisos2++;
    }
    // 2) Vencido sin mandarla: se pausa
    const { rows: pz } = await pool.query(
      `UPDATE perfiles p SET estado = 'pausado', pausado_por = 'sin_verificacion', actualizado = now()
        WHERE p.estado = 'publicado' AND ${SIN_MANDAR} AND p.verificacion_limite IS NOT NULL AND p.verificacion_limite <= now()
        RETURNING p.cuenta_id`);
    for (const r of pz) {
      const a = avisos.verificacionVencida();
      try { await guardarAviso(pool, r.cuenta_id, a); } catch (e) { log('plazo de verificación: aviso falló:', e.message); }
      await email(r.cuenta_id, a);
      out.pausados++;
    }
    if (pz.length) { invalidar(); log(`plazo de verificación: ${pz.length} perfil(es) pausado(s) por no mandar la verificación`); }
    return out;
  }

  return { ejecutar };
}

// Cuando ella manda la verificación: si su perfil estaba pausado por el plazo, vuelve a publicarse. db = la conexión de
// la transacción del envío. Devuelve true si se reactivó.
export async function reactivarSiPausado(db, cuentaId) {
  const r = await db.query(
    `UPDATE perfiles SET estado = 'publicado', pausado_por = NULL, actualizado = now()
      WHERE cuenta_id = $1 AND estado = 'pausado' AND pausado_por = 'sin_verificacion'`, [cuentaId]);
  return r.rowCount > 0;
}
