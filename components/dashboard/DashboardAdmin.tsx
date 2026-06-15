'use client'
import { useEffect, useState, useMemo } from 'react'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  Title, Tooltip, Legend, Filler,
} from 'chart.js'
import type { ChartOptions } from 'chart.js'
import Link from 'next/link'
import type { Country } from '@/lib/types'
import { KPICard } from '@/components/ui'
import BonusPipeline from './BonusPipeline'
import RateBar from './RateBar'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler)

interface Summary {
  active_products: number
  sales_count_month: number
  sales_amount_month: number
  costs_month: number
  profit_month: number
  profit_pct: number
  low_stock_alerts: number
  no_stock: number
  pending_sales: number
  in_transit: number
  remate_count: number
  reposicion_count: number
  last_month_sales_amount: number
  last_month_profit_amount: number
}

interface ChartPoint { label: string; ventas: number; costos: number; cantidad: number }
interface ChartData {
  chart_data: ChartPoint[]
  summary: { ventas: number; costos: number; ganancia: number; ganancia_pct: number; cantidad: number }
}

type Period = 'today' | 'month' | 'quarter' | 'year'

const money = (n: number) =>
  Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const todayStr = () => new Date().toISOString().slice(0, 10)
const monthStartStr = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10) }

export default function DashboardAdmin({ country }: { country: Country }) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [chart,   setChart]   = useState<ChartData | null>(null)
  // Default to 'month' so today's sales show immediately on the chart.
  const [period,  setPeriod]  = useState<Period | 'custom'>('month')
  const [dateFrom, setDateFrom] = useState(monthStartStr())
  const [dateTo,   setDateTo]   = useState(todayStr())
  const [compraMenu, setCompraMenu] = useState(false)

  useEffect(() => {
    fetch('/api/dashboard/summary').then(r => r.json()).then(setSummary)
  }, [])

  useEffect(() => {
    const url = period === 'custom'
      ? `/api/reports/chart-data?period=custom&date_from=${dateFrom}&date_to=${dateTo}`
      : `/api/reports/chart-data?period=${period}`
    fetch(url).then(r => r.json()).then(setChart)
  }, [period, dateFrom, dateTo])

  const applyCustom = () => setPeriod('custom')

  const chartOptions = useMemo<ChartOptions<'line'>>(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8 } },
      tooltip: {
        callbacks: {
          label: ctx => ctx.dataset.yAxisID === 'y1'
            ? `${ctx.dataset.label}: ${ctx.parsed.y ?? 0}`
            : `${ctx.dataset.label}: $${money(ctx.parsed.y ?? 0)}`,
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        position: 'left',
        ticks: { callback: v => '$' + money(Number(v)) },
        grid: { color: 'rgba(0,0,0,0.05)' },
      },
      y1: {
        beginAtZero: true,
        position: 'right',
        ticks: { callback: v => `${v} v` },
        grid: { drawOnChartArea: false },
      },
      x: { grid: { display: false } },
    },
  }), [])

  if (!summary) return <div className="p-8 text-neutral-500">Cargando…</div>

  // Nota comparativa vs el MISMO tramo de días del mes anterior (solo en período 'mes').
  // Devuelve null si no hay base de comparación (mes anterior en 0).
  const deltaNote = (current: number, previous: number) => {
    if (previous <= 0) return null
    const d   = current - previous
    const pct = Math.round((d / previous) * 1000) / 10
    return (
      <span className={d >= 0 ? 'text-green-600' : 'text-red-600'}>
        {d >= 0 ? '▲' : '▼'} {Math.abs(pct)}%
      </span>
    )
  }
  const salesDelta  = deltaNote(summary.sales_amount_month, summary.last_month_sales_amount)
  const profitDelta = deltaNote(summary.profit_month, summary.last_month_profit_amount)

  return (
    <div className="space-y-6">
      {/* Quick actions */}
      <div className="flex items-center justify-end">
        <div className="flex gap-2">
          <Link href="/ventas?new=1" className="btn-primary text-sm">Nueva venta</Link>
          <div className="relative">
            <button onClick={() => setCompraMenu(v => !v)} className="btn-secondary text-sm">
              Nueva compra ▾
            </button>
            {compraMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setCompraMenu(false)} />
                <div className="absolute right-0 mt-1 w-44 bg-white border border-neutral-200 rounded-lg shadow-lg z-20 overflow-hidden">
                  <Link href="/compras?new=1" className="block px-3 py-2 text-sm hover:bg-neutral-50">Compra local</Link>
                  <Link href="/compras?tab=import&new=1" className="block px-3 py-2 text-sm hover:bg-neutral-50 border-t border-neutral-100">Importación</Link>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {country === 'VE' && <RateBar />}

      {/* Requiere atención — clickable */}
      <div>
        <h2 className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-2">Requiere atención</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KPICard label="Reposición"           value={summary.reposicion_count} accent={summary.reposicion_count > 0 ? 'text-blue-600' : undefined} href="/reportes?tab=stock&sub=reposicion" />
          <KPICard label="Sin stock"            value={summary.no_stock}        accent={summary.no_stock > 0 ? 'text-red-600' : undefined} href="/inventario?estado=SIN_STOCK" />
          <KPICard label="Stock bajo"           value={summary.low_stock_alerts} accent={summary.low_stock_alerts > 0 ? 'text-orange-500' : undefined} href="/inventario?estado=BAJO" />
          <KPICard label="Ventas borrador"      value={summary.pending_sales}   accent={summary.pending_sales > 0 ? 'text-amber-600' : undefined} href="/ventas?estado=BORRADOR" />
          <KPICard label="Compras en tránsito"  value={summary.in_transit}      accent={summary.in_transit > 0 ? 'text-purple-600' : undefined} href="/reportes?tab=transito" />
          <KPICard label="En revisión (remate)" value={summary.remate_count}    accent={summary.remate_count > 0 ? 'text-amber-600' : undefined} href="/reportes?tab=stock&sub=remate" />
        </div>
      </div>

      <BonusPipeline />

      {/* Gráfico con métricas integradas arriba */}
      <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="font-semibold text-neutral-800">Evolución Ventas / Costos / Ganancia</h3>
          <div className="flex gap-1 items-center flex-wrap">
            {(['today','month','quarter','year'] as Period[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1 text-xs rounded ${period === p ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}
              >
                {p === 'today' ? 'Hoy' : p === 'month' ? 'Mes' : p === 'quarter' ? 'Trim.' : 'Año'}
              </button>
            ))}
            <span className="w-px h-5 bg-neutral-200 mx-1" />
            <input type="date" value={dateFrom} max={dateTo} onChange={e => setDateFrom(e.target.value)}
              className={`border rounded px-2 py-1 text-xs ${period === 'custom' ? 'border-neutral-900' : 'border-neutral-200'}`} />
            <span className="text-xs text-neutral-400">–</span>
            <input type="date" value={dateTo} min={dateFrom} max={todayStr()} onChange={e => setDateTo(e.target.value)}
              className={`border rounded px-2 py-1 text-xs ${period === 'custom' ? 'border-neutral-900' : 'border-neutral-200'}`} />
            <button onClick={applyCustom}
              className={`px-3 py-1 text-xs rounded ${period === 'custom' ? 'bg-neutral-900 text-white' : 'bg-neutral-200 text-neutral-700 hover:bg-neutral-300'}`}>
              Aplicar
            </button>
          </div>
        </div>

        {/* métricas del período (period-aware, una sola fuente) */}
        {chart && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="bg-neutral-50 border border-neutral-100 rounded-lg p-3">
              <div className="flex items-center gap-1.5 text-xs text-neutral-500">
                <span className="w-2 h-2 rounded-full bg-green-500" /> Ventas
              </div>
              <div className="text-xl font-bold text-neutral-900 mt-0.5">${money(chart.summary.ventas)}</div>
              {period === 'month' && salesDelta && (
                <div className="text-xs mt-0.5 opacity-70">{salesDelta}</div>
              )}
            </div>
            <div className="bg-neutral-50 border border-neutral-100 rounded-lg p-3">
              <div className="flex items-center gap-1.5 text-xs text-neutral-500">
                <span className="w-2 h-2 rounded-full bg-red-500" /> Costos
              </div>
              <div className="text-xl font-bold text-neutral-900 mt-0.5">${money(chart.summary.costos)}</div>
            </div>
            <div className="bg-neutral-50 border border-neutral-100 rounded-lg p-3">
              <div className="flex items-center gap-1.5 text-xs text-neutral-500">
                <span className="w-2 h-2 rounded-full bg-blue-500" /> Ganancia
              </div>
              <div className="text-xl font-bold text-neutral-900 mt-0.5">${money(chart.summary.ganancia)} <span className="text-sm text-neutral-400">({chart.summary.ganancia_pct}%)</span></div>
              {period === 'month' && profitDelta && (
                <div className="text-xs mt-0.5 opacity-70">{profitDelta}</div>
              )}
            </div>
            <div className="bg-neutral-50 border border-neutral-100 rounded-lg p-3">
              <div className="flex items-center gap-1.5 text-xs text-neutral-500">
                <span className="w-2 h-2 rounded-full bg-purple-500" /> Ventas concretadas
              </div>
              <div className="text-xl font-bold text-neutral-900 mt-0.5">{chart.summary.cantidad} <span className="text-sm text-neutral-400">ventas</span></div>
            </div>
          </div>
        )}

        {chart && chart.chart_data.length > 0 ? (
          <div className="relative h-80">
            <Line
              data={{
                labels: chart.chart_data.map(d => d.label),
                datasets: [
                  { label: 'Ventas ($)',  data: chart.chart_data.map(d => d.ventas), borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.12)', fill: true, tension: 0.4, pointRadius: 2, pointHoverRadius: 5, borderWidth: 2, yAxisID: 'y' },
                  { label: 'Costos ($)',  data: chart.chart_data.map(d => d.costos), borderColor: '#ef4444', backgroundColor: 'transparent', borderDash: [5, 4], tension: 0.4, pointRadius: 2, pointHoverRadius: 5, borderWidth: 2, yAxisID: 'y' },
                  { label: 'Ganancia ($)', data: chart.chart_data.map(d => d.ventas - d.costos), borderColor: '#3b82f6', backgroundColor: 'transparent', tension: 0.4, pointRadius: 2, pointHoverRadius: 5, borderWidth: 2, yAxisID: 'y' },
                  { label: 'Ventas concretadas', data: chart.chart_data.map(d => d.cantidad), borderColor: '#a855f7', backgroundColor: 'transparent', borderDash: [2, 3], tension: 0.4, pointRadius: 2, pointHoverRadius: 5, borderWidth: 2, yAxisID: 'y1' },
                ],
              }}
              options={chartOptions}
            />
          </div>
        ) : (
          <div className="text-neutral-400 text-sm text-center py-12">Sin datos en el período</div>
        )}
      </div>
    </div>
  )
}
