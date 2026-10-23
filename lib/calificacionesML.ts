// Calificaciones en bloque: ventas de ML sin calificar, cruzadas con el sistema.
//
// Regla (decisión del dueño, 2026-10-01): si la venta de ML está en el sistema (cargada:
// descargada / local / procesada) o facturada → se CONCRETÓ → positiva. Si a los N días no
// apareció en el sistema → NO se concretó → neutral con "No tenemos su compra registrada".
// Mientras tanto (recién vendida, o en borrador) → esperar. Los textos son editables.
import type { Pool } from 'pg'
import { mlFetch, ErrorML } from '@/lib/ml'
import { esDemo } from '@/lib/demo'
import { sqlFacturaIncluye } from '@/lib/invoicesServer'
import { ML_CONCRETA_SOLA_DIAS, MAX_DIAS_NO_CONCRETADA } from '@/lib/noConcretada'

export const DIAS_VENTANA = 90          // ventas que se traen de ML
export const SYNC_MINUTOS = 58          // cada cuánto el cron refresca las ventas (≈ cada hora; 58 y no 60 para
                                        // no saltarse la hora de las 3 a. m. por el minuto que corre el cron)
export const DIAS_RECIENTES = 9         // lo que se relee cada SYNC_MINUTOS (Por confirmar mira 8 días)

export interface PlantillasCalificacion {
  concretada:   { rating: 'positive' | 'neutral' | 'negative'; mensaje: string }
  noConcretada: { rating: 'positive' | 'neutral' | 'negative'; motivo: string; mensaje: string; dias: number }
  /** Días de espera antes de calificar: con 2, hoy (día 3) solo entran al lote las ventas del día 1
   *  hacia atrás (las más nuevas se ven, pero no se pueden calificar todavía). 0 = sin espera. */
  esperaDias: number
  /** Calificar solas, una vez al día, las CONCRETADAS (lib/calificacionesAuto.ts). Apagado por defecto. */
  auto: boolean
  /** Desde qué hora (del país) corre la automática del día (2026-10-15: antes fija a las 10). */
  hora: number
  /** Calificar solas las NO concretadas (23-10): sin pago, sin registrar y sin guía, antes de que ML las concrete sola a
   *  los 7 días y cobre la comisión. Apagado por defecto (lib/calificacionesAuto.ts → noConcretadasAutomaticas). */
  autoNoConcretada: boolean
  /** Desde qué hora del día 6 corre la automática de no concretadas. */
  horaNc: number
}
export const PLANTILLAS_DEFAULT: PlantillasCalificacion = {
  concretada:   { rating: 'positive', mensaje: 'Excelente, persona seria y responsable, un placer !' },
  noConcretada: { rating: 'neutral', motivo: 'BUYER_NOT_ENOUGH_MONEY', mensaje: 'No tenemos su compra registrada', dias: 3 },
  esperaDias: 0,
  auto: false,
  hora: 10,
  autoNoConcretada: false,
  horaNc: 10,
}

export function leerPlantillasCal(json: string | null | undefined): PlantillasCalificacion {
  try {
    const v = JSON.parse(json ?? '')
    return {
      concretada: { ...PLANTILLAS_DEFAULT.concretada, ...(v?.concretada ?? {}) },
      noConcretada: (() => {
        const nc = { ...PLANTILLAS_DEFAULT.noConcretada, ...(v?.noConcretada ?? {}) }
        // Tope (23-10): a los 7 días ML ya la concretó sola; lo guardado por encima del tope vale como el tope (5).
        return { ...nc, dias: Math.max(1, Math.min(MAX_DIAS_NO_CONCRETADA, Math.round(Number(nc.dias) || 3))) }
      })(),
      esperaDias: Math.max(0, Math.min(60, Math.round(Number(v?.esperaDias) || 0))),
      auto: v?.auto === true,
      hora: Number.isInteger(v?.hora) && v.hora >= 0 && v.hora <= 23 ? v.hora : PLANTILLAS_DEFAULT.hora,
      autoNoConcretada: v?.autoNoConcretada === true,
      horaNc: Number.isInteger(v?.horaNc) && v.horaNc >= 0 && v.horaNc <= 23 ? v.horaNc : PLANTILLAS_DEFAULT.horaNc,
    }
  } catch { return PLANTILLAS_DEFAULT }
}

