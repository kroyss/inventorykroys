import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { tieneModulo } from '@/lib/modulos'
import CalificacionesClient from '@/components/preguntas/CalificacionesClient'

export const metadata = { title: 'Calificaciones' }

// Automatizaciones → Calificaciones (módulo `preguntas`). Califican todos; los textos los edita el admin.
export default async function CalificacionesPage() {
  const session = await getServerSession(authOptions)
  if (!tieneModulo(session?.user, 'preguntas')) redirect('/automatizaciones')
  return <CalificacionesClient isAdmin={session?.user.role === 'admin'} />
}
