'use client'
// Marca «Nuevo» (10-11, pedido del dueño): junto a una sección recién lanzada, hasta que la persona entra
// (se guarda en su navegador) o hasta la fecha tope. Para la próxima novedad: agregar la clave aquí, poner
// <Nuevo clave="…" /> en el menú/pestaña y llamar vistoNuevo('…') al abrir la pantalla.
import { useEffect, useSyncExternalStore } from 'react'

/** clave → último día (YYYY-MM-DD) en que se muestra. */
export const NUEVOS = {
  mi_ia: '2026-12-10',
} as const
export type ClaveNuevo = keyof typeof NUEVOS

const EVENTO = 'nuevo-visto'
const llave = (c: ClaveNuevo) => `nuevo:${c}`

function mostrar(c: ClaveNuevo) {
  if (new Date().toISOString().slice(0, 10) > NUEVOS[c]) return false
  try { return !localStorage.getItem(llave(c)) } catch { return false }
}
function suscribir(cb: () => void) {
  window.addEventListener(EVENTO, cb); window.addEventListener('storage', cb)
  return () => { window.removeEventListener(EVENTO, cb); window.removeEventListener('storage', cb) }
}

export function vistoNuevo(c: ClaveNuevo) {
  try { localStorage.setItem(llave(c), '1') } catch { /* sin almacenamiento: se va sola en la fecha tope */ }
  window.dispatchEvent(new Event(EVENTO))
}

export function useNuevo(c: ClaveNuevo) {
  return useSyncExternalStore(suscribir, () => mostrar(c), () => false)
}

/** La pantalla nueva la llama al abrirse: la marca se quita en todos los menús. */
export function useVistoNuevo(c: ClaveNuevo) {
  useEffect(() => { vistoNuevo(c) }, [c])
}

export function Nuevo({ clave, className = '' }: { clave: ClaveNuevo; className?: string }) {
  const ver = useNuevo(clave)
  if (!ver) return null
  return <span className={`ml-1.5 inline-block rounded-full bg-lime-100 px-1.5 py-px align-middle text-[10px] font-semibold uppercase leading-4 text-lime-800 ${className}`}>Nuevo</span>
}
