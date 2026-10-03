import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import DespachosClient from '@/components/despachos/DespachosClient'
import NegocioSettings from '@/components/tasas/NegocioSettings'
import { redirect } from 'next/navigation'
import { llevaInventario, tieneModulo } from '@/lib/modulos'

export const metadata = { title: 'Despachos' }

export default async function DespachosPage() {
  const session = await getServerSession(authOptions)
  if (!tieneModulo(session?.user, 'despachos')) redirect('/dashboard')
  if (session!.user.country !== 'VE') {
    return <p className="text-sm text-neutral-500">Despachos solo está disponible en Venezuela.</p>
  }
  const isAdmin = session!.user.role === 'admin'
  const desdeML = !llevaInventario(session!.user)
  return (
    <div className="space-y-6">
      <DespachosClient isAdmin={isAdmin} reportador={tieneModulo(session!.user, 'reportador')} desdeML={desdeML} />
      {/* Sin inventario no hay Ajustes: el remitente del manifiesto se cambia aquí. */}
      {isAdmin && desdeML && <NegocioSettings conDespachos soloRemitente />}
    </div>
  )
}
