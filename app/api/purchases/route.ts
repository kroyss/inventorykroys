import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { z } from 'zod'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { resolveSupplierId } from '@/lib/suppliers'

const ORDERS_SQL = `
  SELECT
    po.id,
    po.order_number,
    po.status,
    po.order_type,
    po.total_usd::float  AS total_usd,
    po.total_paid::float AS total_paid,
    po.notes,
    po.tracking_info,
    po.is_incomplete,
    po.incomplete_note,
    po.reopen_count,
    u.username AS received_by,
    po.received_at,
    po.created_at,
    po.updated_at,
    s.id   AS supplier_id,
    s.name AS supplier_name,
    COALESCE(
      JSON_AGG(
        JSON_BUILD_OBJECT(
          'id',               poi.id,
          'product_id',       poi.product_id,
          'product_code',     p.code,
          'product_name',     p.name,
          'quantity',         poi.quantity,
          'unit_cost_usd',    poi.unit_cost_usd::float,
          'total_cost_usd',   poi.total_cost_usd::float,
          'received_qty',     poi.received_qty,
          'total_received_qty', poi.total_received_qty,
          'notes',            poi.notes
        ) ORDER BY poi.id
      ) FILTER (WHERE poi.id IS NOT NULL),
      '[]'::json
    ) AS items
  FROM purchase_orders po
  LEFT JOIN suppliers s ON po.supplier_id = s.id
  LEFT JOIN users     u ON po.received_by = u.id
  LEFT JOIN purchase_order_items poi ON po.id = poi.purchase_order_id
  LEFT JOIN products p ON poi.product_id = p.id
  WHERE po.order_type = 'local'
  GROUP BY po.id, s.id, u.username
  ORDER BY
    CASE po.status
      WHEN 'PENDIENTE'      THEN 0
      WHEN 'PAGADA'         THEN 1
      WHEN 'EN_CAMINO'      THEN 2
      WHEN 'RECIBIDA'       THEN 3
      WHEN 'PARCIAL'        THEN 4
      WHEN 'INCONSISTENTE'  THEN 5
      WHEN 'REABIERTA'      THEN 6
      WHEN 'FINALIZADA'     THEN 7
      ELSE 8
    END,
    po.updated_at DESC
`

const CreateSchema = z.object({
  supplier_id:   z.number().int().positive().nullable().optional(),
  supplier_name: z.string().optional(),
  notes:         z.string().optional(),
  total_paid:    z.number().nonnegative().default(0),
  items: z.array(z.object({
    product_id:    z.number().int().positive(),
    quantity:      z.number().int().positive(),
    unit_cost_usd: z.number().nonnegative(),
    notes:         z.string().optional(),
  })).min(1),
})

export async function GET(_: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()

  const { rows } = await db.query(ORDERS_SQL)
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (session.user.role !== 'admin') return forbidden()

  try {
    const body   = CreateSchema.parse(await req.json())
    const userId = parseInt(session.user.id, 10)

    // Generate next CL-XXXX number using MAX to avoid gaps from deletions
    const { rows: lastRows } = await db.query(`
      SELECT MAX(CAST(SUBSTRING(order_number FROM 4) AS INTEGER))
      FROM purchase_orders
      WHERE order_type = 'local' AND order_number ~ '^[A-Z]+-[0-9]+$'
    `)
    const lastNum = lastRows[0].max ?? 0
    const orderNumber = `CL-${String(lastNum + 1).padStart(4, '0')}`

    const totalUsd = body.items.reduce((s, i) => s + i.quantity * i.unit_cost_usd, 0)

    await db.query('BEGIN')
    try {
      const supplierId = await resolveSupplierId(db, {
        supplierId: body.supplier_id, supplierName: body.supplier_name, type: 'local',
      })
      const { rows: [order] } = await db.query(
        `INSERT INTO purchase_orders
           (order_number, supplier_id, status, order_type, total_usd, total_paid, notes, created_by)
         VALUES ($1, $2, 'PENDIENTE', 'local', $3, $4, $5, $6)
         RETURNING id`,
        [orderNumber, supplierId, totalUsd, body.total_paid, body.notes ?? null, userId]
      )
      for (const item of body.items) {
        await db.query(
          `INSERT INTO purchase_order_items
             (purchase_order_id, product_id, quantity, unit_cost_usd, total_cost_usd, notes)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [order.id, item.product_id, item.quantity, item.unit_cost_usd,
           item.quantity * item.unit_cost_usd, item.notes ?? null]
        )
      }
      await db.query('COMMIT')

      const { rows } = await db.query(`
        SELECT
          po.id, po.order_number, po.status, po.order_type,
          po.total_usd, po.total_paid, po.notes, po.tracking_info,
          po.is_incomplete, po.incomplete_note, po.reopen_count,
          u.username AS received_by,
          po.received_at, po.created_at, po.updated_at,
          po.supplier_id,
          s.name AS supplier_name,
          COALESCE(
            JSON_AGG(
              JSON_BUILD_OBJECT(
                'id', poi.id, 'product_id', poi.product_id,
                'product_code', p.code, 'product_name', p.name,
                'quantity', poi.quantity, 'unit_cost_usd', poi.unit_cost_usd,
                'total_cost_usd', poi.total_cost_usd,
                'received_qty', poi.received_qty,
                'total_received_qty', poi.total_received_qty,
                'notes', poi.notes
              ) ORDER BY poi.id
            ) FILTER (WHERE poi.id IS NOT NULL),
            '[]'::json
          ) AS items
        FROM purchase_orders po
        LEFT JOIN suppliers s ON po.supplier_id = s.id
        LEFT JOIN users     u ON po.received_by = u.id
        LEFT JOIN purchase_order_items poi ON po.id = poi.purchase_order_id
        LEFT JOIN products p ON poi.product_id = p.id
        WHERE po.id = $1
        GROUP BY po.id, s.id, u.username
      `, [order.id])
      return NextResponse.json(rows[0], { status: 201 })
    } catch (e) {
      await db.query('ROLLBACK')
      throw e
    }
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}
