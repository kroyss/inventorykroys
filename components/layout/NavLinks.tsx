'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import type { UserRole, Country } from '@/lib/types'
import { rutaHabilitada } from '@/lib/modulos'
import { espacioActual, type Espacio } from '@/lib/espacios'
import { useAvisos, AVISO_DE_RUTA, Numerito } from './Avisos'

const allLinks: { href: string; label: string; roles: UserRole[]; countries: Country[]; espacio?: Espacio }[] = [
  { href: '/dashboard',  label: 'Inicio',    roles: ['admin', 'user'] as UserRole[], countries: ['VE', 'CO'] as Country[] },
  { href: '/ventas',     label: 'Ventas',    roles: ['admin', 'user'] as UserRole[], countries: ['VE', 'CO'] as Country[] },
  { href: '/facturas',   label: 'Facturas',  roles: ['admin', 'user'] as UserRole[], countries: ['VE']       as Country[] },
  { href: '/inventario', label: 'Inventario',roles: ['admin', 'user'] as UserRole[], countries: ['VE', 'CO'] as Country[] },
  { href: '/compras',    label: 'Compras',   roles: ['admin', 'user'] as UserRole[], countries: ['VE', 'CO'] as Country[] },
  { href: '/productos',  label: 'Productos', roles: ['admin']         as UserRole[], countries: ['VE', 'CO'] as Country[] },
  { href: '/reportes',   label: 'Reportes',  roles: ['admin']         as UserRole[], countries: ['VE', 'CO'] as Country[] },
  { href: '/finanzas',   label: 'Finanzas',  roles: ['admin']         as UserRole[], countries: ['VE', 'CO'] as Country[] },
  // Ajustes, Usuarios y Plataforma viven en el menú de la cuenta (UserMenu).
  // ── Automatizaciones ──
  { href: '/automatizaciones', label: 'Inicio',     roles: ['admin', 'user'], countries: ['VE', 'CO'], espacio: 'automatizaciones' },
  { href: '/pagos-me',         label: 'Pagos ME',   roles: ['admin', 'user'], countries: ['VE'],       espacio: 'automatizaciones' },
  { href: '/despachos',        label: 'Despachos',  roles: ['admin', 'user'], countries: ['VE'],       espacio: 'automatizaciones' },
  { href: '/reportador',       label: 'Reportador', roles: ['admin', 'user'], countries: ['VE'],       espacio: 'automatizaciones' },
  { href: '/preguntas',        label: 'Preguntas',  roles: ['admin', 'user'], countries: ['VE', 'CO'], espacio: 'automatizaciones' },
  { href: '/mensajes',         label: 'Mensajes',   roles: ['admin', 'user'], countries: ['VE', 'CO'], espacio: 'automatizaciones' },
  { href: '/calificaciones',   label: 'Calificaciones', roles: ['admin', 'user'], countries: ['VE', 'CO'], espacio: 'automatizaciones' },
  { href: '/alertas-stock',    label: 'Stock',         roles: ['admin', 'user'], countries: ['VE', 'CO'], espacio: 'automatizaciones' },
]

interface Props {
  role: UserRole
  country: Country
  modulos: string[]
}

const CLASE_LINK = 'inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap px-2 xl:px-3 py-1.5 rounded-md text-sm font-medium transition-colors'

export default function NavLinks({ role, country, modulos }: Props) {
  const pathname = usePathname()
  const avisos = useAvisos()
  const links = allLinks.filter(
    l => l.roles.includes(role) && l.countries.includes(country) && rutaHabilitada(l.href, modulos)
      && (l.espacio ?? 'inventario') === espacioActual(pathname, modulos)
  )
  const activo = (href: string) =>
    pathname === href || (href !== '/dashboard' && href !== '/automatizaciones' && pathname.startsWith(href))
  const etiqueta = (l: typeof links[number]) => (
    <>
      {l.href === '/compras' && role === 'user' ? 'Recepciones' : l.label}
      {AVISO_DE_RUTA[l.href] && <Numerito n={avisos[AVISO_DE_RUTA[l.href].clave]} urgente={AVISO_DE_RUTA[l.href].urgente} />}
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
  const avisosOcultos = ocultos.filter(l => AVISO_DE_RUTA[l.href] && avisos[AVISO_DE_RUTA[l.href].clave] > 0)

  return (
    // En mobile la navegación vive en la barra inferior (BottomNav); acá se ocultan los links.
    <div ref={caja} className="hidden md:flex items-center gap-0.5 flex-1 min-w-0">
      {/* Regla invisible (fixed: no ensancha la página) para medir cada link y el botón Más */}
      <div ref={regla} aria-hidden="true" className="fixed top-0 left-0 invisible pointer-events-none flex gap-0.5 -z-10">
        {links.map(l => <span key={l.href} className={CLASE_LINK}>{etiqueta(l)}</span>)}
        <span className={CLASE_LINK}>Más ▾</span>
      </div>

      {visibles.map(l => (
        <Link key={l.href} href={l.href}
          className={`${CLASE_LINK} ${activo(l.href) ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900'}`}>
          {etiqueta(l)}
        </Link>
      ))}

      {ocultos.length > 0 && (
        <div ref={menu} className="relative shrink-0">
          <button type="button" onClick={() => setAbierto(a => !a)} aria-expanded={abierto}
            className={`${CLASE_LINK} ${masActivo ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900'}`}>
            Más
            {avisosOcultos.length > 0 && <span className="w-2 h-2 rounded-full bg-amber-400" title="Hay pendientes en las opciones de Más" />}
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
