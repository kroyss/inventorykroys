import { NextResponse } from 'next/server'
import { getSessionDb, unauthorized } from '@/lib/session'
import { leerReglas } from '@/lib/stockReglas'
import { nivelStockSQL } from '@/lib/nivelStock'

const inventorySQL = (ns: string) => `
  -- Ventas de 6 meses en una sola pasada (12-11): antes una subconsulta por producto (hasta 1,7 s).
  WITH v6 AS (
    SELECT si.product_id, SUM(si.quantity) AS q
    FROM sales s
    JOIN sale_items si ON s.id = si.sale_id
    WHERE s.status IN ('PROCESADA','DESCARGADA','DESCARGADA_LOCAL')
      AND s.created_at >= NOW() - INTERVAL '6 months'
    GROUP BY si.product_id
  ),
  v AS (
    SELECT
      p.id                                        AS product_id,
      p.code, p.name, p.is_active, p.stock_por_verificar,
      COALESCE(pp.base_cost,       0)::float      AS base_cost,
      COALESCE(pp.shipping_cost,   0)::float      AS shipping_cost,
      COALESCE(pp.total_cost,      0)::float      AS total_cost,
      COALESCE(pp.final_price_usd, 0)::float      AS final_price_usd,
      COALESCE(pp.ganancia_pct, pc.profit_percentage, 0)::float    AS profit_percentage,
      inv.id                                      AS inventory_id,
      COALESCE(inv.quantity,   0)::int            AS quantity,
      COALESCE(inv.min_stock,  0)::int            AS min_stock,
      COALESCE(inv.max_stock,  0)::int            AS max_stock,
      COALESCE(inv.sale_price, 0)::float          AS sale_price,
      inv.last_updated,
      COALESCE(v6.q, 0)::int AS ventas_6m,
      COALESCE(ns.min_rec, 0)::int AS min_stock_rec,
      COALESCE(ns.max_rec, 0)::int AS max_stock_rec,
      COALESCE(ns.min_ef, 0)::int  AS min_efectivo
    FROM products p
    LEFT JOIN v6 ON v6.product_id = p.id
    -- Fase 2 (18-11): el mínimo que se usa sale de las reglas de Reponer (lib/nivelStock.ts).
    LEFT JOIN ${ns} ns ON ns.product_id = p.id
    LEFT JOIN product_pricing pp  ON p.id = pp.product_id
    LEFT JOIN profit_categories pc ON pc.id = pp.profit_category_id
    LEFT JOIN inventory       inv ON p.id = inv.product_id
    -- Los productos desactivados solo se ven en el listado de Productos, no en Inventario.
    WHERE p.is_active = TRUE
  )
  SELECT
    *,
    CASE
      WHEN NOT is_active         THEN 'INACTIVO'
      WHEN quantity <= 0         THEN 'SIN_STOCK'
      WHEN min_efectivo > 0 AND quantity <= min_efectivo THEN 'BAJO'
      ELSE 'OK'
    END                                AS status
  FROM v
  ORDER BY
    CASE WHEN NOT is_active     THEN 3
         WHEN quantity <= 0     THEN 2
         WHEN min_efectivo > 0 AND quantity <= min_efectivo THEN 1
         ELSE 0
    END DESC,
    name
`

export async function GET() {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()

  const { reglas } = await leerReglas(db)
  const { rows } = await db.query(inventorySQL(nivelStockSQL(reglas)))
  return NextResponse.json(rows)
}
