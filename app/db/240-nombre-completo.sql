-- Nombre completo (legal) para la verificación de identidad (17/11/2026, decisiones de Juan).
-- Lo escribe la acompañante en Verificación, como figura en su documento. Nunca se publica: no está en perfiles.datos.
--   verificaciones.nombre_completo: el que mandó con ese envío (NULL en los envíos anteriores a esta migración).
--   cuentas.nombre_completo: el aprobado; se copia al aprobar la verificación y desde ahí queda fijo. Es un dato interno
--   de la cuenta: la purga de las imágenes a los 90 días no lo toca; se borra con la cuenta (ON DELETE CASCADE).
ALTER TABLE verificaciones ADD COLUMN IF NOT EXISTS nombre_completo text;
ALTER TABLE cuentas ADD COLUMN IF NOT EXISTS nombre_completo text;
