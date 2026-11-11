-- SexyRose Fase 1: cuentas de acompañantes, perfiles, fotos, verificación, historias, catálogos y ajustes.
-- Se aplica en cada arranque, después de schema.sql: todo es idempotente.

CREATE TABLE IF NOT EXISTS cuentas (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email                 text NOT NULL UNIQUE CHECK (email = lower(email)),
  pass_hash             text NOT NULL,
  email_verificado      timestamptz,
  estado                text NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'suspendida', 'baja')),
  creado                timestamptz NOT NULL DEFAULT now(),
  ultimo_login          timestamptz,
  acepto_terminos       timestamptz,
  mayor_edad_declarada  boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS sesiones (
  token_hash  bytea PRIMARY KEY,
  cuenta_id   uuid NOT NULL REFERENCES cuentas (id) ON DELETE CASCADE,
  creado      timestamptz NOT NULL DEFAULT now(),
  expira      timestamptz NOT NULL,
  ua          text
);
CREATE INDEX IF NOT EXISTS sesiones_cuenta_idx ON sesiones (cuenta_id);

CREATE TABLE IF NOT EXISTS tokens_email (
  token_hash  bytea PRIMARY KEY,
  cuenta_id   uuid NOT NULL REFERENCES cuentas (id) ON DELETE CASCADE,
  tipo        text NOT NULL CHECK (tipo IN ('verificar', 'restablecer')),
  creado      timestamptz NOT NULL DEFAULT now(),
  expira      timestamptz NOT NULL,
  usado       timestamptz
);
CREATE INDEX IF NOT EXISTS tokens_email_cuenta_idx ON tokens_email (cuenta_id, tipo);

CREATE TABLE IF NOT EXISTS perfiles (
  cuenta_id       uuid PRIMARY KEY REFERENCES cuentas (id) ON DELETE CASCADE,
  slug            text NOT NULL UNIQUE,
  datos           jsonb NOT NULL DEFAULT '{}'::jsonb,
  estado          text NOT NULL DEFAULT 'borrador'
                  CHECK (estado IN ('borrador', 'en_revision', 'publicado', 'rechazado', 'pausado', 'suspendido')),
  motivo_rechazo  text,
  verificacion    text NOT NULL DEFAULT 'sin_enviar' CHECK (verificacion IN ('sin_enviar', 'pendiente', 'verificada', 'rechazada')),
  oculto          boolean NOT NULL DEFAULT false,
  creado          timestamptz NOT NULL DEFAULT now(),
  actualizado     timestamptz NOT NULL DEFAULT now(),
  publicado_en    timestamptz
);
CREATE INDEX IF NOT EXISTS perfiles_estado_idx ON perfiles (estado, verificacion);

CREATE TABLE IF NOT EXISTS fotos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id  uuid NOT NULL REFERENCES cuentas (id) ON DELETE CASCADE,
  orden      int NOT NULL DEFAULT 0,
  clave      text NOT NULL,
  clave_mini text,
  url        text NOT NULL,
  url_mini   text,
  ancho      int,
  alto       int,
  creado     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fotos_cuenta_idx ON fotos (cuenta_id, orden);

CREATE TABLE IF NOT EXISTS verificaciones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id       uuid NOT NULL REFERENCES cuentas (id) ON DELETE CASCADE,
  selfie_ruta     text NOT NULL,
  documento_ruta  text NOT NULL,
  estado          text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobada', 'rechazada')),
  motivo          text,
  creado          timestamptz NOT NULL DEFAULT now(),
  revisado        timestamptz,
  revisado_por    text
);
CREATE INDEX IF NOT EXISTS verificaciones_cuenta_idx ON verificaciones (cuenta_id, creado DESC);

CREATE TABLE IF NOT EXISTS historias (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id   uuid NOT NULL REFERENCES cuentas (id) ON DELETE CASCADE,
  clave       text NOT NULL,
  clave_mini  text,
  url         text NOT NULL,
  url_mini    text,
  texto       text NOT NULL DEFAULT '',
  creado      timestamptz NOT NULL DEFAULT now(),
  expira      timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);
CREATE INDEX IF NOT EXISTS historias_cuenta_idx ON historias (cuenta_id, creado DESC);
CREATE INDEX IF NOT EXISTS historias_expira_idx ON historias (expira);

