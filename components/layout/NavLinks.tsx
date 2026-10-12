'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import type { UserRole, Country } from '@/lib/types'
import { rutaHabilitada } from '@/lib/modulos'
import { puede, rutaPermitida } from '@/lib/permisos'
import { espacioActual, type Espacio } from '@/lib/espacios'
import { useAvisos, AVISO_DE_RUTA, Numerito, NumerosCalificaciones, hayAlerta } from './Avisos'

const allLinks: { href: string; label: string; countries: Country[]; espacio?: Espacio }[] = [
  { href: '/dashboard',  label: 'Inicio',    countries: ['VE', 'CO'] as Country[] },
  { href: '/ventas',     label: 'Ventas',    countries: ['VE', 'CO'] as Country[] },
  { href: '/pagos-me',   label: 'Pagos ME',  countries: ['VE']       as Country[] },
  { href: '/facturas',   label: 'Facturas',  countries: ['VE']       as Country[] },
  { href: '/inventario', label: 'Inventario',countries: ['VE', 'CO'] as Country[] },
  { href: '/compras',    label: 'Compras',   countries: ['VE', 'CO'] as Country[] },
  { href: '/productos',  label: 'Productos', countries: ['VE', 'CO'] as Country[] },
  { href: '/reportes',   label: 'Reportes',  countries: ['VE', 'CO'] as Country[] },
  { href: '/finanzas',   label: 'Finanzas',  countries: ['VE', 'CO'] as Country[] },
  // Ajustes, Usuarios y Plataforma viven en el menú de la cuenta (UserMenu).
  // ── Automatizaciones ──
  { href: '/automatizaciones', label: 'Inicio',     countries: ['VE', 'CO'], espacio: 'automatizaciones' },
  { href: '/despachos',        label: 'Despachos',  countries: ['VE'],       espacio: 'automatizaciones' },
  { href: '/reportador',       label: 'Reportador', countries: ['VE'],       espacio: 'automatizaciones' },
  { href: '/preguntas',        label: 'Preguntas',  countries: ['VE', 'CO'], espacio: 'automatizaciones' },
  { href: '/mensajes',         label: 'Mensajes',   countries: ['VE', 'CO'], espacio: 'automatizaciones' },
  { href: '/calificaciones',   label: 'Calificaciones', countries: ['VE', 'CO'], espacio: 'automatizaciones' },
  { href: '/alertas-stock',    label: 'Stock',         countries: ['VE', 'CO'], espacio: 'automatizaciones' },
]

interface Props {
  role: UserRole
  permisos: string[]
  country: Country
  modulos: string[]
}

const CLASE_LINK = 'inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap px-2 xl:px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors'
const ES_INICIO = (href: string) => href === '/dashboard' || href === '/automatizaciones'

/** "Inicio" como casita (el nombre queda en el tooltip y para lectores de pantalla). */
function Casita() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round"
      strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d="M3.5 10.5 12 3.5l8.5 7" />
      <path d="M5.5 9v9.5a1.5 1.5 0 0 0 1.5 1.5h3.5v-5.5h3V20H17a1.5 1.5 0 0 0 1.5-1.5V9" />
    </svg>
  )
}

