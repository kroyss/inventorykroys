import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { despachosForbidden } from '@/lib/despachos'

type Ctx = { params: Promise<{ id: string }> }

const Patch = z.object({ auto_reportar: z.boolean() })

/** PATCH /api/despachos/reportador/equipos/[id] — reportar solo al cerrar la jornada (admin) */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  const denied = despachosForbidden(session)
  if (denied) return denied
  if (session.user.role !== 'admin') return forbidden()

  try {
    const b = Patch.parse(await req.json())
    await db.query(
      `UPDATE reportador_equipos SET auto_reportar = $2 WHERE id = $1 AND revocado_at IS NULL`, [id, b.auto_reportar])
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}

/** DELETE /api/despachos/reportador/equipos/[id] — desvincula un equipo (su token deja de servir) */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
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
    // Sus órdenes pendientes ya no las va a tomar nadie.
    await db.query(
      `UPDATE reportador_ordenes SET estado = 'CANCELADA', terminada_at = NOW()
       WHERE equipo_id = $1 AND estado IN ('PENDIENTE', 'EN_CURSO')`, [id]).catch(() => {})
    return NextResponse.json({ ok: true })
  } catch (err) {
    return apiError(err)
  }
}
