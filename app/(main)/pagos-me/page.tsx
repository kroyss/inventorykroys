import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { llevaInventario, tieneModulo, ventasDesdeML } from '@/lib/modulos'
import PagosMEClient from '@/components/pagosme/PagosMEClient'
import { deApi } from '@/lib/inicial'
import { GET as pagosME } from '@/app/api/pagos-me/route'
import SinCuentaML from '@/components/automatizaciones/SinCuentaML'
import { sinCuentasML } from '@/lib/preguntasSesion'
import { puede, listaPagosEnVentas } from '@/lib/permisos'

export const metadata = { title: 'Pagos MercadoEnvíos' }

// Fuera del grupo (inventario) desde 2026-10-15: también lo usan las empresas sin inventario (Fundadores).
export default async function PagosMEPage({ searchParams }: { searchParams: Promise<{ vista?: string }> }) {
  const session = await getServerSession(authOptions)
  // /pagos-me?vista=confirmar (enlace de Novedades, 07-11): el comprobador del banco está aquí si trabaja todo desde ML,
  // y en Ventas → Por confirmar si lleva inventario.
  const vista = (await searchParams).vista
  if (vista === 'confirmar' && session && !ventasDesdeML(session.user)) redirect('/ventas?vista=confirmar')
  if (!tieneModulo(session?.user, 'pagos_me') || !puede(session?.user, 'ver_pagos_me') || session!.user.country !== 'VE') {
    redirect(llevaInventario(session?.user) ? '/dashboard' : '/automatizaciones')
  }
  // 18-11: con inventario y Ventas, la lista está en Ventas → Por confirmar; aquí queda la conexión y el historial
  // (?vista=conexion, desde el menú de la cuenta y ⚙ Conexión). Enlaces viejos a /pagos-me llevan a la lista.
  const conexion = listaPagosEnVentas(session!.user)
  if (conexion && vista !== 'conexion' && vista !== 'historial') redirect('/ventas?vista=confirmar')
  // Como las demás Automatizaciones (26-10): hasta conectar una cuenta de ML, qué gana y el botón para conectar
  // (sin los pasos de instalación del programa: sin ML no trae nada). El video está en Aprendizaje.
  if (tieneModulo(session!.user, 'preguntas') && await sinCuentasML(session!)) {
    return <SinCuentaML esAdmin={puede(session!.user, 'ml_cuentas')} titulo="Pagos MercadoEnvíos"
      gancho="Los pagos y comprobantes de MercadoEnvíos traídos solos, listos para verificar contra el banco."
      beneficios={['Cada pago con su comprobante, referencia y banco, sin entrar al portal de MercadoEnvíos.',
        'Compáralos con el movimiento de tu banco en un clic y marca los que no coinciden.',
        'Las guías de las ventas pagadas pasan solas a Despachos.']} />
  }
  // 12-11 (rapidez): la primera carga viene en el HTML (mismo GET de la API).
  // 21-11: con inventario, «Registrar venta» abre aquí el formulario de Ventas (quien tiene permiso de Ventas).
  const u = session!.user
  return <PagosMEClient inicial={await deApi(pagosME, '/api/pagos-me?estado=pendiente')} isAdmin={puede(u, 'pagos_me_config')} conexion={conexion}
    registrar={llevaInventario(u) && puede(u, 'ver_ventas') ? { country: u.country, procesaDirecto: u.country === 'VE' && !tieneModulo(u, 'verificar_pagos') } : null} />
}
