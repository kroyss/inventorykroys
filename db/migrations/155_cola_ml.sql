-- 155 · Cola de tareas para MercadoLibre (08-11-2026, lib/colaML.ts).
-- La cola de "Publicaciones en lote" (mig 152) pasa a ser la de todo lo que se manda a ML en segundo plano:
-- descripciones, precios, lecturas y ahora agregar publicaciones a promociones. La procesa /api/cron/cola-ml
-- con un tope general por minuto repartido entre las cuentas que tienen algo pendiente.
-- Solo AGREGA (compatible con la versión anterior durante la subida sin corte).

ALTER TABLE ml_pub_lotes DROP CONSTRAINT IF EXISTS ml_pub_lotes_tipo_check;
ALTER TABLE ml_pub_lotes ADD CONSTRAINT ml_pub_lotes_tipo_check CHECK (tipo IN ('descripcion', 'precio', 'leer', 'promocion'));

ALTER TABLE ml_pub_lote_items ADD COLUMN IF NOT EXISTS conexion_id INTEGER;      -- cuenta de ML (para repartir el tope)
ALTER TABLE ml_pub_lote_items ADD COLUMN IF NOT EXISTS no_antes    TIMESTAMPTZ;  -- volver a mirarla desde esta hora
ALTER TABLE ml_pub_lote_items ADD COLUMN IF NOT EXISTS intentos    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ml_pub_lote_items ADD COLUMN IF NOT EXISTS resultado   JSONB;        -- p. ej. { precio, manda }

-- Las ya creadas: su cuenta sale del catálogo.
UPDATE ml_pub_lote_items i SET conexion_id = c.conexion_id
FROM ml_catalogo c WHERE c.item_id = i.item_id AND c.empresa_id = i.empresa_id AND i.conexion_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_ml_pub_lote_items_cola ON ml_pub_lote_items (empresa_id, conexion_id) WHERE estado = 'pendiente';
