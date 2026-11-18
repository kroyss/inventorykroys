import Link from '@/components/ui/Link'
import { puede } from '@/lib/permisos'
import { tieneModulo } from '@/lib/modulos'
import type { UserRole } from '@/lib/types'
import { Nuevo, VistoNuevo } from '@/components/ui/Nuevo'

// Inventario (18-11, Fase 1 del orden): «lo que tengo» (Stock) y «lo que compro» (Reponer, antes Reportes → Stock).
// Reponer pide lo mismo que antes (ver Reportes + el análisis de stock, que viene con el Inventario): nadie gana ni
// pierde acceso. Sin Reponer no se dibujan pestañas.
type UsuarioInv = { role?: UserRole; permisos?: string[]; modulos?: string[] }
export const puedeReponer = (u: UsuarioInv) => puede(u, 'ver_inventario') && puede(u, 'ver_reportes') && tieneModulo(u, 'analisis_stock')

export default function InventarioTabs({ user, actual }: { user: UsuarioInv; actual: 'stock' | 'reponer' }) {
  if (!puedeReponer(user)) return null
  const tab = (k: 'stock' | 'reponer', href: string, t: React.ReactNode, title: string) => (
    <Link href={href} aria-current={actual === k ? 'page' : undefined} title={title}
      className={`inline-flex items-center whitespace-nowrap border-b-2 px-3 pb-2 text-sm ${actual === k ? 'border-lime-500 font-medium text-neutral-900' : 'border-transparent text-neutral-500 hover:text-neutral-800'}`}>{t}</Link>
  )
  return (
    <div className="mb-4 flex items-end gap-x-4 border-b border-neutral-200">
      <span className="pb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Inventario</span>
      <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Inventario">
        {tab('stock', '/inventario', 'Stock', 'Lo que tienes hoy: ajustes, conteos y movimientos')}
        {tab('reponer', '/inventario/reponer', <>Reponer{actual !== 'reponer' && <Nuevo clave="reponer" />}</>, 'Qué comprar según tus ventas y tus reglas, y crear la compra')}
      </nav>
      {actual === 'reponer' && <VistoNuevo clave="reponer" />}
    </div>
  )
}
