import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { tieneModulo } from '@/lib/modulos'
import { puede } from '@/lib/permisos'
import { sinCuentasML } from '@/lib/preguntasSesion'
import SinCuentaML from '@/components/automatizaciones/SinCuentaML'
import ReputacionClient from '@/components/preguntas/ReputacionClient'

export const metadata = { title: 'Reputación' }

export default async function ReputacionPage() {
  const session = await getServerSession(authOptions)
  if (!tieneModulo(session?.user, 'preguntas') || !puede(session?.user, 'ver_reputacion')) redirect('/automatizaciones')
  if (await sinCuentasML(session!)) {
    return <SinCuentaML esAdmin={puede(session!.user, 'ml_cuentas')} titulo="Reputación"
      gancho="Tu termómetro de MercadoLibre y un aviso apenas alguien te deja una neutral o una negativa."
      beneficios={['El color y el nivel de cada cuenta, como lo ves en MercadoLibre.',
        'Aviso en rojo por cada negativa y en naranja por cada neutral nueva.',
        'Los 30 días que tienes para pedirle al comprador que la cambie, contados para cada una.']} />
  }
  return <ReputacionClient />
}
