import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { z } from 'zod'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'

const Schema = z.object({
  visible_ids: z.array(z.number().int().positive()),
})

// Setea qué fotos de la importación ve el usuario normal (solo admin). Marca
// como visibles las de `visible_ids` y oculta el resto, en una sola pasada.
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (session.user.role !== 'admin') return forbidden()

  try {
    const { visible_ids } = Schema.parse(await req.json())
    await db.query(
      `UPDATE import_order_files
       SET visible_to_user = (id = ANY($2::int[]))
       WHERE import_order_id = $1`,
      [id, visible_ids]
    )
    return NextResponse.json({ ok: true, visible: visible_ids.length })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}
