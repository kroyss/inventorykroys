import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import DashboardAdmin from '@/components/dashboard/DashboardAdmin'
import DashboardUser  from '@/components/dashboard/DashboardUser'
import { tieneModulo } from '@/lib/modulos'
import { esDuenoPlataforma } from '@/lib/empresa'

export const metadata = { title: 'Inicio' }

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  const role    = session!.user.role
  const country = session!.user.country

  const bonos   = tieneModulo(session!.user, 'bonos')

  const importaciones = tieneModulo(session!.user, 'importaciones')
  if (role === 'admin') return (
    <DashboardAdmin country={country} bonos={bonos} puedeTasas={esDuenoPlataforma(session!.user)}
      descuento={tieneModulo(session!.user, 'descuento_ml')} importaciones={importaciones}
      analisisStock={tieneModulo(session!.user, 'analisis_stock')} />
  )
  return <DashboardUser country={country} bonos={bonos} importaciones={importaciones} />
}
