'use client'
import { useState, type ReactNode } from 'react'
import { Tabs } from '@/components/ui'
import ReportadorHistorial from '@/components/despachos/ReportadorHistorial'
import { EnEsperaReportador, type Apartado } from '@/components/despachos/EnEspera'

/** Reportador: pestañas Reportar (API, Tealca, mensajes y programa de respaldo) e Historial. */
export default function ReportadorVistas({ reportar, vistaInicial, jornadaInicial, esperaInicial = null }: {
  reportar: ReactNode; vistaInicial: 'reportar' | 'historial'; jornadaInicial: number | null; esperaInicial?: Apartado[] | null
}) {
  const [vista, setVista] = useState(vistaInicial)
  return (
    <div className="space-y-4">
      <EnEsperaReportador inicial={esperaInicial} />
      <Tabs value={vista} onChange={setVista} items={[
        { value: 'reportar', label: 'Reportar' },
        { value: 'historial', label: 'Historial' },
      ]} />
      {/* Reportar queda montado (oculto) para no perder un reporte en curso al mirar el historial. */}
      <div className={vista === 'reportar' ? 'space-y-5' : 'hidden'}>{reportar}</div>
      {vista === 'historial' && <ReportadorHistorial jornadaInicial={jornadaInicial} />}
    </div>
  )
}
