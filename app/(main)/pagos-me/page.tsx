import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { llevaInventario, tieneModulo } from '@/lib/modulos'
import PagosMEClient from '@/components/pagosme/PagosMEClient'
import SinCuentaML from '@/components/automatizaciones/SinCuentaML'
import { sinCuentasML } from '@/lib/preguntasSesion'
import { puede } from '@/lib/permisos'

export const metadata = { title: 'Pagos MercadoEnvíos' }

// Fuera del grupo (inventario) desde 2026-10-15: también lo usan las empresas sin inventario (Fundadores).
export default async function PagosMEPage() {
  const session = await getServerSession(authOptions)
  if (!tieneModulo(session?.user, 'pagos_me') || !puede(session?.user, 'ver_pagos_me') || session!.user.country !== 'VE') {
    redirect(llevaInventario(session?.user) ? '/dashboard' : '/automatizaciones')
  }
  // Como las demás Automatizaciones (26-10): hasta conectar una cuenta de ML, qué gana y el botón para conectar
  // (sin los pasos de instalación del programa: sin ML no trae nada). El video está en Aprendizaje.
  if (tieneModulo(session!.user, 'preguntas') && await sinCuentasML(session!)) {
    return <SinCuentaML esAdmin={puede(session!.user, 'ml_cuentas')} titulo="Pagos MercadoEnvíos"
      gancho="Los pagos y comprobantes de MercadoEnvíos traídos solos, listos para verificar contra el banco."
      beneficios={['Cada pago con su comprobante, referencia y banco, sin entrar al portal de MercadoEnvíos.',
        'Compáralos con el movimiento de tu banco en un clic y marca los que no coinciden.',
        'Las guías de las ventas pagadas pasan solas a Despachos.']} />
  }
  return <PagosMEClient isAdmin={puede(session!.user, 'pagos_me_config')} />
}
