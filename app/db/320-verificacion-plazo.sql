-- Publicar antes de verificar (19/11/2026, decisión de Juan): el admin puede publicar un perfil sin la identidad
-- verificada; desde ahí ella tiene 7 días para MANDAR la verificación (frente, dorso y selfie). Si no la manda, el perfil
-- se pausa solo (pausado_por = 'sin_verificacion') y vuelve a verse solo apenas la manda. Avisos: al publicar y cuando
-- faltan 2 días (verificacion_aviso2, una sola vez por plazo). Ver lib/plazo-verificacion.js.
-- Idempotente: se vuelve a aplicar en cada arranque.
ALTER TABLE perfiles ADD COLUMN IF NOT EXISTS verificacion_limite timestamptz;
ALTER TABLE perfiles ADD COLUMN IF NOT EXISTS verificacion_aviso2 timestamptz;
ALTER TABLE perfiles DROP CONSTRAINT IF EXISTS perfiles_pausado_por_ck;
ALTER TABLE perfiles ADD CONSTRAINT perfiles_pausado_por_ck CHECK (pausado_por IS NULL OR pausado_por IN ('admin', 'sin_saldo', 'sin_verificacion'));
CREATE INDEX IF NOT EXISTS perfiles_verif_limite_idx ON perfiles (verificacion_limite) WHERE verificacion_limite IS NOT NULL;
