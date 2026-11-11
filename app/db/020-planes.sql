-- SexyRose Fase 2: planes pagos por transferencia (agente B). Idempotente; se aplica después de 010-cuentas.sql.
-- Códigos de plan del MVP (historial): S Star, A Diamante, B Platino, C Oro, D Plata, E Bronce. Planes v2 (050) deja solo E, D, C, S.

-- Pedido de pago: la acompañante elige plan y período, transfiere con la referencia y lo informa; el admin confirma.
CREATE TABLE IF NOT EXISTS pedidos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id        uuid NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  plan             text NOT NULL CHECK (plan IN ('D', 'C', 'B', 'A', 'S')),
  periodo          text NOT NULL CHECK (periodo IN ('mes', 'semana')),
  monto_usd        numeric(10, 2) NOT NULL CHECK (monto_usd >= 0),
  estado           text NOT NULL DEFAULT 'pendiente'
                   CHECK (estado IN ('pendiente', 'informado', 'confirmado', 'rechazado', 'cancelado', 'vencido')),
  referencia       text NOT NULL UNIQUE,
  comprobante_ruta text,
  nota             text,
  motivo           text,
  creado           timestamptz NOT NULL DEFAULT now(),
  informado        timestamptz,
  confirmado       timestamptz,
  confirmado_por   text,
  provincia_star   text,
  CONSTRAINT pedidos_semana_ck CHECK (periodo = 'mes' OR plan IN ('B', 'A', 'S'))
);
CREATE INDEX IF NOT EXISTS pedidos_cuenta_idx ON pedidos (cuenta_id, creado DESC);
CREATE INDEX IF NOT EXISTS pedidos_estado_idx ON pedidos (estado, creado DESC);
-- Un solo pedido abierto (pendiente o informado) por cuenta + plan + período.
CREATE UNIQUE INDEX IF NOT EXISTS pedidos_abierto_uk ON pedidos (cuenta_id, plan, periodo) WHERE estado IN ('pendiente', 'informado');

-- Suscripción: un tramo de tiempo con un plan. pedido_id NULL = asignada a mano por el admin (periodo 'manual').
-- Plan efectivo = el de mayor rango entre las activas con desde <= ahora < hasta; sin ninguna, Bronce (E).
CREATE TABLE IF NOT EXISTS suscripciones (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id  uuid NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  pedido_id  uuid REFERENCES pedidos(id) ON DELETE SET NULL,
  plan       text NOT NULL CHECK (plan IN ('D', 'C', 'B', 'A', 'S')),
  periodo    text NOT NULL CHECK (periodo IN ('mes', 'semana', 'manual')),
  desde      timestamptz NOT NULL,
  hasta      timestamptz NOT NULL,
  estado     text NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'vencida', 'cancelada')),
  nota       text,
  creado     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT suscripciones_rango_ck CHECK (hasta > desde)
);
CREATE INDEX IF NOT EXISTS suscripciones_cuenta_idx ON suscripciones (cuenta_id, estado, hasta DESC);
CREATE INDEX IF NOT EXISTS suscripciones_activas_idx ON suscripciones (plan, hasta) WHERE estado = 'activa';
CREATE UNIQUE INDEX IF NOT EXISTS suscripciones_pedido_uk ON suscripciones (pedido_id) WHERE pedido_id IS NOT NULL;

-- Avisos por email ya enviados (cada uno una sola vez por suscripción).
CREATE TABLE IF NOT EXISTS avisos_plan (
  suscripcion_id uuid NOT NULL REFERENCES suscripciones(id) ON DELETE CASCADE,
  tipo           text NOT NULL CHECK (tipo IN ('vence3', 'vencio')),
  enviado        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (suscripcion_id, tipo)
);
