import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { z } from 'zod'
import { getFinanceSession } from '@/lib/finance'
import { unauthorized, forbidden } from '@/lib/session'

const AccountSchema = z.object({
  name:          z.string().min(1).max(120),
  type:          z.enum(['banco', 'efectivo', 'cripto', 'paypal', 'otro']).default('banco'),
  currency:      z.enum(['USD', 'COP', 'VES']).default('USD'),
  balance:       z.number().default(0),
  is_reserve:    z.boolean().default(false),
  display_order: z.number().int().default(0),
  notes:         z.string().optional(),
})

export async function GET(_: NextRequest) {
  const { session, db } = await getFinanceSession()
  if (!session || !db) return unauthorized()
  if (session.user.role !== 'admin') return forbidden()

  const { rows } = await db.query(`
    SELECT id, name, type, currency, balance::float AS balance,
           is_reserve, is_active, display_order, notes
    FROM finance_accounts
    WHERE is_active = TRUE
    ORDER BY is_reserve, display_order, name
  `)
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const { session, db } = await getFinanceSession()
  if (!session || !db) return unauthorized()
  if (session.user.role !== 'admin') return forbidden()

  try {
    const b = AccountSchema.parse(await req.json())
    const { rows: [row] } = await db.query(`
      INSERT INTO finance_accounts (name, type, currency, balance, is_reserve, display_order, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `, [b.name, b.type, b.currency, b.balance, b.is_reserve, b.display_order, b.notes ?? null])
    return NextResponse.json({ id: row.id }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}
