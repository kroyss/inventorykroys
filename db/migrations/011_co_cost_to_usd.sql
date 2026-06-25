-- 011 · Backfill de costos CO a USD (SOLO DB CO)
-- Modelo híbrido CO: el COSTO va en USD (lo que se paga al comprar) y el PRECIO
-- DE VENTA queda en pesos (inventory.sale_price, lo que se publica en ML).
-- Los costos venían cargados en pesos (import Inflow) → se convierten ÷ TRM.
-- Los campos *_usd de product_pricing tenían el precio en pesos duplicado y CO
-- no los usa (son del calculador de VE) → se ponen en 0.
-- sale_price (pesos) NO se toca.
--
-- Idempotente: se registra en _backfills; una segunda corrida no hace nada.
-- NO correr en VE (allí los costos ya son USD).

CREATE TABLE IF NOT EXISTS _backfills (
  name    TEXT PRIMARY KEY,
  done_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
DECLARE trm NUMERIC;
BEGIN
  IF EXISTS (SELECT 1 FROM _backfills WHERE name = '011_co_cost_to_usd') THEN
    RAISE NOTICE '011 ya aplicado, saltando';
    RETURN;
  END IF;

  -- Seguridad: esto es solo para CO. Si existe la tabla de tasas de VE con datos
  -- propios (venezuela_exchange_rates con filas), abortar para no correrlo en VE.
  IF to_regclass('public.colombia_exchange_rates') IS NULL THEN
    RAISE EXCEPTION 'No existe colombia_exchange_rates: esta migracion es solo para la DB de CO';
  END IF;

  SELECT trm_rate INTO trm FROM colombia_exchange_rates
    ORDER BY rate_date DESC, created_at DESC LIMIT 1;
  IF trm IS NULL OR trm <= 0 THEN
    RAISE EXCEPTION 'No hay TRM en colombia_exchange_rates; corre el cron de tasas primero';
  END IF;

  -- Costo a USD (el trigger trg_update_pricing_totals recalcula total_cost = base+shipping).
  -- Campos *_usd a 0 (CO no los usa; tenian pesos duplicados).
  UPDATE product_pricing
  SET base_cost           = ROUND(COALESCE(base_cost,0)     / trm, 2),
      shipping_cost       = ROUND(COALESCE(shipping_cost,0) / trm, 2),
      base_price_usd      = 0,
      published_price_usd = 0,
      final_price_usd     = 0;

  INSERT INTO _backfills(name) VALUES ('011_co_cost_to_usd');
  RAISE NOTICE '011 aplicado: costos CO convertidos a USD (TRM=%)', trm;
END $$;
