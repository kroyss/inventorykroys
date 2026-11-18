import type { ReglasStock } from './stockReglas'

// Fase 2 (18-11, el dueño: «una sola forma de decir bajo»): el mínimo de cada producto sale de las MISMAS reglas que
// Inventario → Reponer (lo que tarda en llegar la mercancía y lo que compras al pedir), no de números fijos.
//   mínimo recomendado = venta por mes × «tarda en llegar»   (si vende al menos «mínimo» por mes; si no, 0)
//   máximo recomendado = venta por mes × «al pedir, cubrir»
//   mínimo que se usa  = el que escribiste a mano en el producto, o si no hay, el recomendado
//   BAJO = tiene stock, y el stock es igual o menor que ese mínimo. SIN STOCK = 0.
// Lo usan Inventario (estado, filtros, hoja de conteo), el Excel, Reportes → Inventario y el «Stock bajo» del Inicio.
// La venta por mes es la simple (ventas de los últimos «historia» meses ÷ historia); Reponer afina más (días con stock,
// tránsito), así que en el límite puede diferir en una unidad, pero la regla es la misma.

const n = (x: number) => Number.isFinite(x) ? Number(x) : 0

/** Subconsulta para `LEFT JOIN (…) ns ON ns.product_id = p.id`: min_rec, max_rec, min_ef (el que se usa). */
export function nivelStockSQL(reglas: ReglasStock) {
  const h = Math.max(1, Math.round(n(reglas.historia)))
  const venta = `(COALESCE(vh.q, 0)::float / ${h})`
  return `(
    SELECT p.id AS product_id,
           ${venta} AS venta_mes,
           CASE WHEN ${venta} >= ${n(reglas.minimo)} AND ${venta} > 0 THEN CEIL(${venta} * ${n(reglas.llegada)})::int ELSE 0 END AS min_rec,
           CASE WHEN ${venta} >= ${n(reglas.minimo)} AND ${venta} > 0 THEN CEIL(${venta} * ${n(reglas.objetivo)})::int ELSE 0 END AS max_rec,
           CASE WHEN COALESCE(i.min_stock, 0) > 0 THEN i.min_stock
                WHEN ${venta} >= ${n(reglas.minimo)} AND ${venta} > 0 THEN CEIL(${venta} * ${n(reglas.llegada)})::int
                ELSE 0 END AS min_ef
    FROM products p
    LEFT JOIN inventory i ON i.product_id = p.id
    LEFT JOIN (
      SELECT si.product_id, SUM(si.quantity) AS q
      FROM sales s JOIN sale_items si ON s.id = si.sale_id
      WHERE s.status IN ('PROCESADA','DESCARGADA','DESCARGADA_LOCAL') AND s.created_at >= NOW() - INTERVAL '${h} months'
      GROUP BY si.product_id
    ) vh ON vh.product_id = p.id
  )`
}

/** Estado de stock con el mínimo que se usa. */
export function estadoStock(qty: number, minEf: number): 'SIN_STOCK' | 'BAJO' | 'OK' {
  if (qty <= 0) return 'SIN_STOCK'
  if (minEf > 0 && qty <= minEf) return 'BAJO'
  return 'OK'
}
