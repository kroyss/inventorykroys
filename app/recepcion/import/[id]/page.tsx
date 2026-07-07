import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { notFound, redirect } from 'next/navigation'
import ReceptionPrint from '@/components/recepcion/ReceptionPrint'

export const metadata = { title: 'Lista de recepción · Importación' }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  const db = getDb(session.user.country)

  const { rows: [order] } = await db.query(`
    SELECT io.id, io.order_number, io.status, io.notes, io.created_at,
           io.total_usd::float        AS total_usd,
           io.tracking_number, io.origin_country, io.box_count,
           s.name AS supplier_name,
           COALESCE(
             JSON_AGG(
               JSON_BUILD_OBJECT(
                 'product_code',       p.code,
                 'product_name',       p.name,
                 'quantity',           ioi.quantity,
                 'total_received_qty', COALESCE(ioi.total_received_qty, 0)
               ) ORDER BY p.code
             ) FILTER (WHERE ioi.id IS NOT NULL),
             '[]'::json
           ) AS items
    FROM import_orders io
    LEFT JOIN suppliers s  ON io.supplier_id = s.id
    LEFT JOIN import_order_items ioi ON ioi.import_order_id = io.id
    LEFT JOIN products p ON p.id = ioi.product_id
    WHERE io.id = $1
    GROUP BY io.id, s.name
  `, [id])

  if (!order) notFound()

  // Fotos adjuntas (solo imágenes) — importantes para verificar la recepción.
  // El usuario normal solo ve las marcadas como visibles (no pagos ni internas).
  const visClause = session.user.role === 'admin' ? '' : 'AND visible_to_user = TRUE'
  const { rows: files } = await db.query(
    `SELECT id, file_name FROM import_order_files
     WHERE import_order_id = $1 AND COALESCE(file_type, '') LIKE 'image/%' ${visClause}
     ORDER BY id`,
    [id]
  )
  const photos = files.map(f => ({
    url:  `/api/imports/${id}/files/${f.id}/download`,
    name: f.file_name as string,
  }))

  return <ReceptionPrint order={order} country={session.user.country} kind="import" photos={photos} />
}
