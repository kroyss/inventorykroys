-- Empresa de EJEMPLO para las capturas del manual (14-11-2026). SOLO STAGING (inventory_db_staging/inventory_multi).
-- Datos inventados: ningún cliente ni producto real aparece en el manual. Idempotente: si ya existe, la borra y la
-- vuelve a crear (sus ventas quedan con fechas recientes para que el Inicio y Reportes se vean con datos).
-- Uso (lo hace scripts/manual/capturas.sh): psql -v hash='<bcrypt>' -f seed-tienda-ejemplo.sql
\set ON_ERROR_STOP on
BEGIN;
-- Limpieza de una corrida anterior (las tablas de negocio caen por la empresa)
DELETE FROM usuario_empresas WHERE user_id IN (SELECT id FROM users WHERE username = 'manual.capturas');
DELETE FROM users WHERE username = 'manual.capturas';

INSERT INTO organizaciones (nombre, estado, interna) VALUES ('Tienda Ejemplo (manual)', 'activo', TRUE);
INSERT INTO empresas (organizacion_id, nombre, country, modulos)
SELECT id, 'Tienda Ejemplo', 'VE', ARRAY['inventario','precios_categorias'] FROM organizaciones WHERE nombre = 'Tienda Ejemplo (manual)';
INSERT INTO users (username, password_hash, full_name, role, country_access, is_active)
VALUES ('manual.capturas', :'hash', 'Ana Ejemplo', 'admin', 'VE', TRUE);
INSERT INTO usuario_empresas (user_id, empresa_id, role)
SELECT u.id, e.id, 'admin' FROM users u, empresas e WHERE u.username = 'manual.capturas' AND e.nombre = 'Tienda Ejemplo';

DO $$
DECLARE
  emp int := (SELECT id FROM empresas WHERE nombre = 'Tienda Ejemplo');
  usr int := (SELECT id FROM users WHERE username = 'manual.capturas');
  nombres text[] := ARRAY['Audífonos inalámbricos Pro', 'Cargador rápido USB-C 20W', 'Cable USB-C 1 m reforzado', 'Lámpara LED de escritorio',
    'Soporte de celular para carro', 'Mouse inalámbrico silencioso', 'Teclado compacto bluetooth', 'Parlante portátil 10W',
    'Termo de acero 750 ml', 'Organizador de cables (pack 10)', 'Reloj inteligente deportivo', 'Báscula digital de cocina'];
  costos numeric[] := ARRAY[8.5, 3.2, 1.1, 6.4, 2.3, 4.1, 9.8, 7.5, 3.9, 0.9, 14.5, 5.2];
  pesos int[] := ARRAY[9, 14, 22, 5, 11, 7, 3, 6, 4, 8, 2, 3];        -- ventas por mes aproximadas
  stocks int[] := ARRAY[24, 6, 60, 3, 18, 0, 9, 14, 30, 45, 2, 11];
  cat int; pid int; sid int; supid int; po int; i int; d int; q int; precio numeric;
