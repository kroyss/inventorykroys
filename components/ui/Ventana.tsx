'use client'
import type { ReactNode } from 'react'
import { useEscape } from '@/components/ui/useEscape'

/** Ventana encima de la pantalla (en el celular sale desde abajo). Cierra con ×, Escape o tocando afuera. */
export function Ventana({ titulo, onCerrar, children }: { titulo: string; onCerrar: () => void; children: ReactNode }) {
  useEscape(true, onCerrar)
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4" role="dialog" aria-modal="true" aria-label={titulo}
      onClick={e => { if (e.target === e.currentTarget) onCerrar() }}>
      <div className="w-full sm:max-w-lg max-h-[90vh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-semibold text-neutral-900">{titulo}</h3>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="-mr-1 -mt-1 px-2 py-1 text-lg leading-none text-neutral-400 hover:text-neutral-700">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}
