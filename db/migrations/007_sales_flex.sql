-- 007_sales_flex.sql (idempotente) — Marca FLEX en ventas.
-- Correr en AMBAS bases (la columna es inofensiva en VE; el flujo FLEX se usa en CO).
-- FLEX=TRUE: la venta va a PROCESADA y espera descarga del Excel.
-- FLEX=FALSE (en CO): la venta pasa directo a DESCARGADA.

ALTER TABLE sales ADD COLUMN IF NOT EXISTS is_flex BOOLEAN NOT NULL DEFAULT FALSE;
