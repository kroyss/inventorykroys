'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { Product } from '@/lib/types'
import { shipInfo, parseShippingTable, type ShipInfo, type ShipStatus } from '@/lib/mlShipping'
import { matchTokens } from '@/lib/search'

function fmt(n: number) {
  return Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const STATUS_META: Record<ShipStatus, { label: string; cls: string; chip: string }> = {
  ok:           { label: '✅ Gratis',        cls: 'text-green-700', chip: 'bg-green-50 text-green-700 border-green-200' },
  capped:       { label: '⚠️ Tope',          cls: 'text-amber-700', chip: 'bg-amber-50 text-amber-700 border-amber-200' },
  impossible:   { label: '🚫 Nunca gratis',  cls: 'text-red-700',   chip: 'bg-red-50 text-red-700 border-red-200' },
  overweight:   { label: '⚠️ Fuera de tabla',cls: 'text-red-700',   chip: 'bg-red-50 text-red-700 border-red-200' },
  unregistered: { label: '⚪ Sin peso',       cls: 'text-neutral-500', chip: 'bg-neutral-100 text-neutral-600 border-neutral-200' },
}

type Filter = 'all' | 'unregistered' | 'capped' | 'impossible'

export default function MercadoEnviosClient({ initialProducts }: { initialProducts: Product[] }) {
  const [products, setProducts] = useState<Product[]>(initialProducts)
  const [search, setSearch]     = useState('')
  const [filter, setFilter]     = useState<Filter>('all')
  const [weights, setWeights]   = useState<Record<number, string>>(
    () => Object.fromEntries(initialProducts.map(p => [p.id, p.weight_kg != null ? String(p.weight_kg) : '']))
  )
  const [savingId, setSavingId] = useState<number | null>(null)
  const [error, setError]       = useState('')

  // Tasa VE + settings (exceso, descuento global, tabla de envíos)
  const [rate, setRate] = useState<{ official: number; parallel: number; excess: number; recommended: number } | null>(null)
  const [settings, setSettings] = useState<Record<string, string>>({})
  useEffect(() => {
    fetch('/api/rates/latest').then(r => r.json()).then(d =>
      setRate({ official: d.official_rate, parallel: d.parallel_rate, excess: d.excess_percentage, recommended: d.recommended_discount })
    ).catch(() => {})
    fetch('/api/settings').then(r => r.json()).then(d => setSettings(d && typeof d === 'object' ? d : {})).catch(() => {})
  }, [])

  const shipTable = useMemo(() => parseShippingTable(settings.ml_shipping_table), [settings.ml_shipping_table])
  const globalDiscount = useMemo(() => {
    const raw = settings.ml_descuento
    const n = raw == null || raw === '' ? NaN : parseFloat(raw)
    return isNaN(n) ? (rate?.recommended ?? 0) : n
  }, [settings.ml_descuento, rate])

  const rows = useMemo(() => {
    const excess = rate?.excess ?? 0
    return products.map(p => {
      const base      = p.total_cost * (1 + (p.profit_percentage ?? 0) / 100)
      const published = base * (1 + excess / 100)
      const info: ShipInfo = shipInfo(p.weight_kg, published, globalDiscount, shipTable)
      const final = published * (1 - info.effectiveDiscount / 100)
      return { p, published, final, info }
    })
  }, [products, rate, globalDiscount, shipTable])

  const counts = useMemo(() => {
    const c = { unregistered: 0, capped: 0, impossible: 0, ok: 0, overweight: 0 }
    for (const r of rows) c[r.info.status]++
    return c
  }, [rows])

  const filtered = useMemo(() => {
    let arr = rows
    if (filter === 'unregistered') arr = arr.filter(r => r.info.status === 'unregistered')
    else if (filter === 'capped')  arr = arr.filter(r => r.info.status === 'capped')
    else if (filter === 'impossible') arr = arr.filter(r => r.info.status === 'impossible' || r.info.status === 'overweight')
    if (search.trim()) arr = arr.filter(r => matchTokens(search, r.p.code, r.p.name, r.p.category_name ?? ''))
    return arr
  }, [rows, filter, search])

  async function saveWeight(id: number) {
    const raw = (weights[id] ?? '').trim()
    const kg = raw === '' ? null : parseFloat(raw)
    if (kg !== null && (isNaN(kg) || kg <= 0)) { setError('Peso inválido'); return }
    const prev = products.find(p => p.id === id)?.weight_kg ?? null
    if (kg === prev) return                       // sin cambios
    setSavingId(id); setError('')
    const res = await fetch(`/api/products/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weight_kg: kg }),
    })
    setSavingId(null)
    if (!res.ok) { setError((await res.json()).error ?? 'Error al guardar'); return }
    setProducts(ps => ps.map(p => p.id === id ? { ...p, weight_kg: kg } : p))
  }

  const chip = (f: Filter, label: string, n: number, active: string) => (
    <button onClick={() => setFilter(f)}
      className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${filter === f ? active : 'bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50'}`}>
      {label} <b>{n}</b>
    </button>
  )

  return (
    <div className="space-y-4">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded">{error}</div>}

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-neutral-900">📦 MercadoEnvíos</h1>
        <Link href="/productos" className="text-sm text-neutral-500 hover:text-neutral-800">← Volver a Productos</Link>
        <div className="ml-auto text-sm text-neutral-500">
          Descuento global: <b className="text-neutral-800">{globalDiscount.toFixed(1)}%</b>
          {rate && <span className="text-neutral-400"> · exceso {rate.excess}%</span>}
        </div>
      </div>

      <p className="text-xs text-neutral-500 bg-neutral-50 border border-neutral-200 rounded-lg p-3 leading-relaxed">
        Registrá el <b>peso</b> de cada producto. El sistema calcula el <b>descuento máximo</b> que aguanta sin perder
        envío gratis (según la tabla de ML) y <b>limita solo</b> el descuento global a ese tope. <span className="text-amber-700">⚠️ Tope</span> = se
        le baja el descuento para conservar el envío gratis; <span className="text-red-700">🚫 Nunca gratis</span> = su precio
        publicado ya está por debajo del umbral de su peso (hay que subir precio).
      </p>

      {/* filtros */}
      <div className="flex flex-wrap items-center gap-2">
        {chip('all', 'Todos', rows.length, 'bg-neutral-900 text-white border-neutral-900')}
        {chip('unregistered', '⚪ Sin peso', counts.unregistered, 'bg-neutral-700 text-white border-neutral-700')}
        {chip('capped', '⚠️ Con tope', counts.capped, 'bg-amber-500 text-white border-amber-500')}
        {chip('impossible', '🚫 Nunca gratis', counts.impossible + counts.overweight, 'bg-red-600 text-white border-red-600')}
        <input type="search" placeholder="Buscar…" value={search} onChange={e => setSearch(e.target.value)}
          className="ml-auto border border-neutral-300 rounded-lg px-3 py-1.5 text-sm w-52 focus:outline-none focus:ring-2 focus:ring-neutral-800" />
      </div>

      {/* tabla */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-neutral-500 border-b border-neutral-100">
            <tr>
              <th className="px-3 py-2">Código</th>
              <th className="px-3 py-2">Producto</th>
              <th className="px-2 py-2 text-right">Peso (kg)</th>
              <th className="px-2 py-2 text-right">Publicado</th>
              <th className="px-2 py-2 text-right">Umbral</th>
              <th className="px-2 py-2 text-right">Desc. máx</th>
              <th className="px-2 py-2 text-right">Aplicado</th>
              <th className="px-2 py-2 text-right">Venta final</th>
              <th className="px-2 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-neutral-400">Sin productos</td></tr>
            )}
            {filtered.map(({ p, published, final, info }) => {
              const meta = STATUS_META[info.status]
              return (
                <tr key={p.id} className="border-b border-neutral-50 hover:bg-neutral-50">
                  <td className="px-3 py-2 font-mono text-xs text-neutral-500">{p.code}</td>
                  <td className="px-3 py-2 max-w-[16rem] truncate" title={p.name}>{p.name}</td>
                  <td className="px-2 py-2 text-right">
                    <input type="number" step="0.001" min="0"
                      value={weights[p.id] ?? ''}
                      onChange={e => setWeights(w => ({ ...w, [p.id]: e.target.value }))}
                      onBlur={() => saveWeight(p.id)}
                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                      placeholder="—"
                      className={`w-20 border rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-neutral-800
                                  ${savingId === p.id ? 'border-amber-400 bg-amber-50' : 'border-neutral-300'}`} />
                  </td>
                  <td className="px-2 py-2 text-right">${fmt(published)}</td>
                  <td className="px-2 py-2 text-right text-neutral-500">{info.tier ? `$${fmt(info.tier.minPrice)}` : '—'}</td>
                  <td className="px-2 py-2 text-right">{info.maxDiscount != null ? `${info.maxDiscount.toFixed(1)}%` : '—'}</td>
                  <td className={`px-2 py-2 text-right font-medium ${info.status === 'capped' ? 'text-amber-700' : 'text-neutral-800'}`}>
                    {info.effectiveDiscount.toFixed(1)}%
                  </td>
                  <td className="px-2 py-2 text-right text-green-700">${fmt(final)}</td>
                  <td className="px-2 py-2">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full border whitespace-nowrap ${meta.chip}`}>{meta.label}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
