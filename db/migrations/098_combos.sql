-- 098 · Combos: cuántas unidades del producto trae cada publicación de ML (2026-10-16, decidido con el dueño).
-- Un mismo producto del inventario (por unidad) puede estar en varias publicaciones: suelto, combo de 2, de 4…
-- y en varias cuentas. Al registrar una venta de ML, la cantidad = lo comprado × unidades de la publicación.
--   product_ml_codes.unidades  1 = publicación de una unidad (lo de siempre); 4 = combo de 4
--   product_ml_codes.titulo    título de la publicación al vincularla (para mostrarla en la ficha)
-- Compatible con la versión anterior (solo agrega; todo lo vinculado queda en 1). Idempotente.
ALTER TABLE product_ml_codes ADD COLUMN IF NOT EXISTS unidades INTEGER NOT NULL DEFAULT 1;
ALTER TABLE product_ml_codes ADD COLUMN IF NOT EXISTS titulo TEXT;
-- Revisado en "posibles combos" (aunque haya quedado en 1): no se vuelve a proponer.
ALTER TABLE product_ml_codes ADD COLUMN IF NOT EXISTS combo_revisado BOOLEAN NOT NULL DEFAULT FALSE;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_ml_codes_unidades_check') THEN
    ALTER TABLE product_ml_codes ADD CONSTRAINT product_ml_codes_unidades_check CHECK (unidades BETWEEN 1 AND 500);
  END IF;
END $$;
