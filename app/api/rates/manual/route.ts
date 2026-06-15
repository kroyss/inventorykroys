import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { z } from 'zod'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { calcSpreadAndDiscount } from '@/lib/rateUtils'

const Schema = z.object({
  official_rate: z.number().positive(),
  parallel_rate: z.number().positive(),
})

export async function POST(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (session.user.role !== 'admin') return forbidden()
  if (session.user.country !== 'VE') {
    return NextResponse.json({ error: 'Solo disponible para Venezuela' }, { status: 403 })
  }

  try {
    const { official_rate, parallel_rate } = Schema.parse(await req.json())

    if (parallel_rate < official_rate) {
      return NextResponse.json(
        { error: 'La tasa paralela debe ser mayor o igual a la oficial' },
        { status: 400 }
      )
    }

    const userId = parseInt(session.user.id, 10)

    // Inherit current excess_percentage
    const { rows: [last] } = await db.query(`
      SELECT excess_percentage FROM venezuela_exchange_rates
      ORDER BY rate_date DESC, created_at DESC LIMIT 1
    `)
    const excess = last ? parseFloat(last.excess_percentage) : 100.0
    const { spread, recommended_discount } = calcSpreadAndDiscount(official_rate, parallel_rate, excess)

    const { rows: [row] } = await db.query(`
      INSERT INTO venezuela_exchange_rates
        (rate_date, official_rate, parallel_rate, spread_percentage,
         recommended_discount, excess_percentage, source, created_by)
      VALUES (CURRENT_DATE, $1, $2, $3, $4, $5, 'manual', $6)
      RETURNING id
    `, [official_rate, parallel_rate, spread, recommended_discount, excess, userId])

    return NextResponse.json({
      id: row.id,
      message: 'Tasa guardada',
      official_rate,
      parallel_rate,
      spread_percentage:    spread,
      excess_percentage:    excess,
      recommended_discount,
    })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}
