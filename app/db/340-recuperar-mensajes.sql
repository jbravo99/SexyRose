-- Responder lo que llegó sin conexión (20/11/2026, pedido de Juan: "que el agente responda aquellos mensajes que me
-- enviaron desde la restricción de ayer hasta la vinculación de hoy"). Los mensajes que llegan mientras ningún
-- dispositivo está vinculado no le llegan nunca al asistente; WhatsApp los manda en la sincronización del historial
-- cuando se vincula un dispositivo nuevo. Desde el admin Juan pide "recuperar desde <fecha>": el agente desvincula el
-- chip, Juan escanea el QR y, con el historial que llega, el asistente contesta (de a uno, espaciados) los chats cuyo
-- último mensaje es de la otra persona y llegó después de esa fecha. Ver lib/asistente-whatsapp.js (alHistorial) y
-- lib/asistente.js (recuperar).
-- Idempotente: se vuelve a aplicar en cada arranque.
ALTER TABLE asistente_whatsapp ADD COLUMN IF NOT EXISTS recuperar_desde timestamptz;   -- mensajes desde esta fecha
ALTER TABLE asistente_whatsapp ADD COLUMN IF NOT EXISTS recuperar_hasta timestamptz;   -- se acepta historial hasta esta hora
ALTER TABLE asistente_whatsapp ADD COLUMN IF NOT EXISTS recuperados int NOT NULL DEFAULT 0;
