import Link from '@/components/ui/Link'
import type { UserRole } from '@/lib/types'
import { puede } from '@/lib/permisos'
import { tieneModulo } from '@/lib/modulos'
import { tiposPermitidos } from '@/lib/colaPermisos'
import { NumeritoAviso } from '@/components/layout/Avisos'
import { Nuevo, VistoNuevo } from '@/components/ui/Nuevo'
import PendientesPreparar from '@/components/productos/PendientesPreparar'

// Publicaciones (26-10; menú propio en Inventario desde 08-11): todo lo de mis publicaciones de ML. Cada pantalla sigue
// en su dirección de siempre (avisos de Telegram, ayuda, manual y permisos no cambian); arriba comparten estas pestañas.
// 18-11 (el dueño: «se volvió sumamente complejo», entrada de los Fundadores): ordenadas por trabajo, no por origen:
//   Stock vs inventario · Editar · Promociones (lo de todos los días) · Preparar (Vincular y Pesos: se hace al empezar
//   y de vez en cuando; con lo pendiente a la vista). Tareas deja de ser pestaña: el avance ya sale abajo a la derecha
//   (AvisoColaML) y el historial queda como enlace a la derecha.
/** 13-11 (el dueño): las direcciones de las pestañas de Publicaciones (algunas viven bajo /productos o /inventario): con
 *  cualquiera abierta, el menú marca «Publicaciones» y no Productos ni Inventario. */
export const RUTAS_PUBLICACIONES = ['/publicaciones', '/vincular-ml', '/inventario/stock-ml', '/productos/promociones', '/productos/mercadoenvios']
export const enPublicaciones = (pathname: string) => RUTAS_PUBLICACIONES.some(r => pathname === r || pathname.startsWith(r + '/'))

export type PestanaML = 'editar' | 'vincular' | 'stock' | 'promociones' | 'envios' | 'tareas'
type UsuarioML = { role?: UserRole; permisos?: string[]; modulos?: string[]; country?: string }

/** Lo que este usuario puede abrir, en el orden del menú (el primero es adonde lleva «Publicaciones»). */
export function pestanasML(user: UsuarioML) {
  const p: { k: PestanaML; t: string; href: string }[] = []
  if (tieneModulo(user, 'inventario') && tieneModulo(user, 'preguntas') && puede(user, 'ver_inventario')) p.push({ k: 'stock', t: 'Stock vs inventario', href: '/inventario/stock-ml' })
  if (tieneModulo(user, 'publicaciones') && tieneModulo(user, 'preguntas') && puede(user, 'editar_publicaciones')) p.push({ k: 'editar', t: 'Editar', href: '/publicaciones' })
  if (user.country === 'VE' && tieneModulo(user, 'promociones') && puede(user, 'promociones') && puede(user, 'ver_productos')) p.push({ k: 'promociones', t: 'Promociones', href: '/productos/promociones' })
  // Preparar: Vincular y Pesos (MercadoEnvíos, 13-11 viene de Productos; 14-11 para toda empresa de Venezuela con Inventario).
  if (puede(user, 'vincular_ml') || (puede(user, 'ver_productos') && puede(user, 'importar_ml'))) p.push({ k: 'vincular', t: 'Vincular', href: '/vincular-ml' })
  if (user.country === 'VE' && tieneModulo(user, 'inventario') && puede(user, 'ver_productos')) p.push({ k: 'envios', t: 'Pesos y envío gratis', href: '/productos/mercadoenvios' })
  // Tareas en MercadoLibre (09-11): lo que se manda a ML en segundo plano; cada uno ve las de sus secciones.
  if (tiposPermitidos(user).length) p.push({ k: 'tareas', t: 'Historial de tareas', href: '/publicaciones/lotes' })
  return p
}

/** Adonde lleva «Publicaciones» en el menú: la primera pestaña que tiene (no la de tareas). */
export const inicioPublicaciones = (user: UsuarioML) => pestanasML(user).find(x => x.k !== 'tareas')?.href ?? '/publicaciones'

const PREPARAR: PestanaML[] = ['vincular', 'envios']
const CLASE = (on: boolean) => `inline-flex items-center whitespace-nowrap border-b-2 px-3 pb-2 text-sm ${on ? 'border-lime-500 font-medium text-neutral-900' : 'border-transparent text-neutral-500 hover:text-neutral-800'}`

export default function PublicacionesMLTabs({ user, actual }: { user: UsuarioML; actual: PestanaML }) {
  const p = pestanasML(user)
  const diarias = p.filter(x => x.k === 'stock' || x.k === 'editar' || x.k === 'promociones')
  const preparar = p.filter(x => PREPARAR.includes(x.k))
  const tareas = p.find(x => x.k === 'tareas')
  if (diarias.length + preparar.length + (tareas ? 1 : 0) < 2) return null
  const enPreparar = PREPARAR.includes(actual)
  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2 border-b border-neutral-200">
        <span className="pb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Publicaciones</span>
        <nav className="-mb-px flex min-w-0 flex-1 gap-1 overflow-x-auto" aria-label="Publicaciones">
          {diarias.map(x => (
            <Link key={x.k} href={x.href} aria-current={x.k === actual ? 'page' : undefined} className={CLASE(x.k === actual)}>
              {x.t}{x.k === 'stock' && <NumeritoAviso clave="vende_de_mas" className="ml-1.5" />}
            </Link>
          ))}
          {preparar.length > 0 && (
            <Link href={preparar[0].href} aria-current={enPreparar ? 'page' : undefined} className={CLASE(enPreparar)}
              title="Lo que se hace al empezar y de vez en cuando: vincular publicaciones con productos y cargar pesos">
              Preparar<PendientesPreparar resumen />{!enPreparar && <Nuevo clave="preparar" />}
            </Link>
          )}
        </nav>
        {tareas && (
          <Link href={tareas.href} aria-current={actual === 'tareas' ? 'page' : undefined}
            className={`pb-2 text-xs underline-offset-2 hover:underline ${actual === 'tareas' ? 'font-medium text-neutral-900' : 'text-neutral-500'}`}
            title="Lo que se mandó a MercadoLibre en segundo plano (el avance de lo que está en curso sale abajo a la derecha)">
            Historial de tareas</Link>
        )}
      </div>
      {enPreparar && preparar.length > 0 && <>
        <VistoNuevo clave="preparar" />
        <nav className="mt-3 flex flex-wrap gap-2" aria-label="Preparar">
          {preparar.map(x => (
            <Link key={x.k} href={x.href} aria-current={x.k === actual ? 'page' : undefined}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${x.k === actual ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300'}`}>
              {x.t}<PendientesPreparar de={x.k === 'vincular' ? 'sinVincular' : 'sinPeso'} activo={x.k === actual} />
            </Link>
          ))}
        </nav>
      </>}
    </div>
  )
}
