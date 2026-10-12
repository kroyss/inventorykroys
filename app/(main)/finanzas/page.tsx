import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import FinanzasClient from '@/components/finanzas/FinanzasClient'
import { tieneModulo } from '@/lib/modulos'
import { puede } from '@/lib/permisos'

export const metadata = { title: 'Finanzas' }

export default async function FinanzasPage() {
  // Módulo global: solo admin. Disponible desde cualquier país (VE o CO).
  const session = await getServerSession(authOptions)
  if (!session || !puede(session.user, 'ver_finanzas') || !tieneModulo(session.user, 'finanzas')) {
    redirect('/dashboard')
  }
  return <FinanzasClient />
}
