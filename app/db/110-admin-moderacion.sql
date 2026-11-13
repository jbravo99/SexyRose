-- Admin: moderación de pedidos personalizados y chats, bloqueo de interesados y registro de acciones (Juan, 13/11/2026).
-- Idempotente; se aplica en cada arranque.

-- El admin puede cerrar un pedido (queda de solo lectura) con un motivo que queda registrado.
ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS motivo_cierre text;
DO $$ BEGIN
  ALTER TABLE solicitudes DROP CONSTRAINT IF EXISTS solicitudes_cerrada_por_check;
  ALTER TABLE solicitudes ADD CONSTRAINT solicitudes_cerrada_por_check CHECK (cerrada_por IN ('cliente', 'acompanante', 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Bloqueo de interesados: estado 'suspendida' (ya existía en el CHECK). Se guarda cuándo y por qué.
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS bloqueado timestamptz;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS motivo_bloqueo text;

-- Registro de lo que hace el admin (moderación, bloqueos, borrados). Solo se agrega; nunca se edita.
CREATE TABLE IF NOT EXISTS admin_acciones (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  creado       timestamptz NOT NULL DEFAULT now(),
  por          text NOT NULL,
  accion       text NOT NULL,
  objeto_tipo  text NOT NULL,
  objeto_id    text NOT NULL,
  detalle      jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS admin_acciones_objeto_idx ON admin_acciones (objeto_tipo, objeto_id, id DESC);
CREATE INDEX IF NOT EXISTS admin_acciones_creado_idx ON admin_acciones (id DESC);
