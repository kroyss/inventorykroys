'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

/** Acceso a Aprendizaje (ícono de libro) en la barra superior. Sin videos se muestra igual: ahí están
 *  los primeros pasos.
 *   - Los primeros DIAS_GRANDE días: "Aprendizaje 3/7", destacado en verde, para que lo noten.
 *   - Después: solo el libro verde con "3/7" (ocupa poco y sigue invitando).
 *   - Completo: el libro en gris, sin número. */
const DIAS_GRANDE = 5
export default function AprendizajeNav() {
  const pathname = usePathname()
  const [n, setN] = useState<{ hechos: number; total: number; exento: boolean; dias: number } | null>(null)
  useEffect(() => {
    let vivo = true
    fetch('/api/aprendizaje', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!vivo || !d) return
        setN({ hechos: d.videos.filter((v: { completado: boolean }) => v.completado).length, total: d.videos.length, exento: !!d.exento,
               dias: d.dias ?? 0 })
      })
      .catch(() => {})
    return () => { vivo = false }
  }, [pathname])      // al volver de /aprendizaje se ve el avance nuevo

  if (!n) return null
  const activo = pathname.startsWith('/aprendizaje')
  // Exento (organización de la plataforma): siempre como completado.
  const completo = n.exento || (n.total > 0 && n.hechos >= n.total)
  const chico = !completo && n.dias >= DIAS_GRANDE
  return (
    <Link href="/aprendizaje" title={completo ? 'Aprendizaje: completado' : n.total ? `Aprendizaje: ${n.hechos} de ${n.total} videos` : 'Aprendizaje: por dónde empezar'}
      className={`hidden md:inline-flex items-center gap-1.5 rounded-full py-1 text-sm transition-colors ${chico || completo ? 'px-2' : 'px-3'} ${
        activo ? 'bg-neutral-900 text-white' : completo ? 'text-neutral-500 hover:bg-neutral-100' : 'bg-lime-50 text-lime-900 ring-1 ring-inset ring-lime-300 hover:bg-lime-100'}`}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"
        strokeLinejoin="round" className="w-4 h-4 shrink-0">
        <path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z" /><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z" />
      </svg>
      {!completo && <>{!chico && 'Aprendizaje '}{n.total > 0 && <span className="num text-xs opacity-80">{n.hechos}/{n.total}</span>}</>}
    </Link>
  )
}
