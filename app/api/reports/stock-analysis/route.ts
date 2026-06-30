import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { localCostFactor } from '@/lib/localCost'

export async function GET(_: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (session.user.role !== 'admin') return forbidden()

  try {
    // CO: el costo (USD) se lleva a pesos (×TRM) para el margen vs precio de venta (pesos).
    const costFactor = await localCostFactor(session.user.country)
    const [{ rows: products }, { rows: localTransit }, { rows: importTransit }] = await Promise.all([
      db.query(`
        SELECT
          p.id, p.code, p.name,
          COALESCE(i.quantity, 0)                        AS stock_actual,
          COALESCE(i.min_stock, 0)                       AS min_stock,
          COALESCE(i.sale_price, pp.final_price_usd, 0)  AS sale_price,
          COALESCE(pp.total_cost, 0)                     AS cost,
          pc.name                                        AS categoria,
          pc.profit_percentage                           AS categoria_pct,
          pc.color                                       AS categoria_color,
          COALESCE(v6m.ventas_6m, 0)                     AS ventas_6m,
          -- "Disponible desde": primera llegada al inventario (primer movimiento IN),
          -- o la creación del producto si no hay movimientos. Sirve para no tratar
          -- como remate a lo que recién llegó y aún no tuvo tiempo de venderse.
          COALESCE(fin.first_in, p.created_at)           AS disponible_desde
        FROM products p
        LEFT JOIN inventory i ON p.id = i.product_id
        LEFT JOIN product_pricing pp ON p.id = pp.product_id
        LEFT JOIN profit_categories pc ON pp.profit_category_id = pc.id
        LEFT JOIN (
          SELECT si.product_id, SUM(si.quantity) AS ventas_6m
          FROM sale_items si
          JOIN sales s ON si.sale_id = s.id
          WHERE s.status IN ('PROCESADA','DESCARGADA','DESCARGADA_LOCAL')
            AND s.created_at >= NOW() - INTERVAL '6 months'
          GROUP BY si.product_id
        ) v6m ON v6m.product_id = p.id
        LEFT JOIN (
          SELECT product_id, MIN(created_at) AS first_in
          FROM inventory_movements
          WHERE movement_type = 'IN'
          GROUP BY product_id
        ) fin ON fin.product_id = p.id
        WHERE p.is_active = TRUE
        ORDER BY p.code ASC
      `),
      // Pending units in local purchase orders
      db.query(`
        SELECT poi.product_id,
               COALESCE(SUM(poi.quantity - GREATEST(COALESCE(poi.total_received_qty, 0), COALESCE(poi.received_qty, 0))), 0) AS pending
        FROM purchase_order_items poi
        JOIN purchase_orders po ON poi.purchase_order_id = po.id
        WHERE po.status IN ('PENDIENTE','PAGADA','EN_CAMINO','PARCIAL','RECIBIDA')
          AND poi.quantity > GREATEST(COALESCE(poi.total_received_qty, 0), COALESCE(poi.received_qty, 0))
        GROUP BY poi.product_id
      `),
      // Pending units in import orders
      db.query(`
        SELECT ioi.product_id,
               COALESCE(SUM(ioi.quantity - GREATEST(COALESCE(ioi.total_received_qty, 0), COALESCE(ioi.received_qty, 0))), 0) AS pending
        FROM import_order_items ioi
        JOIN import_orders io ON ioi.import_order_id = io.id
        WHERE io.status IN (
          'PENDIENTE','PAGO_PARCIAL','ESPERANDO_FOTOS','PAGADA',
          'EN_TRANSITO','ADUANA','EN_IMPORTADOR_PAGAR','EN_CAMINO','PARCIAL','RECIBIDA'
        )
          AND ioi.quantity > GREATEST(COALESCE(ioi.total_received_qty, 0), COALESCE(ioi.received_qty, 0))
        GROUP BY ioi.product_id
      `),
    ])

    const transitLocal:  Record<number, number> = {}
    const transitImport: Record<number, number> = {}
    for (const r of localTransit)  transitLocal[r.product_id]  = parseInt(r.pending, 10) || 0
    for (const r of importTransit) transitImport[r.product_id] = parseInt(r.pending, 10) || 0

    const reposicion: any[] = []
    const remate:     any[] = []
    const nuevos:     any[] = []

    // Umbral de cobertura: la importación tarda ~4 meses en llegar.
    const LEAD_MONTHS   = 4   // por debajo de esto, hay que reponer
    const URGENT_MONTHS = 2   // por debajo de esto (incluso con tránsito), es urgente
    const TARGET_MONTHS = 6   // objetivo de cobertura al pedir
    const NEW_GRACE_MONTHS = 3 // recién llegados: período de prueba antes de juzgarlos

    const now = Date.now()
    for (const r of products) {
      const stock        = parseInt(r.stock_actual, 10) || 0
      const ventas6m     = parseInt(r.ventas_6m, 10) || 0

      // Antigüedad desde que el producto llegó por primera vez al inventario.
      const desde        = r.disponible_desde ? new Date(r.disponible_desde).getTime() : now
      const mesesDisp    = Math.max(0, Math.round((now - desde) / (1000 * 60 * 60 * 24 * 30.44) * 10) / 10)
      const esNuevo      = mesesDisp < NEW_GRACE_MONTHS

      // Tasa de venta JUSTA: dividir por los meses que el producto estuvo disponible
      // (entre 1 y 6), no siempre por 6. Así un recién llegado que vende bien no
      // queda subestimado, ni uno nuevo sin ventas se confunde con remate.
      const divisorMeses = Math.min(6, Math.max(1, mesesDisp))
      const ventaMensual = Math.round((ventas6m / divisorMeses) * 10) / 10
      const enTransito   = (transitLocal[r.id] ?? 0) + (transitImport[r.id] ?? 0)
      const cost         = (parseFloat(r.cost) || 0) * costFactor
      const salePrice    = parseFloat(r.sale_price) || 0
      const margenUnit   = Math.round((salePrice - cost) * 100) / 100
      const gananciaMensual = Math.round(ventaMensual * margenUnit * 100) / 100

      // Cobertura en meses con stock actual, y contando lo que ya viene en camino.
      const cobertura      = ventaMensual > 0 ? Math.round((stock / ventaMensual) * 10) / 10 : 999
      const coberturaTotal = ventaMensual > 0 ? Math.round(((stock + enTransito) / ventaMensual) * 10) / 10 : 999

      // Sugerido: llevar hasta TARGET_MONTHS, descontando lo que ya viene en camino.
      const objetivoUnidades = Math.round((ventaMensual * TARGET_MONTHS))
      const sugerido = Math.max(0, objetivoUnidades - stock - enTransito)

      const base: Record<string, unknown> = {
        id:               r.id,
        code:             r.code,
        name:             r.name,
        categoria:        r.categoria ?? null,
        categoria_pct:    r.categoria_pct != null ? parseFloat(r.categoria_pct) : null,
        categoria_color:  r.categoria_color ?? null,
        stock_actual:     stock,
        min_stock:        parseInt(r.min_stock, 10) || 0,
        cost,
        sale_price:       salePrice,
        margen_unit:      margenUnit,
        ganancia_mensual: gananciaMensual,
        ventas_6m:        ventas6m,
        venta_mensual:    ventaMensual,
        meses_duracion:   cobertura,        // compat: misma columna que antes
        cobertura,
        cobertura_total:  coberturaTotal,
        en_transito:      enTransito,
        sugerido_comprar: sugerido,
        meses_disponible: mesesDisp,        // antigüedad desde la primera llegada
        es_nuevo:         esNuevo,
      }

      // Rotación muy baja con stock parado (≈ < 1 venta/mes según su antigüedad).
      if (ventaMensual < 1 && stock > 0) {
        // Si recién llegó, no es remate: aún no tuvo tiempo de venderse → "Nuevos".
        if (esNuevo) nuevos.push(base)
        else         remate.push(base)
        continue
      }

      // Reposición: lo que se agota antes del lead time de importación.
      if (ventaMensual > 0 && cobertura < LEAD_MONTHS) {
        let prioridad: 'URGENTE' | 'PEDIR' | 'EN_CAMINO'
        if (coberturaTotal >= LEAD_MONTHS)      prioridad = 'EN_CAMINO'   // lo que viene ya lo cubre
        else if (coberturaTotal < URGENT_MONTHS) prioridad = 'URGENTE'
        else                                     prioridad = 'PEDIR'

        base.prioridad = prioridad
        base.alerta = prioridad === 'EN_CAMINO'
          ? `🔵 ${enTransito} en camino cubren la demanda`
          : `⚠️ Aguanta ${coberturaTotal} m (importación tarda ${LEAD_MONTHS})`
        reposicion.push(base)
      }
    }

    const PRIO_RANK: Record<string, number> = { URGENTE: 0, PEDIR: 1, EN_CAMINO: 2 }
    reposicion.sort((a, b) =>
      (PRIO_RANK[a.prioridad] - PRIO_RANK[b.prioridad]) ||
      (a.cobertura_total - b.cobertura_total) ||
      (b.ganancia_mensual - a.ganancia_mensual)
    )

    return NextResponse.json({
      reposicion,
      remate: remate.sort((a, b) => a.ventas_6m - b.ventas_6m),
      // Recién llegados (en período de prueba): no se juzgan como remate todavía.
      nuevos: nuevos.sort((a, b) => a.meses_disponible - b.meses_disponible),
    })
  } catch (err) {
    return apiError(err)
  }
}
