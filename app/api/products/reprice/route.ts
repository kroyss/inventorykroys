import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { z } from 'zod'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'

// PUT /api/products/reprice — cambia la categoría de ganancia de varios productos
// (VE) y deja sus precios guardados al día, en una sola transacción.
//
// batch-category solo cambiaba la categoría: el catálogo recalcula en vivo, así
// que se veía bien, pero el precio de inventario (que usan ventas, reportes y la
// hoja de inventario) y el precio final guardado quedaban con la categoría vieja.
// Los precios llegan calculados por el cliente con storedPricesVE (lib/pricingVE),
// igual que al guardar la ficha de un producto.

const Item = z.object({
  product_id:          z.number().int().positive(),
  profit_category_id:  z.number().int().positive(),
  base_price_usd:      z.number().nonnegative(),
  published_price_usd: z.number().nonnegative(),
  final_price_usd:     z.number().nonnegative(),
  price_bolivares:     z.number().nonnegative(),
  discount_percent:    z.number().min(0).max(100),
  sale_price:          z.number().nonnegative(),
})
const Schema = z.object({ items: z.array(Item).min(1).max(500) })

export async function PUT(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (session.user.role !== 'admin') return forbidden()
  if (session.user.country !== 'VE') {
    return NextResponse.json({ error: 'Solo disponible para Venezuela' }, { status: 400 })
  }

  try {
    const { items } = Schema.parse(await req.json())
    // Conexión DEDICADA para la transacción: `db` es un Pool y cada db.query puede
    // ir a una conexión distinta, así que BEGIN/COMMIT sobre el pool no garantiza
    // que todo quede en la misma transacción.
    const client = await db.connect()
    try {
      await client.query('BEGIN')
      for (const it of items) {
        await client.query(
          `UPDATE product_pricing
              SET profit_category_id       = $1,
                  base_price_usd           = $2,
                  published_price_usd      = $3,
                  final_price_usd          = $4,
                  price_bolivares          = $5,
                  current_discount_percent = $6
            WHERE product_id = $7`,
          [it.profit_category_id, it.base_price_usd, it.published_price_usd, it.final_price_usd,
           it.price_bolivares, it.discount_percent, it.product_id]
        )
        await client.query(
          `UPDATE inventory SET sale_price = $1 WHERE product_id = $2`,
          [it.sale_price, it.product_id]
        )
      }
      await client.query('COMMIT')
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {})
      throw e
    } finally {
      client.release()
    }
    return NextResponse.json({ updated: items.length })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}
