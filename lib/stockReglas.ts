import { z } from 'zod'

// Reportes → Stock (14-11, el dueño): las reglas del análisis las decide cada empresa (app_settings.stock_reglas, JSON).
// Antes estaban fijas en el código, pensadas para importar (4 meses en llegar). Una empresa sin reglas guardadas usa
// RECOMENDADAS (compras locales); la migración 177 deja a SolucionesMC con sus valores de siempre (IMPORTACION).

export const ReglasStock = z.object({
  /** Meses que tarda en llegar la mercancía: por debajo de esta cobertura hay que reponer. */
  llegada:   z.number().min(0.25).max(12),
  /** Urgente si (stock + en camino) alcanza para menos de esto. */
  urgente:   z.number().min(0.1).max(12),
  /** Al pedir, comprar para cubrir estos meses. */
  objetivo:  z.number().min(0.5).max(24),
  /** Meses de ventas con los que se calcula cuánto vende al mes. */
  historia:  z.number().int().min(1).max(12),
  /** Solo vale la pena reponer si vende al menos esto al mes. */
  minimo:    z.number().min(0).max(1000),
  /** Parado: vendió menos de `paradoUnidades` en los últimos `paradoMeses`, con stock. */
  paradoUnidades: z.number().int().min(1).max(10000),
  paradoMeses:    z.number().int().min(1).max(12),
  /** Recién llegado: lleva menos de esto en inventario (no se juzga todavía). */
  nuevo:     z.number().min(0).max(12),
  /** Se está cayendo: compara los últimos N meses contra los N anteriores. */
  cayendo:   z.number().int().min(1).max(6),
}).refine(r => r.urgente < r.llegada, { message: 'Lo urgente tiene que ser menos que lo que tarda en llegar' })
  .refine(r => r.objetivo >= r.llegada, { message: 'Al pedir, compra para al menos lo que tarda en llegar' })
export type ReglasStock = z.infer<typeof ReglasStock>

/** Compras locales (lo que llega en días o semanas): el punto de partida de toda empresa nueva. */
export const RECOMENDADAS: ReglasStock = {
  llegada: 1, urgente: 0.5, objetivo: 3, historia: 6, minimo: 1, paradoUnidades: 6, paradoMeses: 6, nuevo: 3, cayendo: 4,
}
/** Importación (~4 meses en llegar): los valores con los que SolucionesMC trabajó siempre. */
export const IMPORTACION: ReglasStock = {
  llegada: 4, urgente: 2, objetivo: 6, historia: 6, minimo: 1, paradoUnidades: 6, paradoMeses: 6, nuevo: 3, cayendo: 4,
}

export const CLAVE_REGLAS = 'stock_reglas'

/** Lee las reglas de la empresa de la conexión (RLS). Lo que falte o esté mal → lo recomendado. */
export async function leerReglas(db: { query: (q: string, p?: unknown[]) => Promise<{ rows: { value: string }[] }> }): Promise<{ reglas: ReglasStock; propias: boolean }> {
  const { rows: [r] } = await db.query(`SELECT value FROM app_settings WHERE key = $1`, [CLAVE_REGLAS])
  if (!r?.value) return { reglas: RECOMENDADAS, propias: false }
  try {
    const p = ReglasStock.safeParse({ ...RECOMENDADAS, ...JSON.parse(r.value) })
    return p.success ? { reglas: p.data, propias: true } : { reglas: RECOMENDADAS, propias: false }
  } catch { return { reglas: RECOMENDADAS, propias: false } }
}
