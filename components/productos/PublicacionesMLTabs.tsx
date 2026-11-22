import Link from '@/components/ui/Link'
import type { UserRole } from '@/lib/types'
import { puede } from '@/lib/permisos'
import { tieneModulo } from '@/lib/modulos'
import { tiposPermitidos } from '@/lib/colaPermisos'
import { NumeritoAviso } from '@/components/layout/Avisos'
import { Nuevo } from '@/components/ui/Nuevo'
import PendientesPreparar from '@/components/productos/PendientesPreparar'
import PestanaVisible from '@/components/productos/PestanaVisible'

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

export type PestanaML = 'editar' | 'vincular' | 'stock' | 'precios' | 'promociones' | 'envios' | 'tareas'
type UsuarioML = { role?: UserRole; permisos?: string[]; modulos?: string[]; country?: string }

/** Lo que este usuario puede abrir, en el orden del menú (el primero es adonde lleva «Publicaciones»). */
export function pestanasML(user: UsuarioML) {
  const p: { k: PestanaML; t: string; href: string }[] = []
  // 18-11 (el dueño, Fase 4): Mis publicaciones (la lista con avisos por fila) · Promociones · Stock vs inventario.
  if (tieneModulo(user, 'publicaciones') && tieneModulo(user, 'preguntas') && puede(user, 'editar_publicaciones')) p.push({ k: 'editar', t: 'Mis publicaciones', href: '/publicaciones' })
  if (user.country === 'VE' && tieneModulo(user, 'promociones') && puede(user, 'promociones') && puede(user, 'ver_productos')) p.push({ k: 'promociones', t: 'Promociones', href: '/productos/promociones' })
  if (tieneModulo(user, 'inventario') && tieneModulo(user, 'preguntas') && puede(user, 'ver_inventario')) p.push({ k: 'stock', t: 'Stock vs inventario', href: '/inventario/stock-ml' })
  // 22-11 (el dueño): precio de lista en ML contra el precio con exceso del sistema. Módulo precio_vs_ml (solo SolucionesMC).
  if (user.country === 'VE' && tieneModulo(user, 'precio_vs_ml') && tieneModulo(user, 'inventario') && tieneModulo(user, 'preguntas')
      && tieneModulo(user, 'publicaciones') && puede(user, 'editar_publicaciones') && puede(user, 'ver_productos')) p.push({ k: 'precios', t: 'Precio vs sistema', href: '/publicaciones/precios' })
  // Preparar: Vincular y Pesos (MercadoEnvíos, 13-11 viene de Productos; 14-11 para toda empresa de Venezuela con Inventario).
  if (puede(user, 'vincular_ml') || (puede(user, 'ver_productos') && puede(user, 'importar_ml'))) p.push({ k: 'vincular', t: 'Vincular', href: '/vincular-ml' })
  if (user.country === 'VE' && tieneModulo(user, 'inventario') && puede(user, 'ver_productos')) p.push({ k: 'envios', t: 'Pesos y envío gratis', href: '/productos/mercadoenvios' })
  // Tareas en MercadoLibre (09-11): lo que se manda a ML en segundo plano; cada uno ve las de sus secciones.
  if (tiposPermitidos(user).length) p.push({ k: 'tareas', t: 'Historial de tareas', href: '/publicaciones/lotes' })
  return p
}

/** Adonde lleva «Publicaciones» en el menú: la primera pestaña que tiene (no la de tareas). */
export const inicioPublicaciones = (user: UsuarioML) => pestanasML(user).find(x => x.k !== 'tareas')?.href ?? '/publicaciones'

const PREPARAR: PestanaML[] = ['vincular', 'envios']   // dentro de Mis publicaciones (botones arriba de la lista)
const CLASE = (on: boolean) => `inline-flex items-center whitespace-nowrap border-b-2 px-3 pb-2 text-sm ${on ? 'border-lime-500 font-medium text-neutral-900' : 'border-transparent text-neutral-500 hover:text-neutral-800'}`

export default function PublicacionesMLTabs({ user, actual }: { user: UsuarioML; actual: PestanaML }) {
  const p = pestanasML(user)
  // 18-11 Fase 4 (el dueño): sin submenú «Preparar». Vincular y Pesos se abren desde Mis publicaciones (botones arriba
  // y los avisos «Sin vincular» / «Sin peso» de cada fila); estando ahí, la pestaña marcada es Mis publicaciones. Quien
  // no tiene Mis publicaciones (sin el módulo o el permiso) los ve como pestañas normales: nadie pierde acceso.
  const conMis = p.some(x => x.k === 'editar')
  const preparar = p.filter(x => PREPARAR.includes(x.k))
  const pestanas = p.filter(x => x.k !== 'tareas' && (!conMis || !PREPARAR.includes(x.k)))
  const tareas = p.find(x => x.k === 'tareas')
  if (pestanas.length + (tareas ? 1 : 0) < 2 && !(conMis && preparar.length)) return null
  const enPreparar = conMis && PREPARAR.includes(actual)
  const marcada = (k: PestanaML) => k === actual || (k === 'editar' && enPreparar)
  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2 border-b border-neutral-200">
        {/* 22-11 (el dueño: las pestañas quedaban tapadas por «Historial de tareas»): el rótulo solo en pantallas anchas y
            el historial como reloj (con texto desde xl), sin quitarles lugar a las pestañas. */}
        <span className="hidden pb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400 2xl:inline">Publicaciones</span>
        <nav className="relative -mb-px flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Publicaciones">
          {pestanas.map(x => (
            <Link key={x.k} href={x.href} aria-current={marcada(x.k) ? 'page' : undefined} className={CLASE(marcada(x.k))}>
              {x.t}{x.k === 'stock' && <NumeritoAviso clave="vende_de_mas" className="ml-1.5" />}
              {!conMis && PREPARAR.includes(x.k) && <PendientesPreparar de={x.k === 'vincular' ? 'sinVincular' : 'sinPeso'} />}
              {x.k === 'editar' && actual !== 'editar' && !enPreparar && <Nuevo clave="mis_publicaciones" />}
              {x.k === 'precios' && <Nuevo clave="precio_vs_ml" />}
            </Link>
          ))}
        </nav>
        <PestanaVisible nav="Publicaciones" />
        {tareas && (
          <Link href={tareas.href} aria-current={actual === 'tareas' ? 'page' : undefined}
            className={`inline-flex shrink-0 items-center gap-1 pb-2 text-xs underline-offset-2 hover:underline ${actual === 'tareas' ? 'font-medium text-neutral-900' : 'text-neutral-500'}`}
            title="Historial de tareas: lo que se mandó a MercadoLibre en segundo plano (el avance de lo que está en curso sale abajo a la derecha)"
            aria-label="Historial de tareas">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4" aria-hidden="true">
              <circle cx="10" cy="10" r="7.25" /><path d="M10 6v4l2.5 1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="hidden xl:inline">Historial de tareas</span></Link>
        )}
      </div>
      {enPreparar && (
        <nav className="mt-3 flex flex-wrap items-center gap-2" aria-label="Mis publicaciones">
          <Link href="/publicaciones" className="text-sm text-neutral-500 hover:text-neutral-800">← Mis publicaciones</Link>
          {preparar.map(x => (
            <Link key={x.k} href={x.href} aria-current={x.k === actual ? 'page' : undefined}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${x.k === actual ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300'}`}>
              {x.t}<PendientesPreparar de={x.k === 'vincular' ? 'sinVincular' : 'sinPeso'} activo={x.k === actual} />
            </Link>
          ))}
        </nav>
      )}
    </div>
  )
}
