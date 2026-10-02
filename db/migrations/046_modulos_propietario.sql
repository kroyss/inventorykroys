-- 046 · Módulos nuevos para lo que es propio de la organización de la plataforma (SolucionesMC):
--   descuento_ml   → descuento global sobre el exceso, tope por MercadoEnvíos, Márgenes < $5 (VE)
--   importaciones  → compras al exterior (pagos 50/100, fotos, aduana, contenedores)
--   analisis_stock → Reportes: Stock (reposición/declive/remate) y Conteos
-- Hasta ahora era núcleo (todas las empresas). Se prenden en las empresas de la organización 1;
-- los clientes quedan sin ellos y se les liberan en Plataforma → Empresas. Idempotente.
BEGIN;

UPDATE empresas e
SET modulos = (SELECT ARRAY(SELECT DISTINCT unnest(e.modulos || ARRAY['descuento_ml', 'importaciones', 'analisis_stock']) ORDER BY 1))
WHERE e.organizacion_id = 1
  AND NOT (e.modulos @> ARRAY['descuento_ml', 'importaciones', 'analisis_stock']);

COMMIT;
