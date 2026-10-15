'use client'
import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

// "En línea" de verdad (2026-10-15, migración 092): avisa al server que la persona HIZO algo (tocó,
// escribió, desplazó o cambió de pantalla) con la pestaña a la vista. La campanita que consulta sola
// cada minuto no cuenta. Como mucho una vez cada 2 minutos; no dibuja nada.
const CADA_MS = 2 * 60_000

export default function ActividadReal() {
  const pathname = usePathname()
  const ultimo = useRef(0)

  useEffect(() => {
    const avisar = () => {
      if (document.visibilityState !== 'visible' || Date.now() - ultimo.current < CADA_MS) return
      ultimo.current = Date.now()
      fetch('/api/actividad', { method: 'POST', keepalive: true }).catch(() => {})
    }
    const eventos = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const
    for (const ev of eventos) window.addEventListener(ev, avisar, { passive: true })
    return () => { for (const ev of eventos) window.removeEventListener(ev, avisar) }
  }, [])

  // Cambiar de pantalla también es uso.
  useEffect(() => {
    if (document.visibilityState !== 'visible' || Date.now() - ultimo.current < CADA_MS) return
    ultimo.current = Date.now()
    fetch('/api/actividad', { method: 'POST', keepalive: true }).catch(() => {})
  }, [pathname])

  return null
}
