-- Asistente de cuenta: cuenta para transferir en dólares (16/11/2026, decisión de Juan: "Me gustaría tener un alias para
-- dólares"). Si en Admin → Asistente está cargada la cuenta en dólares, el asistente pregunta si va a transferir en
-- pesos o en dólares y pasa los datos de esa moneda. Ver FASE1-CONTRATO.md → "Asistente de cuenta".
-- Idempotente: se vuelve a aplicar en cada arranque.

-- Moneda que eligió por el asistente para transferir ese pedido (NULL = no se le preguntó: sin cuenta en dólares, o el
-- pedido no pasó por el asistente). Los créditos no cambian: salen del pack.
ALTER TABLE pedidos_creditos ADD COLUMN IF NOT EXISTS moneda_asistente text CHECK (moneda_asistente IN ('ARS', 'USD'));

-- Pedido que el chat está pagando (el último al que se le pasaron los datos o se le preguntó la moneda) y si el
-- asistente está esperando la respuesta "pesos o dólares". Sirve también para cambiar de moneda ("mejor en dólares").
ALTER TABLE asistente_conversaciones ADD COLUMN IF NOT EXISTS pago_pedido_id uuid REFERENCES pedidos_creditos(id) ON DELETE SET NULL;
ALTER TABLE asistente_conversaciones ADD COLUMN IF NOT EXISTS pago_esperando_moneda boolean NOT NULL DEFAULT false;

-- Ajuste 'asistente' = { activo, alias, titular, aliasUsd, titularUsd }: alias y titular son la cuenta en pesos (como
-- antes); aliasUsd y titularUsd, la cuenta en dólares (opcional). Un ajuste viejo { activo, alias, titular } sigue igual.
