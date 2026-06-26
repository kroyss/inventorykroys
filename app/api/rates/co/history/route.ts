import { NextRequest, NextResponse } from 'next/server'
import { getSessionDb, unauthorized } from '@/lib/session'

// Historial de TRM (Colombia). Solo sesiones CO.
export async function GET(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (session.user.country !== 'CO') {
    return NextResponse.json({ error: 'Solo disponible para Colombia' }, { status: 403 })
  }

  const limitParam = parseInt(new URL(req.url).searchParams.get('limit') ?? '365', 10)
  const limit = Math.min(Math.max(isNaN(limitParam) ? 365 : limitParam, 1), 1000)

  try {
    const { rows } = await db.query(
      `SELECT id, trm_rate::float AS trm_rate,
              to_char(rate_date, 'YYYY-MM-DD') AS rate_date, source
       FROM colombia_exchange_rates
       ORDER BY rate_date DESC, created_at DESC
       LIMIT $1`,
      [limit]
    )
    return NextResponse.json(rows)
  } catch {
    return NextResponse.json([])
  }
}
