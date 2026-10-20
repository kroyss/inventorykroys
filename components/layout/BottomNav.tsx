'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import type { UserRole, Country } from '@/lib/types'
import { rutaHabilitada } from '@/lib/modulos'
import { puede, rutaPermitida } from '@/lib/permisos'
import { espacioActual } from '@/lib/espacios'
import { useAvisos, AVISO_DE_RUTA, Numerito, NumerosCalificaciones, hayAlerta } from './Avisos'

// Barra inferior del celular. Íconos de línea (mismo trazo en todos, estilo Lucide) en lugar de
// emojis: se ven igual en Android/iPhone y combinan con el resto de la interfaz.
const ICONOS: Record<string, React.ReactNode> = {
  inicio: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" /></>,
  preguntas: <><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></>,
  mensajes: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  despachos: <><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" /><path d="M15 18H9" /><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14" /><circle cx="17" cy="18" r="2" /><circle cx="7" cy="18" r="2" /></>,
  calificaciones: <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />,
  reportador: <><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="m9 14 2 2 4-4" /></>,
  novedades: <><path d="M3 10v4a1 1 0 0 0 1 1h3l6 4V5L7 9H4a1 1 0 0 0-1 1z" /><path d="M17 9a4 4 0 0 1 0 6" /><path d="M19.5 6.5a8 8 0 0 1 0 11" /></>,
  reputacion: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></>,
  stock: <><path d="M22 17 13.5 8.5l-5 5L2 7" /><path d="M16 17h6v-6" /></>,
  inventario: <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><path d="M3.27 6.96 12 12.01l8.73-5.05" /><path d="M12 22.08V12" /></>,
  aprendizaje: <><path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z" /><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z" /></>,
  ventas: <><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" /><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" /><path d="M12 17.5v-11" /></>,
  compras: <><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" /></>,
  reportes: <><path d="M3 3v18h18" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" /></>,
  pagos: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /><path d="M6 15h4" /></>,
  facturas: <><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M16 13H8" /><path d="M16 17H8" /><path d="M10 9H8" /></>,
  productos: <><path d="M12.59 2.59A2 2 0 0 0 11.17 2H4a2 2 0 0 0-2 2v7.17a2 2 0 0 0 .59 1.42l8.7 8.7a2.43 2.43 0 0 0 3.42 0l6.58-6.58a2.43 2.43 0 0 0 0-3.42z" /><circle cx="7.5" cy="7.5" r="1" /></>,
  finanzas: <><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" /><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" /></>,
  ajustes: <><path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3" /><path d="M14 2v4M8 10v4M16 18v4" /></>,
  usuarios: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  automatizaciones: <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />,
  mas: <><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></>,
}

function Icono({ nombre, className = 'w-[22px] h-[22px]' }: { nombre: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"
      strokeLinejoin="round" className={className} aria-hidden="true">
      {ICONOS[nombre]}
    </svg>
  )
}

interface NavItem { href: string; label: string; icon: string; countries: Country[] }

const PRIMARY: NavItem[] = [
  { href: '/dashboard',  label: 'Inicio',  icon: 'inicio',   countries: ['VE', 'CO'] },
  { href: '/ventas',     label: 'Ventas',  icon: 'ventas',   countries: ['VE', 'CO'] },
  { href: '/compras',    label: 'Compras', icon: 'compras',  countries: ['VE', 'CO'] },
  { href: '/reportes',   label: 'Reportes',icon: 'reportes', countries: ['VE', 'CO'] },
]

const MORE: NavItem[] = [
  { href: '/inventario', label: 'Inventario', icon: 'inventario', countries: ['VE', 'CO'] },
  { href: '/automatizaciones', label: 'Automatiza', icon: 'automatizaciones', countries: ['VE', 'CO'] },
  { href: '/facturas',   label: 'Facturas',   icon: 'facturas',   countries: ['VE'] },
  { href: '/productos',  label: 'Productos',  icon: 'productos',  countries: ['VE', 'CO'] },
  { href: '/vincular-ml', label: 'Vincular ML', icon: 'productos', countries: ['VE', 'CO'] },
  { href: '/finanzas',   label: 'Finanzas',   icon: 'finanzas',   countries: ['VE', 'CO'] },
  { href: '/tasas',      label: 'Ajustes',    icon: 'ajustes',    countries: ['VE', 'CO'] },
  { href: '/usuarios',   label: 'Usuarios',   icon: 'usuarios',   countries: ['VE', 'CO'] },
  { href: '/aprendizaje', label: 'Aprendizaje', icon: 'aprendizaje', countries: ['VE', 'CO'] },
  { href: '/novedades',   label: 'Novedades',   icon: 'novedades',   countries: ['VE', 'CO'] },
]

