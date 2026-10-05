import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { tieneModulo } from '@/lib/modulos'
import MensajesClient from '@/components/preguntas/MensajesClient'
import SinCuentaML from '@/components/automatizaciones/SinCuentaML'
import { sinCuentasML } from '@/lib/preguntasSesion'

export const metadata = { title: 'Mensajes' }

// Automatizaciones → Mensajes: conversaciones post-venta de MercadoLibre (módulo `preguntas`).
export default async function MensajesPage() {
  const session = await getServerSession(authOptions)
  if (!tieneModulo(session?.user, 'preguntas')) redirect('/automatizaciones')
  if (await sinCuentasML(session!)) {
    return <SinCuentaML esAdmin={session!.user.role === 'admin'} titulo="Mensajes" gancho="Todos los mensajes de tus compradores, de todas tus cuentas, en una sola bandeja."
      beneficios={['Cada conversación con el producto, el estado de la venta y lo que el comprador preguntó antes.',
        'Adjunta fotos o PDF (o pégalos con Ctrl+V) y deja notas en la venta para tu equipo.',
        'La IA te propone la respuesta; tú la revisas y la envías.']} />
  }
  return <MensajesClient />
}
