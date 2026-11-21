'use client'
import Link from '@/components/ui/Link'
import { usePathname } from 'next/navigation'
import { espacioActual } from '@/lib/espacios'
import { useAvisos } from './Avisos'

// Íconos de trazo (24x24), heredan el color del texto.
const ICONOS = {
  inventario: <><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3" /><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" /></>,
  automatizaciones: <><rect x="4" y="8" width="16" height="12" rx="2" /><path d="M12 4v4M9 13v1M15 13v1M10 17h4" /></>,
}
function Icono({ de }: { de: keyof typeof ICONOS }) {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONOS[de]}</svg>
  )
}

const NOMBRES = { inventario: 'Inventario', automatizaciones: 'Automatiza' } as const   // 19-10: un solo nombre

// 21-11 (el dueño: «más intuitivo un botón de cambio rápido que un selector»): interruptor de dos partes junto al logo.
// El espacio donde estás va marcado con ícono + nombre; el otro, solo con su ícono (el nombre al pasar el mouse). Un clic cambia, se ve siempre que existe el otro y ocupa casi lo mismo que el menú de antes.
// El Radar es otra aplicación: está en el menú de la cuenta («Radar ↗»), no aquí.
// Solo aparece si la empresa tiene los dos espacios.
export default function EspacioSwitcher({ automatizaciones, inventario, modulos }: { automatizaciones: boolean; inventario: boolean; modulos: string[] }) {
  const pathname = usePathname()
  const actual = espacioActual(pathname, modulos)
  const avisos = useAvisos()
  const urgentesAuto = avisos.preguntas + avisos.mensajes + avisos.negativas
  // 21-11 (el dueño: un «3» gris por guías y calificaciones se leía como urgente): en el interruptor solo un PUNTO ROJO
  // si hay algo urgente (preguntas, mensajes, negativas) y nada en los demás casos (guías, despachos y por calificar
  // tienen su número adentro de Automatiza). El detalle, en la etiqueta al pasar el mouse.
  const partes = [
    avisos.preguntas > 0 && `${avisos.preguntas} pregunta${avisos.preguntas === 1 ? '' : 's'}`,
    avisos.mensajes > 0 && `${avisos.mensajes} mensaje${avisos.mensajes === 1 ? '' : 's'}`,
    avisos.negativas > 0 && `${avisos.negativas} negativa${avisos.negativas === 1 ? '' : 's'}`,
  ].filter(Boolean) as string[]

  // Sin otro espacio al que cambiar, no hay interruptor (la empresa sin inventario solo tiene Automatizaciones).
  // En el celular, al menos se ve dónde estás.
  if (!(automatizaciones && inventario)) return (
    <div className="md:hidden flex items-center gap-2 pl-1 text-sm font-semibold text-neutral-800 min-w-0">
      <Icono de={actual} /><span className="truncate">{NOMBRES[actual]}</span>
    </div>
  )

  const opciones = [
    { id: 'inventario' as const, href: '/dashboard' },
    { id: 'automatizaciones' as const, href: '/automatizaciones' },
  ]

  return (
    <nav aria-label="Espacio" className="flex shrink-0 items-center gap-0.5 rounded-lg bg-neutral-100 p-0.5">
      {opciones.map(o => {
        const activo = actual === o.id
        const urgente = o.id === 'automatizaciones' && urgentesAuto > 0
        const ayuda = `${NOMBRES[o.id]}${urgente ? `: ${partes.join(', ')}` : ''}`
        return (
          <Link key={o.id} href={o.href} aria-current={activo ? 'page' : undefined} aria-label={activo ? undefined : ayuda}
            className={`group relative flex h-8 items-center gap-1.5 rounded-md text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60 ${
              activo ? 'bg-white px-2.5 text-neutral-900 shadow-sm' : 'px-2 text-neutral-500 hover:bg-white/70 hover:text-neutral-800'}`}>
            <Icono de={o.id} />
            {/* En el celular solo los íconos (el marcado dice dónde estás): con el selector de empresa no entraba. */}
            {activo && <span className="hidden sm:inline">{NOMBRES[o.id]}</span>}
            {!activo && urgente && <span aria-hidden className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500 ring-2 ring-neutral-100" />}
            {!activo && (
              <span role="tooltip" className="pointer-events-none absolute left-1/2 top-full z-30 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-neutral-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-sm transition-opacity delay-100 group-hover:opacity-100 group-focus-visible:opacity-100">
                {ayuda}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
