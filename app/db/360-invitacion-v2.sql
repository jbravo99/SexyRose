-- Invitación v2 (23/11/2026, decisión de Juan): hasta 250 caracteres, en párrafos separados, en plural como equipo, con
-- "vender tu contenido" y "salís desde el primer día". mensaje_reglas = con qué versión de las reglas se escribió la
-- invitación de ese contacto (NULL = la primera). Las de una versión anterior que siguen "pendiente" se vuelven a escribir
-- (lib/invitaciones-ia.js, REGLAS_INVITACION en lib/captacion.js); las ya abiertas se dejan como están.
-- Idempotente: se vuelve a aplicar en cada arranque.
ALTER TABLE captacion_contactos ADD COLUMN IF NOT EXISTS mensaje_reglas smallint;
