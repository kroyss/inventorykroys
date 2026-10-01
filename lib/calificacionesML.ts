// Calificaciones en bloque: ventas de ML sin calificar, cruzadas con el sistema.
//
// Regla (decisión del dueño, 2026-10-01): si la venta de ML está en el sistema (cargada:
// descargada / local / procesada) o facturada → se CONCRETÓ → positiva. Si a los N días no
// apareció en el sistema → NO se concretó → neutral con "No tenemos su compra registrada".
// Mientras tanto (recién vendida, o en borrador) → esperar. Los textos son editables.
import type { Pool } from 'pg'
import { mlFetch } from '@/lib/ml'

export const DIAS_VENTANA = 90          // ventas que se traen de ML
export const SYNC_MINUTOS = 30          // cada cuánto el cron refresca las ventas

export interface PlantillasCalificacion {
  concretada:   { rating: 'positive' | 'neutral' | 'negative'; mensaje: string }
  noConcretada: { rating: 'positive' | 'neutral' | 'negative'; motivo: string; mensaje: string; dias: number }
}
export const PLANTILLAS_DEFAULT: PlantillasCalificacion = {
  concretada:   { rating: 'positive', mensaje: 'Excelente, persona seria y responsable, un placer !' },
  noConcretada: { rating: 'neutral', motivo: 'BUYER_NOT_ENOUGH_MONEY', mensaje: 'No tenemos su compra registrada', dias: 3 },
}

export function leerPlantillasCal(json: string | null | undefined): PlantillasCalificacion {
  try {
    const v = JSON.parse(json ?? '')
    return {
      concretada: { ...PLANTILLAS_DEFAULT.concretada, ...(v?.concretada ?? {}) },
      noConcretada: { ...PLANTILLAS_DEFAULT.noConcretada, ...(v?.noConcretada ?? {}) },
    }
  } catch { return PLANTILLAS_DEFAULT }
}

interface OrdenBusqueda {
  id: number; pack_id: number | null; date_created: string; total_amount: number; currency_id: string
  buyer: { nickname?: string }; order_items: { item: { title: string }; quantity: number }[]
  feedback: { seller: { rating?: string; fulfilled?: boolean } | null; buyer: { rating?: string } | null } | null
}

/** Trae las ventas de los últimos DIAS_VENTANA días de una cuenta (más nuevas primero). */
export async function sincronizarOrdenes(db: Pool, conexionId: number, forzar = false) {
  const { rows: [c] } = await db.query(
    `SELECT ml_user_id, ordenes_sync_at FROM ml_conexiones WHERE id = $1`, [conexionId])
  if (!forzar && c.ordenes_sync_at && Date.now() - new Date(c.ordenes_sync_at).getTime() < SYNC_MINUTOS * 60_000) return 0
  const desde = Date.now() - DIAS_VENTANA * 86_400_000
  let n = 0
  for (let offset = 0; offset < 5000; offset += 50) {
    const r = await mlFetch<{ results: OrdenBusqueda[] }>(db, conexionId,
      `/orders/search?seller=${c.ml_user_id}&sort=date_desc&limit=50&offset=${offset}`)
    const lote = r.results ?? []
    let viejas = false
    for (const o of lote) {
      if (new Date(o.date_created).getTime() < desde) { viejas = true; break }
      await db.query(
        `INSERT INTO ml_ordenes (id, conexion_id, pack_id, fecha, comprador, productos, total, moneda,
                                 cal_vendedor, cal_concretada, cal_comprador, actualizada_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
         ON CONFLICT (empresa_id, id) DO UPDATE SET
           cal_vendedor = EXCLUDED.cal_vendedor, cal_concretada = EXCLUDED.cal_concretada,
           cal_comprador = EXCLUDED.cal_comprador, actualizada_at = NOW()`,
        [o.id, conexionId, o.pack_id, o.date_created, o.buyer?.nickname ?? null,
         o.order_items.map(i => `${i.quantity} × ${i.item.title}`).join(' · '),
         o.total_amount, o.currency_id,
         // En la búsqueda ML marca que la calificación EXISTE (objeto no nulo) pero no siempre
         // trae el detalle: existir = ya calificada (verificado: las calificadas a mano vienen así).
         o.feedback?.seller ? (o.feedback.seller.rating ?? 'calificada') : null,
         o.feedback?.seller?.fulfilled ?? null,
         o.feedback?.buyer ? (o.feedback.buyer.rating ?? 'calificada') : null])
      n++
    }
    if (viejas || lote.length < 50) break
  }
  await db.query(`UPDATE ml_conexiones SET ordenes_sync_at = NOW() WHERE id = $1`, [conexionId])
  await db.query(`DELETE FROM ml_ordenes WHERE conexion_id = $1 AND fecha < NOW() - make_interval(days => $2)`,
    [conexionId, DIAS_VENTANA + 30])
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
