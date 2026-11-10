// Stock por variante (31-10, pedido del dueño): "¿tienes en talla M negro?" se contesta con lo disponible en ESA
// variante de la publicación en MercadoLibre y, si la variante está vinculada a un producto del sistema
// (product_ml_codes "item:variación"), con el menor de los dos. La IA (borradores y revisor de sugeridas) solo confirma
// si alcanza para lo que pide; si no, queda para una persona.
import type { Pool } from 'pg'

export interface VariacionML { id: number; available_quantity?: number; attribute_combinations?: { name?: string; value_name?: string | null }[] }
export interface Variante { nombre: string; ml: number; sistema: number | null; disponibles: number }

export async function variantesDe(db: Pool, itemId: string, variaciones: VariacionML[] | undefined | null): Promise<Variante[]> {
  if (!variaciones || variaciones.length < 2) return []
  const codigo = itemId.replace(/^[A-Z]{3}/, '')
  const { rows } = await db.query(
    `SELECT split_part(m.ml_code, ':', 2) AS var, FLOOR(COALESCE(i.quantity, 0)::numeric / GREATEST(COALESCE(m.unidades, 1), 1))::int AS stock
     FROM product_ml_codes m JOIN products p ON p.id = m.product_id AND p.is_active LEFT JOIN inventory i ON i.product_id = p.id
     WHERE m.is_active AND split_part(m.ml_code, ':', 1) = $1 AND m.ml_code LIKE '%:%'`, [codigo]).catch(() => ({ rows: [] }))
  const sistema = new Map(rows.map(r => [String(r.var), Number(r.stock)]))
  return variaciones.map(v => {
    const ml = Math.max(0, v.available_quantity ?? 0)
    const sis = sistema.get(String(v.id)) ?? null
    return {
      nombre: (v.attribute_combinations ?? []).filter(a => a.value_name).map(a => `${a.name}: ${a.value_name}`).join(' · ') || `variante ${v.id}`,
      // 10-11 (el dueño): manda la publicación (con o sin inventario); el stock del sistema confundía y frenaba de más.
      ml, sistema: sis, disponibles: ml,
    }
  })
}

/** Bloque de texto para la IA. */
export const textoVariantes = (vs: Variante[]) => vs.length
  ? `VARIANTES (disponibles = lo que se puede vender de cada una; confirma una variante solo si alcanza para lo que pide):\n`
    + vs.map(v => `- ${v.nombre} → disponibles: ${v.disponibles}`).join('\n')
  : ''
