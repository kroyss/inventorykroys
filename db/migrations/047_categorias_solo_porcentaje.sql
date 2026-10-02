-- 047 · Categorías de ganancia nombradas solo con su porcentaje, en TODAS las empresas
--       (ULTRA → "120%", SUPER → "100%", …). Leyendo el % ya se entiende; los nombres sobraban.
--       "Sin Asignación" (0%) queda igual. Los productos no cambian (apuntan por id).
--       Único por empresa (empresa_id, name): los % no se repiten dentro de una empresa.
-- Idempotente.
BEGIN;

UPDATE profit_categories
SET name = trim(trailing '.' from trim(trailing '0' from profit_percentage::text)) || '%'
WHERE profit_percentage > 0
  AND name <> trim(trailing '.' from trim(trailing '0' from profit_percentage::text)) || '%';

COMMIT;
