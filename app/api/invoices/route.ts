import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { calcInvoice, normalizeDoc, round2, MAX_INVOICE_LINES } from '@/lib/invoices'
import { getInvoice, listInvoices, nextInvoiceNumber } from '@/lib/invoicesServer'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// GET /api/invoices?status=&retention=PENDIENTE&search=&sale_id=&date_from=&date_to=
export async function GET(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (session.user.country !== 'VE') return forbidden()

  try {
    const sp = req.nextUrl.searchParams
    const conds: string[] = []
    const params: unknown[] = []
    const add = (sql: string, v: unknown) => { params.push(v); conds.push(sql.replace('?', `$${params.length}`)) }

    const status = sp.get('status')
    if (status === 'EMITIDA' || status === 'ANULADA') add('i.status = ?', status)
    if (sp.get('retention') === 'PENDIENTE') conds.push(`i.retention_status = 'PENDIENTE' AND i.status = 'EMITIDA'`)
    const saleId = sp.get('sale_id')
    if (saleId && /^\d+$/.test(saleId)) add('i.sale_id = ?', saleId)
    const from = sp.get('date_from') ?? ''
    const to   = sp.get('date_to') ?? ''
    if (DATE_RE.test(from)) add('i.invoice_date >= ?::date', from)
    if (DATE_RE.test(to))   add('i.invoice_date <= ?::date', to)
    const search = (sp.get('search') ?? '').trim()
    if (search) {
      params.push(search)
      const p = `$${params.length}`
      conds.push(`(
        i.invoice_number::text = ${p}
        OR i.customer_name ILIKE '%' || ${p} || '%'
        OR i.customer_doc  ILIKE '%' || ${p} || '%'
        OR s.ml_order_number ILIKE '%' || ${p} || '%'
      )`)
    }

    const rows = await listInvoices(db, conds.length ? conds.join(' AND ') : 'TRUE', params)
    return NextResponse.json(rows)
  } catch (err) {
    return apiError(err)
  }
}

const CreateSchema = z.object({
  sale_id:        z.number().int().positive().nullable(),
  invoice_number: z.number().int().positive().optional(),
  control_number: z.string().max(30).optional(),
  invoice_date:   z.string().regex(DATE_RE),
  exchange_rate:  z.number().positive(),
  customer: z.object({
    name:              z.string().trim().min(1, 'El nombre del cliente es obligatorio'),
    doc:               z.string().max(20).optional(),
    address:           z.string().optional(),
    phone:             z.string().max(40).optional(),
    is_special:        z.boolean().default(false),
    retention_percent: z.number().min(0).max(100).default(75),
  }),
  with_iva: z.boolean(),
  iva_rate: z.number().min(0).max(100),
  items: z.array(z.object({
    product_id:     z.number().int().positive().nullable(),
    description:    z.string().trim().min(1, 'Cada línea necesita descripción'),
    quantity:       z.number().positive(),
    unit_price_usd: z.number().nonnegative(),
  })).min(1).max(MAX_INVOICE_LINES, `La hoja admite máximo ${MAX_INVOICE_LINES} líneas`),
  notes:       z.string().optional(),
  // Reimpresión en hoja nueva: anula esta factura y la reemplaza por la nueva.
  replaces_id: z.number().int().positive().optional(),
  void_reason: z.string().trim().optional(),
})

