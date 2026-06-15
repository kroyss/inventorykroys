import { NextRequest, NextResponse } from 'next/server'
import { getSessionDb, unauthorized } from '@/lib/session'

export async function GET(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()

  const url   = new URL(req.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 500)

  const { rows } = await db.query(`
    SELECT
      im.id,
      p.code           AS product_code,
      p.name           AS product_name,
      im.movement_type,
      im.quantity,
      im.reference,
      im.notes,
      im.created_at,
      COALESCE(u.username, 'Sistema') AS username,
      i.quantity AS current_stock
    FROM inventory_movements im
    JOIN     products  p ON im.product_id  = p.id
    LEFT JOIN users    u ON im.created_by  = u.id
    LEFT JOIN inventory i ON im.product_id = i.product_id
    ORDER BY im.created_at DESC
    LIMIT $1
  `, [limit])

  return NextResponse.json(rows)
}
