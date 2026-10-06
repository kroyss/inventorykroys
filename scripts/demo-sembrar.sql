-- Datos de DEMOSTRACIÓN para grabar los videos (Despachos, Reportador, Calificaciones) en UNA empresa
-- de prueba. Uso (en el VPS):
--   docker exec -i inventory_db psql -U postgres -d inventory -v empresa=4 < scripts/demo-sembrar.sql
-- Se deshace con scripts/demo-limpiar.sql (mismo -v empresa). Todo lo sembrado usa ventas
-- 2000099990000101..105 y productos DEMO-1..4: no choca con datos reales.
-- Las etiquetas PDF de demostración (2 ZOOM, 2 TEALCA) corresponden a las ventas 101..104.
\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('app.empresa_id', :'empresa', true);
-- Rol de la app: con RLS solo ve y toca la empresa indicada (postgres lo saltaría y tocaría TODAS).
SET LOCAL ROLE inventory_app;

-- Modo demostración: Reportador y Calificaciones no llaman a MercadoLibre (lib/demo.ts).
INSERT INTO app_settings (key, value) VALUES ('modo_demo', '1')
ON CONFLICT (empresa_id, key) DO UPDATE SET value = '1';

-- Reportador: solo si la empresa no tiene configuración propia.
INSERT INTO app_settings (key, value) VALUES
  ('reportador_cuentas', '[{"nombre":"VAPERK","filtro":"TIENDA DEMO","pagina":"mercadolibre.com.ve/pagina/vaperk"}]'),
  ('reportador_plantillas', '["¡Hola! Tu pedido ya salió por ZOOM. Tu número de guía es {guia}. ¡Gracias por tu compra!","Buen día, tu paquete fue entregado a ZOOM con la guía {guia}. Cualquier duda, aquí estamos."]'),
  ('reportador_bloque', ' Más productos en {pagina}')
ON CONFLICT (empresa_id, key) DO NOTHING;

-- Ventas de MercadoLibre (Despachos sin inventario y Calificaciones). notas_at en el futuro: el
-- sistema no intenta leer sus notas en MercadoLibre.
INSERT INTO ml_ordenes (id, conexion_id, fecha, comprador, productos, total, moneda, estado, items, detalle, notas, notas_at)
SELECT v.id, (SELECT id FROM ml_conexiones WHERE estado = 'activa' ORDER BY id LIMIT 1),
       NOW() - v.hace, v.comprador, v.cant || ' × ' || v.titulo, v.total, 'VES', 'paid', ARRAY[v.item],
       jsonb_build_array(jsonb_build_object('titulo', v.titulo, 'cantidad', v.cant, 'variante', v.variante)),
       v.nota, NOW() + INTERVAL '10 years'
FROM (VALUES
  (2000099990000101::bigint, INTERVAL '4 days', 'CARLOS MENDOZA', 'Cable USB C 4 en 1 Trenzado 65W Carga Rápida 1m', 2, 'Negro', 'MLV9999000101', 1480.00, 'Envolver bien, es regalo'),
  (2000099990000102, INTERVAL '4 days', 'ANA RODRIGUEZ', 'Audífonos Bluetooth Inalámbricos con Estuche de Carga', 1, NULL, 'MLV9999000102', 2950.00, NULL),
  (2000099990000103, INTERVAL '4 days', 'LUIS PEREZ', 'Cargador Rápido 20W USB-C para Celular', 1, 'Blanco', 'MLV9999000103', 1620.00, NULL),
  (2000099990000104, INTERVAL '4 days', 'MARIA GONZALEZ', 'Soporte Magnético de Celular para Carro', 3, NULL, 'MLV9999000104', 2310.00, 'Confirmar dirección por mensaje'),
  (2000099990000105, INTERVAL '6 days', 'JOSE RAMIREZ', 'Mouse Inalámbrico Recargable Silencioso', 1, NULL, 'MLV9999000105', 1150.00, NULL)
) AS v(id, hace, comprador, titulo, cant, variante, item, total, nota)
ON CONFLICT (empresa_id, id) DO NOTHING;

-- Mismas ventas cargadas en el inventario (Despachos CON inventario), PROCESADAS (listas para imprimir).
INSERT INTO products (code, name, is_active)
SELECT v.code, v.name, TRUE FROM (VALUES
  ('DEMO-1', 'Cable USB C 4 en 1 Trenzado 65W'), ('DEMO-2', 'Audífonos Bluetooth Inalámbricos'),
  ('DEMO-3', 'Cargador Rápido 20W USB-C'), ('DEMO-4', 'Soporte Magnético de Celular para Carro')) AS v(code, name)
WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.code = v.code);

INSERT INTO sales (ml_order_number, status, customer_name, total_amount, notes)
SELECT v.venta, 'PROCESADA', v.cliente, v.total, v.nota FROM (VALUES
  ('2000099990000101', 'CARLOS MENDOZA', 8.0, 'Envolver bien, es regalo'), ('2000099990000102', 'ANA RODRIGUEZ', 16.0, NULL),
  ('2000099990000103', 'LUIS PEREZ', 9.0, NULL), ('2000099990000104', 'MARIA GONZALEZ', 12.6, 'Confirmar dirección por mensaje')) AS v(venta, cliente, total, nota)
WHERE NOT EXISTS (SELECT 1 FROM sales s WHERE s.ml_order_number = v.venta);

INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, total_price)
SELECT s.id, p.id, v.cant, v.precio, v.cant * v.precio
FROM (VALUES ('2000099990000101', 'DEMO-1', 2, 4.0), ('2000099990000102', 'DEMO-2', 1, 16.0),
             ('2000099990000103', 'DEMO-3', 1, 9.0), ('2000099990000104', 'DEMO-4', 3, 4.2)) AS v(venta, code, cant, precio)
JOIN sales s ON s.ml_order_number = v.venta
JOIN products p ON p.code = v.code
WHERE NOT EXISTS (SELECT 1 FROM sale_items i WHERE i.sale_id = s.id);

-- Stock (Automatizaciones → Stock): publicaciones de demostración agotadas y por agotarse (límite 3),
-- todas "vendidas en los últimos 30 días" (por los items de las ventas sembradas). En modo demo la
-- revisión del cron no relee MercadoLibre (no las borra) y "Actualizar en MercadoLibre" solo las
-- cambia en el sistema. Volver a correr este script las deja como al principio (para repetir tomas).
UPDATE ml_ordenes SET items = ARRAY['MLV9999000101:1001'] WHERE id = 2000099990000101;
UPDATE ml_ordenes SET items = ARRAY['MLV9999000105', 'MLV9999000201', 'MLV9999000202'] WHERE id = 2000099990000105;
INSERT INTO ml_stock_alertas AS a (item_id, variante_id, conexion_id, titulo, variante, disponible, estado, permalink, imagen,
                                   agotada_desde, bajo_desde, ultima_agotada_at, actualizado_at)
SELECT v.item, v.var, (SELECT id FROM ml_conexiones WHERE estado = 'activa' ORDER BY id LIMIT 1), v.titulo, v.variante, v.disp,
       v.estado, NULL, v.img,
       CASE WHEN v.disp <= 0 THEN NOW() - v.hace END, CASE WHEN v.disp > 0 AND v.disp < 3 THEN NOW() - v.hace END,
       CASE WHEN v.disp <= 0 THEN NOW() - v.hace END,
       NOW() + INTERVAL '10 days'   -- "fresca" (se lista) mientras dure la grabación