interface OrdenBusqueda {
  id: number; pack_id: number | null; date_created: string; total_amount: number; currency_id: string; status?: string
  buyer: { nickname?: string; first_name?: string; last_name?: string }
  order_items: {
    item: { id: string; title: string; variation_id?: number | null; variation_attributes?: { name?: string; value_name?: string | null }[] }
    quantity: number
  }[]
  feedback: { seller: { rating?: string; fulfilled?: boolean } | null; buyer: { rating?: string } | null } | null
}

/** Lo vendido, para Despachos en las empresas sin inventario: título tal cual en ML, variante
 *  ("Color: Negro · Talla: M") y cantidad. */
export interface DetalleOrden { titulo: string; variante: string | null; cantidad: number }
export const detalleDeOrden = (o: Pick<OrdenBusqueda, 'order_items'>): DetalleOrden[] =>
  o.order_items.map(i => ({
    titulo: i.item.title,
    variante: (i.item.variation_attributes ?? [])
      .filter(a => a.value_name).map(a => `${a.name}: ${a.value_name}`).join(' · ') || null,
    cantidad: i.quantity,
  }))

/** Guarda (o actualiza) una venta de ML en ml_ordenes. */
export async function guardarOrden(db: Pool, conexionId: number, o: OrdenBusqueda) {
  await db.query(
    `INSERT INTO ml_ordenes (id, conexion_id, pack_id, fecha, comprador, productos, total, moneda,
                             cal_vendedor, cal_concretada, cal_comprador, items, detalle, estado, comprador_nombre, actualizada_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW())
     ON CONFLICT (empresa_id, id) DO UPDATE SET items = EXCLUDED.items, detalle = EXCLUDED.detalle,
       estado = EXCLUDED.estado, comprador_nombre = COALESCE(EXCLUDED.comprador_nombre, ml_ordenes.comprador_nombre),
       -- 'cerrada_ml': ML ya no deja calificarla (la marca calificar/route.ts); la sync no la revive.
       -- La búsqueda casi siempre trae solo "calificada" (sin tipo ni concretada): no pisa lo que ya se
       -- sabe con detalle (al calificar desde el sistema o leído de /orders/{id}/feedback). 2026-10-15.
       cal_vendedor = CASE WHEN EXCLUDED.cal_vendedor = 'calificada' AND ml_ordenes.cal_vendedor IN ('positive', 'neutral', 'negative', 'sin_detalle')
                           THEN ml_ordenes.cal_vendedor
                           ELSE COALESCE(EXCLUDED.cal_vendedor, CASE WHEN ml_ordenes.cal_vendedor = 'cerrada_ml' THEN 'cerrada_ml' END) END,
       cal_concretada = COALESCE(EXCLUDED.cal_concretada, CASE WHEN EXCLUDED.cal_vendedor IS NOT NULL THEN ml_ordenes.cal_concretada END),
       cal_comprador = EXCLUDED.cal_comprador, actualizada_at = NOW()`,
    [o.id, conexionId, o.pack_id, o.date_created, o.buyer?.nickname ?? null,
     o.order_items.map(i => `${i.quantity} × ${i.item.title}`).join(' · '),
     o.total_amount, o.currency_id,
     // En la búsqueda ML marca que la calificación EXISTE (objeto no nulo) pero no siempre
     // trae el detalle: existir = ya calificada (verificado: las calificadas a mano vienen así).
     o.feedback?.seller ? (o.feedback.seller.rating ?? 'calificada') : null,
     o.feedback?.seller?.fulfilled ?? null,
     o.feedback?.buyer ? (o.feedback.buyer.rating ?? 'calificada') : null,
     // Qué se vendió: "MLV123" y, si tiene variante, también "MLV123:456" (para el módulo Stock).
     o.order_items.flatMap(i => i.item.variation_id ? [i.item.id, `${i.item.id}:${i.item.variation_id}`] : [i.item.id]),
     JSON.stringify(detalleDeOrden(o)), o.status ?? null,
     // Nombre real (la venta suelta lo trae; la búsqueda a veces no): migración 080.
     [o.buyer?.first_name, o.buyer?.last_name].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() || null])
}

