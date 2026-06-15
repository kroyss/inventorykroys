import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { z } from 'zod'
import { getSessionDb, unauthorized } from '@/lib/session'

const Schema = z.object({
  notes: z.string(),
})

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()

  try {
    const { notes } = Schema.parse(await req.json())

    const { rows: [order] } = await db.query(`SELECT id FROM import_orders WHERE id = $1`, [id])
    if (!order) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })

    await db.query(
      `UPDATE import_orders SET notes=$1, updated_at=NOW() WHERE id=$2`,
      [notes, id]
    )
    return NextResponse.json({ ok: true, message: 'Notas guardadas' })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}
