import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { z } from 'zod'
import { getFinanceSession } from '@/lib/finance'
import { getMonthlyMovements } from '@/lib/financeData'
import { unauthorized, forbidden } from '@/lib/session'

const MONTH_RE = /^\d{4}-\d{2}$/

const MovementSchema = z.object({
  date:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().optional(),
  amount:      z.number().positive(),
  kind:        z.enum(['income', 'expense']),
  currency:    z.enum(['USD', 'COP', 'VES']).default('USD'),
  category_id: z.number().int().positive().nullable().optional(),
  account_id:  z.number().int().positive().nullable().optional(),
  country:     z.enum(['VE', 'CO']).nullable().optional(),
})

export async function GET(req: NextRequest) {
  const { session, db } = await getFinanceSession()
  if (!session || !db) return unauthorized()
  if (session.user.role !== 'admin') return forbidden()

  const monthRaw = new URL(req.url).searchParams.get('month') ?? ''
  const month = MONTH_RE.test(monthRaw)
    ? monthRaw
    : new Date().toISOString().slice(0, 7) // YYYY-MM actual

  // Libro unificado: compras/importaciones (auto) + ventas + movimientos manuales
  const data = await getMonthlyMovements(month)
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const { session, db } = await getFinanceSession()
  if (!session || !db) return unauthorized()
  if (session.user.role !== 'admin') return forbidden()

  try {
    const b = MovementSchema.parse(await req.json())
    const userId = parseInt(session.user.id, 10)
    const { rows: [row] } = await db.query(`
      INSERT INTO finance_movements
        (date, description, amount, kind, currency, category_id, account_id, country, source, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'manual', $9)
      RETURNING id
    `, [b.date, b.description ?? null, b.amount, b.kind, b.currency,
        b.category_id ?? null, b.account_id ?? null, b.country ?? null, userId])
    return NextResponse.json({ id: row.id }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}
