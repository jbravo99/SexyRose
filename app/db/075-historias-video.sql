-- Historias en video (como las de Instagram): hasta 60 s, procesadas en la misma cola que los videos de la galería
-- (lib/videos.js) y publicadas en el almacenamiento externo. Mientras se procesan (estado 'procesando') no se
-- publican; las 24 h corren desde que quedan listas.
--   tipo   'foto' | 'video'
--   estado 'listo' | 'procesando' | 'error'  (las fotos nacen listas)
--   clave/url = el MP4 del video; clave_mini/url_mini = su portada (WebP)
ALTER TABLE historias ALTER COLUMN clave DROP NOT NULL;
ALTER TABLE historias ALTER COLUMN url DROP NOT NULL;
ALTER TABLE historias ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'foto';
ALTER TABLE historias ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'listo';
ALTER TABLE historias ADD COLUMN IF NOT EXISTS segundos numeric(5,1);
ALTER TABLE historias ADD COLUMN IF NOT EXISTS ancho int;
ALTER TABLE historias ADD COLUMN IF NOT EXISTS alto int;
ALTER TABLE historias ADD COLUMN IF NOT EXISTS error text;
DO $$ BEGIN
  ALTER TABLE historias ADD CONSTRAINT historias_tipo_chk CHECK (tipo IN ('foto', 'video'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE historias ADD CONSTRAINT historias_estado_chk CHECK (estado IN ('listo', 'procesando', 'error'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE historias ADD CONSTRAINT historias_listo_url_chk CHECK (estado <> 'listo' OR url IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS historias_procesando_idx ON historias (creado) WHERE estado = 'procesando';
