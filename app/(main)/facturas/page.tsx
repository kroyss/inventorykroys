import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import FacturasClient from '@/components/facturas/FacturasClient'
import { redirect } from 'next/navigation'
import { tieneModulo } from '@/lib/modulos'

export const metadata = { title: 'Facturas' }

export default async function FacturasPage() {
  const session = await getServerSession(authOptions)
  if (!tieneModulo(session?.user, 'facturas')) redirect('/dashboard')
  if (session!.user.country !== 'VE') {
    return <p className="text-sm text-neutral-500">Facturación solo está disponible en Venezuela.</p>
  }
  return <FacturasClient userRole={session!.user.role} />
}
