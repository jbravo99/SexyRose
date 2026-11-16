-- Admin → Métricas (16/11/2026, decisión de Juan: "quiero poder visualizar los KPIs con gráficos en lo posible").
-- Tráfico sin datos personales: solo contadores por día (hora Argentina). Nunca se guarda IP, navegador, cookie ni
-- ningún identificador de quien mira: el sitio manda un aviso (POST /api/sitio/evento) y el servidor suma 1.
-- Ver FASE1-CONTRATO.md → "Admin → Métricas". Idempotente: se vuelve a aplicar en cada arranque.

-- Por perfil y por día: visitas al perfil y clics en los botones de WhatsApp y Telegram. Si la cuenta se borra, sus
-- contadores se van con ella (los del sitio quedan).
CREATE TABLE IF NOT EXISTS metricas_perfil_dia (
  cuenta_id  uuid NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  dia        date NOT NULL,
  vistas     integer NOT NULL DEFAULT 0 CHECK (vistas >= 0),
  whatsapp   integer NOT NULL DEFAULT 0 CHECK (whatsapp >= 0),
  telegram   integer NOT NULL DEFAULT 0 CHECK (telegram >= 0),
  PRIMARY KEY (cuenta_id, dia)
);
CREATE INDEX IF NOT EXISTS metricas_perfil_dia_dia_idx ON metricas_perfil_dia (dia);

-- Todo el sitio por día: páginas vistas (inicio, páginas de país y lugar, perfiles).
CREATE TABLE IF NOT EXISTS metricas_sitio_dia (
  dia     date PRIMARY KEY,
  vistas  integer NOT NULL DEFAULT 0 CHECK (vistas >= 0)
);

-- Índices para las series por fecha de Admin → Métricas (las tablas que más crecen).
CREATE INDEX IF NOT EXISTS pedidos_creditos_confirmado_idx ON pedidos_creditos (confirmado) WHERE estado = 'confirmado';
CREATE INDEX IF NOT EXISTS creditos_mov_creado_idx ON creditos_movimientos (creado);
CREATE INDEX IF NOT EXISTS ventas_contenido_pagado_idx ON ventas_contenido (pagado) WHERE estado = 'aprobada';
CREATE INDEX IF NOT EXISTS cuentas_creado_idx ON cuentas (creado);
CREATE INDEX IF NOT EXISTS clientes_creado_idx ON clientes (creado);
CREATE INDEX IF NOT EXISTS solicitudes_creado_idx ON solicitudes (creado);
CREATE INDEX IF NOT EXISTS suscripciones_creado_idx ON suscripciones (creado);
CREATE INDEX IF NOT EXISTS asistente_conv_creado_idx ON asistente_conversaciones (creado);
