import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { redirect } from 'next/navigation'
import ProductosClient from '@/components/productos/ProductosClient'
import type { Product, ProfitCategory } from '@/lib/types'

export const metadata = { title: 'Productos — Syncsora Inventory' }

export default async function ProductosPage() {
  const session = await getServerSession(authOptions)
  if (session?.user.role !== 'admin') redirect('/dashboard')

  const db = getDb(session.user.country)
  const [productsRes, catsRes] = await Promise.all([
    db.query(`
      SELECT
        p.id, p.code, p.name, p.is_active,
        COALESCE(pp.base_cost,              0)::float AS base_cost,
        COALESCE(pp.shipping_cost,          0)::float AS shipping_cost,
        COALESCE(pp.total_cost,             0)::float AS total_cost,
        COALESCE(pp.base_price_usd,         0)::float AS base_price_usd,
        COALESCE(pp.published_price_usd,    0)::float AS published_price_usd,
        COALESCE(pp.final_price_usd,        0)::float AS final_price_usd,
        COALESCE(pp.price_bolivares,        0)::float AS price_bolivares,
        COALESCE(pp.current_discount_percent,0)::float AS discount_percent,
        pc.name                                        AS category_name,
        COALESCE(pc.profit_percentage,      0)::float AS profit_percentage,
        pp.profit_category_id,
        COALESCE(inv.sale_price,            0)::float AS sale_price,
        COALESCE(inv.quantity,              0)::int   AS quantity
      FROM products p
      LEFT JOIN product_pricing   pp  ON p.id = pp.product_id
      LEFT JOIN profit_categories pc  ON pp.profit_category_id = pc.id
      LEFT JOIN inventory         inv ON p.id = inv.product_id
      ORDER BY p.is_active DESC, p.name
    `),
    db.query(`
      SELECT id, name, profit_percentage, color, description, display_order
      FROM profit_categories WHERE is_active = TRUE ORDER BY display_order
    `),
  ])

  return (
    <ProductosClient
      initialProducts={productsRes.rows as Product[]}
      profitCategories={catsRes.rows as ProfitCategory[]}
      country={session.user.country}
    />
  )
}
