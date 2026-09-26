import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized } from '@/lib/session'
import { despachosForbidden } from '@/lib/despachos'

/** GET /api/despachos/jornadas/[id]/reporte — estado del reporte de cada envío de la jornada */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  const denied = despachosForbidden(session)
  if (denied) return denied

  try {
    const { rows } = await db.query(
      `SELECT e.id, e.venta, e.guia, e.remitente, e.destinatario, e.reimpresion,
              e.reporte_estado, e.reporte_detalle, e.reporte_intentos, e.reportado_at
       FROM despacho_etiquetas e
       JOIN despacho_lotes l ON l.id = e.lote_id
       WHERE l.jornada_id = $1 AND l.status = 'GENERADO' AND e.impresa
       ORDER BY l.generated_at, e.original_name, e.id`, [id])
    return NextResponse.json(rows)
  } catch (err) {
    return apiError(err)
  }
}
