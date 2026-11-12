-- Cuentas de interesados (clientes) y pedidos personalizados con chat (decisión de Juan, 12/11/2026).
-- Antes los clientes nunca tenían cuenta. Ahora, para comprar packs o hacer pedidos personalizados, el interesado crea
-- una cuenta simple: nombre de usuario (lo ven las acompañantes; nunca el email), email y contraseña. Tiene que
-- confirmar el email antes de comprar o pedir. Es un tipo de cuenta APARTE de las acompañantes: tablas, sesiones y
-- cookie propias (sr_cliente). Una cuenta de cliente nunca entra al panel de la acompañante, ni al revés.
CREATE TABLE IF NOT EXISTS clientes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario               text NOT NULL,                         -- como lo eligió (3–20: letras, números, . _ -)
  usuario_norm          text NOT NULL UNIQUE,                  -- en minúsculas: no puede haber "Juan" y "juan"
  email                 text NOT NULL UNIQUE CHECK (email = lower(email)),
  pass_hash             text NOT NULL,
  email_verificado      timestamptz,
  estado                text NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'suspendida', 'baja')),
  creado                timestamptz NOT NULL DEFAULT now(),
  ultimo_login          timestamptz,
  acepto_terminos       timestamptz NOT NULL,
  mayor_edad_declarada  boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS sesiones_clientes (
  token_hash  bytea PRIMARY KEY,
  cliente_id  uuid NOT NULL REFERENCES clientes (id) ON DELETE CASCADE,
  creado      timestamptz NOT NULL DEFAULT now(),
  expira      timestamptz NOT NULL,
  ua          text
);
CREATE INDEX IF NOT EXISTS sesiones_clientes_cliente_idx ON sesiones_clientes (cliente_id);

CREATE TABLE IF NOT EXISTS tokens_email_clientes (
  token_hash  bytea PRIMARY KEY,
  cliente_id  uuid NOT NULL REFERENCES clientes (id) ON DELETE CASCADE,
  tipo        text NOT NULL CHECK (tipo IN ('verificar', 'restablecer')),
  creado      timestamptz NOT NULL DEFAULT now(),
  expira      timestamptz NOT NULL,
  usado       timestamptz
);
CREATE INDEX IF NOT EXISTS tokens_email_clientes_idx ON tokens_email_clientes (cliente_id, tipo);

-- Pedidos personalizados: el cliente escribe lo que quiere; la acompañante (plan Oro o Star, con Mercado Pago
-- conectado) acepta o rechaza. Rechazado = termina ahí. Aceptado = se abre un chat entre los dos para ese pedido.
-- Cualquiera de los dos lo puede cerrar (queda de solo lectura).
CREATE TABLE IF NOT EXISTS solicitudes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id       uuid NOT NULL REFERENCES clientes (id) ON DELETE CASCADE,
  cuenta_id        uuid NOT NULL REFERENCES cuentas (id) ON DELETE CASCADE,
  texto            text NOT NULL,
  estado           text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aceptada', 'rechazada', 'cerrada')),
  creado           timestamptz NOT NULL DEFAULT now(),
  respondida       timestamptz,
  cerrada          timestamptz,
  cerrada_por      text CHECK (cerrada_por IN ('cliente', 'acompanante')),
  actividad        timestamptz NOT NULL DEFAULT now(),       -- último movimiento (orden de las listas)
  leido_cliente    bigint NOT NULL DEFAULT 0,                -- último mensaje que vio cada uno (contadores de no leídos)
  leido_acomp      bigint NOT NULL DEFAULT 0,
  vista_acomp      timestamptz                              -- la acompañante abrió el pedido (para el contador de nuevos)
);
CREATE INDEX IF NOT EXISTS solicitudes_cuenta_idx ON solicitudes (cuenta_id, actividad DESC);
CREATE INDEX IF NOT EXISTS solicitudes_cliente_idx ON solicitudes (cliente_id, actividad DESC);

-- Contenido bloqueado que manda la acompañante en el chat: foto o video + precio. El original queda en el disco privado
-- del servidor (nunca en el CDN público) y se sirve solo a quien lo pagó y a la acompañante. En el chat se ve una vista
-- previa borrosa. Calidad máxima 720p (lado largo 1280, lado corto 720). Vence a 1 mes del pago (sin pagar: a 1 mes
-- de enviado): se borran los archivos y el chat muestra "Este contenido venció".
CREATE TABLE IF NOT EXISTS solicitud_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id     uuid NOT NULL REFERENCES solicitudes (id) ON DELETE CASCADE,
  cuenta_id        uuid NOT NULL REFERENCES cuentas (id) ON DELETE CASCADE,
  tipo             text NOT NULL CHECK (tipo IN ('foto', 'video')),
  estado           text NOT NULL DEFAULT 'procesando' CHECK (estado IN ('procesando', 'listo', 'error', 'vencido')),
  precio_centavos  bigint NOT NULL CHECK (precio_centavos > 0),
  ruta             text,                                     -- original (privado)
  ruta_preview     text,                                     -- vista previa borrosa (privado)
  segundos         numeric(6, 1),
  ancho            int,
  alto             int,
  error            text,
  creado           timestamptz NOT NULL DEFAULT now(),
  pagado           timestamptz,
  vence            timestamptz,
  borrado          timestamptz
);
CREATE INDEX IF NOT EXISTS solicitud_items_solicitud_idx ON solicitud_items (solicitud_id, creado);
CREATE INDEX IF NOT EXISTS solicitud_items_vence_idx ON solicitud_items (vence) WHERE borrado IS NULL;

CREATE TABLE IF NOT EXISTS solicitud_mensajes (
  id            bigserial PRIMARY KEY,
  solicitud_id  uuid NOT NULL REFERENCES solicitudes (id) ON DELETE CASCADE,
  autor         text NOT NULL CHECK (autor IN ('cliente', 'acompanante', 'sistema')),
  texto         text,
  item_id       uuid REFERENCES solicitud_items (id) ON DELETE SET NULL,
  creado        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS solicitud_mensajes_idx ON solicitud_mensajes (solicitud_id, id);

-- Ventas: ahora cada compra es de un cliente con cuenta; tipo 'pack' (los packs del perfil) o 'pedido' (contenido
-- bloqueado de un pedido personalizado). Las ventas de pedidos no tienen item de pack.
ALTER TABLE ventas_contenido ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES clientes (id) ON DELETE SET NULL;
ALTER TABLE ventas_contenido ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'pack';
ALTER TABLE ventas_contenido ADD COLUMN IF NOT EXISTS solicitud_item_id uuid REFERENCES solicitud_items (id) ON DELETE SET NULL;
ALTER TABLE ventas_contenido ALTER COLUMN item_id DROP NOT NULL;
DO $$ BEGIN
  ALTER TABLE ventas_contenido ADD CONSTRAINT ventas_contenido_tipo_chk CHECK (tipo IN ('pack', 'pedido'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS ventas_contenido_cliente_idx ON ventas_contenido (cliente_id, creado DESC) WHERE cliente_id IS NOT NULL;
