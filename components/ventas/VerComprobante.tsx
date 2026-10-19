'use client'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

// "Comprobante" sin salir de la lista (19-10, Pagos ME sin inventario): como "Ver guía" (VerGuia.tsx). A la izquierda
// la imagen que subió el comprador; a la derecha lo que hay que buscar en el banco, como texto para copiar.

export interface DatosComprobante {
  monto: number | null; totalOrden: number | null; banco: string | null; referencia: string | null; metodo: string | null
}

const bs = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const METODO: Record<string, string> = { mobile_payment: 'Pago móvil', transfer: 'Transferencia', zelle: 'Zelle' }

export function BotonComprobante({ pagoId, venta, datos }: { pagoId: number; venta: string; datos: DatosComprobante }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} title="Ver el comprobante de pago que subió el comprador"
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-sky-700 ring-1 ring-inset ring-sky-200 hover:bg-sky-50">
        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 15l5-5 4 4 3-3 6 6" />
        </svg>
        Comprobante
      </button>
      {abierto && <VerComprobante pagoId={pagoId} venta={venta} datos={datos} onCerrar={() => setAbierto(false)} />}
    </>
  )
}

export default function VerComprobante({ pagoId, venta, datos, onCerrar }: {
  pagoId: number; venta: string; datos: DatosComprobante; onCerrar: () => void
}) {
  const [copiado, setCopiado] = useState<string | null>(null)
  const url = `/api/pagos-me/${pagoId}/archivo?tipo=comprobante`

  // Esc cierra solo esta ventana (en captura en window: antes que la de atrás).
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onCerrar() } }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [onCerrar])

  const copiar = async (clave: string, texto: string) => {
    await navigator.clipboard.writeText(texto).catch(() => {})
    setCopiado(clave); setTimeout(() => setCopiado(c => c === clave ? null : c), 1500)
  }

  const filas: [string, string, string | null][] = [
    ['monto', 'Monto pagado', datos.monto != null ? `Bs ${bs(datos.monto)}` : null],
    ['orden', 'Total de la orden', datos.totalOrden != null ? `Bs ${bs(datos.totalOrden)}` : null],
    ['metodo', 'Método', datos.metodo ? METODO[datos.metodo] ?? datos.metodo : null],
    ['banco', 'Banco de origen', datos.banco],
    ['referencia', 'Referencia', datos.referencia],
  ]

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onCerrar() }} role="dialog" aria-modal="true" aria-label="Comprobante de pago">
      <div className="flex max-h-[95vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-neutral-100 px-5 py-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-neutral-900">Comprobante de pago</h3>
            <p className="text-xs text-neutral-500">Venta <span className="font-mono">{venta}</span></p>
          </div>
          <div className="flex items-center gap-1">
            <a href={url} target="_blank" rel="noreferrer" className="btn-ghost !px-2.5 !py-1 text-xs">Abrir aparte ↗</a>
            <button onClick={onCerrar} className="btn-ghost !px-2 !py-1" aria-label="Cerrar">✕</button>
          </div>
        </div>
        <div className="grid min-h-0 flex-1 overflow-auto md:grid-cols-[1fr_17rem]">
          <div className="order-2 flex items-start justify-center bg-neutral-100 p-3 md:order-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="Comprobante de pago" className="max-h-[75vh] w-auto max-w-full rounded-lg border bg-white" />
          </div>
          <div className="order-1 space-y-2 border-b border-neutral-100 p-4 md:order-2 md:border-b-0 md:border-l">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Para buscar en el banco</p>
            <dl className="space-y-2">
              {filas.filter(([, , v]) => v).map(([clave, k, v]) => (
                <div key={clave} className="rounded-lg bg-neutral-50 px-3 py-2">
                  <dt className="flex items-center justify-between text-[11px] text-neutral-500">
                    {k}
                    <button type="button" onClick={() => copiar(clave, v!)} className="font-medium text-sky-700 opacity-70 hover:opacity-100">
                      {copiado === clave ? 'copiado ✓' : 'copiar'}
                    </button>
                  </dt>
                  <dd className={`select-text break-words text-sm text-neutral-900 ${clave === 'referencia' ? 'font-mono' : ''}`}>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
