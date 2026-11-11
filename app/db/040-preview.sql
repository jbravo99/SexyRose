-- SexyRose: video de 5 s de la tarjeta del perfil (planes Oro en adelante). Lo arma lib/videos.js a partir de un video
-- de la galería ya procesado. Una fila por cuenta. Se aplica en cada arranque, después de 030: idempotente.
--   elegido = false → automático: el comienzo (0 s) del primer video listo de la galería.
--   version: sube con cada pedido; la cola descarta resultados de pedidos viejos.

CREATE TABLE IF NOT EXISTS previews (
  cuenta_id    uuid PRIMARY KEY REFERENCES cuentas (id) ON DELETE CASCADE,
  video_id     uuid REFERENCES videos (id) ON DELETE SET NULL,
  inicio       numeric(5, 1) NOT NULL DEFAULT 0,
  elegido      boolean NOT NULL DEFAULT false,
  estado       text NOT NULL DEFAULT 'procesando' CHECK (estado IN ('procesando', 'listo', 'error')),
  version      int NOT NULL DEFAULT 1,
  clave        text,
  url          text,
  error        text,
  actualizado  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS previews_procesando_idx ON previews (actualizado) WHERE estado = 'procesando';
