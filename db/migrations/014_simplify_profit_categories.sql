-- 014 · Simplificar categorías de ganancia: 8 → 5 (VE y CO)
-- Nuevos niveles: ULTRA 100 · ALTO 75 · MEDIO 50 · BAJO 30 · REMATE 10.
-- Se reasignan los productos por % más cercano y se desactivan SUPER/BIEN/MUERTE.
-- Approach A: NO se recalculan precios; solo cambia la categoría (etiqueta/guía).
-- "Sin Asignación" (id 9) se mantiene.
-- Idempotente: guarda en _backfills + verifica el estado previo esperado (ids 1-8).
-- Corre en AMBAS DBs (en CO no hay productos en categorías → solo actualiza la lista).

CREATE TABLE IF NOT EXISTS _backfills (
  name    TEXT PRIMARY KEY,
  done_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM _backfills WHERE name = '014_simplify_profit_categories') THEN
    RAISE NOTICE '014 ya aplicado, saltando';
    RETURN;
  END IF;

  -- Verifica que las 8 categorías estén en su estado original (id ↔ %).
  IF (SELECT count(*) FROM profit_categories WHERE
        (id=1 AND profit_percentage::int=101) OR
        (id=2 AND profit_percentage::int= 91) OR
        (id=3 AND profit_percentage::int= 81) OR
        (id=4 AND profit_percentage::int= 71) OR
        (id=5 AND profit_percentage::int= 61) OR
        (id=6 AND profit_percentage::int= 51) OR
        (id=7 AND profit_percentage::int= 31) OR
        (id=8 AND profit_percentage::int= 11)) <> 8 THEN
    RAISE EXCEPTION 'Las categorías no están en el estado esperado; abortando 014';
  END IF;

  -- Reasignación por % más cercano (UPDATE atómico: evalúa el id original).
  --   SUPER 91 → ULTRA(1) · BIEN 71 → ALTO(3) · BAJO 51 → MEDIO(5)
  --   REMATE 31 → BAJO(6) · MUERTE 11 → REMATE(7)
  UPDATE product_pricing SET profit_category_id = CASE profit_category_id
      WHEN 2 THEN 1
      WHEN 4 THEN 3
      WHEN 6 THEN 5
      WHEN 7 THEN 6
      WHEN 8 THEN 7
      ELSE profit_category_id
    END
  WHERE profit_category_id IN (2,4,6,7,8);

  -- Nuevos porcentajes de los 5 niveles que quedan.
  UPDATE profit_categories SET profit_percentage = 100 WHERE id = 1; -- ULTRA
  UPDATE profit_categories SET profit_percentage =  75 WHERE id = 3; -- ALTO
  UPDATE profit_categories SET profit_percentage =  50 WHERE id = 5; -- MEDIO
  UPDATE profit_categories SET profit_percentage =  30 WHERE id = 6; -- BAJO
  UPDATE profit_categories SET profit_percentage =  10 WHERE id = 7; -- REMATE

  -- Desactiva las 3 que se eliminan (ya quedaron vacías).
  UPDATE profit_categories SET is_active = FALSE WHERE id IN (2,4,8); -- SUPER, BIEN, MUERTE

  INSERT INTO _backfills(name) VALUES ('014_simplify_profit_categories');
  RAISE NOTICE '014 aplicado: categorías simplificadas a 5';
END $$;
