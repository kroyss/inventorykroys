-- 050 · "Sin Asignación" (categoría de 0%) y "Sin categoría" (sin categoría) eran lo mismo: queda
-- solo "Sin categoría". Los productos de la de 0% pasan a sin categoría (el precio no cambia: 0%
-- de ganancia en los dos casos) y la de 0% se desactiva. Idempotente.
BEGIN;

UPDATE product_pricing pp SET profit_category_id = NULL
FROM profit_categories pc
WHERE pp.profit_category_id = pc.id AND pc.profit_percentage = 0;

UPDATE profit_categories SET is_active = FALSE WHERE profit_percentage = 0 AND is_active;

COMMIT;
