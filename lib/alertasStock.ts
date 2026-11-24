// Alertas de stock (migración 052): lo que queda publicado en MercadoLibre, por publicación y por
// variante. Lee TODAS las publicaciones activas (y las pausadas por falta de stock: ML las pausa
// solo al llegar a 0) de cada cuenta conectada; no depende de los códigos ML de los productos.
// La revisión solo lee de MercadoLibre (cron de preguntas, cada 1 h por cuenta). Cambiar la cantidad la
// hace el admin a mano desde Stock (api/alertas-stock/actualizar).
//
// Filtro (decisión del dueño, 2026-10-02): solo cuenta lo que se VENDIÓ en los últimos 30 días
// (la variante, o la publicación si no tiene variantes), según las ventas que ya se traen de ML
// para Calificaciones (ml_ordenes.items). Lo que no se vende hace rato ya "murió" hasta reponerlo.
import type { Pool } from 'pg'
import { mlFetch, leerItems } from '@/lib/ml'
import { esDemo } from '@/lib/demo'

export const UMBRAL_DEFAULT = 3            // "por agotarse" = menos de esto (por empresa en Ajustes del módulo)
export const MINUTOS_ENTRE_REVISIONES = 60    // cada 1 h por cuenta (18-10, antes 2 h): al ritmo de las ventas; cuida las llamadas a ML
export const DIAS_VENDIDAS = 30
export const DIAS_CALIENTE = 7

/** "En caliente" (2026-10-12, migración 087): se agotó (o bajó del límite) en los últimos DIAS_CALIENTE días
 *  y nadie la quitó con "No hay, quitar" después de eso. Solo esto suma al aviso; lo demás es "En el olvido".
 *  `desde` = a.agotada_desde (agotadas) o a.bajo_desde (por agotarse). */
export const sqlCaliente = (desde: 'a.agotada_desde' | 'a.bajo_desde') =>
  `(${desde} > NOW() - INTERVAL '${DIAS_CALIENTE} days' AND (a.descartada_at IS NULL OR a.descartada_at < ${desde}))`

// 24-11 (el dueño: «cuando llega stock, lo que tenía como "no hay" o pausado debe salir de nuevo en Stock para activarlo»):
// «Llegó mercancía» = la publicación (o variante) está en 0 o pausada en ML, su producto tiene inventario y recibió una
// entrada (movimiento positivo: compra, importación, ajuste) DESPUÉS de que se agotó o se pausó, en los últimos
// DIAS_LLEGADA días. Vale aunque se haya quitado con «No hay» / «Quitar»; «Ahora no» la saca hasta la próxima entrada
// (llegada_vista_at, mig 197). Se va sola al ponerle stock o reactivarla (la fila deja de estar en 0 / pausada).
export const DIAS_LLEGADA = 14
const VINCULO_PROPIO = `EXISTS (SELECT 1 FROM product_ml_codes v WHERE v.is_active
            AND v.ml_code = substring(a.item_id FROM 4) || ':' || a.variante_id)`
const CODIGO_DE_FILA = `CASE WHEN a.variante_id <> 0 AND ${VINCULO_PROPIO}
     THEN substring(a.item_id FROM 4) || ':' || a.variante_id ELSE substring(a.item_id FROM 4) END`
const ENTERA_SIN_PROPIO = `(a.variante_id <> 0 AND NOT ${VINCULO_PROPIO} AND EXISTS (SELECT 1 FROM product_ml_codes w
    WHERE w.is_active AND w.ml_code = substring(a.item_id FROM 4)))`
const ENTRADAS = `FROM product_ml_codes m JOIN products p ON p.id = m.product_id AND p.is_active
   JOIN inventory_movements mv ON mv.product_id = m.product_id AND mv.quantity > 0 AND mv.created_at > NOW() - INTERVAL '${DIAS_LLEGADA} days'
     AND COALESCE(mv.reference, '') NOT LIKE 'Venta%'   -- lo que vuelve de una venta corregida, reabierta o anulada no es mercancía nueva
   WHERE m.is_active AND m.ml_code = ${CODIGO_DE_FILA}`
