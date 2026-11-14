'use client'
// 13-11-2026 (el dueño, mig. 173): dos avisos con el mismo resumen (/api/products/ml-resumen).
//   · (14-11) La sugerencia del Inicio pasó a la guía Primeros pasos (components/dashboard/PrimerosPasos.tsx).
//   · AvisoNuevasML (Productos): publicaciones nuevas (15 días) sin producto → Vincular con ML.
import { useEffect, useState } from 'react'
import Link from '@/components/ui/Link'

interface Resumen { conectada: boolean; productos: number; vinculados: number; nuevas: number }

function useResumen() {
  const [r, setR] = useState<Resumen | null>(null)
  useEffect(() => { fetch('/api/products/ml-resumen').then(x => (x.ok ? x.json() : null)).then(setR).catch(() => {}) }, [])
  return r
}

/** Productos: publicaciones nuevas sin producto. */
export function AvisoNuevasML() {
  const r = useResumen()
  if (!r?.nuevas) return null
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sky-900"><b>{r.nuevas} publicaci{r.nuevas === 1 ? 'ón nueva' : 'ones nuevas'}</b> en MercadoLibre sin producto en el inventario.</span>
      <Link href="/vincular-ml?vista=nuevas" className="btn-primary shrink-0 text-center text-xs">Vincular o crear</Link>
    </div>
  )
}
