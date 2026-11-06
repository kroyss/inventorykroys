-- 145 · Mensajes con IA en modo prueba (06-11-2026, pedido del dueño): cuando llega un mensaje nuevo de un comprador,
-- la IA escribe la respuesta y la deja como BORRADOR (no manda nada) y anota si habría salido sola o a revisión.
-- El equipo responde como siempre y marca cada caso Bien / Mal (Mensajes → IA en prueba). Para medir antes de
-- pensar en el envío automático (Fase 2). Módulo `mensajes_ia`: solo SolucionesMC (empresa 1) por ahora.
-- Tabla por empresa (RLS). Solo agrega: compatible con la versión anterior. Idempotente.
BEGIN;

CREATE TABLE IF NOT EXISTS ml_mensajes_ia (
  id             SERIAL PRIMARY KEY,
  empresa_id     INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::int REFERENCES empresas(id),
  pack_id        BIGINT NOT NULL,
  conexion_id    INTEGER NOT NULL,
  mensaje_at     TIMESTAMPTZ NOT NULL,        -- el último mensaje del comprador que contesta
  comprador      TEXT,                        -- lo que escribió (los mensajes seguidos, juntos)
  estado         TEXT NOT NULL DEFAULT 'procesando' CHECK (estado IN ('procesando', 'listo', 'error')),
  respuesta      TEXT,
  confianza      TEXT,
  falta_dato     TEXT,
  decision       TEXT CHECK (decision IN ('sola', 'revisar', 'nada')),
  motivos        TEXT[],
  modelo         TEXT,
  costo          NUMERIC(10, 5),
  error          TEXT,
  marca          TEXT CHECK (marca IN ('bien', 'mal')),
  marcada_por    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  marcada_at     TIMESTAMPTZ,
  creado_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (empresa_id, conexion_id) REFERENCES ml_conexiones(empresa_id, id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ml_mensajes_ia ON ml_mensajes_ia (empresa_id, pack_id, mensaje_at);
CREATE INDEX IF NOT EXISTS idx_ml_mensajes_ia_fecha ON ml_mensajes_ia (empresa_id, creado_at DESC);

ALTER TABLE ml_mensajes_ia ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_mensajes_ia FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
                 WHERE c.relname = 'ml_mensajes_ia' AND p.polname = 'empresa_aislada') THEN
    CREATE POLICY empresa_aislada ON ml_mensajes_ia
      USING      (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int)
      WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int);
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON ml_mensajes_ia TO inventory_app;
GRANT USAGE, SELECT ON SEQUENCE ml_mensajes_ia_id_seq TO inventory_app;

-- Desde cuándo mide (solo los mensajes que llegan de aquí en adelante).
INSERT INTO app_settings (empresa_id, key, value) VALUES (1, 'mensajes_ia_desde', to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
  ON CONFLICT (empresa_id, key) DO NOTHING;
UPDATE empresas SET modulos = array_append(modulos, 'mensajes_ia') WHERE id = 1 AND NOT ('mensajes_ia' = ANY (modulos));

COMMIT;
