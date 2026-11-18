-- SexyRose: primeros pasos de la acompañante (18/11/2026, decisión de Juan).
-- Al entrar al panel por primera vez, una cuenta nueva con el perfil incompleto ve una guía paso a paso
-- (/panel/primeros-pasos: Tus datos, Fotos, Verificación, Email y Listo). guia_vista = cuándo la cerró con
-- "Seguir después" o "Listo": desde ahí ya no se abre sola (se retoma desde el Resumen mientras falte algo).
-- Los pasos que faltan salen de lo que ya guarda el servidor (perfil, fotos, verificación, email), no de esta columna.
-- Se aplica en cada arranque: idempotente.

ALTER TABLE cuentas ADD COLUMN IF NOT EXISTS guia_vista timestamptz;
