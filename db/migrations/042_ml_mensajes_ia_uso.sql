-- 042 · Sugerencias de respuesta y costo de la IA.
--
-- ml_mensajes: copia de los mensajes de cada conversación post-venta (se guardan al leerla:
--   sincronización y al abrirla). Sirve para sugerir GRATIS lo que el vendedor ya respondió a
--   mensajes parecidos (pg_trgm) y como ejemplos para la IA. Lo de ML sigue siendo la verdad.
-- ia_uso: cada borrador de la IA (Preguntas / Mensajes) con sus tokens y su costo, para ver
--   cuánto se gasta por mes.
--
-- POR EMPRESA (empresa_id + RLS empresa_aislada + FK compuesta). Idempotente.
BEGIN;

CREATE TABLE IF NOT EXISTS ml_mensajes (
  msg_id      TEXT    NOT NULL,                 -- id del mensaje en ML
  empresa_id  INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::int
                REFERENCES empresas(id),
  pack_id     BIGINT  NOT NULL,
  conexion_id INTEGER NOT NULL,
  propio      BOOLEAN NOT NULL,                 -- TRUE = lo escribió el vendedor
  texto       TEXT    NOT NULL,
  fecha       TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (empresa_id, msg_id),
  FOREIGN KEY (empresa_id, conexion_id) REFERENCES ml_conexiones (empresa_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ml_mensajes_pack ON ml_mensajes (empresa_id, pack_id, fecha);
CREATE INDEX IF NOT EXISTS idx_ml_mensajes_trgm ON ml_mensajes USING gin (texto gin_trgm_ops) WHERE NOT propio;

ALTER TABLE ml_mensajes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_mensajes FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
                 WHERE c.relname = 'ml_mensajes' AND p.polname = 'empresa_aislada') THEN
    CREATE POLICY empresa_aislada ON ml_mensajes
      USING      (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int)
      WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int);
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON ml_mensajes TO inventory_app;

-- Ventas cuyas conversaciones ya se copiaron (el cron las recorre de a poco, de la más nueva).
ALTER TABLE ml_ordenes ADD COLUMN IF NOT EXISTS mensajes_at TIMESTAMP;

CREATE TABLE IF NOT EXISTS ia_uso (
  id          SERIAL  PRIMARY KEY,
  empresa_id  INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::int
                REFERENCES empresas(id),
  fecha       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  modulo      TEXT    NOT NULL,                 -- 'preguntas' | 'mensajes'
  modelo      TEXT    NOT NULL,
  entrada     INTEGER NOT NULL DEFAULT 0,       -- tokens de entrada (incluye caché)
  salida      INTEGER NOT NULL DEFAULT 0,
  busquedas   INTEGER NOT NULL DEFAULT 0,       -- búsquedas web
  costo       NUMERIC(10,5) NOT NULL DEFAULT 0, -- USD
  usuario_id  INTEGER REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_ia_uso_fecha ON ia_uso (empresa_id, fecha);

ALTER TABLE ia_uso ENABLE ROW LEVEL SECURITY;
ALTER TABLE ia_uso FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
                 WHERE c.relname = 'ia_uso' AND p.polname = 'empresa_aislada') THEN
    CREATE POLICY empresa_aislada ON ia_uso
      USING      (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int)
      WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int);
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON ia_uso TO inventory_app;
GRANT USAGE, SELECT ON SEQUENCE ia_uso_id_seq TO inventory_app;

COMMIT;
