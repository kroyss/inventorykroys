import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { puede } from '@/lib/permisos'
import { tieneModulo } from '@/lib/modulos'

// Reportes → Resumen → Más vendidos → «Ver detalle» (14-11, reemplaza la pestaña Top productos): todos los productos
// vendidos en el período del Resumen (últimos N días, la misma ventana que lib/metricas.ts) contra el período anterior.
// Costo, comisión y ganancia solo con el permiso de costos.
const VENDIDA = `s.status IN ('PROCESADA','DESCARGADA','DESCARGADA_LOCAL')`
const FECHA = `COALESCE(s.processed_at, s.created_at)`

export async function GET(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  const u = session.user
  if (!tieneModulo(u, 'metricas') || !puede(u, 'ver_reportes')) return forbidden()
  const dias = [7, 30, 90, 365].includes(Number(req.nextUrl.searchParams.get('dias'))) ? Number(req.nextUrl.searchParams.get('dias')) : 30
  const verCostos = puede(u, 'costos')
  try {
    const { rows } = await db.query(
      `SELECT p.id, p.code, p.name AS nombre, pc.name AS categoria,
              COALESCE(SUM(si.quantity) FILTER (WHERE ${FECHA} >= NOW() - make_interval(days => $1::int)), 0)::int AS unidades,
              COALESCE(SUM(si.total_price) FILTER (WHERE ${FECHA} >= NOW() - make_interval(days => $1::int)), 0)::float AS venta,
              COALESCE(SUM(si.quantity * COALESCE(si.unit_cost, 0)) FILTER (WHERE ${FECHA} >= NOW() - make_interval(days => $1::int)), 0)::float AS costo,
              COALESCE(SUM(si.quantity * COALESCE(si.unit_commission, 0)) FILTER (WHERE ${FECHA} >= NOW() - make_interval(days => $1::int)), 0)::float AS comision,
              COALESCE(SUM(si.quantity) FILTER (WHERE ${FECHA} < NOW() - make_interval(days => $1::int)), 0)::int AS antes
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       JOIN products p ON p.id = si.product_id
       LEFT JOIN product_pricing pp ON pp.product_id = p.id
       LEFT JOIN profit_categories pc ON pc.id = pp.profit_category_id
       WHERE ${VENDIDA} AND ${FECHA} >= NOW() - make_interval(days => $1::int * 2)
       GROUP BY p.id, p.code, p.name, pc.name`, [dias])
    const productos = rows.filter(r => r.unidades > 0).map(r => ({
      id: r.id, code: r.code, nombre: r.nombre, categoria: r.categoria ?? null, unidades: r.unidades, antes: r.antes,
      venta: Math.round(r.venta * 100) / 100,
      ...(verCostos ? {
        costo: Math.round(r.costo * 100) / 100, comision: Math.round(r.comision * 100) / 100,
        ganancia: Math.round((r.venta - r.costo - r.comision) * 100) / 100,
      } : {}),
    }))
    return NextResponse.json({ dias, verCostos, moneda: u.country === 'CO' ? 'COP' : 'USD', productos })
  } catch (err) { return apiError(err) }
}
