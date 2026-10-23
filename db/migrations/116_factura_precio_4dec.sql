-- 116 · invoice_items.unit_price_usd con 4 decimales (23-10): en una factura de varias ventas el mismo producto va en
-- una línea con el precio PROMEDIO (mig 114); con 2 decimales, al corregir la factura el total podía moverse unos
-- céntimos. Solo amplía la precisión (los valores existentes no cambian): compatible con la versión anterior.
ALTER TABLE invoice_items ALTER COLUMN unit_price_usd TYPE NUMERIC(14,4);
