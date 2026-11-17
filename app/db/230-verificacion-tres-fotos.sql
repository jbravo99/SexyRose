-- Verificación de identidad en tres fotos (17/11/2026, pedido de Juan):
--   documento_ruta = frente del documento, dorso_ruta = dorso del documento, selfie_ruta = selfie sosteniendo el documento.
-- formato: 1 = envíos anteriores (selfie con el documento + frente, sin dorso), 2 = tres fotos.
-- Las pendientes del formato anterior se siguen revisando igual en el admin; no se le pide a nadie que las reenvíe.
ALTER TABLE verificaciones ADD COLUMN IF NOT EXISTS dorso_ruta text;
ALTER TABLE verificaciones ADD COLUMN IF NOT EXISTS formato smallint NOT NULL DEFAULT 1;
