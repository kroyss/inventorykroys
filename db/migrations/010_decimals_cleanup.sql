-- 010 · Limpieza de decimales (VE y CO)
-- Tasas de cambio → entero (son números grandes, el decimal es ruido <0.1%).
-- Dinero de la capa de precios → 2 decimales (antes 4, generaba .0000 y redondeos).
-- El ALTER ... TYPE redondea los valores existentes solo (ej. 6171.0000 → 6171.00).
-- Idempotente: re-correrlo deja el mismo tipo (no-op). Las tablas son chicas.
-- Se corre en AMBAS DBs. Las tablas de tasas que no existan en una DB se saltan
-- con ALTER TABLE IF EXISTS (colombia_exchange_rates solo está en CO).

-- ── Tasas → entero (0 decimales) ──
ALTER TABLE IF EXISTS venezuela_exchange_rates
  ALTER COLUMN official_rate TYPE DECIMAL(16,0),
  ALTER COLUMN parallel_rate TYPE DECIMAL(16,0);

ALTER TABLE IF EXISTS colombia_exchange_rates
  ALTER COLUMN trm_rate TYPE DECIMAL(12,0);

-- ── Dinero (capa de precios) → 2 decimales ──
ALTER TABLE product_pricing
  ALTER COLUMN base_cost           TYPE DECIMAL(12,2),
  ALTER COLUMN shipping_cost       TYPE DECIMAL(12,2),
  ALTER COLUMN total_cost          TYPE DECIMAL(12,2),
  ALTER COLUMN base_price_usd      TYPE DECIMAL(12,2),
  ALTER COLUMN published_price_usd TYPE DECIMAL(12,2),
  ALTER COLUMN final_price_usd     TYPE DECIMAL(12,2);

ALTER TABLE inventory
  ALTER COLUMN sale_price TYPE DECIMAL(12,2);
