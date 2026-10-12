import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { tieneModulo } from '@/lib/modulos'
import CalificacionesClient from '@/components/preguntas/CalificacionesClient'
import SinCuentaML from '@/components/automatizaciones/SinCuentaML'
import { sinCuentasML } from '@/lib/preguntasSesion'
import { puede } from '@/lib/permisos'

export const metadata = { title: 'Calificaciones' }

// Automatizaciones → Calificaciones (módulo `preguntas`). Califican todos; los textos los edita el admin.
export default async function CalificacionesPage() {
  const session = await getServerSession(authOptions)
  if (!tieneModulo(session?.user, 'preguntas') || !puede(session?.user, 'ver_calificaciones')) redirect('/automatizaciones')
  if (await sinCuentasML(session!)) {
    return <SinCuentaML esAdmin={puede(session!.user, 'ml_cuentas')} titulo="Calificaciones" gancho="Califica todas tus ventas en bloque, en vez de una por una."
      beneficios={['El sistema sugiere concretada o no concretada para cada venta.',
        'Revisas, cambias la que haga falta y calificas todas de una vez.',
        'Tus textos de calificación guardados y días de espera configurables.']} />
  }
  return <CalificacionesClient isAdmin={puede(session!.user, 'automatizaciones_config')} />
}
