-- 015 · Ajustes de la app por país (key-value) + defaults de costos ML
-- Tabla genérica para parámetros editables que se guardan (no se reinician).
-- Defaults por país: VE (comisión 12%, envío $0,65, umbral $5) ·
--   CO (comisión 15,5%, umbral $60k, envío 2.600/8.000, retención 1,91%).
-- Idempotente: ON CONFLICT DO NOTHING (no pisa valores ya editados por el usuario).
-- Corre en AMBAS DBs; el set de defaults se autodetecta por colombia_exchange_rates.

CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
DECLARE is_co BOOLEAN := to_regclass('public.colombia_exchange_rates') IS NOT NULL;
BEGIN
  IF is_co THEN
    INSERT INTO app_settings(key, value) VALUES
      ('ml_comision',     '15.5'),
      ('ml_umbral_envio', '60000'),
      ('ml_envio_bajo',   '2600'),
      ('ml_envio_alto',   '8000'),
      ('ml_reten',        '1.91')
    ON CONFLICT (key) DO NOTHING;
  ELSE
    INSERT INTO app_settings(key, value) VALUES
      ('ml_comision', '12'),
      ('ml_envio',    '0.65'),
      ('ml_umbral',   '5')
    ON CONFLICT (key) DO NOTHING;
  END IF;
END $$;
