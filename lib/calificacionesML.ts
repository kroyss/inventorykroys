// Calificaciones en bloque: ventas de ML sin calificar, cruzadas con el sistema.
//
// Regla (decisión del dueño, 2026-10-01): si la venta de ML está en el sistema (cargada:
// descargada / local / procesada) o facturada → se CONCRETÓ → positiva. Si a los N días no
// apareció en el sistema → NO se concretó → neutral con "No tenemos su compra registrada".
// Mientras tanto (recién vendida, o en borrador) → esperar. Los textos son editables.
import type { Pool } from 'pg'
import { mlFetch, ErrorML } from '@/lib/ml'
import { esDemo } from '@/lib/demo'

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
}
export const PLANTILLAS_DEFAULT: PlantillasCalificacion = {
  concretada:   { rating: 'positive', mensaje: 'Excelente, persona seria y responsable, un placer !' },
  noConcretada: { rating: 'neutral', motivo: 'BUYER_NOT_ENOUGH_MONEY', mensaje: 'No tenemos su compra registrada', dias: 3 },
  esperaDias: 0,
  auto: false,
}

export function leerPlantillasCal(json: string | null | undefined): PlantillasCalificacion {
  try {
    const v = JSON.parse(json ?? '')
    return {
      concretada: { ...PLANTILLAS_DEFAULT.concretada, ...(v?.concretada ?? {}) },
      noConcretada: { ...PLANTILLAS_DEFAULT.noConcretada, ...(v?.noConcretada ?? {}) },
      esperaDias: Math.max(0, Math.min(60, Math.round(Number(v?.esperaDias) || 0))),
      auto: v?.auto === true,
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
       cal_vendedor = COALESCE(EXCLUDED.cal_vendedor, CASE WHEN ml_ordenes.cal_vendedor = 'cerrada_ml' THEN 'cerrada_ml' END), cal_concretada = EXCLUDED.cal_concretada,
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

export type Sugerencia = 'concretada' | 'no_concretada' | 'esperar'

/** SQL de la bandeja: ventas sin calificar + su estado en el sistema + sugerencia. */
export const SQL_BANDEJA = `
  SELECT o.id::text, o.fecha, o.comprador, o.productos, o.total::float, o.moneda, o.cal_comprador,
         x.nickname AS cuenta, s.status AS sistema_estado, (f.id IS NOT NULL) AS facturada,
         CASE
           WHEN f.id IS NOT NULL OR s.status IN ('PROCESADA', 'DESCARGADA', 'DESCARGADA_LOCAL') THEN 'concretada'
           WHEN s.id IS NULL AND o.fecha < NOW() - make_interval(days => $1) THEN 'no_concretada'
           ELSE 'esperar'
         END AS sugerencia
  FROM ml_ordenes o
  JOIN ml_conexiones x ON x.id = o.conexion_id
  LEFT JOIN sales s ON s.ml_order_number IN (o.id::text, o.pack_id::text)
  LEFT JOIN LATERAL (SELECT i.id FROM invoices i WHERE i.sale_id = s.id AND i.status <> 'ANULADA' LIMIT 1) f ON TRUE
  WHERE o.cal_vendedor IS NULL`

/** La misma bandeja para la empresa sin inventario (todo desde MercadoLibre): no hay ventas
 *  cargadas, así que "en el sistema" = su etiqueta ya salió impresa en Despachos (DESPACHADA).
 *  Misma regla que con inventario: despachada → concretada; sin despachar a los N días (o
 *  cancelada en ML) → no concretada; antes → esperar. Cada una se puede cambiar antes de calificar. */
export const SQL_BANDEJA_ML = `
  SELECT o.id::text, o.fecha, o.comprador, o.productos, o.total::float, o.moneda, o.cal_comprador,
         x.nickname AS cuenta, CASE WHEN d.impresa THEN 'DESPACHADA' END AS sistema_estado, FALSE AS facturada,
         CASE
           WHEN d.impresa THEN 'concretada'
           WHEN o.estado = 'cancelled' OR o.fecha < NOW() - make_interval(days => $1) THEN 'no_concretada'
           ELSE 'esperar'
         END AS sugerencia
  FROM ml_ordenes o
  JOIN ml_conexiones x ON x.id = o.conexion_id
  LEFT JOIN LATERAL (
    SELECT TRUE AS impresa FROM despacho_etiquetas e
    WHERE e.impresa AND e.venta IN (o.id::text, o.pack_id::text) LIMIT 1
  ) d ON TRUE
  WHERE o.cal_vendedor IS NULL`

export const sqlBandeja = (desdeML: boolean) => desdeML ? SQL_BANDEJA_ML : SQL_BANDEJA
