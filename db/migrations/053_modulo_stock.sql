-- 053 · Módulo Stock (ex "Alertas de stock") y fuera "Stock en ML".
--
-- * "Stock en ML" (stock real vs publicado, solo del dueño, en pruebas) se elimina: el módulo
--   `stock_ml` sale de todas las empresas. La tabla ml_publicaciones queda sin uso (no se borra).
-- * Alertas de stock pasa a llamarse "Stock" y es un módulo propio, `alertas_stock`, que se
--   prende/apaga por empresa en Plataforma → Empresas. Se prende en las que ya tienen `preguntas`.
-- * ml_ordenes.items: qué publicaciones/variantes tuvo cada venta ("MLV123", "MLV123:456"),
--   para contar en Stock solo lo vendido en los últimos 30 días. Lo llena el cron de ventas.
-- Idempotente.
BEGIN;

UPDATE empresas SET modulos = array_remove(modulos, 'stock_ml') WHERE 'stock_ml' = ANY(modulos);
UPDATE empresas SET modulos = array_append(modulos, 'alertas_stock')
WHERE 'preguntas' = ANY(modulos) AND NOT 'alertas_stock' = ANY(modulos);

ALTER TABLE ml_ordenes ADD COLUMN IF NOT EXISTS items TEXT[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_ml_ordenes_fecha ON ml_ordenes (empresa_id, fecha DESC);

-- Que el próximo cron vuelva a traer las ventas de 90 días ya (llena items en las existentes).
UPDATE ml_conexiones SET ordenes_sync_at = NULL;

COMMIT;
