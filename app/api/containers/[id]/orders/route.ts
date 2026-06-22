import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { z } from 'zod'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'

const Schema = z.object({
  add:    z.array(z.number().int().positive()).optional(),
  remove: z.array(z.number().int().positive()).optional(),
})

// Asigna / quita órdenes de importación a un contenedor.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (session.user.role !== 'admin') return forbidden()

  try {
    const b = Schema.parse(await req.json())
    await db.query('BEGIN')
    try {
      if (b.add?.length) {
        await db.query(`UPDATE import_orders SET container_id = $1 WHERE id = ANY($2::int[])`, [id, b.add])
      }
      if (b.remove?.length) {
        await db.query(`UPDATE import_orders SET container_id = NULL WHERE id = ANY($1::int[]) AND container_id = $2`, [b.remove, id])
      }
      // Refrescar updated_at del contenedor (su composición cambió)
      await db.query(`UPDATE import_containers SET updated_at = NOW() WHERE id = $1`, [id])
      await db.query('COMMIT')
    } catch (e) { await db.query('ROLLBACK'); throw e }
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}
