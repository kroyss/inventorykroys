-- 119 · Registro de las notificaciones de MercadoLibre (23-10). ML ya las manda (~3.000 por día) y se ignoraban. Paso 1:
-- guardarlas tal como llegan para compararlas con lo que encuentra la consulta de cada minuto (cobertura y demora por
-- tema) y decidir si se puede consultar menos. GLOBAL (de la plataforma, como users): la empresa sale de user_id →
-- ml_conexiones. No cambia nada visible. Solo agrega: compatible.
BEGIN;
CREATE TABLE IF NOT EXISTS ml_notificaciones (
  id              BIGSERIAL PRIMARY KEY,
  topic           TEXT,
  resource        TEXT,
  user_id         BIGINT,
  application_id  BIGINT,
  attempts        INTEGER,
  sent            TIMESTAMPTZ,              -- cuándo la mandó ML
  received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  nuestra         BOOLEAN NOT NULL DEFAULT TRUE   -- application_id = el de nuestra app de ML
);
CREATE INDEX IF NOT EXISTS idx_ml_notif_topic ON ml_notificaciones (topic, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_ml_notif_resource ON ml_notificaciones (resource);
GRANT SELECT, INSERT, DELETE ON ml_notificaciones TO inventory_app;
GRANT USAGE, SELECT ON SEQUENCE ml_notificaciones_id_seq TO inventory_app;
COMMIT;
