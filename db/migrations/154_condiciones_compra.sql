-- 154: descripción en 4 partes (08-11-2026, pedido del dueño): "Condiciones de compra", un texto guardado que va
-- después de la descripción del producto y antes del pie. Solo agrega (compatible con la versión anterior). Idempotente.
BEGIN;

ALTER TABLE ml_desc_plantillas DROP CONSTRAINT IF EXISTS ml_desc_plantillas_tipo_check;
ALTER TABLE ml_desc_plantillas ADD CONSTRAINT ml_desc_plantillas_tipo_check CHECK (tipo IN ('encabezado', 'condiciones', 'pie'));

ALTER TABLE ml_item_descripcion ADD COLUMN IF NOT EXISTS condiciones_id BIGINT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ml_item_descripcion_condiciones_fk') THEN
    ALTER TABLE ml_item_descripcion ADD CONSTRAINT ml_item_descripcion_condiciones_fk
      FOREIGN KEY (empresa_id, condiciones_id) REFERENCES ml_desc_plantillas (empresa_id, id) ON DELETE SET NULL (condiciones_id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_ml_item_descripcion_cond ON ml_item_descripcion (empresa_id, condiciones_id) WHERE condiciones_id IS NOT NULL;

COMMIT;
