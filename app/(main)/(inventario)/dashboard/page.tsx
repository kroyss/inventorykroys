import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import DashboardAdmin from '@/components/dashboard/DashboardAdmin'
import DashboardUser  from '@/components/dashboard/DashboardUser'
import { tieneModulo } from '@/lib/modulos'
import { esDuenoPlataforma } from '@/lib/empresa'
import { puede, rutaPermitida } from '@/lib/permisos'
import { deApi } from '@/lib/inicial'
import { GET as resumen } from '@/app/api/dashboard/summary/route'
import { GET as grafico } from '@/app/api/reports/chart-data/route'
import type { Summary, ChartData } from '@/components/dashboard/DashboardAdmin'
import type { AccionesInicioConfig } from '@/components/dashboard/AccionesInicio'
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
  // 20-11 (el dueño: «uniformar»): el bloque de arriba (Ventas · Compras · Inventario + tasa) es el mismo para todos;
  // qué muestra lo deciden los módulos de la empresa y los permisos del usuario, no el rol.
  const u = session!.user
  const acciones: AccionesInicioConfig = {
    country,
    ventas: puede(u, 'ver_ventas'),
    porConfirmar,
    despachos: tieneModulo(u, 'despachos') && puede(u, 'ver_despachos'),
    verificarPagos: country !== 'VE' || tieneModulo(u, 'verificar_pagos'),
    compras: tieneModulo(u, 'compras_etapas') && puede(u, 'ver_compras'),
    comprasEditar: puede(u, 'compras_editar'),
    importaciones,
    inventario: puede(u, 'ver_inventario'),
    reponer: analisisStock,
    tasa: country === 'VE' ? {
      puedeActualizar: esDuenoPlataforma(u),
      descuento: tieneModulo(u, 'descuento_ml') && puede(u, 'costos'),
      exceso: tieneModulo(u, 'precios_categorias') && puede(u, 'costos'),
      ajustes: rutaPermitida('/tasas', u),
    } : null,
  }
  // Inicio completo (ventas, ganancia, bonos de todos) = permiso "Ver costos y ganancias".
  if (puede(session!.user, 'costos')) {
    // 12-11 (rapidez): el resumen y el gráfico del mes vienen dentro del HTML (mismos GET de la API, en paralelo).
    const [summary, chart] = await Promise.all([
      deApi<Summary>(resumen, '/api/dashboard/summary'),
      deApi<ChartData>(grafico, '/api/reports/chart-data?period=month'),
    ])
    return (<div className="space-y-4">{sugerencia}
    <DashboardAdmin inicial={{ summary, chart }} country={country} bonos={bonos}
      reportes={reportes} acciones={acciones} />
    </div>)
  }
  return <div className="space-y-4">{sugerencia}<DashboardUser country={country} bonos={bonos} acciones={acciones}
    reportes={reportes} cayendo={reportes && analisisStock} /></div>
}
