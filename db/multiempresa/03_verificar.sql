-- ════════════════════════════════════════════════════════════════════════════
-- Multiempresa · 03 · Verificación (no cambia nada: todo termina en ROLLBACK)
--
--   A. Filas por tabla: empresa 1 = inventory_ve, empresa 2 = inventory_co.
--   B. Números del negocio: stock, ventas, costos, compras (por empresa vs origen).
--   C. Contenido: productos, ventas y stock comparados fila por fila (por código / orden).
--   D. Referencias rotas: ninguna FK (simple o compuesta) apunta a una fila inexistente.
--   E. Aislamiento con el rol de la app (inventory_app): cada empresa ve solo lo suyo,
--      sin empresa no ve nada, y no puede escribir ni apuntar a filas de otra empresa.
--
-- Salida: una línea por control, OK o FALLA, y un total al final.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE resultado (orden SERIAL, control TEXT, ok BOOLEAN, detalle TEXT);

CREATE EXTENSION IF NOT EXISTS postgres_fdw;
CREATE SERVER ve_src FOREIGN DATA WRAPPER postgres_fdw OPTIONS (dbname 'inventory_ve');
CREATE SERVER co_src FOREIGN DATA WRAPPER postgres_fdw OPTIONS (dbname 'inventory_co');
CREATE USER MAPPING FOR CURRENT_USER SERVER ve_src OPTIONS (user 'postgres');
CREATE USER MAPPING FOR CURRENT_USER SERVER co_src OPTIONS (user 'postgres');
CREATE SCHEMA ve_src; IMPORT FOREIGN SCHEMA public FROM SERVER ve_src INTO ve_src;
CREATE SCHEMA co_src; IMPORT FOREIGN SCHEMA public FROM SERVER co_src INTO co_src;

-- ── A. Filas por tabla ────────────────────────────────────────────────────
DO $$
DECLARE tbl TEXT; emp INT; src TEXT; a BIGINT; b BIGINT;
BEGIN
  FOR tbl IN
    SELECT c.relname FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
      AND EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polname = 'empresa_aislada')
    ORDER BY 1
  LOOP
    FOR emp, src IN SELECT * FROM (VALUES (1, 've_src'), (2, 'co_src')) v LOOP
      EXECUTE format('SELECT count(*) FROM public.%I WHERE empresa_id = %s', tbl, emp) INTO a;
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = src AND table_name = tbl) THEN
        EXECUTE format('SELECT count(*) FROM %I.%I', src, tbl) INTO b;
      ELSE
        b := 0;
      END IF;
      INSERT INTO resultado (control, ok, detalle)
      VALUES (format('A filas %s empresa %s', tbl, emp), a = b, format('base nueva %s · origen %s', a, b));
    END LOOP;
  END LOOP;
END $$;

-- ── B. Números del negocio ────────────────────────────────────────────────
CREATE TEMP TABLE numeros (emp INT, nombre TEXT, nuevo NUMERIC, origen NUMERIC);
INSERT INTO numeros
SELECT 1, 'stock total',            (SELECT sum(quantity) FROM inventory WHERE empresa_id = 1),             (SELECT sum(quantity) FROM ve_src.inventory) UNION ALL
SELECT 2, 'stock total',            (SELECT sum(quantity) FROM inventory WHERE empresa_id = 2),             (SELECT sum(quantity) FROM co_src.inventory) UNION ALL
SELECT 1, 'ventas total',           (SELECT sum(total_amount) FROM sales WHERE empresa_id = 1),             (SELECT sum(total_amount) FROM ve_src.sales) UNION ALL
SELECT 2, 'ventas total',           (SELECT sum(total_amount) FROM sales WHERE empresa_id = 2),             (SELECT sum(total_amount) FROM co_src.sales) UNION ALL
SELECT 1, 'costo congelado ventas', (SELECT sum(unit_cost * quantity) FROM sale_items WHERE empresa_id = 1), (SELECT sum(unit_cost * quantity) FROM ve_src.sale_items) UNION ALL
SELECT 2, 'costo congelado ventas', (SELECT sum(unit_cost * quantity) FROM sale_items WHERE empresa_id = 2), (SELECT sum(unit_cost * quantity) FROM co_src.sale_items) UNION ALL
SELECT 1, 'costo productos',        (SELECT sum(total_cost) FROM product_pricing WHERE empresa_id = 1),     (SELECT sum(total_cost) FROM ve_src.product_pricing) UNION ALL
SELECT 2, 'costo productos',        (SELECT sum(total_cost) FROM product_pricing WHERE empresa_id = 2),     (SELECT sum(total_cost) FROM co_src.product_pricing) UNION ALL
SELECT 1, 'compras total',          (SELECT sum(total_usd) FROM purchase_orders WHERE empresa_id = 1),      (SELECT sum(total_usd) FROM ve_src.purchase_orders) UNION ALL
SELECT 2, 'compras total',          (SELECT sum(total_usd) FROM purchase_orders WHERE empresa_id = 2),      (SELECT sum(total_usd) FROM co_src.purchase_orders) UNION ALL
SELECT 1, 'importaciones total',    (SELECT sum(total_usd) FROM import_orders WHERE empresa_id = 1),        (SELECT sum(total_usd) FROM ve_src.import_orders) UNION ALL
SELECT 2, 'importaciones total',    (SELECT sum(total_usd) FROM import_orders WHERE empresa_id = 2),        (SELECT sum(total_usd) FROM co_src.import_orders) UNION ALL
SELECT 1, 'movimientos (suma)',     (SELECT sum(quantity) FROM inventory_movements WHERE empresa_id = 1),   (SELECT sum(quantity) FROM ve_src.inventory_movements) UNION ALL
SELECT 2, 'movimientos (suma)',     (SELECT sum(quantity) FROM inventory_movements WHERE empresa_id = 2),   (SELECT sum(quantity) FROM co_src.inventory_movements);
INSERT INTO resultado (control, ok, detalle)
SELECT format('B %s empresa %s', nombre, emp), nuevo IS NOT DISTINCT FROM origen, format('base nueva %s · origen %s', nuevo, origen)
FROM numeros ORDER BY nombre, emp;

