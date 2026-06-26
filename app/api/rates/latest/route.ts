import { NextRequest, NextResponse } from 'next/server'
import { getSessionDb, unauthorized } from '@/lib/session'
import { calcSpreadAndDiscount } from '@/lib/rateUtils'

export async function GET(_: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()

  // Rates are VE-only — return a no-op for CO sessions
  if (session.user.country !== 'VE') {
    return NextResponse.json({ error: 'Solo disponible para Venezuela' }, { status: 403 })
  }

  try {
    const { rows: [row] } = await db.query(`
      SELECT id, official_rate, parallel_rate, excess_percentage,
             to_char(rate_date, 'YYYY-MM-DD') AS rate_date, created_at, source
      FROM venezuela_exchange_rates
      ORDER BY rate_date DESC, created_at DESC LIMIT 1
    `)

    if (!row) {
      return NextResponse.json({
        official_rate: 67.50, parallel_rate: 101.25,
        spread_percentage: 50.0, excess_percentage: 100.0,
        recommended_discount: 45.0, rate_date: null, source: 'default',
      })
    }

    const official = parseFloat(row.official_rate)
    const parallel = parseFloat(row.parallel_rate)
    const excess   = parseFloat(row.excess_percentage)
    const { spread, recommended_discount } = calcSpreadAndDiscount(official, parallel, excess)

    return NextResponse.json({
      id:                   row.id,
      official_rate:        official,
      parallel_rate:        parallel,
      spread_percentage:    spread,
      excess_percentage:    excess,
      recommended_discount,
      rate_date:            row.rate_date,
      created_at:           row.created_at,
      source:               row.source,
    })
  } catch {
    return NextResponse.json({
      official_rate: 67.50, parallel_rate: 101.25,
      spread_percentage: 50.0, excess_percentage: 100.0,
      recommended_discount: 45.0, rate_date: null, source: 'error',
    })
  }
}
