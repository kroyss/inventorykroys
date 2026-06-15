import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ReportesClient from '@/components/reportes/ReportesClient'

export const metadata = { title: 'Reportes — Syncsora Inventory' }

export default async function ReportesPage() {
  const session = await getServerSession(authOptions)
  if (session?.user.role !== 'admin') redirect('/dashboard')
  return <ReportesClient />
}
