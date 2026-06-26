import { NextRequest, NextResponse } from 'next/server'
import { getSessionDb, unauthorized } from '@/lib/session'

// Última TRM de Colombia (la alimenta el cron). Solo para sesiones CO.
export async function GET(_: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()

  if (session.user.country !== 'CO') {
    return NextResponse.json({ error: 'Solo disponible para Colombia' }, { status: 403 })
  }

  try {
    const { rows: [row] } = await db.query(`
      SELECT id, trm_rate::float AS trm_rate,
             to_char(rate_date, 'YYYY-MM-DD') AS rate_date, created_at, source
      FROM colombia_exchange_rates
      ORDER BY rate_date DESC, created_at DESC LIMIT 1
    `)
    if (!row) {
      return NextResponse.json({ trm_rate: 0, rate_date: null, source: 'default' })
    }
    return NextResponse.json(row)
  } catch {
    return NextResponse.json({ trm_rate: 0, rate_date: null, source: 'error' })
  }
}
