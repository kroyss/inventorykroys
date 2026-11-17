-- 182 (16-11-2026): Stock en ML tardaba 2,6 s: «Se acabó» (mig 181) busca el último ingreso/ajuste del producto y
-- inventory_movements no tenía índice por producto. Solo agrega un índice.
CREATE INDEX IF NOT EXISTS inventory_movements_producto_fecha ON inventory_movements (empresa_id, product_id, created_at DESC);
