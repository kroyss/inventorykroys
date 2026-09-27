-- 027 · inventory_movements: el signo tiene que coincidir con el tipo.
--
-- Convención: IN +, OUT −, ADJUST = delta (cualquier signo). El sistema viejo
-- guardó salidas de reapertura con signo positivo y eso rompió el historial de
-- 4 productos en VE (ver scripts/fix-signo-reaperturas-legacy-ve.sql): la suma
-- de movimientos dejó de explicar el stock, y el reporte de Stock llegó a
-- clasificar como "Declive" a un producto que vende 41/mes.
--
-- NOT VALID: la regla se aplica a todo lo que se inserte o modifique desde
-- ahora, pero NO revisa las filas viejas. Así la migración corre igual en VE y
-- CO sin importar si quedan datos heredados mal firmados; esos se corrigen
-- aparte con su script. Si algún día un camino del código escribe un signo
-- equivocado, la operación falla en voz alta en vez de corromper el historial
-- en silencio.
--
-- Idempotente.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_movements_sign_check'
  ) THEN
    ALTER TABLE inventory_movements
      ADD CONSTRAINT inventory_movements_sign_check
      CHECK (NOT (movement_type = 'IN'  AND quantity < 0)
         AND NOT (movement_type = 'OUT' AND quantity > 0))
      NOT VALID;
  END IF;
END $$;
