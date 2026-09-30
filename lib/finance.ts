import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { dbEmpresa } from '@/lib/db'
import { empresaHermana } from '@/lib/empresa'
import type { FinanceDbs } from '@/lib/financeData'

// Finanzas es de la ORGANIZACIÓN, no de un país: sus cuentas y movimientos viven en la
// empresa VE de la organización (la "maestra", como antes la DB de VE) y suma la
// operación de la empresa CO hermana. Se entra desde cualquiera de las dos.
// Devuelve la sesión (para validar admin), `db` = la empresa maestra y `dbs` = VE + CO.
export async function getFinanceSession() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.empresaId) return { session: null, db: null, dbs: null }
  const [ve, co] = await Promise.all([
    empresaHermana(session.user.empresaId, 'VE'),
    empresaHermana(session.user.empresaId, 'CO'),
  ])
  if (!ve) return { session, db: null, dbs: null }
  const dbs: FinanceDbs = { ve: dbEmpresa(ve.id, 'VE'), co: co ? dbEmpresa(co.id, 'CO') : null }
  return { session, db: dbs.ve, dbs }
}
