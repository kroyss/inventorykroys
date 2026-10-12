// Reputación (2026-10-12, pedido de Gerardo; migración 084).
//
// Dos cosas, con pocas llamadas a MercadoLibre (las hace el cron de Preguntas, cada minuto por empresa):
//   - El termómetro de cada cuenta (/users/{id}): una vez cada HORAS_REPUTACION.
//   - La calificación que nos dejó cada comprador (/orders/{id}/feedback → purchase): solo de las ventas
//     que la búsqueda ya marca como calificadas (cal_comprador) y todavía no sabemos de qué tipo, de a
//     POR_PASADA. Las neutrales y negativas se vuelven a mirar una vez al día mientras dura el aviso
//     (DIAS_AVISO = el plazo de ML para pedir el cambio), por si el comprador la cambió.
import type { Pool } from 'pg'
import { mlFetch, ErrorML } from '@/lib/ml'

export const DIAS_AVISO = 30
const HORAS_REPUTACION = 6
const POR_PASADA = 15
const DIAS_BUSCAR = 60          // ventas más viejas no interesan (su aviso ya habría vencido)

export interface Reputacion {
  level_id: string | null                 // "5_green", "4_light_green", "3_yellow", "2_orange", "1_red"
  power_seller_status: string | null      // "platinum", "gold", "silver" (MercadoLíder)
  transactions?: { completed?: number; canceled?: number; total?: number
                   ratings?: { positive?: number; neutral?: number; negative?: number } }
  metrics?: Record<string, { rate?: number; value?: number; period?: string } | undefined>
}

/** El termómetro de ML de una cuenta (solo lectura). */
export async function leerReputacion(db: Pool, conexionId: number, mlUserId: string | number) {
  const u = await mlFetch<{ seller_reputation?: Reputacion }>(db, conexionId, `/users/${mlUserId}`)
  return u.seller_reputation ?? null
}

// concretada: lo que dijo el comprador; contradictoria: si no coincide con lo que dijimos nosotros
// (null = nosotros todavía no calificamos).
type Calif = { rating: string; fecha: string | null; mensaje: string | null; concretada: boolean | null; contradictoria: boolean | null }
type LadoFeedback = { rating?: string; date_created?: string; message?: string | null; fulfilled?: boolean | null } | null
/** La calificación que dejó el comprador en una venta. null = ML no la tiene (404). */
export async function leerCalificacionRecibida(db: Pool, conexionId: number, ordenId: string): Promise<Calif | null> {
  try {
    const f = await mlFetch<{ purchase?: LadoFeedback; sale?: LadoFeedback }>(db, conexionId, `/orders/${ordenId}/feedback`)
    if (!f.purchase?.rating) return null
    const suya = typeof f.purchase.fulfilled === 'boolean' ? f.purchase.fulfilled : null
    const nuestra = typeof f.sale?.fulfilled === 'boolean' ? f.sale.fulfilled : null
    return { rating: f.purchase.rating, fecha: f.purchase.date_created ?? null, mensaje: f.purchase.message?.trim() || null,
             concretada: suya, contradictoria: suya === null || nuestra === null ? null : suya !== nuestra }
  } catch (e) {
    if (e instanceof ErrorML && e.status === 404) return null
    throw e
  }
}

/** Lo llama el cron después de sincronizar las ventas de la cuenta. Devuelve cuántas calificaciones leyó. */
export async function sincronizarReputacion(db: Pool, conexionId: number) {
  const { rows: [c] } = await db.query(
    `UPDATE ml_conexiones SET reputacion_at = NOW()
     WHERE id = $1 AND estado = 'activa' AND (reputacion_at IS NULL OR reputacion_at < NOW() - make_interval(hours => $2))
     RETURNING ml_user_id`, [conexionId, HORAS_REPUTACION])
  if (c) {
    const rep = await leerReputacion(db, conexionId, c.ml_user_id)
    await db.query(`UPDATE ml_conexiones SET reputacion = $2 WHERE id = $1`, [conexionId, rep ? JSON.stringify(rep) : null])
  }

  // Nuevas calificadas (sin tipo todavía) y, una vez al día mientras dura el aviso: las neutrales/negativas
  // (por si la cambió) y las que no sabíamos si eran contradictorias porque faltaba nuestra calificación.
  const { rows } = await db.query(
    `SELECT id::text, cal_recibida FROM ml_ordenes
     WHERE conexion_id = $1 AND (
       (cal_comprador IS NOT NULL AND cal_recibida IS NULL AND fecha > NOW() - make_interval(days => $2))
       OR (cal_recibida_at > NOW() - make_interval(days => $3)
           AND (cal_recibida IN ('neutral', 'negative') OR (cal_recibida <> '' AND cal_contradictoria IS NULL AND cal_vendedor IS NOT NULL))
           AND (cal_recibida_revisada_at IS NULL OR cal_recibida_revisada_at < NOW() - INTERVAL '1 day')))
     ORDER BY cal_recibida IS NULL DESC, fecha DESC LIMIT $4`,
    [conexionId, DIAS_BUSCAR, DIAS_AVISO, POR_PASADA])
  for (const o of rows) {
    const cal = await leerCalificacionRecibida(db, conexionId, o.id)
    await db.query(
      `UPDATE ml_ordenes SET
         -- Si era neutral/negativa y ahora es otra: se guarda lo que era (la cambió).
         cal_recibida_antes = CASE WHEN cal_recibida IN ('neutral', 'negative') AND $2::text IS DISTINCT FROM cal_recibida
                                   THEN cal_recibida ELSE cal_recibida_antes END,
         cal_recibida = COALESCE($2, ''), cal_recibida_at = COALESCE($3::timestamptz, cal_recibida_at),
         cal_recibida_msg = COALESCE($4, cal_recibida_msg), cal_recibida_revisada_at = NOW(),
         cal_recibida_concretada = $5, cal_contradictoria = $6
       WHERE id = $1`, [o.id, cal?.rating ?? null, cal?.fecha ?? null, cal?.mensaje ?? null, cal?.concretada ?? null, cal?.contradictoria ?? null])
  }
  return rows.length
}

/** Lo que cuenta en el menú: neutrales y negativas de los últimos DIAS_AVISO días que nadie marcó como vistas. */
export const SQL_AVISO_REPUTACION = `cal_recibida IN ('neutral', 'negative')
  AND cal_recibida_at > NOW() - INTERVAL '${DIAS_AVISO} days' AND cal_recibida_vista_at IS NULL`
