'use client'
import FacturaPrint from './FacturaPrint'
import type { Invoice } from '@/lib/invoices'

export default function FacturaPrintClient({ invoice, offsetX, offsetY, copyOffsetX, copyOffsetY, autoPrint }: {
  invoice: Invoice
  offsetX: number
  offsetY: number
  copyOffsetX: number
  copyOffsetY: number
  autoPrint: boolean
}) {
  const voided = invoice.status === 'ANULADA'

  return (
    <FacturaPrint
      invoice={invoice}
      offsetX={offsetX}
      offsetY={offsetY}
      copyOffsetX={copyOffsetX}
      copyOffsetY={copyOffsetY}
      autoPrint={autoPrint && !voided}
      onPrint={() => { fetch(`/api/invoices/${invoice.id}/printed`, { method: 'POST' }).catch(() => {}) }}
      toolbar={
        <div className="flex items-center gap-3 text-sm">
          <span className="font-semibold">Factura #{invoice.invoice_number}</span>
          <span className="text-neutral-500">{invoice.customer_name}</span>
          {invoice.print_count > 0 && (
            <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
              Ya se imprimió {invoice.print_count} {invoice.print_count === 1 ? 'vez' : 'veces'}
            </span>
          )}
          {voided && (
            <span className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-0.5">
              ANULADA — no usar en hoja preimpresa
            </span>
          )}
        </div>
      }
    />
  )
}
