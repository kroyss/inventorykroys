'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { espacioActual } from '@/lib/espacios'
import { useAvisos, Numerito } from './Avisos'

// Íconos de trazo (24x24), heredan el color del texto.
const ICONOS = {
  inventario: <><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3" /><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" /></>,
  automatizaciones: <><rect x="4" y="8" width="16" height="12" rx="2" /><path d="M12 4v4M9 13v1M15 13v1M10 17h4" /></>,
  radar: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><path d="M12 12l5-5" /></>,
}
function Icono({ de }: { de: keyof typeof ICONOS }) {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONOS[de]}</svg>
  )
}

const NOMBRES = { inventario: 'Inventario', automatizaciones: 'Automatizaciones' } as const

// Selector de espacio junto al logo: muestra dónde estás y abre un menú con los demás.
// Solo aparece si hay más de un espacio.
export default function EspacioSwitcher({ automatizaciones, inventario, radarUrl }: { automatizaciones: boolean; inventario: boolean; radarUrl: string | null }) {
  const pathname = usePathname()
  const actual = espacioActual(pathname, inventario ? ['inventario'] : [])
  const [abierto, setAbierto] = useState(false)
  const avisos = useAvisos()
  const urgentesAuto = avisos.preguntas + avisos.mensajes
  const totalAuto = urgentesAuto + avisos.reportador + avisos.calificaciones + avisos.despachos
  const caja = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc) }
  }, [abierto])

  // Sin otro espacio al que cambiar, no aparece (la empresa sin inventario solo tiene Automatizaciones).
  if (!radarUrl && !(automatizaciones && inventario)) return null

  const opciones = [
    ...(inventario ? [{ id: 'inventario' as const, href: '/dashboard', desc: 'Stock, ventas, compras y productos' }] : []),
    ...(automatizaciones ? [{ id: 'automatizaciones' as const, href: '/automatizaciones', desc: 'Despachos, Reportador y más' }] : []),
  ]
  const fila = 'flex items-center gap-3 px-2.5 py-2 rounded-md text-left transition-colors'

  return (
    <div ref={caja} className="relative shrink-0">
      <button type="button" onClick={() => setAbierto(a => !a)} aria-haspopup="menu" aria-expanded={abierto}
        className={`flex items-center gap-2 pl-2 pr-1.5 py-1.5 rounded-lg text-sm font-semibold text-neutral-800 transition-colors ${
          abierto ? 'bg-neutral-100' : 'hover:bg-neutral-100'}`}>
        <Icono de={actual} />
        <span>{NOMBRES[actual]}</span>
        {/* Estando en otro espacio: punto si Automatizaciones tiene algo pendiente */}
        {actual !== 'automatizaciones' && totalAuto > 0 && (
          <span className={`w-2 h-2 rounded-full ${urgentesAuto > 0 ? 'bg-red-500' : 'bg-amber-400'}`} title="Hay pendientes en Automatizaciones" />
        )}
        <svg viewBox="0 0 24 24" className={`w-4 h-4 text-neutral-400 transition-transform ${abierto ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>

      {abierto && (
        <div role="menu" className="absolute left-0 top-full mt-1.5 w-72 bg-white border border-neutral-200 rounded-xl shadow-lg p-1.5 z-30">
          <p className="px-2.5 pt-1 pb-1.5 text-[11px] font-semibold text-neutral-400">Cambiar de espacio</p>
          {opciones.map(o => (
            <Link key={o.id} href={o.href} role="menuitem" onClick={() => setAbierto(false)}
              className={`${fila} ${actual === o.id ? 'bg-neutral-100' : 'hover:bg-neutral-50'}`}>
              <span className="text-neutral-700"><Icono de={o.id} /></span>
              <span className="flex-1 min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-neutral-800">
                  {NOMBRES[o.id]}
                  {o.id === 'automatizaciones' && <Numerito n={totalAuto} urgente={urgentesAuto > 0} />}
                </span>
                <span className="block text-xs text-neutral-500">{o.desc}</span>
              </span>
              {actual === o.id && (
                <svg viewBox="0 0 24 24" className="w-4 h-4 text-neutral-800" fill="none" stroke="currentColor" strokeWidth={2.2}
                  strokeLinecap="round" strokeLinejoin="round" aria-label="Actual"><path d="M5 12l5 5L20 7" /></svg>
              )}
            </Link>
          ))}
          {radarUrl && (
            <>
              <div className="my-1.5 border-t border-neutral-100" />
              <a href={radarUrl} role="menuitem" className={`${fila} hover:bg-neutral-50`}>
                <span className="text-neutral-700"><Icono de="radar" /></span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-neutral-800">Radar</span>
                  <span className="block text-xs text-neutral-500">Oportunidades de mercado · mismo usuario</span>
                </span>
                <svg viewBox="0 0 24 24" className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" strokeWidth={2}
                  strokeLinecap="round" strokeLinejoin="round" aria-label="Abre otra aplicación"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>
              </a>
            </>
          )}
        </div>
      )}
    </div>
  )
}
