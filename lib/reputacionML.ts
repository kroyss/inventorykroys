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
const HORAS_REVISAR = 3         // neutrales/negativas: cada cuánto se vuelven a mirar (¿la cambió? ¿se pidió el cambio?)

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
// cambio: el pedido de cambio de calificación (lo pide el vendedor en la página de ML, no por API).
type Calif = { rating: string; fecha: string | null; mensaje: string | null; concretada: boolean | null; contradictoria: boolean | null
               cambio: { estado: string; fecha: string | null } | null }
/** La que le dimos nosotros al comprador (sale): para mostrarla y para "Corregir" (PUT /feedback/{id}). */
export type CalifNuestra = { id: number | string; rating: string | null; concretada: boolean | null; mensaje: string | null }
type LadoFeedback = { id?: number | string; rating?: string; date_created?: string; message?: string | null; fulfilled?: boolean | null; status?: string
                      change_request?: { status?: string; sent_date?: string } | null } | null
// Estados conocidos; uno nuevo se anota en el log para ajustar los textos (2026-10-12: todavía no vimos
// cómo informa ML una calificación quitada por no responder al pedido de cambio).
const ESTADOS_CAMBIO = ['pending', 'rejected', 'accepted', 'expired']
/** La calificación que dejó el comprador en una venta. null = ML no la tiene (404) o ya no cuenta
 *  (status distinto de 'active': p. ej. la quitó ML porque no respondió al pedido de cambio). */
export async function leerCalificacionRecibida(db: Pool, conexionId: number, ordenId: string): Promise<Calif | null> {
  return (await leerCalificaciones(db, conexionId, ordenId)).recibida
}

/** Las dos calificaciones de una venta: la que nos dio el comprador (recibida) y la nuestra. */
export async function leerCalificaciones(db: Pool, conexionId: number, ordenId: string): Promise<{ recibida: Calif | null; nuestra: CalifNuestra | null }> {
  try {
    const f = await mlFetch<{ purchase?: LadoFeedback; sale?: LadoFeedback }>(db, conexionId, `/orders/${ordenId}/feedback`)
    const nuestra: CalifNuestra | null = f.sale?.id != null
      ? { id: f.sale.id, rating: f.sale.rating ?? null, concretada: typeof f.sale.fulfilled === 'boolean' ? f.sale.fulfilled : null,
          mensaje: f.sale.message?.trim() || null }
      : null
    return { recibida: recibidaDe(ordenId, f), nuestra }
  } catch (e) {
    if (e instanceof ErrorML && e.status === 404) return { recibida: null, nuestra: null }
    throw e
  }
}

function recibidaDe(ordenId: string, f: { purchase?: LadoFeedback; sale?: LadoFeedback }): Calif | null {
  const est = f.purchase?.status, pedido = f.purchase?.change_request?.status
  if ((est && est !== 'active') || (pedido && !ESTADOS_CAMBIO.includes(pedido))) {
    console.log('[reputacion] estado de ML', ordenId, JSON.stringify({ status: est, change_request: f.purchase?.change_request }))
  }
  if (!f.purchase?.rating || (est && est !== 'active')) return null
  const suya = typeof f.purchase.fulfilled === 'boolean' ? f.purchase.fulfilled : null
  const nuestra = typeof f.sale?.fulfilled === 'boolean' ? f.sale.fulfilled : null
  return { rating: f.purchase.rating, fecha: f.purchase.date_created ?? null, mensaje: f.purchase.message?.trim() || null,
           concretada: suya, contradictoria: suya === null || nuestra === null ? null : suya !== nuestra,
           cambio: f.purchase.change_request?.status
             ? { estado: f.purchase.change_request.status, fecha: f.purchase.change_request.sent_date ?? null } : null }
}

/** Cómo terminó un pedido de cambio, comparando lo que había con lo que hay ahora en ML.
 *  null = todavía no se sabe (o no hubo pedido). */
