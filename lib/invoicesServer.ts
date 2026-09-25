// Facturación: acceso a DB (solo servidor).
import type { Pool, PoolClient } from 'pg'
import type { Invoice, InvoiceConfig } from '@/lib/invoices'

type Q = Pool | PoolClient

const num = (v: unknown, def = 0) => {
  const n = parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : def
}

export async function readInvoiceConfig(db: Q): Promise<InvoiceConfig> {
  const { rows } = await db.query(
    `SELECT key, value FROM app_settings WHERE key LIKE 'factura_%'`
  )
  const s: Record<string, string> = {}
  for (const r of rows) s[r.key] = r.value
  const start = Math.max(1, Math.trunc(num(s.factura_numero_inicial, 1)))
  return {
    next_number: await nextInvoiceNumber(db, start),
    start_number: start,
    iva:      num(s.factura_iva, 16),
    offset_x: num(s.factura_offset_x, 0),
    offset_y: num(s.factura_offset_y, 0),
    copy_offset_x: num(s.factura_copia_offset_x, 0),
    copy_offset_y: num(s.factura_copia_offset_y, 0),
  }
}

/**
 * Siguiente correlativo: último + 1, salvo que el número inicial configurado sea mayor
 * (sirve para arrancar en el número donde quedó el Excel, o saltar a un talonario nuevo).
 */
export async function nextInvoiceNumber(db: Q, start?: number): Promise<number> {
  if (start === undefined) {
    const { rows: [r] } = await db.query(
      `SELECT value FROM app_settings WHERE key = 'factura_numero_inicial'`
    )
    start = Math.max(1, Math.trunc(num(r?.value, 1)))
  }
  const { rows: [m] } = await db.query(`SELECT MAX(invoice_number) AS m FROM invoices`)
  return Math.max(start, (m?.m ?? 0) + 1)
}

/** Tasa oficial BCV vigente para una fecha (la última cargada con rate_date <= fecha). */
export async function bcvRateFor(db: Q, ymd: string): Promise<{ rate: number; rate_date: string } | null> {
  const { rows: [r] } = await db.query(`
    SELECT official_rate::float AS rate, to_char(rate_date, 'YYYY-MM-DD') AS rate_date
    FROM venezuela_exchange_rates
    WHERE rate_date <= $1::date
    ORDER BY rate_date DESC, created_at DESC LIMIT 1
  `, [ymd])
  return r ? { rate: r.rate, rate_date: r.rate_date } : null
}

const INVOICE_SELECT = `
  SELECT
    i.id, i.invoice_number, i.control_number, i.sale_id, s.ml_order_number AS sale_order_number,
    i.customer_id, i.customer_name, i.customer_doc, i.customer_address, i.customer_phone,
    to_char(i.invoice_date, 'YYYY-MM-DD') AS invoice_date,
    i.exchange_rate::float AS exchange_rate, i.with_iva, i.iva_rate::float AS iva_rate,
    i.base_bs::float AS base_bs, i.iva_bs::float AS iva_bs, i.total_bs::float AS total_bs,
    i.is_special, i.retention_percent::float AS retention_percent,
    i.retention_bs::float AS retention_bs, i.retention_status, i.retention_voucher,
    to_char(i.retention_date, 'YYYY-MM-DD') AS retention_date,
    i.retention_amount_bs::float AS retention_amount_bs,
    i.status, i.void_reason, i.voided_at, uv.username AS voided_by,
    i.replaced_by, rb.invoice_number AS replaced_by_number,
    (SELECT o.invoice_number FROM invoices o WHERE o.replaced_by = i.id LIMIT 1) AS replaces_number,
    i.print_count, i.last_printed_at, i.notes,
    uc.username AS created_by, i.created_at,
    COALESCE((
      SELECT JSON_AGG(JSON_BUILD_OBJECT(
        'id', it.id, 'product_id', it.product_id, 'description', it.description,
        'quantity', it.quantity::float, 'unit_price_usd', it.unit_price_usd::float,
        'unit_price_bs', it.unit_price_bs::float, 'total_bs', it.total_bs::float
      ) ORDER BY it.position, it.id)
      FROM invoice_items it WHERE it.invoice_id = i.id
    ), '[]'::json) AS items
  FROM invoices i
  LEFT JOIN sales s     ON s.id  = i.sale_id
  LEFT JOIN users uc    ON uc.id = i.created_by
  LEFT JOIN users uv    ON uv.id = i.voided_by
  LEFT JOIN invoices rb ON rb.id = i.replaced_by
`

export async function getInvoice(db: Q, id: number | string): Promise<Invoice | null> {
  const { rows: [inv] } = await db.query(`${INVOICE_SELECT} WHERE i.id = $1`, [id])
  return inv ?? null
}

export async function listInvoices(db: Q, where: string, params: unknown[], limit = 300): Promise<Invoice[]> {
  const { rows } = await db.query(
    `${INVOICE_SELECT} WHERE ${where} ORDER BY i.invoice_number DESC LIMIT ${limit}`,
    params,
  )
  return rows
}
