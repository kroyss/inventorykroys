-- 003_orders_updated_at.sql  (idempotente)
-- Fecha de "último movimiento" en compras locales e importaciones:
-- una columna updated_at que un trigger pone en NOW() en CADA update.
-- Así, ordenando por updated_at, lo último recibido/modificado queda arriba
-- y lo viejo cae al fondo.

-- 1) Columna en ambas tablas (import_orders YA la tiene → IF NOT EXISTS la salta).
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
ALTER TABLE import_orders   ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- 2) Backfill SOLO purchase_orders (su updated_at no se mantenía / pudo quedar en
--    la hora del ALTER). NO tocar import_orders.updated_at: ya refleja el último
--    movimiento real porque el código lo setea en cada cambio.
UPDATE purchase_orders SET updated_at = COALESCE(received_at, created_at);

-- 3) Trigger catch-all: cualquier UPDATE de la fila refresca updated_at.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_po_updated_at ON purchase_orders;
CREATE TRIGGER trg_po_updated_at BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_io_updated_at ON import_orders;
CREATE TRIGGER trg_io_updated_at BEFORE UPDATE ON import_orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
