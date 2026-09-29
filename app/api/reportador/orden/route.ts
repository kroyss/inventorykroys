import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { autenticarEquipo, ORDEN_VENCE_HORAS } from '@/lib/reportador'

/**
 * GET /api/reportador/orden — el equipo, en espera, pregunta si hay algo que hacer
 * (cada ~30 s). Si hay una orden pendiente la TOMA (pasa a EN_CURSO) y la devuelve.
 *
 * Como solo pregunta cuando está libre, una orden suya que siga EN_CURSO quedó huérfana
 * (el programa se cerró o se colgó a mitad): se marca INTERRUMPIDA. Lo no enviado sigue
 * pendiente en la cola, así que no se pierde nada.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await autenticarEquipo(req)
    if ('error' in auth) return auth.error
    const { db, equipo } = auth

    await db.query(
      `UPDATE reportador_ordenes SET estado = 'INTERRUMPIDA', terminada_at = NOW()
       WHERE equipo_id = $1 AND estado = 'EN_CURSO'`, [equipo.id])
    await db.query(
      `UPDATE reportador_ordenes SET estado = 'VENCIDA', terminada_at = NOW()
       WHERE equipo_id = $1 AND estado = 'PENDIENTE' AND created_at < NOW() - make_interval(hours => $2)`,
      [equipo.id, ORDEN_VENCE_HORAS])
    await db.query(`UPDATE reportador_equipos SET actividad = NULL, actividad_at = NULL WHERE id = $1`, [equipo.id])

    const { rows: [orden] } = await db.query(
      `UPDATE reportador_ordenes o SET estado = 'EN_CURSO', tomada_at = NOW()
       FROM (SELECT id FROM reportador_ordenes
             WHERE equipo_id = $1 AND estado = 'PENDIENTE'
             ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED) s
       WHERE o.id = s.id
       RETURNING o.id, o.origen,
                 (SELECT COALESCE(u.full_name, u.username) FROM users u WHERE u.id = o.created_by) AS pedida_por`,
      [equipo.id])
    return NextResponse.json({ orden: orden ?? null })
  } catch (err) {
    return apiError(err)
  }
}

/** POST /api/reportador/orden — el equipo empieza a reportar por su cuenta ("Reportar
 *  ahora" en el programa): se registra como orden para verla y poder detenerla desde la web. */
export async function POST(req: NextRequest) {
  try {
    const auth = await autenticarEquipo(req)
    if ('error' in auth) return auth.error
    const { db, equipo } = auth
    // Las pendientes de la web quedan cubiertas por esta corrida.
    await db.query(
      `UPDATE reportador_ordenes SET estado = 'CANCELADA', terminada_at = NOW()
       WHERE equipo_id = $1 AND estado IN ('PENDIENTE', 'EN_CURSO')`, [equipo.id])
    const { rows: [orden] } = await db.query(
      `INSERT INTO reportador_ordenes (equipo_id, origen, estado, tomada_at)
       VALUES ($1, 'EQUIPO', 'EN_CURSO', NOW()) RETURNING id, origen`, [equipo.id])
    return NextResponse.json({ orden })
  } catch (err) {
    return apiError(err)
  }
}

const Fin = z.object({
  orden_id: z.number().int().positive(),
  resumen:  z.record(z.string(), z.number().int().min(0)).optional(),
})

/** PUT /api/reportador/orden — el equipo terminó la orden (con su resumen). */
export async function PUT(req: NextRequest) {
  try {
    const auth = await autenticarEquipo(req)
    if ('error' in auth) return auth.error
    const { db, equipo } = auth
    const b = Fin.parse(await req.json())
    await db.query(
      `UPDATE reportador_ordenes SET estado = 'TERMINADA', terminada_at = NOW(), resumen = $3
       WHERE id = $1 AND equipo_id = $2 AND estado = 'EN_CURSO'`,
      [b.orden_id, equipo.id, b.resumen ? JSON.stringify(b.resumen) : null])
    await db.query(`UPDATE reportador_equipos SET actividad = NULL, actividad_at = NULL WHERE id = $1`, [equipo.id])
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}
