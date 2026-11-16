-- 13/11/2026 (Juan): el Destacado es por semana (7 días) o por mes (30 días). Antes era por 1 o 7 días: los de 1 día
-- que ya existan siguen valiendo. Precios en ajustes 'destacado' ({E,D,C: {mes, semana}, semanaAuto}, lib/planes.js).
ALTER TABLE destacados DROP CONSTRAINT IF EXISTS destacados_dias_check;
DO $$ BEGIN
  ALTER TABLE destacados ADD CONSTRAINT destacados_dias_ck CHECK (dias IN (1, 7, 30));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
