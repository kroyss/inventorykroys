-- 129 · ia_uso: cuánto de la entrada salió de la caché de Claude y cuánto se escribió en ella (27-10, para medir el
--   ahorro). `entrada` sigue siendo el total (sin caché + leída + escrita), como antes. NULL = fila de antes de esto.
-- Solo agrega: compatible con la versión anterior (la vieja no las llena).
BEGIN;

ALTER TABLE ia_uso ADD COLUMN IF NOT EXISTS cache_lectura   BIGINT;
ALTER TABLE ia_uso ADD COLUMN IF NOT EXISTS cache_escritura BIGINT;

COMMIT;
