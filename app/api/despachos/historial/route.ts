import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized } from '@/lib/session'
import { despachosForbidden } from '@/lib/despachos'

const PAGE_SIZE = 20

/**
 * GET /api/despachos/historial?page=1          → todas las jornadas (abierta + cerradas), paginadas
 * GET /api/despachos/historial?q=2000012345    → etiquetas impresas que coinciden por venta, guía,
 *                                                destinatario o remitente (para ubicar un envío viejo)
 */
export async function GET(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  const denied = despachosForbidden(session)
  if (denied) return denied

  try {
    const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
    if (q) {
      const { rows } = await db.query(`
        SELECT e.id, e.venta, e.guia, e.destinatario, e.remitente, e.reimpresion, e.original_name,
               l.id AS lote_id, l.generated_at, j.id AS jornada_id, j.status AS jornada_status, j.closed_at
        FROM despacho_etiquetas e
        JOIN despacho_lotes l     ON l.id = e.lote_id AND l.status = 'GENERADO'
        LEFT JOIN despacho_jornadas j ON j.id = l.jornada_id
        WHERE e.impresa AND (
          e.venta ILIKE '%' || $1 || '%' OR e.guia ILIKE '%' || $1 || '%'
          OR e.destinatario ILIKE '%' || $1 || '%' OR e.remitente ILIKE '%' || $1 || '%'
        )
        ORDER BY l.generated_at DESC
        LIMIT 100
      `, [q])
      return NextResponse.json({ etiquetas: rows })
    }

    const page = Math.max(1, parseInt(req.nextUrl.searchParams.get('page') ?? '1', 10) || 1)
    const [list, count] = await Promise.all([
      db.query(`
        SELECT j.id, j.status, j.opened_at, j.closed_at, j.bot_csv_at,
               (j.manifest_path IS NOT NULL) AS tiene_manifiesto,
               uo.username AS opened_by, uc.username AS closed_by,
               COUNT(l.id)::int AS lotes,
               COALESCE(SUM(l.label_count), 0)::int AS envios
        FROM despacho_jornadas j
        LEFT JOIN despacho_lotes l ON l.jornada_id = j.id AND l.status = 'GENERADO'
        LEFT JOIN users uo ON uo.id = j.opened_by
        LEFT JOIN users uc ON uc.id = j.closed_by
        GROUP BY j.id, uo.username, uc.username
        ORDER BY j.opened_at DESC
        LIMIT $1 OFFSET $2
      `, [PAGE_SIZE, (page - 1) * PAGE_SIZE]),
      db.query(`SELECT COUNT(*)::int AS n FROM despacho_jornadas`),
    ])
    return NextResponse.json({ jornadas: list.rows, total: count.rows[0].n, page, pageSize: PAGE_SIZE })
  } catch (err) {
    return apiError(err)
  }
}
