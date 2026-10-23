// "No se concretó" desde Por confirmar (mig 115): motivos. Aparte de lib/porConfirmar.ts (que es del servidor) para
// poder usarlo también en la pantalla.
export const MOTIVOS_NO_CONCRETADA = { sin_stock: 'Sin stock', arrepentido: 'El comprador se arrepintió', otro: 'Otro' } as const
export type MotivoNoConcretada = keyof typeof MOTIVOS_NO_CONCRETADA

/** MercadoLibre da la venta por CONCRETADA sola a los 7 días de la compra si el vendedor no dijo lo contrario, y cobra
 *  la comisión ("Concretamos la venta porque ya pasaron 7 días desde que te compraron", visto 23-10). La no concretada
 *  hay que marcarla ANTES: el plazo de "no concretada" de Calificaciones no puede llegar a 7. */
export const ML_CONCRETA_SOLA_DIAS = 7
export const MAX_DIAS_NO_CONCRETADA = ML_CONCRETA_SOLA_DIAS - 1
/** Días que le quedan a una venta antes de que ML la concrete sola (0 = hoy). */
export const diasParaConcretarSola = (fecha: string | Date, ahora = Date.now()) =>
  Math.max(0, Math.ceil((new Date(fecha).getTime() + ML_CONCRETA_SOLA_DIAS * 86_400_000 - ahora) / 86_400_000) - 1)
