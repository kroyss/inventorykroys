import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { tieneModulo } from '@/lib/modulos'
import PreguntasClient from '@/components/preguntas/PreguntasClient'
import SinCuentaML from '@/components/automatizaciones/SinCuentaML'
import { sinCuentasML } from '@/lib/preguntasSesion'

export const metadata = { title: 'Preguntas' }

// Automatizaciones → Preguntas: bandeja unificada de las preguntas de todas las cuentas de
// MercadoLibre de la empresa, con borrador de la IA que una persona revisa y publica.
export default async function PreguntasPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await getServerSession(authOptions)
  if (!tieneModulo(session?.user, 'preguntas')) redirect('/automatizaciones')
  if (await sinCuentasML(session!)) {
    const { ml_error } = await searchParams
    return <SinCuentaML esAdmin={session!.user.role === 'admin'} error={ml_error ?? null} titulo="Preguntas"
      gancho="Todas las preguntas de tus cuentas de MercadoLibre en una bandeja, con respuesta sugerida por IA."
      beneficios={['Las preguntas de todas tus cuentas en un solo lugar, con el stock y el producto a la vista.',
        'La IA te propone cada respuesta con tus políticas; tú la revisas y la publicas.',
        'Respuestas rápidas y tus respuestas anteriores a preguntas parecidas, gratis y a un clic.']} />
  }
  return <PreguntasClient isAdmin={session!.user.role === 'admin'} />
}
