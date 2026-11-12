-- Historias destacadas (como las de Instagram): círculos con nombre fijos en el perfil.
-- Decisión de Juan (12/11/2026): las historias vencidas se borran, así que una destacada NO se arma con historias
-- viejas: la acompañante sube directamente desde su dispositivo lo que quiere mostrar (foto o video).
--   destacadas        una por círculo: nombre (hasta 16 caracteres). Portada = primer elemento.
--   destacada_items   fotos y videos de cada destacada, en el orden en que se subieron. No vencen.
--     tipo   'foto' | 'video'
--     estado 'listo' | 'procesando' | 'error'  (las fotos nacen listas; los videos pasan por la cola de lib/videos.js)
--     clave/url = la foto grande o el MP4; clave_mini/url_mini = la foto chica o la portada del video (WebP)
-- Cantidad por plan: lib/planes-ref.js LIMITES[plan].destacadas (Bronce 1, Plata 2, Oro 5, Star ilimitadas). Si baja
-- de plan, en el perfil se ven las primeras que entran (por fecha de creación) y el resto queda guardado.
CREATE TABLE IF NOT EXISTS destacadas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id   uuid NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  titulo      text NOT NULL,
  creado      timestamptz NOT NULL DEFAULT now(),
  actualizado timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT destacadas_titulo_chk CHECK (char_length(titulo) BETWEEN 1 AND 16)
);
CREATE INDEX IF NOT EXISTS destacadas_cuenta_idx ON destacadas (cuenta_id, creado, id);

CREATE TABLE IF NOT EXISTS destacada_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  destacada_id  uuid NOT NULL REFERENCES destacadas(id) ON DELETE CASCADE,
  cuenta_id     uuid NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  tipo          text NOT NULL DEFAULT 'foto',
  estado        text NOT NULL DEFAULT 'listo',
  clave         text,
  clave_mini    text,
  url           text,
  url_mini      text,
  segundos      numeric(5,1),
  ancho         int,
  alto          int,
  error         text,
  creado        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT destacada_items_tipo_chk CHECK (tipo IN ('foto', 'video')),
  CONSTRAINT destacada_items_estado_chk CHECK (estado IN ('listo', 'procesando', 'error')),
  CONSTRAINT destacada_items_listo_url_chk CHECK (estado <> 'listo' OR url IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS destacada_items_dest_idx ON destacada_items (destacada_id, creado, id);
CREATE INDEX IF NOT EXISTS destacada_items_procesando_idx ON destacada_items (creado) WHERE estado = 'procesando';
