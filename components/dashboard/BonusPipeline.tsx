'use client'
import { useEffect, useState } from 'react'
import { parseBonusPhases, type BonusPhase } from '@/lib/bonus'

interface Bonus {
  sales_amount: number
  last_month_sales: number
  phases?: BonusPhase[]
}

const MONTH_NAMES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

export default function BonusPipeline() {
  const [data, setData] = useState<Bonus | null>(null)

  useEffect(() => {
    fetch('/api/dashboard/my-bonus').then(r => r.json()).then(setData)
  }, [])

  if (!data) return null

  const salesAmount = data.sales_amount ?? 0
  const lastM       = data.last_month_sales ?? 0
  // Metas y montos configurables en Ajustes; si la API no los trajo, el default.
  const phases      = data.phases?.length ? data.phases : parseBonusPhases(null)

  // Always green like legacy
  const fillColor = '#22c55e'

  // Previous month label (Ene/Feb/Mar…)
  const prev = new Date()
  prev.setDate(1)
  prev.setMonth(prev.getMonth() - 1)
  const prevMonthLabel = MONTH_NAMES[prev.getMonth()]

  // Previous-month marker position inside each track (or null)
  const markerPcts = phases.map((p, i) => {
    if (lastM <= 0) return null
    if (lastM > p.start && lastM <= p.end) return ((lastM - p.start) / (p.end - p.start)) * 100
    if (i === phases.length - 1 && lastM > p.end) return 100
    return null
  })

  const startDotColor = salesAmount > 0 ? fillColor : '#d1d5db'

  // pb-2.5: el aire que necesita la etiqueta del mes anterior, que se posiciona
  // en absoluto debajo de la barra y sobresale de la fila.
  return (
    <div className="px-2 pt-2 pb-2.5">
      <div className="flex items-center w-full gap-1">
        {/* Start dot */}
        <span className="shrink-0 w-3 h-3 rounded-full" style={{ background: startDotColor }} />

        {phases.map((p, i) => {
          const segFill = salesAmount >= p.end ? 100
                       : salesAmount >  p.start ? ((salesAmount - p.start) / (p.end - p.start)) * 100
                       : 0
          const mPct = markerPcts[i]
          const reached = salesAmount >= p.end

          return (
            <span key={i} className="contents">
              {/* Segment — el ancho es proporcional al tramo de ventas que cubre */}
              <div className="relative h-2 bg-neutral-200 rounded-full" style={{ flex: p.end - p.start }}>
                <div className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700"
                  style={{ width: `${segFill}%`, background: fillColor }} />
                {mPct !== null && (
                  <>
                    <div className="absolute w-2 h-2 rounded-full bg-neutral-400 border-2 border-white"
                      style={{ left: `${mPct}%`, top: '50%', transform: 'translate(-50%, -50%)', zIndex: 2 }} />
                    <span className="absolute text-neutral-400 whitespace-nowrap"
                      style={{ left: `${mPct}%`, top: '100%', marginTop: '4px', transform: 'translateX(-50%)', fontSize: '10px', lineHeight: 1 }}>
                      {prevMonthLabel}
                    </span>
                  </>
                )}
              </div>

              {/* Node: píldora con el monto del bono, a la altura de la barra.
                  El ancho lo da el texto y el alto queda cerca del de la barra
                  (18px vs 8px), así el hito no compite con la línea. */}
              <div
                className={`shrink-0 px-2 py-1 rounded-full text-[10px] font-bold leading-none tabular-nums ${
                  reached
                    ? 'bg-green-500 text-white'
                    : 'bg-neutral-200 text-neutral-500'
                }`}
              >
                ${p.bonus}
              </div>
            </span>
          )
        })}
      </div>
    </div>
  )
}
