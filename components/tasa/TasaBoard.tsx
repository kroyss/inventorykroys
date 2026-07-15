'use client'
import { useEffect, useRef, useState } from 'react'
import type { PublicRates } from '@/lib/publicRates'

const fmt = (n: number) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(n)

function relTime(iso: string | null): string {
  if (!iso) return 'sin datos'
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'hace instantes'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  return `hace ${Math.floor(h / 24)} d`
}

function localTime(iso: string | null, tz: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('es', { timeZone: tz, hour: '2-digit', minute: '2-digit' })
}

function Row({ label, value, accent, caption, updatedAt, tz }: {
  label: string
  value: string
  accent: string
  caption?: string
  updatedAt: string | null
  tz: string
}) {
  const prev = useRef(value)
  const [flip, setFlip] = useState(false)

  useEffect(() => {
    if (prev.current !== value) {
      prev.current = value
      setFlip(true)
      const t = setTimeout(() => setFlip(false), 420)
      return () => clearTimeout(t)
    }
  }, [value])

  return (
    <div className="flex items-center justify-between gap-4 border-b border-[#2E343C] py-5 last:border-none">
      <div>
        <div className="text-[11px] tracking-[0.18em] text-[#8A9099] uppercase font-semibold">{label}</div>
        {caption && <div className="text-xs text-[#8A9099] mt-1">{caption}</div>}
      </div>
      <div className="text-right">
        <div className={`font-mono tabular-nums text-4xl sm:text-5xl font-bold leading-none ${accent} ${flip ? 'animate-tasa-flip' : ''}`}>
          {value}
        </div>
        <div className="text-[11px] text-[#5C636D] mt-1.5">
          {localTime(updatedAt, tz)} · {relTime(updatedAt)}
        </div>
      </div>
    </div>
  )
}

export default function TasaBoard({ initial }: { initial: PublicRates }) {
  const [data, setData]       = useState(initial)
  const [loading, setLoading] = useState(false)
  const [note, setNote]       = useState<string | null>(null)
  const [, forceTick]         = useState(0)

  // Refresca los "hace X min" cada 30s sin pegarle a la API.
  useEffect(() => {
    const t = setInterval(() => forceTick(x => x + 1), 30000)
    return () => clearInterval(t)
  }, [])

  const refresh = async () => {
    setLoading(true)
    setNote(null)
    try {
      const res = await fetch('/api/public/tasa/refresh', { method: 'POST' })
      if (res.ok) {
        const json = await res.json()
        setData(json)
        if (json.refreshed === false) setNote('Ya estaba al día (actualizado hace menos de 3 min)')
        else if (json.errors) setNote('No se pudo refrescar del todo, mostrando lo último disponible')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#14171C] text-[#E8E4DA] flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <header className="text-center mb-6">
          <div className="text-[11px] tracking-[0.3em] text-[#5C636D] uppercase">Syncsora</div>
          <h1 className="text-xl font-semibold mt-1">Tasa del día</h1>
        </header>

        <div className="bg-[#1F242B] rounded-2xl border border-[#2E343C] px-5 shadow-[0_1px_0_0_#2E343C_inset]">
          <Row
            label="BCV" value={fmt(data.ve.official_rate)} accent="text-[#FFB020]"
            updatedAt={data.ve.updated_at} tz="America/Caracas"
          />
          <Row
            label="Referencial" value={fmt(data.ve.parallel_rate)} accent="text-[#FF6B4A]"
            caption={data.ve.spread_percentage > 0 ? `+${data.ve.spread_percentage.toFixed(1)}% vs BCV` : undefined}
            updatedAt={data.ve.updated_at} tz="America/Caracas"
          />
          <Row
            label="TRM · Colombia" value={fmt(data.co.trm_rate)} accent="text-[#4DD9C4]"
            updatedAt={data.co.updated_at} tz="America/Bogota"
          />
        </div>

        <button
          onClick={refresh}
          disabled={loading}
          className="mt-6 w-full flex items-center justify-center gap-2 py-3.5 rounded-full
                     bg-[#2E343C] text-[#E8E4DA] font-medium text-sm tracking-wide
                     active:scale-[0.98] transition disabled:opacity-60
                     focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFB020]"
        >
          <span className={loading ? 'inline-block animate-spin' : 'inline-block'}>↻</span>
          {loading ? 'Actualizando…' : 'Actualizar'}
        </button>

        {note && (
          <p className="text-center text-[11px] text-[#8A9099] mt-3">{note}</p>
        )}
      </div>
    </div>
  )
}
