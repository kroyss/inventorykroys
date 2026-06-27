import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/db'
import InventarioClient from '@/components/inventario/InventarioClient'
import type { InventoryItem } from '@/lib/types'

export const metadata = { title: 'Inventario — Syncsora Inventory' }

export default async function InventarioPage() {
  const session = await getServerSession(authOptions)
  const db      = getDb(session!.user.country)

  const { rows } = await db.query(`
    WITH v AS (
      SELECT
        p.id                                        AS product_id,
        p.code, p.name, p.is_active,
        COALESCE(pp.base_cost,       0)::float      AS base_cost,
        COALESCE(pp.shipping_cost,   0)::float      AS shipping_cost,
        COALESCE(pp.total_cost,      0)::float      AS total_cost,
        COALESCE(pp.final_price_usd, 0)::float      AS final_price_usd,
        COALESCE(pc.profit_percentage, 0)::float    AS profit_percentage,
        inv.id                                      AS inventory_id,
        COALESCE(inv.quantity,   0)::int            AS quantity,
        COALESCE(inv.min_stock,  0)::int            AS min_stock,
        COALESCE(inv.max_stock,  0)::int            AS max_stock,
        COALESCE(inv.sale_price, 0)::float          AS sale_price,
        inv.last_updated,
        COALESCE((
          SELECT SUM(si.quantity)
          FROM sales s
          JOIN sale_items si ON s.id = si.sale_id
          WHERE si.product_id = p.id
            AND s.status IN ('PROCESADA','DESCARGADA','DESCARGADA_LOCAL')
            AND s.created_at >= NOW() - INTERVAL '6 months'
        ), 0)::int AS ventas_6m
      FROM products p
      LEFT JOIN product_pricing pp  ON p.id = pp.product_id
      LEFT JOIN profit_categories pc ON pc.id = pp.profit_category_id
      LEFT JOIN inventory       inv ON p.id = inv.product_id
    )
    SELECT
      *,
      CASE
        WHEN NOT is_active         THEN 'INACTIVO'
        WHEN quantity = 0          THEN 'SIN_STOCK'
        WHEN quantity <= min_stock THEN 'BAJO'
        ELSE 'OK'
      END                                AS status,
      ROUND(ventas_6m / 6.0 * 4)::int   AS min_stock_rec,
      ROUND(ventas_6m / 6.0 * 12)::int  AS max_stock_rec
    FROM v
    ORDER BY
      CASE WHEN NOT is_active         THEN 3
           WHEN quantity = 0          THEN 2
           WHEN quantity <= min_stock THEN 1
           ELSE 0
      END DESC,
      name
  `)

  return (
    <InventarioClient
      initialItems={rows as InventoryItem[]}
      userRole={session!.user.role}
      country={session!.user.country}
    />
  )
}