export default function NavLinks({ role, permisos, country, modulos }: Props) {
  const u = { role, permisos }
  const pathname = usePathname()
  const avisos = useAvisos()
  const links = allLinks.filter(
    l => rutaPermitida(l.href, u) && l.countries.includes(country) && rutaHabilitada(l.href, modulos)
      && (l.espacio ?? 'inventario') === espacioActual(pathname, modulos)
  )
  const activo = (href: string) =>
    pathname === href || (href !== '/dashboard' && href !== '/automatizaciones' && pathname.startsWith(href))
  const etiqueta = (l: typeof links[number]) => (
    <>
      {ES_INICIO(l.href) ? <><Casita /><span className="sr-only">{l.label}</span></>
        : l.href === '/compras' && !puede(u, 'compras_editar') ? 'Recepciones' : l.label}
      {l.href === '/calificaciones' ? <NumerosCalificaciones avisos={avisos} />
        : AVISO_DE_RUTA[l.href] && <Numerito n={avisos[AVISO_DE_RUTA[l.href].clave]} urgente={AVISO_DE_RUTA[l.href].urgente} />}
    </>
  )

  // Cuántos links caben: los que no, van al botón "Más" (como en el celular). Se mide una copia
  // invisible de todos los links (con sus numeritos) contra el ancho disponible.
  const caja = useRef<HTMLDivElement>(null)
  const regla = useRef<HTMLDivElement>(null)
  const [caben, setCaben] = useState(links.length)
  const [abierto, setAbierto] = useState(false)
  const claveLinks = links.map(l => l.href).join(',')
  useEffect(() => {
    const medir = () => {
      if (!caja.current || !regla.current) return
      const anchos = [...regla.current.children].map(c => (c as HTMLElement).offsetWidth + 2)
      const mas = anchos.pop() ?? 80
      const disponible = caja.current.clientWidth
      const total = anchos.reduce((a, b) => a + b, 0)
      if (total <= disponible) { setCaben(anchos.length); return }
      let suma = mas, n = 0
      while (n < anchos.length && suma + anchos[n] <= disponible) suma += anchos[n++]
      setCaben(n)
    }
    const ro = new ResizeObserver(medir)
    if (caja.current) ro.observe(caja.current)
    if (regla.current) ro.observe(regla.current)
    return () => ro.disconnect()
  }, [claveLinks])
  // El menú "Más" se cierra al navegar o al tocar afuera.
  const [rutaMenu, setRutaMenu] = useState(pathname)
  if (rutaMenu !== pathname) { setRutaMenu(pathname); setAbierto(false) }
  const menu = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => { if (!menu.current?.contains(e.target as Node)) setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [abierto])

  const visibles = links.slice(0, caben)
  const ocultos = links.slice(caben)
  const masActivo = ocultos.some(l => activo(l.href))
  const avisosOcultos = ocultos.filter(l => (AVISO_DE_RUTA[l.href] && avisos[AVISO_DE_RUTA[l.href].clave] > 0)
    || (l.href === '/calificaciones' && avisos.negativas + avisos.neutrales > 0))
  const alertaOculta = hayAlerta(avisos, ocultos.map(l => l.href))

  return (
    // En mobile la navegación vive en la barra inferior (BottomNav); acá se ocultan los links.
    <div ref={caja} className="hidden md:flex items-center gap-0.5 flex-1 min-w-0">
      {/* Regla invisible (fixed: no ensancha la página) para medir cada link y el botón Más */}
      <div ref={regla} aria-hidden="true" className="fixed top-0 left-0 invisible pointer-events-none flex gap-0.5 -z-10">
        {links.map(l => <span key={l.href} className={CLASE_LINK}>{etiqueta(l)}</span>)}
        <span className={CLASE_LINK}>Más ▾</span>
      </div>

      {visibles.map(l => (
        <Link key={l.href} href={l.href} title={ES_INICIO(l.href) ? 'Inicio' : undefined}
          className={`${CLASE_LINK} ${ES_INICIO(l.href) ? '!px-2' : ''} ${activo(l.href) ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900'}`}>
          {etiqueta(l)}
        </Link>
      ))}

      {ocultos.length > 0 && (
        <div ref={menu} className="relative shrink-0">
          <button type="button" onClick={() => setAbierto(a => !a)} aria-expanded={abierto}
            className={`${CLASE_LINK} ${masActivo ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900'}`}>
            Más
            {avisosOcultos.length > 0 && <span className={`w-2 h-2 rounded-full ${alertaOculta ? 'bg-red-500' : 'bg-neutral-400'}`}
              title={alertaOculta ? 'Hay alertas en las opciones de Más' : 'Hay pendientes en las opciones de Más'} />}
            <span aria-hidden="true">▾</span>
          </button>
          {abierto && (
            <div className="absolute right-0 top-full mt-1 z-30 min-w-[12rem] bg-white rounded-lg border border-neutral-200 shadow-lg py-1">
              {ocultos.map(l => (
                <Link key={l.href} href={l.href}
                  className={`flex items-center justify-between gap-3 px-3 py-2 text-sm font-medium ${activo(l.href) ? 'bg-neutral-900 text-white' : 'text-neutral-700 hover:bg-neutral-100'}`}>
                  {etiqueta(l)}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
