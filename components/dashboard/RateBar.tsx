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

const fmt = (n: number) => Math.round(Number(n)).toLocaleString('de-DE')
const pct = (n: number) => Number(n).toLocaleString('de-DE', { maximumFractionDigits: 2 })

// 14-11 (el dueño: "estas 2 líneas podrían ser una sola"): la tasa va como subtítulo del Inicio, en una línea, sin
// caja propia. Solo <span> (vive dentro del <p> del PageHeader). En el celular se acomoda en dos renglones.
// descuento: módulo Descuento ML (sin él no se muestra el sugerido) · exceso: módulo precios_categorias.
export default function RateBar({ puedeActualizar = false, descuento = true, exceso = true }: {
  puedeActualizar?: boolean; descuento?: boolean; exceso?: boolean
}) {
  const [rate, setRate] = useState<Rate | null>(null)
  const [busy, setBusy] = useState(false)

  const load = () => fetch('/api/rates/latest').then(r => r.json()).then(setRate)
  useEffect(() => { load() }, [])

  const fetchBcv = async () => {
    setBusy(true)
    try { await fetch('/api/rates/fetch-bcv'); await load() }
    finally { setBusy(false) }
  }

  if (!rate) return <span className="inline-block h-4 w-72 max-w-full animate-pulse rounded bg-neutral-100 align-middle" aria-hidden />

  const Dato = ({ t, v }: { t: string; v: string }) => <span className="whitespace-nowrap">{t} <b className="num font-medium text-neutral-700">{v}</b></span>
  const sep = <span className="text-neutral-300" aria-hidden>·</span>
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-neutral-500">
      {descuento && <>
        <span className="whitespace-nowrap" title="Descuento a poner en MercadoLibre para no perder por la diferencia entre la tasa oficial y la paralela">
          Descuento ML <b className="num font-semibold text-neutral-900">{pct(rate.recommended_discount)}%</b>
        </span>
        {sep}
      </>}
      <Dato t="Oficial" v={`Bs ${fmt(rate.official_rate)}`} />{sep}
      <Dato t="Paralelo" v={`Bs ${fmt(rate.parallel_rate)}`} />{sep}
      <Dato t="Spread" v={`${pct(rate.spread_percentage)}%`} />
      {exceso && <>{sep}<Dato t="Exceso" v={`${pct(rate.excess_percentage)}%`} /></>}
      {rate.rate_date && <>{sep}<span className="whitespace-nowrap text-xs text-neutral-400">al {parseLocalDate(rate.rate_date).toLocaleDateString('es-VE', { day: 'numeric', month: 'numeric' })}</span></>}
      {/* La tasa es común a todas las empresas: solo la actualiza el dueño de la plataforma (al resto, el cron). */}
      {puedeActualizar && (
        <button type="button" onClick={fetchBcv} disabled={busy} title="Actualizar BCV" aria-label="Actualizar BCV"
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-800 disabled:opacity-60">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} aria-hidden>
            <path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" />
          </svg>
        </button>
      )}
    </span>
  )
}
