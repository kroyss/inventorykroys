'use client'
import { useEffect, useState } from 'react'
import type { Country } from '@/lib/types'
import BonusPipeline from './BonusPipeline'
import BloquesInicio from './BloquesInicio'
import SalesMiniChart from './SalesMiniChart'
import AccionesInicio, { type AccionesInicioConfig } from './AccionesInicio'
import AvisoStockVerificar from './AvisoStockVerificar'

interface Summary {
  active_products: number
  sales_count_month: number
  sales_amount_month: number
  low_stock_alerts: number
  no_stock: number
  pending_sales: number
  in_transit: number
}

export default function DashboardUser({ country, bonos, reportes = false, cayendo = false, acciones }: {
  reportes?: boolean         // 14-11: con permiso Reportes (sin costos) ve abajo lo que no muestra plata, del mes
  cayendo?: boolean          // y Reportes → Stock disponible
  country: Country; bonos: boolean
  acciones: AccionesInicioConfig   // 20-11: el mismo bloque de arriba que el Inicio completo
}) {
  const [summary, setSummary] = useState<Summary | null>(null)
  useEffect(() => { fetch('/api/dashboard/summary').then(r => r.json()).then(setSummary) }, [])

  if (!summary) return <div className="p-8 text-neutral-500">Cargando…</div>

  return (
    <div className="space-y-5">
      <h1 className="sr-only">Inicio</h1>
      <AccionesInicio cfg={acciones} stock={summary} />

      <AvisoStockVerificar n={(summary as { por_verificar?: number }).por_verificar ?? 0} />

      {country === 'VE' && bonos && <BonusPipeline />}

      <SalesMiniChart />

      {reportes && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-neutral-500">Este mes</p>
          <BloquesInicio period="month" reportes cayendo={cayendo} />
        </div>
      )}
    </div>
  )
}
