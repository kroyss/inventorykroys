import { NextRequest, NextResponse } from 'next/server'
import { SQL_NO_PRACTICA_DEMO } from '@/lib/demo'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { tieneModulo } from '@/lib/modulos'
import { puede } from '@/lib/permisos'
import { COUNTRY_TZ } from '@/lib/tz'
import { rangoInicio } from '@/lib/rangoInicio'
import { atencionEntre } from '@/lib/resumenAtencion'

// GET /api/dashboard/bloques?period=today|month|quarter|year|custom&date_from&date_to (14-11, el dueño: "unir Inicio
// y Reportes → Resumen"). Lo que estaba solo en el Resumen, con el MISMO período que el gráfico del Inicio:
// más vendidos (top 5), cuentas de ML, atención en ML y calificaciones, cada uno contra su período anterior.
// Quien ve costos (Inicio completo) recibe todo; el empleado con Reportes y sin costos, solo lo que no muestra plata.
const VENDIDA = `s.status IN ('PROCESADA','DESCARGADA','DESCARGADA_LOCAL')`
const FECHA = `COALESCE(s.processed_at, s.created_at)`
const ENTRE = (col: string, a: number, b: number) => `${col} >= $${a}::date AND ${col} < $${b}::date + 1`

export async function GET(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  const u = session.user
  const completo = puede(u, 'costos')
  if (!completo && !puede(u, 'ver_reportes')) return forbidden()
  const q = req.nextUrl.searchParams
  const r = rangoInicio(q.get('period'), q.get('date_from'), q.get('date_to'), COUNTRY_TZ[u.country as 'VE' | 'CO'] ?? COUNTRY_TZ.VE)
  const P = [r.desde, r.hasta, r.antesDesde, r.antesHasta]
  const inventario = tieneModulo(u, 'inventario')
  const ml = tieneModulo(u, 'preguntas')
  try {
    const [top, cuentas, cal, hist, atencion] = await Promise.all([
      inventario ? db.query(
        `SELECT p.id, p.name AS nombre,
                COALESCE(SUM(si.quantity) FILTER (WHERE ${ENTRE(FECHA, 1, 2)}), 0)::int AS unidades,
                COALESCE(SUM(si.total_price) FILTER (WHERE ${ENTRE(FECHA, 1, 2)}), 0)::float AS monto,
                COALESCE(SUM(si.quantity) FILTER (WHERE ${ENTRE(FECHA, 3, 4)}), 0)::int AS antes
         FROM sale_items si JOIN sales s ON s.id = si.sale_id JOIN products p ON p.id = si.product_id
         WHERE ${VENDIDA} AND (${ENTRE(FECHA, 1, 2)} OR ${ENTRE(FECHA, 3, 4)})
         GROUP BY p.id, p.name
         HAVING COALESCE(SUM(si.quantity) FILTER (WHERE ${ENTRE(FECHA, 1, 2)}), 0) > 0
         ORDER BY unidades DESC, monto DESC LIMIT 5`, P).then(x => x.rows) : null,
      ml && completo ? db.query(
        `SELECT k.nickname AS cuenta, MAX(m.moneda) AS moneda,
                COUNT(*) FILTER (WHERE ${ENTRE('m.fecha', 1, 2)})::int AS ventas,
                COALESCE(SUM(m.total) FILTER (WHERE ${ENTRE('m.fecha', 1, 2)}), 0)::float AS monto,
                COUNT(*) FILTER (WHERE ${ENTRE('m.fecha', 3, 4)})::int AS antes_ventas
         FROM ml_ordenes m JOIN ml_conexiones k ON k.id = m.conexion_id
         WHERE COALESCE(m.estado, '') <> 'cancelled' AND ${SQL_NO_PRACTICA_DEMO('m.id')} AND (${ENTRE('m.fecha', 1, 2)} OR ${ENTRE('m.fecha', 3, 4)})
         GROUP BY k.nickname ORDER BY ventas DESC`, P).then(x => x.rows) : null,
      ml ? db.query(
        `SELECT COUNT(*) FILTER (WHERE cal_recibida = 'positive' AND ${ENTRE('cal_recibida_at', 1, 2)})::int AS positivas,
                COUNT(*) FILTER (WHERE cal_recibida = 'neutral' AND ${ENTRE('cal_recibida_at', 1, 2)})::int AS neutrales,
                COUNT(*) FILTER (WHERE cal_recibida = 'negative' AND ${ENTRE('cal_recibida_at', 1, 2)})::int AS negativas,
                COUNT(*) FILTER (WHERE cal_recibida = 'negative' AND ${ENTRE('cal_recibida_at', 3, 4)})::int AS antes_negativas,
                COUNT(*) FILTER (WHERE cal_contradictoria AND ${ENTRE('cal_recibida_at', 1, 2)})::int AS contradictorias
         FROM ml_ordenes WHERE ${SQL_NO_PRACTICA_DEMO('id')} AND (${ENTRE('cal_recibida_at', 1, 2)} OR ${ENTRE('cal_recibida_at', 3, 4)})`, P).then(x => x.rows[0]) : null,
      // ¿Las ventas de ML guardadas (~120 días) llegan al inicio del período anterior?
      ml ? db.query(`SELECT MIN(fecha) <= $1::date AS alcanza FROM ml_ordenes`, [r.antesDesde]).then(x => !!x.rows[0]?.alcanza) : false,
      ml && tieneModulo(u, 'atencion_ml') && puede(u, 'ver_preguntas') ? atencionEntre(db, r) : null,
    ])
    return NextResponse.json({
      rango: r, top: completo ? top : top?.map(p => ({ id: p.id, nombre: p.nombre, unidades: p.unidades, antes: p.antes })) ?? null, cuentas, calificaciones: cal, historialML: hist, atencion,
      moneda: u.country === 'CO' ? 'COP' : 'USD',
    })
  } catch (err) { return apiError(err) }
}
