-- 171 · Publicaciones que responde solo el equipo (12-11-2026, el dueño). En «Datos para la IA» de cada publicación, una
-- casilla: «Esta publicación solo la responde mi equipo». La IA automática no responde sola ahí (en Modo Seguro ni en
-- Modo Total): la pregunta queda en Sin responder, sin gastar IA (lib/iaAutomatica.ts).
-- Tabla por empresa (RLS). Solo agrega: compatible con la versión anterior. Idempotente.
BEGIN;

CREATE TABLE IF NOT EXISTS ml_item_solo_equipo (
  empresa_id  INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::int REFERENCES empresas(id),
  item_id     TEXT    NOT NULL,
  creado_por  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  creado_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (empresa_id, item_id)
);

ALTER TABLE ml_item_solo_equipo ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_item_solo_equipo FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid WHERE c.relname = 'ml_item_solo_equipo' AND p.polname = 'empresa_aislada') THEN
    CREATE POLICY empresa_aislada ON ml_item_solo_equipo
      USING      (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int)
      WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int);
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON ml_item_solo_equipo TO inventory_app;

COMMIT;
