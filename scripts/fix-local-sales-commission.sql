-- Corrección histórica: ventas LOCAL no llevan comisión ni envío de ML
-- (son venta neta directa, entrega/cobro en destino). Por un bug, al procesarlas
-- se les congelaba la comisión de ML igual que a las ventas de MercadoLibre, lo
-- que inflaba su costo y bajaba su ganancia real en dashboard/reportes.
--
-- Este script pone unit_commission = 0 en todas las líneas de ventas cuyo número
-- empieza con 'LOCAL-'. Idempotente (solo toca las que aún tienen comisión != 0).
-- Correr en AMBAS DBs (inventory_ve e inventory_co).
--
--   docker exec -i inventory_db_ve psql -U postgres -d inventory_ve < fix-local-sales-commission.sql
--   docker exec -i inventory_db_co psql -U postgres -d inventory_co < fix-local-sales-commission.sql

UPDATE sale_items si
SET unit_commission = 0
FROM sales s
WHERE s.id = si.sale_id
  AND s.ml_order_number LIKE 'LOCAL-%'
  AND si.unit_commission <> 0;
