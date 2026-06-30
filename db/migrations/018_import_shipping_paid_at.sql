-- 018: fecha de pago del envío de importación
--
-- El envío de cada importación (campo shipping_cost, que se carga al pasar a
-- "En camino") debe contar como GASTO del mes en Finanzas. Para ubicarlo en el
-- mes correcto se guarda la fecha en que se pagó/registró el envío.
--
-- Idempotente. Aplicar en AMBAS bases (inventory_ve e inventory_co).

ALTER TABLE import_orders
  ADD COLUMN IF NOT EXISTS shipping_paid_at TIMESTAMPTZ;

-- Backfill: órdenes que ya tienen envío cargado pero sin fecha → fecha razonable
-- (recepción / último movimiento / creación) para ubicarlas en su mes.
UPDATE import_orders
SET shipping_paid_at = COALESCE(received_at, updated_at, created_at)
WHERE shipping_cost > 0 AND shipping_paid_at IS NULL;
