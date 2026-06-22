import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { z } from 'zod'
import { getFinanceSession } from '@/lib/finance'
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

  const { rows } = await db.query(`
    SELECT m.id, m.date, m.description, m.amount::float AS amount, m.kind, m.currency,
           m.category_id, c.name AS category_name,
           m.account_id,  a.name AS account_name,
           m.country, m.source, m.ref_type, m.ref_id, m.created_by, m.created_at
    FROM finance_movements m
    LEFT JOIN finance_categories c ON c.id = m.category_id
    LEFT JOIN finance_accounts   a ON a.id = m.account_id
    WHERE to_char(m.date, 'YYYY-MM') = $1
    ORDER BY m.date DESC, m.id DESC
  `, [month])
  return NextResponse.json({ month, rows })
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
