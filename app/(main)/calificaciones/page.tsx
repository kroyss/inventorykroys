import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { tieneModulo } from '@/lib/modulos'
import CalificacionesClient from '@/components/preguntas/CalificacionesClient'
import ReputacionClient from '@/components/preguntas/ReputacionClient'
import VistasCalificaciones from '@/components/preguntas/VistasCalificaciones'
import SinCuentaML from '@/components/automatizaciones/SinCuentaML'
import { sinCuentasML } from '@/lib/preguntasSesion'
import { puede } from '@/lib/permisos'

export const metadata = { title: 'Calificaciones' }

// Automatizaciones → Calificaciones (módulo `preguntas`), con dos vistas:
//   - Calificar ventas (por defecto): las que calificamos nosotros, en bloque. Los textos los edita el admin.
//   - Me calificaron (?ver=recibidas): la Reputación (lib/reputacionML.ts), lo que nos dieron los compradores.
export default async function CalificacionesPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const session = await getServerSession(authOptions)
  if (!tieneModulo(session?.user, 'preguntas') || !puede(session?.user, 'ver_calificaciones')) redirect('/automatizaciones')
  if (await sinCuentasML(session!)) {
    return <SinCuentaML esAdmin={puede(session!.user, 'ml_cuentas')} titulo="Calificaciones" gancho="Califica todas tus ventas en bloque y entérate apenas te dejan una neutral o una negativa."
      beneficios={['El sistema sugiere concretada o no concretada para cada venta, y calificas todas de una vez.',
        'Tu termómetro de MercadoLibre, con aviso en rojo por cada negativa y en naranja por cada neutral.',
        'Los 30 días que tienes para pedirle al comprador que la cambie, contados para cada una.']} />
  }
  const recibidas = (await searchParams).ver === 'recibidas'
  return (
    <div className="space-y-3">
      <VistasCalificaciones recibidas={recibidas} />
      {recibidas ? <ReputacionClient /> : <CalificacionesClient isAdmin={puede(session!.user, 'automatizaciones_config')} />}
    </div>
  )
}
