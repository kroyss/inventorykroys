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
