// Visitas de las publicaciones (migración 192, 20-11-2026; idea vista en Mercasist): cuántas visitas tuvo cada
// publicación en los últimos 30 días y cuántas ventas, para Inventario → Publicaciones («N visitas» en la fila y el
// filtro «Muchas visitas, pocas ventas»: mucha gente la mira y casi nadie compra → precio, fotos o título flojos).
// Solo LEE de MercadoLibre, una vez por día y por cuenta, al final de la pasada del catálogo (lib/catalogoML.ts).
// Si ML no responde o cambia el formato, no se rompe nada: las publicaciones quedan sin el dato.
import type { Pool } from 'pg'
import { mlFetch } from '@/lib/ml'

const POR_LLAMADA = 50
const DIAS = 30

/** «Muchas visitas, pocas ventas»: al menos 100 visitas en 30 días y menos de 1 venta cada 100 visitas. */
export const VISITAS_MIN = 100
export const SQL_POCA_VENTA = `(m.visitas_30d >= ${VISITAS_MIN} AND COALESCE(m.ventas_30d, 0) * 100 < m.visitas_30d)`

type RespuestaVisitas = { item_id?: string; total_visits?: number }[] | Record<string, number>

const dia = (d: Date) => d.toISOString().slice(0, 10)

/** Trae las visitas de 30 días de las publicaciones de una cuenta (si no se trajeron hoy). Devuelve cuántas guardó. */
export async function actualizarVisitas(db: Pool, conexionId: number): Promise<number | null> {
  const { rows: [c] } = await db.query(
    `UPDATE ml_conexiones SET visitas_at = NOW()
     WHERE id = $1 AND estado = 'activa' AND (visitas_at IS NULL OR visitas_at < NOW() - INTERVAL '20 hours')
     RETURNING id`, [conexionId])
  if (!c) return null
  // Las ventas de 30 días salen de lo que ya guardamos (ml_ordenes.items), sin llamar a ML.
  await db.query(
    `WITH v AS (
       SELECT i.item, COUNT(*)::int AS n
       FROM ml_ordenes o, unnest(o.items) AS i(item)
       WHERE o.conexion_id = $1 AND o.fecha > NOW() - make_interval(days => $2) AND COALESCE(o.estado, '') <> 'cancelled'
       GROUP BY i.item)
     UPDATE ml_catalogo m SET ventas_30d = COALESCE((SELECT v.n FROM v WHERE v.item = m.item_id), 0)
     WHERE m.conexion_id = $1`, [conexionId, DIAS])
  const { rows } = await db.query<{ item_id: string }>(
    `SELECT item_id FROM ml_catalogo WHERE conexion_id = $1 AND NOT sin_movimiento ORDER BY item_id`, [conexionId])
  const hasta = new Date(), desde = new Date(Date.now() - DIAS * 86_400_000)
  let n = 0
  for (let i = 0; i < rows.length; i += POR_LLAMADA) {
    const ids = rows.slice(i, i + POR_LLAMADA).map(r => r.item_id)
    let r: RespuestaVisitas
    try {
      r = await mlFetch<RespuestaVisitas>(db, conexionId, `/items/visits?ids=${ids.join(',')}&date_from=${dia(desde)}&date_to=${dia(hasta)}`)
    } catch (e) {
      console.error('[visitas ML]', conexionId, e instanceof Error ? e.message : e)
      return n
    }
    // Formato de la API: lista [{ item_id, total_visits }]; por las dudas también { MLV…: N }.
    const pares: [string, number][] = Array.isArray(r)
      ? r.filter(x => x?.item_id && Number.isFinite(x.total_visits)).map(x => [x.item_id!, Number(x.total_visits)])
      : Object.entries(r ?? {}).filter(([k, v]) => ids.includes(k) && Number.isFinite(Number(v))).map(([k, v]) => [k, Number(v)])
    if (!pares.length) continue
    await db.query(
      `UPDATE ml_catalogo m SET visitas_30d = v.n, visitas_at = NOW()
       FROM unnest($1::text[], $2::int[]) AS v(id, n) WHERE m.item_id = v.id AND m.conexion_id = $3`,
      [pares.map(p => p[0]), pares.map(p => p[1]), conexionId])
    n += pares.length
  }
  return n
}
