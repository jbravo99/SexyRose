-- SexyRose Planes v2: créditos, pedidos de créditos por WhatsApp, renovación automática, Destacado y notificaciones.
-- Idempotente; se aplica en cada arranque después de 050.
-- 1 crédito = USD 1 de lista. Todo se guarda en CENTÉSIMOS de crédito (bigint): 35 créditos = 3500.

-- Libro de movimientos. Saldo de una cuenta = SUM(centavos). creditos_cuentas guarda el mismo saldo para bloquear la
-- fila (SELECT … FOR UPDATE) y que dos débitos simultáneos no se pasen; siempre se actualizan en la misma transacción.
CREATE TABLE IF NOT EXISTS creditos_cuentas (
  cuenta_id   uuid PRIMARY KEY REFERENCES cuentas(id) ON DELETE CASCADE,
  centavos    bigint NOT NULL DEFAULT 0,
  actualizado timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS creditos_movimientos (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cuenta_id     uuid NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  tipo          text NOT NULL CHECK (tipo IN ('compra', 'pack_bonus', 'renovacion_plan', 'semana', 'subida_temporal',
                                              'destacado', 'ajuste_admin', 'comision_venta')),
  centavos      bigint NOT NULL CHECK (centavos <> 0),   -- positivo = acredita, negativo = debita
  saldo_despues bigint NOT NULL,
  ref_tipo      text,
  ref_id        text,
  motivo        text,
  creado        timestamptz NOT NULL DEFAULT now(),
  creado_por    text
);
CREATE INDEX IF NOT EXISTS creditos_mov_cuenta_idx ON creditos_movimientos (cuenta_id, id DESC);

-- Pedidos de créditos por WhatsApp (reemplazan a los pedidos de plan por transferencia, que quedan como historial).
-- codigo SR-#### (4 dígitos): único entre los pendientes; puede volver a usarse cuando el pedido se cierra.
CREATE TABLE IF NOT EXISTS pedidos_creditos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo           text NOT NULL,
  cuenta_id        uuid NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  pack_id          text,                                   -- NULL = carga a medida
  pack_nombre      text NOT NULL,
  paga_usd         numeric(10, 2) NOT NULL CHECK (paga_usd > 0),
  base_centavos    bigint NOT NULL CHECK (base_centavos > 0),
  bonus_centavos   bigint NOT NULL DEFAULT 0 CHECK (bonus_centavos >= 0),
  estado           text NOT NULL DEFAULT 'pendiente'
                   CHECK (estado IN ('pendiente', 'confirmado', 'vencido', 'cancelado', 'rechazado')),
  lang             text NOT NULL DEFAULT 'es' CHECK (lang IN ('es', 'en', 'pt')),
  comprobante_ruta text,
  nota             text,
  motivo           text,
  creado           timestamptz NOT NULL DEFAULT now(),
  vence            timestamptz NOT NULL DEFAULT now() + interval '48 hours',
  confirmado       timestamptz,
  confirmado_por   text,
  reaperturas      int NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS pedidos_creditos_codigo_abierto_uk ON pedidos_creditos (codigo) WHERE estado = 'pendiente';
CREATE INDEX IF NOT EXISTS pedidos_creditos_cuenta_idx ON pedidos_creditos (cuenta_id, creado DESC);
CREATE INDEX IF NOT EXISTS pedidos_creditos_estado_idx ON pedidos_creditos (estado, creado DESC);
CREATE INDEX IF NOT EXISTS pedidos_creditos_codigo_idx ON pedidos_creditos (codigo);

-- Notificaciones del panel de la acompañante.
CREATE TABLE IF NOT EXISTS notificaciones (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cuenta_id uuid NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  tipo      text NOT NULL,
  texto     text NOT NULL,
  leida     boolean NOT NULL DEFAULT false,
  creado    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notificaciones_cuenta_idx ON notificaciones (cuenta_id, id DESC);

-- Suscripciones pagadas con créditos: renovación automática (solo las mensuales), cambio de plan programado para el
-- próximo ciclo (bajar de plan) y lo que se pagó.
ALTER TABLE suscripciones ADD COLUMN IF NOT EXISTS renovacion_auto boolean NOT NULL DEFAULT false;
ALTER TABLE suscripciones ADD COLUMN IF NOT EXISTS cambio_programado text;
ALTER TABLE suscripciones ADD COLUMN IF NOT EXISTS centavos bigint;
ALTER TABLE suscripciones ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'pedido';
DO $c$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suscripciones_cambio_ck') THEN
    ALTER TABLE suscripciones ADD CONSTRAINT suscripciones_cambio_ck CHECK (cambio_programado IS NULL OR cambio_programado IN ('E', 'D', 'C', 'S'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suscripciones_origen_ck') THEN
    ALTER TABLE suscripciones ADD CONSTRAINT suscripciones_origen_ck CHECK (origen IN ('pedido', 'manual', 'creditos'));
  END IF;
END
$c$;

-- Renovación que no se pudo cobrar por falta de saldo: el perfil queda pausado (perfiles.pausado_por = 'sin_saldo')
-- hasta que cargue créditos; ahí se cobra y se reanuda solo.
CREATE TABLE IF NOT EXISTS renovaciones_pendientes (
  cuenta_id uuid PRIMARY KEY REFERENCES cuentas(id) ON DELETE CASCADE,
  plan      text NOT NULL CHECK (plan IN ('D', 'C', 'S')),
  creado    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE perfiles ADD COLUMN IF NOT EXISTS pausado_por text;
DO $p$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'perfiles_pausado_por_ck') THEN
    ALTER TABLE perfiles ADD CONSTRAINT perfiles_pausado_por_ck CHECK (pausado_por IS NULL OR pausado_por IN ('admin', 'sin_saldo'));
  END IF;
END
$p$;

-- Avisos: se suman los de saldo insuficiente (7 y 2 días antes de la renovación) y el de pausa.
DO $a$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'avisos_plan_tipo_v2_ck') THEN
    ALTER TABLE avisos_plan DROP CONSTRAINT IF EXISTS avisos_plan_tipo_check;
    ALTER TABLE avisos_plan ADD CONSTRAINT avisos_plan_tipo_v2_ck CHECK (tipo IN ('vence3', 'vencio', 'saldo7', 'saldo2', 'pausa'));
  END IF;
END
$a$;

-- Destacado: primeras dentro de su plan en su provincia. Atado al plan con el que se compró.
CREATE TABLE IF NOT EXISTS destacados (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id uuid NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  plan      text NOT NULL CHECK (plan IN ('E', 'D', 'C')),
  provincia text NOT NULL,
  dias      int NOT NULL CHECK (dias IN (1, 7)),
  desde     timestamptz NOT NULL,
  hasta     timestamptz NOT NULL,
  centavos  bigint NOT NULL CHECK (centavos >= 0),
  estado    text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'programado', 'vencido', 'cancelado')),
  creado    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT destacados_rango_ck CHECK (hasta > desde)
);
CREATE INDEX IF NOT EXISTS destacados_vigentes_idx ON destacados (plan, provincia, desde, hasta) WHERE estado IN ('activo', 'programado');
CREATE INDEX IF NOT EXISTS destacados_cuenta_idx ON destacados (cuenta_id, hasta DESC);

-- Ajustes nuevos (editables en Admin → Ajustes). ON CONFLICT DO NOTHING: lo que cargue el admin no se pisa.
INSERT INTO ajustes (clave, valor) VALUES
  ('packs', '[
     {"id": "inicial", "nombre": "Inicial", "pagaUsd": 10, "recibe": 10, "alcanzaPara": "Destacados sueltos", "masElegido": false, "orden": 1, "activo": true},
     {"id": "mes-plata", "nombre": "Mes Plata", "pagaUsd": 35, "recibe": 35, "alcanzaPara": "1 mes de Plata", "masElegido": false, "orden": 2, "activo": true},
     {"id": "trimestre-plata", "nombre": "Trimestre Plata", "pagaUsd": 95, "recibe": 105, "alcanzaPara": "3 meses de Plata, o 1 de Oro + 15", "masElegido": true, "orden": 3, "activo": true},
     {"id": "trimestre-oro", "nombre": "Trimestre Oro", "pagaUsd": 240, "recibe": 280, "alcanzaPara": "3 meses de Oro + 10", "masElegido": false, "orden": 4, "activo": true},
     {"id": "trimestre-star", "nombre": "Trimestre Star", "pagaUsd": 980, "recibe": 1150, "alcanzaPara": "3 meses de Star + 100", "masElegido": false, "orden": 5, "activo": true}
   ]'::jsonb),
  ('destacado', '{"E": {"dia": 1, "semana": 5}, "D": {"dia": 2, "semana": 9}, "C": {"dia": 4, "semana": 20}}'::jsonb),
  ('contacto', '{"whatsapp": "", "telegram": "", "telegramActivo": false}'::jsonb),
  ('cotizacion', '{"arsPorUsd": null, "fecha": null, "nota": ""}'::jsonb),
  ('comision', '{"porcentaje": 10, "saldoNegativoMax": 20}'::jsonb),
  ('mensajes', '{
     "whatsapp": {
       "es": "Hola, quiero comprar {pack} ({creditos} créditos, USD {monto}). Pedido {codigo}",
       "en": "Hi, I want to buy {pack} ({creditos} credits, USD {monto}). Order {codigo}",
       "pt": "Olá, quero comprar {pack} ({creditos} créditos, USD {monto}). Pedido {codigo}"
     },
     "admin": "¡Hola! Tu pedido {codigo}: {pack} ({creditos} créditos). El total a transferir es ARS {ars} (USD {monto} a {cotizacion} por dólar, cotización del {fecha}). Cuando transfieras, mandame el comprobante por acá con el código {codigo}."
   }'::jsonb)
ON CONFLICT (clave) DO NOTHING;
