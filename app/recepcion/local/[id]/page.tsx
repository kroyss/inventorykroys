import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { notFound, redirect } from 'next/navigation'
import ReceptionPrint from '@/components/recepcion/ReceptionPrint'

export const metadata = { title: 'Lista de recepción' }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  const db = getDb(session.user.country)

  const { rows: [order] } = await db.query(`
    SELECT po.id, po.order_number, po.status, po.notes, po.created_at,
           po.total_usd::float AS total_usd,
           s.name AS supplier_name,
           COALESCE(
             JSON_AGG(
               JSON_BUILD_OBJECT(
                 'product_code',       p.code,
                 'product_name',       p.name,
                 'quantity',           poi.quantity,
                 'total_received_qty', poi.total_received_qty
               ) ORDER BY p.code
             ) FILTER (WHERE poi.id IS NOT NULL),
             '[]'::json
           ) AS items
    FROM purchase_orders po
    LEFT JOIN suppliers s ON po.supplier_id = s.id
    LEFT JOIN purchase_order_items poi ON po.id = poi.purchase_order_id
    LEFT JOIN products p ON poi.product_id = p.id
    WHERE po.id = $1 AND po.order_type = 'local'
    GROUP BY po.id, s.name
  `, [id])

  if (!order) notFound()

  return <ReceptionPrint order={order} country={session.user.country} kind="local" />
}
