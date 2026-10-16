-- 097 · Promociones Fase 2 y 3 (2026-10-16, decidido con el dueño).
--   ml_promociones_acciones  registro de cada cambio hecho desde el sistema en ML (quién, cuándo, qué
--                            publicación, qué campaña, a qué precio y cómo terminó). Además sirve para
--                            mostrar lo agregado a campañas que todavía no empiezan (ML no las lista).
--   ml_campanas_vistas       campañas de ML que el sistema ya conoce, por cuenta: la primera vez que
--                            aparece una se avisa por Telegram (solo empresas con Inventario + Promociones).
-- Compatible con la versión anterior (solo agrega). Idempotente. Primero staging, después producción.
BEGIN;

CREATE TABLE IF NOT EXISTS ml_promociones_acciones (
  id            BIGSERIAL PRIMARY KEY,
  empresa_id    INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::int
                  REFERENCES empresas(id),
  conexion_id   INTEGER NOT NULL,
  accion        TEXT NOT NULL CHECK (accion IN ('crear_campana', 'borrar_campana', 'agregar', 'quitar')),
  campana_id    TEXT,
  campana_tipo  TEXT,
  campana_nombre TEXT,
  item_id       TEXT,
  precio        NUMERIC(14,2),
  precio_antes  NUMERIC(14,2),
  resultado     TEXT NOT NULL CHECK (resultado IN ('ok', 'error')),
  detalle       TEXT,
  usuario_id    INTEGER REFERENCES users(id),
  creado_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ml_promo_acciones ON ml_promociones_acciones (empresa_id, creado_at DESC);

CREATE TABLE IF NOT EXISTS ml_campanas_vistas (
  empresa_id    INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::int
                  REFERENCES empresas(id),
  conexion_id   INTEGER NOT NULL,
  campana_id    TEXT NOT NULL,
  tipo          TEXT,
  nombre        TEXT,
  inicio        TIMESTAMPTZ,
  fin           TIMESTAMPTZ,
  limite        TIMESTAMPTZ,
  candidatas    INTEGER,
  primera_vez_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  visto_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (empresa_id, conexion_id, campana_id)
);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['ml_promociones_acciones', 'ml_campanas_vistas'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
                   WHERE c.relname = t AND p.polname = 'empresa_aislada') THEN
      EXECUTE format($p$CREATE POLICY empresa_aislada ON %I
        USING      (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int)
        WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int)$p$, t);
    END IF;
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO inventory_app', t);
  END LOOP;
END $$;
GRANT USAGE, SELECT ON SEQUENCE ml_promociones_acciones_id_seq TO inventory_app;

COMMIT;
