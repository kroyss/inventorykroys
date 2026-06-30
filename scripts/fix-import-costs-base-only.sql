-- ════════════════════════════════════════════════════════════════════════
-- Limpieza ÚNICA: importaciones deben registrar SOLO el costo de producto
-- (base_cost), sin el envío. Antes el form pre-llenaba con total_cost (base +
-- envío), por eso el total de la orden no coincidía con el pago al proveedor.
--
-- Esto reescribe el costo de cada ítem de importación al base_cost actual del
-- producto y recalcula el total de cada orden. El envío se registra aparte.
--
-- ⚠️ Correr UNA sola vez por DB (inventory_ve e inventory_co). Es idempotente,
--    pero si alguna importación tuviera un costo ajustado a mano, lo iguala al
--    base_cost del producto. Hacé backup antes si querés conservar lo previo.
--
--   docker exec -i inventory_db_ve psql -U postgres -d inventory_ve < scripts/fix-import-costs-base-only.sql
--   docker exec -i inventory_db_co psql -U postgres -d inventory_co < scripts/fix-import-costs-base-only.sql
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1) Ítems: unit_cost_usd = base_cost del producto · total_cost_usd recalculado.
--    Si el producto no tuviera base_cost (>0), se conserva el valor actual.
UPDATE import_order_items ioi
SET unit_cost_usd  = COALESCE(NULLIF(pp.base_cost, 0), ioi.unit_cost_usd),
    total_cost_usd = COALESCE(NULLIF(pp.base_cost, 0), ioi.unit_cost_usd) * ioi.quantity
FROM product_pricing pp
WHERE pp.product_id = ioi.product_id;

-- 2) Órdenes: total_usd = suma de los ítems ya corregidos.
UPDATE import_orders io
SET total_usd = COALESCE((
  SELECT SUM(total_cost_usd) FROM import_order_items WHERE import_order_id = io.id
), 0);

COMMIT;
