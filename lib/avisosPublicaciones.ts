import type { Pool } from 'pg'
import { filasStockML } from '@/lib/stockConML'
import { PUBS_CON_ENTRADA } from '@/lib/alertasStock'

// Mis publicaciones (Fase 4, 18-11, el dueño: «una sola lista, al estilo ML»): cada fila lleva una etiqueta corta SOLO
// cuando algo pide atención. Todo sale de lo guardado (ml_catalogo, vínculos, inventario, la foto de Promociones): abrir
// la lista no le pide nada a MercadoLibre.
//   - stock / vende: lo MISMO que Stock vs inventario (lib/stockConML.ts, nunca una copia del cálculo).
//   - vincular: publicación activa con stock y alguna variante (o la entera) sin producto (= contarSinVincular).
//   - peso: vinculada a un producto activo sin peso (Venezuela con Inventario; = el numerito de Pesos).
//   - promo: está adentro de una promoción según la última foto de Promociones (informativo).
// Cada etiqueta solo para quien ve esa pantalla (permisos en la API).

export interface PubIgualar { item_id: string; variante_id: string | null; variante: string | null; ml: number | null; queda: number; reactivar: boolean }
export interface AvisoStock { nivel: 'vende' | 'stock'; code: string; product_id: number; pubs: PubIgualar[]; disponible: number }

// filasStockML recorre todo el catálogo vinculado (y las ventas de 60 días): se guarda 60 s por empresa en este proceso
// para que pasar de página o filtrar no lo repita. Después de igualar desde la lista se pide «fresco».
const cache = new Map<number, { at: number; datos: Map<string, AvisoStock> }>()
const TTL = 60_000

export async function avisosStock(db: Pool, empresaId: number, pais: string, fresco = false): Promise<Map<string, AvisoStock>> {
  const c = cache.get(empresaId)
  if (!fresco && c && Date.now() - c.at < TTL) return c.datos
  const filas = await filasStockML(db, pais)
  const datos = new Map<string, AvisoStock>()
  for (const f of filas) {
    for (const p of f.pubs) {
      const cambia = p.objetivo != null && (p.objetivo !== p.ml_disponible || p.reactivar)
      const vende = !!f.vende && p.estado === 'active' && (p.ml_disponible ?? 0) > 0
      if (!cambia && !vende) continue
      const a = datos.get(p.item_id) ?? { nivel: 'stock' as const, code: f.code, product_id: f.product_id, pubs: [], disponible: f.disponible }
      if (vende) a.nivel = 'vende'
      if (cambia) a.pubs.push({ item_id: p.item_id, variante_id: p.variante_id, variante: p.variante, ml: p.ml_disponible, queda: p.objetivo!, reactivar: p.reactivar })
      datos.set(p.item_id, a)
    }
  }
  cache.set(empresaId, { at: Date.now(), datos })
  return datos
}

/** Publicaciones que están adentro de una promoción (última foto de Promociones) → nombres de sus campañas. */
export async function itemsEnPromo(db: Pool): Promise<Map<string, string[]>> {
  const { rows } = await db.query<{ id: string; nombres: string[] }>(
    `SELECT i->>'id' AS id, array_agg(DISTINCT COALESCE(NULLIF(cp.nombre, ''), 'Promoción de MercadoLibre')) AS nombres
     FROM ml_promociones_cache c,
          jsonb_array_elements(CASE WHEN jsonb_typeof(c.datos->'items') = 'array' THEN c.datos->'items' ELSE '[]'::jsonb END) i,
          jsonb_array_elements(CASE WHEN jsonb_typeof(i->'promos') = 'array' THEN i->'promos' ELSE '[]'::jsonb END) pr
     LEFT JOIN LATERAL (
       SELECT x->>'nombre' AS nombre
       FROM jsonb_array_elements(CASE WHEN jsonb_typeof(c.datos->'campanas') = 'array' THEN c.datos->'campanas' ELSE '[]'::jsonb END) x
       WHERE x->>'id' = pr->>'campana' LIMIT 1) cp ON TRUE
     WHERE pr->>'estado' = 'started'
     GROUP BY 1`)
  return new Map(rows.map(r => [r.id, r.nombres]))
}

// Las subconsultas de vínculos NO dependen de la fila: Postgres las calcula una vez y las guarda en una tabla hash
// (con EXISTS correlacionado recorría product_ml_codes por cada publicación: 1,7 s en SolucionesMC; así, decenas de ms).
const VINCULADOS = `(SELECT x.ml_code FROM product_ml_codes x JOIN products px ON px.id = x.product_id
                     WHERE x.is_active AND px.is_active AND x.ml_code IS NOT NULL)`

