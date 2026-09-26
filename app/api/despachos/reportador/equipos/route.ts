import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { despachosForbidden } from '@/lib/despachos'
import { nuevoCodigo } from '@/lib/reportador'

/** POST /api/despachos/reportador/equipos — genera un código de vinculación (vence en 15 min) */
export async function POST() {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  const denied = despachosForbidden(session)
  if (denied) return denied
  if (session.user.role !== 'admin') return forbidden()

  try {
    // Reintenta si el código aleatorio choca con otro vigente (índice único).
    for (let i = 0; i < 5; i++) {
      const codigo = nuevoCodigo()
      const { rows: [eq] } = await db.query(
        `INSERT INTO reportador_equipos (codigo, codigo_expira, created_by)
         VALUES ($1, NOW() + INTERVAL '15 minutes', $2)
         ON CONFLICT DO NOTHING
         RETURNING id, codigo, codigo_expira`,
        [codigo, parseInt(session.user.id, 10)])
      if (eq) return NextResponse.json(eq, { status: 201 })
    }
    return NextResponse.json({ error: 'No se pudo generar el código, intenta de nuevo' }, { status: 500 })
  } catch (err) {
    return apiError(err)
  }
}
