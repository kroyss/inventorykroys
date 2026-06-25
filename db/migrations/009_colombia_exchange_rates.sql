-- 009 · Tasa TRM de Colombia (solo DB CO)
-- Simétrica a venezuela_exchange_rates pero simple: CO no tiene mercado paralelo,
-- la TRM es la tasa oficial. La alimenta el mismo cron del VPS (source='api'),
-- idempotente por día. La última fila es la tasa vigente para precios y Finanzas.
-- Idempotente: CREATE ... IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS colombia_exchange_rates (
  id          SERIAL PRIMARY KEY,
  rate_date   DATE          NOT NULL,
  trm_rate    NUMERIC(12,4) NOT NULL,
  source      TEXT          NOT NULL DEFAULT 'api',
  created_by  INTEGER       REFERENCES users(id),
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_co_rates_date
  ON colombia_exchange_rates (rate_date DESC, created_at DESC);
