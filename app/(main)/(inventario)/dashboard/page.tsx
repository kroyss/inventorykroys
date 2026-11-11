import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import DashboardAdmin from '@/components/dashboard/DashboardAdmin'
import DashboardUser  from '@/components/dashboard/DashboardUser'
import { tieneModulo } from '@/lib/modulos'
import { esDuenoPlataforma } from '@/lib/empresa'
import { puede } from '@/lib/permisos'
import { deApi } from '@/lib/inicial'
import { GET as resumen } from '@/app/api/dashboard/summary/route'
import { GET as grafico } from '@/app/api/reports/chart-data/route'
import type { Summary, ChartData } from '@/components/dashboard/DashboardAdmin'

export const metadata = { title: 'Inicio' }

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  const country = session!.user.country

  const bonos   = tieneModulo(session!.user, 'bonos')

  const importaciones = tieneModulo(session!.user, 'importaciones')
  // "Por confirmar" (ventas de ML sin registrar): con el módulo de las cuentas de ML y permiso de Ventas.
  const porConfirmar = tieneModulo(session!.user, 'preguntas') && puede(session!.user, 'ver_ventas')
  // Inicio completo (ventas, ganancia, bonos de todos) = permiso "Ver costos y ganancias".
  if (puede(session!.user, 'costos')) {
    // 12-11 (rapidez): el resumen y el gráfico del mes vienen dentro del HTML (mismos GET de la API, en paralelo).
    const [summary, chart] = await Promise.all([
      deApi<Summary>(resumen, '/api/dashboard/summary'),
      deApi<ChartData>(grafico, '/api/reports/chart-data?period=month'),
    ])
    return (
    <DashboardAdmin inicial={{ summary, chart }} country={country} bonos={bonos} puedeTasas={esDuenoPlataforma(session!.user)}
      descuento={tieneModulo(session!.user, 'descuento_ml')} importaciones={importaciones}
      analisisStock={tieneModulo(session!.user, 'analisis_stock')} etapas={tieneModulo(session!.user, 'compras_etapas')}
      categorias={tieneModulo(session!.user, 'precios_categorias')} porConfirmar={porConfirmar}
      metricas={tieneModulo(session!.user, 'metricas') && puede(session!.user, 'ver_reportes')} />
    )
  }
  return <DashboardUser country={country} bonos={bonos} importaciones={importaciones}
    verificarPagos={country !== 'VE' || tieneModulo(session!.user, 'verificar_pagos')} etapas={tieneModulo(session!.user, 'compras_etapas')}
    porConfirmar={porConfirmar} despachos={tieneModulo(session!.user, 'despachos') && puede(session!.user, 'ver_despachos')} />
}
