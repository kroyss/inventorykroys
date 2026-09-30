import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import DespachosClient from '@/components/despachos/DespachosClient'
import { redirect } from 'next/navigation'
import { tieneModulo } from '@/lib/modulos'

export const metadata = { title: 'Despachos — Syncsora Inventory' }

export default async function DespachosPage() {
  const session = await getServerSession(authOptions)
  if (!tieneModulo(session?.user, 'despachos')) redirect('/dashboard')
  if (session!.user.country !== 'VE') {
    return <p className="text-sm text-neutral-500">Despachos solo está disponible en Venezuela.</p>
  }
  return <DespachosClient isAdmin={session!.user.role === 'admin'} reportador={tieneModulo(session!.user, 'reportador')} />
}
