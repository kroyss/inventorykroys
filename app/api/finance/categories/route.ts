import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { z } from 'zod'
import { getFinanceSession } from '@/lib/finance'
import { unauthorized, forbidden } from '@/lib/session'

export async function GET(_: NextRequest) {
  const { session, db } = await getFinanceSession()
  if (!session || !db) return unauthorized()
  if (session.user.role !== 'admin') return forbidden()

  const { rows } = await db.query(`
    SELECT id, name, kind, is_active, display_order
    FROM finance_categories
    WHERE is_active = TRUE
    ORDER BY kind, display_order, name
  `)
  return NextResponse.json(rows)
}

const CreateSchema = z.object({
  name: z.string().min(1).max(60),
  kind: z.enum(['income', 'expense']),
})

// Crear categoría (o reactivar si ya existía con ese nombre+tipo). Para el
// combobox dinámico de movimientos: si no existe, se crea al vuelo.
export async function POST(req: NextRequest) {
  const { session, db } = await getFinanceSession()
  if (!session || !db) return unauthorized()
  if (session.user.role !== 'admin') return forbidden()

  try {
    const { name, kind } = CreateSchema.parse(await req.json())
    const clean = name.trim()

    const { rows: [ex] } = await db.query(
      `SELECT id, is_active FROM finance_categories WHERE lower(name)=lower($1) AND kind=$2 LIMIT 1`,
      [clean, kind]
    )
    if (ex) {
      if (!ex.is_active) await db.query(`UPDATE finance_categories SET is_active=TRUE WHERE id=$1`, [ex.id])
      return NextResponse.json({ id: ex.id, name: clean, kind })
    }

    const { rows: [row] } = await db.query(
      `INSERT INTO finance_categories (name, kind, is_active, display_order)
       VALUES ($1, $2, TRUE, COALESCE((SELECT MAX(display_order)+1 FROM finance_categories WHERE kind=$2), 0))
       RETURNING id`,
      [clean, kind]
    )
    return NextResponse.json({ id: row.id, name: clean, kind }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}
