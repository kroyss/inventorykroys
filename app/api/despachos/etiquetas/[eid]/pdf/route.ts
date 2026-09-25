import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized } from '@/lib/session'
import { descargaPdf, despachosForbidden } from '@/lib/despachos'

/** GET /api/despachos/etiquetas/[eid]/pdf — el PDF ORIGINAL de Mercado Envíos, tal como se subió */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ eid: string }> }) {
  const { eid } = await params
  if (!/^\d+$/.test(eid)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  const denied = despachosForbidden(session)
  if (denied) return denied

  try {
    const { rows: [e] } = await db.query(
      `SELECT file_path, original_name, venta FROM despacho_etiquetas WHERE id = $1`, [eid])
    if (!e) return NextResponse.json({ error: 'Etiqueta no encontrada' }, { status: 404 })
    const nombre = e.venta ? `Etiqueta_${e.venta}.pdf` : e.original_name
    return await descargaPdf(e.file_path, nombre.replace(/"/g, ''))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json({ error: 'El archivo ya no está en el servidor' }, { status: 404 })
    }
    return apiError(err)
  }
}
