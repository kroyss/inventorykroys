import type { Pool } from 'pg'

// Métricas (08-11-2026, mig 153, módulo `metricas`): Reportes → Resumen. Todo en un lugar, con período elegible
// (7/30/90 días, 1 año) contra el período anterior del mismo largo. Junta lo que estaba regado: ventas y ganancia
// (Inicio), productos (Top productos), cuentas de ML, atención (Atención ML) y calificaciones (Reputación).
// Ventas = las del sistema (sales) procesadas, igual que el Inicio. Cuentas y calificaciones salen de las ventas de
// ML guardadas (ml_ordenes, ~120 días hacia atrás): con 1 año la comparación de esas partes queda incompleta.

export const PERIODOS_METRICAS = [7, 30, 90, 365] as const
const VENDIDA = `s.status IN ('PROCESADA','DESCARGADA','DESCARGADA_LOCAL')`
const FECHA = `COALESCE(s.processed_at, s.created_at)`

export interface CifrasVentas { monto: number; ventas: number; unidades: number; costo: number; comision: number; ganancia: number; ticket: number }
export interface ResumenMetricas {
  dias: number
  ventas: { actual: CifrasVentas; anterior: CifrasVentas; serie: { dia: number; actual: number; anterior: number }[] } | null
  cuentas: { cuenta: string; ventas: number; monto: number; antes_ventas: number; antes_monto: number; moneda: string | null }[] | null
  top: { id: number; nombre: string; unidades: number; monto: number; antes: number }[] | null
  caidas: { id: number; nombre: string; unidades: number; antes: number }[] | null
  calificaciones: { positivas: number; neutrales: number; negativas: number; antes_negativas: number; contradictorias: number } | null
  historialML: boolean        // ¿las ventas de ML guardadas alcanzan para comparar este período?
}

async function cifrasVentas(db: Pool, desde: number, hasta: number): Promise<CifrasVentas> {
  const { rows: [r] } = await db.query(
    `WITH v AS (SELECT s.id, s.total_amount FROM sales s
                WHERE ${VENDIDA} AND ${FECHA} >= NOW() - make_interval(days => $1::int) AND ${FECHA} < NOW() - make_interval(days => $2::int))
     SELECT (SELECT COUNT(*) FROM v)::int AS ventas, (SELECT COALESCE(SUM(total_amount), 0) FROM v)::float AS monto,
            COALESCE(SUM(si.quantity), 0)::int AS unidades,
            COALESCE(SUM(si.quantity * COALESCE(si.unit_cost, 0)), 0)::float AS costo,
            COALESCE(SUM(si.quantity * COALESCE(si.unit_commission, 0)), 0)::float AS comision
     FROM sale_items si JOIN v ON v.id = si.sale_id`, [desde, hasta])
  const ganancia = r.monto - r.costo - r.comision
  return { ...r, ganancia, ticket: r.ventas ? r.monto / r.ventas : 0 }
}