/** Trae una venta puntual de ML (por número) y la guarda. null = no es de esta cuenta. */
export async function traerOrden(db: Pool, conexionId: number, id: string) {
  try {
    const o = await mlFetch<OrdenBusqueda>(db, conexionId, `/orders/${id}`)
    await guardarOrden(db, conexionId, o)
    return o
  } catch (e) {
    if (e instanceof ErrorML && [403, 404].includes(e.status)) return null
    throw e
  }
}

/** Trae las ventas de una cuenta (más nuevas primero) y las guarda en ml_ordenes.
 *  Cada SYNC_MINUTOS (2026-10-12; cada hora desde el 11-10, el botón trae al momento) solo las de los últimos DIAS_RECIENTES: ahí están las nuevas y lo
 *  que cambia seguido (canceladas, lo que mira Ventas → Por confirmar). Los DIAS_VENTANA completos,
 *  una vez por noche (3 a. m. de la empresa) o si la cuenta llevaba más de un día sin sincronizar
 *  (empresa inactiva que vuelve). Antes releía los 90 días cada 30 min: ~40 páginas por cuenta.
 *  `dias` explícito (botón Actualizar / Traer nuevas) manda sobre esa regla. */
export async function sincronizarOrdenes(db: Pool, conexionId: number, forzar = false, dias?: number) {
  if (await esDemo(db)) return 0     // demostración: las ventas son las sembradas
  const { rows: [c] } = await db.query(
    `SELECT ml_user_id, ordenes_sync_at, ordenes_sync_at < NOW() - INTERVAL '1 day' AS atrasada,
            EXTRACT(HOUR FROM NOW())::int AS hora
     FROM ml_conexiones WHERE id = $1`, [conexionId])
  if (!forzar && c.ordenes_sync_at && Date.now() - new Date(c.ordenes_sync_at).getTime() < SYNC_MINUTOS * 60_000) return 0
  const completa = dias === undefined
    ? (!c.ordenes_sync_at || c.atrasada || c.hora === 3 || forzar)
    : dias >= DIAS_VENTANA
  const ventana = dias ?? (completa ? DIAS_VENTANA : DIAS_RECIENTES)
  const desde = Date.now() - ventana * 86_400_000
  let n = 0
  for (let offset = 0; offset < 5000; offset += 50) {
    const r = await mlFetch<{ results: OrdenBusqueda[] }>(db, conexionId,
      `/orders/search?seller=${c.ml_user_id}&sort=date_desc&limit=50&offset=${offset}`)
    const lote = r.results ?? []
    let viejas = false
    for (const o of lote) {
      if (new Date(o.date_created).getTime() < desde) { viejas = true; break }
      await guardarOrden(db, conexionId, o)
      n++
    }
    if (viejas || lote.length < 50) break
  }
  if (dias !== undefined && !completa) return n     // "Traer nuevas": no cambia el ritmo del cron
  await db.query(`UPDATE ml_conexiones SET ordenes_sync_at = NOW() WHERE id = $1`, [conexionId])
  if (completa) {
    await db.query(`DELETE FROM ml_ordenes WHERE conexion_id = $1 AND fecha < NOW() - make_interval(days => $2)`,
      [conexionId, DIAS_VENTANA + 30])
  }
  return n
}

// 'revisar' (2026-10-15): el sistema no puede saberlo y lo decide una persona (nunca se califica sola):
//   - la guía se imprimió pero a los TOPE_DIAS de la compra nunca se reportó (¿salió o no?);
//   - la empresa no usa Despachos y pasaron los días de "no concretada": la venta pudo despacharse por
//     fuera (antes salía "no concretada" y se podía calificar mal a un comprador real).
export type Sugerencia = 'concretada' | 'no_concretada' | 'esperar' | 'revisar'

