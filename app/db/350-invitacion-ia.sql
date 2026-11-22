-- Invitación distinta para cada contacto (22/11/2026, pedido de Juan: "cada vez que pongo abrir WhatsApp genere un
-- mensaje inicial diferente, manteniendo los lineamientos"). El agente (que tiene la clave de la IA) escribe de antemano
-- la invitación de los próximos contactos de la cola y la guarda acá; "Abrir chat" usa esa. Sin mensaje (o con la IA
-- apagada en Mensajería → Mensajes), se usa una de las versiones fijas. Ver lib/invitaciones-ia.js.
-- Idempotente: se vuelve a aplicar en cada arranque.
ALTER TABLE captacion_contactos ADD COLUMN IF NOT EXISTS mensaje text;
ALTER TABLE captacion_contactos ADD COLUMN IF NOT EXISTS mensaje_creado timestamptz;
