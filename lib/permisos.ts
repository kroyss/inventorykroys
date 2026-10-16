// Permisos por usuario (2026-10-12, migración 081).
//
// Antes todo era "admin ve todo / usuario ve lo de su rol", repartido en el código como
// `role === 'admin'`. Ahora cada usuario tiene una lista de permisos:
//   - admin: TODOS, siempre (no se le pueden quitar; Usuarios, Ajustes y Plataforma siguen
//     siendo solo de admin y no se otorgan).
//   - usuario: lo que el admin le marcó en Usuarios; si nunca se tocó (usuario_empresas.permisos
//     NULL), los de su rol = exactamente lo que veía antes de este cambio (PREDETERMINADO).
// Los módulos de la empresa mandan por encima: un permiso de una sección cuyo módulo la empresa
// no tiene no sirve de nada (ni se muestra en Usuarios).
import type { UserRole } from '@/lib/types'
import type { Modulo } from '@/lib/modulos'

interface DefPermiso {
  tipo: 'seccion' | 'accion'
  nombre: string
  detalle?: string
  usuario: boolean              // lo tiene un usuario normal por defecto (= lo que veía antes)
  modulo?: Modulo               // solo cuenta si la empresa tiene este módulo
  soloVE?: boolean
}

export const PERMISOS = {
  // ── Secciones (qué ve en el menú) ──
  ver_ventas:         { tipo: 'seccion', nombre: 'Ventas', usuario: true, modulo: 'inventario' },
  ver_pagos_me:       { tipo: 'seccion', nombre: 'Pagos ME', usuario: true, modulo: 'pagos_me', soloVE: true },
  ver_facturas:       { tipo: 'seccion', nombre: 'Facturas', usuario: true, modulo: 'facturas', soloVE: true },
  ver_inventario:     { tipo: 'seccion', nombre: 'Inventario', usuario: true, modulo: 'inventario' },
  ver_compras:        { tipo: 'seccion', nombre: 'Compras / Recepciones', usuario: true, modulo: 'inventario' },
  ver_productos:      { tipo: 'seccion', nombre: 'Productos', usuario: false, modulo: 'inventario' },
  ver_reportes:       { tipo: 'seccion', nombre: 'Reportes', usuario: false, modulo: 'inventario' },
  ver_finanzas:       { tipo: 'seccion', nombre: 'Finanzas', usuario: false, modulo: 'finanzas' },
  ver_preguntas:      { tipo: 'seccion', nombre: 'Preguntas', usuario: true, modulo: 'preguntas' },
  ver_mensajes:       { tipo: 'seccion', nombre: 'Mensajes', usuario: true, modulo: 'preguntas' },
  ver_calificaciones: { tipo: 'seccion', nombre: 'Calificaciones', usuario: true, modulo: 'preguntas' },
  ver_despachos:      { tipo: 'seccion', nombre: 'Despachos', usuario: true, modulo: 'despachos', soloVE: true },
  ver_reportador:     { tipo: 'seccion', nombre: 'Reportador', usuario: true, modulo: 'reportador', soloVE: true },
  ver_stock:          { tipo: 'seccion', nombre: 'Stock (publicaciones por agotarse)', usuario: true, modulo: 'alertas_stock' },
  ver_aprendizaje:    { tipo: 'seccion', nombre: 'Aprendizaje', usuario: true },
  // ── Acciones (dentro de las secciones) ──
  costos:                  { tipo: 'accion', nombre: 'Ver costos y ganancias', usuario: false, modulo: 'inventario',
                             detalle: 'Inicio completo (ventas, ganancia, bonos) y costos/totales en Compras e Importaciones' },
  compras_editar:          { tipo: 'accion', nombre: 'Crear y editar compras', usuario: false, modulo: 'inventario',
                             detalle: 'Crear, pagar y avanzar compras e importaciones, y los proveedores. Sin esto solo recibe la mercancía' },
  importaciones_archivos:  { tipo: 'accion', nombre: 'Ver todos los archivos de importaciones', usuario: false, modulo: 'importaciones',
                             detalle: 'Sin esto, solo los archivos marcados como visibles' },
  inventario_config:       { tipo: 'accion', nombre: 'Configurar inventario', usuario: false, modulo: 'inventario',
                             detalle: 'Mínimos y máximos, recomendados, ventas de 6 meses y la hoja de conteo' },
  ml_cuentas:              { tipo: 'accion', nombre: 'Conectar cuentas de MercadoLibre', usuario: false,
                             detalle: 'Conectar, reconectar y desconectar cuentas' },
  automatizaciones_config: { tipo: 'accion', nombre: 'Configurar automatizaciones', usuario: false,
                             detalle: 'Configuración de Preguntas, Calificaciones y Stock, respuestas rápidas de Mensajes, impresión y remitente de Despachos, equipos y textos del Reportador, guías Tealca' },
  reponer_stock:           { tipo: 'accion', nombre: 'Cambiar el stock en MercadoLibre', usuario: false, modulo: 'preguntas',
                             detalle: 'Reponer una publicación agotada desde Preguntas y actualizar cantidades desde Stock' },
  importar_ml:             { tipo: 'accion', nombre: 'Importar productos desde MercadoLibre', usuario: false, modulo: 'inventario',
                             detalle: 'Primeros pasos en Productos: crear y vincular productos a partir de las publicaciones (necesita ver Productos)' },
  promociones:             { tipo: 'accion', nombre: 'Promociones de MercadoLibre', usuario: false, modulo: 'promociones', soloVE: true,
                             detalle: 'Ver las campañas de ML, en cuáles está cada publicación y hasta dónde puede bajar el precio sin perder el envío gratis (necesita ver Productos)' },
  pagos_me_config:         { tipo: 'accion', nombre: 'Configurar Pagos ME', usuario: false, modulo: 'pagos_me', soloVE: true,
                             detalle: 'Clave de MercadoEnvíos y horario automático' },
} as const satisfies Record<string, DefPermiso>

