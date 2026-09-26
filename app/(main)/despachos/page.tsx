import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import DespachosClient from '@/components/despachos/DespachosClient'

export const metadata = { title: 'Despachos — Syncsora Inventory' }

export default async function DespachosPage() {
  const session = await getServerSession(authOptions)
  if (session!.user.country !== 'VE') {
    return <p className="text-sm text-neutral-500">Despachos solo está disponible en Venezuela.</p>
  }
  return <DespachosClient isAdmin={session!.user.role === 'admin'} />
}
