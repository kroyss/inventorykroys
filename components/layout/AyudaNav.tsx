'use client'
import { useEffect, useState } from 'react'

// 27-11 (el dueño): el botón de Ayuda vive en la barra de arriba (entre Aprendizaje y Novedades), siempre, en web y en
// el celular. Lo abre BurbujaAyuda (el panel y la cajita del ticket). El punto: rojo = respuesta nueva de Soporte o
// (dueño) tickets de clientes sin responder; verde = tengo un caso abierto esperando.
export const EVENTO_ABRIR_AYUDA = 'abrir-ayuda'
const EVENTO_PUNTO = 'ayuda-punto'
export type PuntoAyuda = 'rojo' | 'verde' | null
let ultimo: PuntoAyuda = null
let abierta = false
/** Lo llama BurbujaAyuda cuando cambian los tickets o se abre/cierra el panel. */
export function avisarAyuda(punto: PuntoAyuda, estaAbierta: boolean) {
  ultimo = punto; abierta = estaAbierta
  window.dispatchEvent(new CustomEvent(EVENTO_PUNTO))
}

export default function AyudaNav() {
  const [, refrescar] = useState(0)
  useEffect(() => {
    const f = () => refrescar(n => n + 1)
    window.addEventListener(EVENTO_PUNTO, f)
    return () => window.removeEventListener(EVENTO_PUNTO, f)
  }, [])
  return (
    <button type="button" onClick={() => window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_AYUDA))}
      title="Ayuda y Soporte" aria-label="Ayuda y Soporte" aria-expanded={abierta}
      className={`relative inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors ${abierta ? 'bg-neutral-900 text-lime-400' : 'text-neutral-600 hover:bg-neutral-100'}`}>
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      {ultimo && <span className={`absolute top-0.5 right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${ultimo === 'rojo' ? 'bg-red-500' : 'bg-lime-500'}`} />}
    </button>
  )
}
