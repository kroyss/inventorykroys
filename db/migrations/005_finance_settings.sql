-- 005_finance_settings.sql (idempotente) — Ajustes del módulo Finanzas.
-- SOLO en VE (maestra). Guarda la tasa COP/USD para consolidar Colombia a USD.

CREATE TABLE IF NOT EXISTS finance_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Tasa: cuántos COP equivalen a 1 USD (el "dólar a 3700/4000" del Excel).
INSERT INTO finance_settings (key, value) VALUES ('cop_usd_rate', '4000')
  ON CONFLICT (key) DO NOTHING;
