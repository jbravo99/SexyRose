-- Varios chips de WhatsApp (19/11/2026, decisión de Juan): el asistente atiende varios números a la vez.
--   - Cada chip tiene una letra (A, B, C…: la del id, chr(64 + id)), un rol (captacion: invitaciones y respuestas; creditos: la compra de
--     créditos, adonde apunta "Cargar créditos" del panel), un cupo de invitaciones por día y una pausa manual
--     (pausado: no aparece para mandar invitaciones ni para comprar créditos; el asistente igual contesta si está
--     vinculado).
--   - El chip 1 es el de siempre (letra A): su sesión guardada sigue igual (claves sin prefijo en asistente_auth); los
--     demás guardan sus claves con el prefijo "c<id>:" (lib/asistente-whatsapp.js).
--   - Cada conversación es de un chip: el mismo teléfono puede tener un chat con cada chip.
--   - Cada invitación de captación queda con el chip que la mandó.
-- Idempotente: se vuelve a aplicar en cada arranque.

-- asistente_whatsapp pasa a tener una fila por chip
ALTER TABLE asistente_whatsapp DROP CONSTRAINT IF EXISTS asistente_whatsapp_id_check;
ALTER TABLE asistente_whatsapp ADD CONSTRAINT asistente_whatsapp_id_check CHECK (id >= 1 AND id <= 26);
ALTER TABLE asistente_whatsapp ADD COLUMN IF NOT EXISTS rol text NOT NULL DEFAULT 'captacion';
ALTER TABLE asistente_whatsapp ADD COLUMN IF NOT EXISTS pausado boolean NOT NULL DEFAULT false;
ALTER TABLE asistente_whatsapp ADD COLUMN IF NOT EXISTS por_dia int NOT NULL DEFAULT 30;
ALTER TABLE asistente_whatsapp ADD COLUMN IF NOT EXISTS creado timestamptz NOT NULL DEFAULT now();
ALTER TABLE asistente_whatsapp DROP CONSTRAINT IF EXISTS asistente_whatsapp_rol_check;
ALTER TABLE asistente_whatsapp ADD CONSTRAINT asistente_whatsapp_rol_check CHECK (rol IN ('captacion', 'creditos'));
ALTER TABLE asistente_whatsapp DROP CONSTRAINT IF EXISTS asistente_whatsapp_por_dia_check;
ALTER TABLE asistente_whatsapp ADD CONSTRAINT asistente_whatsapp_por_dia_check CHECK (por_dia >= 1 AND por_dia <= 200);

-- Conversaciones por chip
ALTER TABLE asistente_conversaciones ADD COLUMN IF NOT EXISTS chip smallint NOT NULL DEFAULT 1;
ALTER TABLE asistente_conversaciones DROP CONSTRAINT IF EXISTS asistente_conversaciones_jid_key;
CREATE UNIQUE INDEX IF NOT EXISTS asistente_conv_chip_jid_uk ON asistente_conversaciones (chip, jid);

-- Captación: con qué chip se mandó (o se abrió) cada invitación
ALTER TABLE captacion_contactos ADD COLUMN IF NOT EXISTS chip smallint;
CREATE INDEX IF NOT EXISTS captacion_chip_enviado_idx ON captacion_contactos (chip, enviado) WHERE enviado IS NOT NULL;
