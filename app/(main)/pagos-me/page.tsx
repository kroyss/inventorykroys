import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { llevaInventario, tieneModulo } from '@/lib/modulos'
import PagosMEClient from '@/components/pagosme/PagosMEClient'
import { puede } from '@/lib/permisos'

export const metadata = { title: 'Pagos MercadoEnvíos' }

// Fuera del grupo (inventario) desde 2026-10-15: también lo usan las empresas sin inventario (Fundadores).
export default async function PagosMEPage() {
  const session = await getServerSession(authOptions)
  if (!tieneModulo(session?.user, 'pagos_me') || !puede(session?.user, 'ver_pagos_me') || session!.user.country !== 'VE') {
    redirect(llevaInventario(session?.user) ? '/dashboard' : '/automatizaciones')
  }
  return <PagosMEClient isAdmin={puede(session!.user, 'pagos_me_config')} />
}
