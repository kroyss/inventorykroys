import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { esDuenoPlataforma } from '@/lib/empresa'
import { forbidden, unauthorized } from '@/lib/session'

/** Guardia de las rutas de Plataforma: solo el dueño de la plataforma. */
export async function soloDueno() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.empresaId) return { error: unauthorized() }
  if (!esDuenoPlataforma(session.user)) return { error: forbidden() }
  return { session }
}
