// Chips de WhatsApp (19/11/2026, decisión de Juan): varios números atendidos por el asistente. Una fila por chip en
// asistente_whatsapp (id 1 = el de siempre, letra A). Ver db/330-varios-chips.sql.
//   - rol 'captacion': se mandan invitaciones desde ese chip (cupo por día, cola que rota entre los chips) y el
//     asistente atiende las respuestas. Si hay un chip de créditos, ahí no se compran créditos: se pasa el link.
//   - rol 'creditos': adonde apunta "Cargar créditos" del panel; el asistente atiende la compra.
//   - pausado: Juan lo saca a mano (restringido o bloqueado): no aparece para mandar ni para comprar créditos.
export const MAX_CHIPS = 26;
export const ROLES_CHIP = Object.freeze(['captacion', 'creditos']);
export const letraDe = (id) => String.fromCharCode(64 + (Number(id) || 1));
const digitos = (v) => { const d = String(v || '').replace(/\D/g, ''); return d.length >= 8 && d.length <= 15 ? d : ''; };

export async function listarChips(db) {
  const { rows } = await db.query(
    `SELECT id, chr(64 + id) AS letra, rol, pausado, por_dia, estado, numero, error, qr, qr_creado, latido, ia, modelo, creado, actualizado, recuperar_desde, recuperar_hasta, recuperados
       FROM asistente_whatsapp ORDER BY id`);
  return rows;
}

// Número del chip de créditos en uso: el primero activo (no pausado) con rol 'creditos' y número conocido; si no hay,
// el chip 1 (como antes de los varios chips). '' si no se sabe ninguno.
export async function numeroCreditos(db) {
  const { rows } = await db.query(
    `SELECT id, rol, pausado, numero FROM asistente_whatsapp ORDER BY (rol = 'creditos' AND NOT pausado) DESC, id`);
  const cred = rows.find((r) => r.rol === 'creditos' && !r.pausado && digitos(r.numero));
  if (cred) return digitos(cred.numero);
  const uno = rows.find((r) => r.id === 1);
  return uno ? digitos(uno.numero) : '';
}

// ¿Hay un chip de créditos distinto de este (activo y con número)? Su número, o '' si no.
export async function creditosEnOtroChip(db, chip) {
  const { rows } = await db.query(
    `SELECT id, numero FROM asistente_whatsapp WHERE rol = 'creditos' AND NOT pausado AND id <> $1 ORDER BY id`, [Number(chip) || 1]);
  const r = rows.find((x) => digitos(x.numero));
  return r ? digitos(r.numero) : '';
}
