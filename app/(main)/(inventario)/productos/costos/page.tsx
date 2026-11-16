import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { puede } from '@/lib/permisos'
import CompletarCostosClient from '@/components/productos/CompletarCostosClient'

export const metadata = { title: 'Completar costos' }

// Mig 180 (16-11-2026): productos importados con costo estimado → poner el real (las ventas se corrigen solas).
export default async function CompletarCostosPage() {
  const session = await getServerSession(authOptions)
  if (!session || !puede(session.user, 'ver_productos') || !puede(session.user, 'costos')) redirect('/dashboard')
  return <CompletarCostosClient />
}
