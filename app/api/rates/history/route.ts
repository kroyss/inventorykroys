import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized } from '@/lib/session'
import { calcSpreadAndDiscount } from '@/lib/rateUtils'

export async function GET(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (session.user.country !== 'VE') {
    return NextResponse.json({ error: 'Solo disponible para Venezuela' }, { status: 403 })
  }

  const url   = new URL(req.url)
  const limit = parseInt(url.searchParams.get('limit') ?? '30', 10)

  try {
    const { rows } = await db.query(`
      SELECT id, to_char(rate_date, 'YYYY-MM-DD') AS rate_date,
             official_rate, parallel_rate, excess_percentage, source, created_at
      FROM venezuela_exchange_rates
      ORDER BY rate_date DESC, created_at DESC
      LIMIT $1
    `, [limit])

    return NextResponse.json(rows.map(r => {
      const official = parseFloat(r.official_rate)
      const parallel = parseFloat(r.parallel_rate)
      const excess   = parseFloat(r.excess_percentage)
      const { spread, recommended_discount } = calcSpreadAndDiscount(official, parallel, excess)
      return {
        id: r.id,
        rate_date:            r.rate_date,
        official_rate:        official,
        parallel_rate:        parallel,
        spread_percentage:    spread,
        excess_percentage:    excess,
        recommended_discount,
        source:               r.source,
        created_at:           r.created_at,
      }
    }))
  } catch (err) {
    return apiError(err)
  }
}
