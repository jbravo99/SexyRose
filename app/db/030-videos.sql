-- SexyRose: videos de la galería (hasta 30 s), procesados con ffmpeg y publicados en bunny.net (lib/videos.js).
-- Se aplica en cada arranque, después de 010 y 020: idempotente.

CREATE TABLE IF NOT EXISTS videos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id     uuid NOT NULL REFERENCES cuentas (id) ON DELETE CASCADE,
  orden         int NOT NULL DEFAULT 0,
  estado        text NOT NULL DEFAULT 'procesando' CHECK (estado IN ('procesando', 'listo', 'error')),
  clave_mp4     text,
  url           text,
  clave_poster  text,
  url_poster    text,
  segundos      numeric(5, 1),
  ancho         int,
  alto          int,
  bytes         bigint,
  error         text,
  creado        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS videos_cuenta_idx ON videos (cuenta_id, orden);
CREATE INDEX IF NOT EXISTS videos_procesando_idx ON videos (creado) WHERE estado = 'procesando';
