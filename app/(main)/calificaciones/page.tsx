import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { tieneModulo } from '@/lib/modulos'
import CalificacionesClient from '@/components/preguntas/CalificacionesClient'

export const metadata = { title: 'Calificaciones' }

// Automatizaciones → Calificaciones (solo administradores, módulo `preguntas`).
export default async function CalificacionesPage() {
  const session = await getServerSession(authOptions)
  if (!tieneModulo(session?.user, 'preguntas') || session?.user.role !== 'admin') redirect('/automatizaciones')
  return <CalificacionesClient />
}
