'use client'
// Aviso antes de REABRIR una venta (22-10-2026). Reabrir es una vuelta atrás real: la venta pasa a borrador, el stock
// vuelve y su guía no se imprime hasta procesarla otra vez. Se dio un caso (2000019110155834): se reabrió una venta ya
// enviada y facturada pensando que hacía falta para facturar, y el inventario quedó con una unidad de más.
// El aviso explica lo que pasa, señala si la guía ya se imprimió o hay factura, y ofrece el camino correcto para
// corregir sin reabrir (Corregir pedido) y recuerda que facturar no necesita reabrir.
import { useEffect } from 'react'
import { createPortal } from 'react-dom'

const icono = (d: string, cls = 'h-4 w-4') => (
  <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
)
const I = {
  atras: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  caja: 'M21 8 12 3 3 8v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v8',
  pausa: 'M10 15V9M14 15V9M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  reloj: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  alerta: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  lapiz: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  factura: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5',
}

export default function AvisoReabrir({ orden, guiaImpresa, factura, puedeCorregir, busy, onCancelar, onCorregir, onReabrir }: {
  orden: string
  guiaImpresa: boolean
  factura: string | null
  /** La venta ya descontó inventario: se puede corregir sin reabrir (Corregir pedido). */
  puedeCorregir: boolean
  busy: boolean
  onCancelar: () => void
  onCorregir: () => void
  onReabrir: () => void
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onCancelar() } }
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
  }, [onCancelar])

  const consecuencias = [
    { i: I.caja, t: 'El stock vuelve al inventario', d: 'como si el producto no hubiera salido.' },
    { i: I.pausa, t: 'La venta queda en borrador', d: 'y su guía no se imprime hasta procesarla otra vez.' },
    { i: I.reloj, t: 'Tienes que procesarla de nuevo', d: 'al terminar; si no, queda abierta.' },
  ]

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" role="dialog" aria-modal="true"
      aria-labelledby="aviso-reabrir-titulo" onMouseDown={e => { if (e.target === e.currentTarget) onCancelar() }}>
      <div className="w-full max-w-md overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-start gap-3 px-5 pb-3 pt-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-neutral-100 text-neutral-700">{icono(I.atras, 'h-5 w-5')}</span>
          <div className="min-w-0">
            <h3 id="aviso-reabrir-titulo" className="font-semibold text-neutral-900">¿Reabrir la venta?</h3>
            <p className="font-mono text-xs text-neutral-500">{orden}</p>
          </div>
        </div>

        <div className="space-y-3 px-5 pb-4">
          <ul className="space-y-2">
            {consecuencias.map(c => (
              <li key={c.t} className="flex gap-2.5 text-sm text-neutral-700">
                <span className="mt-0.5 text-neutral-400">{icono(c.i)}</span>
                <span><b className="font-medium text-neutral-900">{c.t}</b> {c.d}</span>
              </li>
            ))}
          </ul>

          {(guiaImpresa || factura) && (
            <div className="flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
              <span className="mt-0.5 shrink-0 text-amber-600">{icono(I.alerta)}</span>
              <span>
                {guiaImpresa && <><b>Su guía ya se imprimió</b>: el paquete ya salió. </>}
                {factura && <>Tiene la <b>factura #{factura}</b>. </>}
                Reabrirla casi nunca es lo que necesitas.
              </span>
            </div>
          )}

          {puedeCorregir && (
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-3">
              <p className="text-sm text-sky-950"><b>¿Solo quieres cambiar un producto, una cantidad o la nota?</b></p>
              <p className="mt-0.5 text-xs text-sky-800">Corrige la venta sin reabrirla: sigue procesada y el stock se ajusta solo por la diferencia.</p>
              <button type="button" onClick={onCorregir} disabled={busy}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-sky-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-50">
                {icono(I.lapiz)} Corregir pedido
              </button>
            </div>
          )}

          <p className="flex items-center gap-2 text-xs text-neutral-500">
            <span className="text-neutral-400">{icono(I.factura)}</span>
            Para <b className="font-medium text-neutral-700">facturar</b> no hace falta reabrir: usa «Facturar» en la venta.
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-neutral-100 bg-neutral-50 px-5 py-3">
          <button type="button" onClick={onCancelar} className="btn-secondary text-sm">Cancelar</button>
          <button type="button" onClick={onReabrir} disabled={busy}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:border-neutral-400 hover:bg-neutral-100 disabled:opacity-50">
            {busy ? 'Reabriendo…' : 'Reabrir igual'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
