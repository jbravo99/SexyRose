-- De dónde vienen las visitas (16/11/2026, decisión de Juan; solo Admin → Métricas → Tráfico, las acompañantes no lo ven).
-- El navegador clasifica la llegada a la pestaña en una categoría fija y manda solo eso (nunca la dirección ni el dominio
-- de donde vino). Acá se suman totales por día y categoría: sin IP, navegador, cookie ni identificador de quien mira.
-- Categorías: buscadores (Google y buscadores), redes, mensajeria (WhatsApp y Telegram), otros (otros sitios), directo.
-- Lo de antes de esta tabla no tiene origen ("sin dato" = páginas vistas − suma de las categorías).
-- Ver FASE1-CONTRATO.md → "Admin → Métricas". Idempotente: se vuelve a aplicar en cada arranque.

-- Todo el sitio: páginas vistas (inicio, país, lugar y perfiles) por día y categoría.
CREATE TABLE IF NOT EXISTS metricas_origen_dia (
  dia     date NOT NULL,
  origen  text NOT NULL CHECK (origen IN ('buscadores', 'redes', 'mensajeria', 'otros', 'directo')),
  vistas  integer NOT NULL DEFAULT 0 CHECK (vistas >= 0),
  PRIMARY KEY (dia, origen)
);

-- Por perfil: visitas al perfil por día y categoría. Si la cuenta se borra, sus filas se van con ella.
CREATE TABLE IF NOT EXISTS metricas_perfil_origen_dia (
  cuenta_id  uuid NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  dia        date NOT NULL,
  origen     text NOT NULL CHECK (origen IN ('buscadores', 'redes', 'mensajeria', 'otros', 'directo')),
  vistas     integer NOT NULL DEFAULT 0 CHECK (vistas >= 0),
  PRIMARY KEY (cuenta_id, dia, origen)
);
CREATE INDEX IF NOT EXISTS metricas_perfil_origen_dia_dia_idx ON metricas_perfil_origen_dia (dia);
