import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized } from '@/lib/session'
import { descargaPdf, despachosForbidden } from '@/lib/despachos'

/** GET /api/despachos/jornadas/[id]/manifiesto?transportista=ZOOM|TEALCA — PDF del manifiesto de una
 *  jornada cerrada (ZOOM por defecto: es el de todas las jornadas anteriores). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  const denied = despachosForbidden(session)
  if (denied) return denied

  try {
    const tealca = req.nextUrl.searchParams.get('transportista') === 'TEALCA'
    const { rows: [j] } = await db.query(
      `SELECT manifest_path, manifest_tealca_path, to_char(closed_at, 'YYYY-MM-DD_HH24MISS') AS sello
       FROM despacho_jornadas WHERE id = $1 AND status = 'CERRADA'`, [id])
    const ruta = tealca ? j?.manifest_tealca_path : j?.manifest_path
    if (!ruta) return NextResponse.json({ error: `Jornada sin manifiesto${tealca ? ' Tealca' : ''}` }, { status: 404 })
    return descargaPdf(ruta, `MANIFIESTO${tealca ? '_TEALCA' : ''}_${j.sello}.pdf`)
  } catch (err) {
    return apiError(err)
  }
}
