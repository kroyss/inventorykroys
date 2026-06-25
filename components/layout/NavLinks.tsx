'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { UserRole, Country } from '@/lib/types'

const allLinks = [
  { href: '/dashboard',  label: 'Inicio',    roles: ['admin', 'user'] as UserRole[], countries: ['VE', 'CO'] as Country[] },
  { href: '/ventas',     label: 'Ventas',    roles: ['admin', 'user'] as UserRole[], countries: ['VE', 'CO'] as Country[] },
  { href: '/inventario', label: 'Inventario',roles: ['admin', 'user'] as UserRole[], countries: ['VE', 'CO'] as Country[] },
  { href: '/compras',    label: 'Compras',   roles: ['admin', 'user'] as UserRole[], countries: ['VE', 'CO'] as Country[] },
  { href: '/productos',  label: 'Productos', roles: ['admin']         as UserRole[], countries: ['VE', 'CO'] as Country[] },
  { href: '/reportes',   label: 'Reportes',  roles: ['admin']         as UserRole[], countries: ['VE', 'CO'] as Country[] },
  { href: '/finanzas',   label: 'Finanzas',  roles: ['admin']         as UserRole[], countries: ['VE', 'CO'] as Country[] },
  { href: '/tasas',      label: 'Tasas',     roles: ['admin']         as UserRole[], countries: ['VE', 'CO'] as Country[] },
]

interface Props {
  role: UserRole
  country: Country
}

export default function NavLinks({ role, country }: Props) {
  const pathname = usePathname()
  const links = allLinks.filter(
    l => l.roles.includes(role) && l.countries.includes(country)
  )

  return (
    <div className="flex items-center gap-0.5 flex-1">
      {links.map(l => {
        const active =
          pathname === l.href ||
          (l.href !== '/dashboard' && pathname.startsWith(l.href))
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              active
                ? 'bg-neutral-900 text-white'
                : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900'
            }`}
          >
            {l.href === '/compras' && role === 'user' ? 'Recepciones' : l.label}
          </Link>
        )
      })}
    </div>
  )
}
