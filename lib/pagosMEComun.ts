// Pagos MercadoEnvíos: tipos y reglas que usan el servidor y las pantallas (sin dependencias de servidor).

export interface PagoME {
  id: number
  venta: string
  cuenta: string | null
  estado_me: string | null
  fecha_orden: string | null
  total_orden: number | null
  total_orden_usd: number | null
  metodo_pago: string | null
  banco_emisor: string | null
  banco_receptor: string | null
  referencia: string | null
  fecha_pago: string | null
  monto_pagado: number | null
  envio_metodo: string | null
  envio_opcion: string | null
  carrier: string | null
  guia: string | null
  tiene_comprobante: boolean
  tiene_guia: boolean
  verificacion: 'pendiente' | 'valido' | 'invalido'
  verificado_por: string | null
  verificado_at: string | null
  nota: string | null
  // De la venta registrada en el sistema (si ya está)
  sale_id: number | null
  sale_status: string | null
  sale_total: number | null
  en_despachos: boolean
}

// ── Pago vs. venta ──────────────────────────────────────────────────────────
export const TOLERANCIA_BS = 50
export const EMBALAJE_BS = 400

/** Compara lo pagado con el total de la orden: verde (coincide), azul (de más), naranja (de menos). */
export function compararMonto(pagado: number | null, total: number | null) {
  if (pagado == null || total == null || total <= 0) return { tono: 'gris' as const, dif: null, texto: 'Sin monto' }
  const dif = Math.round((pagado - total) * 100) / 100
  if (Math.abs(dif) <= TOLERANCIA_BS) return { tono: 'verde' as const, dif, texto: 'Coincide' }
  if (dif > 0) {
    const embalaje = Math.abs(dif - EMBALAJE_BS) <= TOLERANCIA_BS
    return { tono: 'azul' as const, dif, texto: embalaje ? 'Incluye embalaje' : 'Pagó de más' }
  }
  return { tono: 'naranja' as const, dif, texto: 'Pagó de menos' }
}