export type Permiso = keyof typeof PERMISOS
export const TODOS = Object.keys(PERMISOS) as Permiso[]
export const PREDETERMINADO_USUARIO = TODOS.filter(p => PERMISOS[p].usuario)

const esPermiso = (p: string): p is Permiso => p in PERMISOS

/** Los permisos con los que trabaja un usuario en una empresa (va en la sesión). */
export function permisosEfectivos(role: UserRole, guardados: string[] | null | undefined): Permiso[] {
  if (role === 'admin') return TODOS
  return guardados ? guardados.filter(esPermiso) : PREDETERMINADO_USUARIO
}

/** ¿Puede? Admin siempre. Sesiones de antes de este cambio (sin permisos): los de su rol. */
export function puede(user: { role?: UserRole; permisos?: string[] } | null | undefined, p: Permiso) {
  if (!user) return false
  if (user.role === 'admin') return true
  return (user.permisos ?? PREDETERMINADO_USUARIO as string[]).includes(p)
}

/** Permisos que aplican a una empresa (los que se muestran en Usuarios). */
export function permisosDeEmpresa(modulos: string[], country: string) {
  return TODOS.filter(p => {
    const d: DefPermiso = PERMISOS[p]
    return (!d.modulo || modulos.includes(d.modulo)) && (!d.soloVE || country === 'VE')
  })
}

// Página → permiso de sección (lo que no está aquí no pide permiso: Inicio, Automatizaciones…).
// Usuarios, Ajustes (/tasas) y Plataforma son solo de admin y se chequean por rol.
const SECCION_DE_RUTA: [string, Permiso][] = [
  ['/ventas', 'ver_ventas'], ['/pagos-me', 'ver_pagos_me'], ['/facturas', 'ver_facturas'],
  ['/inventario', 'ver_inventario'], ['/compras', 'ver_compras'], ['/productos', 'ver_productos'],
  ['/reportes', 'ver_reportes'], ['/finanzas', 'ver_finanzas'], ['/preguntas', 'ver_preguntas'],
  ['/mensajes', 'ver_mensajes'], ['/calificaciones', 'ver_calificaciones'], ['/despachos', 'ver_despachos'],
  ['/reportador', 'ver_reportador'], ['/alertas-stock', 'ver_stock'], ['/aprendizaje', 'ver_aprendizaje'],
]
const SOLO_ADMIN = ['/tasas', '/usuarios', '/plataforma']

export function seccionDeRuta(href: string): Permiso | null {
  return SECCION_DE_RUTA.find(([r]) => href === r || href.startsWith(r + '/'))?.[1] ?? null
}

/** ¿Este usuario ve esta ruta del menú? (los módulos se chequean aparte con rutaHabilitada) */
export function rutaPermitida(href: string, user: { role?: UserRole; permisos?: string[] }) {
  if (SOLO_ADMIN.some(r => href === r || href.startsWith(r + '/'))) return user.role === 'admin'
  const p = seccionDeRuta(href)
  return !p || puede(user, p)
}

/** Compras e Importaciones: crear/editar (sin esto, solo recibe) y ver costos, por separado. */
export interface AccesoCompras { editar: boolean; costos: boolean }
export const accesoCompras = (user: Parameters<typeof puede>[0]): AccesoCompras =>
  ({ editar: puede(user, 'compras_editar'), costos: puede(user, 'costos') })
