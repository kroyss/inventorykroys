'use client'
// Numerito gris de Publicaciones → Preparar (18-11): cuánto falta vincular y cuántos productos no tienen peso. Se pide UNA
// vez (todas las pestañas lo comparten) después de dibujar la pantalla, así no la demora; se guarda 2 min en la pestaña
// del navegador. Si falla, no se muestra nada.
import { useSyncExternalStore } from 'react'

type Pend = { sinVincular: number; sinPeso: number; sinVincularVariantes?: number }
const LLAVE = 'pendientes-preparar-2'   // -2 (18-11): sinVincular pasó a contar publicaciones
let datos: Pend | null = null
let pedido: Promise<void> | null = null
const avisar = new Set<() => void>()

function cargar() {
  if (datos || pedido) return
  try {
    const g = JSON.parse(sessionStorage.getItem(LLAVE) ?? 'null') as { at: number; d: Pend } | null
    if (g && Date.now() - g.at < 120_000) { datos = g.d; return }
  } catch { /* sin almacenamiento */ }
  pedido = fetch('/api/publicaciones/pendientes').then(r => (r.ok ? r.json() : null)).then((d: Pend | null) => {
    if (!d) return
    datos = d
    try { sessionStorage.setItem(LLAVE, JSON.stringify({ at: Date.now(), d })) } catch { /* sin almacenamiento */ }
    avisar.forEach(f => f())
  }).catch(() => {}).finally(() => { pedido = null })
}
const suscribir = (f: () => void) => { avisar.add(f); cargar(); return () => { avisar.delete(f) } }

/** resumen: la suma (en la pestaña Preparar). de: un número (en Vincular o Pesos). */
export default function PendientesPreparar({ resumen = false, de, activo = false }: { resumen?: boolean; de?: 'sinVincular' | 'sinPeso'; activo?: boolean }) {
  const d = useSyncExternalStore(suscribir, () => datos, () => null)
  if (!d) return null
  const n = resumen ? d.sinVincular + d.sinPeso : de ? d[de] : 0
  if (!n) return null
  return (
    <span title={de === 'sinVincular' ? `${d.sinVincular} publicaci${d.sinVincular === 1 ? 'ón activa' : 'ones activas'} con stock sin producto${(d.sinVincularVariantes ?? 0) > d.sinVincular ? ` (${d.sinVincularVariantes} colores/modelos)` : ''}`
      : de === 'sinPeso' ? `${d.sinPeso} producto${d.sinPeso === 1 ? '' : 's'} sin peso` : resumen ? `${d.sinVincular ? `${d.sinVincular} publicaciones sin vincular` : ''}${d.sinVincular && d.sinPeso ? ' · ' : ''}${d.sinPeso ? `${d.sinPeso} productos sin peso` : ''}` : undefined}
      className={`ml-1.5 inline-flex min-w-[1.25rem] justify-center rounded-full px-1.5 text-[11px] font-medium tabular-nums leading-5 ${activo ? 'bg-white/20 text-white' : 'bg-neutral-100 text-neutral-600'}`}>
      {n > 999 ? '999+' : n}</span>
  )
}
