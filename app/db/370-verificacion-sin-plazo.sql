-- Verificación sin plazo (25/11/2026, Juan: "tiempo ilimitado; yo las contacto por WhatsApp para que manden su ID",
-- consultado con su abogado, mientras puedan cargarla desde el panel). Al publicar ya no se fija plazo
-- (avisos-cuenta.js → DIAS_VERIFICACION = 0). Acá se levantan los plazos que quedaron corriendo y se vuelven a publicar
-- los perfiles que se habían pausado por no mandarla. Solo lo de antes del 1/12/2026, para que si algún día se vuelve a
-- poner un plazo, esto no lo deshaga en cada arranque. Idempotente: se vuelve a aplicar en cada arranque.
UPDATE perfiles SET estado = 'publicado', pausado_por = NULL, actualizado = now()
 WHERE estado = 'pausado' AND pausado_por = 'sin_verificacion' AND actualizado < '2026-12-01';
UPDATE perfiles SET verificacion_limite = NULL, verificacion_aviso2 = NULL
 WHERE verificacion_limite IS NOT NULL AND verificacion_limite < '2026-12-10';
