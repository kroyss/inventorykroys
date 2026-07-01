import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { z } from 'zod'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'

// Guarda el tracking y/o el contenedor SIN cambiar el estado. Sirve para
// completar por tandas: a veces primero llega el tracking y días después el
// contenedor. Así el dato queda guardado y solo se avanza a tránsito cuando
// están ambos (+ foto). Solo admin.
const Schema = z.object({
  tracking_number: z.string().trim().nullable().optional(),
  container_id:    z.number().int().positive().nullable().optional(),
})

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
    const body = Schema.parse(await req.json())

    const sets: string[] = []
    const vals: unknown[] = []
    if (body.tracking_number !== undefined) {
      sets.push(`tracking_number=$${vals.length + 1}`)
      vals.push(body.tracking_number || null)
    }
    if (body.container_id !== undefined) {
      sets.push(`container_id=$${vals.length + 1}`)
      vals.push(body.container_id)
    }
    if (sets.length === 0) return NextResponse.json({ ok: true })

    vals.push(id)
    await db.query(
      `UPDATE import_orders SET ${sets.join(', ')}, updated_at=NOW() WHERE id=$${vals.length}`,
      vals
    )
    return NextResponse.json({ ok: true, message: 'Datos de envío guardados' })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}
