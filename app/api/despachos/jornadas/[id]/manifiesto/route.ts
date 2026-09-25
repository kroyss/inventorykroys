import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized } from '@/lib/session'
import { descargaPdf, despachosForbidden } from '@/lib/despachos'

/** GET /api/despachos/jornadas/[id]/manifiesto — PDF del manifiesto de una jornada cerrada */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  const denied = despachosForbidden(session)
  if (denied) return denied

  try {
    const { rows: [j] } = await db.query(
      `SELECT manifest_path, to_char(closed_at, 'YYYY-MM-DD_HH24MISS') AS sello
       FROM despacho_jornadas WHERE id = $1 AND status = 'CERRADA'`, [id])
    if (!j?.manifest_path) return NextResponse.json({ error: 'Jornada sin manifiesto' }, { status: 404 })
    return descargaPdf(j.manifest_path, `MANIFIESTO_${j.sello}.pdf`)
  } catch (err) {
    return apiError(err)
  }
}
