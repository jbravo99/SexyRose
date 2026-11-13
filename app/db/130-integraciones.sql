-- Integraciones del admin (13/11/2026)
-- Cuentas de comisión de Mercado Pago cargadas desde Admin → Ajustes → Venta de contenido.
-- Los secretos se guardan cifrados (AES-256-GCM con SECRETS_KEY del servidor); nunca en texto plano.
-- La vinculación de Telegram se guarda en ajustes (clave 'telegram'): no necesita tabla.
CREATE TABLE IF NOT EXISTS mp_cuentas (
  client_id               text PRIMARY KEY,
  nombre                  text NOT NULL,
  client_secret_cifrado   text NOT NULL,
  webhook_secret_cifrado  text NOT NULL,
  creado                  timestamptz NOT NULL DEFAULT now(),
  actualizado             timestamptz NOT NULL DEFAULT now()
);
