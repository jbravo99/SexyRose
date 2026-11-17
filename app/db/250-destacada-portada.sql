-- Portada de cada historia destacada (17/11/2026, pedido de Juan: "La persona deberá tener la posibilidad de poner la
-- imagen que quieran de perfil de la historia destacada", como "Editar portada" de Instagram). Ver lib/destacadas.js.
--   Automática (las dos en NULL): el primer elemento listo, como hasta ahora (si es un video, su portada).
--   portada_item              uno de los elementos de ESA destacada (foto, o la portada de un video). Si ese elemento se
--                             borra, la columna queda en NULL (ON DELETE SET NULL) y vuelve la automática.
--   portada_clave/portada_url una imagen que subió aparte (d/p-<uuid>.webp, cuadrada, con la marca de agua). Se borra el
--                             archivo al cambiarla, al volver a la automática y al borrar la destacada.
-- Nunca las dos a la vez.
ALTER TABLE destacadas ADD COLUMN IF NOT EXISTS portada_item uuid;
ALTER TABLE destacadas ADD COLUMN IF NOT EXISTS portada_clave text;
ALTER TABLE destacadas ADD COLUMN IF NOT EXISTS portada_url text;
DO $$ BEGIN
  ALTER TABLE destacadas ADD CONSTRAINT destacadas_portada_item_fk FOREIGN KEY (portada_item) REFERENCES destacada_items(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE destacadas ADD CONSTRAINT destacadas_portada_chk CHECK ((portada_clave IS NULL) = (portada_url IS NULL) AND (portada_item IS NULL OR portada_clave IS NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
