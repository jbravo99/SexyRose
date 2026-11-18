-- SexyRose: registro de cuentas eliminadas por el admin (18/11/2026, pedido de Juan). Una fila por eliminación, con lo
-- justo para responder si después preguntan: fecha, email, WhatsApp (+dígitos), nombre artístico, nombre completo (el
-- aprobado o el último enviado), motivo y quién la eliminó. Sin fotos ni documentos. Se guarda sin vencimiento.
-- No bloquea nada: con el mismo email o WhatsApp se puede volver a crear una cuenta.
-- El asistente de WhatsApp lee solo fecha y motivo, y solo cuando el número del chat coincide con `whatsapp`.
-- Se aplica en cada arranque: idempotente.

CREATE TABLE IF NOT EXISTS cuentas_eliminadas (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fecha             timestamptz NOT NULL DEFAULT now(),
  email             text NOT NULL,
  whatsapp          text,
  nombre_artistico  text,
  nombre_completo   text,
  motivo            text NOT NULL CHECK (char_length(motivo) BETWEEN 10 AND 500),
  por               text
);
CREATE INDEX IF NOT EXISTS cuentas_eliminadas_fecha_idx ON cuentas_eliminadas (fecha DESC, id DESC);
