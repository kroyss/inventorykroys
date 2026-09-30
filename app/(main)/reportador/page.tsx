import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { tieneModulo } from '@/lib/modulos'
import { PageHeader } from '@/components/ui'
import GuiasTealca from '@/components/despachos/GuiasTealca'
import ReportadorPanel from '@/components/despachos/ReportadorPanel'
import ReportadorApi from '@/components/despachos/ReportadorApi'

export const metadata = { title: 'Reportador' }

// Automatizaciones → Reportador: le escribe a cada comprador su guía. Antes vivía dentro
// de Despachos; ahora tiene su página (guías finales de Tealca + equipos y mensajes).
export default async function ReportadorPage() {
  const session = await getServerSession(authOptions)
  if (!tieneModulo(session?.user, 'reportador') || !tieneModulo(session?.user, 'despachos')) redirect('/automatizaciones')
  if (session!.user.country !== 'VE') redirect('/automatizaciones')
  const isAdmin = session!.user.role === 'admin'
  return (
    <div className="space-y-5">
      <PageHeader title="Reportador" subtitle="Le escribe a cada comprador su número de guía en MercadoLibre." />
      <ReportadorApi />
      <GuiasTealca isAdmin={isAdmin} />
      <ReportadorPanel isAdmin={isAdmin} />
    </div>
  )
}
