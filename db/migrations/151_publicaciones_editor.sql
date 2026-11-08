-- 151 · Editor de publicaciones de MercadoLibre (Fase 6 de las ideas de Mercasist, 2026-11-07).
-- Editar publicaciones EXISTENTES desde el sistema, con una pantalla como la de ML: título (solo sin ventas),
-- precio, stock, descripción, características principales y secundarias, fotos y variantes.
-- Cada cambio que se manda a ML queda anotado (qué había antes, qué se mandó, quién y el resultado) para
-- poder revisar y volver atrás a mano. Módulo `publicaciones`: solo SolucionesMC (empresa 1) por ahora.
-- Módulo `atencion_ml` (Reportes → Atención ML): solo SolucionesMC por ahora.
-- Tabla por empresa (RLS). Solo agrega: compatible con la versión anterior. Idempotente.
BEGIN;

CREATE TABLE IF NOT EXISTS ml_publicacion_cambios (
  id           BIGSERIAL,
  empresa_id   INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::int REFERENCES empresas(id),
  conexion_id  INTEGER NOT NULL,
  item_id      TEXT    NOT NULL,
  user_id      INTEGER REFERENCES users(id),
  partes       TEXT[]  NOT NULL DEFAULT '{}',   -- titulo, precio, stock, descripcion, caracteristicas, fotos, variantes
  antes        JSONB   NOT NULL DEFAULT '{}',
  enviado      JSONB   NOT NULL DEFAULT '{}',
  ok           BOOLEAN NOT NULL,
  error        TEXT,
  creado_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (empresa_id, id),
  FOREIGN KEY (empresa_id, conexion_id) REFERENCES ml_conexiones (empresa_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ml_publicacion_cambios_item ON ml_publicacion_cambios (empresa_id, item_id, creado_at DESC);

ALTER TABLE ml_publicacion_cambios ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_publicacion_cambios FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
                 WHERE c.relname = 'ml_publicacion_cambios' AND p.polname = 'empresa_aislada') THEN
    CREATE POLICY empresa_aislada ON ml_publicacion_cambios
      USING      (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int)
      WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int);
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON ml_publicacion_cambios TO inventory_app;
GRANT USAGE, SELECT ON SEQUENCE ml_publicacion_cambios_id_seq TO inventory_app;

UPDATE empresas SET modulos = array_append(modulos, 'publicaciones') WHERE id = 1 AND NOT ('publicaciones' = ANY (modulos));
-- Reportes → Atención ML + «Tu semana» los lunes en el resumen de Telegram (08-11): también solo SolucionesMC (VE y CO).
UPDATE empresas SET modulos = array_append(modulos, 'atencion_ml') WHERE id IN (1, 2) AND NOT ('atencion_ml' = ANY (modulos));

COMMIT;
