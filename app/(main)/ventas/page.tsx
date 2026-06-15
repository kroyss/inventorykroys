import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/db'
import VentasClient from '@/components/ventas/VentasClient'
import type { InventoryItem } from '@/lib/types'

export const metadata = { title: 'Ventas — Syncsora Inventory' }

export default async function VentasPage() {
  const session = await getServerSession(authOptions)
  const db      = getDb(session!.user.country)

  // Sales are fetched client-side with server pagination (10/page) via /api/sales.
  // Here we only load the active product list for the create/edit form.
  const productsRes = await db.query(`
    SELECT
      p.id AS product_id, p.code, p.name, p.is_active,
      COALESCE(inv.quantity, 0)::int AS quantity,
      COALESCE(inv.sale_price, pp.final_price_usd, 0)::float AS sale_price,
      COALESCE(pp.final_price_usd, 0)::float AS final_price_usd
    FROM products p
    LEFT JOIN inventory inv ON p.id = inv.product_id
    LEFT JOIN product_pricing pp ON p.id = pp.product_id
    WHERE p.is_active = TRUE
    ORDER BY p.name
  `)

  return (
    <VentasClient
      products={productsRes.rows as InventoryItem[]}
      userRole={session!.user.role}
    />
  )
}
