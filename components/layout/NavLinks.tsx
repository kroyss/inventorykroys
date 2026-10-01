'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { UserRole, Country } from '@/lib/types'
import { rutaHabilitada } from '@/lib/modulos'
import { espacioDe, type Espacio } from '@/lib/espacios'
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
  { href: '/despachos',        label: 'Despachos',  roles: ['admin', 'user'], countries: ['VE'],       espacio: 'automatizaciones' },
  { href: '/reportador',       label: 'Reportador', roles: ['admin', 'user'], countries: ['VE'],       espacio: 'automatizaciones' },
  { href: '/preguntas',        label: 'Preguntas',  roles: ['admin', 'user'], countries: ['VE', 'CO'], espacio: 'automatizaciones' },
  { href: '/mensajes',         label: 'Mensajes',   roles: ['admin', 'user'], countries: ['VE', 'CO'], espacio: 'automatizaciones' },
  { href: '/calificaciones',   label: 'Calificaciones', roles: ['admin'],     countries: ['VE', 'CO'], espacio: 'automatizaciones' },
]

interface Props {
  role: UserRole
  country: Country
  modulos: string[]
}

export default function NavLinks({ role, country, modulos }: Props) {
  const pathname = usePathname()
  const avisos = useAvisos()
  const links = allLinks.filter(
    l => l.roles.includes(role) && l.countries.includes(country) && rutaHabilitada(l.href, modulos)
      && (l.espacio ?? 'inventario') === espacioDe(pathname)
  )

  return (
    // En mobile la navegación vive en la barra inferior (BottomNav); acá se
    // ocultan los links para que la barra superior no se desborde.
    <div className="hidden md:flex items-center gap-0.5 flex-1">

      {links.map(l => {
        const active =
          pathname === l.href ||
          (l.href !== '/dashboard' && l.href !== '/automatizaciones' && pathname.startsWith(l.href))
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              active
                ? 'bg-neutral-900 text-white'
                : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900'
            }`}
          >
            {l.href === '/compras' && role === 'user' ? 'Recepciones' : l.label}
            {AVISO_DE_RUTA[l.href] && (
              <Numerito n={avisos[AVISO_DE_RUTA[l.href].clave]} urgente={AVISO_DE_RUTA[l.href].urgente} />
            )}
          </Link>
        )
      })}
    </div>
  )
}
