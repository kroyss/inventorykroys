-- 165 · Enlazar una venta de MercadoLibre con la venta LOCAL que se registró a mano (11-11-2026, el dueño): ventas de cobro
-- destino que el equipo cargó como LOCAL-… quedaban "concretadas sin venta registrada" en Por confirmar y como no concretadas
-- en Calificaciones. Con el enlace cuentan como registradas. Solo agrega columnas (compatible con la versión anterior).
BEGIN;

ALTER TABLE ml_ordenes ADD COLUMN IF NOT EXISTS venta_local_id  INTEGER;
ALTER TABLE ml_ordenes ADD COLUMN IF NOT EXISTS venta_local_por INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE ml_ordenes ADD COLUMN IF NOT EXISTS venta_local_at  TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ml_ordenes_venta_local_fkey') THEN
    -- Compuesta (no apunta a ventas de otra empresa); al borrar la venta solo se vacía el enlace (PG 15+).
    ALTER TABLE ml_ordenes ADD CONSTRAINT ml_ordenes_venta_local_fkey
      FOREIGN KEY (empresa_id, venta_local_id) REFERENCES sales(empresa_id, id) ON DELETE SET NULL (venta_local_id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_ml_ordenes_venta_local ON ml_ordenes (empresa_id, venta_local_id) WHERE venta_local_id IS NOT NULL;

COMMIT;
