import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { z } from 'zod'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'

const UpdateSchema = z.object({
  name:               z.string().min(1).max(200).optional(),
  profit_category_id: z.number().int().positive().nullable().optional(),
  base_cost:          z.number().nonnegative().optional(),
  shipping_cost:      z.number().nonnegative().optional(),
  base_price_usd:     z.number().nonnegative().optional(),
  published_price_usd:z.number().nonnegative().optional(),
  final_price_usd:    z.number().nonnegative().optional(),
  price_bolivares:    z.number().nonnegative().optional(),
  discount_percent:   z.number().min(0).max(100).optional(),
  sale_price:         z.number().nonnegative().optional(),
  ml_codes:           z.array(z.object({ account: z.string(), code: z.string() })).optional(),
})

/** GET /api/products/[id] — detalle con ml_codes */
export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()

  const { rows } = await db.query(
    `SELECT
       p.id, p.code, p.name, p.is_active,
       COALESCE(pp.base_cost,              0)::float AS base_cost,
       COALESCE(pp.shipping_cost,          0)::float AS shipping_cost,
       COALESCE(pp.total_cost,             0)::float AS total_cost,
       COALESCE(pp.base_price_usd,         0)::float AS base_price_usd,
       COALESCE(pp.published_price_usd,    0)::float AS published_price_usd,
       COALESCE(pp.final_price_usd,        0)::float AS final_price_usd,
       COALESCE(pp.price_bolivares,        0)::float AS price_bolivares,
       COALESCE(pp.current_discount_percent,0)::float AS discount_percent,
       pc.name                                         AS category_name,
       COALESCE(pc.profit_percentage,      0)::float AS profit_percentage,
       pp.profit_category_id,
       COALESCE(inv.sale_price,            0)::float AS sale_price,
       COALESCE(inv.quantity,              0)::int   AS quantity
     FROM products p
     LEFT JOIN product_pricing   pp  ON p.id = pp.product_id
     LEFT JOIN profit_categories pc  ON pp.profit_category_id = pc.id
     LEFT JOIN inventory         inv ON p.id = inv.product_id
     WHERE p.id = $1`,
    [id]
  )
  if (!rows[0]) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const { rows: mlRows } = await db.query(
    `SELECT ml_account AS account, ml_code AS code
     FROM product_ml_codes WHERE product_id = $1 AND is_active = TRUE`,
    [id]
  )
  return NextResponse.json({ ...rows[0], ml_codes: mlRows })
}

/** PUT /api/products/[id] */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (session.user.role !== 'admin') return forbidden()

  try {
    const body = UpdateSchema.parse(await req.json())

    await db.query('BEGIN')
    try {
      if (body.name !== undefined) {
        await db.query(`UPDATE products SET name = $1 WHERE id = $2`, [body.name, id])
      }

      const pricingFields: [string, unknown][] = []
      if (body.profit_category_id  !== undefined) pricingFields.push(['profit_category_id',      body.profit_category_id])
      if (body.base_cost           !== undefined) pricingFields.push(['base_cost',               body.base_cost])
      if (body.shipping_cost       !== undefined) pricingFields.push(['shipping_cost',            body.shipping_cost])
      // total_cost explícito (no depende del trigger): se actualiza cuando vienen ambos costos
      if (body.base_cost !== undefined && body.shipping_cost !== undefined)
        pricingFields.push(['total_cost', body.base_cost + body.shipping_cost])
      if (body.base_price_usd      !== undefined) pricingFields.push(['base_price_usd',           body.base_price_usd])
      if (body.published_price_usd !== undefined) pricingFields.push(['published_price_usd',      body.published_price_usd])
      if (body.final_price_usd     !== undefined) pricingFields.push(['final_price_usd',          body.final_price_usd])
      if (body.price_bolivares     !== undefined) pricingFields.push(['price_bolivares',          body.price_bolivares])
      if (body.discount_percent    !== undefined) pricingFields.push(['current_discount_percent', body.discount_percent])

      if (pricingFields.length > 0) {
        const sets = pricingFields.map(([col], i) => `${col} = $${i + 1}`).join(', ')
        const vals = pricingFields.map(([, v]) => v)
        vals.push(id)
        await db.query(
          `UPDATE product_pricing SET ${sets} WHERE product_id = $${vals.length}`,
          vals
        )
      }

      // Explicit sale_price update, or auto-sync from final_price_usd (legacy behavior)
      if (body.sale_price !== undefined) {
        await db.query(
          `UPDATE inventory SET sale_price = $1 WHERE product_id = $2`,
          [body.sale_price, id]
        )
      } else if (body.final_price_usd !== undefined && body.final_price_usd > 0) {
        await db.query(
          `UPDATE inventory SET sale_price = $1 WHERE product_id = $2`,
          [body.final_price_usd, id]
        )
      }

      if (body.ml_codes !== undefined) {
        // La tabla product_ml_codes no tiene índice único (product_id, ml_account),
        // así que no se puede usar ON CONFLICT. Igual que legacy: borrar y reinsertar.
        await db.query(`DELETE FROM product_ml_codes WHERE product_id = $1`, [id])
        for (const { account, code } of body.ml_codes) {
          if (!code.trim()) continue
          await db.query(
            `INSERT INTO product_ml_codes (product_id, ml_account, ml_code, is_active)
             VALUES ($1, $2, $3, TRUE)`,
            [id, account, code.trim()]
          )
        }
      }

      await db.query('COMMIT')
    } catch (e) {
      await db.query('ROLLBACK')
      throw e
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}
