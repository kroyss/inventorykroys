import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized } from '@/lib/session'
import { reportadorForbidden, remitenteConfigurado } from '@/lib/despachos'
import { cuentaDe, cuentaPorVenta, leerConfig, SQL_CUENTA_VENTA } from '@/lib/reportador'

const COLUMNAS = `
  e.id, e.venta, COALESCE(e.guia_final, e.guia) AS guia, e.carrier, e.remitente, e.destinatario,
  e.reimpresion, e.reporte_estado, e.reporte_detalle, e.reporte_intentos, e.reportado_at,
  e.reporte_mensaje, j.id AS jornada_id, j.closed_at, ${SQL_CUENTA_VENTA} AS cuenta_venta`
const DESDE = `
  FROM despacho_etiquetas e
  JOIN despacho_lotes l    ON l.id = e.lote_id
  JOIN despacho_jornadas j ON j.id = l.jornada_id
  WHERE e.impresa AND l.status = 'GENERADO' AND j.status = 'CERRADA'`

/** GET /api/despachos/reportador/historial — Reportador → Historial, en carpetas mes / día:
 *    ?mes=AAAA-MM   envíos de las jornadas cerradas ese mes (sin mes: el último con jornadas)
 *    ?jornada=ID    abre el mes de esa jornada (link desde Despachos)
 *    ?q=texto       busca venta, guía o comprador en TODOS los meses
 *  Siempre devuelve `meses` (resumen por mes) para las carpetas. */
export async function GET(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  const denied = reportadorForbidden(session)
  if (denied) return denied

  const sp = new URL(req.url).searchParams
  const q = (sp.get('q') ?? '').trim().slice(0, 60)
  const jornada = /^\d+$/.test(sp.get('jornada') ?? '') ? Number(sp.get('jornada')) : null
  let mes = /^\d{4}-\d{2}$/.test(sp.get('mes') ?? '') ? sp.get('mes')! : null
  try {
    const { rows: meses } = await db.query(
      `SELECT to_char(j.closed_at, 'YYYY-MM') AS mes, COUNT(DISTINCT j.id)::int AS dias,
              COUNT(*) FILTER (WHERE NOT e.reimpresion)::int AS envios
       ${DESDE}
       GROUP BY 1 ORDER BY 1 DESC LIMIT 24`)
    if (jornada) {
      const { rows: [j] } = await db.query(`SELECT to_char(closed_at, 'YYYY-MM') AS mes FROM despacho_jornadas WHERE id = $1`, [jornada])
      mes = j?.mes ?? mes
    }
    mes ??= meses[0]?.mes ?? null

    const { rows } = q
      ? await db.query(
          `SELECT ${COLUMNAS} ${DESDE}
             AND (e.venta ILIKE $1 OR COALESCE(e.guia_final, e.guia) ILIKE $1 OR e.destinatario ILIKE $1)
           ORDER BY j.closed_at DESC, e.id LIMIT 300`, [`%${q}%`])
      : mes
        ? await db.query(
            `SELECT ${COLUMNAS} ${DESDE} AND to_char(j.closed_at, 'YYYY-MM') = $1
             ORDER BY j.closed_at DESC, e.id LIMIT 6000`, [mes])
        : { rows: [] }

    const [config, remitenteDefault] = await Promise.all([leerConfig(db), remitenteConfigurado(db)])
    const porVenta = cuentaPorVenta(config)
    const envios = rows.map(({ cuenta_venta, ...r }) => ({
      ...r, cuenta: (porVenta ? cuenta_venta : cuentaDe(r.remitente, config.cuentas, remitenteDefault)?.nombre) ?? null,
    }))
    return NextResponse.json({ meses, mes, envios })
  } catch (err) {
    return apiError(err)
  }
}
