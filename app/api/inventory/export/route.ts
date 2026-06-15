import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized } from '@/lib/session'
import * as XLSX from 'xlsx'

export async function GET(_: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()

  try {
    const { rows } = await db.query(`
      SELECT
        p.code, p.name, p.is_active,
        COALESCE(i.quantity, 0)                                          AS quantity,
        COALESCE(i.min_stock, 0)                                         AS min_stock,
        COALESCE(i.max_stock, 0)                                         AS max_stock,
        COALESCE(pp.total_cost, 0)                                       AS total_cost,
        COALESCE(i.sale_price, pp.final_price_usd, 0)                    AS sale_price,
        COALESCE(i.quantity, 0) * COALESCE(pp.total_cost, 0)            AS valor_costo,
        COALESCE(i.quantity, 0) * COALESCE(i.sale_price, pp.final_price_usd, 0) AS valor_venta
      FROM products p
      LEFT JOIN product_pricing pp ON p.id = pp.product_id
      LEFT JOIN inventory i        ON p.id = i.product_id
      WHERE p.is_active = TRUE
      ORDER BY p.code ASC
    `)

    const data = rows.map(r => {
      const qty = parseInt(r.quantity, 10) || 0
      const min = parseInt(r.min_stock, 10) || 0
      let estado = 'OK'
      if (qty === 0) estado = 'SIN STOCK'
      else if (qty <= min && min > 0) estado = 'BAJO'
      return {
        CODIGO:       r.code,
        PRODUCTO:     r.name,
        STOCK:        qty,
        MIN:          min,
        MAX:          parseInt(r.max_stock, 10) || 0,
        COSTO_UNIT:   Math.round(parseFloat(r.total_cost) * 100) / 100,
        PRECIO_VENTA: Math.round(parseFloat(r.sale_price) * 100) / 100,
        VALOR_COSTO:  Math.round(parseFloat(r.valor_costo) * 100) / 100,
        VALOR_VENTA:  Math.round(parseFloat(r.valor_venta) * 100) / 100,
        ESTADO:       estado,
      }
    })

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(data, {
      header: ['CODIGO','PRODUCTO','STOCK','MIN','MAX','COSTO_UNIT','PRECIO_VENTA','VALOR_COSTO','VALOR_VENTA','ESTADO'],
    })
    XLSX.utils.book_append_sheet(wb, ws, 'Inventario')
    const rawBuf: Uint8Array = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
    const buf = Buffer.from(rawBuf)

    const today = new Date().toISOString().slice(0, 10)
    return new NextResponse(buf as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename=inventario_${today}.xlsx`,
      },
    })
  } catch (err) {
    return apiError(err)
  }
}
