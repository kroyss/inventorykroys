import Link from '@/components/ui/Link'
import type { UserRole } from '@/lib/types'
import { puede } from '@/lib/permisos'
import { tieneModulo } from '@/lib/modulos'
import { tiposPermitidos } from '@/lib/colaPermisos'

// Publicaciones (26-10; menú propio en Inventario desde 08-11): Editar, Vincular, Stock y Promociones son lo mismo visto
// desde varios lados (mis publicaciones de ML). Cada pantalla sigue en su dirección de siempre (avisos de Telegram y
// permisos no cambian); arriba comparten estas pestañas. Cada una se muestra con las mismas reglas que su página;
// con una sola no se dibuja nada. El menú «Publicaciones» aparece si hay al menos una.
export type PestanaML = 'editar' | 'vincular' | 'importar' | 'stock' | 'promociones' | 'envios' | 'tareas'
type UsuarioML = { role?: UserRole; permisos?: string[]; modulos?: string[]; country?: string }

export function pestanasML(user: UsuarioML) {
  const p: { k: PestanaML; t: string; href: string }[] = []
  if (tieneModulo(user, 'publicaciones') && tieneModulo(user, 'preguntas') && puede(user, 'editar_publicaciones')) p.push({ k: 'editar', t: 'Editar', href: '/publicaciones' })
  if (puede(user, 'vincular_ml') || (puede(user, 'ver_productos') && puede(user, 'importar_ml'))) p.push({ k: 'vincular', t: 'Vincular', href: '/vincular-ml' })
  // 13-11 (el dueño): Importar desde ML y MercadoEnvíos vienen de Productos (son de MercadoLibre); la dirección no cambia.
  if (tieneModulo(user, 'preguntas') && puede(user, 'ver_productos') && puede(user, 'importar_ml')) p.push({ k: 'importar', t: 'Importar desde ML', href: '/productos/importar-ml' })
  if (tieneModulo(user, 'inventario') && tieneModulo(user, 'preguntas') && puede(user, 'ver_inventario')) p.push({ k: 'stock', t: 'Stock', href: '/inventario/stock-ml' })
  if (user.country === 'VE' && tieneModulo(user, 'promociones') && puede(user, 'promociones') && puede(user, 'ver_productos')) p.push({ k: 'promociones', t: 'Promociones', href: '/productos/promociones' })
  if (user.country === 'VE' && tieneModulo(user, 'descuento_ml') && puede(user, 'ver_productos')) p.push({ k: 'envios', t: 'MercadoEnvíos', href: '/productos/mercadoenvios' })
  // Tareas en MercadoLibre (09-11): lo que se manda a ML en segundo plano (Editar y Promociones); cada uno ve las suyas.
  if (tiposPermitidos(user).length) p.push({ k: 'tareas', t: 'Tareas', href: '/publicaciones/lotes' })
  return p
}

export default function PublicacionesMLTabs({ user, actual }: { user: UsuarioML; actual: PestanaML }) {
  const p = pestanasML(user)
  if (p.length < 2) return null
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-neutral-200">
      <span className="pb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Publicaciones</span>
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
