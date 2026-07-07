import { NextRequest, NextResponse } from 'next/server'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'

// Transportistas (nombre de empresa de envío) ya usados en importaciones —
// autocompletado del campo libre, igual patrón que /api/sales/customers.
export async function GET(_: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (session.user.role !== 'admin') return forbidden()

  const { rows } = await db.query(`
    SELECT shipping_company AS name
    FROM import_orders
    WHERE shipping_company IS NOT NULL AND TRIM(shipping_company) <> ''
    GROUP BY shipping_company
    ORDER BY MAX(updated_at) DESC
    LIMIT 200
  `)
  return NextResponse.json(rows.map((r, i) => ({ id: i + 1, name: r.name })))
}
