'use client'
import type { Invoice } from '@/lib/invoices'

export type Arreglo = 'mismo' | 'imprimir' | 'nueva'

/**
 * "¿Salió mal?" (18-10): antes de tocar nada, pregunta QUÉ pasó y lleva al arreglo correcto.
 * El N° de factura coincide con el N° de control de la hoja preimpresa: hoja en blanco = mismo número;
 * hoja gastada (impresa mal, dañada o corrida) = anular y emitir con el siguiente.
 */
export default function SalioMal({ invoice: inv, onElegir, onCerrar }: {
  invoice: Invoice
  onElegir: (a: Arreglo) => void
  onCerrar: () => void
}) {
  const Opcion = ({ a, titulo, detalle, tono }: { a: Arreglo; titulo: string; detalle: string; tono: string }) => (
    <button onClick={() => onElegir(a)}
      className={`w-full rounded-xl border-2 px-4 py-3 text-left transition-colors hover:shadow ${tono}`}>
      <span className="block text-sm font-semibold text-neutral-900">{titulo}</span>
      <span className="mt-0.5 block text-xs text-neutral-600">{detalle}</span>
    </button>
  )
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onCerrar} />
      <div className="relative w-full max-w-lg space-y-3 rounded-xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">¿Qué pasó con la factura #{inv.invoice_number}?</h2>
            <p className="text-xs text-neutral-500">{inv.customer_name} · elige lo que pasó y te llevo al arreglo correcto.</p>
          </div>
          <button onClick={onCerrar} className="text-xl leading-none text-neutral-400 hover:text-neutral-700">×</button>
        </div>
        <Opcion a="mismo" tono="border-sky-200 hover:border-sky-400"
          titulo="Hay un dato mal y la hoja todavía está en blanco"
          detalle={`Lo viste antes de imprimir (o la impresora no sacó nada). Corriges los datos y sale con el MISMO número #${inv.invoice_number}, en la misma hoja.`} />
        <Opcion a="imprimir" tono="border-neutral-200 hover:border-neutral-400"
          titulo="Los datos están bien, pero no salió impresa"
          detalle="La impresora no la sacó o se canceló la impresión, y la hoja sigue en blanco. Se vuelve a imprimir igual, sin cambiar nada." />
        <Opcion a="nueva" tono="border-red-200 hover:border-red-400"
          titulo="Ya se imprimió en la hoja y salió mal, dañada o corrida"
          detalle={`Esa hoja ya se gastó. La #${inv.invoice_number} queda ANULADA y sale una nueva con el siguiente número, en la misma venta. Guarda la hoja vieja (original y copia) marcada ANULADA.`} />
        <p className="text-[11px] text-neutral-400">Nunca hagas otra venta para volver a facturar: todo se arregla desde aquí.</p>
      </div>
    </div>
  )
}