/** VENTA CONCRETADA (decisión del dueño, 2026-10-15): con Reportador, la que tiene la guía REPORTADA (salió
 *  de verdad; impresa no alcanza: oficina cerrada, envío al día siguiente…) y los días de espera cuentan
 *  DESDE EL REPORTE (columna `base`). Sin Reportador: la guía impresa y los días desde la compra. Tope: a
 *  los TOPE_DIAS de la compra una reportada se califica aunque no cumplió la espera (el plazo de ML no espera)
 *  y una impresa sin reportar pasa a 'revisar'. */
export const TOPE_DIAS = 10
const SQL_GUIA = `
  LEFT JOIN LATERAL (
    SELECT bool_or(e.impresa) AS impresa, max(e.reportado_at) AS reportada_at FROM despacho_etiquetas e
    WHERE e.venta IN (o.id::text, o.pack_id::text)) g ON TRUE
  CROSS JOIN (SELECT
    COALESCE((SELECT 'reportador' = ANY(modulos) FROM empresas WHERE id = NULLIF(current_setting('app.empresa_id', true), '')::int), FALSE) AS con_reportador,
    EXISTS (SELECT 1 FROM despacho_etiquetas WHERE impresa AND created_at > NOW() - INTERVAL '30 days') AS usa_despachos) m`
// La guía cuenta como despachada: impresa y, si la empresa tiene Reportador, también reportada.
const GUIA_OK = `(g.impresa AND (NOT m.con_reportador OR g.reportada_at IS NOT NULL))`
const BASE = `CASE WHEN m.con_reportador AND g.reportada_at IS NOT NULL THEN g.reportada_at ELSE o.fecha END AS base,
         COALESCE(g.impresa, FALSE) AS guia_impresa, g.reportada_at, m.usa_despachos`
const PAGO_ME = `EXISTS (SELECT 1 FROM me_pagos mp WHERE mp.venta IN (o.id::text, o.pack_id::text) AND mp.verificacion <> 'invalido')`

/** SQL de la bandeja: ventas sin calificar + su estado en el sistema + sugerencia. */
export const SQL_BANDEJA = `
  SELECT o.id::text, o.fecha, o.comprador, o.productos, o.total::float, o.moneda, o.cal_comprador,
         o.cal_recibida, o.cal_recibida_concretada, o.cal_recibida_msg,
         x.nickname AS cuenta, s.status AS sistema_estado, (f.id IS NOT NULL) AS facturada, ${BASE},
         CASE
           -- En el sistema (procesada/descargada o facturada) y, si lleva guía en Despachos, despachada.
           WHEN (f.id IS NOT NULL OR s.status IN ('PROCESADA', 'DESCARGADA', 'DESCARGADA_LOCAL'))
                AND (g.impresa IS NOT TRUE OR ${GUIA_OK}) THEN 'concretada'
           WHEN (f.id IS NOT NULL OR s.status IN ('PROCESADA', 'DESCARGADA', 'DESCARGADA_LOCAL'))
                AND o.fecha < NOW() - make_interval(days => ${TOPE_DIAS}) THEN 'revisar'   -- impresa, nunca reportada
           -- Sin cargar y marcada "No se concretó" (mig 115) o cancelada en ML: va antes que el pago (23-10: con pago
           -- verificado y reembolsada quedaba "esperar" para siempre).
           WHEN s.id IS NULL AND (o.no_concretada_at IS NOT NULL OR o.estado = 'cancelled') THEN 'no_concretada'
           WHEN ${PAGO_ME} THEN 'esperar'   -- pagó (Pagos ME): válida aunque no esté registrada todavía
           WHEN s.id IS NULL AND o.fecha < NOW() - make_interval(days => $1) THEN 'no_concretada'
           ELSE 'esperar'
         END AS sugerencia
  FROM ml_ordenes o
  JOIN ml_conexiones x ON x.id = o.conexion_id
  -- LATERAL: busca la venta por índice orden a orden (un JOIN con IN comparaba contra todas las ventas).
  LEFT JOIN LATERAL (SELECT s.id, s.status FROM sales s WHERE s.ml_order_number IN (o.id::text, o.pack_id::text) LIMIT 1) s ON TRUE
  LEFT JOIN LATERAL (SELECT i.id FROM invoices i WHERE ${sqlFacturaIncluye('i', 's.id')} AND i.status <> 'ANULADA' LIMIT 1) f ON TRUE
  ${SQL_GUIA}
  WHERE o.cal_vendedor IS NULL`