BEGIN
  PERFORM set_config('app.empresa_id', emp::text, true);
  -- Categorías de ganancia: las mismas escalas que la empresa 1
  INSERT INTO profit_categories (name, profit_percentage, display_order, color, is_active, empresa_id)
  SELECT profit_percentage::int || '%', profit_percentage, display_order, color, TRUE, emp
  FROM profit_categories WHERE empresa_id = 1 AND is_active AND profit_percentage > 0;
  cat := (SELECT id FROM profit_categories WHERE empresa_id = emp ORDER BY abs(profit_percentage - 80) LIMIT 1);
  INSERT INTO suppliers (name, contact, phone, supplier_type, empresa_id) VALUES ('Distribuidora Central', 'Luis', '0412-0000000', 'local', emp) RETURNING id INTO supid;

  FOR i IN 1..array_length(nombres, 1) LOOP
    INSERT INTO products (code, name, empresa_id, weight_kg) VALUES ('COD-' || lpad(i::text, 4, '0'), nombres[i], emp, 0.3) RETURNING id INTO pid;
    precio := round(costos[i] * 1.8, 2);
    INSERT INTO product_pricing (product_id, base_cost, profit_category_id, base_price_usd, published_price_usd, final_price_usd, empresa_id)
    VALUES (pid, costos[i], cat, precio, round(precio * 1.5, 2), precio, emp);
    INSERT INTO inventory (product_id, quantity, min_stock, max_stock, sale_price, empresa_id)
    VALUES (pid, stocks[i], greatest(2, pesos[i] * 2), pesos[i] * 6, precio, emp);
    -- Entrada inicial hace 5 meses (para que el historial cierre con el stock)
    INSERT INTO inventory_movements (product_id, movement_type, quantity, reference, notes, created_by, created_at, empresa_id)
    VALUES (pid, 'IN', stocks[i] + pesos[i] * 5, 'INICIAL', 'Stock inicial', usr, NOW() - INTERVAL '150 days', emp);
    -- Ventas: unas por semana durante 5 meses, más en los últimos 30 días para que haya movimiento
    FOR d IN 1..150 LOOP
      IF random() < pesos[i] / 30.0 THEN
        q := 1 + (random() < 0.2)::int;
        INSERT INTO sales (ml_order_number, status, customer_name, total_amount, created_by, created_at, processed_at, processed_by, empresa_id)
        VALUES ('2000' || lpad((floor(random() * 1e9))::text, 9, '0'), 'DESCARGADA', 'Cliente ' || (1 + floor(random() * 300))::int,
                precio * q, usr, NOW() - make_interval(days => d), NOW() - make_interval(days => d), usr, emp) RETURNING id INTO sid;
        INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, total_price, unit_cost, unit_commission, empresa_id)
        VALUES (sid, pid, q, precio, precio * q, costos[i], round(precio * 0.12, 2), emp);
        INSERT INTO inventory_movements (product_id, movement_type, quantity, reference, created_by, created_at, empresa_id)
        VALUES (pid, 'OUT', -q, 'VENTA', usr, NOW() - make_interval(days => d), emp);
      END IF;
    END LOOP;
  END LOOP;
  -- El stock real = lo que dicen los movimientos (así Reportes → Stock no marca historial roto)
  UPDATE inventory i SET quantity = greatest(0, m.s) FROM (SELECT product_id, SUM(quantity) s FROM inventory_movements WHERE empresa_id = emp GROUP BY 1) m
  WHERE i.product_id = m.product_id AND i.empresa_id = emp;
  UPDATE inventory_movements SET quantity = quantity - LEAST(0, (SELECT SUM(quantity) FROM inventory_movements x WHERE x.product_id = inventory_movements.product_id))
  WHERE empresa_id = emp AND reference = 'INICIAL';
  UPDATE inventory i SET quantity = m.s FROM (SELECT product_id, SUM(quantity) s FROM inventory_movements WHERE empresa_id = emp GROUP BY 1) m
  WHERE i.product_id = m.product_id AND i.empresa_id = emp;

  -- Una compra finalizada y una pendiente
  INSERT INTO purchase_orders (order_number, supplier_id, status, total_usd, total_paid, order_type, created_by, created_at, received_at, empresa_id)
  VALUES ('OC-0001', supid, 'FINALIZADA', 0, 0, 'local', usr, NOW() - INTERVAL '20 days', NOW() - INTERVAL '18 days', emp) RETURNING id INTO po;
  INSERT INTO purchase_order_items (purchase_order_id, product_id, quantity, unit_cost_usd, total_cost_usd, received_qty, total_received_qty, empresa_id)
  SELECT po, p.id, 10, pp.base_cost, pp.base_cost * 10, 10, 10, emp FROM products p JOIN product_pricing pp ON pp.product_id = p.id
  WHERE p.empresa_id = emp AND p.code IN ('COD-0001', 'COD-0003', 'COD-0009');
  UPDATE purchase_orders SET total_usd = (SELECT SUM(total_cost_usd) FROM purchase_order_items WHERE purchase_order_id = po), total_paid = (SELECT SUM(total_cost_usd) FROM purchase_order_items WHERE purchase_order_id = po) WHERE id = po;
  INSERT INTO purchase_orders (order_number, supplier_id, status, total_usd, order_type, created_by, created_at, empresa_id)
  VALUES ('OC-0002', supid, 'PENDIENTE', 0, 'local', usr, NOW() - INTERVAL '1 day', emp) RETURNING id INTO po;
  INSERT INTO purchase_order_items (purchase_order_id, product_id, quantity, unit_cost_usd, total_cost_usd, empresa_id)
  SELECT po, p.id, 12, pp.base_cost, pp.base_cost * 12, emp FROM products p JOIN product_pricing pp ON pp.product_id = p.id
  WHERE p.empresa_id = emp AND p.code IN ('COD-0004', 'COD-0006', 'COD-0011');
  UPDATE purchase_orders SET total_usd = (SELECT SUM(total_cost_usd) FROM purchase_order_items WHERE purchase_order_id = po) WHERE id = po;
END $$;
COMMIT;
SELECT e.id AS empresa, (SELECT COUNT(*) FROM products WHERE empresa_id = e.id) AS productos, (SELECT COUNT(*) FROM sales WHERE empresa_id = e.id) AS ventas
FROM empresas e WHERE e.nombre = 'Tienda Ejemplo';
