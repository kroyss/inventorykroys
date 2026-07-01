-- 020 · Re-anclar productos de VE al escalón de markup más cercano (escala nueva de 20)
--        y alinear Precio base / P.Venta / Precio ML publicado.  *** SOLO VE ***
--
-- Problema: la migración 019 subió el % de cada categoría PERO no re-preció los
-- productos, así que la base guardada (y el P.Venta de inventario) quedaron viejos
-- y ULTRA quedó inflada a 120 cuando en realidad esos productos eran de 100%.
--
-- Este re-precio, por producto activo:
--   markup_actual = base_price_usd (o sale_price) / total_cost - 1
--   tier          = clamp( ROUND(markup/20)*20 , 20 , 120 )   → {20,40,60,80,100,120}
--                   (empates hacia ARRIBA: 50→60, 30→40, 90→100, 110→120 — protege margen)
--     20 REMATE · 40 BAJO · 60 MEDIO · 80 ALTO · 100 SUPER · 120 ULTRA
--   reasigna profit_category_id al tier y recalcula (fórmulas idénticas al app):
--     base      = total_cost × (1 + tier/100)
--     published = base × (1 + exceso/100)          exceso = venezuela_exchange_rates más reciente
--     final     = published × (1 - descuento/100)  descuento = current_discount_percent (SE CONSERVA)
--     sale_price= base                              (VE: el inventario sigue al Precio base)
--   price_bolivares NO se toca (el app tampoco lo guarda; se calcula en vivo).
--
-- Solo productos ACTIVOS con total_cost > 0 y un precio de referencia > 0. Los
-- "Sin Asignación" sin precio y los inactivos se dejan intactos.
--
-- Idempotente: tras correr, base = costo×tier ⇒ markup = tier ⇒ vuelve al mismo tier.
-- Correr SOLO en inventory_ve (CO usa pesos/TRM, lógica distinta).

DO $$
DECLARE
  v_excess numeric;
BEGIN
  SELECT COALESCE(excess_percentage, 0) INTO v_excess
  FROM venezuela_exchange_rates
  ORDER BY rate_date DESC, created_at DESC
  LIMIT 1;
  IF v_excess IS NULL THEN v_excess := 0; END IF;

  CREATE TEMP TABLE _reprice ON COMMIT DROP AS
  SELECT
    pp.product_id,
    t.tier,
    ROUND((pp.total_cost * (1 + t.tier/100.0))::numeric, 2)            AS base,
    COALESCE(pp.current_discount_percent, 0)                           AS disc,
    (SELECT id FROM profit_categories WHERE name = CASE t.tier
        WHEN 120 THEN 'ULTRA' WHEN 100 THEN 'SUPER' WHEN 80 THEN 'ALTO'
        WHEN 60  THEN 'MEDIO' WHEN 40  THEN 'BAJO'  WHEN 20 THEN 'REMATE'
      END LIMIT 1)                                                     AS cat_id
  FROM product_pricing pp
  JOIN products p         ON p.id = pp.product_id AND p.is_active = TRUE
  LEFT JOIN inventory inv ON inv.product_id = pp.product_id
  CROSS JOIN LATERAL (
    SELECT GREATEST(20, LEAST(120,
      ROUND((((COALESCE(NULLIF(pp.base_price_usd,0), NULLIF(inv.sale_price,0)) / pp.total_cost - 1) * 100) / 20)::numeric) * 20
    ))::int AS tier
  ) t
  WHERE pp.total_cost > 0
    AND COALESCE(NULLIF(pp.base_price_usd,0), NULLIF(inv.sale_price,0)) IS NOT NULL;

  UPDATE product_pricing pp SET
    profit_category_id  = r.cat_id,
    base_price_usd      = r.base,
    published_price_usd = ROUND((r.base * (1 + v_excess/100.0))::numeric, 2),
    final_price_usd     = ROUND((r.base * (1 + v_excess/100.0) * (1 - r.disc/100.0))::numeric, 2)
  FROM _reprice r
  WHERE pp.product_id = r.product_id AND r.cat_id IS NOT NULL;

  UPDATE inventory inv SET
    sale_price = r.base
  FROM _reprice r
  WHERE inv.product_id = r.product_id;

  RAISE NOTICE 'Reprice VE: % productos re-anclados (exceso=%%).',
    (SELECT COUNT(*) FROM _reprice), v_excess;
END $$;
