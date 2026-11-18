-- Varias cuentas para las transferencias, con rotación (18/11/2026, decisión de Juan: "Para el pago de créditos me
-- interesa poner más de un alias, ya que tengo varias cuentas. Quiero que el bot vaya rotando entre los diferentes alias
-- que agregue."). Ver FASE1-CONTRATO.md → "Asistente de cuenta" → "Cuentas para las transferencias".
-- Idempotente: se vuelve a aplicar en cada arranque.

-- Cuentas que pasa el asistente, en dos listas: pesos (ARS) y dólares (USD). orden = lugar en la lista (Subir/Bajar);
-- activo = false → pausada (no se le pasa a pedidos nuevos). Se cargan en Admin → Créditos → Banco.
CREATE TABLE IF NOT EXISTS transferencia_cuentas (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moneda       text NOT NULL CHECK (moneda IN ('ARS', 'USD')),
  alias        text NOT NULL,
  titular      text NOT NULL,
  activo       boolean NOT NULL DEFAULT true,
  orden        int NOT NULL,
  creado       timestamptz NOT NULL DEFAULT now(),
  actualizado  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS transferencia_cuentas_alias_uk ON transferencia_cuentas (moneda, lower(alias));
CREATE INDEX IF NOT EXISTS transferencia_cuentas_orden_idx ON transferencia_cuentas (moneda, orden);

-- Turno de cada moneda: el lugar (orden) de la última cuenta que se le pasó a un pedido. La siguiente es la primera
-- cuenta activa con un orden mayor (o, al final de la lista, la primera activa). Se toma con FOR UPDATE: dos pedidos a
-- la vez reciben cuentas seguidas, nunca la misma vuelta dos veces.
CREATE TABLE IF NOT EXISTS transferencia_rotacion (
  moneda        text PRIMARY KEY CHECK (moneda IN ('ARS', 'USD')),
  ultimo_orden  int
);

-- La cuenta que se le pasó a cada pedido, por moneda (si cambió de moneda, una de cada lista; la de la moneda elegida
-- es pedidos_creditos.moneda_asistente, o pesos si no se le preguntó). Copia del alias y el titular de ese momento:
-- el pedido la conserva aunque después la cuenta se pause, se edite o se borre (cuenta_id sin FK a propósito).
CREATE TABLE IF NOT EXISTS pedidos_transferencia (
  pedido_id  uuid NOT NULL REFERENCES pedidos_creditos(id) ON DELETE CASCADE,
  moneda     text NOT NULL CHECK (moneda IN ('ARS', 'USD')),
  cuenta_id  uuid NOT NULL,
  alias      text NOT NULL,
  titular    text NOT NULL,
  asignado   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pedido_id, moneda)
);
CREATE INDEX IF NOT EXISTS pedidos_transferencia_cuenta_idx ON pedidos_transferencia (cuenta_id);

-- Una sola vez (sin filas en transferencia_rotacion): la cuenta que había en el ajuste 'asistente' (alias/titular en
-- pesos, aliasUsd/titularUsd en dólares) pasa a ser la primera de cada lista. El ajuste viejo no se toca (si hubiera que
-- volver a la versión anterior, sigue andando), pero desde acá solo se usan las listas.
DO $$
DECLARE v jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM transferencia_rotacion) THEN
    SELECT valor INTO v FROM ajustes WHERE clave = 'asistente';
    IF v IS NOT NULL AND btrim(COALESCE(v->>'alias', '')) <> '' AND btrim(COALESCE(v->>'titular', '')) <> '' THEN
      INSERT INTO transferencia_cuentas (moneda, alias, titular, orden)
      VALUES ('ARS', btrim(v->>'alias'), btrim(v->>'titular'), 1) ON CONFLICT DO NOTHING;
    END IF;
    IF v IS NOT NULL AND btrim(COALESCE(v->>'aliasUsd', '')) <> '' AND btrim(COALESCE(v->>'titularUsd', '')) <> '' THEN
      INSERT INTO transferencia_cuentas (moneda, alias, titular, orden)
      VALUES ('USD', btrim(v->>'aliasUsd'), btrim(v->>'titularUsd'), 1) ON CONFLICT DO NOTHING;
    END IF;
    -- Los pedidos pendientes que ya pasaron por el chat del asistente recibieron esa cuenta: queda anotada en el pedido
    -- (la de la moneda que eligió; pesos si no se le preguntó), para que el aviso y el admin la muestren.
    INSERT INTO pedidos_transferencia (pedido_id, moneda, cuenta_id, alias, titular)
    SELECT pc.id, tc.moneda, tc.id, tc.alias, tc.titular
    FROM pedidos_creditos pc
    JOIN transferencia_cuentas tc ON tc.moneda = COALESCE(pc.moneda_asistente, 'ARS')
    WHERE pc.estado = 'pendiente'
      AND EXISTS (SELECT 1 FROM asistente_conv_pedidos cp WHERE cp.pedido_id = pc.id)
    ON CONFLICT DO NOTHING;
    INSERT INTO transferencia_rotacion (moneda) VALUES ('ARS'), ('USD') ON CONFLICT DO NOTHING;
  END IF;
END $$;