// Espacio Automatizaciones (móvil): lo del día a día abajo; el resto en "Más".
const PRIMARY_AUTO: NavItem[] = [
  { href: '/automatizaciones', label: 'Inicio',     icon: 'inicio',     countries: ['VE', 'CO'] },
  { href: '/preguntas',        label: 'Preguntas',  icon: 'preguntas',  countries: ['VE', 'CO'] },
  { href: '/mensajes',         label: 'Mensajes',   icon: 'mensajes',   countries: ['VE', 'CO'] },
  { href: '/alertas-stock',    label: 'Stock',      icon: 'stock',      countries: ['VE', 'CO'] },
]
const MORE_AUTO: NavItem[] = [
  { href: '/despachos',        label: 'Despachos',  icon: 'despachos',  countries: ['VE'] },
  { href: '/calificaciones',   label: 'Calificaciones', icon: 'calificaciones', countries: ['VE', 'CO'] },
  { href: '/reportador',       label: 'Reportador', icon: 'reportador', countries: ['VE'] },
  { href: '/dashboard',        label: 'Inventario', icon: 'inventario', countries: ['VE', 'CO'] },
  { href: '/aprendizaje',      label: 'Aprendizaje', icon: 'aprendizaje', countries: ['VE', 'CO'] },
  { href: '/novedades',        label: 'Novedades',   icon: 'novedades',   countries: ['VE', 'CO'] },
]

