import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { despachosForbidden } from '@/lib/despachos'

/** DELETE /api/despachos/reportador/equipos/[id] — desvincula un equipo (su token deja de servir) */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  const denied = despachosForbidden(session)
  if (denied) return denied
  if (session.user.role !== 'admin') return forbidden()

  try {
    await db.query(`UPDATE reportador_equipos SET revocado_at = NOW() WHERE id = $1`, [id])
    // Lo que tenía reservado vuelve a la cola.
    await db.query(
      `UPDATE despacho_etiquetas SET reporte_tomado_por = NULL, reporte_tomado_at = NULL
       WHERE reporte_tomado_por = $1`, [id])
    return NextResponse.json({ ok: true })
  } catch (err) {
    return apiError(err)
  }
}
