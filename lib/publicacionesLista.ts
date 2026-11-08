import type { Pool } from 'pg'

// Filtro de la lista de Publicaciones (ml_catalogo de las cuentas conectadas): lo usan la lista y las acciones en
// lote («todas las de esta búsqueda»).
export interface FiltroPublicaciones { q?: string; cuenta?: number | null; estado?: string | null }

export function whereFiltro(f: FiltroPublicaciones) {
  const where = [`k.estado = 'activa'`]
  const args: unknown[] = []
  const q = (f.q ?? '').trim().slice(0, 100)
  if (q) {
    const numero = q.replace(/[^0-9]/g, '')
    args.push(numero.length >= 6 ? numero : '-', `%${q}%`)
    const a = args.length
    where.push(`(regexp_replace(m.item_id, '[^0-9]', '', 'g') = $${a - 1} OR m.titulo ILIKE $${a} OR m.sku ILIKE $${a})`)
  }
  if (f.cuenta) { args.push(f.cuenta); where.push(`m.conexion_id = $${args.length}`) }
  if (f.estado === 'active' || f.estado === 'paused') { args.push(f.estado); where.push(`m.estado = $${args.length}`) }
  return { sql: `FROM ml_catalogo m JOIN ml_conexiones k ON k.id = m.conexion_id WHERE ${where.join(' AND ')}`, args }
}

export const MAX_SELECCION = 3000

/** Las publicaciones elegidas: una lista de ids o «todas las de esta búsqueda» (hasta MAX_SELECCION). */
export async function seleccion(db: Pool, s: { items?: string[]; filtro?: FiltroPublicaciones }) {
  if (s.items?.length) {
    const { rows } = await db.query(
      `SELECT m.item_id, m.titulo, m.precio::float AS precio, m.moneda, m.conexion_id, k.nickname AS cuenta, m.estado
       FROM ml_catalogo m JOIN ml_conexiones k ON k.id = m.conexion_id
       WHERE k.estado = 'activa' AND m.item_id = ANY($1::text[]) ORDER BY m.titulo`, [s.items.slice(0, MAX_SELECCION)])
    return rows
  }
  const w = whereFiltro(s.filtro ?? {})
  const { rows } = await db.query(
    `SELECT m.item_id, m.titulo, m.precio::float AS precio, m.moneda, m.conexion_id, k.nickname AS cuenta, m.estado
     ${w.sql} ORDER BY m.titulo LIMIT ${MAX_SELECCION}`, w.args)
  return rows
}
