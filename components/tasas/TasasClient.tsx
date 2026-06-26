'use client'
import { useEffect, useState, useMemo } from 'react'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend,
} from 'chart.js'
import { KPICard, money } from '@/components/ui'
import { calcSpreadAndDiscount } from '@/lib/rateUtils'

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

// Fila etiqueta/valor del desglose neto ML
function RowVe({ label, value, neg }: { label: string; value: string; neg?: boolean }) {
  return (
    <div className="flex justify-between items-center px-3 text-neutral-600">
      <span>{label}</span>
      <span className={neg ? 'text-red-500' : ''}>{value}</span>
    </div>
  )
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

  const [histPage, setHistPage] = useState(1)
  const HIST_PAGE_SIZE = 10

  const loadAll = async () => {
    const [l, h, s] = await Promise.all([
      fetch('/api/rates/latest').then(r => r.json()),
      fetch('/api/rates/history?limit=365').then(r => r.json()),
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
    const days = Math.floor((Date.now() - new Date(latest.rate_date).getTime()) / 86400000)
    return { days, stale: days >= 1 }
  }, [latest])

  // ── live preview of excess change ──
  const excessPreview = useMemo(() => {
    if (!latest) return null
    const ex = parseFloat(excess)
    if (isNaN(ex)) return null
    return calcSpreadAndDiscount(latest.official_rate, latest.parallel_rate, ex)
  }, [excess, latest])

  // ── price simulator ──
  const sim = useMemo(() => {
    if (!latest) return null
    const usd = parseFloat(simUsd) || 0
    const disc = latest.recommended_discount / 100
    return {
      oficial:    usd * latest.official_rate,
      paralelo:   usd * latest.parallel_rate,
      sugerido:   usd * latest.official_rate * (1 - disc),
    }
  }, [simUsd, latest])

  // Neto real ML Venezuela: comisión en bolívares → lo que queda se cambia a paralelo,
  // menos el envío. Ganancia = neto − costo. Envío gratis solo desde el umbral ($5).
  const veNet = useMemo(() => {
    if (!latest || latest.parallel_rate <= 0) return null
    const precio = parseFloat(simUsd) || 0
    const recibesParalelo = precio * latest.official_rate / latest.parallel_rate
    const comisionPct = parseFloat(veComision) || 0
    const umbral = parseFloat(veUmbral) || 5
    const envioBase = parseFloat(veEnvio) || 0
    const envio = precio > 0 ? envioBase * Math.min(1, precio / umbral) : 0
    const neto = recibesParalelo * (1 - comisionPct / 100) - envio
    const costo = parseFloat(simCost) || 0
    const ganancia = neto - costo
    return { precio, recibesParalelo, comisionPct, envio, neto, costo, ganancia, margen: costo > 0 ? ganancia / costo * 100 : 0 }
  }, [simUsd, simCost, veComision, veEnvio, veUmbral, latest])

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

  // historial paginado (10 por página)
  const histTotalPages = Math.max(1, Math.ceil(history.length / HIST_PAGE_SIZE))
  const histClampedPage = Math.min(histPage, histTotalPages)
  const histStart = (histClampedPage - 1) * HIST_PAGE_SIZE
  const histPageRows = history.slice(histStart, histStart + HIST_PAGE_SIZE)

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

      {/* freshness + BCV */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white rounded-xl border border-neutral-200 shadow-sm px-4 py-3">
        <div className="text-sm">
          {latest.rate_date ? (
            <>
              <span className="text-neutral-500">Última actualización: </span>
              <span className="font-medium">{new Date(latest.rate_date).toLocaleDateString('es-VE')}</span>
              <span className="text-neutral-400"> ({latest.source})</span>
              {freshness && (
                <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${freshness.stale ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                  {freshness.days === 0 ? 'Hoy' : freshness.days === 1 ? 'hace 1 día' : `hace ${freshness.days} días`}
                  {freshness.stale ? ' · desactualizada' : ''}
                </span>
              )}
            </>
          ) : <span className="text-neutral-400">Sin fecha</span>}
        </div>
        <button onClick={fetchBcv} disabled={busy} className="btn-primary text-sm">
          {busy ? 'Cargando…' : 'Actualizar desde BCV'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Price simulator */}
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5">
          <h2 className="font-semibold mb-1">Simulador de precio</h2>
          <p className="text-xs text-neutral-500 mb-3">Cuánto cobrar en bolívares por un producto en USD</p>
          <div className="flex items-end gap-3 mb-4">
            <div className="flex-1">
              <label className="text-xs text-neutral-500">Precio USD</label>
              <input type="number" step="0.01" min={0} value={simUsd} onChange={e => setSimUsd(e.target.value)}
                className="mt-1 w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div className="flex-1">
              <label className="text-xs text-neutral-500">Costo USD <span className="text-neutral-400">(opcional)</span></label>
              <input type="number" step="0.01" min={0} value={simCost} onChange={e => setSimCost(e.target.value)}
                placeholder="0.00" className="mt-1 w-full border rounded px-3 py-2 text-sm" />
            </div>
          </div>
          {sim && (
            <div className="space-y-2">
              <div className="flex justify-between items-center bg-neutral-50 rounded-lg px-3 py-2 text-sm">
                <span className="text-neutral-500">A tasa oficial</span>
                <span className="font-semibold">Bs {money(sim.oficial)}</span>
              </div>
              <div className="flex justify-between items-center bg-neutral-50 rounded-lg px-3 py-2 text-sm">
                <span className="text-neutral-500">A tasa paralela <span className="text-neutral-400">(referencia)</span></span>
                <span className="font-semibold">Bs {money(sim.paralelo)}</span>
              </div>
              <div className="flex justify-between items-center bg-blue-50 rounded-lg px-3 py-2 text-sm">
                <span className="text-blue-700">Precio sugerido (oficial − {latest.recommended_discount}%)</span>
                <span className="font-bold text-blue-700">Bs {money(sim.sugerido)}</span>
              </div>
            </div>
          )}

          {/* Ganancia neta real en ML Venezuela */}
          <div className="mt-4 border-t border-neutral-100 pt-4">
            <p className="text-sm font-semibold text-neutral-700 mb-2">Ganancia neta en ML Venezuela</p>
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
            <button onClick={saveSettings} disabled={busy} className="btn-secondary text-xs mb-3">
              {busy ? 'Guardando…' : 'Guardar parámetros'}
            </button>
            {veNet && (
              <div className="space-y-1.5 text-sm">
                <RowVe label="Precio (USD)" value={`$${money(veNet.precio)}`} />
                <RowVe label="Lo que recibes (paralelo)" value={`$${money(veNet.recibesParalelo)}`} />
                <RowVe label={`− Comisión (${veNet.comisionPct}%, en Bs)`} value={`−$${money(veNet.recibesParalelo * veNet.comisionPct / 100)}`} neg />
                <RowVe label="− Envío" value={`−$${money(veNet.envio)}`} neg />
                <div className="flex justify-between items-center bg-neutral-100 rounded px-3 py-1.5 font-semibold">
                  <span>Neto recibido</span><span>${money(veNet.neto)}</span>
                </div>
                {veNet.costo > 0 && (
                  <>
                    <RowVe label="− Tu costo" value={`−$${money(veNet.costo)}`} neg />
                    <div className={`flex justify-between items-center rounded px-3 py-2 font-bold ${veNet.ganancia >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                      <span>Ganancia ({veNet.margen >= 0 ? '+' : ''}{veNet.margen.toFixed(1)}%)</span>
                      <span>${money(veNet.ganancia)}</span>
                    </div>
                  </>
                )}
              </div>
            )}
            <div className="mt-3 text-[11px] text-neutral-500 bg-neutral-50 rounded-lg p-3 leading-relaxed">
              <b>Cómo se calcula:</b> ML descuenta la comisión ({veComision}%) sobre el precio en bolívares; lo que queda se cambia a <b>dólar paralelo</b> (por eso se multiplica sobre "lo que recibes"). El <b>envío</b> (${veEnvio}) es gratis solo desde <b>${veUmbral}</b>: si el precio es menor, el cliente debe juntar varias unidades hasta llegar a ${veUmbral}, así que el costo de envío se reparte → <b>envío = ${veEnvio} × (precio / {veUmbral})</b>. Ej: precio $2 → envío ≈ ${money((parseFloat(veEnvio) || 0) * 2 / (parseFloat(veUmbral) || 5))}.
            </div>
          </div>
        </div>

        {/* Evolution chart */}
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5">
          <h2 className="font-semibold mb-3">Evolución (últimos {chrono.length})</h2>
          {chrono.length > 1 ? (
            <div className="relative h-56">
              <Line
                data={{
                  labels: chrono.map(r => r.rate_date ? new Date(r.rate_date).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit' }) : ''),
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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Manual entry */}
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5">
          <h2 className="font-semibold mb-3">Entrada manual</h2>
          <div className="grid grid-cols-3 gap-3 items-end">
            <div>
              <label className="text-xs text-neutral-500">Tasa oficial</label>
              <input type="number" step="0.01" value={official} onChange={e => setOfficial(e.target.value)}
                className="mt-1 w-full border rounded px-3 py-2 text-sm" placeholder="0.00" />
            </div>
            <div>
              <label className="text-xs text-neutral-500">Tasa paralela</label>
              <input type="number" step="0.01" value={parallel} onChange={e => setParallel(e.target.value)}
                className="mt-1 w-full border rounded px-3 py-2 text-sm" placeholder="0.00" />
            </div>
            <button onClick={saveManual} disabled={busy || !official || !parallel} className="btn-primary">Guardar</button>
          </div>
        </div>

        {/* Excess % with live preview */}
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5">
          <h2 className="font-semibold mb-1">% Exceso</h2>
          <p className="text-xs text-neutral-500 mb-3">Margen del precio publicado sobre el base. Afecta el descuento recomendado.</p>
          <div className="grid grid-cols-3 gap-3 items-end">
            <div>
              <label className="text-xs text-neutral-500">Exceso %</label>
              <input type="number" step="0.1" min={0} max={500} value={excess} onChange={e => setExcess(e.target.value)}
                className="mt-1 w-full border rounded px-3 py-2 text-sm" />
            </div>
            <button onClick={saveExcess} disabled={busy} className="btn-secondary">Actualizar</button>
            {excessPreview && (
              <div className="text-sm">
                <div className="text-xs text-neutral-500">Descuento resultante</div>
                <div className={`font-bold ${Math.abs(excessPreview.recommended_discount - latest.recommended_discount) > 0.01 ? 'text-blue-600' : 'text-neutral-900'}`}>
                  {excessPreview.recommended_discount}%
                  {Math.abs(excessPreview.recommended_discount - latest.recommended_discount) > 0.01 && (
                    <span className="text-xs text-neutral-400 ml-1">(actual {latest.recommended_discount}%)</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* History */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-neutral-100 bg-neutral-50">
          <h2 className="font-semibold">Historial ({history.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-500 text-xs">
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
              {histPageRows.map((r, i) => (
                <tr key={r.id} className={`border-t border-neutral-50 hover:bg-neutral-50 ${i % 2 ? 'bg-neutral-50/40' : ''}`}>
                  <td className="px-4 py-2">{r.rate_date ? new Date(r.rate_date).toLocaleDateString('es-VE') : ''}</td>
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
        {history.length > HIST_PAGE_SIZE && (
          <div className="px-5 py-3 border-t border-neutral-100 flex items-center justify-between text-sm">
            <span className="text-neutral-500">
              {histStart + 1}–{Math.min(histStart + HIST_PAGE_SIZE, history.length)} de {history.length}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setHistPage(p => Math.max(1, p - 1))}
                disabled={histClampedPage <= 1}
                className="px-3 py-1.5 rounded-lg border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ← Anterior
              </button>
              <span className="text-neutral-500">{histClampedPage} / {histTotalPages}</span>
              <button
                onClick={() => setHistPage(p => Math.min(histTotalPages, p + 1))}
                disabled={histClampedPage >= histTotalPages}
                className="px-3 py-1.5 rounded-lg border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Siguiente →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
