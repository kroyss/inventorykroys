-- 036 · Preguntas: precio de la publicación en MercadoLibre (el que ve el comprador,
-- con la promoción aplicada). El precio del inventario puede diferir (descuentos en el
-- sitio), y para responder manda el de ML. Se refresca cada ~30 min en las pendientes.
-- Idempotente. Por empresa (columnas nuevas en una tabla que ya tiene RLS).
BEGIN;
ALTER TABLE ml_preguntas ADD COLUMN IF NOT EXISTS item_precio          NUMERIC(14,2);
ALTER TABLE ml_preguntas ADD COLUMN IF NOT EXISTS item_precio_original NUMERIC(14,2);   -- antes de la promoción
ALTER TABLE ml_preguntas ADD COLUMN IF NOT EXISTS item_moneda          TEXT;
ALTER TABLE ml_preguntas ADD COLUMN IF NOT EXISTS item_actualizado_at  TIMESTAMPTZ;
COMMIT;