// Filtro rápido (se arma UNA vez como hash): publicaciones con algún producto que recibió mercancía en DIAS_LLEGADA días.
export const PUBS_CON_ENTRADA = `SELECT split_part(m.ml_code, ':', 1) FROM inventory_movements mv
    JOIN product_ml_codes m ON m.product_id = mv.product_id AND m.is_active
   WHERE mv.quantity > 0 AND mv.created_at > NOW() - INTERVAL '${DIAS_LLEGADA} days' AND COALESCE(mv.reference, '') NOT LIKE 'Venta%'`
/** Cuándo entró la última mercancía del producto de la fila (null si no hubo en DIAS_LLEGADA días). */
export const SQL_LLEGO_AT = `(SELECT MAX(mv.created_at) ${ENTRADAS})`
/** Referencia de esa entrada (ej. «OC-0123», «IMP-0042», «CONTEO-2026-11»). */
export const SQL_LLEGO_REF = `(SELECT mv.reference ${ENTRADAS} ORDER BY mv.created_at DESC LIMIT 1)`
const HAY_INVENTARIO = `(SELECT SUM(FLOOR(GREATEST(i.quantity, 0) / GREATEST(COALESCE(m.unidades, 1), 1))) FROM product_ml_codes m
    JOIN products p ON p.id = m.product_id AND p.is_active JOIN inventory i ON i.product_id = p.id
   WHERE m.is_active AND m.ml_code = ${CODIGO_DE_FILA}) > 0`
/** Condición SQL sobre `a`: «Llegó mercancía». `tipo`: 'agotadas' (en 0, no pausada a mano) o 'pausadas' (pausada a mano). */
export const sqlLlegada = (tipo: 'agotadas' | 'pausadas') => `(a.actualizado_at > NOW() - INTERVAL '1 day'
  AND ${tipo === 'pausadas' ? `a.estado = 'pausada' AND a.sub_status IS NULL` : `a.estado <> 'pausada' AND a.disponible <= 0`}
  AND substring(a.item_id FROM 4) IN (${PUBS_CON_ENTRADA})
  AND NOT ${ENTERA_SIN_PROPIO} AND ${HAY_INVENTARIO}
  AND ${SQL_LLEGO_AT} > GREATEST(COALESCE(a.llegada_vista_at, '-infinity'::timestamptz),
        COALESCE(${tipo === 'pausadas' ? 'a.pausada_desde' : 'a.agotada_desde'}, '-infinity'::timestamptz)))`

/** Condición SQL sobre ml_stock_alertas `a`: se vendió en los últimos DIAS_VENDIDAS días.
 *  Con IN (subconsulta) Postgres arma UNA vez la lista de lo vendido y la consulta como hash; con
 *  EXISTS … = ANY(o.items) recorría todas las ventas por cada fila (3 s por conteo, ~12 ms así). */
export const SQL_VENDIDA = `(CASE WHEN a.variante_id = 0 THEN a.item_id ELSE a.item_id || ':' || a.variante_id END) IN (
  SELECT unnest(o.items) FROM ml_ordenes o WHERE o.fecha > NOW() - INTERVAL '${DIAS_VENDIDAS} days')`
const POR_MULTIGET = 20                    // máximo de ML en /items?ids=

