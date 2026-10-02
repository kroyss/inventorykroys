'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

/** Acceso "🎓 Aprendizaje 3/7" en la barra superior. No aparece si no hay videos; completo, queda solo 🎓. */
export default function AprendizajeNav() {
  const pathname = usePathname()
  const [n, setN] = useState<{ hechos: number; total: number } | null>(null)
  useEffect(() => {
    let vivo = true
    fetch('/api/aprendizaje', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!vivo || !d) return
        setN({ hechos: d.videos.filter((v: { completado: boolean }) => v.completado).length, total: d.videos.length })
      })
      .catch(() => {})
    return () => { vivo = false }
  }, [pathname])      // al volver de /aprendizaje se ve el avance nuevo

  if (!n || n.total === 0) return null
  const activo = pathname.startsWith('/aprendizaje')
  const completo = n.hechos >= n.total
  return (
    <Link href="/aprendizaje" title={completo ? 'Aprendizaje: completado' : `Aprendizaje: ${n.hechos} de ${n.total} videos`}
      className={`hidden md:inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm transition-colors ${
        activo ? 'bg-neutral-900 text-white' : completo ? 'text-neutral-500 hover:bg-neutral-100' : 'bg-lime-50 text-lime-900 ring-1 ring-inset ring-lime-300 hover:bg-lime-100'}`}>
      <span aria-hidden="true">🎓</span>
      {!completo && <>Aprendizaje <span className="num text-xs opacity-80">{n.hechos}/{n.total}</span></>}
    </Link>
  )
}
