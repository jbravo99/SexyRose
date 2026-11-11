-- SexyRose Planes v2 (11/11/2026): de 6 planes a 4. Idempotente; se aplica en cada arranque, después de 020/040.
--   E Bronce (gratis) · D Plata (USD 35/mes, sin semana) · C Oro (90/mes, 27/semana) · S Star (350/mes, 105/semana)
-- Platino (B) y Diamante (A) desaparecen. Si en la base hay suscripciones activas o pedidos abiertos con B o A, este
-- archivo FRENA el arranque (RAISE EXCEPTION): Juan pidió parar y decidir cómo migrarlos antes de seguir.

DO $guard$
DECLARE
  n_sus int;
  n_ped int;
BEGIN
  SELECT count(*) INTO n_sus FROM suscripciones WHERE estado = 'activa' AND plan IN ('B', 'A') AND hasta > now();
  SELECT count(*) INTO n_ped FROM pedidos WHERE estado IN ('pendiente', 'informado') AND plan IN ('B', 'A');
  IF n_sus > 0 OR n_ped > 0 THEN
    RAISE EXCEPTION 'Planes v2: hay % suscripciones activas y % pedidos abiertos con Platino (B) o Diamante (A). '
      'No se migran solos: decidí cómo pasarlos a Oro/Star (avisale a Claude) y volvé a desplegar.', n_sus, n_ped
      USING ERRCODE = 'P0001';
  END IF;
END
$guard$;

-- Restricciones de plan: solo D, C, S (y semana solo C y S). NOT VALID: no se revisan las filas viejas (historial con
-- B/A vencidas o confirmadas), pero ninguna fila nueva puede usar B o A.
DO $ck$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suscripciones_plan_v2_ck') THEN
    ALTER TABLE suscripciones DROP CONSTRAINT IF EXISTS suscripciones_plan_check;
    ALTER TABLE suscripciones ADD CONSTRAINT suscripciones_plan_v2_ck CHECK (plan IN ('D', 'C', 'S')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pedidos_plan_v2_ck') THEN
    ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_plan_check;
    ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_semana_ck;
    ALTER TABLE pedidos ADD CONSTRAINT pedidos_plan_v2_ck CHECK (plan IN ('D', 'C', 'S') AND (periodo = 'mes' OR plan IN ('C', 'S'))) NOT VALID;
  END IF;
END
$ck$;

-- Precios: si siguen siendo los de la semilla vieja (09/11), pasan a los de v2. Si el admin los había cambiado, se dejan
-- (y lib/planes.js ignora las claves B/A); se avisa en el log del servidor.
UPDATE ajustes
   SET valor = '{"mes": {"E": 0, "D": 35, "C": 90, "S": 350}, "semana": {"C": 27, "S": 105}}'::jsonb, actualizado = now()
 WHERE clave = 'precios'
   AND valor = '{"mes": {"E": 0, "D": 20, "C": 45, "B": 70, "A": 150, "S": 350}, "semana": {"B": 21, "A": 45, "S": 105}}'::jsonb;

DO $aviso$
BEGIN
  IF EXISTS (SELECT 1 FROM ajustes WHERE clave = 'precios' AND (valor->'mes' ? 'B' OR valor->'mes' ? 'A')) THEN
    RAISE NOTICE 'Planes v2: ajustes.precios fue editado a mano y todavía tiene Platino/Diamante. Revisalo en Admin → Ajustes.';
  END IF;
END
$aviso$;
