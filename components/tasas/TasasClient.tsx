'use client'
import { useEffect, useState, useMemo, useRef } from 'react'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend,
} from 'chart.js'
import { KPICard, money } from '@/components/ui'
import { calcSpreadAndDiscount } from '@/lib/rateUtils'
import { parseLocalDate } from '@/lib/tz'
import MlBreakdown from '@/components/productos/MlBreakdown'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend)

interface Rate {
  id?: number
  official_rate: number
  parallel_rate: number
  spread_percentage: number
  recommended_discount: number
  excess_percentage: number
  rate_date: string | null
  source: string
}

export default function TasasClient() {
  const [latest,   setLatest]   = useState<Rate | null>(null)
  const [history,  setHistory]  = useState<Rate[]>([])
  const [official, setOfficial] = useState('')
  const [parallel, setParallel] = useState('')
  const [excess,   setExcess]   = useState('')
  const [simUsd,   setSimUsd]   = useState('100')
  // Parámetros de costos de ML Venezuela (editables; simples vs CO)
  const [simCost,    setSimCost]    = useState('')      // costo USD para ver ganancia
  const [veComision, setVeComision] = useState('12')    // % comisión ML
  const [veEnvio,    setVeEnvio]     = useState('0.65')  // $ envío por venta
  const [veUmbral,   setVeUmbral]    = useState('5')     // envío gratis aplica desde $5
  const [busy,     setBusy]     = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [okMsg,    setOkMsg]    = useState<string | null>(null)
  const [manualOpen, setManualOpen] = useState(false)  // edición manual bloqueada por defecto

  // Igualar la altura del historial para que la columna derecha termine
  // exactamente donde termina el simulador (sin espacio vacío).
  const leftRef  = useRef<HTMLDivElement>(null)
  const chartRef = useRef<HTMLDivElement>(null)
  const [histMax, setHistMax] = useState<number | undefined>(undefined)
  useEffect(() => {
    const recompute = () => {
      const lh = leftRef.current?.offsetHeight ?? 0
      const ch = chartRef.current?.offsetHeight ?? 0
      if (lh && ch) setHistMax(Math.max(140, lh - ch - 16))  // 16 = gap entre chart e historial
    }
    recompute()
    const ro = new ResizeObserver(recompute)
    if (leftRef.current)  ro.observe(leftRef.current)
    if (chartRef.current) ro.observe(chartRef.current)
    window.addEventListener('resize', recompute)
    return () => { ro.disconnect(); window.removeEventListener('resize', recompute) }
  })

  const loadAll = async () => {
    const [l, h, s] = await Promise.all([
      fetch('/api/rates/latest').then(r => r.json()),
      fetch('/api/rates/history?limit=30').then(r => r.json()),
      fetch('/api/settings').then(r => r.json()).catch(() => ({})),
    ])
    setLatest(l)
    setHistory(Array.isArray(h) ? h : [])
    setExcess(String(l.excess_percentage ?? 100))
    if (s && typeof s === 'object') {
      if (s.ml_comision) setVeComision(String(s.ml_comision))
      if (s.ml_envio)    setVeEnvio(String(s.ml_envio))
      if (s.ml_umbral)   setVeUmbral(String(s.ml_umbral))
    }
  }
  useEffect(() => { loadAll() }, [])

  const saveSettings = async () => {
    setBusy(true); setError(null); setOkMsg(null)
    const res = await fetch('/api/settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ml_comision: veComision, ml_envio: veEnvio, ml_umbral: veUmbral }),
    })
    setBusy(false)
    if (!res.ok) { setError((await res.json()).error ?? 'Error al guardar'); return }
    setOkMsg('Parámetros guardados'); setTimeout(() => setOkMsg(null), 2500)
  }

  // ── freshness ──
  const freshness = useMemo(() => {
    if (!latest?.rate_date) return null
    const rd = parseLocalDate(latest.rate_date)
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const days = Math.round((today.getTime() - rd.getTime()) / 86400000)
    return { days, stale: days >= 1 }
  }, [latest])

  // ── live preview of excess change ──
  const excessPreview = useMemo(() => {
    if (!latest) return null
    const ex = parseFloat(excess)
    if (isNaN(ex)) return null
    return calcSpreadAndDiscount(latest.official_rate, latest.parallel_rate, ex)
  }, [excess, latest])


  const saveManual = async () => {
    setBusy(true); setError(null); setOkMsg(null)
    const res = await fetch('/api/rates/manual', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ official_rate: parseFloat(official), parallel_rate: parseFloat(parallel) }),
    })
    setBusy(false)
    if (!res.ok) { setError((await res.json()).error ?? 'Error'); return }
    setOfficial(''); setParallel(''); setOkMsg('Tasa guardada'); setTimeout(() => setOkMsg(null), 2500)
    loadAll()
  }

  const fetchBcv = async () => {
    setBusy(true); setError(null); setOkMsg(null)
    const res = await fetch('/api/rates/fetch-bcv')
    setBusy(false)
    if (!res.ok) { setError((await res.json()).error ?? 'Error obteniendo tasa BCV'); return }
    setOkMsg('Tasa actualizada desde BCV'); setTimeout(() => setOkMsg(null), 2500)
    loadAll()
  }

  const saveExcess = async () => {
    setBusy(true); setError(null); setOkMsg(null)
    const res = await fetch('/api/rates/excess-percentage', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ excess_percentage: parseFloat(excess) }),
    })
    setBusy(false)
    if (!res.ok) { setError((await res.json()).error ?? 'Error'); return }
    setOkMsg('% exceso actualizado'); setTimeout(() => setOkMsg(null), 2500)
    loadAll()
  }

  if (!latest) return <div className="p-8 text-neutral-500">Cargando…</div>

  // chart data (chronological) — solo los últimos 30 para que sea legible
  const chrono = [...history].slice(0, 30).reverse()

  return (
    <div className="space-y-4">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded">{error}</div>}
      {okMsg && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded">{okMsg}</div>}

      {/* KPI header */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard label="Oficial"  value={`Bs ${money(latest.official_rate)}`} />
        <KPICard label="Paralelo" value={`Bs ${money(latest.parallel_rate)}`} />
        <KPICard label="Spread"   value={`${latest.spread_percentage}%`} accent="text-orange-600" />
        <KPICard label="Descuento recom." value={`${latest.recommended_discount}%`} accent="text-blue-600" />
      </div>

      {/* Barra superior: estado+actualizar │ edición manual │ config exceso ML */}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 bg-white rounded-xl border border-neutral-200 shadow-sm px-5 py-3">
        {/* Estado de la tasa + Actualizar TASA */}
        <div className="flex items-center gap-3">
          <div className="text-sm">
            <div className="text-[11px] text-neutral-400">Última actualización</div>
            {latest.rate_date ? (
              <div className="flex items-center gap-2">
                <span className="font-medium">{parseLocalDate(latest.rate_date).toLocaleDateString('es-VE')}</span>
                {freshness && (
                  <span className={`px-2 py-0.5 rounded-full text-xs ${freshness.stale ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                    {freshness.days === 0 ? 'Hoy' : freshness.days === 1 ? 'hace 1 día' : `hace ${freshness.days} días`}
                    {freshness.stale ? ' · desact.' : ''}
                  </span>
                )}
              </div>
            ) : <span className="text-neutral-400">Sin fecha</span>}
          </div>
          <button onClick={fetchBcv} disabled={busy} className="btn-primary text-sm whitespace-nowrap">
            {busy ? 'Cargando…' : 'Actualizar TASA'}
          </button>
        </div>

        {/* Edición manual (bloqueada por defecto, poco usada) */}
        <div className="border-l border-neutral-200 pl-4">
          <button type="button" onClick={() => setManualOpen(o => !o)}
            className="text-[11px] text-neutral-500 hover:text-neutral-800 flex items-center gap-1 mb-1">
            <span>{manualOpen ? '🔓' : '🔒'}</span> Edición manual
          </button>
          <div className="flex items-end gap-1.5">
            <input type="number" step="0.01" value={official} onChange={e => setOfficial(e.target.value)} disabled={!manualOpen}
              title="Tasa oficial" placeholder="Oficial"
              className="w-20 border rounded px-2 py-1.5 text-sm disabled:bg-neutral-100 disabled:text-neutral-400 disabled:cursor-not-allowed" />
            <input type="number" step="0.01" value={parallel} onChange={e => setParallel(e.target.value)} disabled={!manualOpen}
              title="Tasa paralela" placeholder="Paralela"
              className="w-20 border rounded px-2 py-1.5 text-sm disabled:bg-neutral-100 disabled:text-neutral-400 disabled:cursor-not-allowed" />
            <button onClick={saveManual} disabled={!manualOpen || busy || !official || !parallel}
              className="text-xs px-3 py-1.5 rounded-lg bg-neutral-900 text-white font-medium hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap">Guardar</button>
          </div>
        </div>

        {/* Config Exceso ML */}
        <div className="border-l border-neutral-200 pl-4">
          <label className="text-[11px] text-neutral-500 block mb-1" title="Margen del precio publicado sobre el base. Afecta el descuento recomendado.">Config Exceso ML</label>
          <div className="flex items-end gap-2">
            <input type="number" step="0.1" min={0} max={500} value={excess} onChange={e => setExcess(e.target.value)}
              className="w-20 border rounded px-2 py-1.5 text-sm" />
            <button onClick={saveExcess} disabled={busy}
              className="text-xs px-3 py-1.5 rounded-lg border border-neutral-300 text-neutral-700 font-medium hover:bg-neutral-100 disabled:opacity-50 whitespace-nowrap">Actualizar</button>
            {excessPreview && (
              <div className="text-sm leading-tight">
                <div className="text-[11px] text-neutral-500">Desc. result.</div>
                <div className={`font-bold ${Math.abs(excessPreview.recommended_discount - latest.recommended_discount) > 0.01 ? 'text-blue-600' : 'text-neutral-900'}`}>
                  {excessPreview.recommended_discount}%
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* Price simulator */}
        <div ref={leftRef} className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5">
          <h2 className="font-semibold mb-1">Simulador de ganancia</h2>
          <p className="text-xs text-neutral-500 mb-3">Costo (compra + envío) + precio de venta estimado → tu ganancia neta real.</p>
          <div className="flex items-end gap-3 mb-4">
            <div className="flex-1">
              <label className="text-xs text-neutral-500">Costo (compra + envío) USD</label>
              <input type="number" step="0.01" min={0} value={simCost} onChange={e => setSimCost(e.target.value)}
                placeholder="0.00" className="mt-1 w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div className="flex-1">
              <label className="text-xs text-neutral-500">Precio de venta estimado USD</label>
              <input type="number" step="0.01" min={0} value={simUsd} onChange={e => setSimUsd(e.target.value)}
                className="mt-1 w-full border rounded px-3 py-2 text-sm" />
            </div>
          </div>

          {/* Parámetros + ganancia neta real en ML Venezuela */}
          <div className="mt-1 border-t border-neutral-100 pt-4">
            <p className="text-sm font-semibold text-neutral-700 mb-2">Costos de ML Venezuela</p>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div>
                <label className="text-[11px] text-neutral-500">Comisión %</label>
                <input type="number" step="0.5" value={veComision} onChange={e => setVeComision(e.target.value)}
                  className="mt-1 w-full border rounded px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="text-[11px] text-neutral-500">Envío $</label>
                <input type="number" step="0.01" value={veEnvio} onChange={e => setVeEnvio(e.target.value)}
                  className="mt-1 w-full border rounded px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="text-[11px] text-neutral-500">Envío gratis desde $</label>
                <input type="number" step="0.5" value={veUmbral} onChange={e => setVeUmbral(e.target.value)}
                  className="mt-1 w-full border rounded px-2 py-1.5 text-sm" />
              </div>
            </div>
            <div className="flex justify-end mb-3">
              <button onClick={saveSettings} disabled={busy}
                className="text-xs px-3 py-1.5 rounded-lg border-2 border-neutral-900/40 font-semibold text-neutral-800 hover:bg-neutral-900 hover:text-white hover:border-neutral-900 transition-colors disabled:opacity-60 whitespace-nowrap">
                {busy ? 'Guardando…' : '💾 Guardar parámetros'}
              </button>
            </div>
            <MlBreakdown
              country="VE"
              totalCost={parseFloat(simCost) || 0}
              ml={{ ml_comision: veComision, ml_envio: veEnvio, ml_umbral: veUmbral }}
              finalPriceUsd={parseFloat(simUsd) || 0}
              veRate={latest ? { official: latest.official_rate, parallel: latest.parallel_rate } : null}
              priceBs={(parseFloat(simUsd) || 0) * (latest?.official_rate ?? 0)}
            />
            <div className="mt-3 text-[11px] text-neutral-500 bg-neutral-50 rounded-lg p-3 leading-relaxed">
              <b>Cómo se calcula:</b> ML descuenta la comisión ({veComision}%) sobre el precio en bolívares; lo que queda se cambia a <b>dólar paralelo</b> (por eso se multiplica sobre "lo que recibes"). El <b>envío</b> (${veEnvio}) es gratis solo desde <b>${veUmbral}</b>: si el precio es menor, el cliente debe juntar varias unidades hasta llegar a ${veUmbral}, así que el costo de envío se reparte → <b>envío = ${veEnvio} × (precio / {veUmbral})</b>. Ej: precio $2 → envío ≈ ${money((parseFloat(veEnvio) || 0) * 2 / (parseFloat(veUmbral) || 5))}.
            </div>
          </div>
        </div>

        {/* Right column: gráfico + historial (igualan la altura del simulador) */}
        <div className="flex flex-col gap-4">
        {/* Evolution chart */}
        <div ref={chartRef} className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5">
          <h2 className="font-semibold mb-3">Evolución (últimos {chrono.length})</h2>
          {chrono.length > 1 ? (
            <div className="relative h-56">
              <Line
                data={{
                  labels: chrono.map(r => r.rate_date ? parseLocalDate(r.rate_date).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit' }) : ''),
                  datasets: [
                    { label: 'Oficial',  data: chrono.map(r => r.official_rate), borderColor: '#3b82f6', backgroundColor: 'transparent', tension: 0.3, pointRadius: 2, borderWidth: 2 },
                    { label: 'Paralelo', data: chrono.map(r => r.parallel_rate), borderColor: '#f97316', backgroundColor: 'transparent', tension: 0.3, pointRadius: 2, borderWidth: 2 },
                  ],
                }}
                options={{
                  responsive: true, maintainAspectRatio: false,
                  interaction: { mode: 'index', intersect: false },
                  plugins: { legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8 } }, tooltip: { callbacks: { label: c => `${c.dataset.label}: Bs ${money(c.parsed.y ?? 0)}` } } },
                  scales: { y: { ticks: { callback: v => 'Bs ' + money(Number(v)) } }, x: { grid: { display: false } } },
                }}
              />
            </div>
          ) : (
            <div className="text-neutral-400 text-sm text-center py-12">Pocos datos para graficar</div>
          )}
        </div>

        {/* History — compacto, scroll, últimos 30 días (solo referencia) */}
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
          <div className="overflow-y-auto" style={{ maxHeight: histMax }}>
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-neutral-500 text-xs sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-2 text-left">Fecha</th>
                  <th className="px-4 py-2 text-right">Oficial</th>
                  <th className="px-4 py-2 text-right">Paralelo</th>
                  <th className="px-4 py-2 text-right">Spread</th>
                  <th className="px-4 py-2 text-right">Descuento</th>
                  <th className="px-4 py-2 text-center">Fuente</th>
                </tr>
              </thead>
              <tbody>
                {history.map((r, i) => (
                  <tr key={r.id} className={`border-t border-neutral-50 hover:bg-neutral-50 ${i % 2 ? 'bg-neutral-50/40' : ''}`}>
                    <td className="px-4 py-2">{r.rate_date ? parseLocalDate(r.rate_date).toLocaleDateString('es-VE') : ''}</td>
                    <td className="px-4 py-2 text-right">Bs {money(r.official_rate)}</td>
                    <td className="px-4 py-2 text-right">Bs {money(r.parallel_rate)}</td>
                    <td className="px-4 py-2 text-right">{r.spread_percentage}%</td>
                    <td className="px-4 py-2 text-right">{r.recommended_discount}%</td>
                    <td className="px-4 py-2 text-center text-xs">
                      <span className={`px-2 py-0.5 rounded ${r.source === 'api' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{r.source}</span>
                    </td>
                  </tr>
                ))}
                {history.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-neutral-400">Sin historial</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        </div>
      </div>

    </div>
  )
}
