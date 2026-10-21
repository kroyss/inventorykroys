-- 111: Cambiar stock y reactivar publicaciones desde el sistema (2026-10-21). lib/stockML.ts · /api/stock-ml
--
--   ml_stock_cambios: registro de cada cambio hecho desde el sistema (quién, qué publicación/variante, antes →
--     después, si se reactivó y con qué estado quedó en ML), "por si algo no cuadra".
--   ml_stock_alertas.sub_status: el motivo de pausa que da ML (sub_status), para la pestaña Pausadas de Stock.
-- Compatible con la versión anterior (solo agrega). Idempotente.
BEGIN;

CREATE TABLE IF NOT EXISTS ml_stock_cambios (
  empresa_id     INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::int REFERENCES empresas(id),
  id             BIGSERIAL,
  conexion_id    INTEGER NOT NULL,
  item_id        TEXT NOT NULL,
  variante_id    BIGINT NOT NULL DEFAULT 0,
  antes          INTEGER,
  despues        INTEGER,
  estado_antes   TEXT,
  estado_despues TEXT,
  reactivada     BOOLEAN NOT NULL DEFAULT FALSE,
  origen         TEXT,                     -- preguntas / mensajes / ficha / stock / pausadas
  error          TEXT,                     -- lo que respondió ML si no se pudo
  usuario_id     INTEGER REFERENCES users(id),
  creado_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (empresa_id, id)
);
CREATE INDEX IF NOT EXISTS ml_stock_cambios_item ON ml_stock_cambios (empresa_id, item_id, creado_at DESC);

ALTER TABLE ml_stock_cambios ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_stock_cambios FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
                 WHERE c.relname = 'ml_stock_cambios' AND p.polname = 'empresa_aislada') THEN
    CREATE POLICY empresa_aislada ON ml_stock_cambios
      USING      (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int)
      WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int);
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON ml_stock_cambios TO inventory_app;
GRANT USAGE, SELECT ON SEQUENCE ml_stock_cambios_id_seq TO inventory_app;

ALTER TABLE ml_stock_alertas ADD COLUMN IF NOT EXISTS sub_status TEXT;

COMMIT;
