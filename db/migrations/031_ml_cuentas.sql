-- 031 · Cuentas de MercadoLibre por empresa (antes fijas en el código: VE PIKEKE /
-- SOLUCION-MC, CO KROYS / VAPERK). Se guardan en app_settings `ml_cuentas` (JSON) y se
-- editan en Ajustes → Tu negocio. Base compartida (inventory).
--
-- SolucionesMC VE: la segunda cuenta se llama SOLUCIONES_MC. Sus 124 códigos viejos
-- estaban guardados como 'MC' (del sistema anterior) y el código buscaba 'SOLUCION-MC':
-- no se veían en la ficha y se borraban al guardar el producto. Se renombran.
--
-- Idempotente. Se corre como postgres en inventory_db / inventory (y en staging).
BEGIN;

INSERT INTO app_settings (empresa_id, key, value)
SELECT e.id, 'ml_cuentas', CASE e.country WHEN 'VE' THEN '["PIKEKE","SOLUCIONES_MC"]' ELSE '["KROYS","VAPERK"]' END
FROM empresas e WHERE e.organizacion_id = 1
ON CONFLICT (empresa_id, key) DO NOTHING;

UPDATE product_ml_codes SET ml_account = 'SOLUCIONES_MC', updated_at = NOW()
WHERE empresa_id = 1 AND ml_account IN ('MC', 'SOLUCION-MC');

COMMIT;
