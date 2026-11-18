'use client'
import { useEffect, useState, useMemo, useRef } from 'react'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  Title, Tooltip, Legend, Filler,
} from 'chart.js'
import type { ChartOptions } from 'chart.js'
import Link from '@/components/ui/Link'
import type { Country } from '@/lib/types'
import { KPICard, PageHeader, Cargando, chipCls } from '@/components/ui'
import BonusPipeline from './BonusPipeline'
import RateBar from './RateBar'
import { DateField } from '@/components/ui/DateField'
import AvisoStockVerificar from './AvisoStockVerificar'
import BloquesInicio from './BloquesInicio'
import { usePorConfirmar, pendientesPorConfirmar, NumeroBoton } from '@/components/ventas/PorConfirmar'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler)

export interface Summary {
  por_verificar?: number
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
export interface ChartData {
  chart_data: ChartPoint[]
  summary: { ventas: number; costos: number; ganancia: number; ganancia_pct: number; margen_pct?: number; rentabilidad_pct?: number | null; cantidad: number; estimado_pct?: number }
}

type Period = 'today' | 'month' | 'quarter' | 'year'

const money = (n: number) =>
  Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const todayStr = () => new Date().toISOString().slice(0, 10)
const monthStartStr = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10) }

export default function DashboardAdmin({ country, bonos, puedeTasas, descuento, importaciones, analisisStock, etapas = true, categorias = true, porConfirmar = false, reportes = false, inicial }: {
  inicial?: { summary: Summary | null; chart: ChartData | null }   // 12-11: lo que ya vino en el HTML (lib/inicial.ts)
  country: Country; bonos: boolean; puedeTasas: boolean
  reportes?: boolean       // permiso Reportes: «Ver todos» de Más vendidos y «Se están cayendo» (14-11, el Resumen vive aquí)
  porConfirmar?: boolean   // cuentas de ML conectadas: botón "Por confirmar" (principal) + "Nueva venta"
  etapas?: boolean   // módulo compras_etapas (sin él no hay compras en tránsito)
  categorias?: boolean   // módulo precios_categorias (sin él no se muestra el exceso)
  descuento: boolean; importaciones: boolean; analisisStock: boolean   // módulos (lib/modulos.ts)
}) {
  const pc = usePorConfirmar(porConfirmar)
  const [summary, setSummary] = useState<Summary | null>(inicial?.summary ?? null)
  const [chart,   setChart]   = useState<ChartData | null>(inicial?.chart ?? null)
  // Lo que vino en el HTML no se vuelve a pedir al abrir (sí al cambiar el período del gráfico).
  const chartInicial = useRef(!!inicial?.chart)
  // Default to 'month' so today's sales show immediately on the chart.
  const [period,  setPeriod]  = useState<Period | 'custom'>('month')
  const [dateFrom, setDateFrom] = useState(monthStartStr())
  const [dateTo,   setDateTo]   = useState(todayStr())
  const [compraMenu, setCompraMenu] = useState(false)

  const conSummary = !!inicial?.summary
  useEffect(() => {
    if (conSummary) return
    fetch('/api/dashboard/summary').then(r => r.json()).then(setSummary)
  }, [conSummary])

  useEffect(() => {
    if (chartInicial.current) { chartInicial.current = false; if (period === 'month') return }
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
    // 14-11 (el dueño: "más profesional, sutil y que ocupe menos"): sin leyenda (las cifras de arriba llevan el color),
    // sin puntos (aparecen al pasar el mouse), grillas apenas visibles y el eje de ventas concretadas escondido.
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(23,23,23,0.92)', padding: 10, cornerRadius: 8, boxWidth: 8, boxHeight: 8, usePointStyle: true,
        titleFont: { size: 11, weight: 'normal' }, bodyFont: { size: 12 },
        callbacks: {
          label: ctx => ctx.dataset.yAxisID === 'y1'
            ? ` ${ctx.dataset.label}: ${ctx.parsed.y ?? 0}`
            : ` ${ctx.dataset.label}: $${money(ctx.parsed.y ?? 0)}`,
        },
      },
    },
    elements: { point: { radius: 0, hoverRadius: 4, hitRadius: 12 }, line: { tension: 0.35, borderWidth: 2 } },
    scales: {
      y: {
        beginAtZero: true,
        position: 'left',
        border: { display: false },
        ticks: { maxTicksLimit: 4, font: { size: 11 }, color: '#a3a3a3', padding: 6,
          callback: v => { const n = Number(v); return '$' + (n >= 1000 ? `${Math.round(n / 100) / 10}k` : Math.round(n)) } },
        grid: { color: 'rgba(0,0,0,0.04)' },
      },
      y1: { beginAtZero: true, position: 'right', display: false, grid: { drawOnChartArea: false } },
      // Días: "2026-09-14" → "14" (el mes ya se sabe por el período elegido)
      x: {
        border: { display: false },
        grid: { display: false },
        ticks: {
          color: '#a3a3a3', font: { size: 11 }, maxRotation: 0, autoSkipPadding: 12,
          callback(v) {
            const l = String(this.getLabelForValue(Number(v)))
            return /^\d{4}-\d{2}-\d{2}$/.test(l) ? String(Number(l.slice(8))) : l
          },
        },
      },
    },
  }), [])

  if (!summary) return <Cargando />

  // Nota comparativa vs el MISMO tramo de días del mes anterior (solo en período 'mes').
  // Devuelve null si no hay base de comparación (mes anterior en 0).
  const deltaNote = (current: number, previous: number) => {
    if (previous <= 0) return null
    const d   = current - previous
    const pct = Math.round((d / previous) * 1000) / 10
    return (
      <span className={d >= 0 ? 'text-emerald-600' : 'text-red-600'}>
        {d >= 0 ? '▲' : '▼'} {Math.abs(pct)}%
      </span>
    )
  }
  const salesDelta  = deltaNote(summary.sales_amount_month, summary.last_month_sales_amount)
  const profitDelta = deltaNote(summary.profit_month, summary.last_month_profit_amount)

  return (
    <div className="space-y-6">
      <PageHeader title="Inicio" subtitle={country === 'VE' ? <RateBar puedeActualizar={puedeTasas} descuento={descuento} exceso={categorias} /> : 'Cómo va tu negocio'} actions={
        <>
          {porConfirmar && (
            <Link href="/ventas?vista=confirmar" className="btn-secondary text-sm whitespace-nowrap" title="Ventas de MercadoLibre que todavía no están registradas">
              Por confirmar<NumeroBoton n={pendientesPorConfirmar(pc.datos)} cargando={!pc.datos} />
            </Link>
          )}
          <Link href="/ventas?new=1" className={`${porConfirmar ? 'btn-secondary' : 'btn-primary'} text-sm whitespace-nowrap`}>Nueva venta</Link>
          {!importaciones ? (
            <Link href="/compras?new=1" className="btn-secondary text-sm">Nueva compra</Link>
          ) : <div className="relative">
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
          </div>}
        </>
      } />

      <AvisoStockVerificar n={summary.por_verificar ?? 0} />

      {/* Requiere atención — clickable */}
      <div>
        <h2 className="text-sm font-semibold text-neutral-700 mb-2">Requiere atención</h2>
        <div className={`grid grid-cols-2 md:grid-cols-3 gap-3 ${analisisStock ? 'lg:grid-cols-6' : 'lg:grid-cols-4'}`}>
          {analisisStock && <KPICard label="Reposición"           value={summary.reposicion_count} tone={summary.reposicion_count > 0 ? 'atencion' : 'apagado'} href="/inventario/reponer?sub=reposicion" />}
          <KPICard label="Sin stock"            value={summary.no_stock}        tone={summary.no_stock > 0 ? 'problema' : 'apagado'} href="/inventario?estado=SIN_STOCK" />
          <KPICard label="Stock bajo"           value={summary.low_stock_alerts} tone={summary.low_stock_alerts > 0 ? 'atencion' : 'apagado'} href="/inventario?estado=BAJO" />
          <KPICard label="Ventas borrador"      value={summary.pending_sales}   tone={summary.pending_sales > 0 ? 'atencion' : 'apagado'} href="/ventas?estado=BORRADOR" />
          {etapas && <KPICard label="Compras en tránsito"  value={summary.in_transit}      tone={summary.in_transit > 0 ? 'neutro' : 'apagado'} href="/reportes?tab=transito" />}
          {analisisStock && <KPICard label="En revisión (remate)" value={summary.remate_count}    tone={summary.remate_count > 0 ? 'atencion' : 'apagado'} href="/inventario/reponer?sub=remate" />}
        </div>
      </div>

      {/* Bonos: solo VE (no aplica en CO).
          Los `!` pisan el gap del space-y-6 para que la barra quede más
          pegada a las cards de arriba y al gráfico de abajo. */}
      {country === 'VE' && bonos && (
        <div className="mt-3!">
          <BonusPipeline detalle />
        </div>
      )}

      {/* Gráfico con métricas integradas arriba */}
      <div className={`bg-white rounded-xl border border-neutral-200 px-4 pb-3 pt-4 shadow-sm ${country === 'VE' ? 'mt-2.5!' : ''}`}>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="font-semibold text-neutral-900">Ventas, costos y ganancia</h3>
          <div className="flex gap-1.5 items-center flex-wrap">
            {(['today','month','quarter','year'] as Period[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={chipCls(period === p)}
              >
                {p === 'today' ? 'Hoy' : p === 'month' ? 'Mes' : p === 'quarter' ? 'Trim.' : 'Año'}
              </button>
            ))}
            <span className="w-px h-5 bg-neutral-200 mx-1" />
            <DateField value={dateFrom} max={dateTo} onChange={(v: string) => setDateFrom(v)}
              className={`border rounded-lg px-2 py-1 text-xs ${period === 'custom' ? 'border-neutral-900' : 'border-neutral-200'}`} />
            <span className="text-xs text-neutral-400">–</span>
            <DateField value={dateTo} min={dateFrom} max={todayStr()} onChange={(v: string) => setDateTo(v)}
              className={`border rounded-lg px-2 py-1 text-xs ${period === 'custom' ? 'border-neutral-900' : 'border-neutral-200'}`} />
            <button onClick={applyCustom} className={chipCls(period === 'custom')}>
              Aplicar
            </button>
          </div>
        </div>

        {/* métricas del período (period-aware, una sola fuente); el punto de color es la leyenda del gráfico */}
        {chart && (
          <div className="mb-3 grid grid-cols-2 gap-y-3 md:grid-cols-4 md:divide-x md:divide-neutral-100">
            <Cifra color="bg-emerald-500" titulo="Ventas" valor={`$${money(chart.summary.ventas)}`} nota={period === 'month' ? salesDelta : null} />
            <Cifra color="bg-red-300" titulo="Costos" valor={`$${money(chart.summary.costos)}`} />
            <Cifra color="bg-neutral-900" titulo="Ganancia" valor={`$${money(chart.summary.ganancia)}`}
              nota={<>{period === 'month' && profitDelta}{period === 'month' && profitDelta ? ' · ' : ''}{chart.summary.rentabilidad_pct != null && <span className="text-neutral-400 cursor-help"
                title={`Rentabilidad sobre costo: ganancia ÷ lo que te costó la mercancía vendida. Ganaste $${chart.summary.rentabilidad_pct.toLocaleString('de-DE')} por cada $100 en mercancía. Es la misma cuenta que ves en cada producto. No descuenta gastos del mes ni, en VE, la diferencia oficial/paralelo.`}>
                Rentabilidad {chart.summary.rentabilidad_pct.toLocaleString('de-DE')}%</span>}</>} />
            <Cifra color="bg-lime-400" titulo="Ventas concretadas" valor={chart.summary.cantidad.toLocaleString('es-VE')}
              nota={chart.summary.cantidad > 0 ? <span className="text-neutral-400" title="Lo que deja en promedio cada venta (vendido ÷ ventas)">Ticket promedio ${money(chart.summary.ventas / chart.summary.cantidad)}</span> : null} />
          </div>
        )}
        {/* Mig 180: productos importados con costo estimado → la ganancia de esas ventas es aproximada. */}
        {chart && (chart.summary.estimado_pct ?? 0) > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-900">
            <span>
              El <b>{chart.summary.estimado_pct} %</b> de lo vendido en este período usa <b>costo estimado</b>: la ganancia es aproximada.
            </span>
            <Link href="/productos/costos" className="font-medium underline underline-offset-2 hover:text-amber-950">Completar costos</Link>
          </div>
        )}

        {chart && chart.chart_data.length > 0 ? (
          <div className="relative h-52">
            <Line
              data={{
                labels: chart.chart_data.map(d => d.label),
                datasets: [
                  { label: 'Ventas', data: chart.chart_data.map(d => d.ventas), borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.07)', fill: true, yAxisID: 'y', pointBackgroundColor: '#10b981' },
                  { label: 'Ganancia', data: chart.chart_data.map(d => d.ventas - d.costos), borderColor: '#262626', backgroundColor: 'transparent', borderWidth: 1.75, yAxisID: 'y', pointBackgroundColor: '#262626' },
                  { label: 'Costos', data: chart.chart_data.map(d => d.costos), borderColor: '#fca5a5', backgroundColor: 'transparent', borderWidth: 1.5, borderDash: [4, 4], yAxisID: 'y', pointBackgroundColor: '#f87171' },
                  { label: 'Ventas concretadas', data: chart.chart_data.map(d => d.cantidad), borderColor: 'rgba(132,204,22,0.55)', backgroundColor: 'transparent', borderWidth: 1.5, borderDash: [2, 3], yAxisID: 'y1', pointBackgroundColor: '#84cc16' },
                ],
              }}
              options={chartOptions}
            />
          </div>
        ) : (
          <div className="text-neutral-400 text-sm text-center py-10">Sin datos en el período</div>
        )}
      </div>

      {/* 14-11: lo que era Reportes → Resumen, con el mismo período del gráfico */}
      <BloquesInicio period={period} dateFrom={period === 'custom' ? dateFrom : undefined} dateTo={period === 'custom' ? dateTo : undefined}
        reportes={reportes} cayendo={reportes && analisisStock} />
    </div>
  )
}

// Una cifra del período: punto de color (= su línea en el gráfico), título, valor y una nota chica.
function Cifra({ color, titulo, valor, nota }: { color: string; titulo: string; valor: string; nota?: React.ReactNode }) {
  return (
    <div className="min-w-0 md:px-4 md:first:pl-0">
      <div className="flex items-center gap-1.5 text-xs text-neutral-500"><span className={`h-2 w-2 rounded-full ${color}`} />{titulo}</div>
      <div className="num mt-0.5 text-lg font-semibold tracking-tight text-neutral-900">{valor}</div>
      {nota && <div className="truncate text-xs">{nota}</div>}
    </div>
  )
}
