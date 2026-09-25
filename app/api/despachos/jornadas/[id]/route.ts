import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized } from '@/lib/session'
import { despachosForbidden } from '@/lib/despachos'

/** GET /api/despachos/jornadas/[id] — lotes impresos de una jornada con sus etiquetas (historial) */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  const denied = despachosForbidden(session)
  if (denied) return denied

  try {
    const { rows: lotes } = await db.query(`
      SELECT l.id, l.generated_at, l.label_count, l.page_count, u.username AS generated_by,
             COALESCE(JSON_AGG(JSON_BUILD_OBJECT(
               'id', e.id, 'venta', e.venta, 'guia', e.guia,
               'destinatario', e.destinatario, 'reimpresion', e.reimpresion
             ) ORDER BY e.id) FILTER (WHERE e.id IS NOT NULL), '[]'::json) AS etiquetas
      FROM despacho_lotes l
      LEFT JOIN users u ON u.id = l.generated_by
      LEFT JOIN despacho_etiquetas e ON e.lote_id = l.id AND e.impresa
      WHERE l.jornada_id = $1 AND l.status = 'GENERADO'
      GROUP BY l.id, u.username
      ORDER BY l.generated_at
    `, [id])
    return NextResponse.json({ lotes })
  } catch (err) {
    return apiError(err)
  }
}
