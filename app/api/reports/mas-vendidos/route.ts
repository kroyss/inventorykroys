import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { puede } from '@/lib/permisos'
import { COUNTRY_TZ } from '@/lib/tz'
import { moverFecha, rangoInicio } from '@/lib/rangoInicio'

// Reportes → Ventas → «Por producto» (14-11, reemplaza la pestaña Top productos): todos los productos vendidos entre
// date_from y date_to (fechas del país, incluidas, igual que la lista de ventas) contra los mismos días justo antes.
// ?dias=N (lo usaba el panel del Resumen) sigue andando por compatibilidad. Costo, comisión y ganancia solo con el
// permiso de costos.
const VENDIDA = `s.status IN ('PROCESADA','DESCARGADA','DESCARGADA_LOCAL')`
const FECHA = `COALESCE(s.processed_at, s.created_at)`
// Por fecha del país (DATE(...) con el TimeZone de la conexión), igual que /api/reports/sales.
const ACTUAL = `DATE(${FECHA}) BETWEEN $1::date AND $2::date`
const ANTES = `DATE(${FECHA}) BETWEEN $3::date AND $4::date`

export async function GET(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  const u = session.user
  if (!puede(u, 'ver_reportes')) return forbidden()
  const q = req.nextUrl.searchParams
  let desde = q.get('date_from'), hasta = q.get('date_to')
  if (!desde || !hasta) {
    const hoy = rangoInicio('month', null, null, COUNTRY_TZ[u.country as 'VE' | 'CO'] ?? COUNTRY_TZ.VE).hasta
    const dias = [7, 30, 90, 365].includes(Number(q.get('dias'))) ? Number(q.get('dias')) : 30
    desde = moverFecha(hoy, 0, -(dias - 1)); hasta = hoy
  }
  const r = rangoInicio('custom', desde, hasta, 'America/Caracas')
  if (r.periodo !== 'custom') return NextResponse.json({ error: 'Fechas inválidas' }, { status: 400 })
  const verCostos = puede(u, 'costos')
  try {
    const { rows } = await db.query(
      `SELECT p.id, p.code, p.name AS nombre, CASE WHEN COALESCE(pp.ganancia_pct, pc.profit_percentage) IS NOT NULL THEN 'Ganancia ' || rtrim(rtrim(COALESCE(pp.ganancia_pct, pc.profit_percentage)::text, '0'), '.') || '%' END AS categoria,
              COALESCE(SUM(si.quantity) FILTER (WHERE ${ACTUAL}), 0)::int AS unidades,
              COALESCE(SUM(si.total_price) FILTER (WHERE ${ACTUAL}), 0)::float AS venta,
              COALESCE(SUM(si.quantity * COALESCE(si.unit_cost, 0)) FILTER (WHERE ${ACTUAL}), 0)::float AS costo,
              COALESCE(SUM(si.quantity * COALESCE(si.unit_commission, 0)) FILTER (WHERE ${ACTUAL}), 0)::float AS comision,
              COALESCE(SUM(si.quantity) FILTER (WHERE ${ANTES}), 0)::int AS antes
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       JOIN products p ON p.id = si.product_id
       LEFT JOIN product_pricing pp ON pp.product_id = p.id
       LEFT JOIN profit_categories pc ON pc.id = pp.profit_category_id
       WHERE ${VENDIDA} AND (${ACTUAL} OR ${ANTES})
       GROUP BY p.id, p.code, p.name, pp.ganancia_pct, pc.profit_percentage`, [r.desde, r.hasta, r.antesDesde, r.antesHasta])
    const productos = rows.filter(r => r.unidades > 0).map(r => ({
      id: r.id, code: r.code, nombre: r.nombre, categoria: r.categoria ?? null, unidades: r.unidades, antes: r.antes,
      venta: Math.round(r.venta * 100) / 100,
      ...(verCostos ? {
        costo: Math.round(r.costo * 100) / 100, comision: Math.round(r.comision * 100) / 100,
        ganancia: Math.round((r.venta - r.costo - r.comision) * 100) / 100,
      } : {}),
    }))
    return NextResponse.json({ desde: r.desde, hasta: r.hasta, antesDesde: r.antesDesde, antesHasta: r.antesHasta, verCostos, moneda: u.country === 'CO' ? 'COP' : 'USD', productos })
  } catch (err) { return apiError(err) }
}
