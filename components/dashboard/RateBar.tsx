'use client'
import { useEffect, useState } from 'react'
import { parseLocalDate } from '@/lib/tz'
import Link from '@/components/ui/Link'

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
const pct = (n: number, d = 2) => Number(n).toLocaleString('de-DE', { maximumFractionDigits: d })

const PILDORA = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs text-neutral-500 shadow-sm'

// 19-11 (el dueño: «la tasa tiene demasiado protagonismo»): una píldora chica «Bs 918 / 1.073 · 16,9 %» (oficial /
// paralelo · diferencial) con el detalle al pasar el mouse; con `ajustes` lleva a Ajustes. Al lado, si hay módulo
// Descuento ML, otra píldora con el descuento (el dato que se usa para publicar). Sin caja ni línea propia.
// descuento: módulo Descuento ML · exceso: módulo precios_categorias (solo va en el detalle).
export default function RateBar({ puedeActualizar = false, descuento = true, exceso = true, ajustes = false }: {
  puedeActualizar?: boolean; descuento?: boolean; exceso?: boolean; ajustes?: boolean
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

  if (!rate) return <span className="inline-block h-7 w-44 animate-pulse rounded-full bg-neutral-100 align-middle" aria-hidden />

  const fecha = rate.rate_date ? parseLocalDate(rate.rate_date).toLocaleDateString('es-VE', { day: 'numeric', month: 'numeric' }) : null
  const detalle = `Oficial Bs ${fmt(rate.official_rate)} · Paralelo Bs ${fmt(rate.parallel_rate)} · Diferencial ${pct(rate.spread_percentage)} %`
    + (exceso ? ` · Exceso ${pct(rate.excess_percentage)} %` : '') + (fecha ? ` · al ${fecha}` : '') + (ajustes ? ' · toca para ver Ajustes' : '')
  // 20-11: con nombres cortos («BCV 919 · Paralelo 1.066 · Dif. 16 %»): «Bs 919 / 1.066 · 16 %» no lo entendía alguien nuevo.
  const contenido = <>
    <span>BCV <b className="num font-medium text-neutral-800">{fmt(rate.official_rate)}</b></span>
    <span className="text-neutral-300" aria-hidden>·</span>
    <span>Paralelo <b className="num font-medium text-neutral-800">{fmt(rate.parallel_rate)}</b></span>
    <span className="text-neutral-300" aria-hidden>·</span>
    <span>Dif. <b className="num font-medium text-neutral-800">{pct(rate.spread_percentage, 1)}%</b></span>
  </>
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {ajustes
        ? <Link href="/tasas" title={detalle} aria-label={detalle} className={`${PILDORA} transition hover:border-neutral-300 hover:text-neutral-700`}>{contenido}</Link>
        : <span title={detalle} aria-label={detalle} className={PILDORA}>{contenido}</span>}
      {descuento && (
        <span className={PILDORA} title="Descuento a poner en MercadoLibre para no perder por la diferencia entre la tasa oficial y la paralela">
          Desc. ML <b className="num font-semibold text-neutral-900">{pct(rate.recommended_discount, 1)}%</b>
        </span>
      )}
      {/* La tasa es común a todas las empresas: solo la actualiza el dueño de la plataforma (al resto, el cron). */}
      {puedeActualizar && (
        <button type="button" onClick={fetchBcv} disabled={busy} title="Actualizar BCV" aria-label="Actualizar BCV"
          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-800 disabled:opacity-60">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} aria-hidden>
            <path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" />
          </svg>
        </button>
      )}
    </span>
  )
}
