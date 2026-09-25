import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized } from '@/lib/session'
import { despachosForbidden } from '@/lib/despachos'

const Schema = z.object({ incluida: z.boolean() })

/** PATCH /api/despachos/lotes/[id]/etiquetas/[eid] — incluir/excluir una etiqueta de un lote pendiente */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; eid: string }> }) {
  const { id, eid } = await params
  if (!/^\d+$/.test(id) || !/^\d+$/.test(eid)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  const denied = despachosForbidden(session)
  if (denied) return denied

  try {
    const { incluida } = Schema.parse(await req.json())
    const { rowCount } = await db.query(
      `UPDATE despacho_etiquetas e SET incluida = $1
       FROM despacho_lotes l
       WHERE e.id = $2 AND e.lote_id = $3 AND l.id = e.lote_id AND l.status = 'PENDIENTE'`,
      [incluida, eid, id])
    if (!rowCount) return NextResponse.json({ error: 'Etiqueta no encontrada en un lote pendiente' }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}
