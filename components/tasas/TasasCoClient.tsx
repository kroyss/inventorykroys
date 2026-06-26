'use client'
import { useEffect, useState, useMemo } from 'react'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend,
} from 'chart.js'
import { KPICard } from '@/components/ui'
import type { ProfitCategory } from '@/lib/types'
import { parseLocalDate } from '@/lib/tz'
import MlBreakdown from '@/components/productos/MlBreakdown'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend)

const fmtPeso = (n: number) => Number(n).toLocaleString('de-DE', { maximumFractionDigits: 0 })

interface CoRate { id?: number; trm_rate: number; rate_date: string | null; source: string }

// Tasas Colombia: solo TRM oficial (sin paralelo/spread/descuento como VE).
// Se actualiza sola por el cron; aquí se ve, se refresca a mano y hay simulador.
export default function TasasCoClient() {
  const [latest,  setLatest]  = useState<CoRate | null>(null)
  const [history, setHistory] = useState<CoRate[]>([])
  const [cats,    setCats]    = useState<ProfitCategory[]>([])
  const [simCost, setSimCost] = useState('10')
  const [simCat,  setSimCat]  = useState<number | null>(null)
  // Parámetros ML Colombia (editables; defaults según cobros reales)
  const [precioPub,   setPrecioPub]   = useState('')        // vacío → usa el sugerido
  const [mlComision,  setMlComision]  = useState('15.5')    // 15,5% es lo más frecuente
  const [mlUmbral,    setMlUmbral]    = useState('60000')   // <umbral envío bajo, ≥umbral alto
  const [mlEnvioBajo, setMlEnvioBajo] = useState('2600')    // envío en precios bajos
  const [mlEnvioAlto, setMlEnvioAlto] = useState('8000')    // envío en precios altos
  const [mlRetenPct,  setMlRetenPct]  = useState('1.91')    // ICA 0,41% + Fuente 1,5%
  const [mlReten,     setMlReten]     = useState(true)      // retenciones si pago con tarjeta
  const [busy,    setBusy]    = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [okMsg,   setOkMsg]   = useState<string | null>(null)

  const loadAll = async () => {
    const [l, h, c, s] = await Promise.all([
      fetch('/api/rates/co/latest').then(r => r.json()),
      fetch('/api/rates/co/history?limit=30').then(r => r.json()),
      fetch('/api/profit-categories').then(r => r.json()),
      fetch('/api/settings').then(r => r.json()).catch(() => ({})),
    ])
    setLatest(l)
    setHistory(Array.isArray(h) ? h : [])
    const list: ProfitCategory[] = Array.isArray(c) ? c : []
    setCats(list)
    setSimCat(prev => prev ?? (list[0]?.id ?? null))
    if (s && typeof s === 'object') {
      if (s.ml_comision)     setMlComision(String(s.ml_comision))
      if (s.ml_umbral_envio) setMlUmbral(String(s.ml_umbral_envio))
      if (s.ml_envio_bajo)   setMlEnvioBajo(String(s.ml_envio_bajo))
      if (s.ml_envio_alto)   setMlEnvioAlto(String(s.ml_envio_alto))
      if (s.ml_reten)        setMlRetenPct(String(s.ml_reten))
    }
  }
  useEffect(() => { loadAll() }, [])

  const saveSettings = async () => {
    setBusy(true); setError(null); setOkMsg(null)
    const res = await fetch('/api/settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ml_comision: mlComision, ml_umbral_envio: mlUmbral,
        ml_envio_bajo: mlEnvioBajo, ml_envio_alto: mlEnvioAlto, ml_reten: mlRetenPct,
      }),
    })
    setBusy(false)
    if (!res.ok) { setError((await res.json()).error ?? 'Error al guardar'); return }
    setOkMsg('Parámetros guardados'); setTimeout(() => setOkMsg(null), 2500)
  }

  const freshness = useMemo(() => {
    if (!latest?.rate_date) return null
    const rd = parseLocalDate(latest.rate_date)
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const days = Math.round((today.getTime() - rd.getTime()) / 86400000)
    return { days, stale: days >= 2 } // la TRM cambia en días hábiles
  }, [latest])

  // Simulador: costo USD + categoría de ganancia → precio en pesos a la TRM.
  const sim = useMemo(() => {
    if (!latest) return null
    const cost = parseFloat(simCost) || 0
    const cat  = cats.find(c => c.id === simCat)
    const pct  = cat ? Number(cat.profit_percentage) : 0
    const baseUsd = cost * (1 + pct / 100)
    return {
      pct,
      directoPesos: cost * latest.trm_rate,
      baseUsd,
      basePesos: baseUsd * latest.trm_rate,
    }
  }, [simCost, simCat, cats, latest])

  const refresh = async () => {
    setBusy(true); setError(null); setOkMsg(null)
    const res = await fetch('/api/rates/co/fetch')
    setBusy(false)
    if (!res.ok) { setError((await res.json()).error ?? 'Error obteniendo la TRM'); return }
    setOkMsg('TRM actualizada'); setTimeout(() => setOkMsg(null), 2500); loadAll()
  }

  if (!latest) return <div className="p-8 text-neutral-500">Cargando…</div>

  const chrono = [...history].slice(0, 30).reverse()

  return (
    <div className="space-y-4">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded">{error}</div>}
      {okMsg && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded">{okMsg}</div>}

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KPICard label="TRM (COP/USD)" value={`$${fmtPeso(latest.trm_rate)}`} accent="text-green-700" />
        <KPICard label="Fuente" value={latest.source === 'api' ? 'Automática' : latest.source} />
        <KPICard label="Registros" value={String(history.length)} />
      </div>

      {/* freshness + refresh */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white rounded-xl border border-neutral-200 shadow-sm px-4 py-3">
        <div className="text-sm">
          {latest.rate_date ? (
            <>
              <span className="text-neutral-500">Última actualización: </span>
              <span className="font-medium">{parseLocalDate(latest.rate_date).toLocaleDateString('es-CO')}</span>
              {freshness && (
                <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${freshness.stale ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                  {freshness.days === 0 ? 'Hoy' : freshness.days === 1 ? 'hace 1 día' : `hace ${freshness.days} días`}
                  {freshness.stale ? ' · revisar' : ''}
                </span>
              )}
            </>
          ) : <span className="text-neutral-400">Sin fecha</span>}
        </div>
        <button onClick={refresh} disabled={busy} className="btn-primary text-sm">
          {busy ? 'Cargando…' : 'Actualizar TRM'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        {/* Simulador */}
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5">
          <h2 className="font-semibold mb-1">Simulador de ganancia</h2>
          <p className="text-xs text-neutral-500 mb-3">Costo (compra + envío) + precio de venta estimado → tu ganancia neta real.</p>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div>
              <label className="text-xs text-neutral-500">Costo (compra+envío) USD</label>
              <input type="number" step="0.01" min={0} value={simCost} onChange={e => setSimCost(e.target.value)}
                className="mt-1 w-full border border-neutral-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-800" />
            </div>
            <div>
              <label className="text-xs text-neutral-500">Categoría <span className="text-neutral-400">(sugiere)</span></label>
              <select value={simCat ?? ''} onChange={e => setSimCat(Number(e.target.value) || null)}
                className="mt-1 w-full border border-neutral-300 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-neutral-800">
                <option value="">—</option>
                {cats.map(c => <option key={c.id} value={c.id}>{c.name} {c.profit_percentage}%</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-neutral-500">Precio de venta estimado (pesos)</label>
              <input type="text" inputMode="numeric"
                value={precioPub ? fmtPeso(Number(precioPub)) : ''}
                onChange={e => setPrecioPub(e.target.value.replace(/\D/g, ''))}
                placeholder={sim ? fmtPeso(sim.basePesos) : '0'}
                className="mt-1 w-full border border-neutral-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-800" />
            </div>
          </div>
          {/* Parámetros + ganancia neta real en ML Colombia */}
          <div className="mt-1 border-t border-neutral-100 pt-4">
            <p className="text-sm font-semibold text-neutral-700 mb-1">Costos de ML Colombia</p>
            <p className="text-[11px] text-neutral-400 mb-2">El envío se elige solo según el umbral: precios bajos pagan menos.</p>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <label className="text-[11px] text-neutral-500">Comisión %</label>
                <input type="number" step="0.5" value={mlComision} onChange={e => setMlComision(e.target.value)}
                  className="mt-1 w-full border border-neutral-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-800" />
              </div>
              <div>
                <label className="text-[11px] text-neutral-500">Umbral envío</label>
                <input type="text" inputMode="numeric" value={mlUmbral ? fmtPeso(Number(mlUmbral)) : ''}
                  onChange={e => setMlUmbral(e.target.value.replace(/\D/g, ''))}
                  className="mt-1 w-full border border-neutral-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-800" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <label className="text-[11px] text-neutral-500">Envío &lt; umbral</label>
                <input type="text" inputMode="numeric" value={mlEnvioBajo ? fmtPeso(Number(mlEnvioBajo)) : ''}
                  onChange={e => setMlEnvioBajo(e.target.value.replace(/\D/g, ''))}
                  className="mt-1 w-full border border-neutral-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-800" />
              </div>
              <div>
                <label className="text-[11px] text-neutral-500">Envío ≥ umbral</label>
                <input type="text" inputMode="numeric" value={mlEnvioAlto ? fmtPeso(Number(mlEnvioAlto)) : ''}
                  onChange={e => setMlEnvioAlto(e.target.value.replace(/\D/g, ''))}
                  className="mt-1 w-full border border-neutral-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-800" />
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
              <label className="flex items-center gap-2 text-xs text-neutral-600">
                <input type="checkbox" checked={mlReten} onChange={e => setMlReten(e.target.checked)} className="accent-neutral-800 w-4 h-4" />
                Retención
                <input type="number" step="0.01" value={mlRetenPct} onChange={e => setMlRetenPct(e.target.value)} disabled={!mlReten}
                  className="w-16 border border-neutral-300 rounded px-1.5 py-0.5 text-xs text-center disabled:opacity-50" />
                % <span className="text-neutral-400">(ICA + Fuente)</span>
              </label>
              <button onClick={saveSettings} disabled={busy}
                className="text-xs px-3 py-1.5 rounded-lg border-2 border-neutral-900/40 font-semibold text-neutral-800 hover:bg-neutral-900 hover:text-white hover:border-neutral-900 transition-colors disabled:opacity-60 whitespace-nowrap">
                {busy ? 'Guardando…' : '💾 Guardar parámetros'}
              </button>
            </div>
            <MlBreakdown
              country="CO"
              totalCost={parseFloat(simCost) || 0}
              ml={{
                ml_comision: mlComision,
                ml_umbral_envio: mlUmbral,
                ml_envio_bajo: mlEnvioBajo,
                ml_envio_alto: mlEnvioAlto,
                ml_reten: mlReten ? mlRetenPct : '0',
              }}
              salePrice={parseFloat(precioPub) || sim?.basePesos || 0}
              coTrm={latest.trm_rate}
            />
          </div>
        </div>

        {/* Columna derecha: gráfico + historial (igualan la altura del simulador) */}
        <div className="flex flex-col gap-4">
        {/* Evolución */}
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5">
          <h2 className="font-semibold mb-3">Evolución TRM (últimos {chrono.length})</h2>
          {chrono.length > 1 ? (
            <div className="relative h-56">
              <Line
                data={{
                  labels: chrono.map(r => r.rate_date ? parseLocalDate(r.rate_date).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' }) : ''),
                  datasets: [
                    { label: 'TRM', data: chrono.map(r => r.trm_rate), borderColor: '#16a34a', backgroundColor: 'transparent', tension: 0.3, pointRadius: 2, borderWidth: 2 },
                  ],
                }}
                options={{
                  responsive: true, maintainAspectRatio: false,
                  interaction: { mode: 'index', intersect: false },
                  plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `TRM: $${fmtPeso(c.parsed.y ?? 0)}` } } },
                  scales: { y: { ticks: { callback: v => '$' + fmtPeso(Number(v)) } }, x: { grid: { display: false } } },
                }}
              />
            </div>
          ) : (
            <div className="text-neutral-400 text-sm text-center py-12">Pocos datos para graficar</div>
          )}
        </div>

        {/* Historial — compacto, scroll, últimos 30 días (solo referencia) */}
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden flex flex-col flex-1 min-h-0">
          <div className="flex-1 min-h-[180px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-neutral-500 text-xs sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-2 text-left">Fecha</th>
                  <th className="px-4 py-2 text-right">TRM</th>
                  <th className="px-4 py-2 text-center">Fuente</th>
                </tr>
              </thead>
              <tbody>
                {history.map((r, i) => (
                  <tr key={r.id} className={`border-t border-neutral-50 hover:bg-neutral-50 ${i % 2 ? 'bg-neutral-50/40' : ''}`}>
                    <td className="px-4 py-2">{r.rate_date ? parseLocalDate(r.rate_date).toLocaleDateString('es-CO') : ''}</td>
                    <td className="px-4 py-2 text-right font-medium">${fmtPeso(r.trm_rate)}</td>
                    <td className="px-4 py-2 text-center text-xs">
                      <span className={`px-2 py-0.5 rounded ${r.source === 'api' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{r.source}</span>
                    </td>
                  </tr>
                ))}
                {history.length === 0 && (
                  <tr><td colSpan={3} className="px-4 py-6 text-center text-neutral-400">Sin historial</td></tr>
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
