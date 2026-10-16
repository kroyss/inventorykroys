// Sesión para Promociones (migración 094): módulo prendido, Venezuela, con inventario y el permiso.
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { tieneModulo } from '@/lib/modulos'
import { puede } from '@/lib/permisos'

export async function sesionPromociones() {
  const { session, db } = await getSessionDb()
  if (!session || !db) return { error: unauthorized() } as const
  const u = session.user
  if (u.country !== 'VE' || !tieneModulo(u, 'promociones') || !tieneModulo(u, 'inventario')
    || !puede(u, 'ver_productos') || !puede(u, 'promociones')) return { error: forbidden() } as const
  return { session, db, userId: parseInt(u.id, 10) } as const
}
