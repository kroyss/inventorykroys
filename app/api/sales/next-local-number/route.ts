import { NextRequest, NextResponse } from 'next/server'
import { getSessionDb, unauthorized } from '@/lib/session'

export async function GET(_: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()

  try {
    const { rows } = await db.query(`
      SELECT ml_order_number FROM sales
      WHERE ml_order_number LIKE 'LOCAL-%'
      ORDER BY ml_order_number DESC LIMIT 1
    `)
    let nextNum = 1
    if (rows.length > 0) {
      const last = parseInt(rows[0].ml_order_number.replace('LOCAL-', ''), 10)
      if (!isNaN(last)) nextNum = last + 1
    }
    return NextResponse.json({ next_local: `LOCAL-${String(nextNum).padStart(6, '0')}` })
  } catch (err) {
    return NextResponse.json({ next_local: 'LOCAL-000001' })
  }
}
