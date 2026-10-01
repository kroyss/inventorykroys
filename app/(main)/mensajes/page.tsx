import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { tieneModulo } from '@/lib/modulos'
import MensajesClient from '@/components/preguntas/MensajesClient'

export const metadata = { title: 'Mensajes' }

// Automatizaciones → Mensajes: conversaciones post-venta de MercadoLibre (módulo `preguntas`).
export default async function MensajesPage() {
  const session = await getServerSession(authOptions)
  if (!tieneModulo(session?.user, 'preguntas')) redirect('/automatizaciones')
  return <MensajesClient />
}
