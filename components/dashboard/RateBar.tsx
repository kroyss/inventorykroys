'use client'
import { useEffect, useState } from 'react'
import { parseLocalDate } from '@/lib/tz'

interface Rate {
  official_rate: number
  parallel_rate: number
  spread_percentage: number
  recommended_discount: number
  excess_percentage: number
  rate_date: string | null
  source: string
}

const fmt = (n: number) =>
  Math.round(Number(n)).toLocaleString('de-DE')

export default function RateBar({ puedeActualizar = false }: { puedeActualizar?: boolean }) {
  const [rate, setRate] = useState<Rate | null>(null)
  const [busy, setBusy] = useState(false)

  const load = () => fetch('/api/rates/latest').then(r => r.json()).then(setRate)
  useEffect(() => { load() }, [])

  const fetchBcv = async () => {
    setBusy(true)
    try { await fetch('/api/rates/fetch-bcv'); await load() }
    finally { setBusy(false) }
  }

  if (!rate) return null

  return (
    <div className="bg-white border border-neutral-200 shadow-sm rounded-xl px-4 py-3 text-sm flex flex-col md:flex-row md:items-center gap-3">
      {/* Descuento sugerido destacado */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-sm font-medium text-neutral-500">Descuento ML sugerido</span>
        <span className="text-2xl font-semibold tracking-tight text-neutral-900 num">{rate.recommended_discount}%</span>
      </div>

      {/* Detalles — envuelven en móvil */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-neutral-600 md:border-l md:border-neutral-200 md:pl-4">
        <span>Oficial: <span className="font-semibold text-neutral-800">Bs {fmt(rate.official_rate)}</span></span>
        <span>Paralelo: <span className="font-semibold text-neutral-800">Bs {fmt(rate.parallel_rate)}</span></span>
        {rate.rate_date && (
          <span className="text-neutral-400 text-xs">al {parseLocalDate(rate.rate_date).toLocaleDateString('es-VE')}</span>
        )}
        <span>Spread: <span className="font-semibold text-neutral-800">{rate.spread_percentage}%</span></span>
        <span>Exceso: <span className="font-semibold text-neutral-800">{rate.excess_percentage}%</span></span>
      </div>

      {/* La tasa es común a todas las empresas: solo la actualiza el dueño de la plataforma
          (para el resto la actualiza el cron varias veces al día). */}
      {puedeActualizar && (
        <button onClick={fetchBcv} disabled={busy}
          className="btn-secondary w-full md:w-auto md:ml-auto shrink-0 py-1.5">
          {busy ? 'Actualizando…' : 'Actualizar BCV'}
        </button>
      )}
    </div>
  )
}
