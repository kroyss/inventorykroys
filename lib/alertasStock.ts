// Alertas de stock (migración 052): lo que queda publicado en MercadoLibre, por publicación y por
// variante. Lee TODAS las publicaciones activas (y las pausadas por falta de stock: ML las pausa
// solo al llegar a 0) de cada cuenta conectada; no depende de los códigos ML de los productos.
// La revisión solo lee de MercadoLibre (cron de preguntas, cada 2 h por cuenta). Cambiar la cantidad la
// hace el admin a mano desde Stock (api/alertas-stock/actualizar).
//
// Filtro (decisión del dueño, 2026-10-02): solo cuenta lo que se VENDIÓ en los últimos 30 días
// (la variante, o la publicación si no tiene variantes), según las ventas que ya se traen de ML
// para Calificaciones (ml_ordenes.items). Lo que no se vende hace rato ya "murió" hasta reponerlo.
import type { Pool } from 'pg'
import { mlFetch } from '@/lib/ml'

export const UMBRAL_DEFAULT = 3            // "por agotarse" = menos de esto (por empresa en Ajustes del módulo)
export const MINUTOS_ENTRE_REVISIONES = 120   // cada 2 h por cuenta: cuida las llamadas a ML al crecer
export const DIAS_VENDIDAS = 30

/** Condición SQL sobre ml_stock_alertas `a`: se vendió en los últimos DIAS_VENDIDAS días.
 *  Con IN (subconsulta) Postgres arma UNA vez la lista de lo vendido y la consulta como hash; con
 *  EXISTS … = ANY(o.items) recorría todas las ventas por cada fila (3 s por conteo, ~12 ms así). */
export const SQL_VENDIDA = `(CASE WHEN a.variante_id = 0 THEN a.item_id ELSE a.item_id || ':' || a.variante_id END) IN (
  SELECT unnest(o.items) FROM ml_ordenes o WHERE o.fecha > NOW() - INTERVAL '${DIAS_VENDIDAS} days')`
const POR_MULTIGET = 20                    // máximo de ML en /items?ids=

interface ItemML {
  id: string; title: string; status: string; sub_status?: string[]
  available_quantity: number; permalink?: string; thumbnail?: string
  variations?: { id: number; available_quantity: number; attribute_combinations?: { name: string; value_name: string | null }[] }[]
}

export async function umbralStock(db: Pool) {
  const { rows: [r] } = await db.query(`SELECT value FROM app_settings WHERE key = 'stock_alerta_umbral'`)
  const n = parseInt(r?.value ?? '', 10)
  return Number.isFinite(n) && n >= 1 && n <= 100 ? n : UMBRAL_DEFAULT
}

/** Ids de las publicaciones de un estado (scan: sin el tope de 1.000 de la búsqueda normal). */
export async function idsDe(db: Pool, conexionId: number, sellerId: number, estado: 'active' | 'paused') {
  const ids: string[] = []
  let scroll: string | null = null
  for (let vuelta = 0; vuelta < 200; vuelta++) {
    const q: string = `/users/${sellerId}/items/search?status=${estado}&search_type=scan&limit=100${scroll ? `&scroll_id=${encodeURIComponent(scroll)}` : ''}`
    const r: { results?: string[]; scroll_id?: string } = await mlFetch(db, conexionId, q)
    const lote = r.results ?? []
    if (!lote.length) break
    ids.push(...lote)
    scroll = r.scroll_id ?? null
    if (!scroll) break
  }
  return ids
}

