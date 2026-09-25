import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized } from '@/lib/session'
import { despachosForbidden, etiquetasValidadas, IMPRIMIBLE } from '@/lib/despachos'

/** GET /api/despachos/lotes/[id] — lote con sus etiquetas validadas contra las ventas actuales */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  const denied = despachosForbidden(session)
  if (denied) return denied

  try {
    const { rows: [lote] } = await db.query(
      `SELECT l.id, l.status, l.jornada_id, l.created_at, l.generated_at, l.label_count, l.page_count,
              uc.username AS created_by, ug.username AS generated_by
       FROM despacho_lotes l
       LEFT JOIN users uc ON uc.id = l.created_by
       LEFT JOIN users ug ON ug.id = l.generated_by
       WHERE l.id = $1`, [id])
    if (!lote) return NextResponse.json({ error: 'Lote no encontrado' }, { status: 404 })

    const etiquetas = await etiquetasValidadas(db, lote.id)
    const imprimibles = etiquetas.filter(e => e.incluida && IMPRIMIBLE[e.estado]).length
    return NextResponse.json({
      ...lote,
      imprimibles,
      etiquetas: etiquetas.map(({ file_path: _f, sha256: _s, ...e }) => e),
    })
  } catch (err) {
    return apiError(err)
  }
}

/** DELETE /api/despachos/lotes/[id] — descarta un lote PENDIENTE (no se imprimió nada) */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  const denied = despachosForbidden(session)
  if (denied) return denied

  try {
    const { rowCount } = await db.query(
      `UPDATE despacho_lotes SET status = 'DESCARTADO' WHERE id = $1 AND status = 'PENDIENTE'`, [id])
    if (!rowCount) return NextResponse.json({ error: 'Solo se descarta un lote pendiente' }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return apiError(err)
  }
}
