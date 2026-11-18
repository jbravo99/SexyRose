-- SexyRose: copia de los mensajes que mandó el asistente por WhatsApp, para poder REENVIARLOS (18/11/2026).
-- Cuando el teléfono del otro lado no puede descifrar un mensaje (en el chat se ve "Esperando mensaje. Esto puede tomar
-- tiempo."), WhatsApp le pide al agente que lo reenvíe ("retry receipt"). Baileys lo reenvía solo si `getMessage(key)`
-- le devuelve el contenido original: sale de esta tabla (lib/asistente-whatsapp.js). Sin esto el mensaje quedaba así
-- para siempre. Ver FASE1-CONTRATO.md → "Asistente de cuenta por WhatsApp".
-- - wa_id: id del mensaje en WhatsApp (el mismo que asistente_mensajes.wa_id de las respuestas del bot).
-- - contenido: el proto `Message` tal como se mandó, cifrado con SECRETS_KEY (lib/secretos.js). Sin teléfono ni chat.
-- - Se borra solo a los 30 días (lo hace el agente).
-- Se aplica en cada arranque: idempotente.

CREATE TABLE IF NOT EXISTS asistente_wa_enviados (
  wa_id      text PRIMARY KEY,
  contenido  text NOT NULL,
  creado     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS asistente_wa_enviados_creado_idx ON asistente_wa_enviados (creado);
