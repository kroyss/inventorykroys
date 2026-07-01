-- PREVIEW (solo lectura) del re-anclaje de precios VE — NO modifica nada.
-- Corré esto ANTES de la migración 020 para ver a qué escalón cae cada producto.
--   docker exec -i inventory_db_ve psql -U postgres -d inventory_ve < scripts/preview-reprice-ve.sql
--
-- Lógica idéntica a la 020: markup = base_price_usd (o sale_price) / total_cost - 1,
-- redondeado al escalón de 20 más cercano (empates hacia ARRIBA), clamp [20,120].

WITH r AS (
  SELECT
    p.code, p.name,
    pc.name                                                       AS cat_actual,
    pp.total_cost,
    COALESCE(NULLIF(pp.base_price_usd,0), NULLIF(inv.sale_price,0)) AS base_actual,
    GREATEST(20, LEAST(120,
      ROUND((((COALESCE(NULLIF(pp.base_price_usd,0), NULLIF(inv.sale_price,0)) / pp.total_cost - 1) * 100) / 20)::numeric) * 20
    ))::int AS tier
  FROM product_pricing pp
  JOIN products p            ON p.id = pp.product_id AND p.is_active = TRUE
  LEFT JOIN inventory inv    ON inv.product_id = pp.product_id
  LEFT JOIN profit_categories pc ON pc.id = pp.profit_category_id
  WHERE pp.total_cost > 0
    AND COALESCE(NULLIF(pp.base_price_usd,0), NULLIF(inv.sale_price,0)) IS NOT NULL
)
-- (1) Matriz resumen: de qué categoría venían → a cuál caen, con conteo.
SELECT
  cat_actual                                            AS "Categoría actual",
  CASE tier WHEN 120 THEN 'ULTRA 120' WHEN 100 THEN 'SUPER 100'
            WHEN 80  THEN 'ALTO 80'   WHEN 60  THEN 'MEDIO 60'
            WHEN 40  THEN 'BAJO 40'   WHEN 20  THEN 'REMATE 20' END AS "Nueva categoría",
  COUNT(*)                                              AS "Productos",
  ROUND(AVG((base_actual / total_cost - 1) * 100)::numeric, 1) AS "Markup prom. actual %",
  ROUND(SUM(total_cost * (1 + tier/100.0) - base_actual)::numeric, 2) AS "Δ Precio total $"
FROM r
GROUP BY cat_actual, tier
ORDER BY cat_actual, tier DESC;
