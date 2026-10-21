// Sesión para Promociones (migración 094): módulo prendido, Venezuela, con inventario y el permiso.
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { tieneModulo } from '@/lib/modulos'
import { puede } from '@/lib/permisos'
import type { Pool } from 'pg'

export async function sesionPromociones() {
  const { session, db } = await getSessionDb()
  if (!session || !db) return { error: unauthorized() } as const
  const u = session.user
  if (u.country !== 'VE' || !tieneModulo(u, 'promociones') || !tieneModulo(u, 'inventario')
    || !puede(u, 'ver_productos') || !puede(u, 'promociones')) return { error: forbidden() } as const
  return { session, db, userId: parseInt(u.id, 10) } as const
}

/** ¿La empresa de esta conexión tiene Promociones (VE)? El envío gratis por transportista en Preguntas,
 *  Mensajes y la IA es solo para ellas (2026-10-16); las demás siguen como antes. */
export async function empresaConPromociones(db: Pool) {
  const { rows: [e] } = await db.query(
    `SELECT 'promociones' = ANY(modulos) AND country = 'VE' AS si FROM empresas
     WHERE id = NULLIF(current_setting('app.empresa_id', true), '')::int`).catch(() => ({ rows: [] as { si: boolean }[] }))
  return !!e?.si
}

/** SQL del peso (kg) de una publicación para el envío gratis por transportista: el del portal de MercadoEnvíos
 *  (el de la publicación) o, si no está ahí (pausadas o sin envío configurado, 17-10), el del producto vinculado
 *  (solo publicaciones de 1 unidad). `col` = la columna o expresión con el id "MLV…". */
export const sqlPesoPublicacion = (col: string) => `COALESCE(
  (SELECT mp.peso_kg::float FROM me_productos mp WHERE mp.publicacion = ${col} AND mp.peso_kg > 0),
  (SELECT MAX(pd.weight_kg)::float FROM product_ml_codes pm JOIN products pd ON pd.id = pm.product_id
   WHERE pm.is_active AND pm.unidades = 1 AND pd.weight_kg > 0
     AND split_part(pm.ml_code, ':', 1) = regexp_replace(${col}, '^[A-Z]{3}', '')))`

/** SQL (21-10): los productos vinculados a la publicación entera ({code, kg}) cuando NO hay peso del portal y
 *  pesan distinto; NULL si no. Es lo que usa `conflictoPesos` (lib/mlShipping.ts) para avisar un vínculo mal hecho. */
export const sqlPesosVinculados = (col: string) => `CASE WHEN NOT EXISTS (
    SELECT 1 FROM me_productos mp WHERE mp.publicacion = ${col} AND mp.peso_kg > 0) THEN
  (SELECT CASE WHEN COUNT(DISTINCT pd.weight_kg) > 1
               THEN jsonb_agg(jsonb_build_object('code', pd.code, 'kg', pd.weight_kg::float) ORDER BY pd.weight_kg) END
   FROM product_ml_codes pm JOIN products pd ON pd.id = pm.product_id
   WHERE pm.is_active AND pd.is_active AND pm.unidades = 1 AND pd.weight_kg > 0
     AND pm.ml_code = regexp_replace(${col}, '^[A-Z]{3}', '')) END`

/** SQL de la situación de una publicación (17-10): 'activa', 'agotada' (pausada sin stock) o 'pausada' (a mano, con
 *  stock), del catálogo que ya se trae de ML; si no está en el catálogo, la del estado guardado (`estadoCol`). */
export const sqlSituacion = (col: string, estadoCol = 'NULL::text') => `COALESCE(
  (SELECT CASE WHEN k.estado = 'active' THEN 'activa'
               WHEN k.estado = 'paused' AND COALESCE(k.disponible, 0) <= 0 THEN 'agotada'
               WHEN k.estado = 'paused' THEN 'pausada' END
   FROM ml_catalogo k WHERE k.item_id = ${col} LIMIT 1),
  CASE ${estadoCol} WHEN 'active' THEN 'activa' WHEN 'paused' THEN 'pausada_ml' END)`

/** SQL de las unidades disponibles de la publicación en ML (suma de variantes), del catálogo; null si no está. */
export const sqlDisponible = (col: string) => `(SELECT k.disponible::int FROM ml_catalogo k WHERE k.item_id = ${col} LIMIT 1)`
