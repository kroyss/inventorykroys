-- 004_finance.sql  (idempotente) — Módulo Finanzas GLOBAL (reemplaza el Excel).
-- IMPORTANTE: correr SOLO en la DB maestra (VE). NO en CO.
-- Las finanzas son globales: viven en VE y el módulo lee de ambos países.

-- Cuentas de liquidez (BOA, PayPal, Binance USDT, efectivo, reservas Tía/Vane/Marco…)
CREATE TABLE IF NOT EXISTS finance_accounts (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL DEFAULT 'banco',   -- banco|efectivo|cripto|paypal|otro
  currency      TEXT NOT NULL DEFAULT 'USD',      -- USD|COP|VES
  balance       NUMERIC(14,2) NOT NULL DEFAULT 0,
  is_reserve    BOOLEAN NOT NULL DEFAULT FALSE,   -- reservas que se restan del total
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INT NOT NULL DEFAULT 0,
  notes         TEXT,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Categorías de movimiento (ingreso/gasto)
CREATE TABLE IF NOT EXISTS finance_categories (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  kind          TEXT NOT NULL,                    -- income|expense
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INT NOT NULL DEFAULT 0
);

-- Movimientos de caja (gastos manuales + auto de compras/ventas)
CREATE TABLE IF NOT EXISTS finance_movements (
  id          SERIAL PRIMARY KEY,
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT,
  amount      NUMERIC(14,2) NOT NULL,
  kind        TEXT NOT NULL,                      -- income|expense
  currency    TEXT NOT NULL DEFAULT 'USD',
  category_id INT REFERENCES finance_categories(id),
  account_id  INT REFERENCES finance_accounts(id),
  country     TEXT,                               -- VE|CO|NULL(global)
  source      TEXT NOT NULL DEFAULT 'manual',     -- manual|auto
  ref_type    TEXT,                               -- purchase|import|sale
  ref_id      INT,
  created_by  INT,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_finance_mov_date ON finance_movements(date);
CREATE INDEX IF NOT EXISTS idx_finance_mov_cat  ON finance_movements(category_id);

-- updated_at en accounts (reusa la función set_updated_at creada en 003)
DROP TRIGGER IF EXISTS trg_fa_updated_at ON finance_accounts;
CREATE TRIGGER trg_fa_updated_at BEFORE UPDATE ON finance_accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed de categorías solo si la tabla está vacía (idempotente)
INSERT INTO finance_categories (name, kind, display_order)
SELECT v.name, v.kind, v.display_order FROM (VALUES
  ('Ventas',          'income',  10),
  ('Otros ingresos',  'income',  20),
  ('Compra local',    'expense', 10),
  ('Importación',     'expense', 20),
  ('Sueldos',         'expense', 30),
  ('Bonos',           'expense', 40),
  ('Comisiones ML',   'expense', 50),
  ('Envíos',          'expense', 60),
  ('Transportistas',  'expense', 70),
  ('Otros gastos',    'expense', 99)
) AS v(name, kind, display_order)
WHERE NOT EXISTS (SELECT 1 FROM finance_categories);
