import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { tieneModulo } from '@/lib/modulos'
import CuentasMLClient from '@/components/preguntas/CuentasMLClient'

export const metadata = { title: 'Cuentas de MercadoLibre' }

// Automatizaciones → Cuentas de MercadoLibre (se llega desde el botón del encabezado de Automatizaciones).
export default async function CuentasMLPage() {
  const session = await getServerSession(authOptions)
  if (!tieneModulo(session?.user, 'preguntas')) redirect('/automatizaciones')
  return <CuentasMLClient />
}