export function resultadoCambio(antes: { rating: string | null; pedido: boolean; resultado: string | null }, ahora: Calif | null) {
  if (antes.resultado) return antes.resultado
  if (!antes.pedido && !ahora?.cambio) return null
  const era = antes.rating
  if (era !== 'neutral' && era !== 'negative') return null
  if (!ahora) return 'quitada'                                         // ML la sacó (no respondió o la retiró)
  if ((era === 'neutral' && ahora.rating === 'positive') || (era === 'negative' && ahora.rating !== 'negative')) return 'cambiada'
  if (ahora.cambio?.estado === 'rejected') return 'sin_cambio'        // respondió y no la cambió
  return null
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
    `SELECT id::text, cal_recibida, cal_cambio_estado, cal_cambio_resultado FROM ml_ordenes
     WHERE conexion_id = $1 AND (
       (cal_comprador IS NOT NULL AND cal_recibida IS NULL AND fecha > NOW() - make_interval(days => $2))
       -- Contradictorias sin nuestra calificación leída (para mostrarla y poder corregirla), una vez al día.
       OR (cal_contradictoria AND cal_vendedor_msg IS NULL AND cal_recibida_at > NOW() - make_interval(days => $3)
           AND (cal_recibida_revisada_at IS NULL OR cal_recibida_revisada_at < NOW() - INTERVAL '24 hours'))
       -- Pedido de cambio sin resultado: se sigue mirando aunque la calificación pase los 30 días (2026-10-15).
       OR (cal_cambio_estado IS NOT NULL AND cal_cambio_resultado IS NULL AND cal_cambio_at > NOW() - INTERVAL '20 days'
           AND (cal_recibida_revisada_at IS NULL OR cal_recibida_revisada_at < NOW() - make_interval(hours => $5)))
       OR (cal_recibida_at > NOW() - make_interval(days => $3)
           AND (cal_recibida IN ('neutral', 'negative') OR (cal_recibida <> '' AND cal_contradictoria IS NULL AND cal_vendedor IS NOT NULL))
           AND (cal_recibida_revisada_at IS NULL OR cal_recibida_revisada_at < NOW() - make_interval(hours =>
                CASE WHEN cal_recibida IN ('neutral', 'negative') THEN $5 ELSE 24 END))))
     ORDER BY cal_recibida IS NULL DESC, fecha DESC LIMIT $4`,
    [conexionId, DIAS_BUSCAR, DIAS_AVISO, POR_PASADA, HORAS_REVISAR])
  for (const o of rows) {
    const { recibida: cal, nuestra } = await leerCalificaciones(db, conexionId, o.id)
    const resultado = resultadoCambio({ rating: o.cal_recibida, pedido: !!o.cal_cambio_estado, resultado: o.cal_cambio_resultado }, cal)
    await db.query(
      `UPDATE ml_ordenes SET
         -- Si era neutral/negativa y ahora es otra: se guarda lo que era (la cambió).
         cal_recibida_antes = CASE WHEN cal_recibida IN ('neutral', 'negative') AND $2::text IS DISTINCT FROM cal_recibida
                                   THEN cal_recibida ELSE cal_recibida_antes END,
         cal_recibida = COALESCE($2, ''), cal_recibida_at = COALESCE($3::timestamptz, cal_recibida_at),
         cal_recibida_msg = COALESCE($4, cal_recibida_msg), cal_recibida_revisada_at = NOW(),
         cal_recibida_concretada = $5, cal_contradictoria = $6,
         -- Con resultado se conserva el pedido (si ML la quitó ya no informa el change_request).
         cal_cambio_estado = CASE WHEN $9::text IS NOT NULL THEN COALESCE($7, cal_cambio_estado) ELSE $7 END,
         cal_cambio_at = CASE WHEN $9::text IS NOT NULL THEN COALESCE($8::timestamptz, cal_cambio_at) ELSE $8::timestamptz END,
         cal_cambio_resultado = $9, cal_cambio_resuelto_at = CASE WHEN $9::text IS NOT NULL THEN COALESCE(cal_cambio_resuelto_at, NOW()) END,
         cal_vendedor = COALESCE($10, cal_vendedor), cal_concretada = COALESCE($11, cal_concretada), cal_vendedor_msg = COALESCE($12, cal_vendedor_msg)
       WHERE id = $1`, [o.id, cal?.rating ?? null, cal?.fecha ?? null, cal?.mensaje ?? null, cal?.concretada ?? null, cal?.contradictoria ?? null,
                        cal?.cambio?.estado ?? null, cal?.cambio?.fecha ?? null, resultado,
                        nuestra?.rating ?? null, nuestra?.concretada ?? null, nuestra?.mensaje ?? null])
  }
  // Pedir calificación (lib/pedirCalificacion.ts): de las ventas de los últimos días que ya calificamos y
  // el comprador todavía no, cómo las calificamos (la búsqueda de ML solo dice "calificada"). De a pocas;
  // solo las columnas nuestras (cal_recibida queda como está: la del comprador se lee arriba cuando llegue).
  const { rows: nuestras } = await db.query(
    `SELECT id::text FROM ml_ordenes
     WHERE conexion_id = $1 AND cal_vendedor = 'calificada' AND cal_comprador IS NULL
       AND fecha > NOW() - INTERVAL '7 days' AND COALESCE(estado, '') <> 'cancelled'
     ORDER BY fecha LIMIT 8`, [conexionId])
  for (const o of nuestras) {
    const { nuestra } = await leerCalificaciones(db, conexionId, o.id)
    await db.query(
      `UPDATE ml_ordenes SET cal_vendedor = COALESCE($2, 'sin_detalle'), cal_concretada = COALESCE($3, cal_concretada),
              cal_vendedor_msg = COALESCE($4, cal_vendedor_msg) WHERE id = $1`,
      [o.id, nuestra?.rating ?? null, nuestra?.concretada ?? null, nuestra?.mensaje ?? null])
  }
  return rows.length + nuestras.length
}

/** Lo que cuenta en el menú: neutrales y negativas de los últimos DIAS_AVISO días que nadie marcó como vistas
 *  ni tienen el cambio pedido (ahí ya no queda nada por hacer). */
export const SQL_AVISO_REPUTACION = `cal_recibida IN ('neutral', 'negative')
  AND cal_recibida_at > NOW() - INTERVAL '${DIAS_AVISO} days' AND cal_recibida_vista_at IS NULL AND cal_cambio_estado IS NULL`
