import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import FinanzasClient from '@/components/finanzas/FinanzasClient'

export const metadata = { title: 'Finanzas — Syncsora Inventory' }

export default async function FinanzasPage() {
  // Módulo global: solo admin. Disponible desde cualquier país (VE o CO).
  const session = await getServerSession(authOptions)
  if (session?.user.role !== 'admin') {
    redirect('/dashboard')
  }
  return <FinanzasClient />
}
