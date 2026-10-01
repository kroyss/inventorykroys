import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { DIAS_VENTAS, SQL_COMPARACION, UMBRAL_BAJO } from '@/lib/stockML'

// GET /api/stock-ml?vista=alertas|todos → stock real vs publicado en cada cuenta de ML.
export async function GET(req: NextRequest) {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  const todos = new URL(req.url).searchParams.get('vista') === 'todos'
  try {
    const { rows } = await s.db.query(
      `SELECT * FROM (${SQL_COMPARACION}) c
       ${todos ? '' : `WHERE alerta <> 'ok'`}
       ORDER BY CASE alerta WHEN 'de_mas' THEN 0 WHEN 'reponer' THEN 1 ELSE 2 END,
                vendidas_recientes DESC, stock_real DESC, name
       LIMIT 1000`, [DIAS_VENTAS, UMBRAL_BAJO])
    const { rows: [n] } = await s.db.query(
      `SELECT COUNT(*) FILTER (WHERE alerta = 'reponer')::int AS reponer,
              COUNT(*) FILTER (WHERE alerta = 'de_mas')::int AS de_mas,
              COUNT(*)::int AS productos
       FROM (${SQL_COMPARACION}) c`, [DIAS_VENTAS, UMBRAL_BAJO])
    const { rows: [p] } = await s.db.query(
      `SELECT COUNT(*)::int AS leidas, COUNT(*) FILTER (WHERE error IS NOT NULL)::int AS con_error,
              MIN(actualizado_at) AS mas_vieja,
              (SELECT COUNT(*)::int FROM product_ml_codes m JOIN products pr ON pr.id = m.product_id AND pr.is_active
               WHERE m.is_active AND COALESCE(m.ml_code, '') <> '') AS total_codigos
       FROM ml_publicaciones`)
    return NextResponse.json({ productos: rows, contadores: n, progreso: p, dias: DIAS_VENTAS, umbral: UMBRAL_BAJO })
  } catch (err) {
    return apiError(err)
  }
}
