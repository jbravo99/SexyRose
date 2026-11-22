// Invitaciones de captación escritas por la IA (22/11/2026, pedido de Juan: "cada vez que pongo abrir WhatsApp genere
// un mensaje inicial diferente, manteniendo los lineamientos ya acordados"; "debe ser incluso más corto"; sin link).
// Corre en el agente (que tiene la clave de Anthropic): a los próximos contactos pendientes de la cola que todavía no
// tienen mensaje les escribe uno, lo valida (lib/captacion.js → validarInvitacion) y lo guarda en
// captacion_contactos.mensaje. "Abrir chat" usa ese texto (routes/admin-captacion.js); el asistente lo reconoce como la
// invitación de ese contacto. Si la IA falla o no cumple las reglas (dos intentos), queda sin mensaje y va la versión fija.
import { leerAjustesCaptacion, pedidoInvitacion, validarInvitacion } from './captacion.js';

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
      // Los primeros de la cola (mismo orden que el admin) que todavía no tienen invitación
      const { rows } = await pool.query(
        `SELECT id FROM (SELECT id, mensaje FROM captacion_contactos WHERE estado IN ('pendiente', 'abierto')
            ORDER BY (estado = 'abierto') DESC, avisos DESC, lower(COALESCE(ciudades[1], 'zzz')), telefono LIMIT $1) x
          WHERE mensaje IS NULL LIMIT $2`, [ADELANTO, porPasada]);
      let n = 0;
      for (const r of rows) {
        const { rows: ult } = await pool.query('SELECT mensaje FROM captacion_contactos WHERE mensaje IS NOT NULL ORDER BY mensaje_creado DESC NULLS LAST LIMIT 8');
        const anteriores = ult.map((x) => x.mensaje);
        let ok = null;
        for (let i = 0; i < 2 && !ok; i++) {
          try {
            const p = pedidoInvitacion(anteriores, azar);
            const t = validarInvitacion(await llm.completar({ system: p.system, prompt: p.prompt, maxTokens: 200 }));
            if (t && !anteriores.includes(t)) ok = t;
          } catch (e) { log('captación: la IA no pudo escribir una invitación:', e.message); break; }
        }
        if (!ok) continue;
        const u = await pool.query("UPDATE captacion_contactos SET mensaje = $2, mensaje_creado = now() WHERE id = $1 AND mensaje IS NULL AND estado IN ('pendiente', 'abierto')", [r.id, ok]);
        n += u.rowCount;
      }
      return n;
    })().finally(() => { corriendo = null; });
    return corriendo;
  }
  return { completar };
}
