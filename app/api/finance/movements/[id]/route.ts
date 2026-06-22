import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { z } from 'zod'
import { getFinanceSession } from '@/lib/finance'
import { unauthorized, forbidden } from '@/lib/session'

const UpdateSchema = z.object({
  date:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  description: z.string().nullable().optional(),
  amount:      z.number().positive().optional(),
  kind:        z.enum(['income', 'expense']).optional(),
  currency:    z.enum(['USD', 'COP', 'VES']).optional(),
  category_id: z.number().int().positive().nullable().optional(),
  account_id:  z.number().int().positive().nullable().optional(),
  country:     z.enum(['VE', 'CO']).nullable().optional(),
})

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { session, db } = await getFinanceSession()
  if (!session || !db) return unauthorized()
  if (session.user.role !== 'admin') return forbidden()

  try {
    const b = UpdateSchema.parse(await req.json())
    // Solo movimientos manuales son editables (los 'auto' los maneja el sistema)
    const { rows: [mov] } = await db.query(`SELECT source FROM finance_movements WHERE id = $1`, [id])
    if (!mov) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    if (mov.source !== 'manual') return NextResponse.json({ error: 'Movimiento automático, no editable' }, { status: 400 })

    const fields: [string, unknown][] = []
    for (const k of ['date', 'description', 'amount', 'kind', 'currency', 'category_id', 'account_id', 'country'] as const) {
      if (b[k] !== undefined) fields.push([k, b[k]])
    }
    if (fields.length === 0) return NextResponse.json({ ok: true })
    const sets = fields.map(([c], i) => `${c} = $${i + 1}`).join(', ')
    const vals = fields.map(([, v]) => v)
    vals.push(id)
    await db.query(`UPDATE finance_movements SET ${sets} WHERE id = $${vals.length}`, vals)
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
    const { rows: [mov] } = await db.query(`SELECT source FROM finance_movements WHERE id = $1`, [id])
    if (!mov) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    if (mov.source !== 'manual') return NextResponse.json({ error: 'Movimiento automático, no eliminable' }, { status: 400 })
    await db.query(`DELETE FROM finance_movements WHERE id = $1`, [id])
    return NextResponse.json({ ok: true })
  } catch (err) {
    return apiError(err)
  }
}
