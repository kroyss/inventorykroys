import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized } from '@/lib/session'
import { despachosForbidden } from '@/lib/despachos'
import { SQL_PENDIENTE } from '@/lib/reportador'

/** GET /api/despachos — jornada abierta (con sus lotes), lotes pendientes y jornadas cerradas recientes */
export async function GET() {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  const denied = despachosForbidden(session)
  if (denied) return denied

  try {
    const [abierta, lotes, pendientes, cerradas] = await Promise.all([
      db.query(
        `SELECT j.id, j.opened_at, u.username AS opened_by
         FROM despacho_jornadas j LEFT JOIN users u ON u.id = j.opened_by
         WHERE j.status = 'ABIERTA'`),
      db.query(
        `SELECT l.id, l.generated_at, l.label_count, l.page_count, u.username AS generated_by
         FROM despacho_lotes l
         JOIN despacho_jornadas j ON j.id = l.jornada_id AND j.status = 'ABIERTA'
         LEFT JOIN users u ON u.id = l.generated_by
         WHERE l.status = 'GENERADO'
         ORDER BY l.generated_at`),
      db.query(
        `SELECT l.id, l.created_at, u.username AS created_by, COUNT(e.id)::int AS etiquetas
         FROM despacho_lotes l
         LEFT JOIN users u ON u.id = l.created_by
         LEFT JOIN despacho_etiquetas e ON e.lote_id = l.id
         WHERE l.status = 'PENDIENTE'
         GROUP BY l.id, u.username
         ORDER BY l.created_at`),
      db.query(
        `SELECT j.id, j.opened_at, j.closed_at, j.total_envios, j.bot_csv_at, u.username AS closed_by,
                (SELECT COUNT(*)::int FROM despacho_lotes l WHERE l.jornada_id = j.id AND l.status = 'GENERADO') AS lotes,
                (SELECT COUNT(*)::int FROM despacho_etiquetas e JOIN despacho_lotes l ON l.id = e.lote_id
                  WHERE l.jornada_id = j.id AND e.impresa AND e.reimpresion) AS reimpresiones,
                r.a_reportar, r.enviados, r.sin_chat, r.con_problema, r.por_csv
         FROM despacho_jornadas j LEFT JOIN users u ON u.id = j.closed_by
         LEFT JOIN LATERAL (
           SELECT
             COUNT(*) FILTER (WHERE ${SQL_PENDIENTE})::int                      AS a_reportar,
             COUNT(*) FILTER (WHERE e.reporte_estado = 'ENVIADO')::int          AS enviados,
             COUNT(*) FILTER (WHERE e.reporte_estado = 'SIN_CHAT')::int         AS sin_chat,
             COUNT(*) FILTER (WHERE e.reporte_estado IN ('RECHAZADO','ERROR'))::int AS con_problema,
             COUNT(*) FILTER (WHERE e.reporte_estado = 'CSV')::int              AS por_csv
           FROM despacho_etiquetas e JOIN despacho_lotes l ON l.id = e.lote_id
           WHERE l.jornada_id = j.id AND l.status = 'GENERADO' AND e.impresa AND NOT e.reimpresion
         ) r ON TRUE
         WHERE j.status = 'CERRADA'
         ORDER BY j.closed_at DESC
         LIMIT 15`),
    ])

    const jornada = abierta.rows[0]
      ? {
          ...abierta.rows[0],
          lotes: lotes.rows,
          total_envios: lotes.rows.reduce((s, l) => s + (l.label_count ?? 0), 0),
        }
      : null

    return NextResponse.json({ jornada, pendientes: pendientes.rows, cerradas: cerradas.rows })
  } catch (err) {
    return apiError(err)
  }
}
