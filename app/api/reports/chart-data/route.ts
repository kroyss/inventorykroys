import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'

export async function GET(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (session.user.role !== 'admin') return forbidden()

  const url    = new URL(req.url)
  const period = url.searchParams.get('period') ?? 'month'
  const dateFrom = url.searchParams.get('date_from')
  const dateTo   = url.searchParams.get('date_to')

  // Whitelist trunc to prevent SQL injection (we interpolate it directly into DATE_TRUNC)
  const ALLOWED_TRUNCS = new Set(['hour', 'day', 'month'])

  let rangeSql: string
  let queryParams: unknown[] = []
  let trunc: string

  switch (period) {
    case 'today':
      rangeSql = `s.created_at BETWEEN CURRENT_DATE AND NOW()`
      trunc    = 'hour'
      break
    case 'quarter':
      // Rolling 3-month window INCLUDING the current month (so today's sales show)
      rangeSql = `s.created_at BETWEEN DATE_TRUNC('month', NOW()) - INTERVAL '2 months' AND NOW()`
      trunc    = 'day'
      break
    case 'year':
      rangeSql = `s.created_at BETWEEN DATE_TRUNC('year', NOW()) AND NOW()`
      trunc    = 'month'
      break
    case 'custom':
      if (!dateFrom || !dateTo) {
        return NextResponse.json({ error: 'date_from y date_to requeridos para custom' }, { status: 400 })
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
        return NextResponse.json({ error: 'Formato de fecha inválido (YYYY-MM-DD)' }, { status: 400 })
      }
      // Use parameterized query for user-supplied dates (defense-in-depth)
      rangeSql = `s.created_at BETWEEN $1::date AND $2::date`
      queryParams = [dateFrom, dateTo]
      trunc       = 'day'
      break
    default: // month
      rangeSql = `s.created_at BETWEEN DATE_TRUNC('month', NOW()) AND NOW()`
      trunc    = 'day'
  }

  if (!ALLOWED_TRUNCS.has(trunc)) {
    return NextResponse.json({ error: 'Trunc inválido' }, { status: 400 })
  }

  try {
    const { rows } = await db.query(`
      SELECT
        DATE_TRUNC('${trunc}', s.created_at)          AS periodo,
        COALESCE(SUM(s.total_amount), 0)              AS ventas,
        COALESCE(SUM(si_cost.costo), 0)               AS costos,
        COUNT(DISTINCT s.id)                          AS cantidad_ventas
      FROM sales s
      LEFT JOIN (
        SELECT si.sale_id, SUM(si.quantity * COALESCE(pp.total_cost, 0)) AS costo
        FROM sale_items si
        LEFT JOIN product_pricing pp ON pp.product_id = si.product_id
        GROUP BY si.sale_id
      ) si_cost ON si_cost.sale_id = s.id
      WHERE s.status IN ('PROCESADA','DESCARGADA','DESCARGADA_LOCAL')
        AND ${rangeSql}
      GROUP BY periodo
      ORDER BY periodo ASC
    `, queryParams)

    let totalVentas  = 0
    let totalCostos  = 0
    let totalCantidad = 0

    // ISO label length: hour=13 (YYYY-MM-DDTHH), day=10 (YYYY-MM-DD), month=7 (YYYY-MM)
    const labelLen = trunc === 'hour' ? 13 : trunc === 'month' ? 7 : 10

    const chartData = rows.map(r => {
      const ventas  = parseFloat(r.ventas)  || 0
      const costos  = parseFloat(r.costos)  || 0
      const cant    = parseInt(r.cantidad_ventas, 10) || 0
      totalVentas   += ventas
      totalCostos   += costos
      totalCantidad += cant
      const periodoStr = r.periodo instanceof Date
        ? r.periodo.toISOString()
        : String(r.periodo ?? '')
      return {
        label:    periodoStr.slice(0, labelLen),
        ventas:   Math.round(ventas  * 100) / 100,
        costos:   Math.round(costos  * 100) / 100,
        cantidad: cant,
      }
    })

    return NextResponse.json({
      chart_data: chartData,
      summary: {
        ventas:       Math.round(totalVentas  * 100) / 100,
        costos:       Math.round(totalCostos  * 100) / 100,
        ganancia:     Math.round((totalVentas - totalCostos) * 100) / 100,
        ganancia_pct: totalCostos > 0
          ? Math.round(((totalVentas - totalCostos) / totalCostos) * 1000) / 10
          : 0,
        cantidad:     totalCantidad,
      },
    })
  } catch (err) {
    return apiError(err)
  }
}
