'use client'
import { useEffect, useState, type ReactNode } from 'react'

const VISIBLES = 5

/**
 * Historial de tasas de Ajustes (VE y CO): solo los últimos VISIBLES días; "Ver todo" abre el resto en
 * una ventana. `tabla` dibuja la tabla con las filas que le toque (las columnas son de cada país).
 */
export default function HistorialTasas<T>({ filas, tabla }: { filas: T[]; tabla: (filas: T[]) => ReactNode }) {
  const [abierto, setAbierto] = useState(false)
  useEffect(() => {
    if (!abierto) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false) }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [abierto])

  return (
    <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-neutral-800">Últimos días</h2>
        {filas.length > VISIBLES && (
          <button type="button" onClick={() => setAbierto(true)} className="text-xs font-medium text-neutral-500 hover:text-neutral-900">
            Ver todo ({filas.length}) →
          </button>
        )}
      </div>
      {tabla(filas.slice(0, VISIBLES))}

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setAbierto(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
              <h2 className="font-semibold">Historial de tasas</h2>
              <button type="button" onClick={() => setAbierto(false)} className="text-lg text-neutral-400 hover:text-neutral-700" aria-label="Cerrar">✕</button>
            </div>
            <div className="overflow-y-auto">{tabla(filas)}</div>
          </div>
        </div>
      )}
    </div>
  )
}
