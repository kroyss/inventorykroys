-- ════════════════════════════════════════════════════════════════════════════
-- Multiempresa · 01 · Esquema
--
-- Se corre sobre una base que es una COPIA de inventory_ve (VE queda como empresa 1).
-- Convierte el esquema de una sola empresa en uno compartido:
--
--   organizaciones → empresas → (todas las tablas de negocio con empresa_id)
--   users (global) ↔ usuario_empresas (a qué empresas entra cada usuario y con qué rol)
--
-- Aislamiento: Row Level Security. Cada tabla de negocio solo muestra y acepta filas de
-- la empresa fijada en la conexión (`SET app.empresa_id = N`). Sin empresa fijada no se
-- ve nada y no se puede insertar. La app se conecta con el rol `inventory_app`, que no
-- puede saltarse RLS. `postgres` (superusuario) sí la salta: solo lo usan los scripts.
--
-- Diseño de columnas:
--   empresa_id DEFAULT app.empresa_id → los INSERT de la app no cambian.
--   UNIQUE (empresa_id, id) + FK compuestas → una fila hija nunca puede apuntar a un
--   padre de otra empresa (además de las FK originales, que se conservan).
--   Únicos de negocio por empresa: código de producto, número de orden, etc.
--
-- Todo en una transacción: o queda completo o no queda nada.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on
BEGIN;

