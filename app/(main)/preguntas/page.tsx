import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { tieneModulo } from '@/lib/modulos'
import PreguntasClient from '@/components/preguntas/PreguntasClient'

export const metadata = { title: 'Preguntas' }

// Automatizaciones → Preguntas: bandeja unificada de las preguntas de todas las cuentas de
// MercadoLibre de la empresa, con borrador de la IA que una persona revisa y publica.
export default async function PreguntasPage() {
  const session = await getServerSession(authOptions)
  if (!tieneModulo(session?.user, 'preguntas')) redirect('/automatizaciones')
  return <PreguntasClient isAdmin={session!.user.role === 'admin'} />
}
