-- ════════════════════════════════════════════════════════════════════════════
-- Multiempresa · 02 · Importar Colombia como empresa 2
--
-- Lee la base inventory_co (mismo servidor Postgres) con postgres_fdw y copia cada
-- tabla a la base compartida:
--   - ids de CO + 1.000.000 (VE conserva los suyos): no chocan, y cualquier fila de CO
--     se reconoce por el rango. Las FK entre tablas de negocio se desplazan igual.
--   - usuarios: se unen por username (kroys de VE y kroys de CO = un solo usuario con
--     acceso a las dos empresas); los que solo existen en CO se crean.
--   - columnas que guardan ids SIN FK (finance_movements.ref_id,
--     despacho_etiquetas.reporte_tomado_por) y las referencias de texto de los
--     movimientos ("Venta #123") también se desplazan.
--
-- Se corre como postgres, DESPUÉS de 01_esquema.sql, y todo en una transacción.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on
BEGIN;

CREATE EXTENSION IF NOT EXISTS postgres_fdw;
CREATE SERVER co_src FOREIGN DATA WRAPPER postgres_fdw OPTIONS (dbname 'inventory_co');
CREATE USER MAPPING FOR CURRENT_USER SERVER co_src OPTIONS (user 'postgres');
CREATE SCHEMA co_src;
IMPORT FOREIGN SCHEMA public FROM SERVER co_src INTO co_src;

-- Sin FK ni triggers mientras se copia (el orden de las tablas deja de importar);
-- 03_verificar.sql comprueba después que no quedó ninguna referencia rota.
SET LOCAL session_replication_role = replica;
SET LOCAL app.empresa_id = '2';

-- ── Usuarios ──────────────────────────────────────────────────────────────
CREATE TEMP TABLE user_map (old_id INTEGER PRIMARY KEY, new_id INTEGER NOT NULL) ON COMMIT DROP;

INSERT INTO users (username, password_hash, full_name, role, country_access, is_active, created_at, last_login, session_version)
SELECT c.username, c.password_hash, c.full_name, c.role, c.country_access, c.is_active, c.created_at, c.last_login, c.session_version
FROM co_src.users c
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.username = c.username);

INSERT INTO user_map SELECT c.id, u.id FROM co_src.users c JOIN users u ON u.username = c.username;

INSERT INTO usuario_empresas (user_id, empresa_id, role)
SELECT m.new_id, 2, CASE WHEN c.role = 'admin' THEN 'admin' ELSE 'user' END
FROM co_src.users c JOIN user_map m ON m.old_id = c.id;

-- ── Tablas de negocio ─────────────────────────────────────────────────────
DO $$
DECLARE
  OFFSET_CO CONSTANT INTEGER := 1000000;
  tbl  TEXT;
  cols TEXT;
  sel  TEXT;
  n    BIGINT;
BEGIN
  FOR tbl IN
    SELECT c.relname FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
      AND EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polname = 'empresa_aislada')
      AND EXISTS (SELECT 1 FROM information_schema.tables f WHERE f.table_schema = 'co_src' AND f.table_name = c.relname)
    ORDER BY 1
  LOOP
    -- Columnas presentes en las dos bases (menos empresa_id, que va fijo en 2).
    SELECT string_agg(quote_ident(a.column_name), ', ' ORDER BY a.ordinal_position),
           string_agg(
             CASE
               -- id propio y FK a otra tabla de negocio: desplazados
               WHEN a.column_name = 'id' AND a.data_type = 'integer' THEN format('s.%I + %s', a.column_name, OFFSET_CO)
               WHEN fk.padre IN ('users') THEN format('(SELECT new_id FROM user_map WHERE old_id = s.%I)', a.column_name)
               WHEN fk.padre IS NOT NULL THEN format('s.%I + %s', a.column_name, OFFSET_CO)
               -- ids sin FK
               WHEN (tbl, a.column_name) IN (('finance_movements', 'ref_id'), ('despacho_etiquetas', 'reporte_tomado_por'))
                 THEN format('s.%I + %s', a.column_name, OFFSET_CO)
               -- "Venta #123" → "Venta #1000123" (etiqueta de texto del movimiento)
               WHEN tbl = 'inventory_movements' AND a.column_name = 'reference' THEN
                 format($r$regexp_replace(s.reference, '^(Venta #|Venta ML #|Venta LOCAL #|Venta reabierta #|Importación #|Compra #|Reapertura orden #)(\d+)$', '\1') || COALESCE((substring(s.reference from '^(?:Venta #|Venta ML #|Venta LOCAL #|Venta reabierta #|Importación #|Compra #|Reapertura orden #)(\d+)$')::int + %s)::text, '')$r$, OFFSET_CO)
               ELSE format('s.%I', a.column_name)
             END, ', ' ORDER BY a.ordinal_position)
    INTO cols, sel
    FROM information_schema.columns a
    JOIN information_schema.columns b ON b.table_schema = 'co_src' AND b.table_name = tbl AND b.column_name = a.column_name
    LEFT JOIN LATERAL (
      SELECT con.confrelid::regclass::text AS padre
      FROM pg_constraint con
      JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
      WHERE con.contype = 'f' AND con.conrelid = format('public.%I', tbl)::regclass
        AND array_length(con.conkey, 1) = 1 AND att.attname = a.column_name
        AND con.confrelid::regclass::text <> 'empresas'
      LIMIT 1
    ) fk ON TRUE
    WHERE a.table_schema = 'public' AND a.table_name = tbl AND a.column_name <> 'empresa_id';

    EXECUTE format('INSERT INTO public.%I (%s, empresa_id) SELECT %s, 2 FROM co_src.%I s', tbl, cols, sel, tbl);
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'CO → %: % filas', tbl, n;
  END LOOP;
END $$;

-- ── Tasas de Colombia (global) ────────────────────────────────────────────
INSERT INTO colombia_exchange_rates (id, rate_date, trm_rate, source, created_by, created_at)
SELECT s.id, s.rate_date, s.trm_rate, s.source, (SELECT new_id FROM user_map WHERE old_id = s.created_by), s.created_at
FROM co_src.colombia_exchange_rates s;

-- Los backfills de CO que VE no tenía (son marcas de "ya se corrió", por nombre).
INSERT INTO _backfills (name, done_at)
SELECT s.name, s.done_at FROM co_src._backfills s ON CONFLICT (name) DO NOTHING;

-- ── Secuencias al máximo real ─────────────────────────────────────────────
-- Las secuencias de estas bases NO están asociadas a su columna (se crearon sin OWNED BY),
-- así que se ubican por el DEFAULT nextval('...') de cada columna.
DO $$
DECLARE r RECORD; m BIGINT;
BEGIN
  FOR r IN
    SELECT c.table_name AS tabla, c.column_name AS col,
           substring(c.column_default from $re$nextval\('([^']+)'$re$) AS seq
    FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.column_default LIKE 'nextval(%'
  LOOP
    EXECUTE format('SELECT max(%I) FROM %I', r.col, r.tabla) INTO m;
    IF m IS NOT NULL THEN PERFORM setval(r.seq::regclass, m); END IF;
  END LOOP;
END $$;

-- Fuera la conexión a CO: la base compartida no depende de la vieja.
DROP SCHEMA co_src CASCADE;
DROP USER MAPPING FOR CURRENT_USER SERVER co_src;
DROP SERVER co_src;

COMMIT;
