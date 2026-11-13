-- 13/11/2026 (Juan): ubicaciones con los datos oficiales de Georef (datos.gob.ar) en vez de la lista hecha a mano.
-- Lo importa app/lib/georef.js (al arrancar si nunca se importó, una vez por semana, o con
-- `node scripts/importar-georef.js`). Esta migración solo prepara la tabla; no borra ni cambia lugares.
--
--   georef_id     id de Georef (provincia '54', localidad '54056010000') o 'gcba:<barrio>' para los 48 barrios de CABA
--   fuente        'georef' (lo creó el importador) o 'manual' (lo cargó el admin o venía de la lista a mano)
--   departamento  departamento/partido de Georef: solo para distinguir localidades con el mismo nombre en la provincia
--   tipo 'barrio' barrios de Capital Federal (CABA), hijos de 'ciudad-de-buenos-aires'
--   nombre        deja de ser único: hay muchas localidades con el mismo nombre en distintas provincias

ALTER TABLE ubicaciones ADD COLUMN IF NOT EXISTS georef_id text;
ALTER TABLE ubicaciones ADD COLUMN IF NOT EXISTS fuente text NOT NULL DEFAULT 'manual';
ALTER TABLE ubicaciones ADD COLUMN IF NOT EXISTS departamento text;
ALTER TABLE ubicaciones DROP CONSTRAINT IF EXISTS ubicaciones_nombre_key;
DO $$ BEGIN
  ALTER TABLE ubicaciones ADD CONSTRAINT ubicaciones_fuente_chk CHECK (fuente IN ('georef', 'manual'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE ubicaciones DROP CONSTRAINT IF EXISTS ubicaciones_tipo_check;
DO $$ BEGIN
  ALTER TABLE ubicaciones ADD CONSTRAINT ubicaciones_tipo_check CHECK (tipo IN ('pais', 'provincia', 'zona', 'ciudad', 'barrio'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS ubicaciones_georef_idx ON ubicaciones (georef_id) WHERE georef_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ubicaciones_padre_idx ON ubicaciones (padre);

-- Historial de importaciones (el admin muestra la última; el arranque mira si alguna vez salió bien)
CREATE TABLE IF NOT EXISTS georef_importaciones (
  id       bigserial PRIMARY KEY,
  inicio   timestamptz NOT NULL DEFAULT now(),
  fin      timestamptz,
  ok       boolean NOT NULL DEFAULT false,
  origen   text NOT NULL DEFAULT 'red',      -- 'red' (descarga) o 'archivos' (rutas locales)
  motivo   text NOT NULL DEFAULT 'manual',   -- 'arranque', 'semanal', 'admin', 'manual'
  conteos  jsonb NOT NULL DEFAULT '{}'::jsonb,
  error    text
);
CREATE INDEX IF NOT EXISTS georef_importaciones_inicio_idx ON georef_importaciones (inicio DESC);
