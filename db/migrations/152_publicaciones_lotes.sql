-- 152 · Publicaciones: descripción en 3 partes, textos guardados, cambios en lote y catálogo PDF (08-11-2026, pedido del dueño).
--   - ml_desc_plantillas: encabezados y pies con nombre (para todas las cuentas o para una), que se ponen en muchas
--     publicaciones y se cambian en todas de una vez.
--   - ml_item_descripcion: cómo está separada la descripción de cada publicación (encabezado + cuerpo + pie) y el
--     último texto leído de ML (para detectar textos repetidos).
--   - ml_pub_lotes / ml_pub_lote_items: cambios en lote (poner encabezado/pie, precios) y lecturas de descripciones.
--     Los procesa el cron de a pocas por minuto (lib/lotesPublicaciones.ts). Cada cambio queda además en
--     ml_publicacion_cambios (mig 151) con lo que había antes.
-- Módulo `catalogo_pdf` (Productos → Catálogo PDF): solo SolucionesMC por ahora.
-- Tablas por empresa (RLS). Solo agrega: compatible con la versión anterior. Idempotente.
BEGIN;

CREATE TABLE IF NOT EXISTS ml_desc_plantillas (
  id            BIGSERIAL,
  empresa_id    INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::int REFERENCES empresas(id),
  tipo          TEXT    NOT NULL CHECK (tipo IN ('encabezado', 'pie')),
  nombre        TEXT    NOT NULL,
  texto         TEXT    NOT NULL,
  conexion_id   INTEGER,                      -- NULL = para todas las cuentas
  creado_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (empresa_id, id),
  FOREIGN KEY (empresa_id, conexion_id) REFERENCES ml_conexiones (empresa_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ml_item_descripcion (
  empresa_id    INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::int REFERENCES empresas(id),
  item_id       TEXT    NOT NULL,
  conexion_id   INTEGER NOT NULL,
  encabezado_id BIGINT,
  pie_id        BIGINT,
  cuerpo        TEXT,                         -- NULL = todavía no separada
  texto_ml      TEXT,                         -- último texto completo leído de ML
  leido_at      TIMESTAMPTZ,
  actualizado_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (empresa_id, item_id),
  FOREIGN KEY (empresa_id, conexion_id) REFERENCES ml_conexiones (empresa_id, id) ON DELETE CASCADE,
  FOREIGN KEY (empresa_id, encabezado_id) REFERENCES ml_desc_plantillas (empresa_id, id) ON DELETE SET NULL (encabezado_id),
  FOREIGN KEY (empresa_id, pie_id) REFERENCES ml_desc_plantillas (empresa_id, id) ON DELETE SET NULL (pie_id)
);
CREATE INDEX IF NOT EXISTS idx_ml_item_descripcion_enc ON ml_item_descripcion (empresa_id, encabezado_id) WHERE encabezado_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ml_item_descripcion_pie ON ml_item_descripcion (empresa_id, pie_id) WHERE pie_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS ml_pub_lotes (
  id            BIGSERIAL,
  empresa_id    INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::int REFERENCES empresas(id),
  tipo          TEXT    NOT NULL CHECK (tipo IN ('descripcion', 'precio', 'leer')),
  titulo        TEXT    NOT NULL,             -- "Pie «General» en 340 publicaciones"
  parametros    JSONB   NOT NULL DEFAULT '{}',
  user_id       INTEGER REFERENCES users(id),
  total         INTEGER NOT NULL DEFAULT 0,
  estado        TEXT    NOT NULL DEFAULT 'en_curso' CHECK (estado IN ('en_curso', 'terminado', 'cancelado')),
  creado_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  terminado_at  TIMESTAMPTZ,
  PRIMARY KEY (empresa_id, id)
);

CREATE TABLE IF NOT EXISTS ml_pub_lote_items (
  empresa_id    INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::int REFERENCES empresas(id),
  lote_id       BIGINT  NOT NULL,
  item_id       TEXT    NOT NULL,
  datos         JSONB   NOT NULL DEFAULT '{}', -- p. ej. { precio_nuevo, precio_antes }
  estado        TEXT    NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'procesando', 'ok', 'sin_cambio', 'saltada', 'error')),
  mensaje       TEXT,
  tomado_at     TIMESTAMPTZ,
  hecho_at      TIMESTAMPTZ,
  PRIMARY KEY (empresa_id, lote_id, item_id),
  FOREIGN KEY (empresa_id, lote_id) REFERENCES ml_pub_lotes (empresa_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ml_pub_lote_items_pend ON ml_pub_lote_items (empresa_id, lote_id) WHERE estado IN ('pendiente', 'procesando');

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['ml_desc_plantillas', 'ml_item_descripcion', 'ml_pub_lotes', 'ml_pub_lote_items'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid WHERE c.relname = t AND p.polname = 'empresa_aislada') THEN
      EXECUTE format($p$CREATE POLICY empresa_aislada ON %I
        USING      (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int)
        WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int)$p$, t);
    END IF;
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO inventory_app', t);
  END LOOP;
END $$;
GRANT USAGE, SELECT ON SEQUENCE ml_desc_plantillas_id_seq TO inventory_app;
GRANT USAGE, SELECT ON SEQUENCE ml_pub_lotes_id_seq TO inventory_app;

UPDATE empresas SET modulos = array_append(modulos, 'catalogo_pdf') WHERE id IN (1, 2) AND NOT ('catalogo_pdf' = ANY (modulos));

COMMIT;
