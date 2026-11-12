-- Verificación de identidad: consentimiento aparte para datos sensibles y borrado de la selfie y el documento
-- a los 3 meses de la decisión (aprobada o rechazada). La fila queda (estado, fechas); las rutas pasan a NULL.
ALTER TABLE verificaciones ALTER COLUMN selfie_ruta DROP NOT NULL;
ALTER TABLE verificaciones ALTER COLUMN documento_ruta DROP NOT NULL;
ALTER TABLE verificaciones ADD COLUMN IF NOT EXISTS consentimiento_at timestamptz;
ALTER TABLE verificaciones ADD COLUMN IF NOT EXISTS comprimido timestamptz;
ALTER TABLE verificaciones ADD COLUMN IF NOT EXISTS archivos_borrados timestamptz;
CREATE INDEX IF NOT EXISTS verificaciones_retencion_idx ON verificaciones (revisado) WHERE archivos_borrados IS NULL AND estado <> 'pendiente';