-- ── C. Contenido fila por fila (llaves de negocio, sin ids) ───────────────
INSERT INTO resultado (control, ok, detalle)
SELECT format('C %s empresa %s', nombre, emp), n = 0, format('%s filas distintas', n) FROM (
  SELECT 1 AS emp, 'productos' AS nombre, (SELECT count(*) FROM (
    (SELECT code, name, is_active, weight_kg FROM products WHERE empresa_id = 1 EXCEPT SELECT code, name, is_active, weight_kg FROM ve_src.products)
    UNION ALL (SELECT code, name, is_active, weight_kg FROM ve_src.products EXCEPT SELECT code, name, is_active, weight_kg FROM products WHERE empresa_id = 1)) x) AS n
  UNION ALL
  SELECT 2, 'productos', (SELECT count(*) FROM (
    (SELECT code, name, is_active, weight_kg FROM products WHERE empresa_id = 2 EXCEPT SELECT code, name, is_active, weight_kg FROM co_src.products)
    UNION ALL (SELECT code, name, is_active, weight_kg FROM co_src.products EXCEPT SELECT code, name, is_active, weight_kg FROM products WHERE empresa_id = 2)) x)
  UNION ALL
  SELECT 1, 'stock por producto', (SELECT count(*) FROM (
    (SELECT p.code, i.quantity, i.sale_price FROM inventory i JOIN products p ON p.id = i.product_id WHERE i.empresa_id = 1
     EXCEPT SELECT p.code, i.quantity, i.sale_price FROM ve_src.inventory i JOIN ve_src.products p ON p.id = i.product_id)
    UNION ALL (SELECT p.code, i.quantity, i.sale_price FROM ve_src.inventory i JOIN ve_src.products p ON p.id = i.product_id
     EXCEPT SELECT p.code, i.quantity, i.sale_price FROM inventory i JOIN products p ON p.id = i.product_id WHERE i.empresa_id = 1)) x)
  UNION ALL
  SELECT 2, 'stock por producto', (SELECT count(*) FROM (
    (SELECT p.code, i.quantity, i.sale_price FROM inventory i JOIN products p ON p.id = i.product_id WHERE i.empresa_id = 2
     EXCEPT SELECT p.code, i.quantity, i.sale_price FROM co_src.inventory i JOIN co_src.products p ON p.id = i.product_id)
    UNION ALL (SELECT p.code, i.quantity, i.sale_price FROM co_src.inventory i JOIN co_src.products p ON p.id = i.product_id
     EXCEPT SELECT p.code, i.quantity, i.sale_price FROM inventory i JOIN products p ON p.id = i.product_id WHERE i.empresa_id = 2)) x)
  UNION ALL
  SELECT 1, 'ventas', (SELECT count(*) FROM (
    (SELECT ml_order_number, status, customer_name, total_amount, created_at FROM sales WHERE empresa_id = 1
     EXCEPT SELECT ml_order_number, status, customer_name, total_amount, created_at FROM ve_src.sales)
    UNION ALL (SELECT ml_order_number, status, customer_name, total_amount, created_at FROM ve_src.sales
     EXCEPT SELECT ml_order_number, status, customer_name, total_amount, created_at FROM sales WHERE empresa_id = 1)) x)
  UNION ALL
  SELECT 2, 'ventas', (SELECT count(*) FROM (
    (SELECT ml_order_number, status, customer_name, total_amount, created_at FROM sales WHERE empresa_id = 2
     EXCEPT SELECT ml_order_number, status, customer_name, total_amount, created_at FROM co_src.sales)
    UNION ALL (SELECT ml_order_number, status, customer_name, total_amount, created_at FROM co_src.sales
     EXCEPT SELECT ml_order_number, status, customer_name, total_amount, created_at FROM sales WHERE empresa_id = 2)) x)
  UNION ALL
  -- Cada ítem de venta sigue apuntando al mismo producto (por código) y a la misma venta.
  SELECT 2, 'ítems de venta → producto', (SELECT count(*) FROM (
    (SELECT s.ml_order_number, p.code, si.quantity, si.unit_price FROM sale_items si JOIN sales s ON s.id = si.sale_id JOIN products p ON p.id = si.product_id WHERE si.empresa_id = 2
     EXCEPT SELECT s.ml_order_number, p.code, si.quantity, si.unit_price FROM co_src.sale_items si JOIN co_src.sales s ON s.id = si.sale_id JOIN co_src.products p ON p.id = si.product_id)) x)
) t;

