'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { espacioDe } from '@/lib/espacios'

// Selector de espacio (arriba): cambia el menú completo. Solo aparece si hay más de uno.
export default function EspacioSwitcher({ automatizaciones, radarUrl }: { automatizaciones: boolean; radarUrl: string | null }) {
  const actual = espacioDe(usePathname())
  if (!automatizaciones && !radarUrl) return null
  const base = 'px-2.5 py-1 text-xs font-semibold transition-colors'
  const on = 'bg-neutral-900 text-white'
  const off = 'bg-white text-neutral-500 hover:bg-neutral-100'
  return (
    <div className="flex rounded-lg border border-neutral-200 overflow-hidden shrink-0" title="Cambiar de espacio">
      <Link href="/dashboard" className={`${base} ${actual === 'inventario' ? on : off}`}>Inventario</Link>
      {automatizaciones && (
        <Link href="/automatizaciones" className={`${base} ${actual === 'automatizaciones' ? on : off}`}>Automatizaciones</Link>
      )}
      {radarUrl && (
        <a href={radarUrl} className={`${base} ${off}`} title="Radar de Oportunidades (se abre con tu mismo usuario)">Radar ↗</a>
      )}
    </div>
  )
}
