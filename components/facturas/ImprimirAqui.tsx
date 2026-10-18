'use client'
import { useEffect, useState } from 'react'

/**
 * Imprimir una factura SIN salir de la pantalla. Desde el 18-10 primero se ve la hoja en una vista previa
 * propia (con zoom y el membrete de fondo) y desde ahí "Imprimir" abre el diálogo de Chrome; antes saltaba
 * directo al diálogo, que no deja agrandar y los datos se leían lejos. Al cerrar se sigue en la misma pantalla.
 */
export function useImprimirFactura() {
  const [src, setSrc] = useState<string | null>(null)
  const imprimir = (id: number) => setSrc(`/factura/${id}?t=${Date.now()}`)
  useEffect(() => {
    if (!src) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setSrc(null) } }
    document.addEventListener('keydown', h, true)
    return () => document.removeEventListener('keydown', h, true)
  }, [src])
  const marco = src ? (
    <div className="fixed inset-0 z-[80] flex flex-col bg-black/50 sm:p-4">
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden bg-white shadow-2xl sm:rounded-xl">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
          <span className="text-sm font-semibold">Vista previa de la factura</span>
          <button onClick={() => setSrc(null)} className="btn-secondary text-sm">Cerrar</button>
        </div>
        <iframe key={src} src={src} title="Vista previa de la factura" className="w-full flex-1 border-0" />
      </div>
    </div>
  ) : null
  return { imprimir, marco }
}
