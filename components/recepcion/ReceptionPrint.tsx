'use client'
import { useEffect } from 'react'

interface ReceptionItem {
  product_code: string
  product_name: string
  quantity: number
  total_received_qty?: number
}

interface ReceptionOrder {
  order_number: string
  supplier_name: string | null
  status: string
  created_at: string
  notes: string | null
  total_usd?: number
  box_count?: number | null
  tracking_number?: string | null
  origin_country?: string | null
  items: ReceptionItem[]
}

interface Photo {
  url: string
  name: string
}

interface Props {
  order: ReceptionOrder
  country: 'VE' | 'CO'
  kind: 'local' | 'import'
  photos?: Photo[]
}

export default function ReceptionPrint({ order, country, kind, photos = [] }: Props) {
  // Auto-open print dialog. Si hay imágenes, espera a que carguen para que salgan
  // en la impresión (con un fallback por si alguna tarda o falla).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('print') !== '1') return
    const imgs = Array.from(document.querySelectorAll('img')).filter(img => !img.complete)
    if (imgs.length === 0) { const t = setTimeout(() => window.print(), 300); return () => clearTimeout(t) }
    let done = 0
    const tryPrint = () => { if (++done >= imgs.length) setTimeout(() => window.print(), 200) }
    imgs.forEach(img => { img.addEventListener('load', tryPrint); img.addEventListener('error', tryPrint) })
    const fallback = setTimeout(() => window.print(), 4000)
    return () => clearTimeout(fallback)
  }, [])

  // Auto-encogido: antes de imprimir mide el alto real (clon con compactación de
  // impresión) y aplica un zoom para que SIEMPRE entre en una hoja A4, por muchos
  // productos/fotos que tenga. Cubre el botón Imprimir y Ctrl+P.
  useEffect(() => {
    const onBefore = () => {
      const sheet = document.querySelector('.recep-sheet') as HTMLElement | null
      if (!sheet) return
      const PX_PER_CM = 37.795
      const pageW = (21 - 2) * PX_PER_CM     // A4 ancho útil (1cm margen c/lado)
      const pageH = (29.7 - 2) * PX_PER_CM    // A4 alto útil
      const clone = sheet.cloneNode(true) as HTMLElement
      clone.classList.add('print-measure')
      clone.style.cssText += `position:absolute;left:-10000px;top:0;width:${pageW}px;zoom:1;`
      document.body.appendChild(clone)
      const h = clone.scrollHeight
      document.body.removeChild(clone)
      const scale = h > pageH ? Math.max(0.5, (pageH / h) * 0.98) : 1
      sheet.style.setProperty('--print-scale', String(scale))
    }
    window.addEventListener('beforeprint', onBefore)
    return () => window.removeEventListener('beforeprint', onBefore)
  }, [])

  const totalQty = order.items.reduce((s, i) => s + i.quantity, 0)

  return (
    <div className="min-h-screen bg-neutral-100 print:bg-white">
      <style>{`
        /* Clon fuera de pantalla para medir el alto real de impresion (misma compactacion) */
        .print-measure { padding: 0 !important; font-size: 11px !important; }
        .print-measure table { font-size: 10.5px !important; }
        .print-measure td, .print-measure th { padding-top: 1.5px !important; padding-bottom: 1.5px !important; }
        .print-measure img { max-height: 4cm !important; }
        .print-measure .mb-5 { margin-bottom: 8px !important; }
        .print-measure .mt-6 { margin-top: 8px !important; }
        .print-measure .mt-4 { margin-top: 6px !important; }
        .print-measure .pb-3 { padding-bottom: 5px !important; }

        @media print {
          @page { margin: 1cm; }
          .no-print { display: none !important; }
          body { background: white !important; }
          /* Compactar para que entre todo en una hoja A4 */
          /* zoom (no transform) para que SÍ reduzca el alto del layout y la paginación */
          .recep-sheet { font-size: 11px; zoom: var(--print-scale, 1); }
          .recep-sheet table { font-size: 10.5px; }
          .recep-sheet td, .recep-sheet th { padding-top: 1.5px !important; padding-bottom: 1.5px !important; }
          .recep-sheet tr { break-inside: avoid; }
          .recep-sheet img { break-inside: avoid; max-height: 4cm; }
          .recep-sheet .mb-5 { margin-bottom: 8px !important; }
          .recep-sheet .mt-6 { margin-top: 8px !important; }
          .recep-sheet .mt-4 { margin-top: 6px !important; }
          .recep-sheet .pb-3 { padding-bottom: 5px !important; }
          .recep-sheet .avoid-break { break-inside: avoid; }
        }
      `}</style>

      {/* Toolbar — hidden on print */}
      <div className="no-print sticky top-0 bg-white border-b border-neutral-200 px-4 py-3 flex items-center justify-between shadow-sm">
        <h1 className="font-semibold text-neutral-800">
          Lista de recepción · {order.order_number}
        </h1>
        <div className="flex gap-2">
          <button onClick={() => window.print()}
            className="px-4 py-1.5 bg-neutral-900 text-white text-sm rounded hover:bg-neutral-700">
            🖨 Imprimir
          </button>
          <button onClick={() => window.close()}
            className="px-4 py-1.5 bg-white border border-neutral-300 text-neutral-700 text-sm rounded hover:bg-neutral-100">
            Cerrar
          </button>
        </div>
      </div>

      {/* Print area */}
      <div className="recep-sheet max-w-3xl mx-auto bg-white p-8 my-6 shadow-sm print:shadow-none print:my-0 print:p-0">
        {/* Header */}
        <div className="border-b-2 border-neutral-900 pb-3 mb-5">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Syncsora Inventory</h1>
              <p className="text-sm text-neutral-600 mt-1">Lista de recepción de mercancía · {country}</p>
            </div>
            <div className="text-right text-sm">
              <p className="font-mono font-bold text-lg">{order.order_number}</p>
              <p className="text-xs text-neutral-500 uppercase tracking-wide">
                {kind === 'import' ? 'Importación' : 'Compra local'}
              </p>
            </div>
          </div>
        </div>

        {/* Línea única: Tracking (+origen) a la izquierda · CAJAS EN CAMINO grande a la derecha */}
        <div className="flex items-center justify-between flex-wrap gap-x-8 gap-y-2 mb-5">
          <div className="text-sm space-y-0.5">
            {order.tracking_number && (
              <div>
                <span className="text-neutral-500">Tracking:</span>{' '}
                <span className="font-mono font-medium">{order.tracking_number}</span>
              </div>
            )}
            {order.origin_country && (
              <div>
                <span className="text-neutral-500">Origen:</span>{' '}
                <span className="font-medium">{order.origin_country}</span>
              </div>
            )}
          </div>
          {(kind === 'import' || (order.box_count != null && order.box_count > 0)) && (
            <div className="flex items-center gap-3">
              <span className="text-lg font-bold uppercase tracking-wide">Cajas en camino</span>
              <span className="font-bold text-5xl leading-none">
                {order.box_count != null && order.box_count > 0 ? order.box_count : '____'}
              </span>
            </div>
          )}
        </div>

        {/* Items */}
        <h2 className="text-sm font-bold uppercase tracking-wide text-neutral-700 mb-2">
          Productos esperados ({order.items.length}) — Total {totalQty} unidades
        </h2>
        <table className="w-full text-sm border-collapse border border-neutral-300">
          <thead>
            <tr className="bg-neutral-100">
              <th className="border border-neutral-300 px-2 py-1.5 text-left w-8">#</th>
              <th className="border border-neutral-300 px-2 py-1.5 text-left w-24">Código</th>
              <th className="border border-neutral-300 px-2 py-1.5 text-left">Producto</th>
              <th className="border border-neutral-300 px-2 py-1.5 text-right w-16">Esperado</th>
              <th className="border border-neutral-300 px-2 py-1.5 text-center w-20">✓ Recibido</th>
              <th className="border border-neutral-300 px-2 py-1.5 text-center w-16">OK</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item, idx) => (
              <tr key={idx}>
                <td className="border border-neutral-300 px-2 py-1.5 text-neutral-500">{idx + 1}</td>
                <td className="border border-neutral-300 px-2 py-1.5 font-mono text-xs">{item.product_code}</td>
                <td className="border border-neutral-300 px-2 py-1.5">{item.product_name}</td>
                <td className="border border-neutral-300 px-2 py-1.5 text-right font-semibold">{item.quantity}</td>
                <td className="border border-neutral-300 px-2 py-1.5">&nbsp;</td>
                <td className="border border-neutral-300 px-2 py-1.5 text-center">
                  <span className="inline-block w-4 h-4 border border-neutral-400" />
                </td>
              </tr>
            ))}
            {/* Empty row for hand additions */}
            {[1].map(i => (
              <tr key={`extra-${i}`}>
                <td className="border border-neutral-300 px-2 py-1.5 text-neutral-300">+</td>
                <td className="border border-neutral-300 px-2 py-1.5">&nbsp;</td>
                <td className="border border-neutral-300 px-2 py-1.5">&nbsp;</td>
                <td className="border border-neutral-300 px-2 py-1.5">&nbsp;</td>
                <td className="border border-neutral-300 px-2 py-1.5">&nbsp;</td>
                <td className="border border-neutral-300 px-2 py-1.5">&nbsp;</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Notes */}
        {order.notes && (
          <div className="mt-4 text-sm">
            <p className="text-neutral-500 text-xs uppercase tracking-wide font-bold">Notas de la orden</p>
            <p className="border-l-2 border-neutral-300 pl-3 mt-1">{order.notes}</p>
          </div>
        )}

        {/* Fotos adjuntas de la orden — clave para verificar la recepción */}
        {photos.length > 0 && (
          <div className="mt-4">
            <h2 className="text-sm font-bold uppercase tracking-wide text-neutral-700 mb-1.5">
              Fotos adjuntas ({photos.length})
            </h2>
            <div className="grid grid-cols-3 gap-2">
              {photos.map((ph, i) => (
                <div key={i} className="border border-neutral-300 rounded overflow-hidden break-inside-avoid">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ph.url} alt={ph.name} className="w-full h-auto object-contain" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recibido por · Observaciones — en una sola línea */}
        <div className="avoid-break mt-6 grid grid-cols-2 gap-6 text-sm">
          <div>
            <p className="text-neutral-500 text-xs uppercase tracking-wide">Recibido por</p>
            <div className="mt-6 border-b border-neutral-400">&nbsp;</div>
            <p className="text-xs text-neutral-500 mt-1">Nombre y firma</p>
          </div>
          <div>
            <p className="text-neutral-500 text-xs uppercase tracking-wide font-bold">Observaciones / Discrepancias</p>
            <div className="border border-neutral-300 mt-1 p-2 min-h-[60px]" />
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 pt-2 border-t border-neutral-200 text-[10px] text-neutral-400 text-center">
          Marque los items recibidos · Anote discrepancias · Confirme la recepción en el sistema
        </div>
      </div>
    </div>
  )
}
