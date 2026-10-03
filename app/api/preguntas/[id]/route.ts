import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { mlFetch, ErrorML } from '@/lib/ml'

// DELETE /api/preguntas/[id] → elimina la pregunta en MercadoLibre (solo el vendedor dueño de la
// publicación puede). Para preguntas imprudentes u ofensivas. No se puede deshacer. Bloquear al
// comprador ya no se puede por API (MercadoLibre lo quitó a las apps el 2025-06-09): se hace en ML.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'Pregunta inválida' }, { status: 400 })
  try {
    const { rows: [q] } = await s.db.query(`SELECT conexion_id, estado FROM ml_preguntas WHERE id = $1`, [id])
    if (!q) return NextResponse.json({ error: 'Pregunta no encontrada' }, { status: 404 })
    try {
      await mlFetch(s.db, q.conexion_id, `/questions/${id}`, { method: 'DELETE' })
    } catch (e) {
      // 404 = ya no existe en ML (la borraron desde allá): se marca igual.
      if (!(e instanceof ErrorML && e.status === 404)) {
        if (e instanceof ErrorML) return NextResponse.json({ error: `MercadoLibre no la eliminó (${e.message})` }, { status: 502 })
        throw e
      }
    }
    await s.db.query(`UPDATE ml_preguntas SET estado = 'DELETED', sincronizada_at = NOW() WHERE id = $1`, [id])
    return NextResponse.json({ ok: true })
  } catch (err) {
    return apiError(err)
  }
}
