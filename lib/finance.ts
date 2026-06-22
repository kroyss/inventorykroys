import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/db'

// El módulo de Finanzas es GLOBAL: vive en la DB maestra (VE), no en la del
// país de la sesión. Devuelve la sesión (para validar admin) y el pool de VE.
export async function getFinanceSession() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return { session: null, db: null }
  return { session, db: getDb('VE') }
}
