import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { tieneModulo } from '@/lib/modulos'
import PagosMEClient from '@/components/pagosme/PagosMEClient'
import { puede } from '@/lib/permisos'

export const metadata = { title: 'Pagos MercadoEnvíos' }

export default async function PagosMEPage() {
  const session = await getServerSession(authOptions)
  if (!tieneModulo(session?.user, 'pagos_me') || !puede(session?.user, 'ver_pagos_me') || session!.user.country !== 'VE') redirect('/dashboard')
  return <PagosMEClient isAdmin={puede(session!.user, 'pagos_me_config')} />
}
