import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import DashboardAdmin from '@/components/dashboard/DashboardAdmin'
import DashboardUser  from '@/components/dashboard/DashboardUser'
import { tieneModulo } from '@/lib/modulos'
import { esDuenoPlataforma } from '@/lib/empresa'
import { puede } from '@/lib/permisos'

export const metadata = { title: 'Inicio' }

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  const country = session!.user.country

  const bonos   = tieneModulo(session!.user, 'bonos')

  const importaciones = tieneModulo(session!.user, 'importaciones')
  // "Por confirmar" (ventas de ML sin registrar): con el módulo de las cuentas de ML y permiso de Ventas.
  const porConfirmar = tieneModulo(session!.user, 'preguntas') && puede(session!.user, 'ver_ventas')
  // Inicio completo (ventas, ganancia, bonos de todos) = permiso "Ver costos y ganancias".
  if (puede(session!.user, 'costos')) return (
    <DashboardAdmin country={country} bonos={bonos} puedeTasas={esDuenoPlataforma(session!.user)}
      descuento={tieneModulo(session!.user, 'descuento_ml')} importaciones={importaciones}
      analisisStock={tieneModulo(session!.user, 'analisis_stock')} etapas={tieneModulo(session!.user, 'compras_etapas')}
      categorias={tieneModulo(session!.user, 'precios_categorias')} porConfirmar={porConfirmar} />
  )
  return <DashboardUser country={country} bonos={bonos} importaciones={importaciones}
    verificarPagos={country !== 'VE' || tieneModulo(session!.user, 'verificar_pagos')} etapas={tieneModulo(session!.user, 'compras_etapas')}
    porConfirmar={porConfirmar} despachos={tieneModulo(session!.user, 'despachos') && puede(session!.user, 'ver_despachos')} />
}
