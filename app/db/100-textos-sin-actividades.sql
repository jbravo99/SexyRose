-- Textos públicos con el criterio "sitio de anuncios, sin garantías ni actividades" (Juan, 12/11/2026).
-- La portada vieja por defecto mencionaba salidas y prometía perfiles verificados: se cambia solo si sigue igual
-- al valor por defecto de siempre (si Juan la editó, queda la suya). Idempotente.
UPDATE ajustes
   SET valor = '{"titulo": "Avisos de acompañantes", "subtitulo": "Contacto directo con cada anunciante"}'::jsonb
 WHERE clave = 'portada'
   AND valor = '{"titulo": "Acompañantes para salidas", "subtitulo": "Perfiles verificados en toda la Argentina"}'::jsonb;
