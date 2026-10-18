import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { facturasHabilitadas } from '@/lib/modulos'
import { calcInvoice, normalizeDoc, round2, MAX_INVOICE_LINES } from '@/lib/invoices'
import { getInvoice } from '@/lib/invoicesServer'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// PUT /api/invoices/[id]/corregir → corrige una factura EMITIDA con el MISMO número (18-10).
// Solo para cuando la hoja preimpresa todavía no se usó (se vio el error antes de imprimir): si la hoja ya
// se gastó, va "Anular y emitir con el siguiente número" (POST /api/invoices con replaces_id).
// Guarda en invoices.correcciones cómo estaba antes, quién y por qué.
const Schema = z.object({
  motivo:         z.string().trim().min(1, 'Indica qué corregiste'),
  control_number: z.string().max(30).optional(),
  invoice_date:   z.string().regex(DATE_RE),
  exchange_rate:  z.number().positive(),
  customer: z.object({
    name:              z.string().trim().min(1, 'El nombre del cliente es obligatorio'),
    doc:               z.string().trim().min(1, 'La cédula o RIF es obligatoria').max(20),
    address:           z.string().trim().min(1, 'La dirección es obligatoria'),
    phone:             z.string().trim().min(1, 'El teléfono es obligatorio').max(40),
    is_special:        z.boolean().default(false),
    retention_percent: z.number().min(0).max(100).default(75),
  }),
  with_iva: z.boolean(),
  iva_rate: z.number().min(0).max(100),
  items: z.array(z.object({
    product_id:     z.number().int().positive().nullable(),
    description:    z.string().trim().min(1, 'Cada línea necesita descripción'),
    quantity:       z.number().positive(),
    unit_price_usd: z.number().positive('Cada línea necesita su monto'),
  })).min(1).max(MAX_INVOICE_LINES, `La hoja admite máximo ${MAX_INVOICE_LINES} líneas`),
})

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (!facturasHabilitadas(session.user)) return forbidden()

  let body: z.infer<typeof Schema>
  try {
    body = Schema.parse(await req.json())
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? err.message }, { status: 400 })
    return apiError(err)
  }

  const userId = parseInt(session.user.id, 10)
  const doc = normalizeDoc(body.customer.doc)
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
    const { rows: [actual] } = await client.query(
      `SELECT id, status FROM invoices WHERE id = $1 FOR UPDATE`, [id]
    )
    if (!actual) { await client.query('ROLLBACK'); return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 }) }
    if (actual.status !== 'EMITIDA') {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Esta factura está anulada: no se puede corregir' }, { status: 409 })
    }

    // Cómo estaba antes (datos y líneas), para el historial.
    const antes = await getInvoice(client, id)
    const registro = {
      fecha: new Date().toISOString(), usuario: session.user.name ?? null, usuario_id: userId, motivo: body.motivo,
      antes: antes && {
        customer_name: antes.customer_name, customer_doc: antes.customer_doc, customer_address: antes.customer_address,
        customer_phone: antes.customer_phone, invoice_date: antes.invoice_date, exchange_rate: antes.exchange_rate,
        with_iva: antes.with_iva, iva_rate: antes.iva_rate, base_bs: antes.base_bs, iva_bs: antes.iva_bs,
        total_bs: antes.total_bs, control_number: antes.control_number,
        items: antes.items.map(it => ({ description: it.description, quantity: it.quantity, unit_price_usd: it.unit_price_usd, total_bs: it.total_bs })),
      },
    }

    let customerId: number | null = null
    if (doc) {
      const { rows: [c] } = await client.query(`
        INSERT INTO invoice_customers (doc_id, name, address, phone, is_special, retention_percent)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (empresa_id, doc_id) DO UPDATE SET
          name = EXCLUDED.name, address = EXCLUDED.address, phone = EXCLUDED.phone,
          is_special = EXCLUDED.is_special, retention_percent = EXCLUDED.retention_percent,
          updated_at = NOW()
        RETURNING id
      `, [doc, body.customer.name, body.customer.address, body.customer.phone, isSpecial, body.customer.retention_percent])
      customerId = c.id
    }

    await client.query(`
      UPDATE invoices SET
        control_number = $2, customer_id = $3, customer_name = $4, customer_doc = $5, customer_address = $6,
        customer_phone = $7, invoice_date = $8, exchange_rate = $9, with_iva = $10, iva_rate = $11,
        base_bs = $12, iva_bs = $13, total_bs = $14, is_special = $15, retention_percent = $16, retention_bs = $17,
        retention_status = CASE WHEN $17::numeric > 0 THEN (CASE WHEN retention_status = 'RECIBIDA' THEN 'RECIBIDA' ELSE 'PENDIENTE' END) ELSE 'NO_APLICA' END,
        correcciones = correcciones || $18::jsonb
      WHERE id = $1
    `, [
      id, body.control_number?.trim() || null, customerId, body.customer.name, doc || null, body.customer.address,
      body.customer.phone, body.invoice_date, rate, body.with_iva, calc.iva_rate,
      calc.base, calc.iva, calc.total, isSpecial, calc.retention_percent, calc.retention,
      JSON.stringify([registro]),
    ])

    await client.query(`DELETE FROM invoice_items WHERE invoice_id = $1`, [id])
    for (const [pos, l] of calc.lines.entries()) {
      await client.query(`
        INSERT INTO invoice_items (invoice_id, product_id, description, quantity, unit_price_usd, unit_price_bs, total_bs, position)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `, [id, l.product_id, l.description, l.quantity, l.unit_price_usd, l.unit_price_bs, l.total_bs, pos])
    }

    await client.query('COMMIT')
    return NextResponse.json(await getInvoice(db, id))
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    return apiError(err)
  } finally {
    client.release()
  }
}