export default function BottomNav({ role, permisos, country, modulos }: { role: UserRole; permisos: string[]; country: Country; modulos: string[] }) {
  const u = { role, permisos }
  const pathname = usePathname()
  const avisos = useAvisos()
  const [showMore, setShowMore] = useState(false)
  // Escribiendo (teclado abierto): la barra se esconde. En el iPhone sube con el teclado y tapaba el cuadro (17-10).
  const [escribiendo, setEscribiendo] = useState(false)
  useEffect(() => {
    const esCampo = (t: EventTarget | null) => t instanceof HTMLElement &&
      (t.tagName === 'TEXTAREA' || t.isContentEditable || (t.tagName === 'INPUT' &&
        !['checkbox', 'radio', 'button', 'submit', 'range', 'color', 'file'].includes((t as HTMLInputElement).type)))
    const entra = (e: FocusEvent) => { if (esCampo(e.target)) setEscribiendo(true) }
    const sale = () => setTimeout(() => setEscribiendo(esCampo(document.activeElement)), 50)
    document.addEventListener('focusin', entra)
    document.addEventListener('focusout', sale)
    return () => { document.removeEventListener('focusin', entra); document.removeEventListener('focusout', sale) }
  }, [])
  // Novedades sin ver (migración 095): punto verde en "Más" y en su botón.
  const [novedades, setNovedades] = useState(0)
  useEffect(() => {
    let vivo = true
    fetch('/api/novedades', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(d => { if (vivo && d) setNovedades(d.nuevas ?? 0) }).catch(() => {})
    return () => { vivo = false }
  }, [pathname])

  const visible = (items: NavItem[]) =>
    items.filter(i => rutaPermitida(i.href, u) && i.countries.includes(country) && rutaHabilitada(i.href, modulos)
      && !(i.href === '/vincular-ml' && puede(u, 'ver_productos')))   // quien ve Productos entra desde ahí

  const auto    = espacioActual(pathname, modulos) === 'automatizaciones'
  const tieneAuto = modulos.includes('despachos') || modulos.includes('reportador') || modulos.includes('preguntas')
  const primary = visible(auto ? PRIMARY_AUTO : PRIMARY)
  const more    = visible(auto ? MORE_AUTO : MORE).filter(i => i.href !== '/automatizaciones' || tieneAuto)
  const activo  = (href: string) => pathname === href ||
    (href !== '/dashboard' && href !== '/automatizaciones' && pathname.startsWith(href + '/'))
  const enMas   = more.some(i => activo(i.href))
  // Avisos de lo que quedó en "Más" (p. ej. calificaciones): un punto en el botón.
  const avisosMas = more.reduce((a, i) => a + (AVISO_DE_RUTA[i.href] ? avisos[AVISO_DE_RUTA[i.href].clave] : 0)
    + (i.href === '/calificaciones' ? avisos.negativas : 0), 0)
  const etiqueta = (i: NavItem) => i.href === '/compras' && !puede(u, 'compras_editar') ? 'Recepciones' : i.label

  const boton = (i: NavItem) => {
    const on = activo(i.href)
    const aviso = AVISO_DE_RUTA[i.href]
    return (
      <Link key={i.href} href={i.href} onClick={() => setShowMore(false)}
        className={`flex-1 min-w-0 flex flex-col items-center justify-center gap-1 ${on ? 'text-neutral-900' : 'text-neutral-500'}`}>
        <span className={`relative flex items-center justify-center h-8 w-14 rounded-full transition-colors ${on ? 'bg-lime-200/80' : ''}`}>
          <Icono nombre={i.icon} />
          {aviso && <Numerito n={avisos[aviso.clave]} urgente={aviso.urgente} className="absolute -top-1 right-1.5" />}
        </span>
        <span className={`text-[11px] leading-none truncate max-w-full px-0.5 ${on ? 'font-semibold' : 'font-medium'}`}>{etiqueta(i)}</span>
      </Link>
    )
  }

  return (
    <>
      {/* "Más": hoja que sube desde la barra */}
      {showMore && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/20" onClick={() => setShowMore(false)}>
          <div className="absolute inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] bg-white rounded-t-2xl border-t border-neutral-200 shadow-xl p-3 grid grid-cols-3 gap-2"
            onClick={e => e.stopPropagation()}>
            {more.map(i => {
              const on = activo(i.href)
              const aviso = AVISO_DE_RUTA[i.href]
              return (
                <Link key={i.href} href={i.href} onClick={() => setShowMore(false)}
                  className={`relative flex flex-col items-center gap-1.5 py-3 px-1 rounded-xl text-center ${on ? 'bg-lime-100 text-neutral-900' : 'text-neutral-600 active:bg-neutral-100'}`}>
                  <Icono nombre={i.icon} className="w-6 h-6" />
                  <span className="text-xs font-medium leading-tight">{etiqueta(i)}</span>
                  <span className="absolute top-1.5 right-2 flex gap-0.5">
                    {i.href === '/calificaciones' ? <NumerosCalificaciones avisos={avisos} />
                      : i.href === '/novedades' ? (novedades > 0 && <span className="w-2 h-2 rounded-full bg-lime-500" />)
                      : aviso && <Numerito n={avisos[aviso.clave]} urgente={aviso.urgente} />}
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* Barra inferior — solo en el celular (respeta la zona del gesto de inicio del iPhone) */}
      <nav className={`md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-neutral-200 pb-[env(safe-area-inset-bottom)] ${escribiendo ? 'hidden' : ''}`}>
        <div className="flex items-stretch h-16">
          {primary.map(boton)}
          {more.length > 0 && (
            <button onClick={() => setShowMore(v => !v)} aria-expanded={showMore}
              className={`flex-1 min-w-0 flex flex-col items-center justify-center gap-1 ${showMore || enMas ? 'text-neutral-900' : 'text-neutral-500'}`}>
              <span className={`relative flex items-center justify-center h-8 w-14 rounded-full transition-colors ${showMore || enMas ? 'bg-lime-200/80' : ''}`}>
                <Icono nombre="mas" />
                {avisosMas > 0 && !showMore && <span className={`absolute top-0.5 right-3 w-2 h-2 rounded-full ${
                  hayAlerta(avisos, more.map(i => i.href)) ? 'bg-red-500' : 'bg-neutral-400'}`} />}
                {avisosMas === 0 && novedades > 0 && !showMore && <span className="absolute top-0.5 right-3 w-2 h-2 rounded-full bg-lime-500" />}
              </span>
              <span className={`text-[11px] leading-none ${showMore || enMas ? 'font-semibold' : 'font-medium'}`}>Más</span>
            </button>
          )}
        </div>
      </nav>
    </>
  )
}
