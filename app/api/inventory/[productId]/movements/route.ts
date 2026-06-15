import { NextRequest, NextResponse } from 'next/server'
import { getSessionDb, unauthorized } from '@/lib/session'

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  const { productId } = await params
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()

  const { rows } = await db.query(`
    WITH all_movements AS (
      SELECT
        im.id,
        im.movement_type,
        im.quantity,
        im.reference,
        im.notes,
        im.created_at,
        COALESCE(u.username, 'Sistema') AS username,
        -- inventory_movements.quantity is stored SIGNED (legacy convention):
        -- IN = +qty, OUT = -qty, ADJUST = delta. Running total is a simple cumulative sum.
        SUM(im.quantity) OVER (ORDER BY im.id) AS running_total
      FROM inventory_movements im
      LEFT JOIN users u ON im.created_by = u.id
      WHERE im.product_id = $1
    )
    SELECT * FROM all_movements ORDER BY id DESC LIMIT 100
  `, [productId])
  return NextResponse.json(rows)
}