-- Catálogos (editables desde el admin)
CREATE TABLE IF NOT EXISTS ubicaciones (
  id      text PRIMARY KEY,
  nombre  text NOT NULL UNIQUE,
  tipo    text NOT NULL CHECK (tipo IN ('pais', 'provincia', 'zona', 'ciudad')),
  padre   text REFERENCES ubicaciones (id) ON DELETE RESTRICT,
  lat     double precision,
  lng     double precision,
  activa  boolean NOT NULL DEFAULT true,
  orden   int NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS categorias (
  id      text PRIMARY KEY,
  nombre  text NOT NULL,
  icono   text NOT NULL DEFAULT 'sparkles',
  orden   int NOT NULL DEFAULT 0,
  activa  boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS intereses (
  id         text PRIMARY KEY,
  nombre     text NOT NULL,
  nombre_en  text NOT NULL DEFAULT '',
  nombre_pt  text NOT NULL DEFAULT '',
  orden      int NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS ajustes (
  clave       text PRIMARY KEY,
  valor       jsonb NOT NULL,
  actualizado timestamptz NOT NULL DEFAULT now()
);

-- Semillas (solo si no existen: el admin puede editarlas después)
INSERT INTO ubicaciones (id, nombre, tipo, padre, lat, lng, orden) VALUES
  ('argentina', 'Argentina', 'pais', NULL, -38.4, -63.6, 0),
  ('ciudad-de-buenos-aires', 'Ciudad de Buenos Aires', 'provincia', 'argentina', -34.6037, -58.3816, 1),
  ('provincia-de-buenos-aires', 'Provincia de Buenos Aires', 'provincia', 'argentina', -36.6, -60, 2),
  ('zona-norte-gba', 'Zona Norte (GBA)', 'zona', 'provincia-de-buenos-aires', -34.47, -58.6, 3),
  ('zona-oeste-gba', 'Zona Oeste (GBA)', 'zona', 'provincia-de-buenos-aires', -34.68, -58.72, 4),
  ('zona-sur-gba', 'Zona Sur (GBA)', 'zona', 'provincia-de-buenos-aires', -34.78, -58.35, 5),
  ('san-isidro', 'San Isidro', 'ciudad', 'zona-norte-gba', -34.4708, -58.5286, 6),
  ('vicente-lopez', 'Vicente López', 'ciudad', 'zona-norte-gba', -34.5265, -58.4796, 7),
  ('olivos', 'Olivos', 'ciudad', 'zona-norte-gba', -34.51, -58.493, 8),
  ('martinez', 'Martínez', 'ciudad', 'zona-norte-gba', -34.4929, -58.5045, 9),
  ('tigre', 'Tigre', 'ciudad', 'zona-norte-gba', -34.426, -58.5797, 10),
  ('san-fernando', 'San Fernando', 'ciudad', 'zona-norte-gba', -34.4417, -58.5584, 11),
  ('pilar', 'Pilar', 'ciudad', 'zona-norte-gba', -34.4587, -58.9142, 12),
  ('san-miguel', 'San Miguel', 'ciudad', 'zona-norte-gba', -34.5434, -58.7124, 13),
  ('nordelta', 'Nordelta', 'ciudad', 'zona-norte-gba', -34.4, -58.64, 14),
  ('merlo', 'Merlo', 'ciudad', 'zona-oeste-gba', -34.6653, -58.7276, 15),
  ('san-antonio-de-padua', 'San Antonio de Padua', 'ciudad', 'zona-oeste-gba', -34.6667, -58.7, 16),
  ('moron', 'Morón', 'ciudad', 'zona-oeste-gba', -34.6534, -58.6198, 17),
  ('ituzaingo', 'Ituzaingó', 'ciudad', 'zona-oeste-gba', -34.6588, -58.667, 18),
  ('castelar', 'Castelar', 'ciudad', 'zona-oeste-gba', -34.6519, -58.644, 19),
  ('haedo', 'Haedo', 'ciudad', 'zona-oeste-gba', -34.644, -58.5928, 20),
  ('ramos-mejia', 'Ramos Mejía', 'ciudad', 'zona-oeste-gba', -34.6411, -58.565, 21),
  ('san-justo', 'San Justo', 'ciudad', 'zona-oeste-gba', -34.6826, -58.5605, 22),
  ('moreno', 'Moreno', 'ciudad', 'zona-oeste-gba', -34.6507, -58.79, 23),
  ('hurlingham', 'Hurlingham', 'ciudad', 'zona-oeste-gba', -34.5885, -58.6391, 24),
  ('quilmes', 'Quilmes', 'ciudad', 'zona-sur-gba', -34.7206, -58.2546, 25),
  ('avellaneda', 'Avellaneda', 'ciudad', 'zona-sur-gba', -34.6627, -58.3653, 26),
  ('lanus', 'Lanús', 'ciudad', 'zona-sur-gba', -34.7061, -58.392, 27),
  ('banfield', 'Banfield', 'ciudad', 'zona-sur-gba', -34.7438, -58.3954, 28),
  ('lomas-de-zamora', 'Lomas de Zamora', 'ciudad', 'zona-sur-gba', -34.7616, -58.4064, 29),
  ('adrogue', 'Adrogué', 'ciudad', 'zona-sur-gba', -34.7998, -58.3842, 30),
  ('berazategui', 'Berazategui', 'ciudad', 'zona-sur-gba', -34.7626, -58.2127, 31),
  ('ezeiza', 'Ezeiza', 'ciudad', 'zona-sur-gba', -34.854, -58.523, 32),
  ('la-plata', 'La Plata', 'ciudad', 'provincia-de-buenos-aires', -34.9205, -57.9536, 33),
  ('mar-del-plata', 'Mar del Plata', 'ciudad', 'provincia-de-buenos-aires', -38.0055, -57.5426, 34),
  ('bahia-blanca', 'Bahía Blanca', 'ciudad', 'provincia-de-buenos-aires', -38.7196, -62.2724, 35),
  ('tandil', 'Tandil', 'ciudad', 'provincia-de-buenos-aires', -37.3217, -59.1332, 36),
  ('pinamar', 'Pinamar', 'ciudad', 'provincia-de-buenos-aires', -37.1074, -56.8619, 37),
  ('lujan', 'Luján', 'ciudad', 'provincia-de-buenos-aires', -34.5703, -59.105, 38),
  ('campana', 'Campana', 'ciudad', 'provincia-de-buenos-aires', -34.1687, -58.959, 39),
  ('necochea', 'Necochea', 'ciudad', 'provincia-de-buenos-aires', -38.5545, -58.7396, 40),
  ('provincia-de-catamarca', 'Provincia de Catamarca', 'provincia', 'argentina', -27.3, -66.9, 41),
  ('san-fernando-del-valle-de-catamarca', 'San Fernando del Valle de Catamarca', 'ciudad', 'provincia-de-catamarca', -28.4696, -65.7795, 42),
  ('provincia-de-chaco', 'Provincia de Chaco', 'provincia', 'argentina', -26.4, -60.7, 43),
  ('resistencia', 'Resistencia', 'ciudad', 'provincia-de-chaco', -27.4514, -58.9867, 44),
  ('provincia-de-chubut', 'Provincia de Chubut', 'provincia', 'argentina', -43.8, -68.5, 45),
  ('rawson', 'Rawson', 'ciudad', 'provincia-de-chubut', -43.3002, -65.1023, 46),
  ('comodoro-rivadavia', 'Comodoro Rivadavia', 'ciudad', 'provincia-de-chubut', -45.8641, -67.4966, 47),
  ('puerto-madryn', 'Puerto Madryn', 'ciudad', 'provincia-de-chubut', -42.7692, -65.0385, 48),
  ('trelew', 'Trelew', 'ciudad', 'provincia-de-chubut', -43.249, -65.3051, 49),
  ('provincia-de-cordoba', 'Provincia de Córdoba', 'provincia', 'argentina', -31.4, -64.2, 50),
  ('cordoba', 'Córdoba', 'ciudad', 'provincia-de-cordoba', -31.4201, -64.1888, 51),
  ('villa-carlos-paz', 'Villa Carlos Paz', 'ciudad', 'provincia-de-cordoba', -31.4241, -64.4978, 52),
  ('rio-cuarto', 'Río Cuarto', 'ciudad', 'provincia-de-cordoba', -33.1232, -64.3493, 53),
  ('provincia-de-corrientes', 'Provincia de Corrientes', 'provincia', 'argentina', -28.7, -57.8, 54),
  ('corrientes', 'Corrientes', 'ciudad', 'provincia-de-corrientes', -27.4692, -58.8306, 55),
  ('provincia-de-entre-rios', 'Provincia de Entre Ríos', 'provincia', 'argentina', -32, -59.2, 56),
  ('parana', 'Paraná', 'ciudad', 'provincia-de-entre-rios', -31.7333, -60.5297, 57),
  ('concordia', 'Concordia', 'ciudad', 'provincia-de-entre-rios', -31.3929, -58.0209, 58),
  ('gualeguaychu', 'Gualeguaychú', 'ciudad', 'provincia-de-entre-rios', -33.0094, -58.5172, 59),
  ('provincia-de-formosa', 'Provincia de Formosa', 'provincia', 'argentina', -24.9, -60, 60),
  ('formosa', 'Formosa', 'ciudad', 'provincia-de-formosa', -26.1775, -58.1781, 61),
  ('provincia-de-jujuy', 'Provincia de Jujuy', 'provincia', 'argentina', -23.3, -65.8, 62),
  ('san-salvador-de-jujuy', 'San Salvador de Jujuy', 'ciudad', 'provincia-de-jujuy', -24.1858, -65.2995, 63),
  ('provincia-de-la-pampa', 'Provincia de La Pampa', 'provincia', 'argentina', -37, -65.4, 64),
  ('santa-rosa', 'Santa Rosa', 'ciudad', 'provincia-de-la-pampa', -36.6203, -64.2906, 65),
  ('provincia-de-la-rioja', 'Provincia de La Rioja', 'provincia', 'argentina', -29.7, -67.2, 66),
  ('la-rioja', 'La Rioja', 'ciudad', 'provincia-de-la-rioja', -29.4131, -66.8558, 67),
  ('provincia-de-mendoza', 'Provincia de Mendoza', 'provincia', 'argentina', -32.9, -68.8, 68),
  ('mendoza', 'Mendoza', 'ciudad', 'provincia-de-mendoza', -32.8895, -68.8458, 69),
  ('san-rafael', 'San Rafael', 'ciudad', 'provincia-de-mendoza', -34.6177, -68.3301, 70),
  ('provincia-de-misiones', 'Provincia de Misiones', 'provincia', 'argentina', -26.9, -54.6, 71),
  ('posadas', 'Posadas', 'ciudad', 'provincia-de-misiones', -27.3671, -55.8961, 72),
  ('puerto-iguazu', 'Puerto Iguazú', 'ciudad', 'provincia-de-misiones', -25.5991, -54.5736, 73),
  ('provincia-de-neuquen', 'Provincia de Neuquén', 'provincia', 'argentina', -38.6, -70, 74),
  ('neuquen', 'Neuquén', 'ciudad', 'provincia-de-neuquen', -38.9516, -68.0591, 75),
  ('san-martin-de-los-andes', 'San Martín de los Andes', 'ciudad', 'provincia-de-neuquen', -40.1579, -71.3534, 76),
  ('provincia-de-rio-negro', 'Provincia de Río Negro', 'provincia', 'argentina', -40.4, -67.2, 77),
  ('viedma', 'Viedma', 'ciudad', 'provincia-de-rio-negro', -40.8135, -62.9967, 78),
  ('san-carlos-de-bariloche', 'San Carlos de Bariloche', 'ciudad', 'provincia-de-rio-negro', -41.1335, -71.3103, 79),
  ('general-roca', 'General Roca', 'ciudad', 'provincia-de-rio-negro', -39.0333, -67.5833, 80),
  ('provincia-de-salta', 'Provincia de Salta', 'provincia', 'argentina', -24.8, -65.4, 81),
  ('salta', 'Salta', 'ciudad', 'provincia-de-salta', -24.7821, -65.4232, 82),
  ('provincia-de-san-juan', 'Provincia de San Juan', 'provincia', 'argentina', -30.9, -68.6, 83),
  ('san-juan', 'San Juan', 'ciudad', 'provincia-de-san-juan', -31.5375, -68.5364, 84),
  ('provincia-de-san-luis', 'Provincia de San Luis', 'provincia', 'argentina', -33.8, -66, 85),
  ('san-luis', 'San Luis', 'ciudad', 'provincia-de-san-luis', -33.295, -66.3356, 86),
  ('villa-mercedes', 'Villa Mercedes', 'ciudad', 'provincia-de-san-luis', -33.6757, -65.4578, 87),
  ('provincia-de-santa-cruz', 'Provincia de Santa Cruz', 'provincia', 'argentina', -48.8, -69.3, 88),
  ('rio-gallegos', 'Río Gallegos', 'ciudad', 'provincia-de-santa-cruz', -51.623, -69.2168, 89),
  ('el-calafate', 'El Calafate', 'ciudad', 'provincia-de-santa-cruz', -50.3379, -72.2648, 90),
  ('provincia-de-santa-fe', 'Provincia de Santa Fe', 'provincia', 'argentina', -31.6, -60.7, 91),
  ('santa-fe', 'Santa Fe', 'ciudad', 'provincia-de-santa-fe', -31.6333, -60.7, 92),
  ('rosario', 'Rosario', 'ciudad', 'provincia-de-santa-fe', -32.9442, -60.6505, 93),
  ('rafaela', 'Rafaela', 'ciudad', 'provincia-de-santa-fe', -31.2526, -61.4867, 94),
  ('provincia-de-santiago-del-estero', 'Provincia de Santiago del Estero', 'provincia', 'argentina', -27.8, -63.3, 95),
  ('santiago-del-estero', 'Santiago del Estero', 'ciudad', 'provincia-de-santiago-del-estero', -27.7951, -64.2615, 96),
  ('provincia-de-tierra-del-fuego', 'Provincia de Tierra del Fuego', 'provincia', 'argentina', -54.3, -67.7, 97),
  ('ushuaia', 'Ushuaia', 'ciudad', 'provincia-de-tierra-del-fuego', -54.8019, -68.303, 98),
  ('rio-grande', 'Río Grande', 'ciudad', 'provincia-de-tierra-del-fuego', -53.7877, -67.7097, 99),
  ('provincia-de-tucuman', 'Provincia de Tucumán', 'provincia', 'argentina', -26.9, -65.4, 100),
  ('san-miguel-de-tucuman', 'San Miguel de Tucumán', 'ciudad', 'provincia-de-tucuman', -26.8083, -65.2176, 101)
ON CONFLICT (id) DO NOTHING;

INSERT INTO categorias (id, nombre, icono, orden) VALUES
  ('cafe', 'Café', 'coffee', 0), ('helado', 'Helado', 'icecream', 1), ('paseo', 'Paseo', 'walk', 2),
  ('museo', 'Museo', 'museum', 3), ('cine', 'Cine', 'cine', 4), ('cena', 'Cena', 'dinner', 5),
  ('evento', 'Evento', 'ticket', 6), ('idiomas', 'Idiomas', 'languages', 7), ('compras', 'Compras', 'bag', 8),
  ('deporte', 'Deporte', 'dumbbell', 9), ('musica', 'Música', 'music', 10)
ON CONFLICT (id) DO NOTHING;

INSERT INTO intereses (id, nombre, nombre_en, nombre_pt, orden) VALUES
  ('arte', 'Arte', 'Art', 'Arte', 0), ('musica', 'Música', 'Music', 'Música', 1), ('cine', 'Cine', 'Movies', 'Cinema', 2),
  ('teatro', 'Teatro', 'Theater', 'Teatro', 3), ('lectura', 'Lectura', 'Reading', 'Leitura', 4),
  ('historia', 'Historia', 'History', 'História', 5), ('gastronomia', 'Gastronomía', 'Food', 'Gastronomia', 6),
  ('vinos', 'Vinos', 'Wine', 'Vinhos', 7), ('viajes', 'Viajes', 'Travel', 'Viagens', 8),
  ('naturaleza', 'Naturaleza', 'Nature', 'Natureza', 9), ('deporte', 'Deporte', 'Sports', 'Esporte', 10),
  ('fotografia', 'Fotografía', 'Photography', 'Fotografia', 11), ('moda', 'Moda', 'Fashion', 'Moda', 12),
  ('tecnologia', 'Tecnología', 'Technology', 'Tecnologia', 13), ('idiomas', 'Idiomas', 'Languages', 'Idiomas', 14),
  ('negocios', 'Negocios', 'Business', 'Negócios', 15)
ON CONFLICT (id) DO NOTHING;

-- Precios (Planes v2, Juan 11/11/2026): E Bronce gratis, D Plata 35, C Oro 90, S Star 350 por mes; semana solo Oro y Star
-- (1/4 del mes + 20 %). Las bases que tenían la semilla vieja (6 planes) se pasan en 050-planes-v2.sql.
INSERT INTO ajustes (clave, valor) VALUES
  ('precios', '{"mes": {"E": 0, "D": 35, "C": 90, "S": 350}, "semana": {"C": 27, "S": 105}}'::jsonb),  -- Planes v2 (ver 050)
  ('transferencia', '""'::jsonb),
  ('portada', '{"titulo": "Acompañantes para salidas", "subtitulo": "Perfiles verificados en toda la Argentina"}'::jsonb),
  ('promo', '""'::jsonb)
ON CONFLICT (clave) DO NOTHING;
