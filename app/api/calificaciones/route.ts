import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { leerPlantillasCal, SQL_BANDEJA } from '@/lib/calificacionesML'

// GET /api/calificaciones?vista=listas|esperando
//   listas    → sin calificar con sugerencia (concretada / no concretada)
//   esperando → todavía no se sabe (recién vendida, o en borrador en el sistema)
export async function GET(req: NextRequest) {
  const s = await sesionPreguntas(true)
  if ('error' in s) return s.error
  const vista = new URL(req.url).searchParams.get('vista') === 'esperando' ? 'esperando' : 'listas'
  try {
    const { rows: [pl] } = await s.db.query(`SELECT value FROM app_settings WHERE key = 'calificaciones_plantillas'`)
    const plantillas = leerPlantillasCal(pl?.value)
    const dias = plantillas.noConcretada.dias
    const { rows } = await s.db.query(
      `SELECT * FROM (${SQL_BANDEJA}) b
       WHERE ${vista === 'esperando' ? `sugerencia = 'esperar'` : `sugerencia <> 'esperar'`}
       ORDER BY fecha DESC LIMIT 1000`, [dias])
    const { rows: [n] } = await s.db.query(
      `SELECT COUNT(*) FILTER (WHERE sugerencia = 'concretada')::int AS concretadas,
              COUNT(*) FILTER (WHERE sugerencia = 'no_concretada')::int AS no_concretadas,
              COUNT(*) FILTER (WHERE sugerencia = 'esperar')::int AS esperando
       FROM (${SQL_BANDEJA}) b`, [dias])
    const { rows: cuentas } = await s.db.query(
      `SELECT nickname, ordenes_sync_at FROM ml_conexiones WHERE estado = 'activa' ORDER BY nickname`)
    return NextResponse.json({ ordenes: rows, contadores: n, plantillas, cuentas })
  } catch (err) {
    return apiError(err)
  }
}