/** Revisa TODO el stock publicado de una cuenta y actualiza ml_stock_alertas. */
export async function revisarStockCuenta(db: Pool, conexionId: number) {
  const { rows: [c] } = await db.query(`SELECT ml_user_id FROM ml_conexiones WHERE id = $1`, [conexionId])
  if (!c) return { publicaciones: 0 }
  await db.query(`UPDATE ml_conexiones SET stock_alertas_at = NOW() WHERE id = $1`, [conexionId])
  const umbral = await umbralStock(db)
  const inicio = new Date()
  const seller = Number(c.ml_user_id)
  const ids = [...new Set([...await idsDe(db, conexionId, seller, 'active'), ...await idsDe(db, conexionId, seller, 'paused')])]

  let publicaciones = 0
  for (let i = 0; i < ids.length; i += POR_MULTIGET) {
    const lote = ids.slice(i, i + POR_MULTIGET)
    const r = await mlFetch<{ code: number; body: ItemML }[]>(db, conexionId,
      `/items?ids=${lote.join(',')}&attributes=id,title,status,sub_status,available_quantity,permalink,thumbnail,variations`)
    const filas: { item: string; var: number; titulo: string; variante: string | null; disp: number; estado: string; link: string | null; img: string | null }[] = []
    for (const x of r) {
      const it = x.code === 200 ? x.body : null
      if (!it) continue
      // Pausada a mano (con stock): no es una alerta. Pausada por falta de stock sí.
      if (it.status === 'paused' && !(it.sub_status ?? []).includes('out_of_stock') && it.available_quantity > 0) continue
      if (it.status !== 'active' && it.status !== 'paused') continue
      publicaciones++
      const base = { item: it.id, titulo: it.title, estado: it.status, link: it.permalink ?? null, img: it.thumbnail ?? null }
      if (it.variations?.length) {
        for (const v of it.variations) {
          const nombre = (v.attribute_combinations ?? []).map(a => `${a.name}: ${a.value_name ?? '—'}`).join(' · ') || null
          filas.push({ ...base, var: v.id, variante: nombre, disp: v.available_quantity ?? 0 })
        }
      } else {
        filas.push({ ...base, var: 0, variante: null, disp: it.available_quantity ?? 0 })
      }
    }
    if (!filas.length) continue
    await db.query(
      `INSERT INTO ml_stock_alertas AS a (item_id, variante_id, conexion_id, titulo, variante, disponible, estado, permalink, imagen,
                                          agotada_desde, bajo_desde, ultima_agotada_at, actualizado_at)
       SELECT f.item, f.var, $1, f.titulo, f.variante, f.disp, f.estado, f.link, f.img,
              CASE WHEN f.disp <= 0 THEN NOW() END,
              CASE WHEN f.disp > 0 AND f.disp < $2 THEN NOW() END,
              CASE WHEN f.disp <= 0 THEN NOW() END,
              NOW()
       FROM unnest($3::text[], $4::bigint[], $5::text[], $6::text[], $7::int[], $8::text[], $9::text[], $10::text[])
            AS f(item, var, titulo, variante, disp, estado, link, img)
       ON CONFLICT (empresa_id, item_id, variante_id) DO UPDATE SET
         conexion_id = EXCLUDED.conexion_id, titulo = EXCLUDED.titulo, variante = EXCLUDED.variante,
         disponible = EXCLUDED.disponible, estado = EXCLUDED.estado, permalink = EXCLUDED.permalink, imagen = EXCLUDED.imagen,
         agotada_desde = CASE WHEN EXCLUDED.disponible <= 0 THEN COALESCE(a.agotada_desde, NOW()) END,
         bajo_desde = CASE WHEN EXCLUDED.disponible > 0 AND EXCLUDED.disponible < $2 THEN COALESCE(a.bajo_desde, NOW()) END,
         ultima_agotada_at = CASE WHEN EXCLUDED.disponible <= 0 THEN NOW() ELSE a.ultima_agotada_at END,
         actualizado_at = NOW()`,
      [conexionId, umbral,
       filas.map(f => f.item), filas.map(f => f.var), filas.map(f => f.titulo), filas.map(f => f.variante),
       filas.map(f => f.disp), filas.map(f => f.estado), filas.map(f => f.link), filas.map(f => f.img)])
  }
  // Lo que ya no está publicado (cerrado, borrado, pausado a mano): fuera.
  await db.query(`DELETE FROM ml_stock_alertas WHERE conexion_id = $1 AND actualizado_at < $2`, [conexionId, inicio])
  return { publicaciones }
}

/** Para el cron: revisa UNA cuenta por pasada, la más atrasada, si pasaron las 2 horas. */
export async function revisarStockPendiente(db: Pool) {
  const { rows: [c] } = await db.query(
    `SELECT id FROM ml_conexiones
     WHERE estado = 'activa'
       AND (stock_alertas_at IS NULL OR stock_alertas_at < NOW() - make_interval(mins => $1))
     ORDER BY stock_alertas_at NULLS FIRST LIMIT 1`, [MINUTOS_ENTRE_REVISIONES])
  return c ? revisarStockCuenta(db, c.id) : null
}

/** Cuántas alertas hay ahora (agotadas + por agotarse, vendidas en 30 días), para el numerito del menú. */
export async function contarAlertas(db: Pool) {
  const umbral = await umbralStock(db)
  const { rows: [r] } = await db.query(
    `SELECT COUNT(*) FILTER (WHERE a.disponible <= 0)::int AS agotadas,
            COUNT(*) FILTER (WHERE a.disponible > 0 AND a.disponible < $1)::int AS bajas
     FROM ml_stock_alertas a WHERE a.actualizado_at > NOW() - INTERVAL '1 day' AND ${SQL_VENDIDA}`, [umbral])
  return { agotadas: r.agotadas as number, bajas: r.bajas as number }
}
