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
import PrimerosPasos from '@/components/dashboard/PrimerosPasos'

export const metadata = { title: 'Inicio' }

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  const country = session!.user.country

  // 14-11: el bono se ve con el módulo Y el permiso «Ver el bono» (cada empleado por separado; el admin siempre).
  const bonos   = tieneModulo(session!.user, 'bonos') && puede(session!.user, 'ver_bono')
  const reportes = puede(session!.user, 'ver_reportes')
  const analisisStock = tieneModulo(session!.user, 'analisis_stock')

  const importaciones = tieneModulo(session!.user, 'importaciones')
  // "Por confirmar" (ventas de ML sin registrar): con el módulo de las cuentas de ML y permiso de Ventas.
  const porConfirmar = tieneModulo(session!.user, 'preguntas') && puede(session!.user, 'ver_ventas')
  // 14-11: guía «Primeros pasos con tu inventario» (se marca sola; reemplaza la sugerencia de empezar desde ML del 13-11).
  const sugerencia = puede(session!.user, 'ver_productos') ? <PrimerosPasos /> : null
  // Inicio completo (ventas, ganancia, bonos de todos) = permiso "Ver costos y ganancias".
  if (puede(session!.user, 'costos')) {
    // 12-11 (rapidez): el resumen y el gráfico del mes vienen dentro del HTML (mismos GET de la API, en paralelo).
    const [summary, chart] = await Promise.all([
      deApi<Summary>(resumen, '/api/dashboard/summary'),
      deApi<ChartData>(grafico, '/api/reports/chart-data?period=month'),
    ])
    return (<div className="space-y-4">{sugerencia}
    <DashboardAdmin inicial={{ summary, chart }} country={country} bonos={bonos} puedeTasas={esDuenoPlataforma(session!.user)}
      descuento={tieneModulo(session!.user, 'descuento_ml')} importaciones={importaciones}
      analisisStock={analisisStock} etapas={tieneModulo(session!.user, 'compras_etapas')}
      categorias={tieneModulo(session!.user, 'precios_categorias')} porConfirmar={porConfirmar}
      reportes={reportes} />
    </div>)
  }
  return <div className="space-y-4">{sugerencia}<DashboardUser country={country} bonos={bonos} importaciones={importaciones}
    verificarPagos={country !== 'VE' || tieneModulo(session!.user, 'verificar_pagos')} etapas={tieneModulo(session!.user, 'compras_etapas')}
    porConfirmar={porConfirmar} despachos={tieneModulo(session!.user, 'despachos') && puede(session!.user, 'ver_despachos')}
    reportes={reportes} cayendo={reportes && analisisStock} /></div>
}
