import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { getInvoice } from '@/lib/invoicesServer'

// POST /api/invoices/[id]/void { reason } → anula SIN reemplazo (p.ej. se facturó la venta
// equivocada). La factura queda en la lista como ANULADA: el correlativo no se reutiliza.
// Para reimprimir en hoja nueva se usa POST /api/invoices con replaces_id.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (session.user.country !== 'VE') return forbidden()

  try {
    const { reason } = z.object({
      reason: z.string().trim().min(1, 'Indicá el motivo de la anulación'),
    }).parse(await req.json())

    const { rowCount } = await db.query(`
      UPDATE invoices SET status = 'ANULADA', void_reason = $2, voided_at = NOW(), voided_by = $3
      WHERE id = $1 AND status = 'EMITIDA'
    `, [id, reason, parseInt(session.user.id, 10)])
    if (!rowCount) return NextResponse.json({ error: 'La factura no existe o ya está anulada' }, { status: 409 })
    return NextResponse.json(await getInvoice(db, id))
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? err.message }, { status: 400 })
    return apiError(err)
  }
}
