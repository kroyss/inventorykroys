import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { z } from 'zod'
import { getSessionDb, unauthorized } from '@/lib/session'

const ItemSchema = z.object({
  product_id:   z.number().int().positive(),
  quantity:     z.number().int().positive(),
  unit_price:   z.number().nonnegative(),
  notes:        z.string().optional(),
})

const CreateSchema = z.object({
  ml_order_number: z.string().min(1),
  customer_name:   z.string().optional(),
  discount_percent: z.number().min(0).max(100).default(0),
  notes:           z.string().optional(),
  items:           z.array(ItemSchema).min(1),
})

const VALID_STATUSES = new Set([
  'BORRADOR', 'PAGO_VERIFICADO', 'PROCESADA',
  'DESCARGADA', 'DESCARGADA_LOCAL', 'REABIERTA',
])

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function GET(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()

  const url      = new URL(req.url)
  const page     = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') ?? '10', 10) || 10))
  const statusF  = url.searchParams.get('status') ?? ''
  const searchQ  = (url.searchParams.get('search') ?? '').trim()
  const dateFromRaw = url.searchParams.get('date_from') ?? ''
  const dateToRaw   = url.searchParams.get('date_to') ?? ''

  const statusFilter = statusF && VALID_STATUSES.has(statusF) ? statusF : null
  const dateFrom     = DATE_RE.test(dateFromRaw) ? dateFromRaw : null
  const dateTo       = DATE_RE.test(dateToRaw)   ? dateToRaw   : null
  const offset       = (page - 1) * pageSize

  // Build the shared filter (search + date range) starting at a given param index.
  // Returns the SQL conditions joined with AND plus the matching params.
  const buildFilters = (startIdx: number) => {
    const conds: string[] = []
    const params: unknown[] = []
    let i = startIdx
    if (searchQ) {
      conds.push(`(
        s.ml_order_number ILIKE '%' || $${i} || '%'
        OR s.customer_name ILIKE '%' || $${i} || '%'
        OR s.notes ILIKE '%' || $${i} || '%'
        OR EXISTS (
          SELECT 1 FROM sale_items si2
          JOIN products p2 ON p2.id = si2.product_id
          WHERE si2.sale_id = s.id
            AND (p2.name ILIKE '%' || $${i} || '%' OR p2.code ILIKE '%' || $${i} || '%')
        )
      )`)
      params.push(searchQ); i++
    }
    if (dateFrom) { conds.push(`s.created_at >= $${i}::date`); params.push(dateFrom); i++ }
    if (dateTo)   { conds.push(`s.created_at < ($${i}::date + INTERVAL '1 day')`); params.push(dateTo); i++ }
    return { sql: conds.length ? conds.join(' AND ') : 'TRUE', params, nextIdx: i }
  }

  // Chip counts: search + dates, but NOT status (so the user always sees totals per state)
  const countFilter = buildFilters(1)
  const countSql = `
    SELECT
      COUNT(*)                                                      AS total_all,
      COUNT(*) FILTER (WHERE status = 'BORRADOR')                   AS count_borrador,
      COUNT(*) FILTER (WHERE status = 'PAGO_VERIFICADO')            AS count_verificado,
      COUNT(*) FILTER (WHERE status = 'PROCESADA')                  AS count_procesada,
      COUNT(*) FILTER (WHERE status = 'DESCARGADA')                 AS count_descargada,
      COUNT(*) FILTER (WHERE status = 'DESCARGADA_LOCAL')           AS count_descargada_local,
      COUNT(*) FILTER (WHERE status = 'REABIERTA')                  AS count_reabierta
    FROM sales s
    WHERE ${countFilter.sql}
  `
  const countParams = countFilter.params

  // Rows: $1=pageSize, $2=offset, then search/date params, then optional status
  const rowsFilter = buildFilters(3)
  const rowsParams: unknown[] = [pageSize, offset, ...rowsFilter.params]
  let statusClause = ''
  if (statusFilter) {
    rowsParams.push(statusFilter)
    statusClause = `AND s.status = $${rowsFilter.nextIdx}`
  }
  const finalSearchPredicate = rowsFilter.sql

  const rowsSql = `
    SELECT
      s.id, s.ml_order_number, s.status, s.customer_name,
      s.total_amount::float    AS total_amount,
      s.discount_percent::float AS discount_percent,
      s.notes,
      s.created_at, s.updated_at, s.payment_verified_at, s.processed_at,
      s.reopen_count,
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
    WHERE ${finalSearchPredicate}
    ${statusClause}
    GROUP BY s.id, uc.username, uv.username, up.username
    ORDER BY s.created_at DESC, s.ml_order_number DESC
    LIMIT $1 OFFSET $2
  `

  const [counts, rows] = await Promise.all([
    db.query(countSql, countParams),
    db.query(rowsSql, rowsParams),
  ])

  const c = counts.rows[0]
  return NextResponse.json({
    rows: rows.rows,
    page,
    pageSize,
    total: parseInt(c.total_all, 10),
    counts: {
      all:               parseInt(c.total_all, 10),
      BORRADOR:          parseInt(c.count_borrador, 10),
      PAGO_VERIFICADO:   parseInt(c.count_verificado, 10),
      PROCESADA:         parseInt(c.count_procesada, 10),
      DESCARGADA:        parseInt(c.count_descargada, 10),
      DESCARGADA_LOCAL:  parseInt(c.count_descargada_local, 10),
      REABIERTA:         parseInt(c.count_reabierta, 10),
    },
  })
}

export async function POST(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()

  try {
    const body   = CreateSchema.parse(await req.json())
    const userId = parseInt(session.user.id, 10)

    const { rows: dup } = await db.query(
      `SELECT id FROM sales WHERE ml_order_number = $1`,
      [body.ml_order_number]
    )
    if (dup.length > 0) {
      return NextResponse.json({ error: 'Ya existe una venta con ese número de orden ML' }, { status: 400 })
    }

    const rawTotal = body.items.reduce((s, i) => s + i.quantity * i.unit_price, 0)
    const total = body.discount_percent > 0
      ? rawTotal * (1 - body.discount_percent / 100)
      : rawTotal

    await db.query('BEGIN')
    try {
      const { rows: [sale] } = await db.query(
        `INSERT INTO sales
           (ml_order_number, status, customer_name, total_amount, discount_percent, notes, created_by)
         VALUES ($1, 'BORRADOR', $2, $3, $4, $5, $6)
         RETURNING id`,
        [body.ml_order_number, body.customer_name ?? null, total,
         body.discount_percent, body.notes ?? null, userId]
      )
      for (const item of body.items) {
        await db.query(
          `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, total_price, notes)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [sale.id, item.product_id, item.quantity, item.unit_price,
           item.quantity * item.unit_price, item.notes ?? null]
        )
      }
      await db.query('COMMIT')
      return NextResponse.json({ id: sale.id, message: 'Venta registrada en BORRADOR' }, { status: 201 })
    } catch (e) {
      await db.query('ROLLBACK')
      throw e
    }
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}
