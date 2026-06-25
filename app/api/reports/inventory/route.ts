import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { localCostFactor } from '@/lib/localCost'

export async function GET(_: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (session.user.role !== 'admin') return forbidden()

  try {
    // Valuación de inventario "a hoy": en CO el costo (USD) se expresa en pesos (×TRM)
    // para que cuadre con el precio de venta en pesos. VE: factor 1.
    const costFactor = await localCostFactor(session.user.country)
    const { rows } = await db.query(`
      SELECT
        p.code, p.name, p.is_active,
        COALESCE(pp.total_cost, 0)                                        AS total_cost,
        COALESCE(i.sale_price, pp.final_price_usd, 0)                     AS sale_price,
        COALESCE(i.quantity, 0)                                           AS quantity,
        COALESCE(i.min_stock, 0)                                          AS min_stock,
        COALESCE(i.quantity, 0) * COALESCE(pp.total_cost, 0)             AS valor_costo,
        COALESCE(i.quantity, 0) * COALESCE(i.sale_price, pp.final_price_usd, 0) AS valor_venta
      FROM products p
      LEFT JOIN product_pricing pp ON p.id = pp.product_id
      LEFT JOIN inventory i        ON p.id = i.product_id
      WHERE p.is_active = TRUE
      ORDER BY p.code ASC
    `)

    let totalCostValue = 0
    let totalSaleValue = 0
    let totalUnits     = 0

    const items = rows.map(r => {
      const qty        = parseInt(r.quantity, 10) || 0
      const minStock   = parseInt(r.min_stock, 10) || 0
      const valorCosto = (parseFloat(r.valor_costo) || 0) * costFactor
      const valorVenta = parseFloat(r.valor_venta) || 0

      let status = 'OK'
      if (qty === 0) status = 'SIN_STOCK'
      else if (qty <= minStock && minStock > 0) status = 'BAJO'

      totalCostValue += valorCosto
      totalSaleValue += valorVenta
      totalUnits     += qty

      return {
        code:        r.code,
        name:        r.name,
        total_cost:  Math.round((parseFloat(r.total_cost) || 0) * costFactor * 100) / 100,
        sale_price:  parseFloat(r.sale_price) || 0,
        quantity:    qty,
        min_stock:   minStock,
        status,
        valor_costo: Math.round(valorCosto * 100) / 100,
        valor_venta: Math.round(valorVenta * 100) / 100,
      }
    })

    return NextResponse.json({
      items,
      totals: {
        total_cost_value: Math.round(totalCostValue * 100) / 100,
        total_sale_value: Math.round(totalSaleValue * 100) / 100,
        total_units:      totalUnits,
        count:            items.length,
      },
    })
  } catch (err) {
    return apiError(err)
  }
}
