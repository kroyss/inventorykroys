import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import FacturasClient from '@/components/facturas/FacturasClient'

export const metadata = { title: 'Facturas — Syncsora Inventory' }

export default async function FacturasPage() {
  const session = await getServerSession(authOptions)
  if (session!.user.country !== 'VE') {
    return <p className="text-sm text-neutral-500">Facturación solo está disponible en Venezuela.</p>
  }
  return <FacturasClient userRole={session!.user.role} />
}
