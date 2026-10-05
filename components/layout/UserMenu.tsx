'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { useEffect, useRef, useState } from 'react'
import { espacioDe } from '@/lib/espacios'

interface Props {
  nombre: string
  rol: 'admin' | 'user'
  empresa: string | null
  ajustes: boolean
  usuarios: boolean
  plataforma: boolean
}

// Menú de la cuenta (arriba a la derecha): lo que se toca poco (Ajustes, Usuarios,
// Plataforma) y Cerrar sesión, para que la barra quede solo con el trabajo del día.
export default function UserMenu({ nombre, rol, empresa, ajustes, usuarios, plataforma }: Props) {
  const pathname = usePathname()
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc) }
  }, [abierto])

  const iniciales = nombre.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?'
  const links = [
    // Ajustes es del inventario (tasa, exceso, categorías): en Automatizaciones cada herramienta tiene los suyos adentro.
    ajustes && espacioDe(pathname) === 'inventario' && { href: '/tasas', label: 'Ajustes' },
    usuarios   && { href: '/usuarios',   label: 'Usuarios' },
    plataforma && { href: '/plataforma', label: 'Plataforma' },
  ].filter(Boolean) as { href: string; label: string }[]
  const fila = 'block px-3 py-2 rounded-md text-sm transition-colors'

  return (
    <div ref={caja} className="relative shrink-0">
      <button type="button" onClick={() => setAbierto(a => !a)} aria-haspopup="menu" aria-expanded={abierto}
        className={`flex items-center gap-2 pl-1 pr-1.5 py-1 rounded-lg transition-colors ${abierto ? 'bg-neutral-100' : 'hover:bg-neutral-100'}`}>
        <span className="w-7 h-7 rounded-full bg-neutral-900 text-white text-[11px] font-semibold flex items-center justify-center">
          {iniciales}
        </span>
        <span className="text-sm text-neutral-700 hidden lg:block max-w-[10rem] truncate">{nombre}</span>
        <svg viewBox="0 0 24 24" className={`w-4 h-4 text-neutral-400 transition-transform ${abierto ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>

      {abierto && (
        <div role="menu" className="absolute right-0 top-full mt-1.5 w-60 bg-white border border-neutral-200 rounded-xl shadow-lg p-1.5 z-30">
          <div className="px-3 pt-1.5 pb-2">
            <p className="text-sm font-semibold text-neutral-800 truncate">{nombre}</p>
            <p className="text-xs text-neutral-500 truncate">
              {rol === 'admin' ? 'Administrador' : 'Usuario'}{empresa ? ` · ${empresa}` : ''}
            </p>
          </div>
          {links.length > 0 && <div className="my-1 border-t border-neutral-100" />}
          {links.map(l => (
            <Link key={l.href} href={l.href} role="menuitem" onClick={() => setAbierto(false)}
              className={`${fila} ${pathname.startsWith(l.href) ? 'bg-neutral-100 text-neutral-900 font-medium' : 'text-neutral-700 hover:bg-neutral-50'}`}>
              {l.label}
            </Link>
          ))}
          <div className="my-1 border-t border-neutral-100" />
          <button type="button" role="menuitem" onClick={() => signOut({ callbackUrl: '/login' })}
            className={`${fila} w-full text-left text-neutral-700 hover:bg-neutral-50`}>
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  )
}
