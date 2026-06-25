-- 012 · Fix total_cost en CO (SOLO DB CO)
-- El backfill 011 convirtió base_cost/shipping_cost a USD esperando que el trigger
-- trg_update_pricing_totals recalculara total_cost, pero ese trigger NO existe en
-- la DB de CO → total_cost quedó con el valor viejo en pesos.
-- Aquí se fuerza el invariante total_cost = base_cost + shipping_cost (ambos ya en USD).
-- Idempotente: total_cost = base+shipping siempre da el mismo resultado.
-- NO correr en VE (allí el trigger ya mantiene total_cost).

UPDATE product_pricing
SET total_cost = ROUND(COALESCE(base_cost, 0) + COALESCE(shipping_cost, 0), 2);