/** La misma bandeja para la empresa sin inventario (todo desde MercadoLibre): no hay ventas
 *  cargadas, así que "en el sistema" = su guía salió por Despachos (y se reportó, con Reportador).
 *  Cancelada en ML → no concretada. Sin guía a los N días → no concretada si la empresa usa Despachos;
 *  si no lo usa, 'revisar' (no se sabe). Cada una se puede cambiar antes de calificar. */
export const SQL_BANDEJA_ML = `
  SELECT o.id::text, o.fecha, o.comprador, o.productos, o.total::float, o.moneda, o.cal_comprador,
         o.cal_recibida, o.cal_recibida_concretada, o.cal_recibida_msg,
         x.nickname AS cuenta,
         CASE WHEN g.reportada_at IS NOT NULL THEN 'REPORTADA' WHEN g.impresa THEN 'DESPACHADA' END AS sistema_estado,
         FALSE AS facturada, ${BASE},
         CASE
           WHEN ${GUIA_OK} THEN 'concretada'
           WHEN g.impresa AND o.fecha < NOW() - make_interval(days => ${TOPE_DIAS}) THEN 'revisar'   -- impresa, nunca reportada
           WHEN g.impresa THEN 'esperar'                                                         -- impresa, falta reportarla
           -- Marcada "No se concretó" (mig 115) o cancelada en ML: antes que el pago (23-10, ver SQL_BANDEJA).
           WHEN o.no_concretada_at IS NOT NULL OR o.estado = 'cancelled' THEN 'no_concretada'
           WHEN ${PAGO_ME} THEN 'esperar'   -- pagó (Pagos ME): válida aunque no esté registrada todavía
           WHEN o.fecha < NOW() - make_interval(days => $1) THEN CASE WHEN m.usa_despachos THEN 'no_concretada' ELSE 'revisar' END
           ELSE 'esperar'
         END AS sugerencia
  FROM ml_ordenes o
  JOIN ml_conexiones x ON x.id = o.conexion_id
  ${SQL_GUIA}
  WHERE o.cal_vendedor IS NULL`

/** Días desde la compra en que ML deja de aceptar una calificación "no concretada" ("order has expired"). 23-10: ML la
 *  da por concretada SOLA a los 7 días y cobra la comisión (56 ventas sin pago de SolucionesMC, del 10 al 16-10, se
 *  rechazaron a los 8-13 días). Antes se usaba 21 (medido con ventas de otro tipo). Pasado eso ya no se puede: salen de la
 *  bandeja sin intentarlo una por una. */
export const DIAS_VENCE_NO_CONCRETADA = ML_CONCRETA_SOLA_DIAS

export const sqlBandeja = (desdeML: boolean) =>
  `SELECT * FROM (${desdeML ? SQL_BANDEJA_ML : SQL_BANDEJA}) bv
   WHERE NOT (bv.sugerencia = 'no_concretada' AND bv.fecha < NOW() - INTERVAL '${DIAS_VENCE_NO_CONCRETADA} days')`

/** ¿Ya se puede calificar? (sobre la bandeja `b`): pasaron los días de espera desde `base` (el reporte o la
 *  compra) o el tope desde la compra. `listaEl` = el día en que pasa a calificable. */
export const sqlLista = (esperaDias: number, b = 'b') =>
  `(${b}.base::date <= CURRENT_DATE - ${esperaDias} OR ${b}.fecha::date <= CURRENT_DATE - ${TOPE_DIAS})`
export const sqlListaEl = (esperaDias: number, b = 'b') =>
  `to_char(LEAST(${b}.base::date + ${esperaDias}, ${b}.fecha::date + ${TOPE_DIAS}), 'YYYY-MM-DD')`
