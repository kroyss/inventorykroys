import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { z } from 'zod'
import { getFinanceSession } from '@/lib/finance'
import { unauthorized, forbidden } from '@/lib/session'

const UpdateSchema = z.object({
  name:          z.string().min(1).max(120).optional(),
  type:          z.enum(['banco', 'efectivo', 'cripto', 'paypal', 'otro']).optional(),
  currency:      z.enum(['USD', 'COP', 'VES']).optional(),
  balance:       z.number().optional(),
  is_reserve:    z.boolean().optional(),
  display_order: z.number().int().optional(),
  notes:         z.string().nullable().optional(),
})

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { session, db } = await getFinanceSession()
  if (!session || !db) return unauthorized()
  if (session.user.role !== 'admin') return forbidden()

  try {
    const b = UpdateSchema.parse(await req.json())
    const fields: [string, unknown][] = []
    if (b.name          !== undefined) fields.push(['name',          b.name])
    if (b.type          !== undefined) fields.push(['type',          b.type])
    if (b.currency      !== undefined) fields.push(['currency',      b.currency])
    if (b.balance       !== undefined) fields.push(['balance',       b.balance])
    if (b.is_reserve    !== undefined) fields.push(['is_reserve',    b.is_reserve])
    if (b.display_order !== undefined) fields.push(['display_order', b.display_order])
    if (b.notes         !== undefined) fields.push(['notes',         b.notes])
    if (fields.length === 0) return NextResponse.json({ ok: true })

    const sets = fields.map(([c], i) => `${c} = $${i + 1}`).join(', ')
    const vals = fields.map(([, v]) => v)
    vals.push(id)
    await db.query(`UPDATE finance_accounts SET ${sets} WHERE id = $${vals.length}`, vals)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { session, db } = await getFinanceSession()
  if (!session || !db) return unauthorized()
  if (session.user.role !== 'admin') return forbidden()

  try {
    // Soft delete: si tiene movimientos, se desactiva; si no, se borra.
    const { rows: [m] } = await db.query(
      `SELECT COUNT(*)::int AS n FROM finance_movements WHERE account_id = $1`, [id]
    )
    if (m.n > 0) {
      await db.query(`UPDATE finance_accounts SET is_active = FALSE WHERE id = $1`, [id])
    } else {
      await db.query(`DELETE FROM finance_accounts WHERE id = $1`, [id])
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return apiError(err)
  }
}
