-- Deshace scripts/demo-sembrar.sql: borra lo sembrado y lo que se generó con esas ventas
-- (etiquetas, lotes y jornadas de demostración) y apaga el modo demostración.
--   docker exec -i inventory_db psql -U postgres -d inventory -v empresa=4 < scripts/demo-limpiar.sql
-- Solo toca ventas 2000099990000101..105, productos DEMO-1..4 y la config del Reportador si sigue
-- siendo la sembrada. Los PDF en disco los borra la limpieza automática de Despachos.
\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('app.empresa_id', :'empresa', true);
-- Rol de la app: con RLS solo ve y toca la empresa indicada (postgres lo saltaría y tocaría TODAS).
SET LOCAL ROLE inventory_app;

-- Despachos: jornadas que SOLO tienen etiquetas de demostración (con sus lotes y etiquetas).
CREATE TEMP TABLE demo_jornadas ON COMMIT DROP AS
SELECT j.id FROM despacho_jornadas j
WHERE EXISTS (SELECT 1 FROM despacho_lotes l JOIN despacho_etiquetas e ON e.lote_id = l.id
              WHERE l.jornada_id = j.id AND e.venta LIKE '20000999900001%')
  AND NOT EXISTS (SELECT 1 FROM despacho_lotes l JOIN despacho_etiquetas e ON e.lote_id = l.id
                  WHERE l.jornada_id = j.id AND (e.venta IS NULL OR e.venta NOT LIKE '20000999900001%'));
-- Lotes que SOLO tienen etiquetas de demostración.
CREATE TEMP TABLE demo_lotes ON COMMIT DROP AS
SELECT l.id FROM despacho_lotes l
WHERE EXISTS (SELECT 1 FROM despacho_etiquetas e WHERE e.lote_id = l.id AND e.venta LIKE '20000999900001%')
  AND NOT EXISTS (SELECT 1 FROM despacho_etiquetas e WHERE e.lote_id = l.id AND (e.venta IS NULL OR e.venta NOT LIKE '20000999900001%'));
DELETE FROM despacho_etiquetas WHERE venta LIKE '20000999900001%';
DELETE FROM despacho_lotes WHERE id IN (SELECT id FROM demo_lotes);
DELETE FROM despacho_jornadas WHERE id IN (SELECT id FROM demo_jornadas);

-- Ventas
DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE ml_order_number LIKE '20000999900001%');
DELETE FROM inventory_movements WHERE reference LIKE '%20000999900001%';
DELETE FROM sales WHERE ml_order_number LIKE '20000999900001%';
DELETE FROM inventory WHERE product_id IN (SELECT id FROM products WHERE code LIKE 'DEMO-%');
DELETE FROM products WHERE code LIKE 'DEMO-%';
DELETE FROM ml_ordenes WHERE id BETWEEN 2000099990000101 AND 2000099990000105;

-- Config
DELETE FROM app_settings WHERE key = 'modo_demo';
DELETE FROM app_settings WHERE key = 'reportador_cuentas' AND value LIKE '%"filtro":"TIENDA DEMO"%';
DELETE FROM app_settings WHERE key = 'reportador_plantillas' AND value LIKE '%Tu pedido ya salió por ZOOM. Tu número de guía es {guia}%';
DELETE FROM app_settings WHERE key = 'reportador_bloque' AND value = ' Más productos en {pagina}';
COMMIT;
SELECT 'Demo borrada' AS listo;
