// Stock en MercadoLibre vs inventario.
//
// Cada producto guarda su código de publicación por cuenta (product_ml_codes: cuenta +
// número sin prefijo). Se lee cada publicación de a una (el multiget da 403 en MLV) y se
// guarda en ml_publicaciones. El cron avanza de a poco: LOTE publicaciones por pasada, y
// cada una se vuelve a leer cuando tiene más de FRESCURA_HORAS. Solo lee de ML.
import type { Pool } from 'pg'
import { mlFetch, ErrorML } from '@/lib/ml'

export const LOTE = 40
export const FRESCURA_HORAS = 6
export const DIAS_VENTAS = 3            // ventas recientes para priorizar (como la revisión diaria)
export const UMBRAL_BAJO = 3            // publicado activo <= esto con stock real de sobra → reponer

interface ItemML { id: string; status: string; available_quantity: number; sold_quantity: number; price: number; currency_id: string }

/** Lee de ML las publicaciones vencidas o nuevas. `todas` = sin tope (botón Actualizar). */
export async function sincronizarPublicaciones(db: Pool, todas = false) {
  const { rows: cuentas } = await db.query(`SELECT id, nickname FROM ml_conexiones WHERE estado = 'activa'`)
  if (cuentas.length === 0) return { leidas: 0 }
  const { rows } = await db.query(
    `SELECT m.product_id, m.ml_account AS cuenta, m.ml_code,
            CASE WHEN m.ml_code ~ '^[A-Z]{3}' THEN m.ml_code ELSE 'MLV' || m.ml_code END AS item_id
     FROM product_ml_codes m
     JOIN products p ON p.id = m.product_id AND p.is_active
     LEFT JOIN ml_publicaciones x ON x.item_id = CASE WHEN m.ml_code ~ '^[A-Z]{3}' THEN m.ml_code ELSE 'MLV' || m.ml_code END
     WHERE m.is_active AND COALESCE(m.ml_code, '') <> ''
       AND (x.item_id IS NULL OR x.actualizado_at < NOW() - make_interval(hours => $1))
     ORDER BY x.actualizado_at NULLS FIRST
     ${todas ? '' : `LIMIT ${LOTE}`}`, [FRESCURA_HORAS])

  const porNombre = new Map(cuentas.map(c => [String(c.nickname).toUpperCase(), c.id as number]))
  let leidas = 0
  for (const r of rows) {
    // La cuenta del producto ("PIKEKE") suele llamarse igual que la conexión; si no, se prueba en todas.
    const preferida = porNombre.get(String(r.cuenta ?? '').toUpperCase())
    const orden = preferida ? [preferida, ...cuentas.map(c => c.id).filter(id => id !== preferida)] : cuentas.map(c => c.id)
    let it: ItemML | null = null, conexionId = orden[0], error: string | null = null
    for (const cid of orden) {
      try {
        it = await mlFetch<ItemML>(db, cid, `/items/${r.item_id}?attributes=id,status,available_quantity,sold_quantity,price,currency_id`)
        conexionId = cid; break
      } catch (e) {
        error = e instanceof ErrorML ? e.message : e instanceof Error ? e.message : String(e)
        if (!(e instanceof ErrorML) || ![401, 403, 404].includes(e.status)) break
      }
    }
    await db.query(
      `INSERT INTO ml_publicaciones (item_id, conexion_id, product_id, cuenta, disponible, estado, vendidos, precio, moneda, error, actualizado_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
       ON CONFLICT (empresa_id, item_id) DO UPDATE SET
         conexion_id = EXCLUDED.conexion_id, product_id = EXCLUDED.product_id, cuenta = EXCLUDED.cuenta,
         disponible = EXCLUDED.disponible, estado = EXCLUDED.estado, vendidos = EXCLUDED.vendidos,
         precio = EXCLUDED.precio, moneda = EXCLUDED.moneda, error = EXCLUDED.error, actualizado_at = NOW()`,
      [r.item_id, conexionId, r.product_id, r.cuenta, it?.available_quantity ?? null, it?.status ?? null,
       it?.sold_quantity ?? null, it?.price ?? null, it?.currency_id ?? null, it ? null : (error ?? 'No se pudo leer').slice(0, 300)])
    leidas++
  }
  // Códigos que ya no están en ningún producto activo: fuera de la tabla.
  await db.query(
    `DELETE FROM ml_publicaciones x WHERE NOT EXISTS (
       SELECT 1 FROM product_ml_codes m JOIN products p ON p.id = m.product_id AND p.is_active
       WHERE m.is_active AND x.item_id = CASE WHEN m.ml_code ~ '^[A-Z]{3}' THEN m.ml_code ELSE 'MLV' || m.ml_code END)`)
  return { leidas }
}

/** Comparación por producto: stock real, publicado por cuenta, ventas recientes y alerta. */
export const SQL_COMPARACION = `
  WITH pub AS (
    SELECT product_id,
           json_agg(json_build_object('item_id', item_id, 'cuenta', cuenta, 'disponible', disponible,
                                      'estado', estado, 'error', error) ORDER BY cuenta, item_id) AS publicaciones,
           COALESCE(SUM(disponible) FILTER (WHERE estado = 'active'), 0)::int AS publicado_activo,
           COUNT(*) FILTER (WHERE estado = 'paused')::int AS pausadas,
           COUNT(*) FILTER (WHERE estado = 'active')::int AS activas,
           MIN(actualizado_at) AS actualizado_at
    FROM ml_publicaciones GROUP BY product_id
  ), ventas AS (
    SELECT si.product_id, SUM(si.quantity)::int AS vendidas
    FROM sales s JOIN sale_items si ON si.sale_id = s.id
    WHERE s.status IN ('PROCESADA', 'DESCARGADA', 'DESCARGADA_LOCAL')
      AND s.created_at >= NOW() - make_interval(days => $1)
    GROUP BY si.product_id
  )
  SELECT p.id, p.code, p.name, COALESCE(i.quantity, 0)::int AS stock_real,
         pub.publicaciones, pub.publicado_activo, pub.pausadas, pub.activas, pub.actualizado_at,
         COALESCE(v.vendidas, 0) AS vendidas_recientes,
         CASE
           WHEN pub.publicado_activo > COALESCE(i.quantity, 0) THEN 'de_mas'
           WHEN COALESCE(i.quantity, 0) > pub.publicado_activo
                AND (pub.publicado_activo <= $2 OR pub.pausadas > 0) THEN 'reponer'
           ELSE 'ok'
         END AS alerta
  FROM products p
  JOIN pub ON pub.product_id = p.id
  LEFT JOIN inventory i ON i.product_id = p.id
  LEFT JOIN ventas v ON v.product_id = p.id
  WHERE p.is_active`
