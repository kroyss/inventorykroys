import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import DespachosHistorial from '@/components/despachos/DespachosHistorial'

export const metadata = { title: 'Historial de despachos — Syncsora Inventory' }

export default async function DespachosHistorialPage() {
  const session = await getServerSession(authOptions)
  if (session!.user.country !== 'VE') {
    return <p className="text-sm text-neutral-500">Despachos solo está disponible en Venezuela.</p>
  }
  return <DespachosHistorial />
}
