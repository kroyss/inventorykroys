import { NextRequest, NextResponse } from 'next/server'
import { pasarPesos, PESOS_VINCULADOS, SQL_PESOS_DISTINTOS } from '@/lib/pesosML'
import { z } from 'zod'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { requestConnection } from '@/lib/requestConnection'
import { puede } from '@/lib/permisos'

const PRODUCTS_SQL = `
  SELECT
    p.id, p.code, p.name, p.is_active, p.costo_estimado,
    COALESCE(pp.base_cost,              0)::float AS base_cost,
    COALESCE(pp.shipping_cost,          0)::float AS shipping_cost,
    COALESCE(pp.total_cost,             0)::float AS total_cost,
    COALESCE(pp.base_price_usd,         0)::float AS base_price_usd,
    COALESCE(pp.published_price_usd,    0)::float AS published_price_usd,
    COALESCE(pp.final_price_usd,        0)::float AS final_price_usd,
    COALESCE(pp.price_bolivares,        0)::float AS price_bolivares,
    COALESCE(pp.current_discount_percent,0)::float AS discount_percent,
    pc.name                                         AS category_name,
    COALESCE(pp.ganancia_pct, pc.profit_percentage,      0)::float AS profit_percentage,
    pp.profit_category_id,
    pp.ganancia_pct::float AS ganancia_pct,
    p.weight_kg::float                            AS weight_kg,
    p.peso_origen,
    ${SQL_PESOS_DISTINTOS}                         AS pesos_ml,
    -- 14-11 (el dueño): columna Peso ME; cuándo se leyó del portal (la publicación vinculada más reciente).
    (SELECT to_char(MAX(mp.actualizado_at) AT TIME ZONE 'America/Caracas', 'DD/MM/YYYY') FROM product_ml_codes pm
      JOIN me_productos mp ON mp.publicacion = 'MLV' || split_part(pm.ml_code, ':', 1) AND mp.peso_kg > 0
      WHERE pm.product_id = p.id AND pm.is_active AND pm.unidades = 1) AS peso_me_at,
    COALESCE(inv.sale_price,            0)::float AS sale_price,
    COALESCE(inv.quantity,              0)::int   AS quantity
  FROM products p
  LEFT JOIN product_pricing   pp  ON p.id = pp.product_id
  LEFT JOIN profit_categories pc  ON pp.profit_category_id = pc.id
  LEFT JOIN inventory         inv ON p.id = inv.product_id
  LEFT JOIN (${PESOS_VINCULADOS}) pv ON pv.product_id = p.id
  ORDER BY p.is_active DESC, p.name
`

const CreateSchema = z.object({
  code:               z.string().min(1).max(50),
  name:               z.string().min(1).max(200),
  profit_category_id: z.number().int().positive().nullable().optional(),
  ganancia_pct:       z.number().min(0).max(200).nullable().optional(),   // 14-11 (mig. 179)
  base_cost:          z.number().nonnegative().default(0),
  shipping_cost:      z.number().nonnegative().default(0),
  base_price_usd:     z.number().nonnegative().default(0),
  published_price_usd:z.number().nonnegative().default(0),
  final_price_usd:    z.number().nonnegative().default(0),
  price_bolivares:    z.number().nonnegative().default(0),
  discount_percent:   z.number().min(0).max(100).default(0),
  sale_price:         z.number().nonnegative().default(0),
  weight_kg:          z.number().positive().nullable().optional(),
  ml_codes:           z.array(z.object({ account: z.string(), code: z.string() })).optional(),
})

export async function GET() {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()

  const { rows } = await db.query(PRODUCTS_SQL)
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const { session, db: pool } = await getSessionDb()
  if (!session || !pool) return unauthorized()
  // Una sola conexión para todo el request: las transacciones son atómicas.
  const db = await requestConnection(pool)
  if (!puede(session.user, 'ver_productos')) return forbidden()

  try {
    const body = CreateSchema.parse(await req.json())

    await db.query('BEGIN')
    try {
      const { rows: [product] } = await db.query(
        `INSERT INTO products (code, name, weight_kg) VALUES ($1, $2, $3) RETURNING id`,
        [body.code.toUpperCase(), body.name, body.weight_kg ?? null]
      )
      await db.query(
        `INSERT INTO product_pricing
           (product_id, base_cost, shipping_cost, total_cost, profit_category_id,
            base_price_usd, published_price_usd, final_price_usd,
            price_bolivares, current_discount_percent, ganancia_pct)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          product.id, body.base_cost, body.shipping_cost,
          // total_cost explícito (no depende del trigger trg_update_pricing_totals)
          body.base_cost + body.shipping_cost,
          body.profit_category_id ?? null,
          body.base_price_usd, body.published_price_usd,
          body.final_price_usd, body.price_bolivares, body.discount_percent, body.ganancia_pct ?? null,
        ]
      )
      const initialSalePrice = body.sale_price > 0 ? body.sale_price
        : body.final_price_usd > 0 ? body.final_price_usd : 0
      await db.query(
        `INSERT INTO inventory (product_id, quantity, min_stock, max_stock, sale_price)
         VALUES ($1, 0, 0, 0, $2)`,
        [product.id, initialSalePrice]
      )
      // Códigos ML (si vienen del formulario)
      for (const { account, code } of body.ml_codes ?? []) {
        if (!code.trim()) continue
        await db.query(
          `INSERT INTO product_ml_codes (product_id, ml_account, ml_code, is_active)
           VALUES ($1, $2, $3, TRUE)`,
          [product.id, account, code.trim()]
        )
      }
      await db.query('COMMIT')
      if (body.ml_codes?.some(c => c.code.trim())) await pasarPesos(db, { pedirME: Number(session.user.id) })   // 14-11: el peso de ML llega al vincular

      const { rows } = await db.query(
        `${PRODUCTS_SQL.replace('ORDER BY p.is_active DESC, p.name', 'WHERE p.id = $1')}`,
        [product.id]
      )
      return NextResponse.json(rows[0], { status: 201 })
    } catch (e) {
      await db.query('ROLLBACK')
      throw e
    }
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    const msg = String(err)
    if (msg.includes('unique') || msg.includes('duplicate'))
      return NextResponse.json({ error: 'El código ya existe' }, { status: 409 })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
