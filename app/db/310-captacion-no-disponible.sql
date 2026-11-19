-- Captación: estado "no_disponible" (19/11/2026, decisión de Juan): el número ya no tiene WhatsApp. Juan lo marca a mano
-- desde la cola o la lista; sale de la cola y no cuenta como enviado. Se puede volver a la cola ("pendiente").
-- Idempotente: se vuelve a aplicar en cada arranque.
ALTER TABLE captacion_contactos DROP CONSTRAINT IF EXISTS captacion_contactos_estado_check;
ALTER TABLE captacion_contactos ADD CONSTRAINT captacion_contactos_estado_check
  CHECK (estado IN ('pendiente', 'abierto', 'enviado', 'respondio', 'se_registro', 'no_escribir', 'revisar', 'descartado', 'en_sitio', 'no_disponible'));
