import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ReportesClient from '@/components/reportes/ReportesClient'
import { tieneModulo } from '@/lib/modulos'

export const metadata = { title: 'Reportes' }

export default async function ReportesPage() {
  const session = await getServerSession(authOptions)
  if (session?.user.role !== 'admin') redirect('/dashboard')
  return <ReportesClient analisisStock={tieneModulo(session.user, 'analisis_stock')} importaciones={tieneModulo(session.user, 'importaciones')} />
}
