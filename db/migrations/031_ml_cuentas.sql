-- 031 · Cuentas de MercadoLibre por empresa (antes fijas en el código: VE PIKEKE /
-- SOLUCION-MC, CO KROYS / VAPERK). Se guardan en app_settings `ml_cuentas` (JSON) y se
-- editan en Ajustes. Base compartida (inventory): SolucionesMC conserva las suyas.
--
-- Idempotente. Se corre como postgres en inventory_db / inventory (y en staging).
INSERT INTO app_settings (empresa_id, key, value)
SELECT e.id, 'ml_cuentas', CASE e.country WHEN 'VE' THEN '["PIKEKE","SOLUCION-MC"]' ELSE '["KROYS","VAPERK"]' END
FROM empresas e WHERE e.organizacion_id = 1
ON CONFLICT (empresa_id, key) DO NOTHING;