/** SQL (booleano) sobre `m` (ml_catalogo): activa con stock y alguna variante, o la entera, sin producto. */
export const SQL_SIN_VINCULAR = `(m.estado = 'active' AND substring(m.item_id FROM 4) NOT IN ${VINCULADOS} AND EXISTS (
  SELECT 1 FROM (
    SELECT NULL::text AS var, m.disponible AS disp
    WHERE jsonb_typeof(m.variantes) IS DISTINCT FROM 'array' OR jsonb_array_length(m.variantes) = 0
    UNION ALL
    SELECT v->>'id', (v->>'disponible')::int
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(m.variantes) = 'array' THEN m.variantes ELSE '[]'::jsonb END) v
  ) f
  WHERE f.disp > 0 AND (substring(m.item_id FROM 4) || COALESCE(':' || f.var, '')) NOT IN ${VINCULADOS}))`

/** SQL (booleano): vinculada a algún producto activo sin peso. */
export const SQL_SIN_PESO = `(substring(m.item_id FROM 4) IN (
  SELECT split_part(x.ml_code, ':', 1) FROM product_ml_codes x JOIN products px ON px.id = x.product_id
  WHERE x.is_active AND px.is_active AND x.ml_code IS NOT NULL AND (px.weight_kg IS NULL OR px.weight_kg <= 0)))`

// 24-11 (el dueño: «que el aviso lleve a Mis publicaciones filtrado; puede haber variantes con stock en ML pero pausadas, o
// llegaron unas variantes y otras no»): filtro «Para activar» = publicación activa o pausada vinculada a algún producto con
// inventario (alcanza para 1 venta, combos incluidos) y que: está pausada, está en 0, tiene una variante vinculada en 0 cuyo
// producto sí tiene, o su producto recibió mercancía en los últimos días (recién llegada, aunque ya esté activa).
// 24-11 Kit (mig 198): solo si alcanza con TODOS sus productos.
const CON_INVENTARIO = `(SELECT x.ml_code FROM product_ml_codes x JOIN products px ON px.id = x.product_id AND px.is_active
     JOIN inventory i ON i.product_id = x.product_id
    WHERE x.is_active AND x.ml_code IS NOT NULL AND i.quantity >= GREATEST(COALESCE(x.unidades, 1), 1)
      AND (NOT x.kit OR NOT EXISTS (SELECT 1 FROM product_ml_codes k LEFT JOIN inventory ik ON ik.product_id = k.product_id
             WHERE k.is_active AND k.kit AND k.ml_code = x.ml_code AND COALESCE(ik.quantity, 0) < GREATEST(COALESCE(k.unidades, 1), 1))))`
export const SQL_PARA_ACTIVAR = `(m.estado IN ('active', 'paused')
  AND substring(m.item_id FROM 4) IN (SELECT split_part(c.ml_code, ':', 1) FROM ${CON_INVENTARIO} c)
  AND (m.estado = 'paused' OR m.disponible <= 0
    OR substring(m.item_id FROM 4) IN (${PUBS_CON_ENTRADA})
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(m.variantes) = 'array' THEN m.variantes ELSE '[]'::jsonb END) v
               WHERE COALESCE((v->>'disponible')::int, 0) <= 0
                 AND substring(m.item_id FROM 4) || ':' || (v->>'id') IN ${CON_INVENTARIO})))`
/** Lo que hay en el inventario para esta publicación: suma de sus productos vinculados (combos: ÷ unidades). */
export const SQL_INVENTARIO_PUB = `(SELECT (CASE WHEN bool_and(x.kit) THEN MIN(FLOOR(GREATEST(i.quantity, 0) / GREATEST(COALESCE(x.unidades, 1), 1)))
                                                ELSE SUM(FLOOR(GREATEST(i.quantity, 0) / GREATEST(COALESCE(x.unidades, 1), 1))) END)::int
   FROM product_ml_codes x JOIN products px ON px.id = x.product_id AND px.is_active JOIN inventory i ON i.product_id = x.product_id
  WHERE x.is_active AND split_part(x.ml_code, ':', 1) = substring(m.item_id FROM 4))`
/** Cuántos productos distintos tiene vinculados (variantes): para decir «en N variantes». */
export const SQL_PRODUCTOS_PUB = `(SELECT COUNT(DISTINCT x.product_id)::int FROM product_ml_codes x
  WHERE x.is_active AND split_part(x.ml_code, ':', 1) = substring(m.item_id FROM 4))`
/** Última entrada de mercancía (14 días) de alguno de sus productos; no cuenta lo que vuelve de ventas. */
export const SQL_LLEGO_PUB = `(SELECT MAX(mv.created_at) FROM product_ml_codes x
   JOIN inventory_movements mv ON mv.product_id = x.product_id AND mv.quantity > 0 AND mv.created_at > NOW() - INTERVAL '14 days'
     AND COALESCE(mv.reference, '') NOT LIKE 'Venta%'
  WHERE x.is_active AND split_part(x.ml_code, ':', 1) = substring(m.item_id FROM 4))`
