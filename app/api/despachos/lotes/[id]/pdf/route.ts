import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized } from '@/lib/session'
import { descargaPdf, despachosForbidden } from '@/lib/despachos'

/** GET /api/despachos/lotes/[id]/pdf — PDF listo para imprimir (también para reimprimir) */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  const denied = despachosForbidden(session)
  if (denied) return denied

  try {
    const { rows: [l] } = await db.query(
      `SELECT output_path, label_count, to_char(generated_at, 'YYYYMMDD_HH24MI') AS sello
       FROM despacho_lotes WHERE id = $1 AND status = 'GENERADO'`, [id])
    if (!l) return NextResponse.json({ error: 'Lote no generado' }, { status: 404 })
    return descargaPdf(l.output_path, `Lote${id}_${l.label_count}etiquetas_${l.sello}.pdf`)
  } catch (err) {
    return apiError(err)
  }
}