-- ── D. Referencias rotas ──────────────────────────────────────────────────
DO $$
DECLARE r RECORD; n BIGINT; cond TEXT; cols_h TEXT; cols_p TEXT;
BEGIN
  FOR r IN
    SELECT con.conname, con.conrelid::regclass::text AS hijo, con.confrelid::regclass::text AS padre,
           con.conkey, con.confkey, con.conrelid, con.confrelid
    FROM pg_constraint con
    WHERE con.contype = 'f' AND con.connamespace = 'public'::regnamespace
  LOOP
    SELECT string_agg(format('h.%I', a.attname), ', ' ORDER BY k.i), string_agg(format('p.%I', b.attname), ', ' ORDER BY k.i),
           string_agg(format('h.%I IS NOT NULL', a.attname), ' AND ')
    INTO cols_h, cols_p, cond
    FROM generate_subscripts(r.conkey, 1) k(i)
    JOIN pg_attribute a ON a.attrelid = r.conrelid  AND a.attnum = r.conkey[k.i]
    JOIN pg_attribute b ON b.attrelid = r.confrelid AND b.attnum = r.confkey[k.i];
    EXECUTE format('SELECT count(*) FROM %I h WHERE %s AND NOT EXISTS (SELECT 1 FROM %I p WHERE (%s) = (%s))',
                   r.hijo, cond, r.padre, cols_p, cols_h) INTO n;
    IF n > 0 THEN
      INSERT INTO resultado (control, ok, detalle) VALUES (format('D %s', r.conname), FALSE, format('%s filas de %s sin su %s', n, r.hijo, r.padre));
    END IF;
  END LOOP;
  INSERT INTO resultado (control, ok, detalle) VALUES ('D referencias rotas (todas las FK)', TRUE, 'revisadas');
END $$;

-- Usuarios: cada uno con al menos una empresa.
INSERT INTO resultado (control, ok, detalle)
SELECT 'D usuarios con empresa', count(*) = 0, format('%s usuarios sin empresa', count(*))
FROM users u WHERE NOT EXISTS (SELECT 1 FROM usuario_empresas ue WHERE ue.user_id = u.id);

-- ── E. Aislamiento con el rol de la app ───────────────────────────────────
CREATE TEMP TABLE e_conteos (emp TEXT, tabla TEXT, n BIGINT);
-- Un producto real de CO, buscado ANTES de cambiar de rol (como app, desde VE, no se ve).
CREATE TEMP TABLE e_ids AS SELECT min(id) AS producto_co FROM products WHERE empresa_id = 2;
GRANT INSERT ON e_conteos, resultado TO inventory_app;
GRANT SELECT ON e_ids TO inventory_app;
GRANT USAGE ON SEQUENCE resultado_orden_seq TO inventory_app;

SET ROLE inventory_app;

