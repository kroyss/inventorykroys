import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized } from '@/lib/session'
import { despachosForbidden } from '@/lib/despachos'
import { EN_LINEA_SEGUNDOS } from '@/lib/reportador'

type Ctx = { params: Promise<{ id: string }> }

/** POST /api/despachos/reportador/equipos/[id]/orden — "Reportar en <equipo>" (admin y user).
 *  El equipo la toma en su próxima consulta; si está apagado, espera (vence a las 12 h). */
export async function POST(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  const denied = despachosForbidden(session)
  if (denied) return denied

  try {
    const { rows: [eq] } = await db.query(
      `SELECT id, nombre, last_seen_at > NOW() - make_interval(secs => $2) AS en_linea
       FROM reportador_equipos WHERE id = $1 AND token_hash IS NOT NULL AND revocado_at IS NULL`,
      [id, EN_LINEA_SEGUNDOS])
    if (!eq) return NextResponse.json({ error: 'Equipo no encontrado' }, { status: 404 })

    // Una orden a la vez por equipo (índice lógico: la inserción solo ocurre si no hay otra).
    const { rows: [orden] } = await db.query(
      `INSERT INTO reportador_ordenes (equipo_id, origen, created_by)
       SELECT $1, 'WEB', $2
       WHERE NOT EXISTS (SELECT 1 FROM reportador_ordenes
                         WHERE equipo_id = $1 AND estado IN ('PENDIENTE', 'EN_CURSO'))
       RETURNING id`,
      [id, parseInt(session.user.id, 10)])
    if (!orden) return NextResponse.json({ error: 'Ese equipo ya tiene un reporte en marcha' }, { status: 409 })
    return NextResponse.json({ ok: true, orden_id: orden.id, en_linea: eq.en_linea }, { status: 201 })
  } catch (err) {
    return apiError(err)
  }
}

/** DELETE /api/despachos/reportador/equipos/[id]/orden — cancela la orden si todavía no
 *  empezó, o pide detener si ya está reportando (corta después del mensaje en curso). */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  const denied = despachosForbidden(session)
  if (denied) return denied

  try {
    const { rowCount: canceladas } = await db.query(
      `UPDATE reportador_ordenes SET estado = 'CANCELADA', terminada_at = NOW()
       WHERE equipo_id = $1 AND estado = 'PENDIENTE'`, [id])
    const { rowCount: detenidas } = await db.query(
      `UPDATE reportador_ordenes SET detener_at = NOW()
       WHERE equipo_id = $1 AND estado = 'EN_CURSO' AND detener_at IS NULL`, [id])
    return NextResponse.json({ ok: true, canceladas, detenidas })
  } catch (err) {
    return apiError(err)
  }
}
