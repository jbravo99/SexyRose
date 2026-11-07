-- SexyRose v1-lanzamiento. Se aplica en cada arranque del servidor: todo es idempotente.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS preregistros (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creado           timestamptz NOT NULL DEFAULT now(),
  nombre_artistico text NOT NULL,
  genero           text NOT NULL CHECK (genero IN ('mujer', 'trans', 'hombre')),
  provincia        text NOT NULL,
  ciudad           text NOT NULL,
  contacto_tipo    text NOT NULL CHECK (contacto_tipo IN ('whatsapp', 'telegram', 'email')),
  contacto         text NOT NULL,
  plan_interes     text NOT NULL CHECK (plan_interes IN ('bronce', 'plata', 'oro', 'platino', 'diamante', 'star', 'no_se')),
  mayor_edad       boolean NOT NULL DEFAULT true,
  acepta_terminos  boolean NOT NULL DEFAULT true,
  ip_hash          text,
  estado           text NOT NULL DEFAULT 'nuevo'
);
CREATE INDEX IF NOT EXISTS preregistros_creado_idx ON preregistros (creado DESC);

CREATE TABLE IF NOT EXISTS denuncias (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creado      timestamptz NOT NULL DEFAULT now(),
  categoria   text NOT NULL CHECK (categoria IN ('abuso_infantil', 'imagen_sin_consentimiento', 'trata', 'otro')),
  url         text,
  descripcion text NOT NULL,
  email       text,
  ip_hash     text,
  estado      text NOT NULL DEFAULT 'nueva',
  resuelto    timestamptz
);
CREATE INDEX IF NOT EXISTS denuncias_creado_idx ON denuncias (creado DESC);

-- Textos del sitio editados desde el editor de textos del admin. Sin fila, la página usa el texto del HTML.
CREATE TABLE IF NOT EXISTS textos (
  clave       text PRIMARY KEY,
  valor       text NOT NULL,
  actualizado timestamptz NOT NULL DEFAULT now()
);

-- Versiones anteriores: al cambiar o restaurar un texto, el valor reemplazado se guarda acá
-- (guardado = cuándo se había guardado esa versión).
CREATE TABLE IF NOT EXISTS textos_historial (
  id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  clave    text NOT NULL,
  valor    text NOT NULL,
  guardado timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS textos_historial_clave_idx ON textos_historial (clave, id DESC);
