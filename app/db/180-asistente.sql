-- Asistente de cuenta por WhatsApp (15/11/2026, decisión de Juan). Ver FASE1-CONTRATO.md → "Asistente de cuenta".
-- Lo usan el contenedor "agente" (app/agente.js: WhatsApp con Baileys + Claude) y el app (admin, botones de Telegram,
-- emails con el código de identificación, avisos de pedidos acreditados/rechazados y la limpieza a los 90 días).
-- Idempotente: se vuelve a aplicar en cada arranque.

-- Un chat 1:1 de WhatsApp. jid = dirección de WhatsApp del chat (número@s.whatsapp.net o, si WhatsApp no da el número, @lid).
CREATE TABLE IF NOT EXISTS asistente_conversaciones (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jid                    text NOT NULL UNIQUE,
  telefono               text,                                       -- solo dígitos; NULL si WhatsApp no lo informa
  cuenta_id              uuid REFERENCES cuentas(id) ON DELETE SET NULL, -- cuenta identificada (por teléfono o por email)
  identificado_por       text CHECK (identificado_por IN ('telefono', 'email')),
  identificado           timestamptz,
  estado                 text NOT NULL DEFAULT 'bot' CHECK (estado IN ('bot', 'humano')),
  motivo_humano          text,
  silenciado_hasta       timestamptz,                                -- Juan escribió desde el teléfono: el bot calla 12 h
  idioma                 text NOT NULL DEFAULT 'es' CHECK (idioma IN ('es', 'en', 'pt')),
  comprobante_pendiente  bigint,                                     -- mensaje con un comprobante que espera el código del pedido
  aviso_sin_ia           timestamptz,                                -- último "te va a responder una persona" sin IA
  creado                 timestamptz NOT NULL DEFAULT now(),
  actualizado            timestamptz NOT NULL DEFAULT now(),
  ultimo_mensaje         timestamptz
);
CREATE INDEX IF NOT EXISTS asistente_conv_ultimo_idx ON asistente_conversaciones (ultimo_mensaje DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS asistente_conv_cuenta_idx ON asistente_conversaciones (cuenta_id);

CREATE TABLE IF NOT EXISTS asistente_mensajes (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversacion_id  uuid NOT NULL REFERENCES asistente_conversaciones(id) ON DELETE CASCADE,
  dir              text NOT NULL CHECK (dir IN ('in', 'out')),
  origen           text NOT NULL CHECK (origen IN ('bot', 'juan', 'usuario')),
  tipo             text NOT NULL DEFAULT 'texto' CHECK (tipo IN ('texto', 'imagen', 'documento', 'audio', 'video', 'otro')),
  texto            text,
  media_ruta       text,                                             -- relativa a DATA_DIR/privado (lib/privado.js)
  wa_id            text,
  creado           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS asistente_msj_conv_idx ON asistente_mensajes (conversacion_id, id DESC);
CREATE INDEX IF NOT EXISTS asistente_msj_creado_idx ON asistente_mensajes (creado);
CREATE UNIQUE INDEX IF NOT EXISTS asistente_msj_wa_uk ON asistente_mensajes (conversacion_id, wa_id) WHERE wa_id IS NOT NULL;

-- Pedidos que se nombraron en un chat (por código o creados por chat): ese chat puede ver su estado, recibir los datos
-- para transferir, adjuntarle el comprobante y recibe el aviso cuando se acredita o se rechaza.
CREATE TABLE IF NOT EXISTS asistente_conv_pedidos (
  conversacion_id  uuid NOT NULL REFERENCES asistente_conversaciones(id) ON DELETE CASCADE,
  pedido_id        uuid NOT NULL REFERENCES pedidos_creditos(id) ON DELETE CASCADE,
  creado           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversacion_id, pedido_id)
);
CREATE INDEX IF NOT EXISTS asistente_conv_pedidos_pedido_idx ON asistente_conv_pedidos (pedido_id);

-- Código de 6 números por email para identificar el chat. Lo genera y lo manda el app (el texto nunca se guarda: solo
-- su hash); el agente lo compara. Vence a los 15 min; 5 intentos.
CREATE TABLE IF NOT EXISTS asistente_codigos_email (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversacion_id  uuid NOT NULL REFERENCES asistente_conversaciones(id) ON DELETE CASCADE,
  cuenta_id        uuid REFERENCES cuentas(id) ON DELETE CASCADE,    -- NULL = el email no es de ninguna cuenta (no se manda nada)
  codigo_hash      bytea,
  intentos         int NOT NULL DEFAULT 0,
  creado           timestamptz NOT NULL DEFAULT now(),
  expira           timestamptz NOT NULL DEFAULT now() + interval '15 minutes',
  enviado          timestamptz,
  usado            timestamptz
);
CREATE INDEX IF NOT EXISTS asistente_codigos_conv_idx ON asistente_codigos_email (conversacion_id, creado DESC);

-- Botones "Acreditar" / "Rechazar" del aviso de Telegram: token al azar (en la base solo su hash).
CREATE TABLE IF NOT EXISTS asistente_tg_acciones (
  token_hash  bytea PRIMARY KEY,
  pedido_id   uuid NOT NULL REFERENCES pedidos_creditos(id) ON DELETE CASCADE,
  accion      text NOT NULL CHECK (accion IN ('acreditar', 'rechazar')),
  creado      timestamptz NOT NULL DEFAULT now(),
  usado       timestamptz
);
CREATE INDEX IF NOT EXISTS asistente_tg_pedido_idx ON asistente_tg_acciones (pedido_id);

-- Bandeja de salida entre procesos. destino 'whatsapp' la lee el agente (mensajes a un chat, desvincular);
-- destino 'app' la lee el app (mandar el email con el código). Cada fila nueva avisa con NOTIFY sr_asistente_<destino>;
-- además los dos revisan la tabla cada 30 s por si se perdió un aviso.
CREATE TABLE IF NOT EXISTS asistente_salida (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  destino          text NOT NULL CHECK (destino IN ('whatsapp', 'app')),
  tipo             text NOT NULL,
  conversacion_id  uuid REFERENCES asistente_conversaciones(id) ON DELETE CASCADE,
  datos            jsonb NOT NULL DEFAULT '{}',
  clave            text UNIQUE,                                      -- evita repetir el mismo aviso
  creado           timestamptz NOT NULL DEFAULT now(),
  intentos         int NOT NULL DEFAULT 0,
  procesado        timestamptz,
  error            text
);
CREATE INDEX IF NOT EXISTS asistente_salida_pend_idx ON asistente_salida (destino, id) WHERE procesado IS NULL;

CREATE OR REPLACE FUNCTION asistente_salida_avisar() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('sr_asistente_' || NEW.destino, NEW.id::text);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS asistente_salida_avisar_tg ON asistente_salida;
CREATE TRIGGER asistente_salida_avisar_tg AFTER INSERT ON asistente_salida FOR EACH ROW EXECUTE FUNCTION asistente_salida_avisar();

-- Estado de la conexión de WhatsApp (una sola fila). La escribe el agente; el admin la lee (QR incluido).
CREATE TABLE IF NOT EXISTS asistente_whatsapp (
  id             smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  estado         text NOT NULL DEFAULT 'desconectado'
                 CHECK (estado IN ('apagado', 'conectando', 'esperando_qr', 'conectado', 'desconectado')),
  qr             text,
  qr_creado      timestamptz,
  numero         text,
  error          text,
  ia             boolean NOT NULL DEFAULT false,
  modelo         text,
  latido         timestamptz,
  actualizado    timestamptz NOT NULL DEFAULT now()
);
INSERT INTO asistente_whatsapp (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Sesión de WhatsApp (credenciales y claves de Baileys), cifrada con SECRETS_KEY (lib/secretos.js).
CREATE TABLE IF NOT EXISTS asistente_auth (
  clave        text PRIMARY KEY,
  valor        text NOT NULL,
  actualizado  timestamptz NOT NULL DEFAULT now()
);

-- Ajustes (Admin → Asistente): ajustes.clave = 'asistente', valor { activo, alias, titular }. Sin fila = apagado
-- (lo prende Juan desde el admin; lib/asistente-comun.js tiene los valores por defecto).
