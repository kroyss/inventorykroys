'use client'
// ⓘ junto al título de una pantalla (18-11, el dueño: «me gusta el símbolo para la info de ayuda»): lo fino de cómo
// funciona va aquí en vez de párrafos sueltos. Se TOCA (también en el celular); abierto muestra el panel debajo.
import type { ReactNode } from 'react'

export function BotonInfo({ abierto, onClick }: { abierto: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-expanded={abierto} aria-label="Cómo funciona" title="Cómo funciona"
      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${abierto ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 text-neutral-500 hover:border-neutral-500 hover:text-neutral-800'}`}>i</button>
  )
}

/** El panel: una lista corta. Va justo debajo del encabezado (PageHeader deja margen: por eso el -mt). */
export function PanelInfo({ children }: { children: ReactNode }) {
  return (
    <div className="-mt-3 rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-600 shadow-sm">
      <ul className="list-disc space-y-1 pl-5">{children}</ul>
    </div>
  )
}
