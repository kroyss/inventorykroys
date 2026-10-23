// "No se concretó" desde Por confirmar (mig 115): motivos. Aparte de lib/porConfirmar.ts (que es del servidor) para
// poder usarlo también en la pantalla.
export const MOTIVOS_NO_CONCRETADA = { sin_stock: 'Sin stock', arrepentido: 'El comprador se arrepintió', otro: 'Otro' } as const
export type MotivoNoConcretada = keyof typeof MOTIVOS_NO_CONCRETADA
