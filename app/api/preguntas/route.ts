import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { mlConfigurado } from '@/lib/ml'
import { iaConfigurada } from '@/lib/preguntas'

// GET /api/preguntas?vista=pendientes|respondidas&page=1&q=
// Bandeja de la empresa + contadores + cuentas conectadas + qué falta configurar.
export async function GET(req: NextRequest) {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  const url = new URL(req.url)
  const vista = url.searchParams.get('vista') === 'respondidas' ? 'respondidas' : 'pendientes'
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
  const q = (url.searchParams.get('q') ?? '').trim()
  const TAM = 25

  try {
    const filtroEstado = vista === 'pendientes' ? `p.estado = 'UNANSWERED'` : `p.estado <> 'UNANSWERED'`
    const params: unknown[] = []
    let filtroTexto = ''
    if (q) { params.push(`%${q}%`); filtroTexto = ` AND (p.texto ILIKE $1 OR p.item_titulo ILIKE $1 OR p.respuesta ILIKE $1 OR p.item_id ILIKE $1)` }
    const { rows } = await s.db.query(
      `SELECT p.id::text, p.item_id, p.item_titulo, p.item_permalink, p.item_estado, p.texto, p.estado,
              p.fecha, p.respuesta, p.respuesta_estado, p.respuesta_fecha,
              p.borrador, p.borrador_confianza, p.borrador_falta, p.borrador_web, p.borrador_at,
              c.nickname AS cuenta, u.full_name AS respondida_por,
              pr.code AS producto_code, pr.name AS producto_nombre, pr.stock AS producto_stock
       FROM ml_preguntas p
       JOIN ml_conexiones c ON c.id = p.conexion_id
       LEFT JOIN users u ON u.id = p.respondida_por
       -- Producto del sistema por su código ML (se guarda sin el prefijo: MLV768007052 → 768007052)
       LEFT JOIN LATERAL (
         SELECT pd.code, pd.name, COALESCE(i.quantity, 0)::int AS stock
         FROM product_ml_codes m
         JOIN products pd ON pd.id = m.product_id
         LEFT JOIN inventory i ON i.product_id = pd.id
         WHERE m.ml_code = regexp_replace(p.item_id, '^[A-Z]{3}', '')
         ORDER BY pd.is_active DESC LIMIT 1
       ) pr ON TRUE
       WHERE ${filtroEstado}${filtroTexto}
       ORDER BY ${vista === 'pendientes' ? 'p.fecha ASC' : 'COALESCE(p.respuesta_fecha, p.fecha) DESC'}
       LIMIT ${TAM} OFFSET ${(page - 1) * TAM}`, params)
    const { rows: [n] } = await s.db.query(
      `SELECT COUNT(*) FILTER (WHERE estado = 'UNANSWERED')::int AS pendientes,
              COUNT(*) FILTER (WHERE estado <> 'UNANSWERED')::int AS respondidas,
              COUNT(*) FILTER (WHERE estado = 'CLOSED_UNANSWERED')::int AS cerradas_sin_respuesta
       FROM ml_preguntas`)
    const { rows: [tot] } = await s.db.query(
      `SELECT COUNT(*)::int AS n FROM ml_preguntas p WHERE ${filtroEstado}${filtroTexto}`, params)
    const { rows: cuentas } = await s.db.query(
      `SELECT id, nickname, estado, ultima_sync, ultimo_error FROM ml_conexiones ORDER BY nickname`)
    return NextResponse.json({
      preguntas: rows, total: tot.n, page, tam: TAM, contadores: n, cuentas,
      configuracion: { ml: mlConfigurado(), ia: iaConfigurada() },
    })
  } catch (err) {
    return apiError(err)
  }
}
