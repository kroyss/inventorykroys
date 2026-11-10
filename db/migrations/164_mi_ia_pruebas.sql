-- 164 · Historial de pruebas de Mi IA (10-11-2026, el dueño): cada «Probar» (10 preguntas o mensajes reales) queda guardado
-- con sus casos y lo que el usuario marcó (Bien/Mal, qué estuvo mal y la corrección). Las correcciones se aprenden:
-- dato fijo → Datos del producto (ml_item_notas), regla → Mi IA «Correcciones de mi equipo» (lib/miIAPruebas.ts).
-- Tabla por empresa (RLS). Solo agrega: compatible con la versión anterior. Idempotente.
BEGIN;

CREATE TABLE IF NOT EXISTS mi_ia_pruebas (
  id          BIGSERIAL,
  empresa_id  INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::int REFERENCES empresas(id),
  tipo        TEXT    NOT NULL CHECK (tipo IN ('preguntas', 'mensajes')),
  casos       JSONB   NOT NULL DEFAULT '[]',   -- [{ id, texto, titulo, itemId, tuya, ia, decision, motivos, ... }]
  marcas      JSONB   NOT NULL DEFAULT '{}',   -- { casoId: { marca, error, correccion, aprendido: { donde, texto } } }
  creado_por  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  creado_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (empresa_id, id)
);
CREATE INDEX IF NOT EXISTS idx_mi_ia_pruebas_fecha ON mi_ia_pruebas (empresa_id, tipo, creado_at DESC);

ALTER TABLE mi_ia_pruebas ENABLE ROW LEVEL SECURITY;
ALTER TABLE mi_ia_pruebas FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid WHERE c.relname = 'mi_ia_pruebas' AND p.polname = 'empresa_aislada') THEN
    CREATE POLICY empresa_aislada ON mi_ia_pruebas
      USING      (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int)
      WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int);
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON mi_ia_pruebas TO inventory_app;
GRANT USAGE, SELECT ON SEQUENCE mi_ia_pruebas_id_seq TO inventory_app;

COMMIT;