-- ── 1. Organizaciones, empresas y acceso de usuarios ──────────────────────
CREATE TABLE organizaciones (
  id          SERIAL PRIMARY KEY,
  nombre      TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE empresas (
  id               SERIAL PRIMARY KEY,
  organizacion_id  INTEGER NOT NULL REFERENCES organizaciones(id),
  nombre           TEXT NOT NULL UNIQUE,
  country          VARCHAR(2) NOT NULL CHECK (country IN ('VE', 'CO')),
  -- Módulos prendidos (ver lib/modulos.ts en la etapa 3). Vacío = solo el núcleo.
  modulos          TEXT[] NOT NULL DEFAULT '{}',
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE usuario_empresas (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  empresa_id  INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  role        VARCHAR(10) NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, empresa_id)
);
CREATE INDEX idx_usuario_empresas_empresa ON usuario_empresas(empresa_id);

INSERT INTO organizaciones (id, nombre) VALUES (1, 'SolucionesMC');
INSERT INTO empresas (id, organizacion_id, nombre, country, modulos) VALUES
  (1, 1, 'SolucionesMC VE', 'VE', ARRAY['despachos','reportador','facturas','finanzas','bonos']),
  (2, 1, 'SolucionesMC CO', 'CO', ARRAY['facturas','finanzas']);
SELECT setval('organizaciones_id_seq', 1), setval('empresas_id_seq', 2);

-- Usuarios de VE → empresa 1 con su rol actual (los de CO se agregan al importar).
INSERT INTO usuario_empresas (user_id, empresa_id, role)
SELECT id, 1, CASE WHEN role = 'admin' THEN 'admin' ELSE 'user' END FROM users;

-- Tasas de Colombia: tabla GLOBAL (la TRM del día es la misma para todas las empresas CO).
-- Solo existe en la base CO; aquí se crea vacía y se llena al importar.
CREATE TABLE colombia_exchange_rates (
  id          SERIAL PRIMARY KEY,
  rate_date   DATE NOT NULL,
  trm_rate    NUMERIC NOT NULL,
  source      TEXT DEFAULT 'api',
  created_by  INTEGER,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. empresa_id + RLS en cada tabla de negocio ──────────────────────────
-- GLOBALES (sin empresa_id ni RLS): users, usuario_empresas, empresas, organizaciones,
-- venezuela_exchange_rates, colombia_exchange_rates, _backfills.
CREATE TEMP TABLE tablas_empresa (t TEXT PRIMARY KEY) ON COMMIT DROP;
INSERT INTO tablas_empresa VALUES
  ('app_settings'), ('despacho_etiquetas'), ('despacho_jornadas'), ('despacho_lotes'),
  ('finance_accounts'), ('finance_categories'), ('finance_movements'), ('finance_settings'),
  ('import_containers'), ('import_order_files'), ('import_order_items'), ('import_orders'),
  ('inventory'), ('inventory_movements'),
  ('invoice_customers'), ('invoice_files'), ('invoice_items'), ('invoices'),
  ('product_ml_codes'), ('product_pricing'), ('products'), ('profit_categories'),
  ('purchase_order_items'), ('purchase_orders'),
  ('reportador_equipos'), ('reportador_ordenes'),
  ('sale_items'), ('sales'), ('suppliers');

-- invoice_drafts (mig 024) nunca se aplicó en producción: si falta, se crea aquí para
-- que el esquema nuevo quede completo.
CREATE TABLE IF NOT EXISTS invoice_drafts (
  sale_id     INTEGER PRIMARY KEY REFERENCES sales(id) ON DELETE CASCADE,
  data        JSONB NOT NULL,
  updated_by  INTEGER REFERENCES users(id),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
INSERT INTO tablas_empresa VALUES ('invoice_drafts');

-- Toda tabla de negocio de la base tiene que estar clasificada: una tabla nueva que no
-- esté en la lista ni en las globales frena el script (no queda una tabla sin aislar).
DO $$
DECLARE faltan TEXT;
BEGIN
  SELECT string_agg(tablename, ', ') INTO faltan
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename NOT IN (SELECT t FROM tablas_empresa)
    AND tablename NOT IN ('users', 'usuario_empresas', 'empresas', 'organizaciones',
                          'venezuela_exchange_rates', 'colombia_exchange_rates', '_backfills');
  IF faltan IS NOT NULL THEN
    RAISE EXCEPTION 'Tablas sin clasificar (¿globales o por empresa?): %', faltan;
  END IF;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT t FROM tablas_empresa ORDER BY t LOOP
    -- Las filas existentes son de VE (empresa 1); desde aquí el valor lo pone la conexión.
    EXECUTE format('ALTER TABLE %I ADD COLUMN empresa_id INTEGER NOT NULL DEFAULT 1 REFERENCES empresas(id)', r.t);
    EXECUTE format($f$ALTER TABLE %I ALTER COLUMN empresa_id SET DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::int$f$, r.t);
    EXECUTE format('CREATE INDEX %I ON %I (empresa_id)', 'idx_' || r.t || '_empresa', r.t);

    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', r.t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', r.t);
    EXECUTE format($f$CREATE POLICY empresa_aislada ON %I
                      USING      (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int)
                      WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int)$f$, r.t);
  END LOOP;
END $$;

-- El exceso % (precio sugerido ML) pasa a ser de cada empresa: SolucionesMC VE conserva
-- el que tiene hoy la última tasa.
INSERT INTO app_settings (empresa_id, key, value)
SELECT 1, 'ml_exceso', excess_percentage::text
FROM venezuela_exchange_rates ORDER BY rate_date DESC, created_at DESC LIMIT 1;

-- ── 3. Únicos de negocio: por empresa ─────────────────────────────────────
ALTER TABLE app_settings     DROP CONSTRAINT app_settings_pkey,     ADD PRIMARY KEY (empresa_id, key);
ALTER TABLE finance_settings DROP CONSTRAINT finance_settings_pkey, ADD PRIMARY KEY (empresa_id, key);

ALTER TABLE products          DROP CONSTRAINT products_code_key,                 ADD CONSTRAINT products_code_key                 UNIQUE (empresa_id, code);
ALTER TABLE profit_categories DROP CONSTRAINT profit_categories_name_key,        ADD CONSTRAINT profit_categories_name_key        UNIQUE (empresa_id, name);
ALTER TABLE purchase_orders   DROP CONSTRAINT purchase_orders_order_number_key,  ADD CONSTRAINT purchase_orders_order_number_key  UNIQUE (empresa_id, order_number);
ALTER TABLE import_orders     DROP CONSTRAINT import_orders_order_number_key,    ADD CONSTRAINT import_orders_order_number_key    UNIQUE (empresa_id, order_number);
ALTER TABLE sales             DROP CONSTRAINT sales_ml_order_number_key,         ADD CONSTRAINT sales_ml_order_number_key         UNIQUE (empresa_id, ml_order_number);
ALTER TABLE invoices          DROP CONSTRAINT invoices_invoice_number_key,       ADD CONSTRAINT invoices_invoice_number_key       UNIQUE (empresa_id, invoice_number);
ALTER TABLE invoice_customers DROP CONSTRAINT invoice_customers_doc_id_key,      ADD CONSTRAINT invoice_customers_doc_id_key      UNIQUE (empresa_id, doc_id);

DROP INDEX uq_despacho_guia_impresa;
CREATE UNIQUE INDEX uq_despacho_guia_impresa  ON despacho_etiquetas (empresa_id, guia) WHERE impresa;
DROP INDEX uq_despacho_guia_final;
CREATE UNIQUE INDEX uq_despacho_guia_final    ON despacho_etiquetas (empresa_id, guia_final) WHERE guia_final IS NOT NULL;
DROP INDEX uq_despacho_jornada_abierta;
CREATE UNIQUE INDEX uq_despacho_jornada_abierta ON despacho_jornadas (empresa_id) WHERE status = 'ABIERTA';
-- Se quedan globales a propósito: inventory.product_id, product_pricing.product_id,
-- uq_invoices_sale_emitida (los ids son únicos en toda la base) y el token / código del
-- Reportador (el equipo se identifica por token antes de saber su empresa).

-- ── 4. FK compuestas: un hijo nunca apunta a un padre de otra empresa ─────
DO $$
DECLARE r RECORD;
BEGIN
  -- (empresa_id, id) único en cada tabla con id, para poder referenciarlo.
  FOR r IN
    SELECT t.t FROM tablas_empresa t
    JOIN information_schema.columns c ON c.table_schema = 'public' AND c.table_name = t.t AND c.column_name = 'id'
  LOOP
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I UNIQUE (empresa_id, id)', r.t, r.t || '_empresa_id_key');
  END LOOP;

  -- Por cada FK de una columna entre tablas de negocio, su gemela (empresa_id, col).
  -- La FK original se conserva (con su ON DELETE); la compuesta solo verifica la empresa.
  FOR r IN
    SELECT con.conrelid::regclass::text AS hijo, a.attname AS col, con.confrelid::regclass::text AS padre
    FROM pg_constraint con
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = con.conkey[1]
    WHERE con.contype = 'f' AND con.connamespace = 'public'::regnamespace
      AND array_length(con.conkey, 1) = 1
      AND con.conrelid::regclass::text  IN (SELECT t FROM tablas_empresa)
      AND con.confrelid::regclass::text IN (SELECT t FROM tablas_empresa)
  LOOP
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (empresa_id, %I) REFERENCES %I (empresa_id, id)',
                   r.hijo, left('fk_emp_' || r.hijo || '_' || r.col, 63), r.col, r.padre);
  END LOOP;
END $$;

-- ── 5. Rol de la app: sin superusuario, sin saltarse RLS ──────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'inventory_app') THEN
    -- La clave la fija el script que prepara la base (no vive en el repo).
    CREATE ROLE inventory_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO inventory_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO inventory_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO inventory_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO inventory_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO inventory_app;
-- organizaciones / empresas: la app las escribe solo desde Plataforma (dueño de la
-- plataforma, app/api/plataforma). Nunca se borran: se desactivan.
REVOKE DELETE ON organizaciones, empresas FROM inventory_app;

COMMIT;
