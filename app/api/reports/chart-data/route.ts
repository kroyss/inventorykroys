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
  // 20-11 (el dueño: «al usuario normal se le ve hasta fin de mes»): con Hoy / Mes / Año el eje llega al FIN del período
  // (23 h, último día del mes, diciembre) y el período anterior viene COMPLETO, así la línea gris dice en cuánto cerró.
  // Las cifras ▲▼ siguen siendo «a la fecha» (columnas *_af: lo del anterior hasta NOW() − shift).
  // 19-11 (Inicio nuevo): el mismo tramo del período anterior, corrido hacia adelante (shiftSql) para que caiga en las
  // mismas etiquetas del gráfico (día 5 de octubre → «día 5» de noviembre) y se dibuje como línea de comparación.
  let prevSql: string
  let shiftSql: string
  // 20-11 (gráfico acumulado): el eje completo, del inicio del período a hoy, aunque haya días sin ventas.
  let ejeSql: string
  let queryParams: unknown[] = []
  let trunc: string

  switch (period) {
    case 'today':
      rangeSql = `COALESCE(s.processed_at, s.created_at) BETWEEN CURRENT_DATE AND NOW()`
      prevSql  = `COALESCE(s.processed_at, s.created_at) >= CURRENT_DATE - 1 AND COALESCE(s.processed_at, s.created_at) < CURRENT_DATE`
      shiftSql = `INTERVAL '1 day'`
      ejeSql   = `DATE_TRUNC('day', NOW()), DATE_TRUNC('day', NOW()) + INTERVAL '23 hours', INTERVAL '1 hour'`
      trunc    = 'hour'
      break
    case 'quarter':
      // Rolling 3-month window INCLUDING the current month (so today's sales show)
      rangeSql = `COALESCE(s.processed_at, s.created_at) BETWEEN DATE_TRUNC('month', NOW()) - INTERVAL '2 months' AND NOW()`
      prevSql  = `COALESCE(s.processed_at, s.created_at) BETWEEN DATE_TRUNC('month', NOW()) - INTERVAL '5 months' AND NOW() - INTERVAL '3 months'`
      shiftSql = `INTERVAL '3 months'`
      ejeSql   = `DATE_TRUNC('month', NOW()) - INTERVAL '2 months', DATE_TRUNC('day', NOW()), INTERVAL '1 day'`
      trunc    = 'day'
      break
    case 'year':
      rangeSql = `COALESCE(s.processed_at, s.created_at) BETWEEN DATE_TRUNC('year', NOW()) AND NOW()`
      prevSql  = `COALESCE(s.processed_at, s.created_at) >= DATE_TRUNC('year', NOW()) - INTERVAL '1 year' AND COALESCE(s.processed_at, s.created_at) < DATE_TRUNC('year', NOW())`
      shiftSql = `INTERVAL '1 year'`
      ejeSql   = `DATE_TRUNC('year', NOW()), DATE_TRUNC('year', NOW()) + INTERVAL '11 months', INTERVAL '1 month'`
      trunc    = 'month'
      break
    case 'custom':
      if (!dateFrom || !dateTo) {
        return NextResponse.json({ error: 'date_from y date_to requeridos para custom' }, { status: 400 })
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
        return NextResponse.json({ error: 'Formato de fecha inválido (YYYY-MM-DD)' }, { status: 400 })
      }
      if (dateFrom > dateTo || (Date.parse(dateTo) - Date.parse(dateFrom)) / 864e5 > 731) {
        return NextResponse.json({ error: 'Rango de fechas inválido (máximo 2 años)' }, { status: 400 })
      }
      // Use parameterized query for user-supplied dates (defense-in-depth)
      // 20-11: el último día entra completo (antes «BETWEEN … AND $2::date» cortaba en las 00:00 de ese día).
      rangeSql = `COALESCE(s.processed_at, s.created_at) >= $1::date AND COALESCE(s.processed_at, s.created_at) < $2::date + 1`
      prevSql  = `COALESCE(s.processed_at, s.created_at) >= $1::date - ($2::date - $1::date + 1) AND COALESCE(s.processed_at, s.created_at) < $1::date`
      shiftSql = `make_interval(days => $2::date - $1::date + 1)`
      ejeSql   = `$1::date::timestamptz, $2::date::timestamptz, INTERVAL '1 day'`
      queryParams = [dateFrom, dateTo]
      trunc       = 'day'
      break
    default: // month
      rangeSql = `COALESCE(s.processed_at, s.created_at) BETWEEN DATE_TRUNC('month', NOW()) AND NOW()`
      prevSql  = `COALESCE(s.processed_at, s.created_at) >= DATE_TRUNC('month', NOW()) - INTERVAL '1 month' AND COALESCE(s.processed_at, s.created_at) < DATE_TRUNC('month', NOW())`
      shiftSql = `INTERVAL '1 month'`
      ejeSql   = `DATE_TRUNC('month', NOW()), DATE_TRUNC('month', NOW()) + INTERVAL '1 month' - INTERVAL '1 day', INTERVAL '1 day'`
      trunc    = 'day'
  }
  // 20-11: la etiqueta se arma en SQL, en la hora del país (la conexión ya trae su TimeZone). Antes salía de
  // toISOString (UTC) y en «Hoy» las horas quedaban corridas.
  const FMT: Record<string, string> = { hour: `'YYYY-MM-DD"T"HH24'`, day: `'YYYY-MM-DD'`, month: `'YYYY-MM'` }

  if (!ALLOWED_TRUNCS.has(trunc)) {
    return NextResponse.json({ error: 'Trunc inválido' }, { status: 400 })
  }

  try {
    const { rows } = await db.query(`
      SELECT
        to_char(DATE_TRUNC('${trunc}', COALESCE(s.processed_at, s.created_at)), ${FMT[trunc]}) AS periodo,
        COALESCE(SUM(s.total_amount), 0)              AS ventas,
        COALESCE(SUM(si_cost.costo), 0)               AS costos,
        COALESCE(SUM(si_cost.mercancia), 0)           AS mercancia,
        COALESCE(SUM(si_cost.bruto), 0)               AS bruto,
        COALESCE(SUM(si_cost.estimado), 0)            AS estimado,
        COALESCE(SUM(si_cost.unidades), 0)            AS unidades,
        COUNT(DISTINCT s.id)                          AS cantidad_ventas
      FROM sales s
      LEFT JOIN (
        SELECT si.sale_id, SUM(si.quantity * (COALESCE(si.unit_cost, 0) + COALESCE(si.unit_commission, 0))) AS costo,
               SUM(si.quantity * COALESCE(si.unit_cost, 0)) AS mercancia, SUM(si.quantity) AS unidades,
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
      SELECT to_char(DATE_TRUNC('${trunc}', COALESCE(s.processed_at, s.created_at) + ${shiftSql}), ${FMT[trunc]}) AS periodo,
             COALESCE(SUM(s.total_amount), 0) AS ventas,
             COALESCE(SUM(si_cost.costo), 0)  AS costos,
             COALESCE(SUM(si_cost.unidades), 0) AS unidades,
             COUNT(DISTINCT s.id)             AS cantidad_ventas,
             COALESCE(SUM(s.total_amount) FILTER (WHERE COALESCE(s.processed_at, s.created_at) + ${shiftSql} <= NOW()), 0) AS ventas_af,
             COALESCE(SUM(si_cost.costo) FILTER (WHERE COALESCE(s.processed_at, s.created_at) + ${shiftSql} <= NOW()), 0) AS costos_af,
             COALESCE(SUM(si_cost.unidades) FILTER (WHERE COALESCE(s.processed_at, s.created_at) + ${shiftSql} <= NOW()), 0) AS unidades_af,
             COUNT(DISTINCT s.id) FILTER (WHERE COALESCE(s.processed_at, s.created_at) + ${shiftSql} <= NOW()) AS cantidad_af
      FROM sales s
      LEFT JOIN (
        SELECT si.sale_id, SUM(si.quantity * (COALESCE(si.unit_cost, 0) + COALESCE(si.unit_commission, 0))) AS costo,
               SUM(si.quantity) AS unidades
        FROM sale_items si GROUP BY si.sale_id
      ) si_cost ON si_cost.sale_id = s.id
      WHERE s.status IN ('PROCESADA','DESCARGADA','DESCARGADA_LOCAL')
        AND ${prevSql}
      GROUP BY periodo
      ORDER BY periodo ASC
    `, queryParams)
    const { rows: ejeRows } = await db.query(
      `SELECT to_char(g, ${FMT[trunc]}) AS label FROM generate_series(${ejeSql}) g ORDER BY g`, queryParams)
    // Dónde está «ahora» en el eje: la línea de este período llega hasta ahí; después, solo la gris.
    const { rows: [{ hoy }] } = await db.query(`SELECT to_char(DATE_TRUNC('${trunc}', NOW()), ${FMT[trunc]}) AS hoy`)

    let totalVentas  = 0
    let totalCostos  = 0
    let totalMercancia = 0
    let totalCantidad = 0
    let totalBruto = 0, totalEstimado = 0, totalUnidades = 0

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
      totalUnidades += parseFloat(r.unidades) || 0
      return {
        label:    String(r.periodo),
        ventas:   Math.round(ventas  * 100) / 100,
        costos:   Math.round(costos  * 100) / 100,
        cantidad: cant,
      }
    })

    // Período anterior: por etiqueta (para la línea gris) y en total (para el ▲▼ de las cifras del Inicio).
    const ant = { ventas: 0, costos: 0, cantidad: 0, unidades: 0 }
    const antPorLabel = new Map<string, { ventas: number; costos: number }>()
    for (const r of prevRows) {
      const v = parseFloat(r.ventas) || 0, c = parseFloat(r.costos) || 0
      ant.ventas += parseFloat(r.ventas_af) || 0; ant.costos += parseFloat(r.costos_af) || 0
      ant.cantidad += parseInt(r.cantidad_af, 10) || 0; ant.unidades += parseFloat(r.unidades_af) || 0
      const l = String(r.periodo), x = antPorLabel.get(l) ?? { ventas: 0, costos: 0 }
      antPorLabel.set(l, { ventas: x.ventas + v, costos: x.costos + c })
    }
    // 20-11: el eje completo (del inicio del período a hoy): los días sin ventas van en 0, así la línea acumulada no
    // une días separados como si en el medio hubiera habido ventas.
    const porLabel = new Map(chartData.map(d => [d.label, d]))
    const eje = ejeRows.map(r => String(r.label))
    const enEje = new Set(eje)
    for (const l of [...porLabel.keys(), ...antPorLabel.keys()]) if (!enEje.has(l)) { eje.push(l); enEje.add(l) }
    eje.sort()
    const r2 = (n: number) => Math.round(n * 100) / 100

    return NextResponse.json({
      hoy: String(hoy),
      chart_data: eje.map(l => {
        const d = porLabel.get(l) ?? { label: l, ventas: 0, costos: 0, cantidad: 0 }
        const a = antPorLabel.get(l)
        return { ...d, anterior: r2(a?.ventas ?? 0), anterior_costos: r2(a?.costos ?? 0) }
      }),
      anterior: {
        ventas:   Math.round(ant.ventas * 100) / 100,
        ganancia: Math.round((ant.ventas - ant.costos) * 100) / 100,
        cantidad: ant.cantidad,
        unidades: ant.unidades,
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
        unidades:     totalUnidades,
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
