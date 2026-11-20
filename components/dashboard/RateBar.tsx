'use client'
import { useEffect, useRef, useState } from 'react'
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

// 20-11 (el dueño: «la tasa lo más compacta posible; poca gente va al historial»): UNA píldora «Bs/$ 919 · 1.066 · 16%»
// (BCV · paralelo · diferencial). Al pasar el mouse o al tocarla abre el detalle: oficial, paralelo, diferencial, exceso,
// descuento ML, fecha, actualizar (solo el dueño de la plataforma) y «Ver historial» (quien entra a Ajustes).
// «Bs/$» y no «$» solo: «$ 919» se lee como 919 dólares.
// descuento: módulo Descuento ML · exceso: módulo precios_categorias (solo van en el detalle).
export default function RateBar({ puedeActualizar = false, descuento = true, exceso = true, ajustes = false }: {
  puedeActualizar?: boolean; descuento?: boolean; exceso?: boolean; ajustes?: boolean
}) {
  const [rate, setRate] = useState<Rate | null>(null)
  const [busy, setBusy] = useState(false)
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLSpanElement>(null)

  const load = () => fetch('/api/rates/latest').then(r => r.json()).then(setRate)
  useEffect(() => { load() }, [])

  // Toque fuera o Escape: se cierra.
  useEffect(() => {
    if (!abierto) return
    const fuera = (e: PointerEvent) => { if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('pointerdown', fuera)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', fuera); document.removeEventListener('keydown', esc) }
  }, [abierto])

  const fetchBcv = async () => {
    setBusy(true)
    try { await fetch('/api/rates/fetch-bcv'); await load() }
    finally { setBusy(false) }
  }

  if (!rate) return <span className="inline-block h-7 w-40 animate-pulse rounded-full bg-neutral-100 align-middle" aria-hidden />

  const fecha = rate.rate_date ? parseLocalDate(rate.rate_date).toLocaleDateString('es-VE', { day: 'numeric', month: 'numeric' }) : null
  const filas: [string, string][] = [
    ['Oficial (BCV)', `Bs ${fmt(rate.official_rate)}`],
    ['Paralelo', `Bs ${fmt(rate.parallel_rate)}`],
    ['Diferencial', `${pct(rate.spread_percentage, 1)} %`],
    ...(exceso ? [['Exceso', `${pct(rate.excess_percentage)} %`] as [string, string]] : []),
    ...(descuento ? [['Descuento ML', `${pct(rate.recommended_discount, 1)} %`] as [string, string]] : []),
  ]

  return (
    <span ref={caja} className="relative inline-block"
      onMouseEnter={e => { if (e.nativeEvent instanceof MouseEvent && matchMedia('(hover: hover)').matches) setAbierto(true) }}
      onMouseLeave={() => { if (matchMedia('(hover: hover)').matches) setAbierto(false) }}>
      {/* Con mouse, pasar encima ya lo abre: el clic no lo vuelve a cerrar (se cierra al salir). En el celular, toca y toca. */}
      <button type="button" onClick={() => setAbierto(v => matchMedia('(hover: hover)').matches ? true : !v)} aria-expanded={abierto}
        aria-label={`Tasas: oficial Bs ${fmt(rate.official_rate)}, paralelo Bs ${fmt(rate.parallel_rate)}, diferencial ${pct(rate.spread_percentage, 1)} %. Toca para ver el detalle`}
        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-neutral-200 bg-white px-2.5 py-0.5 text-xs text-neutral-500 shadow-sm transition hover:border-neutral-300 hover:text-neutral-700">
        <span className="text-neutral-400">Bs/$</span>
        <b className="num font-medium text-neutral-800">{fmt(rate.official_rate)}</b>
        <span className="text-neutral-300" aria-hidden>·</span>
        <b className="num font-medium text-neutral-800">{fmt(rate.parallel_rate)}</b>
        <span className="text-neutral-300" aria-hidden>·</span>
        <b className="num font-medium text-neutral-800">{pct(rate.spread_percentage, 0)}%</b>
      </button>
      {abierto && (
        <span role="dialog" aria-label="Detalle de las tasas"
          className="absolute right-0 top-full z-30 mt-1 block w-56 rounded-xl border border-neutral-200 bg-white p-3 text-xs shadow-lg">
          <span className="mb-1.5 flex items-center justify-between font-semibold text-neutral-800">
            Tasas{fecha ? ` al ${fecha}` : ''}
            {/* La tasa es común a todas las empresas: solo la actualiza el dueño de la plataforma (al resto, el cron). */}
            {puedeActualizar && (
              <button type="button" onClick={fetchBcv} disabled={busy} title="Actualizar BCV" aria-label="Actualizar BCV"
                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800 disabled:opacity-60">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} aria-hidden>
                  <path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" />
                </svg>
              </button>
            )}
          </span>
          {filas.map(([k, v]) => (
            <span key={k} className="flex justify-between py-0.5 text-neutral-500">{k}<b className="num font-medium text-neutral-900">{v}</b></span>
          ))}
          <span className="mt-1.5 block text-[11px] leading-snug text-neutral-400">Diferencial = cuánto más cara está la paralela que la oficial.</span>
          {ajustes && <Link href="/tasas" className="mt-2 block font-medium text-sky-700 hover:underline">Ver historial →</Link>}
        </span>
      )}
    </span>
  )
}
