-- Venta de contenido con Mercado Pago (Checkout Pro, modelo marketplace).
-- Cada acompañante conecta SU cuenta de Mercado Pago (OAuth) a una "cuenta de comisión" (= una aplicación de Mercado
-- Pago de SexyRose, configurada en el .env). El cobro va a la acompañante y la comisión (marketplace_fee) a la dueña
-- de la aplicación activa. El comprador no tiene cuenta: después de pagar ve el link que cargó la acompañante.
-- Los tokens de Mercado Pago se guardan cifrados (AES-256-GCM, clave derivada del secreto de cada aplicación).

CREATE TABLE IF NOT EXISTS mp_conexiones (
  cuenta_id      uuid NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  app_id         text NOT NULL,                          -- client_id de la aplicación de Mercado Pago (cuenta de comisión)
  mp_user_id     text,
  access_cifrado text NOT NULL,
  refresh_cifrado text,
  expira         timestamptz NOT NULL,
  estado         text NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'revocada')),
  conectada      timestamptz NOT NULL DEFAULT now(),
  renovada       timestamptz,
  error          text,
  PRIMARY KEY (cuenta_id, app_id)
);
CREATE INDEX IF NOT EXISTS mp_conexiones_expira_idx ON mp_conexiones (expira) WHERE estado = 'activa';

-- Pedidos de autorización en curso (protección CSRF del OAuth): 15 minutos.
CREATE TABLE IF NOT EXISTS mp_oauth_estados (
  estado     text PRIMARY KEY,
  cuenta_id  uuid NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  app_id     text NOT NULL,
  creado     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contenido_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id       uuid NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  titulo          text NOT NULL,
  descripcion     text NOT NULL DEFAULT '',
  precio_centavos bigint NOT NULL CHECK (precio_centavos > 0),   -- pesos argentinos × 100
  link            text NOT NULL,
  creado          timestamptz NOT NULL DEFAULT now(),
  actualizado     timestamptz NOT NULL DEFAULT now(),
  borrado         timestamptz                                    -- se conserva para las ventas ya hechas
);
CREATE INDEX IF NOT EXISTS contenido_items_cuenta_idx ON contenido_items (cuenta_id, creado) WHERE borrado IS NULL;

CREATE TABLE IF NOT EXISTS ventas_contenido (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token             text NOT NULL UNIQUE,                        -- dirección /compra/<token> del comprador
  item_id           uuid NOT NULL REFERENCES contenido_items(id) ON DELETE CASCADE,
  cuenta_id         uuid NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  app_id            text NOT NULL,                               -- cuenta de comisión que cobró
  titulo            text NOT NULL,
  monto_centavos    bigint NOT NULL CHECK (monto_centavos > 0),
  comision_pct      numeric(5, 2) NOT NULL,
  comision_centavos bigint NOT NULL CHECK (comision_centavos >= 0),
  estado            text NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente', 'en_proceso', 'aprobada', 'rechazada', 'reembolsada')),
  mp_preferencia    text,
  mp_pago           text,
  mp_estado         text,
  link_entregado    text,                                        -- copia del link al aprobarse el pago
  ip_hash           text,
  creado            timestamptz NOT NULL DEFAULT now(),
  pagado            timestamptz,
  actualizado       timestamptz NOT NULL DEFAULT now(),
  verificado        timestamptz                                  -- última consulta del pago a Mercado Pago
);
CREATE INDEX IF NOT EXISTS ventas_contenido_cuenta_idx ON ventas_contenido (cuenta_id, creado DESC);
CREATE INDEX IF NOT EXISTS ventas_contenido_creado_idx ON ventas_contenido (creado DESC);