// POST /api/invoices → emitir (y opcionalmente anular la que reemplaza)
export async function POST(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (session.user.country !== 'VE') return forbidden()

  let body: z.infer<typeof CreateSchema>
  try {
    body = CreateSchema.parse(await req.json())
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? err.message }, { status: 400 })
    return apiError(err)
  }
  if (body.replaces_id && !body.void_reason) {
    return NextResponse.json({ error: 'Indicá el motivo de la anulación' }, { status: 400 })
  }

  const userId = parseInt(session.user.id, 10)
  const doc = normalizeDoc(body.customer.doc ?? '')
  // Sin RIF/CI = consumidor final: no puede ser contribuyente especial.
  const isSpecial = !!doc && body.customer.is_special
  const rate = body.exchange_rate

  const lines = body.items.map(it => ({ ...it, unit_price_bs: round2(it.unit_price_usd * rate) }))
  const calc = calcInvoice({
    lines, with_iva: body.with_iva, iva_rate: body.iva_rate,
    is_special: isSpecial, retention_percent: body.customer.retention_percent,
  })

  const client = await db.connect()
  try {
    await client.query('BEGIN')
    // Serializa la numeración: dos personas facturando a la vez no toman el mismo número.
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('invoices_number'))`)

    if (body.sale_id) {
      const { rows: [sale] } = await client.query(`SELECT id FROM sales WHERE id = $1`, [body.sale_id])
      if (!sale) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 })
      }
    }

    if (body.replaces_id) {
      const { rowCount } = await client.query(`
        UPDATE invoices SET status = 'ANULADA', void_reason = $2, voided_at = NOW(), voided_by = $3
        WHERE id = $1 AND status = 'EMITIDA'
      `, [body.replaces_id, body.void_reason, userId])
      if (!rowCount) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'La factura a reemplazar no existe o ya está anulada' }, { status: 409 })
      }
    }

    if (body.sale_id) {
      const { rows: [dup] } = await client.query(
        `SELECT invoice_number FROM invoices WHERE sale_id = $1 AND status = 'EMITIDA'`, [body.sale_id]
      )
      if (dup) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: `Esta venta ya tiene la factura #${dup.invoice_number}` }, { status: 409 })
      }
    }

    const number = body.invoice_number ?? await nextInvoiceNumber(client)
    const { rows: [taken] } = await client.query(`SELECT 1 FROM invoices WHERE invoice_number = $1`, [number])
    if (taken) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: `El número de factura ${number} ya existe` }, { status: 409 })
    }

    let customerId: number | null = null
    if (doc) {
      const { rows: [c] } = await client.query(`
        INSERT INTO invoice_customers (doc_id, name, address, phone, is_special, retention_percent)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (doc_id) DO UPDATE SET
          name = EXCLUDED.name, address = EXCLUDED.address, phone = EXCLUDED.phone,
          is_special = EXCLUDED.is_special, retention_percent = EXCLUDED.retention_percent,
          updated_at = NOW()
        RETURNING id
      `, [doc, body.customer.name, body.customer.address || null, body.customer.phone || null,
          isSpecial, body.customer.retention_percent])
      customerId = c.id
    }

    const { rows: [inv] } = await client.query(`
      INSERT INTO invoices (
        invoice_number, control_number, sale_id, customer_id,
        customer_name, customer_doc, customer_address, customer_phone,
        invoice_date, exchange_rate, with_iva, iva_rate, base_bs, iva_bs, total_bs,
        is_special, retention_percent, retention_bs, retention_status, notes, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
      RETURNING id
    `, [
      number, body.control_number?.trim() || null, body.sale_id, customerId,
      body.customer.name, doc || null, body.customer.address?.trim() || null, body.customer.phone?.trim() || null,
      body.invoice_date, rate, body.with_iva, calc.iva_rate, calc.base, calc.iva, calc.total,
      isSpecial, calc.retention_percent, calc.retention, calc.retention > 0 ? 'PENDIENTE' : 'NO_APLICA',
      body.notes?.trim() || null, userId,
    ])

    for (const [pos, l] of calc.lines.entries()) {
      await client.query(`
        INSERT INTO invoice_items (invoice_id, product_id, description, quantity, unit_price_usd, unit_price_bs, total_bs, position)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `, [inv.id, l.product_id, l.description, l.quantity, l.unit_price_usd, l.unit_price_bs, l.total_bs, pos])
    }

    if (body.replaces_id) {
      await client.query(`UPDATE invoices SET replaced_by = $1 WHERE id = $2`, [inv.id, body.replaces_id])
    }

    await client.query('COMMIT')
    return NextResponse.json(await getInvoice(db, inv.id), { status: 201 })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    return apiError(err)
  } finally {
    client.release()
  }
}
