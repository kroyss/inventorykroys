-- 016 · Snapshot de la comisión estimada de ML por línea de venta.
-- Igual que unit_cost (013): se congela al procesar la venta para que la ganancia
-- NETA del dashboard/reportes no se recalcule si cambian los parámetros ML.
-- Por país (moneda de la venta): VE en USD, CO en pesos.
-- Histórico queda en 0 (no se backfillea): el neteo rige de aquí en adelante.
-- Corre en AMBAS DBs.

ALTER TABLE IF EXISTS sale_items
  ADD COLUMN IF NOT EXISTS unit_commission DECIMAL(12,2) NOT NULL DEFAULT 0;
