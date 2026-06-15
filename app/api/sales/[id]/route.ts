import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { z } from 'zod'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()

  const { rows: [sale] } = await db.query(`
    SELECT
      s.id, s.ml_order_number, s.status, s.customer_name,
      s.total_amount::float    AS total_amount,
      s.discount_percent::float AS discount_percent,
      s.notes, s.created_at, s.updated_at,
      s.payment_verified_at, s.processed_at, s.reopen_count,
      uc.username AS created_by,
      uv.username AS verified_by,
      up.username AS processed_by,
      COALESCE(
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'id',           si.id,
            'product_id',   si.product_id,
            'product_name', p.name,
            'product_code', p.code,
            'quantity',     si.quantity,
            'unit_price',   si.unit_price::float,
            'total_price',  si.total_price::float,
            'notes',        si.notes
          ) ORDER BY si.id
        ) FILTER (WHERE si.id IS NOT NULL),
        '[]'::json
      ) AS items
    FROM sales s
    LEFT JOIN users uc ON s.created_by          = uc.id
    LEFT JOIN users uv ON s.payment_verified_by = uv.id
    LEFT JOIN users up ON s.processed_by        = up.id
    LEFT JOIN sale_items si ON si.sale_id = s.id
    LEFT JOIN products p    ON p.id = si.product_id
    WHERE s.id = $1
    GROUP BY s.id, uc.username, uv.username, up.username
  `, [id])

  if (!sale) return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 })
  return NextResponse.json(sale)
}

const EditSchema = z.object({
  ml_order_number:  z.string().min(1),
  customer_name:    z.string().optional(),
  discount_percent: z.number().min(0).max(100).default(0),
  notes:            z.string().optional(),
  items: z.array(z.object({
    product_id: z.number().int().positive(),
    quantity:   z.number().int().positive(),
    unit_price: z.number().nonnegative(),
    notes:      z.string().optional(),
  })).min(1),
})

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()

  try {
    const body = EditSchema.parse(await req.json())

    const { rows: [sale] } = await db.query(
      `SELECT id, status FROM sales WHERE id = $1`,
      [id]
    )
    if (!sale) return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 })
    if (!['BORRADOR', 'REABIERTA'].includes(sale.status)) {
      return NextResponse.json(
        { error: 'Solo se puede editar en BORRADOR o REABIERTA' },
        { status: 409 }
      )
    }

    // Check duplicate ml_order_number (exclude self)
    const { rows: dup } = await db.query(
      `SELECT id FROM sales WHERE ml_order_number = $1 AND id != $2`,
      [body.ml_order_number, id]
    )
    if (dup.length > 0) {
      return NextResponse.json({ error: 'Ya existe una venta con ese número de orden' }, { status: 400 })
    }

    const rawTotal = body.items.reduce((s, i) => s + i.quantity * i.unit_price, 0)
    const total = body.discount_percent > 0
      ? rawTotal * (1 - body.discount_percent / 100)
      : rawTotal

    await db.query('BEGIN')
    try {
      await db.query(
        `UPDATE sales
         SET ml_order_number=$1, customer_name=$2, total_amount=$3,
             discount_percent=$4, notes=$5, updated_at=NOW()
         WHERE id=$6`,
        [body.ml_order_number, body.customer_name ?? null, total,
         body.discount_percent, body.notes ?? null, id]
      )
      await db.query(`DELETE FROM sale_items WHERE sale_id = $1`, [id])
      for (const item of body.items) {
        await db.query(
          `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, total_price, notes)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [id, item.product_id, item.quantity, item.unit_price,
           item.quantity * item.unit_price, item.notes ?? null]
        )
      }
      await db.query('COMMIT')
      return NextResponse.json({ ok: true })
    } catch (e) {
      await db.query('ROLLBACK')
      throw e
    }
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()

  const { rows: [sale] } = await db.query(
    `SELECT id, status FROM sales WHERE id = $1`,
    [id]
  )
  if (!sale) return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 })
  if (sale.status !== 'BORRADOR') {
    return NextResponse.json({ error: 'Solo se pueden eliminar ventas en estado BORRADOR' }, { status: 409 })
  }

  await db.query(`DELETE FROM sale_items WHERE sale_id = $1`, [id])
  await db.query(`DELETE FROM sales WHERE id = $1`, [id])
  return NextResponse.json({ ok: true })
}
