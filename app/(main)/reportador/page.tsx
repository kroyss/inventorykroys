import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { tieneModulo } from '@/lib/modulos'
import { PageHeader } from '@/components/ui'
import GuiasTealca from '@/components/despachos/GuiasTealca'
import ReportadorPanel from '@/components/despachos/ReportadorPanel'
import ReportadorApi from '@/components/despachos/ReportadorApi'
import ReportadorVistas from '@/components/despachos/ReportadorVistas'
import SinCuentaML from '@/components/automatizaciones/SinCuentaML'
import { sinCuentasML } from '@/lib/preguntasSesion'
import { puede } from '@/lib/permisos'
import { ORGANIZACION_PLATAFORMA } from '@/lib/empresa'
import { deApi } from '@/lib/inicial'
import { GET as apartados } from '@/app/api/despachos/apartados/route'
import { GET as estadoApi } from '@/app/api/despachos/reportador/api/route'
import { GET as tealca } from '@/app/api/despachos/tealca/route'
import { GET as reportador } from '@/app/api/despachos/reportador/route'

export const metadata = { title: 'Reportador' }

// Automatizaciones → Reportador: le escribe a cada comprador su guía. Pestañas: Reportar
// (por API, guías Tealca, mensajes y el programa de escritorio de respaldo) e Historial
// (?vista=historial&jornada=ID, al que se llega desde Despachos → Jornadas cerradas).
export default async function ReportadorPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await getServerSession(authOptions)
  if (!tieneModulo(session?.user, 'reportador') || !tieneModulo(session?.user, 'despachos')) redirect('/automatizaciones')
  if (session!.user.country !== 'VE' || !puede(session!.user, 'ver_reportador')) redirect('/automatizaciones')
  // isAdmin = "Configurar automatizaciones" (lib/permisos.ts)
  const isAdmin = puede(session!.user, 'automatizaciones_config')
  // Programa de escritorio (respaldo de la API): solo el equipo de la plataforma; los clientes reportan por API.
  const conEscritorio = session!.user.organizacionId === ORGANIZACION_PLATAFORMA
  if (await sinCuentasML(session!)) {
    return <SinCuentaML esAdmin={puede(session!.user, 'ml_cuentas')} titulo="Reportador" gancho="Le escribe a cada comprador su número de guía, sin copiar y pegar."
      beneficios={['Toma las guías de tus despachos y le manda a cada comprador su mensaje en MercadoLibre.',
        'Tus propias plantillas de mensaje, por cuenta.',
        'Corre en segundo plano: puedes cerrar la pantalla, y queda el historial de lo enviado.']} />
  }
  const sp = await searchParams
  const jornada = /^\d+$/.test(sp.jornada ?? '') ? Number(sp.jornada) : null
  // 12-11 (rapidez): la primera carga de cada sección viene en el HTML (mismos GET de la API).
  const [espera, iApi, iTealca, iPanel] = await Promise.all([
    deApi<{ espera: never[] }>(apartados, '/api/despachos/apartados'),
    deApi(() => estadoApi(), '/api/despachos/reportador/api'),
    deApi(() => tealca(), '/api/despachos/tealca'),
    deApi(() => reportador(), '/api/despachos/reportador'),
  ])
  return (
    <div className="space-y-4">
      <PageHeader title="Reportador" subtitle="Le escribe a cada comprador su número de guía en MercadoLibre." />
      <ReportadorVistas esperaInicial={espera?.espera ?? null} vistaInicial={sp.vista === 'historial' || jornada ? 'historial' : 'reportar'} jornadaInicial={jornada}
        reportar={<>
          <ReportadorApi inicial={iApi} conEscritorio={conEscritorio} />
          <GuiasTealca inicial={iTealca} isAdmin={isAdmin} />
          <ReportadorPanel inicial={iPanel} isAdmin={isAdmin} conEscritorio={conEscritorio} />
        </>} />
    </div>
  )
}
