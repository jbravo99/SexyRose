-- 13/11/2026 (Juan): "Ciudad de Buenos Aires" se muestra como "Capital Federal (CABA)".
-- Solo el nombre visible: el id ('ciudad-de-buenos-aires') y las direcciones (/argentina/buenos-aires) no cambian.
-- No pisa un nombre editado desde el admin.
UPDATE ubicaciones SET nombre = 'Capital Federal (CABA)'
 WHERE id = 'ciudad-de-buenos-aires' AND nombre = 'Ciudad de Buenos Aires';