export async function resumenMetricas(db: Pool, dias: number, o: { inventario: boolean; ml: boolean }): Promise<ResumenMetricas> {
  const out: ResumenMetricas = { dias, ventas: null, cuentas: null, top: null, caidas: null, calificaciones: null, historialML: false }
  const tareas: Promise<void>[] = []

  if (o.inventario) {
    tareas.push((async () => {
      const [actual, anterior, { rows: serie }] = await Promise.all([
        cifrasVentas(db, dias, 0), cifrasVentas(db, dias * 2, dias),
        // Monto por día: día 0 = el primero del período; el anterior se alinea por posición.
        db.query(
          `WITH x AS (SELECT ${FECHA}::date AS f, SUM(s.total_amount) AS m FROM sales s
                      WHERE ${VENDIDA} AND ${FECHA} >= CURRENT_DATE - ($1::int * 2 - 1) GROUP BY 1)
           SELECT d AS dia, COALESCE(a.m, 0)::float AS actual, COALESCE(b.m, 0)::float AS anterior
           FROM generate_series(0, $1::int - 1) d
           LEFT JOIN x a ON a.f = CURRENT_DATE - ($1::int - 1) + d
           LEFT JOIN x b ON b.f = CURRENT_DATE - ($1::int - 1) - $1::int + d
           ORDER BY d`, [dias]),
      ])
      out.ventas = { actual, anterior, serie }
    })())
    tareas.push((async () => {
      const { rows } = await db.query(
        `SELECT p.id, p.name AS nombre,
                COALESCE(SUM(si.quantity) FILTER (WHERE ${FECHA} >= NOW() - make_interval(days => $1::int)), 0)::int AS unidades,
                COALESCE(SUM(si.total_price) FILTER (WHERE ${FECHA} >= NOW() - make_interval(days => $1::int)), 0)::float AS monto,
                COALESCE(SUM(si.quantity) FILTER (WHERE ${FECHA} < NOW() - make_interval(days => $1::int)), 0)::int AS antes
         FROM sale_items si JOIN sales s ON s.id = si.sale_id JOIN products p ON p.id = si.product_id
         WHERE ${VENDIDA} AND ${FECHA} >= NOW() - make_interval(days => $1::int * 2)
         GROUP BY p.id, p.name`, [dias])
      out.top = [...rows].filter(r => r.unidades > 0).sort((a, b) => b.unidades - a.unidades || b.monto - a.monto).slice(0, 10)
      out.caidas = rows.filter(r => r.antes >= 3 && r.unidades < r.antes * 0.6)
        .sort((a, b) => (b.antes - b.unidades) - (a.antes - a.unidades)).slice(0, 8)
        .map(r => ({ id: r.id, nombre: r.nombre, unidades: r.unidades, antes: r.antes }))
    })())
  }

  if (o.ml) {
    tareas.push((async () => {
      const [{ rows: cuentas }, { rows: [cal] }, { rows: [h] }] = await Promise.all([
        db.query(
          `SELECT k.nickname AS cuenta, MAX(m.moneda) AS moneda,
                  COUNT(*) FILTER (WHERE m.fecha >= NOW() - make_interval(days => $1::int))::int AS ventas,
                  COALESCE(SUM(m.total) FILTER (WHERE m.fecha >= NOW() - make_interval(days => $1::int)), 0)::float AS monto,
                  COUNT(*) FILTER (WHERE m.fecha < NOW() - make_interval(days => $1::int))::int AS antes_ventas,
                  COALESCE(SUM(m.total) FILTER (WHERE m.fecha < NOW() - make_interval(days => $1::int)), 0)::float AS antes_monto
           FROM ml_ordenes m JOIN ml_conexiones k ON k.id = m.conexion_id
           WHERE COALESCE(m.estado, '') <> 'cancelled' AND m.fecha >= NOW() - make_interval(days => $1::int * 2)
           GROUP BY k.nickname ORDER BY ventas DESC`, [dias]),
        db.query(
          `SELECT COUNT(*) FILTER (WHERE cal_recibida = 'positive' AND cal_recibida_at >= NOW() - make_interval(days => $1::int))::int AS positivas,
                  COUNT(*) FILTER (WHERE cal_recibida = 'neutral' AND cal_recibida_at >= NOW() - make_interval(days => $1::int))::int AS neutrales,
                  COUNT(*) FILTER (WHERE cal_recibida = 'negative' AND cal_recibida_at >= NOW() - make_interval(days => $1::int))::int AS negativas,
                  COUNT(*) FILTER (WHERE cal_recibida = 'negative' AND cal_recibida_at < NOW() - make_interval(days => $1::int))::int AS antes_negativas,
                  COUNT(*) FILTER (WHERE cal_contradictoria AND cal_recibida_at >= NOW() - make_interval(days => $1::int))::int AS contradictorias
           FROM ml_ordenes WHERE cal_recibida_at >= NOW() - make_interval(days => $1::int * 2)`, [dias]),
        db.query(`SELECT MIN(fecha) <= NOW() - make_interval(days => $1::int * 2) AS alcanza FROM ml_ordenes`, [dias]),
      ])
      out.cuentas = cuentas
      out.calificaciones = cal
      out.historialML = !!h?.alcanza
    })())
  }
  await Promise.all(tareas)
  return out
}
