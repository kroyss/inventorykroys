// Facturación (VE): tipos y cálculos compartidos entre cliente y servidor.
// Sin imports de servidor: lo usan el formulario y la vista de impresión.

/** Líneas de detalle que entran en la hoja de forma libre (filas 16–22 del Excel). */
export const MAX_INVOICE_LINES = 7

export type InvoiceStatus = 'EMITIDA' | 'ANULADA'
export type RetentionStatus = 'NO_APLICA' | 'PENDIENTE' | 'RECIBIDA'

export interface InvoiceItem {
  id?: number
  product_id: number | null
  description: string
  quantity: number
  unit_price_usd: number | null
  unit_price_bs: number
  total_bs: number
}

export interface InvoiceFile {
  id: number
  file_name: string
  file_type: string | null
  file_size_kb: number
  uploaded_at: string
  uploaded_by: string | null
}

export interface Invoice {
  id: number
  invoice_number: number
  control_number: string | null
  sale_id: number | null
  sale_order_number: string | null
  customer_id: number | null
  customer_name: string
  customer_doc: string | null
  customer_address: string | null
  customer_phone: string | null
  invoice_date: string            // YYYY-MM-DD
  exchange_rate: number
  with_iva: boolean
  iva_rate: number
  base_bs: number
  iva_bs: number
  total_bs: number
  is_special: boolean
  retention_percent: number
  retention_bs: number
  retention_status: RetentionStatus
  retention_voucher: string | null
  retention_date: string | null
  retention_amount_bs: number | null
  status: InvoiceStatus
  void_reason: string | null
  voided_at: string | null
  voided_by: string | null
  replaced_by: number | null
  replaced_by_number: number | null
  replaces_number: number | null
  print_count: number
  last_printed_at: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  items: InvoiceItem[]
  files?: InvoiceFile[]
}

export interface InvoiceCustomer {
  id: number
  doc_id: string
  name: string
  address: string | null
  phone: string | null
  is_special: boolean
  retention_percent: number
}

export interface InvoiceConfig {
  next_number: number
  iva: number
  offset_x: number
  offset_y: number
  start_number: number
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/** Formato del Excel: `#,##0.00` con locale es (44.999.999,00). */
export const bs = (n: number) =>
  Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * RIF/CI normalizado para buscar y deduplicar clientes: mayúsculas, sin espacios,
 * guiones ni puntos. "j-40282128-0 " → "J402821280", "v 12.345.678" → "V12345678".
 */
export const normalizeDoc = (doc: string) => doc.toUpperCase().replace(/[\s.\-]/g, '')

/** Montos de una factura a partir de las líneas (ya en Bs). Misma cuenta en form y servidor. */
export function calcInvoice<L extends { quantity: number; unit_price_bs: number }>(opts: {
  lines: L[]
  with_iva: boolean
  iva_rate: number
  is_special: boolean
  retention_percent: number
}) {
  const lines = opts.lines.map(l => ({ ...l, total_bs: round2(l.quantity * l.unit_price_bs) }))
  const base = round2(lines.reduce((a, l) => a + l.total_bs, 0))
  const ivaRate = opts.with_iva ? opts.iva_rate : 0
  const iva = round2(base * ivaRate / 100)
  const total = round2(base + iva)
  // La retención solo existe si hay IVA y el cliente es contribuyente especial.
  const retains = opts.is_special && iva > 0
  const retention = retains ? round2(iva * opts.retention_percent / 100) : 0
  return {
    lines, base, iva, total, iva_rate: ivaRate,
    retention, retention_percent: retains ? opts.retention_percent : 0,
    net: round2(total - retention),
  }
}

/** YYYY-MM-DD → DD/MM/YYYY (como imprimía el Excel). */
export const fmtDate = (ymd: string | null) => {
  if (!ymd) return ''
  const [y, m, d] = ymd.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}