interface ItemML {
  id: string; title: string; status: string; sub_status?: string[]
  available_quantity: number; permalink?: string; thumbnail?: string
  pictures?: { id: string; url?: string; secure_url?: string }[]
  variations?: { id: number; available_quantity: number; picture_ids?: string[]; attribute_combinations?: { name: string; value_name: string | null }[] }[]
}
/** 18-11 (el dueño: la variante Gris salía con la foto Blanca): foto chica (-I) de la PRIMERA foto de la variante. */
const fotoVariante = (it: ItemML, ids?: string[]) => {
  const p = (it.pictures ?? []).find(x => x.id === ids?.[0])
  const u = p?.secure_url ?? p?.url
  return u ? u.replace(/^http:/, 'https:').replace(/-[A-Z]\.(jpg|webp|png)$/i, '-I.$1') : null
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

// 18-11 (el dueño: «los datos que llegan de una consulta hay que usarlos todos»): UNA lectura de ML (multiget) deja al día
// las DOS fotos de cada publicación: el catálogo (ml_catalogo: Mis publicaciones, Stock vs inventario, IA) y las alertas
// de stock (ml_stock_alertas: Automatizaciones → Stock). Los mismos campos sirven para las dos.
export const CAMPOS_ITEM = 'id,title,status,sub_status,price,currency_id,category_id,available_quantity,permalink,attributes,thumbnail,seller_custom_field,variations,pictures'

/** Guarda en ml_stock_alertas lo que dice ML de estas publicaciones (por publicación y por variante). Sirve para la pasada
 *  completa y para unas pocas (venta nueva, Vende de más…): NO borra las demás. Devuelve cuántas eran activas/pausadas. */
export async function guardarAlertas(db: Pool, conexionId: number, items: ItemML[], umbralDado?: number) {
  if (!items.length || await esDemo(db)) return 0
  const umbral = umbralDado ?? await umbralStock(db)
  let publicaciones = 0
  const filas: { item: string; var: number; titulo: string; variante: string | null; disp: number; estado: string; link: string | null; img: string | null; sub: string | null }[] = []
  for (const it of items) {
    if (it.status !== 'active' && it.status !== 'paused') continue
    publicaciones++
    // Pausada a mano (con stock): no es alerta de stock; va a la pestaña "Pausadas" (migración 101), una fila
    // por publicación. Pausada por falta de stock sí es alerta (agotada).
    if (it.status === 'paused' && !(it.sub_status ?? []).includes('out_of_stock') && it.available_quantity > 0) {
      filas.push({ item: it.id, titulo: it.title, estado: 'pausada', link: it.permalink ?? null, img: it.thumbnail ?? null,
        var: 0, variante: null, disp: it.available_quantity,
        // El motivo de ML (migración 111): vacío = la pausó el vendedor; under_review/forbidden… = la frenó ML.
        sub: (it.sub_status ?? []).join(',') || null })
      continue
    }
    const base = { item: it.id, titulo: it.title, estado: it.status, link: it.permalink ?? null, img: it.thumbnail ?? null, sub: null }
    if (it.variations?.length) {
      for (const v of it.variations) {
        const nombre = (v.attribute_combinations ?? []).map(a => `${a.name}: ${a.value_name ?? '—'}`).join(' · ') || null
        filas.push({ ...base, var: v.id, variante: nombre, disp: v.available_quantity ?? 0, img: fotoVariante(it, v.picture_ids) ?? base.img })
      }
    } else {
      filas.push({ ...base, var: 0, variante: null, disp: it.available_quantity ?? 0 })
    }
  }
  if (!filas.length) return publicaciones
  await db.query(
    `INSERT INTO ml_stock_alertas AS a (item_id, variante_id, conexion_id, titulo, variante, disponible, estado, permalink, imagen,
                                        agotada_desde, bajo_desde, ultima_agotada_at, pausada_desde, actualizado_at, sub_status)
     SELECT f.item, f.var, $1, f.titulo, f.variante, f.disp, f.estado, f.link, f.img,
            CASE WHEN f.estado <> 'pausada' AND f.disp <= 0 THEN NOW() END,
            CASE WHEN f.estado <> 'pausada' AND f.disp > 0 AND f.disp < $2 THEN NOW() END,
            CASE WHEN f.estado <> 'pausada' AND f.disp <= 0 THEN NOW() END,
            CASE WHEN f.estado = 'pausada' THEN NOW() END,
            NOW(), f.sub
     FROM unnest($3::text[], $4::bigint[], $5::text[], $6::text[], $7::int[], $8::text[], $9::text[], $10::text[], $11::text[])
          AS f(item, var, titulo, variante, disp, estado, link, img, sub)
     ON CONFLICT (empresa_id, item_id, variante_id) DO UPDATE SET
       conexion_id = EXCLUDED.conexion_id, titulo = EXCLUDED.titulo, variante = EXCLUDED.variante,
       disponible = EXCLUDED.disponible, estado = EXCLUDED.estado, permalink = EXCLUDED.permalink, imagen = EXCLUDED.imagen,
       agotada_desde = CASE WHEN EXCLUDED.estado <> 'pausada' AND EXCLUDED.disponible <= 0 THEN COALESCE(a.agotada_desde, NOW()) END,
       bajo_desde = CASE WHEN EXCLUDED.estado <> 'pausada' AND EXCLUDED.disponible > 0 AND EXCLUDED.disponible < $2 THEN COALESCE(a.bajo_desde, NOW()) END,
       ultima_agotada_at = CASE WHEN EXCLUDED.estado <> 'pausada' AND EXCLUDED.disponible <= 0 THEN NOW() ELSE a.ultima_agotada_at END,
       pausada_desde = CASE WHEN EXCLUDED.estado = 'pausada' THEN COALESCE(a.pausada_desde, NOW()) END,
       actualizado_at = NOW(), sub_status = EXCLUDED.sub_status`,
    [conexionId, umbral,
     filas.map(f => f.item), filas.map(f => f.var), filas.map(f => f.titulo), filas.map(f => f.variante),
     filas.map(f => f.disp), filas.map(f => f.estado), filas.map(f => f.link), filas.map(f => f.img), filas.map(f => f.sub)])
  return publicaciones
}

/** Revisa TODO el stock publicado de una cuenta y actualiza ml_stock_alertas. 18-11: con la MISMA lectura deja también
 *  el catálogo al día (y cuenta como su pasada de 6 h: catalogo_at), sin otra vuelta por todas las publicaciones. */
export async function revisarStockCuenta(db: Pool, conexionId: number) {
  const { rows: [c] } = await db.query(`SELECT ml_user_id FROM ml_conexiones WHERE id = $1`, [conexionId])
  if (!c) return { publicaciones: 0 }
  await db.query(`UPDATE ml_conexiones SET stock_alertas_at = NOW() WHERE id = $1`, [conexionId])
  // Modo demostración (lib/demo.ts): no se relee ML, para no pisar ni borrar el stock sembrado.
  if (await esDemo(db)) return { publicaciones: 0 }
  const umbral = await umbralStock(db)
  const inicio = new Date()
  const seller = Number(c.ml_user_id)
  const ids = [...new Set([...await idsDe(db, conexionId, seller, 'active'), ...await idsDe(db, conexionId, seller, 'paused')])]
  const { guardarItemCatalogo, cerrarPasadaCatalogo } = await import('@/lib/catalogoML')

  let publicaciones = 0
  const sinLeer: string[] = []          // ML no dejó leerlas en esta pasada: se quedan como estaban (no se borran)
  for (let i = 0; i < ids.length; i += POR_MULTIGET) {
    const r = await leerItems<ItemML>(db, conexionId, ids.slice(i, i + POR_MULTIGET), CAMPOS_ITEM)
    sinLeer.push(...r.filter(x => x.code === -1).map(x => x.id))
    const items = r.filter(x => x.code === 200 && x.body).map(x => x.body!)
    publicaciones += await guardarAlertas(db, conexionId, items, umbral)
    for (const it of items) if (it.status === 'active' || it.status === 'paused') await guardarItemCatalogo(db, conexionId, it as unknown as Parameters<typeof guardarItemCatalogo>[2])   // leída con CAMPOS_ITEM: trae todo
  }
  // Lo que ya no está publicado (cerrado, borrado): fuera. Las pausadas a mano se quedan (estado 'pausada').
  await db.query(`DELETE FROM ml_stock_alertas WHERE conexion_id = $1 AND actualizado_at < $2 AND NOT (item_id = ANY($3::text[]))`,
    [conexionId, inicio, sinLeer])
  if (sinLeer.length) console.error('[alertas stock] sin leer', conexionId, sinLeer.length)
  // El catálogo quedó leído entero con esta misma pasada: se cierra igual que la de 6 h y se anota como hecha.
  await cerrarPasadaCatalogo(db, conexionId, inicio, sinLeer)
  await db.query(`UPDATE ml_conexiones SET catalogo_at = NOW() WHERE id = $1`, [conexionId])
  return { publicaciones }
}

/** Para el cron: revisa UNA cuenta por pasada, la más atrasada, si pasó la hora. */
export async function revisarStockPendiente(db: Pool) {
  const { rows: [c] } = await db.query(
    `SELECT id FROM ml_conexiones
     WHERE estado = 'activa'
       AND (stock_alertas_at IS NULL OR stock_alertas_at < NOW() - make_interval(mins => $1))
     ORDER BY stock_alertas_at NULLS FIRST LIMIT 1`, [MINUTOS_ENTRE_REVISIONES])
  return c ? revisarStockCuenta(db, c.id) : null
}

/** Cuántas alertas EN CALIENTE hay (agotadas + por agotarse, vendidas en 30 días), para el numerito del menú. */
export async function contarAlertas(db: Pool, conInventario = false) {   // conInventario: suma «Llegó mercancía» (hoy nadie lo pide)
  const umbral = await umbralStock(db)
  const { rows: [r] } = await db.query(
    `SELECT COUNT(*) FILTER (WHERE a.disponible <= 0 AND ${sqlCaliente('a.agotada_desde')})::int AS agotadas,
            COUNT(*) FILTER (WHERE a.disponible > 0 AND a.disponible < $1 AND ${sqlCaliente('a.bajo_desde')})::int AS bajas
     FROM ml_stock_alertas a WHERE a.actualizado_at > NOW() - INTERVAL '1 day' AND a.estado <> 'pausada' AND ${SQL_VENDIDA}`, [umbral])
  // 24-11: con Inventario, también «Llegó mercancía» (en 0 o pausadas que ya tienen con qué volver a la venta).
  const llegadas = conInventario ? (await contarLlegadas(db)).total : 0
  return { agotadas: r.agotadas as number, bajas: r.bajas as number, llegadas }
}

/** Cuántas publicaciones están en «Llegó mercancía» (las dos pestañas). Solo empresas con Inventario.
 *  `desde`: solo las de entradas a partir de ese momento (el aviso al recibir). */
export async function contarLlegadas(db: Pool, desde?: Date) {
  const { rows: [r] } = await db.query(
    // OFFSET 0: primero lo barato (publicaciones con entradas recientes) y recién ahí lo demás (0,18 s → 0,03 s en SolucionesMC).
    `SELECT COUNT(*) FILTER (WHERE ${sqlLlegada('agotadas')})::int AS agotadas, COUNT(*) FILTER (WHERE ${sqlLlegada('pausadas')})::int AS pausadas
       FROM (SELECT * FROM ml_stock_alertas a WHERE substring(a.item_id FROM 4) IN (${PUBS_CON_ENTRADA}) OFFSET 0) a
      WHERE $1::timestamptz IS NULL OR ${SQL_LLEGO_AT} >= $1`, [desde ?? null])
  return { agotadas: r.agotadas as number, pausadas: r.pausadas as number, total: (r.agotadas + r.pausadas) as number }
}
