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

const CURRENT_COLOR = '#16a34a'                              // mes actual (verde)
const REF_COLORS = ['rgba(245,158,11,0.55)', 'rgba(99,102,241,0.55)'] // 2 meses atrás (ámbar) → mes anterior (índigo), atenuados

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
      backgroundColor: 'rgba(22,163,74,0.12)',
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
      borderDash: [4, 4],
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
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items) => `Día ${items[0].label}`,
          label: (item) => {
            if (item.parsed.y == null) return ''
            return `${item.dataset.label}: ${item.parsed.y}`
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8, font: { size: 10 }, color: '#9ca3af' },
      },
      y: {
        beginAtZero: true,
        grid: { color: '#f3f4f6' },
        ticks: { precision: 0, font: { size: 10 }, color: '#9ca3af' },
      },
    },
  }

  return (
    <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-xs font-semibold text-neutral-400 uppercase tracking-wide">
          Ventas del mes · {data.current_month}
        </h2>
        <div className="text-sm">
          <span className="font-bold text-green-600">{data.total}</span>
          <span className="text-neutral-400 text-xs"> ventas</span>
        </div>
      </div>

      <div style={{ height: 150 }}>
        <Line data={{ labels, datasets }} options={options} />
      </div>

      {/* Referencia de meses pasados */}
      {data.refs.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-neutral-500">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-0.5 bg-green-500" /> {data.current_month} (actual)
          </span>
          {data.refs.map((r, i) => (
            <span key={r.label} className="flex items-center gap-1">
              <span className="inline-block w-3 border-t-2 border-dashed" style={{ borderColor: REF_COLORS[i] ?? '#d1d5db' }} />
              {r.label}: día {data.today} iba en {r.at_today} · cerró {r.total}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
