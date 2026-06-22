-- 006_import_containers.sql (idempotente) — Agrupación de importaciones por contenedor/lote.
-- Correr en AMBAS bases (VE y CO): las importaciones existen en los dos países.
-- Reusa set_updated_at() (creada en 003 y presente en CO por el clon de esquema).

CREATE TABLE IF NOT EXISTS import_containers (
  id              SERIAL PRIMARY KEY,
  code            TEXT NOT NULL,                  -- CONTENEDOR-XXXX
  name            TEXT,                           -- descripción libre
  status          TEXT NOT NULL DEFAULT 'ABIERTO',-- ABIERTO|EN_TRANSITO|RECIBIDO|CERRADO
  origin_country  TEXT,
  tracking_number TEXT,
  shipping_cost   NUMERIC(14,2),
  eta             DATE,                           -- fecha estimada/llegada
  notes           TEXT,
  created_by      INT,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE import_orders
  ADD COLUMN IF NOT EXISTS container_id INT REFERENCES import_containers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_io_container ON import_orders(container_id);

DROP TRIGGER IF EXISTS trg_cont_updated_at ON import_containers;
CREATE TRIGGER trg_cont_updated_at BEFORE UPDATE ON import_containers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
