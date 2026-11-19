'use client'
import { useEffect, useState } from 'react'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler,
} from 'chart.js'
import type { ChartOptions } from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler)

interface Point { day: number; cumulative: number | null }
interface RefMonth { label: string; total: number; at_today: number; cumulative: (number | null)[] }
interface Data {
  current_month: string
  total: number
  days_in_month: number
  today: number
  points: Point[]
  refs: RefMonth[]
}

// 19-11 (guía dataviz): el mes actual en el azul de «Ventas» del Inicio; los meses de referencia en grises sólidos (el
// mes anterior más oscuro), sin punteados. refs viene de más viejo a más nuevo: el último es el mes anterior.
const CURRENT_COLOR = '#2a78d6'
const REF_COLORS = ['#d4d4cf', '#a3a39e']

export default function SalesMiniChart() {
  const [data, setData] = useState<Data | null>(null)

  useEffect(() => {
    fetch('/api/dashboard/my-sales-monthly').then(r => r.json()).then(setData)
  }, [])

  if (!data) return null

  const labels = data.points.map(p => String(p.day))

  const datasets = [
    {
      label: data.current_month,
      data: data.points.map(p => p.cumulative),
      borderColor: CURRENT_COLOR,
      backgroundColor: 'rgba(42,120,214,0.08)',
      fill: true,
      tension: 0.3,
      pointRadius: 0,
      pointHoverRadius: 4,
      borderWidth: 2,
      spanGaps: false,
    },
    ...data.refs.map((r, i) => ({
      label: r.label,
      data: r.cumulative,
      borderColor: REF_COLORS[i] ?? '#d1d5db',
      borderWidth: 1.5,
      pointRadius: 0,
      pointHoverRadius: 0,
      fill: false,
      tension: 0.3,
      spanGaps: false,
    })),
  ]

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },   // leyenda en HTML, debajo
      tooltip: {
        backgroundColor: 'rgba(23,23,23,0.94)', padding: 10, cornerRadius: 8, boxWidth: 8, boxHeight: 8, boxPadding: 4, usePointStyle: true,
        titleFont: { size: 12, weight: 'bold' }, bodyFont: { size: 12 },
        callbacks: {
          title: (items) => `Día ${items[0].label}`,
          label: (item) => item.parsed.y == null ? '' : ` ${item.dataset.label}: ${item.parsed.y} ventas`,
        },
      },
    },
    scales: {
      x: {
        border: { display: false },
        grid: { display: false },
        ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8, font: { size: 11 }, color: '#8a8a85' },
      },
      y: {
        beginAtZero: true,
        border: { display: false },
        grid: { color: 'rgba(0,0,0,0.05)' },
        ticks: { precision: 0, maxTicksLimit: 5, font: { size: 11 }, color: '#8a8a85', padding: 8 },
      },
    },
  }

  // El mes anterior a esta misma fecha (último de refs) para el ▲▼ de la cifra.
  const anterior = data.refs[data.refs.length - 1]
  const pct = anterior && anterior.at_today > 0 ? Math.round(((data.total - anterior.at_today) / anterior.at_today) * 1000) / 10 : null

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-neutral-100 px-4 py-3 sm:px-5">
        <div>
          <h2 className="font-semibold text-neutral-900">Ventas del mes</h2>
          <p className="text-xs text-neutral-500 first-letter:uppercase">{data.current_month} · cuántas van sumadas día a día</p>
        </div>
        <div className="text-right">
          <div className="flex items-center justify-end gap-1.5">
            <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: CURRENT_COLOR }} />
            <span className="num text-3xl font-semibold tracking-tight text-neutral-900">{data.total.toLocaleString('es-VE')}</span>
            <span className="text-sm text-neutral-500">ventas</span>
          </div>
          {pct != null && (
            <div className="text-xs">
              <span className={`num font-medium ${pct >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{pct >= 0 ? '▲' : '▼'} {Math.abs(pct).toLocaleString('de-DE')}%</span>
              <span className="text-neutral-500"> que el mes pasado a la fecha</span>
            </div>
          )}
        </div>
      </div>

      <div className="px-3 pb-3 pt-3 sm:px-4">
        <div className="relative h-52" role="img" aria-label={`Ventas acumuladas del mes: ${data.total}`}>
          <Line data={{ labels, datasets }} options={options} />
        </div>
        {/* Leyenda: el mes actual y cómo iban los anteriores a esta misma fecha */}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-neutral-600">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full" style={{ background: CURRENT_COLOR }} />Este mes
          </span>
          {data.refs.map((r, i) => (
            <span key={r.label} className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full" style={{ background: REF_COLORS[i] ?? '#d4d4cf' }} />
              <span className="first-letter:uppercase">{r.label}</span>: el día {data.today} iba en <b className="num font-medium text-neutral-800">{r.at_today}</b> · cerró en <b className="num font-medium text-neutral-800">{r.total}</b>
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
