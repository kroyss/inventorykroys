import { NextRequest, NextResponse } from 'next/server'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'

export async function GET(_: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (session.user.role !== 'admin') return forbidden()

  const { rows } = await db.query(`
    SELECT
      p.id, p.code, p.name, p.is_active,
      COALESCE(i.quantity, 0)         AS quantity,
      COALESCE(pp.final_price_usd, 0) AS price,
      COALESCE(pp.base_cost, 0)       AS cost,
      (SELECT COUNT(*) FROM sale_items si WHERE si.product_id = p.id)          AS sales_count,
      (SELECT COUNT(*) FROM purchase_order_items poi WHERE poi.product_id = p.id) AS purchase_count
    FROM products p
    LEFT JOIN inventory i          ON i.product_id = p.id
    LEFT JOIN product_pricing pp   ON pp.product_id = p.id
    WHERE COALESCE(i.quantity, 0) = 0
      AND p.is_active = TRUE
    ORDER BY p.name
  `)

  return NextResponse.json(rows.map(r => ({
    id:             r.id,
    code:           r.code,
    name:           r.name,
    is_active:      r.is_active,
    quantity:       parseInt(r.quantity, 10) || 0,
    price:          parseFloat(r.price) || 0,
    cost:           parseFloat(r.cost) || 0,
    sales_count:    parseInt(r.sales_count, 10) || 0,
    purchase_count: parseInt(r.purchase_count, 10) || 0,
  })))
}
