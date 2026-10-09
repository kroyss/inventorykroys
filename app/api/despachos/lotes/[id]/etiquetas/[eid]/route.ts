import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized } from '@/lib/session'
import { despachosForbidden } from '@/lib/despachos'

// incluida: incluir/excluir del PDF · forzar_pago: "Despachar igual" con el pago sin verificar (Pagos ME)
const Schema = z.object({ incluida: z.boolean().optional(), forzar_pago: z.boolean().optional() })

/** PATCH /api/despachos/lotes/[id]/etiquetas/[eid] — incluir/excluir una etiqueta de un lote pendiente, o "Despachar igual" */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; eid: string }> }) {
  const { id, eid } = await params
  if (!/^\d+$/.test(id) || !/^\d+$/.test(eid)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  const denied = despachosForbidden(session)
  if (denied) return denied

  try {
    const b = Schema.parse(await req.json())
    const userId = parseInt(session.user.id, 10)
    const { rowCount } = await db.query(
      `UPDATE despacho_etiquetas e SET
         incluida = COALESCE($1, e.incluida),
         pago_forzado_por = CASE WHEN $4::boolean IS NULL THEN e.pago_forzado_por WHEN $4 THEN $5::int ELSE NULL END,
         pago_forzado_at  = CASE WHEN $4::boolean IS NULL THEN e.pago_forzado_at  WHEN $4 THEN NOW() ELSE NULL END
       FROM despacho_lotes l
       WHERE e.id = $2 AND e.lote_id = $3 AND l.id = e.lote_id AND l.status = 'PENDIENTE'`,
      [b.incluida ?? null, eid, id, b.forzar_pago ?? null, userId])
    if (!rowCount) return NextResponse.json({ error: 'Etiqueta no encontrada en un lote pendiente' }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}