-- Sin empresa fijada: nada visible en ninguna tabla de negocio.
DO $$
DECLARE tbl TEXT; n BIGINT; total BIGINT := 0;
BEGIN
  FOR tbl IN SELECT c.relname FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
             AND EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polname = 'empresa_aislada') LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', tbl) INTO n;
    total := total + n;
  END LOOP;
  INSERT INTO resultado (control, ok, detalle) VALUES ('E sin empresa no se ve nada', total = 0, format('%s filas visibles', total));
END $$;

-- Con empresa 1 / 2: se ve exactamente lo de cada una (se compara con A, hecho como postgres).
SET app.empresa_id = '1';
INSERT INTO e_conteos SELECT '1', 'products', count(*) FROM products;
INSERT INTO e_conteos SELECT '1', 'sales', count(*) FROM sales;
INSERT INTO e_conteos SELECT '1', 'otra empresa visible', count(*) FROM sales WHERE empresa_id <> 1;
SET app.empresa_id = '2';
INSERT INTO e_conteos SELECT '2', 'products', count(*) FROM products;
INSERT INTO e_conteos SELECT '2', 'sales', count(*) FROM sales;
INSERT INTO e_conteos SELECT '2', 'otra empresa visible', count(*) FROM sales WHERE empresa_id <> 2;

-- Escribir en otra empresa: rechazado por la política.
SET app.empresa_id = '1';
DO $$
DECLARE quedo INT;
BEGIN
  BEGIN
    INSERT INTO products (code, name, empresa_id) VALUES ('ZZ-PRUEBA-RLS', 'prueba', 2);
    INSERT INTO resultado (control, ok, detalle) VALUES ('E no escribe en otra empresa', FALSE, 'se pudo insertar en la empresa 2 estando en la 1');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    INSERT INTO resultado (control, ok, detalle) VALUES ('E no escribe en otra empresa', TRUE, 'rechazado');
  END;
  -- Apuntar a un producto de otra empresa: rechazado por la FK compuesta.
  BEGIN
    INSERT INTO inventory_movements (product_id, movement_type, quantity, reference)
    VALUES ((SELECT producto_co FROM e_ids), 'ADJUST', 0, 'prueba RLS');
    INSERT INTO resultado (control, ok, detalle) VALUES ('E no referencia filas de otra empresa', FALSE, 'se pudo apuntar a un producto de CO desde VE');
  EXCEPTION WHEN foreign_key_violation THEN
    INSERT INTO resultado (control, ok, detalle) VALUES ('E no referencia filas de otra empresa', TRUE, 'rechazado');
  END;
  -- El INSERT normal de la app (sin empresa_id) toma la empresa de la conexión.
  -- (dentro de un bloque que se deshace: el producto de prueba no queda)
  BEGIN
    INSERT INTO products (code, name) VALUES ('ZZ-PRUEBA-RLS', 'prueba') RETURNING empresa_id INTO quedo;
    RAISE EXCEPTION 'deshacer' USING ERRCODE = 'P0001';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
  INSERT INTO resultado (control, ok, detalle)
  VALUES ('E insert sin empresa_id usa la de la conexión', quedo = 1, format('quedó en empresa %s', quedo));
END $$;
RESET app.empresa_id;
RESET ROLE;

INSERT INTO resultado (control, ok, detalle)
SELECT format('E empresa %s ve sus %s', c.emp, c.tabla),
       c.n = (SELECT count(*) FROM products WHERE empresa_id = c.emp::int),
       format('ve %s', c.n)
FROM e_conteos c WHERE c.tabla = 'products'
UNION ALL
SELECT format('E empresa %s ve sus %s', c.emp, c.tabla),
       c.n = (SELECT count(*) FROM sales WHERE empresa_id = c.emp::int),
       format('ve %s', c.n)
FROM e_conteos c WHERE c.tabla = 'sales'
UNION ALL
SELECT format('E empresa %s no ve la otra', c.emp), c.n = 0, format('ve %s ajenas', c.n)
FROM e_conteos c WHERE c.tabla = 'otra empresa visible';

-- ── Salida ────────────────────────────────────────────────────────────────
\pset footer off
SELECT CASE WHEN ok THEN 'OK   ' ELSE 'FALLA' END AS " ", control, detalle FROM resultado
WHERE NOT ok OR control NOT LIKE 'A filas%' ORDER BY orden;
SELECT format('%s controles · %s OK · %s FALLAS', count(*), count(*) FILTER (WHERE ok), count(*) FILTER (WHERE NOT ok)) AS total FROM resultado;

ROLLBACK;
