import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { tieneModulo } from '@/lib/modulos'
import { PageHeader } from '@/components/ui'
import GuiasTealca from '@/components/despachos/GuiasTealca'
import ReportadorPanel from '@/components/despachos/ReportadorPanel'
import ReportadorApi from '@/components/despachos/ReportadorApi'
import ReportadorVistas from '@/components/despachos/ReportadorVistas'

export const metadata = { title: 'Reportador' }

// Automatizaciones → Reportador: le escribe a cada comprador su guía. Pestañas: Reportar
// (por API, guías Tealca, mensajes y el programa de escritorio de respaldo) e Historial
// (?vista=historial&jornada=ID, al que se llega desde Despachos → Jornadas cerradas).
export default async function ReportadorPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await getServerSession(authOptions)
  if (!tieneModulo(session?.user, 'reportador') || !tieneModulo(session?.user, 'despachos')) redirect('/automatizaciones')
  if (session!.user.country !== 'VE') redirect('/automatizaciones')
  const isAdmin = session!.user.role === 'admin'
  const sp = await searchParams
  const jornada = /^\d+$/.test(sp.jornada ?? '') ? Number(sp.jornada) : null
  return (
    <div className="space-y-4">
      <PageHeader title="Reportador" subtitle="Le escribe a cada comprador su número de guía en MercadoLibre." />
      <ReportadorVistas vistaInicial={sp.vista === 'historial' || jornada ? 'historial' : 'reportar'} jornadaInicial={jornada}
        reportar={<>
          <ReportadorApi />
          <GuiasTealca isAdmin={isAdmin} />
          <ReportadorPanel isAdmin={isAdmin} />
        </>} />
    </div>
  )
}
