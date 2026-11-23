// Invitaciones de captación escritas por la IA (22/11/2026, pedido de Juan: "cada vez que pongo abrir WhatsApp genere
// un mensaje inicial diferente, manteniendo los lineamientos ya acordados"; "debe ser incluso más corto"; sin link).
// Corre en el agente (que tiene la clave de Anthropic): a los próximos contactos pendientes de la cola que todavía no
// tienen mensaje les escribe uno, lo valida (lib/captacion.js → validarInvitacion) y lo guarda en
// captacion_contactos.mensaje. "Abrir chat" usa ese texto (routes/admin-captacion.js); el asistente lo reconoce como la
// invitación de ese contacto. Si la IA falla o no cumple las reglas (tres intentos, el 2.º y el 3.º corrigiendo el
// anterior), queda sin mensaje y va la versión fija.
// 23/11/2026 (v2 de las reglas): las invitaciones escritas con reglas anteriores se vuelven a escribir mientras el
// contacto siga "pendiente" (las "abierto" no: Juan ya pudo haberla mandado y el asistente la reconoce por ese texto).
import { REGLAS_INVITACION, correccionInvitacion, leerAjustesCaptacion, pedidoInvitacion, revisarInvitacion } from './captacion.js';

export const ADELANTO = 12;      // contactos de la cola con la invitación ya escrita
export const POR_PASADA = 3;     // cuántos escribe en cada pasada del agente (cada ~10 s)

export function createInvitacionesIa({ pool, llm, log = () => {}, azar = Math.random }) {
  let corriendo = null;
  async function completar({ porPasada = POR_PASADA } = {}) {
    if (!llm || !llm.disponible || typeof llm.completar !== 'function') return 0;
    if (corriendo) return corriendo;
    corriendo = (async () => {
      const aj = await leerAjustesCaptacion(pool);
      if (!aj.ia) return 0;
      // Los abiertos sin invitación y los primeros ADELANTO pendientes de la cola (mismo orden que el admin) sin invitación
      // o con una de reglas anteriores. 23/11/2026: los abiertos ya no ocupan el lugar de los pendientes (con 12 o más
      // abiertos, ningún pendiente recibía la suya).
      const { rows } = await pool.query(
        `(SELECT id FROM captacion_contactos WHERE estado = 'abierto' AND mensaje IS NULL ORDER BY abierto LIMIT $2)
         UNION ALL
         (SELECT id FROM (SELECT id, mensaje, mensaje_reglas FROM captacion_contactos WHERE estado = 'pendiente'
             ORDER BY avisos DESC, lower(COALESCE(ciudades[1], 'zzz')), telefono LIMIT $1) x
           WHERE mensaje IS NULL OR COALESCE(mensaje_reglas, 1) < $3 LIMIT $2)
         LIMIT $2`, [ADELANTO, porPasada, REGLAS_INVITACION]);
      let n = 0;
      for (const r of rows) {
        const { rows: ult } = await pool.query(
          'SELECT mensaje FROM captacion_contactos WHERE mensaje IS NOT NULL AND COALESCE(mensaje_reglas, 1) >= $1 ORDER BY mensaje_creado DESC NULLS LAST LIMIT 8', [REGLAS_INVITACION]);
        const anteriores = ult.map((x) => x.mensaje);
        // Hasta 3 intentos (23/11/2026): si una no cumple, el siguiente le pide corregirla diciéndole qué regla falló;
        // cada descarte queda en el log con el motivo.
        let ok = null; let previa = null; let falla = null;
        for (let i = 0; i < 3 && !ok; i++) {
          try {
            const p = pedidoInvitacion(anteriores, azar);
            const prompt = previa ? correccionInvitacion(previa, falla) : p.prompt;
            const crudo = await llm.completar({ system: p.system, prompt, maxTokens: 300 });
            const r = revisarInvitacion(crudo);
            if (r.texto && anteriores.includes(r.texto)) { previa = null; log('captación: invitación descartada: repetida'); continue; }
            if (r.texto) ok = r.texto;
            else { previa = crudo; falla = r; log(`captación: invitación descartada (intento ${i + 1}): ${r.motivo}`); }
          } catch (e) { log('captación: la IA no pudo escribir una invitación:', e.message); break; }
        }
        if (!ok) continue;
        const u = await pool.query(
          `UPDATE captacion_contactos SET mensaje = $2, mensaje_creado = now(), mensaje_reglas = $3
            WHERE id = $1 AND (mensaje IS NULL AND estado IN ('pendiente', 'abierto') OR estado = 'pendiente' AND COALESCE(mensaje_reglas, 1) < $3)`,
          [r.id, ok, REGLAS_INVITACION]);
        n += u.rowCount;
      }
      return n;
    })().finally(() => { corriendo = null; });
    return corriendo;
  }
  return { completar };
}
