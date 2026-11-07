import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized } from '@/lib/session'
import { despachosForbidden } from '@/lib/despachos'
import { COUNTRY_TZ, currentDate } from '@/lib/tz'

// GET /api/despachos/primera (07-11-2026, migración 147): la PRIMERA jornada de una empresa (nunca cerró ninguna) trae
// también las guías de días anteriores, que muchas veces ya se enviaron por fuera del sistema. Devuelve esos envíos
// para preguntar "¿cuáles ya enviaste?" (se sacan con POST /api/despachos/apartados { accion: 'ya_enviadas' }).
export async function GET() {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  const denied = despachosForbidden(session)
  if (denied) return denied
  try {
    const { rows } = await db.query(
      `SELECT e.id, e.venta, e.carrier, COALESCE(e.guia_final, e.guia) AS guia, e.destinatario, e.impresa,
              o.compra, o.productos
       FROM despacho_etiquetas e
       JOIN despacho_lotes l ON l.id = e.lote_id
       LEFT JOIN despacho_jornadas j ON j.id = l.jornada_id
       LEFT JOIN LATERAL (
         SELECT to_char(x.fecha, 'YYYY-MM-DD') AS compra, x.productos FROM ml_ordenes x
         WHERE e.venta ~ '^[0-9]{1,18}$' AND (x.id = e.venta::bigint OR x.pack_id = e.venta::bigint)
         ORDER BY x.fecha LIMIT 1) o ON TRUE
       WHERE (j.status = 'ABIERTA' OR l.jornada_id IS NULL) AND l.status <> 'DESCARTADO'
         AND e.apartado IS NULL AND NOT e.reimpresion
         AND (e.impresa OR (l.status = 'PENDIENTE' AND e.incluida))
         AND (e.reporte_estado IS NULL OR e.reporte_estado IN ('RECHAZADO', 'ERROR'))
         AND NOT EXISTS (SELECT 1 FROM despacho_jornadas c WHERE c.status = 'CERRADA')
       ORDER BY o.compra NULLS LAST, e.id
       LIMIT 300`)
    const hoy = currentDate(COUNTRY_TZ[session.user.country as 'VE' | 'CO'] ?? COUNTRY_TZ.VE)
    // Solo si hay alguna de días anteriores (si todo es de hoy, no hay nada que preguntar).
    const viejas = rows.filter(r => r.compra && r.compra < hoy)
    return NextResponse.json({ hoy, envios: viejas.length ? rows : [] })
  } catch (err) {
    return apiError(err)
  }
}
