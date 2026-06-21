import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { z } from 'zod'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { resolveSupplierId } from '@/lib/suppliers'

const IMPORTS_SQL = `
  SELECT
    io.id, io.order_number, io.status,
    io.total_usd,
    io.paid_50_done,  io.paid_50_at,  io.paid_50_amount,
    io.paid_100_done, io.paid_100_at, io.paid_100_amount,
    io.tracking_number, io.shipping_company, io.shipping_number,
    io.shipping_cost, io.insurance_cost, io.customs_cost, io.warehouse_cost,
    io.photos_notes, io.origin_country, io.notes, io.box_count,
    io.received_by, io.received_at,
    io.created_at, io.updated_at,
    s.name AS supplier_name,
    s.id   AS supplier_id,
    uc.username AS created_by,
    (SELECT COUNT(*) FROM import_order_files f WHERE f.import_order_id = io.id) AS file_count,
    COALESCE(
      JSON_AGG(
        JSON_BUILD_OBJECT(
          'id',               ioi.id,
          'product_id',       ioi.product_id,
          'product_name',     p.name,
          'product_code',     p.code,
          'quantity',         ioi.quantity,
          'unit_cost_usd',    ioi.unit_cost_usd,
          'total_cost_usd',   ioi.total_cost_usd,
          'received_qty',     COALESCE(ioi.received_qty, 0),
          'total_received_qty', COALESCE(ioi.total_received_qty, 0),
          'notes',            ioi.notes
        ) ORDER BY ioi.id
      ) FILTER (WHERE ioi.id IS NOT NULL),
      '[]'::json
    ) AS items
  FROM import_orders io
  LEFT JOIN suppliers s  ON io.supplier_id = s.id
  LEFT JOIN users uc     ON io.created_by  = uc.id
  LEFT JOIN import_order_items ioi ON ioi.import_order_id = io.id
  LEFT JOIN products p ON p.id = ioi.product_id
  GROUP BY io.id, s.id, uc.username
  ORDER BY io.updated_at DESC
`

const ItemSchema = z.object({
  product_id:    z.number().int().positive(),
  quantity:      z.number().int().positive(),
  unit_cost_usd: z.number().nonnegative(),
  notes:         z.string().optional(),
})

const CreateSchema = z.object({
  supplier_id:    z.number().int().positive().nullable().optional(),
  supplier_name:  z.string().optional(),
  origin_country: z.string().optional(),
  notes:          z.string().optional(),
  items:          z.array(ItemSchema).min(1),
})

export async function GET(_: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()

  const { rows } = await db.query(IMPORTS_SQL)
  return NextResponse.json(rows.map(r => ({
    ...r,
    total_usd:        parseFloat(r.total_usd) || 0,
    paid_50_amount:   parseFloat(r.paid_50_amount) || 0,
    paid_100_amount:  parseFloat(r.paid_100_amount) || 0,
    shipping_cost:    parseFloat(r.shipping_cost) || 0,
    insurance_cost:   parseFloat(r.insurance_cost) || 0,
    customs_cost:     parseFloat(r.customs_cost) || 0,
    warehouse_cost:   parseFloat(r.warehouse_cost) || 0,
    box_count:        parseInt(r.box_count) || 0,
    file_count:       parseInt(r.file_count) || 0,
    supplier_name:    r.supplier_name ?? 'Sin proveedor',
  })))
}

export async function POST(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (session.user.role !== 'admin') return forbidden()

  try {
    const body   = CreateSchema.parse(await req.json())
    const userId = parseInt(session.user.id, 10)

    // Generate next IMP-XXXX number via MAX
    const { rows: [numRow] } = await db.query(`
      SELECT MAX(CAST(SUBSTRING(order_number FROM 5) AS INTEGER))
      FROM import_orders
      WHERE order_number ~ '^IMP-[0-9]+$'
    `)
    const lastNum     = numRow.max ?? 0
    const orderNumber = `IMP-${String(lastNum + 1).padStart(4, '0')}`

    const totalUsd = body.items.reduce((s, i) => s + i.quantity * i.unit_cost_usd, 0)

    await db.query('BEGIN')
    try {
      const supplierId = await resolveSupplierId(db, {
        supplierId: body.supplier_id, supplierName: body.supplier_name, type: 'import',
      })
      const { rows: [order] } = await db.query(
        `INSERT INTO import_orders
           (order_number, supplier_id, status, total_usd, origin_country, notes, created_by)
         VALUES ($1, $2, 'PENDIENTE', $3, $4, $5, $6)
         RETURNING id`,
        [orderNumber, supplierId, totalUsd,
         body.origin_country ?? null, body.notes ?? null, userId]
      )
      for (const item of body.items) {
        await db.query(
          `INSERT INTO import_order_items
             (import_order_id, product_id, quantity, unit_cost_usd, total_cost_usd, notes)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [order.id, item.product_id, item.quantity, item.unit_cost_usd,
           item.quantity * item.unit_cost_usd, item.notes ?? null]
        )
      }
      await db.query('COMMIT')
      return NextResponse.json({ id: order.id, order_number: orderNumber, message: 'Importación creada exitosamente' }, { status: 201 })
    } catch (e) {
      await db.query('ROLLBACK')
      throw e
    }
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}
