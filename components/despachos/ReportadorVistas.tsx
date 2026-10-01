'use client'
import { useState, type ReactNode } from 'react'
import { Tabs } from '@/components/ui'
import ReportadorHistorial from '@/components/despachos/ReportadorHistorial'

/** Reportador: pestañas Reportar (API, Tealca, mensajes y programa de respaldo) e Historial. */
export default function ReportadorVistas({ reportar, vistaInicial, jornadaInicial }: {
  reportar: ReactNode; vistaInicial: 'reportar' | 'historial'; jornadaInicial: number | null
}) {
  const [vista, setVista] = useState(vistaInicial)
  return (
    <div className="space-y-4">
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
