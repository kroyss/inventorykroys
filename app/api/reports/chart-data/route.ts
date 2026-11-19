import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { puede } from '@/lib/permisos'

export async function GET(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (!puede(session.user, 'ver_reportes') && !puede(session.user, 'costos')) return forbidden()

  const url    = new URL(req.url)
  const period = url.searchParams.get('period') ?? 'month'
  const dateFrom = url.searchParams.get('date_from')
  const dateTo   = url.searchParams.get('date_to')

  // Whitelist trunc to prevent SQL injection (we interpolate it directly into DATE_TRUNC)
  const ALLOWED_TRUNCS = new Set(['hour', 'day', 'month'])

  let rangeSql: string
  // 19-11 (Inicio nuevo): el mismo tramo del período anterior, corrido hacia adelante (shiftSql) para que caiga en las
  // mismas etiquetas del gráfico (día 5 de octubre → «día 5» de noviembre) y se dibuje como línea de comparación.
  let prevSql: string
  let shiftSql: string
  let queryParams: unknown[] = []
  let trunc: string

  switch (period) {
    case 'today':
      rangeSql = `COALESCE(s.processed_at, s.created_at) BETWEEN CURRENT_DATE AND NOW()`
      prevSql  = `COALESCE(s.processed_at, s.created_at) BETWEEN CURRENT_DATE - 1 AND NOW() - INTERVAL '1 day'`
      shiftSql = `INTERVAL '1 day'`
      trunc    = 'hour'
      break
    case 'quarter':
      // Rolling 3-month window INCLUDING the current month (so today's sales show)
      rangeSql = `COALESCE(s.processed_at, s.created_at) BETWEEN DATE_TRUNC('month', NOW()) - INTERVAL '2 months' AND NOW()`
      prevSql  = `COALESCE(s.processed_at, s.created_at) BETWEEN DATE_TRUNC('month', NOW()) - INTERVAL '5 months' AND NOW() - INTERVAL '3 months'`
      shiftSql = `INTERVAL '3 months'`
      trunc    = 'day'
      break
    case 'year':
      rangeSql = `COALESCE(s.processed_at, s.created_at) BETWEEN DATE_TRUNC('year', NOW()) AND NOW()`
      prevSql  = `COALESCE(s.processed_at, s.created_at) BETWEEN DATE_TRUNC('year', NOW()) - INTERVAL '1 year' AND NOW() - INTERVAL '1 year'`
      shiftSql = `INTERVAL '1 year'`
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
      rangeSql = `COALESCE(s.processed_at, s.created_at) BETWEEN $1::date AND $2::date`
      prevSql  = `COALESCE(s.processed_at, s.created_at) BETWEEN $1::date - ($2::date - $1::date + 1) AND $2::date - ($2::date - $1::date + 1)`
      shiftSql = `make_interval(days => $2::date - $1::date + 1)`
      queryParams = [dateFrom, dateTo]
      trunc       = 'day'
      break
    default: // month
      rangeSql = `COALESCE(s.processed_at, s.created_at) BETWEEN DATE_TRUNC('month', NOW()) AND NOW()`
      prevSql  = `COALESCE(s.processed_at, s.created_at) BETWEEN DATE_TRUNC('month', NOW()) - INTERVAL '1 month' AND NOW() - INTERVAL '1 month'`
      shiftSql = `INTERVAL '1 month'`
      trunc    = 'day'
  }

  if (!ALLOWED_TRUNCS.has(trunc)) {
    return NextResponse.json({ error: 'Trunc inválido' }, { status: 400 })
  }

  try {
    const { rows } = await db.query(`
      SELECT
        DATE_TRUNC('${trunc}', COALESCE(s.processed_at, s.created_at))          AS periodo,
        COALESCE(SUM(s.total_amount), 0)              AS ventas,
        COALESCE(SUM(si_cost.costo), 0)               AS costos,
        COALESCE(SUM(si_cost.mercancia), 0)           AS mercancia,
        COALESCE(SUM(si_cost.bruto), 0)               AS bruto,
        COALESCE(SUM(si_cost.estimado), 0)            AS estimado,
        COUNT(DISTINCT s.id)                          AS cantidad_ventas
      FROM sales s
      LEFT JOIN (
        SELECT si.sale_id, SUM(si.quantity * (COALESCE(si.unit_cost, 0) + COALESCE(si.unit_commission, 0))) AS costo,
               SUM(si.quantity * COALESCE(si.unit_cost, 0)) AS mercancia,
               -- Mig 180: lo vendido con costo estimado (la ganancia de eso es aproximada).
               SUM(si.total_price) AS bruto, SUM(si.total_price) FILTER (WHERE si.costo_estimado) AS estimado
        FROM sale_items si
        GROUP BY si.sale_id
      ) si_cost ON si_cost.sale_id = s.id
      WHERE s.status IN ('PROCESADA','DESCARGADA','DESCARGADA_LOCAL')
        AND ${rangeSql}
      GROUP BY periodo
      ORDER BY periodo ASC
    `, queryParams)
    const { rows: prevRows } = await db.query(`
      SELECT DATE_TRUNC('${trunc}', COALESCE(s.processed_at, s.created_at) + ${shiftSql}) AS periodo,
             COALESCE(SUM(s.total_amount), 0) AS ventas,
             COALESCE(SUM(si_cost.costo), 0)  AS costos,
             COUNT(DISTINCT s.id)             AS cantidad_ventas
      FROM sales s
      LEFT JOIN (
        SELECT si.sale_id, SUM(si.quantity * (COALESCE(si.unit_cost, 0) + COALESCE(si.unit_commission, 0))) AS costo
        FROM sale_items si GROUP BY si.sale_id
      ) si_cost ON si_cost.sale_id = s.id
      WHERE s.status IN ('PROCESADA','DESCARGADA','DESCARGADA_LOCAL')
        AND ${prevSql}
      GROUP BY periodo
      ORDER BY periodo ASC
    `, queryParams)

    let totalVentas  = 0
    let totalCostos  = 0
    let totalMercancia = 0
    let totalCantidad = 0
    let totalBruto = 0, totalEstimado = 0

    // ISO label length: hour=13 (YYYY-MM-DDTHH), day=10 (YYYY-MM-DD), month=7 (YYYY-MM)
    const labelLen = trunc === 'hour' ? 13 : trunc === 'month' ? 7 : 10

    const chartData = rows.map(r => {
      const ventas  = parseFloat(r.ventas)  || 0
      const costos  = parseFloat(r.costos)  || 0
      const cant    = parseInt(r.cantidad_ventas, 10) || 0
      totalVentas   += ventas
      totalCostos   += costos
      totalMercancia += parseFloat(r.mercancia) || 0
      totalCantidad += cant
      totalBruto    += parseFloat(r.bruto) || 0
      totalEstimado += parseFloat(r.estimado) || 0
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

    // Período anterior: por etiqueta (para la línea gris) y en total (para el ▲▼ de las cifras del Inicio).
    const ant = { ventas: 0, costos: 0, cantidad: 0 }
    const antPorLabel = new Map<string, number>()
    for (const r of prevRows) {
      const v = parseFloat(r.ventas) || 0
      ant.ventas += v; ant.costos += parseFloat(r.costos) || 0; ant.cantidad += parseInt(r.cantidad_ventas, 10) || 0
      const l = (r.periodo instanceof Date ? r.periodo.toISOString() : String(r.periodo ?? '')).slice(0, labelLen)
      antPorLabel.set(l, (antPorLabel.get(l) ?? 0) + Math.round(v * 100) / 100)
    }
    // Etiquetas = las del período + las del anterior que no tuvieron ventas ahora (así la línea gris no se corta).
    const actuales = new Set(chartData.map(d => d.label))
    for (const l of antPorLabel.keys()) if (!actuales.has(l)) chartData.push({ label: l, ventas: 0, costos: 0, cantidad: 0 })
    chartData.sort((a, b) => a.label < b.label ? -1 : a.label > b.label ? 1 : 0)

    return NextResponse.json({
      chart_data: chartData.map(d => ({ ...d, anterior: antPorLabel.get(d.label) ?? 0 })),
      anterior: {
        ventas:   Math.round(ant.ventas * 100) / 100,
        ganancia: Math.round((ant.ventas - ant.costos) * 100) / 100,
        cantidad: ant.cantidad,
      },
      summary: {
        ventas:       Math.round(totalVentas  * 100) / 100,
        costos:       Math.round(totalCostos  * 100) / 100,
        ganancia:     Math.round((totalVentas - totalCostos) * 100) / 100,
        // Margen SOBRE VENTA (mismo criterio que el reporte de ventas: antes cada
        // pantalla dividía por una base distinta y la misma ganancia mostraba
        // porcentajes que no coincidían).
        margen_pct:   totalVentas > 0
          ? Math.round(((totalVentas - totalCostos) / totalVentas) * 1000) / 10
          : 0,
        // Markup sobre el costo (mercadería + comisión).
        ganancia_pct: totalCostos > 0
          ? Math.round(((totalVentas - totalCostos) / totalCostos) * 1000) / 10
          : 0,
        // 14-11 (el dueño): RENTABILIDAD = ganancia ÷ costo de la mercancía (sin la comisión, que ya está restada en la
        // ganancia). La misma fórmula que la ficha del producto y el catálogo. Es la que se muestra.
        rentabilidad_pct: totalMercancia > 0
          ? Math.round(((totalVentas - totalCostos) / totalMercancia) * 1000) / 10
          : null,
        cantidad:     totalCantidad,
        // Mig 180: % de lo vendido con costo estimado (0 = todo con costo real).
        estimado_pct: totalBruto > 0 && totalEstimado > 0
          ? Math.max(1, Math.round((totalEstimado / totalBruto) * 100))
          : 0,
      },
    })
  } catch (err) {
    return apiError(err)
  }
}
