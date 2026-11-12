import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import FacturasClient from '@/components/facturas/FacturasClient'
import { redirect } from 'next/navigation'
import { tieneModulo } from '@/lib/modulos'
import { puede } from '@/lib/permisos'
import { deApi } from '@/lib/inicial'
import { GET as facturas } from '@/app/api/invoices/route'
import { GET as borradores } from '@/app/api/invoices/drafts/route'

export const metadata = { title: 'Facturas' }

export default async function FacturasPage() {
  const session = await getServerSession(authOptions)
  if (!tieneModulo(session?.user, 'facturas') || !puede(session?.user, 'ver_facturas')) redirect('/dashboard')
  if (session!.user.country !== 'VE') {
    return <p className="text-sm text-neutral-500">Facturación solo está disponible en Venezuela.</p>
  }
  // 12-11 (rapidez): la lista y los borradores vienen en el HTML (mismos GET de la API).
  const [f, b] = await Promise.all([deApi(facturas, '/api/invoices?'), deApi(borradores, '/api/invoices/drafts')])
  return <FacturasClient userRole={session!.user.role} inicial={{ facturas: f, borradores: b }} />
}
