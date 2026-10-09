'use client'
import { useState } from 'react'

/**
 * Imprimir una factura SIN abrir otra pestaña: la hoja (/factura/[id]?print=1) se carga en un marco
 * fuera de la vista y ella misma abre el diálogo de impresión (y cuenta la impresión). Al cerrar el
 * diálogo se sigue en la misma pantalla.
 */
export function useImprimirFactura() {
  const [src, setSrc] = useState<string | null>(null)
  const imprimir = (id: number) => setSrc(`/factura/${id}?print=1&t=${Date.now()}`)
  const marco = src ? (
    <iframe key={src} src={src} title="Imprimir factura" aria-hidden="true"
      style={{ position: 'fixed', left: '-10000px', top: 0, width: '210mm', height: '297mm', border: 0 }} />
  ) : null
  return { imprimir, marco }
}
