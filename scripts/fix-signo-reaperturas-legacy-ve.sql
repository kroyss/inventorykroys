-- Corrige el signo de 5 salidas (OUT) del sistema viejo guardadas como positivas.
--
-- El sistema anterior (antes de la migración del 2026-06-15), al reabrir una
-- compra, revertía bien el inventario pero registraba el movimiento OUT con
-- signo POSITIVO. La convención es: IN +, OUT −, ADJUST = delta. Cada fila mal
-- firmada desplaza el historial en el DOBLE de su cantidad, y la
-- reconstrucción de stock hacia atrás pasaba por valores imposibles (−84 en
-- Rollos Papel Burbuja), lo que lo hacía figurar en Declive vendiendo 41/mes.
--
-- Solo se corrige el REGISTRO: inventory.quantity no se toca (el stock real
-- ya era el correcto; lo respalda el conteo de agosto).
--
-- Ejecutar UNA sola vez, contra VENEZUELA:
--   docker exec -i inventory_db_ve psql -v ON_ERROR_STOP=1 -U postgres -d inventory_ve < /opt/inventory_next/scripts/fix-signo-reaperturas-legacy-ve.sql
--
-- Aborta sin cambiar nada si las filas no son exactamente las esperadas (ya
-- corregidas, o aparecieron otras con el mismo error).

SET client_encoding = 'UTF8';

BEGIN;

CREATE TEMP TABLE esperadas (id int PRIMARY KEY, code text, cant int) ON COMMIT DROP;
INSERT INTO esperadas VALUES
  ( 423, 'COD-0251',  5),   -- Pelicula DRYSTAR 14x17         · Reapertura orden #7
  ( 424, 'COD-0255',  5),   -- Pelicula ORTHO GP-GU 14x14     · Reapertura orden #7
  ( 429, 'COD-0253',  5),   -- Pelicula ORTHO GP-GU 10x12     · Reapertura orden #10
  ( 430, 'COD-0255',  5),   -- Pelicula ORTHO GP-GU 14x14     · Reapertura orden #10
  (2110, 'COD-0299', 67);   -- Rollos Papel Burbuja           · Reapertura orden #8

-- Desfase ANTES (stock real − suma del historial; negativo = historial imposible)
SELECT p.code, LEFT(p.name, 30) AS producto, i.quantity AS stock,
       SUM(m.quantity) AS historial, i.quantity - SUM(m.quantity) AS desfase_antes
FROM products p
JOIN inventory i ON i.product_id = p.id
JOIN inventory_movements m ON m.product_id = p.id
WHERE p.code IN (SELECT code FROM esperadas)
GROUP BY p.code, p.name, i.quantity ORDER BY p.code;

DO $$
DECLARE
  v_malas   int;
  v_ok      int;
  v_n       int;
BEGIN
  -- Todas las filas con signo invertido que hay HOY en la base
  SELECT COUNT(*) INTO v_malas
  FROM inventory_movements
  WHERE (movement_type = 'OUT' AND quantity > 0) OR (movement_type = 'IN' AND quantity < 0);

  -- Cuántas de las esperadas siguen tal cual se diagnosticaron
  SELECT COUNT(*) INTO v_ok
  FROM esperadas e
  JOIN inventory_movements m ON m.id = e.id
  JOIN products p ON p.id = m.product_id
  WHERE m.movement_type = 'OUT' AND m.quantity = e.cant AND p.code = e.code;

  IF v_ok = 0 AND v_malas = 0 THEN
    RAISE EXCEPTION 'Nada que corregir: las 5 filas ya tienen el signo correcto (¿ya se aplicó?)';
  END IF;
  IF v_ok <> 5 THEN
    RAISE EXCEPTION 'Esperaba 5 filas a corregir y coinciden %. Revisar antes de aplicar.', v_ok;
  END IF;
  IF v_malas <> 5 THEN
    RAISE EXCEPTION 'Hay % filas con signo invertido, no las 5 diagnosticadas. Puede haber un error nuevo: revisar antes de aplicar.', v_malas;
  END IF;

  UPDATE inventory_movements m
     SET quantity = -m.quantity,
         notes    = COALESCE(m.notes, '') || ' [signo corregido 2026-09: era +' || m.quantity || ']'
  FROM esperadas e
  WHERE m.id = e.id AND m.movement_type = 'OUT' AND m.quantity > 0;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 5 THEN RAISE EXCEPTION 'Se corrigieron % filas en vez de 5', v_n; END IF;
  RAISE NOTICE 'Signo corregido en % movimientos', v_n;
END $$;

-- Desfase DESPUÉS: tiene que quedar >= 0 en los 4 productos. Positivo es normal
-- (stock inicial cargado sin movimiento, p.ej. la migración desde inFlow).
SELECT p.code, LEFT(p.name, 30) AS producto, i.quantity AS stock,
       SUM(m.quantity) AS historial, i.quantity - SUM(m.quantity) AS desfase_despues
FROM products p
JOIN inventory i ON i.product_id = p.id
JOIN inventory_movements m ON m.product_id = p.id
WHERE p.code IN (SELECT code FROM esperadas)
GROUP BY p.code, p.name, i.quantity ORDER BY p.code;

COMMIT;
