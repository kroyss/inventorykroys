import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { z } from 'zod'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'

const Schema = z.object({
  excess_percentage: z.number().min(0).max(500),
})

export async function PUT(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (session.user.role !== 'admin') return forbidden()
  if (session.user.country !== 'VE') {
    return NextResponse.json({ error: 'Solo disponible para Venezuela' }, { status: 403 })
  }

  try {
    const { excess_percentage } = Schema.parse(await req.json())

    // Update only the most recent record
    await db.query(`
      UPDATE venezuela_exchange_rates SET excess_percentage = $1
      WHERE id = (
        SELECT id FROM venezuela_exchange_rates
        ORDER BY rate_date DESC, created_at DESC LIMIT 1
      )
    `, [excess_percentage])

    return NextResponse.json({ message: `Precio exceso actualizado a ${excess_percentage}%` })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}
