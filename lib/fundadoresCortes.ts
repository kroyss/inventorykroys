// Cortes de Fundadores (sin base: lo usan el servidor y Plataforma). Cada tanda de altas tiene su plazo para
// conectar MercadoLibre; quien a esa hora (Venezuela) siga sin ninguna cuenta conectada pasa a "vencido".
//   Corte 1 (16-10): Ronda 1, Ronda 2 y lista de espera hasta el domingo 18/10 → lunes 19/10 23:00 (ya corrió).
//   Corte 2 (19-10): altas del lunes 19 al viernes 23/10 (p. ej. Inversiones Vilrod) → domingo 25/10 23:00.
// Las altas del sábado 24 en adelante no tienen corte (serán de otro aún sin definir): solo su prueba de 30 días.
// Para un corte nuevo, agregar una línea aquí (lib/fundadoresCorte.ts lo ejecuta y el aviso sale solo).

export interface Corte {
  fecha: string          // AAAA-MM-DD, día del corte
  hora: number           // hora de Venezuela
  desde: string | null   // altas creadas desde este día (inclusive; null = sin límite)
  hasta: string          // … hasta este día (inclusive)
}

export const CORTES: Corte[] = [
  { fecha: '2026-10-19', hora: 23, desde: null,         hasta: '2026-10-18' },
  { fecha: '2026-10-25', hora: 23, desde: '2026-10-19', hasta: '2026-10-23' },
]

/** Instante del corte (ISO con hora de Venezuela, UTC−4). */
export const corteISO = (c: Corte) => `${c.fecha}T${String(c.hora).padStart(2, '0')}:00:00-04:00`

/** El corte que le toca a una cuenta creada ese día (AAAA-MM-DD, hora de Venezuela), o null. */
export const corteDeAlta = (creada: string) =>
  CORTES.find(c => (!c.desde || creada >= c.desde) && creada <= c.hasta) ?? null

/** "domingo 25/10 a las 11:00 p. m." (hora de Venezuela). */
export function textoCorte(iso: string, largo = false) {
  const d = new Date(iso)
  const dia = d.toLocaleDateString('es-VE', { timeZone: 'America/Caracas', weekday: 'long' })
  const fecha = largo
    ? d.toLocaleDateString('es-VE', { timeZone: 'America/Caracas', day: 'numeric', month: 'long' })
    : d.toLocaleDateString('es-VE', { timeZone: 'America/Caracas', day: '2-digit', month: '2-digit' })
  const hora = d.toLocaleTimeString('es-VE', { timeZone: 'America/Caracas', hour: 'numeric', minute: '2-digit' })
  return `${dia} ${fecha} a las ${hora}`
}
