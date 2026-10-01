import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized } from '@/lib/session'
import { reportadorForbidden, remitenteConfigurado } from '@/lib/despachos'
import { cuentaDe, leerConfig } from '@/lib/reportador'

/** GET /api/despachos/reportador/historial?jornada=ID | ?dias=N — qué se le reportó a cada
 *  comprador (estado, detalle y el texto enviado), por jornada cerrada. Lo usa Reportador → Historial. */
export async function GET(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  const denied = reportadorForbidden(session)
  if (denied) return denied

  const sp = new URL(req.url).searchParams
  const jornada = /^\d+$/.test(sp.get('jornada') ?? '') ? Number(sp.get('jornada')) : null
  const dias = Math.min(Math.max(Number(sp.get('dias')) || 7, 1), 120)
  try {
    const [config, remitenteDefault, { rows }, { rows: jornadas }] = await Promise.all([
      leerConfig(db),
      remitenteConfigurado(db),
      db.query(
        `SELECT e.id, e.venta, COALESCE(e.guia_final, e.guia) AS guia, e.carrier, e.remitente, e.destinatario,
                e.reimpresion, e.reporte_estado, e.reporte_detalle, e.reporte_intentos, e.reportado_at,
                e.reporte_mensaje, j.id AS jornada_id, j.closed_at
         FROM despacho_etiquetas e
         JOIN despacho_lotes l    ON l.id = e.lote_id
         JOIN despacho_jornadas j ON j.id = l.jornada_id
         WHERE e.impresa AND l.status = 'GENERADO' AND j.status = 'CERRADA'
           AND ${jornada ? 'j.id = $1' : `j.closed_at >= NOW() - make_interval(days => $1)`}
         ORDER BY j.closed_at DESC, COALESCE(e.reportado_at, j.closed_at) DESC, e.id DESC
         LIMIT 2000`, [jornada ?? dias]),
      db.query(
        `SELECT id, closed_at, total_envios FROM despacho_jornadas
         WHERE status = 'CERRADA' ORDER BY closed_at DESC LIMIT 60`),
    ])
    const envios = rows.map(r => ({ ...r, cuenta: cuentaDe(r.remitente, config.cuentas, remitenteDefault)?.nombre ?? null }))
    return NextResponse.json({ envios, jornadas })
  } catch (err) {
    return apiError(err)
  }
}
