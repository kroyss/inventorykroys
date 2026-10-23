-- 118 · Mensaje al comprar (23-10, pedido de un Fundador): a cada venta NUEVA le llega un mensaje propio por ML, unos
-- minutos después de los dos automáticos de MercadoLibre. UNA sola vez por venta (pack): esta tabla es la garantía (se
-- anota ANTES de mandar). La configuración va en app_settings ('mensaje_al_comprar'). Solo agrega: compatible.
BEGIN;
CREATE TABLE IF NOT EXISTS ml_bienvenidas (
  id          SERIAL PRIMARY KEY,
  empresa_id  INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::int REFERENCES empresas(id),
  pack_id     BIGINT NOT NULL,
  orden_id    BIGINT,
  estado      TEXT NOT NULL DEFAULT 'enviando',   -- enviando · enviado · saltado · error
  motivo      TEXT,
  texto       TEXT,
  creado_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  enviado_at  TIMESTAMPTZ,
  CONSTRAINT ml_bienvenidas_unica UNIQUE (empresa_id, pack_id)
);
CREATE INDEX IF NOT EXISTS idx_ml_bienvenidas_fecha ON ml_bienvenidas (empresa_id, creado_at DESC);
ALTER TABLE ml_bienvenidas ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_bienvenidas FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
                 WHERE c.relname = 'ml_bienvenidas' AND p.polname = 'empresa_aislada') THEN
    CREATE POLICY empresa_aislada ON ml_bienvenidas
      USING      (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int)
      WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int);
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON ml_bienvenidas TO inventory_app;
GRANT USAGE, SELECT ON SEQUENCE ml_bienvenidas_id_seq TO inventory_app;
COMMIT;
