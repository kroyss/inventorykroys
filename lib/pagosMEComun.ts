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

// ── Traer automático (app_settings.pagos_me_horario) ───────────────────────
/** A estas horas (de Venezuela) y estos días (1 = lunes … 7 = domingo) el despertador trae solo. */
export interface HorarioME { activo: boolean; horas: string[]; dias: number[] }
export const HORARIO_DEFECTO: HorarioME = { activo: true, horas: ['08:00', '12:00', '16:00', '19:00'], dias: [1, 2, 3, 4, 5, 6] }
export const DIAS_SEMANA = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']

export function leerHorario(valor: string | null | undefined): HorarioME {
  try {
    const h = JSON.parse(valor ?? '')
    const horas = (Array.isArray(h?.horas) ? h.horas : []).filter((x: unknown) => typeof x === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(x))
    const dias = (Array.isArray(h?.dias) ? h.dias : []).filter((x: unknown) => Number.isInteger(x) && (x as number) >= 1 && (x as number) <= 7)
    return { activo: h?.activo !== false, horas: [...new Set<string>(horas)].sort(), dias: [...new Set<number>(dias)].sort() }
  } catch {
    return HORARIO_DEFECTO
  }
}

/** Próxima corrida automática a partir de `dia` (1-7) y `hm` ("HH:MM") de Venezuela, o null. */
export function proximoAuto(h: HorarioME, dia: number, hm: string): { dia: number; hora: string; hoy: boolean } | null {
  if (!h.activo || !h.horas.length || !h.dias.length) return null
  for (let k = 0; k < 8; k++) {
    const d = ((dia - 1 + k) % 7) + 1
    if (!h.dias.includes(d)) continue
    const hora = h.horas.find(x => k > 0 || x > hm)
    if (hora) return { dia: d, hora, hoy: k === 0 }
  }
  return null
}
