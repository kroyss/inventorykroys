'use client'
import { useEffect, useState } from 'react'

interface Bonus {
  sales_amount: number
  last_month_sales: number
}

const MONTH_NAMES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const TRACKS = [
  { fromT: 0,     toT: 10000, w: 10 },
  { fromT: 10000, toT: 15000, w: 5  },
  { fromT: 15000, toT: 20000, w: 5  },
]
const NODES = [
  { t: 10000, label: 'B100' },
  { t: 15000, label: 'B200' },
  { t: 20000, label: 'B300' },
]

export default function BonusPipeline() {
  const [data, setData] = useState<Bonus | null>(null)

  useEffect(() => {
    fetch('/api/dashboard/my-bonus').then(r => r.json()).then(setData)
  }, [])

  if (!data) return null

  const salesAmount = data.sales_amount ?? 0
  const lastM       = data.last_month_sales ?? 0

  // Always green like legacy
  const fillColor = '#22c55e'

  // Previous month label (Ene/Feb/Mar…)
  const prev = new Date()
  prev.setDate(1)
  prev.setMonth(prev.getMonth() - 1)
  const prevMonthLabel = MONTH_NAMES[prev.getMonth()]

  // Previous-month marker position inside each track (or null)
  const markerPcts = TRACKS.map((tr, i) => {
    if (lastM <= 0) return null
    if (lastM > tr.fromT && lastM <= tr.toT) return ((lastM - tr.fromT) / (tr.toT - tr.fromT)) * 100
    if (i === TRACKS.length - 1 && lastM > tr.toT) return 100
    return null
  })

  const startDotColor = salesAmount > 0 ? fillColor : '#d1d5db'

  return (
    <div className="px-2 pt-2 pb-7">
      <div className="flex items-center w-full gap-1">
        {/* Start dot */}
        <span className="shrink-0 w-3 h-3 rounded-full" style={{ background: startDotColor }} />

        {TRACKS.map((tr, i) => {
          const segFill = salesAmount >= tr.toT ? 100
                       : salesAmount >  tr.fromT ? ((salesAmount - tr.fromT) / (tr.toT - tr.fromT)) * 100
                       : 0
          const mPct = markerPcts[i]
          const node = NODES[i]
          const reached = salesAmount >= node.t

          return (
            <span key={i} className="contents">
              {/* Segment */}
              <div className="relative h-2 bg-neutral-200 rounded-full" style={{ flex: tr.w }}>
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

              {/* Node */}
              <div className="shrink-0 flex flex-col items-center">
                <div className={`w-4 h-4 rounded-full flex items-center justify-center ${
                  reached ? 'bg-green-500' : 'bg-white border-2 border-neutral-300'
                }`}>
                  {reached && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className={`mt-1 text-[10px] font-semibold whitespace-nowrap ${
                  reached ? 'text-green-600' : 'text-neutral-400'
                }`}>
                  {node.label}
                </span>
              </div>
            </span>
          )
        })}
      </div>
    </div>
  )
}
