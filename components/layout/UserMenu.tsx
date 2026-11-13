'use client'
import Link from '@/components/ui/Link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { useEffect, useRef, useState } from 'react'
import { espacioDe } from '@/lib/espacios'
import { Nuevo, type ClaveNuevo } from '@/components/ui/Nuevo'

interface Props {
  nombre: string
  rol: 'admin' | 'user'
  empresa: string | null
  ajustes: boolean
  usuarios?: boolean   // 13-11: ya no se usa (Usuarios vive en Mi cuenta → Mi equipo)
  plataforma: boolean
  demo?: boolean
  pagosME?: boolean
  avisos?: boolean
  miPlan?: boolean
  miIA?: boolean
  /** 12-11: la cuenta tiene Radar → «Radar ↗» entra directo, sin volver a escribir la clave (/api/radar/entrar). */
  radar?: boolean
}

// Menú de la cuenta (arriba a la derecha): lo que se toca poco (Ajustes, Usuarios,
// Plataforma) y Cerrar sesión, para que la barra quede solo con el trabajo del día.
export default function UserMenu({ nombre, rol, empresa, ajustes, plataforma, demo, pagosME = false, avisos = false, miPlan = false, miIA = false, radar = false }: Props) {
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
    // Mi cuenta (13-11): todos (sus datos y su clave); el admin además su equipo (antes Usuarios) y su negocio.
    { href: '/mi-cuenta', label: 'Mi cuenta' },
    // Mis avisos (2026-10-14): Telegram de cada persona; primero solo la organización de la plataforma.
    avisos && { href: '/mis-avisos', label: 'Mis avisos' },
    // Ajustes es del inventario (tasa, exceso, categorías): en Automatizaciones cada herramienta tiene los suyos adentro.
    ajustes && espacioDe(pathname) === 'inventario' && { href: '/tasas', label: 'Ajustes' },
    // Pagos ME (2026-10-12): se verifica desde Ventas; aquí queda el vigilante, el horario y el historial.
    // Sin "despachos_ventas" (ventas de ML) va en la barra de Automatizaciones, junto a Despachos.
    pagosME && espacioDe(pathname) === 'inventario' && { href: '/pagos-me', label: 'Pagos MercadoEnvíos' },
    // Mi plan (02-11, mig. 141): el admin de un cliente ve su plan y reporta el pago.
    // Mi IA (06-11): la misma página que en Preguntas y Mensajes.
    miIA       && { href: '/mi-ia',      label: 'Mi IA', nuevo: 'mi_ia' as const },
    miPlan     && { href: '/mi-plan',    label: 'Mi plan' },
    plataforma && { href: '/plataforma', label: 'Plataforma' },
    demo       && { href: '/demo',       label: 'Demo · restaurar' },
  ].filter(Boolean) as { href: string; label: string; nuevo?: ClaveNuevo }[]
  const fila = 'block px-3 py-2 rounded-md text-sm transition-colors'

  return (
    <div ref={caja} className="relative shrink-0">
      <button type="button" onClick={() => setAbierto(a => !a)} aria-haspopup="menu" aria-expanded={abierto} title={nombre}
        className={`flex items-center gap-1 pl-1 pr-1 py-1 rounded-lg transition-colors ${abierto ? 'bg-neutral-100' : 'hover:bg-neutral-100'}`}>
        <span className="w-7 h-7 rounded-full bg-neutral-900 text-white text-[11px] font-semibold flex items-center justify-center">
          {iniciales}
        </span>
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
              {l.label}{l.nuevo && <Nuevo clave={l.nuevo} />}
            </Link>
          ))}
          {radar && (
            <a href="/api/radar/entrar" target="_blank" rel="noopener" role="menuitem" onClick={() => setAbierto(false)}
              title="Abre el Radar en otra pestaña, ya con tu sesión" className={`${fila} flex items-center justify-between text-neutral-700 hover:bg-neutral-50`}>
              Radar
              <svg viewBox="0 0 24 24" className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" strokeWidth={2}
                strokeLinecap="round" strokeLinejoin="round" aria-label="Abre otra aplicación"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>
            </a>
          )}
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