FROM (VALUES
  ('MLV9999000101', 1001, 'Cable USB C 4 en 1 Trenzado 65W Carga Rápida 1m', 'Color: Negro', 0, 'active', INTERVAL '2 days', 'data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20viewBox%3D%270%200%2064%2064%27%3E%3Crect%20width%3D%2764%27%20height%3D%2764%27%20fill%3D%27%23e0f2fe%27/%3E%3Ctext%20x%3D%2732%27%20y%3D%2744%27%20font-size%3D%2734%27%20text-anchor%3D%27middle%27%3E%F0%9F%94%8C%3C/text%3E%3C/svg%3E'),
  ('MLV9999000101', 1002, 'Cable USB C 4 en 1 Trenzado 65W Carga Rápida 1m', 'Color: Blanco', 4, 'active', NULL, 'data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20viewBox%3D%270%200%2064%2064%27%3E%3Crect%20width%3D%2764%27%20height%3D%2764%27%20fill%3D%27%23e0f2fe%27/%3E%3Ctext%20x%3D%2732%27%20y%3D%2744%27%20font-size%3D%2734%27%20text-anchor%3D%27middle%27%3E%F0%9F%94%8C%3C/text%3E%3C/svg%3E'),
  ('MLV9999000103', 0, 'Cargador Rápido 20W USB-C para Celular', NULL, 0, 'paused', INTERVAL '1 day', 'data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20viewBox%3D%270%200%2064%2064%27%3E%3Crect%20width%3D%2764%27%20height%3D%2764%27%20fill%3D%27%23fef3c7%27/%3E%3Ctext%20x%3D%2732%27%20y%3D%2744%27%20font-size%3D%2734%27%20text-anchor%3D%27middle%27%3E%F0%9F%94%8B%3C/text%3E%3C/svg%3E'),
  ('MLV9999000201', 0, 'Power Bank 10000mAh Carga Rápida Doble USB', NULL, 0, 'paused', INTERVAL '5 hours', 'data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20viewBox%3D%270%200%2064%2064%27%3E%3Crect%20width%3D%2764%27%20height%3D%2764%27%20fill%3D%27%23dcfce7%27/%3E%3Ctext%20x%3D%2732%27%20y%3D%2744%27%20font-size%3D%2734%27%20text-anchor%3D%27middle%27%3E%E2%9A%A1%3C/text%3E%3C/svg%3E'),
  ('MLV9999000102', 0, 'Audífonos Bluetooth Inalámbricos con Estuche de Carga', NULL, 2, 'active', INTERVAL '3 days', 'data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20viewBox%3D%270%200%2064%2064%27%3E%3Crect%20width%3D%2764%27%20height%3D%2764%27%20fill%3D%27%23ede9fe%27/%3E%3Ctext%20x%3D%2732%27%20y%3D%2744%27%20font-size%3D%2734%27%20text-anchor%3D%27middle%27%3E%F0%9F%8E%A7%3C/text%3E%3C/svg%3E'),
  ('MLV9999000104', 0, 'Soporte Magnético de Celular para Carro', NULL, 1, 'active', INTERVAL '1 day', 'data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20viewBox%3D%270%200%2064%2064%27%3E%3Crect%20width%3D%2764%27%20height%3D%2764%27%20fill%3D%27%23fee2e2%27/%3E%3Ctext%20x%3D%2732%27%20y%3D%2744%27%20font-size%3D%2734%27%20text-anchor%3D%27middle%27%3E%F0%9F%9A%97%3C/text%3E%3C/svg%3E'),
  ('MLV9999000105', 0, 'Mouse Inalámbrico Recargable Silencioso', NULL, 2, 'active', INTERVAL '6 hours', 'data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20viewBox%3D%270%200%2064%2064%27%3E%3Crect%20width%3D%2764%27%20height%3D%2764%27%20fill%3D%27%23f1f5f9%27/%3E%3Ctext%20x%3D%2732%27%20y%3D%2744%27%20font-size%3D%2734%27%20text-anchor%3D%27middle%27%3E%F0%9F%96%B1%EF%B8%8F%3C/text%3E%3C/svg%3E'),
  ('MLV9999000202', 0, 'Lámpara LED de Escritorio Recargable Táctil', NULL, 1, 'active', INTERVAL '2 days', 'data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20viewBox%3D%270%200%2064%2064%27%3E%3Crect%20width%3D%2764%27%20height%3D%2764%27%20fill%3D%27%23fef9c3%27/%3E%3Ctext%20x%3D%2732%27%20y%3D%2744%27%20font-size%3D%2734%27%20text-anchor%3D%27middle%27%3E%F0%9F%92%A1%3C/text%3E%3C/svg%3E')
) AS v(item, var, titulo, variante, disp, estado, hace, img)
ON CONFLICT (empresa_id, item_id, variante_id) DO UPDATE SET
  disponible = EXCLUDED.disponible, estado = EXCLUDED.estado, imagen = EXCLUDED.imagen, titulo = EXCLUDED.titulo,
  agotada_desde = EXCLUDED.agotada_desde, bajo_desde = EXCLUDED.bajo_desde,
  ultima_agotada_at = EXCLUDED.ultima_agotada_at, actualizado_at = EXCLUDED.actualizado_at;

COMMIT;
SELECT 'Demo sembrada: ' || (SELECT COUNT(*) FROM ml_ordenes WHERE empresa_id = :'empresa'::int AND id BETWEEN 2000099990000101 AND 2000099990000105)
       || ' ventas ML, ' || (SELECT COUNT(*) FROM sales WHERE empresa_id = :'empresa'::int AND ml_order_number LIKE '20000999900001%') || ' ventas en inventario' AS listo;
