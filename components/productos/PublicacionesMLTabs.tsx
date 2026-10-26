import Link from 'next/link'
import type { Session } from 'next-auth'
import { puede } from '@/lib/permisos'
import { tieneModulo } from '@/lib/modulos'

// Publicaciones ML (26-10): Vincular, Stock y Promociones son lo mismo visto de tres lados (mis productos en ML).
// Cada pantalla sigue en su dirección de siempre (avisos de Telegram, menús y permisos no cambian); arriba comparten
// estas pestañas. Cada una se muestra con las mismas reglas que su página; con una sola no se dibuja nada.
export type PestanaML = 'vincular' | 'stock' | 'promociones'

export function pestanasML(user: Session['user']) {
  const p: { k: PestanaML; t: string; href: string }[] = []
  if (puede(user, 'vincular_ml') || (puede(user, 'ver_productos') && puede(user, 'importar_ml'))) p.push({ k: 'vincular', t: 'Vincular', href: '/vincular-ml' })
  if (tieneModulo(user, 'inventario') && tieneModulo(user, 'preguntas') && puede(user, 'ver_inventario')) p.push({ k: 'stock', t: 'Stock', href: '/inventario/stock-ml' })
  if (user.country === 'VE' && tieneModulo(user, 'promociones') && puede(user, 'promociones') && puede(user, 'ver_productos')) p.push({ k: 'promociones', t: 'Promociones', href: '/productos/promociones' })
  return p
}

export default function PublicacionesMLTabs({ user, actual }: { user: Session['user']; actual: PestanaML }) {
  const p = pestanasML(user)
  if (p.length < 2) return null
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-neutral-200">
      <span className="pb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Publicaciones ML</span>
      <nav className="-mb-px flex gap-1 overflow-x-auto">
        {p.map(x => (
          <Link key={x.k} href={x.href} aria-current={x.k === actual ? 'page' : undefined}
            className={`whitespace-nowrap border-b-2 px-3 pb-2 text-sm ${x.k === actual ? 'border-lime-500 font-medium text-neutral-900' : 'border-transparent text-neutral-500 hover:text-neutral-800'}`}>
            {x.t}
          </Link>
        ))}
      </nav>
    </div>
  )
}
