-- Notificaciones con título propio (18/11/2026, pedido de Juan: campana de notificaciones con avisos como "Ahora sos
-- Plata" o "Te verificamos"). titulo NULL = el panel usa el título fijo de su tipo (como hasta ahora).
-- Ver FASE1-CONTRATO.md → "Notificaciones de la acompañante". Idempotente: se vuelve a aplicar en cada arranque.
ALTER TABLE notificaciones ADD COLUMN IF NOT EXISTS titulo text;
-- Contar las no leídas de una cuenta sin recorrer todas sus notificaciones (la campana lo pide al volver a la pestaña)
CREATE INDEX IF NOT EXISTS notificaciones_no_leidas_idx ON notificaciones (cuenta_id) WHERE NOT leida;
