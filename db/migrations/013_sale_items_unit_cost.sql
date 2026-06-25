-- 013 · Snapshot de costo (COGS) por línea de venta (VE y CO)
-- sale_items.unit_cost = costo unitario CONGELADO en la moneda de la venta, al
-- momento de procesarla. Así la ganancia NO se recalcula con la TRM cada vez:
-- queda asentada con el costo del día, igual que el monto de la venta.
--   VE: costo en USD (factor 1).   CO: costo USD × TRM (queda en pesos).
-- Backfill de ventas existentes con el costo actual × TRM actual (mejor estimado).
-- Idempotente: solo rellena las filas con unit_cost = 0 (no pisa snapshots ya hechos).
-- Corre en AMBAS DBs; el factor se autodetecta por la existencia de colombia_exchange_rates.

ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS unit_cost DECIMAL(12,2) DEFAULT 0;

DO $$
DECLARE f NUMERIC := 1;
BEGIN
  IF to_regclass('public.colombia_exchange_rates') IS NOT NULL THEN
    SELECT COALESCE(trm_rate, 1) INTO f
    FROM colombia_exchange_rates ORDER BY rate_date DESC, created_at DESC LIMIT 1;
    IF f IS NULL OR f <= 0 THEN f := 1; END IF;
  END IF;

  UPDATE sale_items si
  SET unit_cost = ROUND(COALESCE(pp.total_cost, 0) * f, 2)
  FROM product_pricing pp
  WHERE pp.product_id = si.product_id
    AND COALESCE(si.unit_cost, 0) = 0;

  RAISE NOTICE '013 aplicado: snapshot unit_cost (factor=%)', f;
END $$;
