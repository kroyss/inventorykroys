import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import FinanzasClient from '@/components/finanzas/FinanzasClient'
import { tieneModulo } from '@/lib/modulos'
import { puede } from '@/lib/permisos'
import { deApi } from '@/lib/inicial'
import { currentYearMonth, COUNTRY_TZ } from '@/lib/tz'
import { GET as cuentas } from '@/app/api/finance/accounts/route'
import { GET as categorias } from '@/app/api/finance/categories/route'
import { GET as movimientos } from '@/app/api/finance/movements/route'
import { GET as cierre } from '@/app/api/finance/summary/route'
import { GET as capital } from '@/app/api/finance/capital/route'

export const metadata = { title: 'Finanzas' }

export default async function FinanzasPage() {
  // Módulo global: solo admin. Disponible desde cualquier país (VE o CO).
  const session = await getServerSession(authOptions)
  if (!session || !puede(session.user, 'ver_finanzas') || !tieneModulo(session.user, 'finanzas')) {
    redirect('/dashboard')
  }
  // 12-11 (rapidez): los 5 pedidos de la primera carga vienen en el HTML (mismos GET de la API).
  const month = currentYearMonth(COUNTRY_TZ[session.user.country as keyof typeof COUNTRY_TZ])
  const [accounts, categories, movements, summary, cap] = await Promise.all([
    deApi(cuentas, '/api/finance/accounts'), deApi(categorias, '/api/finance/categories'),
    deApi(movimientos, `/api/finance/movements?month=${month}`), deApi(cierre, `/api/finance/summary?month=${month}`),
    deApi(capital, '/api/finance/capital'),
  ])
  return <FinanzasClient inicial={{ month, accounts, categories, movements, summary, capital: cap }} />
}
