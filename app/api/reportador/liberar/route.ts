import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { autenticarEquipo } from '@/lib/reportador'

/** POST /api/reportador/liberar — suelta lo que este equipo tenía reservado y no procesó
 *  (al detener o terminar), para que quede disponible de inmediato. */
export async function POST(req: NextRequest) {
  try {
    const auth = await autenticarEquipo(req)
    if ('error' in auth) return auth.error
    const { rowCount } = await auth.db.query(
      `UPDATE despacho_etiquetas SET reporte_tomado_por = NULL, reporte_tomado_at = NULL
       WHERE reporte_tomado_por = $1`, [auth.equipo.id])
    return NextResponse.json({ ok: true, liberados: rowCount })
  } catch (err) {
    return apiError(err)
  }
}
