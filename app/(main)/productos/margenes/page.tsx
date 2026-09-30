import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { dbDeSesion } from '@/lib/session'
import { redirect } from 'next/navigation'
import MargenesClient from '@/components/productos/MargenesClient'
import type { Product, ProfitCategory } from '@/lib/types'

export const metadata = { title: 'Revisión de márgenes — Syncsora Inventory' }

export default async function MargenesPage() {
  const session = await getServerSession(authOptions)
  if (session?.user.role !== 'admin') redirect('/dashboard')
  // Depende de la tabla de MercadoEnvíos y de la fuga cambiaria: solo VE.
  if (session.user.country !== 'VE') redirect('/productos')

  const db = dbDeSesion(session)
  const [productsRes, catsRes] = await Promise.all([
    db.query(`
      SELECT
        p.id, p.code, p.name, p.is_active,
        COALESCE(pp.total_cost,             0)::float AS total_cost,
        COALESCE(pp.current_discount_percent,0)::float AS discount_percent,
        pc.name                                        AS category_name,
        COALESCE(pc.profit_percentage,      0)::float AS profit_percentage,
        pp.profit_category_id,
        p.weight_kg::float                             AS weight_kg,
        COALESCE(inv.sale_price,            0)::float AS sale_price,
        COALESCE(inv.quantity,              0)::int   AS quantity
      FROM products p
      LEFT JOIN product_pricing   pp  ON p.id = pp.product_id
      LEFT JOIN profit_categories pc  ON pp.profit_category_id = pc.id
      LEFT JOIN inventory         inv ON p.id = inv.product_id
      WHERE p.is_active = TRUE
      ORDER BY p.name
    `),
    db.query(`
      SELECT id, name, profit_percentage::float AS profit_percentage, color, description, display_order
      FROM profit_categories WHERE is_active = TRUE ORDER BY profit_percentage
    `),
  ])

  return (
    <MargenesClient
      initialProducts={productsRes.rows as Product[]}
      categories={catsRes.rows as ProfitCategory[]}
    />
  )
}
