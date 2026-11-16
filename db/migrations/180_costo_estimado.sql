-- 180 · Costo estimado (16-11-2026, el dueño): importar 50+ productos desde ML sin tener que escribir cada costo.
-- Al importar se puede poner el costo como "% del precio" y el producto queda marcado products.costo_estimado.
-- La venta congela ese costo como siempre (sale_items.unit_cost), pero la línea queda marcada sale_items.costo_estimado.
-- Cuando se pone el costo REAL (cambia product_pricing.total_cost), el trigger corrige solas esas líneas
-- (proporcional: conserva la TRM con que se congeló en CO) y apaga las dos marcas. Las ventas con costo real
-- siguen congeladas como siempre. Solo agrega (compatible con la versión anterior). Idempotente.
ALTER TABLE products   ADD COLUMN IF NOT EXISTS costo_estimado boolean NOT NULL DEFAULT false;
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS costo_estimado boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_sale_items_costo_estimado ON sale_items (product_id) WHERE costo_estimado;

CREATE OR REPLACE FUNCTION corregir_costo_estimado() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.total_cost IS DISTINCT FROM OLD.total_cost
     AND EXISTS (SELECT 1 FROM products WHERE id = NEW.product_id AND costo_estimado) THEN
    IF COALESCE(OLD.total_cost, 0) > 0 THEN
      UPDATE sale_items
         SET unit_cost = ROUND(unit_cost * NEW.total_cost / OLD.total_cost, 2), costo_estimado = false
       WHERE product_id = NEW.product_id AND costo_estimado;
    ELSE
      UPDATE sale_items SET costo_estimado = false WHERE product_id = NEW.product_id AND costo_estimado;
    END IF;
    UPDATE products SET costo_estimado = false WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_corregir_costo_estimado ON product_pricing;
CREATE TRIGGER trg_corregir_costo_estimado AFTER UPDATE OF base_cost, shipping_cost, total_cost ON product_pricing
  FOR EACH ROW EXECUTE FUNCTION corregir_costo_estimado();
