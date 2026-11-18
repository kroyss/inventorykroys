// Central de actualización (18-11, el dueño: «traer pesos, traer guías, traer publicaciones… todas las secciones tienen
// un botón»). UN botón arriba, junto a Novedades, con un panel por grupo. Este archivo sirve al cliente y al servidor
// (sin base de datos): qué grupos hay, cuándo se consideran viejos y el evento que avisa a las pantallas.
import { tieneModulo } from '@/lib/modulos'
import { puede } from '@/lib/permisos'
import type { UserRole } from '@/lib/types'

export type Grupo = 'ventas' | 'preguntas' | 'publicaciones' | 'promociones' | 'pagosme'

export interface DefGrupo {
  id: Grupo
  nombre: string
  /** Qué trae (title de la línea). */
  detalle: string
  /** Con menos de esto no se relee (ni con ↻ ni con «Actualizar todo»): cuida las consultas a ML. */
  refrescarMin: number
  /** «Actualizar todo» lo incluye solo si es más viejo que esto (promociones: lo pesado, cada 6 h). */
  todoMin: number
  /** Más viejo que esto = ⚠ y puntito amarillo. */
  atrasadoMin: number
}

export const GRUPOS: DefGrupo[] = [
  { id: 'ventas', nombre: 'Ventas', detalle: 'Ventas de MercadoLibre de los últimos días (las nuevas además llegan solas al minuto)',
    refrescarMin: 2, todoMin: 2, atrasadoMin: 90 },
  { id: 'preguntas', nombre: 'Preguntas y mensajes', detalle: 'Preguntas sin responder y mensajes de tus compradores',
    refrescarMin: 2, todoMin: 2, atrasadoMin: 30 },
  { id: 'publicaciones', nombre: 'Publicaciones y stock', detalle: 'Tus publicaciones, su stock, estado y precio: Mis publicaciones, Stock, Stock vs inventario e Importar',
    refrescarMin: 10, todoMin: 10, atrasadoMin: 120 },
  { id: 'promociones', nombre: 'Promociones', detalle: 'Campañas de MercadoLibre y precios en promo (es lo más pesado: con «Actualizar todo» entra cada 6 h)',
    refrescarMin: 30, todoMin: 360, atrasadoMin: 1440 },
  { id: 'pagosme', nombre: 'Pagos, guías y pesos', detalle: 'Lo del portal de MercadoEnvíos: pagos, guías, ventas y pesos (lo trae el programa de Pagos ME en tu PC, 1 a 3 min)',
    refrescarMin: 10, todoMin: 10, atrasadoMin: 360 },
]

type Usuario = { modulos?: string[]; country?: string; role?: UserRole; permisos?: string[] }

/** Los grupos que esta persona puede actualizar (los mismos módulos y permisos que pedían los botones de antes).
 *  Los de MercadoLibre además necesitan una cuenta conectada: eso lo filtra el servidor. */
export function gruposDe(u: Usuario | null | undefined): Grupo[] {
  if (!u) return []
  const g: Grupo[] = []
  if (tieneModulo(u, 'preguntas')) {
    g.push('ventas', 'preguntas')
    if (tieneModulo(u, 'publicaciones') || tieneModulo(u, 'alertas_stock') || tieneModulo(u, 'inventario')) g.push('publicaciones')
  }
  if (u.country === 'VE' && tieneModulo(u, 'promociones') && tieneModulo(u, 'inventario')
    && puede(u, 'ver_productos') && puede(u, 'promociones')) g.push('promociones')
  if (u.country === 'VE' && tieneModulo(u, 'pagos_me')) g.push('pagosme')
  return g
}

export const GRUPOS_ML: Grupo[] = ['ventas', 'preguntas', 'publicaciones', 'promociones']

/** Se dispara en window cuando un grupo terminó de actualizarse (detail: { grupo }): las pantallas que leen sus datos
 *  en el navegador se recargan solas (useAlActualizar). */
export const EVENTO_ACTUALIZADO = 'sistema-actualizado'
/** Abre el panel desde cualquier pantalla (por ejemplo un «revisado hace X»). */
export const EVENTO_ABRIR = 'abrir-actualizar'
export const abrirActualizar = () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO_ABRIR)) }
