'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import type { UserRole, Country } from '@/lib/types'

interface NavItem { href: string; label: string; icon: string; roles: UserRole[]; countries: Country[] }

const PRIMARY: NavItem[] = [
  { href: '/dashboard',  label: 'Inicio',  icon: '🏠', roles: ['admin', 'user'], countries: ['VE', 'CO'] },
  { href: '/ventas',     label: 'Ventas',  icon: '🧾', roles: ['admin', 'user'], countries: ['VE', 'CO'] },
  { href: '/compras',    label: 'Compras', icon: '📦', roles: ['admin', 'user'], countries: ['VE', 'CO'] },
  { href: '/reportes',   label: 'Reportes',icon: '📊', roles: ['admin'],         countries: ['VE', 'CO'] },
]

const MORE: NavItem[] = [
  { href: '/inventario', label: 'Inventario', icon: '📋', roles: ['admin', 'user'], countries: ['VE', 'CO'] },
  { href: '/productos',  label: 'Productos',  icon: '🏷️', roles: ['admin'],        countries: ['VE', 'CO'] },
  { href: '/finanzas',   label: 'Finanzas',   icon: '💰', roles: ['admin'],        countries: ['VE', 'CO'] },
  { href: '/tasas',      label: 'Tasas',      icon: '💱', roles: ['admin'],        countries: ['VE', 'CO'] },
]

export default function BottomNav({ role, country }: { role: UserRole; country: Country }) {
  const pathname = usePathname()
  const [showMore, setShowMore] = useState(false)

  const visible = (items: NavItem[]) =>
    items.filter(i => i.roles.includes(role) && i.countries.includes(country))

  const primary = visible(PRIMARY)
  const more    = visible(MORE)

  return (
    <>
      {/* "Más" popup */}
      {showMore && (
        <div className="md:hidden fixed inset-0 z-40" onClick={() => setShowMore(false)}>
          <div className="absolute bottom-16 inset-x-0 bg-white border-t border-neutral-200 shadow-lg p-3 grid grid-cols-3 gap-3"
            onClick={e => e.stopPropagation()}>
            {more.map(i => (
              <Link key={i.href} href={i.href} onClick={() => setShowMore(false)}
                className={`flex flex-col items-center gap-1 p-3 rounded-lg ${pathname.startsWith(i.href) ? 'bg-neutral-900 text-white' : 'bg-neutral-50 text-neutral-700'}`}>
                <span className="text-xl">{i.icon}</span>
                <span className="text-xs">{i.label}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Bottom bar — only on mobile */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-neutral-200 flex items-stretch h-16 shadow-[0_-1px_3px_rgba(0,0,0,0.06)]">
        {primary.map(i => {
          const active = pathname === i.href || (i.href !== '/dashboard' && pathname.startsWith(i.href))
          return (
            <Link key={i.href} href={i.href}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 ${active ? 'text-neutral-900' : 'text-neutral-400'}`}>
              <span className="text-lg">{i.icon}</span>
              <span className="text-[10px]">{i.href === '/compras' && role === 'user' ? 'Recepciones' : i.label}</span>
            </Link>
          )
        })}
        {more.length > 0 && (
          <button onClick={() => setShowMore(v => !v)}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 ${showMore ? 'text-neutral-900' : 'text-neutral-400'}`}>
            <span className="text-lg">⋯</span>
            <span className="text-[10px]">Más</span>
          </button>
        )}
      </nav>
    </>
  )
}
