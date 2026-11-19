'use client'
import { useEffect, useState, useMemo, useRef } from 'react'
import { Chart } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement, BarElement, BarController, LineController,
  Tooltip, Filler,
} from 'chart.js'
import type { ChartOptions, ChartData as ChartJsData } from 'chart.js'
import Link from '@/components/ui/Link'
import type { Country } from '@/lib/types'
import { Cargando, chipCls } from '@/components/ui'
import BonusPipeline from './BonusPipeline'
import RateBar from './RateBar'
import { DateField } from '@/components/ui/DateField'
import AvisoStockVerificar from './AvisoStockVerificar'
import BloquesInicio from './BloquesInicio'
import { usePorConfirmar, pendientesPorConfirmar } from '@/components/ventas/PorConfirmar'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, BarController, LineController, Tooltip, Filler)

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

interface ChartPoint { label: string; ventas: number; costos: number; cantidad: number; anterior?: number }
export interface ChartData {
  chart_data: ChartPoint[]
  summary: { ventas: number; costos: number; ganancia: number; ganancia_pct: number; margen_pct?: number; rentabilidad_pct?: number | null; cantidad: number; estimado_pct?: number }
  /** 19-11: el mismo tramo del período anterior (para el ▲▼ de las cifras). */
  anterior?: { ventas: number; ganancia: number; cantidad: number }
}

type Period = 'today' | 'month' | 'quarter' | 'year'

// 19-11 (Inicio nuevo, guía dataviz): dos series con colores validados (azul = ventas, naranja = ganancia; pasan las
// pruebas de daltonismo y contraste) y el período anterior en gris, sin punteados. El texto nunca va del color de la
// serie: el puntito de color al lado es el que dice cuál es.
const AZUL = '#2a78d6', NARANJA = '#eb6834', GRIS = '#b5b5b0'

const money = (n: number) =>
  Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const money0 = (n: number) =>
  Number(n).toLocaleString('de-DE', { maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2 })

const todayStr = () => new Date().toISOString().slice(0, 10)
const monthStartStr = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10) }

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
/** Etiqueta del eje: día «19», hora «14 h», mes «nov». */
function etiquetaCorta(l: string) {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(l)) return `${Number(l.slice(11))} h`
  if (/^\d{4}-\d{2}-\d{2}$/.test(l)) return String(Number(l.slice(8)))
  if (/^\d{4}-\d{2}$/.test(l)) return MESES[Number(l.slice(5)) - 1] ?? l
  return l
}
/** Título del detalle al pasar el mouse: «19 nov», «19 nov, 14 h», «nov 2026». */
function etiquetaLarga(l: string) {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(l)) return `${Number(l.slice(8, 10))} ${MESES[Number(l.slice(5, 7)) - 1]}, ${Number(l.slice(11))} h`
  if (/^\d{4}-\d{2}-\d{2}$/.test(l)) return `${Number(l.slice(8))} ${MESES[Number(l.slice(5, 7)) - 1]}`
  if (/^\d{4}-\d{2}$/.test(l)) return `${MESES[Number(l.slice(5)) - 1]} ${l.slice(0, 4)}`
  return l
}

const CONTRA: Record<Period | 'custom', string> = {
  today: 'que ayer a esta hora', month: 'que el mes pasado a la fecha', quarter: 'que los 3 meses anteriores',
  year: 'que el año pasado a la fecha', custom: 'que los mismos días justo antes',
}
const ANTERIOR: Record<Period | 'custom', string> = {
  today: 'Ayer', month: 'Mes pasado', quarter: '3 meses anteriores', year: 'Año pasado', custom: 'Días anteriores',
}

/** ▲▼ % contra el período anterior (null si antes fue 0: no hay con qué comparar). */
function Delta({ ahora, antes }: { ahora: number; antes: number | undefined }) {
  if (antes == null || antes <= 0) return null
  const pct = Math.round(((ahora - antes) / antes) * 1000) / 10
  if (pct === 0) return <span className="text-neutral-500">igual</span>
  return (
    <span className={`num font-medium ${pct > 0 ? 'text-emerald-700' : 'text-red-600'}`}>
      {pct > 0 ? '▲' : '▼'} {Math.abs(pct).toLocaleString('de-DE')}%
    </span>
  )
}

export default function DashboardAdmin({ country, bonos, puedeTasas, descuento, importaciones, analisisStock, etapas = true, categorias = true, porConfirmar = false, reportes = false, inicial }: {
  inicial?: { summary: Summary | null; chart: ChartData | null }   // 12-11: lo que ya vino en el HTML (lib/inicial.ts)
  country: Country; bonos: boolean; puedeTasas: boolean
  reportes?: boolean       // permiso Reportes: «Ver todos» de Más vendidos y «Se están cayendo» (14-11, el Resumen vive aquí)
  porConfirmar?: boolean   // cuentas de ML conectadas: pendiente «Por confirmar»
  etapas?: boolean   // módulo compras_etapas (sin él no hay compras en tránsito)
  categorias?: boolean   // módulo precios_categorias (sin él no se muestra el exceso)
  descuento: boolean; importaciones: boolean; analisisStock: boolean   // módulos (lib/modulos.ts)
}) {
  const pc = usePorConfirmar(porConfirmar)
  const [summary, setSummary] = useState<Summary | null>(inicial?.summary ?? null)
  const [chart,   setChart]   = useState<ChartData | null>(inicial?.chart ?? null)
  // Lo que vino en el HTML no se vuelve a pedir al abrir (sí al cambiar el período).
  const chartInicial = useRef(!!inicial?.chart)
  const [period,  setPeriod]  = useState<Period | 'custom'>('month')
  const [dateFrom, setDateFrom] = useState(monthStartStr())
  const [dateTo,   setDateTo]   = useState(todayStr())
  const [compraMenu, setCompraMenu] = useState(false)
  const [caen, setCaen] = useState<number | null>(null)
  const conCayendo = reportes && analisisStock

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

  // «Se están cayendo» (regla de Reportes → Stock): va con los pendientes; se pide después de abrir.
  useEffect(() => {
    if (!conCayendo) return
    let vivo = true
    const t = setTimeout(() => {
      fetch('/api/reports/stock-analysis').then(r => r.ok ? r.json() : Promise.reject())
        .then(j => { if (vivo) setCaen((j.declive ?? []).length) }).catch(() => {})
    }, 300)
    return () => { vivo = false; clearTimeout(t) }
  }, [conCayendo])

  const datosGrafico = useMemo<ChartJsData<'bar' | 'line'> | null>(() => {
    if (!chart?.chart_data.length) return null
    const d = chart.chart_data
    return {
      labels: d.map(p => p.label),
      datasets: [
        { type: 'bar' as const, label: 'Ventas', data: d.map(p => p.ventas), backgroundColor: AZUL, hoverBackgroundColor: '#1f63b5',
          borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: 'bottom' as const, maxBarThickness: 22, categoryPercentage: 0.78, barPercentage: 0.9, order: 3 },
        { type: 'line' as const, label: 'Ganancia', data: d.map(p => p.ventas - p.costos), borderColor: NARANJA, backgroundColor: NARANJA,
          borderWidth: 2, pointBackgroundColor: NARANJA, pointBorderColor: '#fff', pointBorderWidth: 2, order: 1 },
        { type: 'line' as const, label: `Ventas · ${ANTERIOR[period].toLowerCase()}`, data: d.map(p => p.anterior ?? 0), borderColor: GRIS, backgroundColor: GRIS,
          borderWidth: 1.5, pointBackgroundColor: GRIS, pointBorderColor: '#fff', pointBorderWidth: 2, order: 2 },
      ],
    }
  }, [chart, period])

  const chartOptions = useMemo<ChartOptions<'bar' | 'line'>>(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },   // la leyenda va en HTML, arriba del gráfico
      tooltip: {
        backgroundColor: 'rgba(23,23,23,0.94)', padding: 10, cornerRadius: 8, boxWidth: 8, boxHeight: 8, boxPadding: 4, usePointStyle: true,
        titleFont: { size: 12, weight: 'bold' }, bodyFont: { size: 12 }, footerFont: { size: 11, weight: 'normal' }, footerColor: '#d4d4d4',
        callbacks: {
          title: items => etiquetaLarga(String(items[0]?.label ?? '')),
          label: ctx => ` ${ctx.dataset.label}: $${money(ctx.parsed.y ?? 0)}`,
          footer: items => {
            const p = chart?.chart_data[items[0]?.dataIndex ?? -1]
            if (!p) return ''
            return [`Costos: $${money(p.costos)}`, `Ventas concretadas: ${p.cantidad}`]
          },
        },
      },
    },
    elements: { point: { radius: 0, hoverRadius: 5, hitRadius: 14 }, line: { tension: 0.35 } },
    scales: {
      y: {
        beginAtZero: true,
        border: { display: false },
        ticks: { maxTicksLimit: 5, font: { size: 11 }, color: '#8a8a85', padding: 8,
          callback: v => { const n = Number(v); return '$' + (Math.abs(n) >= 1000 ? `${Math.round(n / 100) / 10}k` : Math.round(n)) } },
        grid: { color: 'rgba(0,0,0,0.05)' },
      },
      x: {
        border: { display: false },
        grid: { display: false },
        ticks: {
          color: '#8a8a85', font: { size: 11 }, maxRotation: 0, autoSkipPadding: 14,
          callback(v) { return etiquetaCorta(String(this.getLabelForValue(Number(v)))) },
        },
      },
    },
  }), [chart])

  if (!summary) return <Cargando />

  const s = chart?.summary
  const ant = chart?.anterior
  const contra = CONTRA[period]

  // ── Pendientes: solo lo que tiene algo, por urgencia. Lo que está en 0 va en una línea gris. ──
  type Pend = { label: string; n: number | null; tono: 'problema' | 'atencion' | 'info'; href: string; ayuda: string }
  const pendientes: Pend[] = [
    ...(porConfirmar ? [{ label: 'Por confirmar', n: pc.datos ? pendientesPorConfirmar(pc.datos) : null, tono: 'atencion' as const, href: '/ventas?vista=confirmar', ayuda: 'Ventas de MercadoLibre que todavía no registraste' }] : []),
    { label: 'Sin stock', n: summary.no_stock, tono: 'problema', href: '/inventario?estado=SIN_STOCK', ayuda: 'Productos activos en 0' },
    ...(analisisStock ? [{ label: 'Reposición', n: summary.reposicion_count, tono: 'atencion' as const, href: '/inventario/reponer?sub=reposicion', ayuda: 'Lo que tienes no alcanza para lo que tarda en llegar' }] : []),
    { label: 'Stock bajo', n: summary.low_stock_alerts, tono: 'atencion', href: '/inventario?estado=BAJO', ayuda: 'Por debajo del mínimo' },
    { label: 'Ventas en borrador', n: summary.pending_sales, tono: 'atencion', href: '/ventas?estado=BORRADOR', ayuda: 'Ventas sin terminar de cargar' },
    ...(conCayendo ? [{ label: 'Se están cayendo', n: caen, tono: 'atencion' as const, href: '/inventario/reponer?sub=declive', ayuda: 'Venden la mitad o menos que en los 4 meses anteriores' }] : []),
    ...(analisisStock ? [{ label: 'Para remate', n: summary.remate_count, tono: 'atencion' as const, href: '/inventario/reponer?sub=remate', ayuda: 'Tienes stock y casi no se venden' }] : []),
    ...(etapas ? [{ label: 'Compras en camino', n: summary.in_transit, tono: 'info' as const, href: '/reportes?tab=transito', ayuda: 'Compras e importaciones que todavía no llegan' }] : []),
  ]
  const conAlgo = pendientes.filter(p => (p.n ?? 0) > 0)
  const enCero = pendientes.filter(p => p.n === 0)
  const cargandoPend = pendientes.some(p => p.n == null)

  const fechaHoy = new Date().toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="space-y-5">
      <h1 className="sr-only">Inicio</h1>

      {/* Arriba: la tasa (VE) o la fecha, y los dos atajos. Sin título: el menú ya dice dónde estás. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 text-sm">
          {country === 'VE'
            ? <RateBar puedeActualizar={puedeTasas} descuento={descuento} exceso={categorias} />
            : <span className="text-neutral-500 first-letter:uppercase inline-block">{fechaHoy}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/ventas?new=1" className="btn-primary text-sm whitespace-nowrap">+ Nueva venta</Link>
          {!importaciones ? (
            <Link href="/compras?new=1" className="btn-secondary text-sm whitespace-nowrap">+ Nueva compra</Link>
          ) : <div className="relative">
            <button type="button" onClick={() => setCompraMenu(v => !v)} aria-expanded={compraMenu} className="btn-secondary text-sm whitespace-nowrap">
              + Nueva compra ▾
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
        </div>
      </div>

      <AvisoStockVerificar n={summary.por_verificar ?? 0} />

      {/* Pendientes (no dependen del período) */}
      <section aria-labelledby="pend-t" className="space-y-2">
        <h2 id="pend-t" className="text-sm font-semibold text-neutral-700">Pendientes</h2>
        {conAlgo.length > 0 ? (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {conAlgo.map(p => (
              <Link key={p.label} href={p.href} title={p.ayuda}
                className="group flex min-h-[4.25rem] flex-col justify-between rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 shadow-sm transition hover:-translate-y-px hover:border-neutral-300 hover:shadow-md">
                <span className="flex items-center justify-between gap-2 text-xs font-medium text-neutral-600">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${p.tono === 'problema' ? 'bg-red-500' : p.tono === 'atencion' ? 'bg-amber-500' : 'bg-neutral-400'}`} />
                    <span className="truncate">{p.label}</span>
                  </span>
                  <span aria-hidden className="text-neutral-300 transition-colors group-hover:text-neutral-500">→</span>
                </span>
                <span className="num text-2xl font-semibold tracking-tight text-neutral-900">{p.n}</span>
              </Link>
            ))}
          </div>
        ) : !cargandoPend ? (
          <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-2.5 text-sm text-emerald-900">
            <span aria-hidden className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-bold text-white">✓</span>
            Nada pendiente hoy.
          </p>
        ) : null}
        {conAlgo.length > 0 && enCero.length > 0 && (
          <p className="text-xs text-neutral-500">
            <span aria-hidden className="mr-1 text-emerald-600">✓</span>Al día: {enCero.map(p => p.label.toLowerCase()).join(' · ')}
          </p>
        )}
      </section>

      {country === 'VE' && bonos && <BonusPipeline detalle />}

      {/* Cómo va el negocio: el período manda sobre todo lo de abajo */}
      <section aria-labelledby="neg-t" className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 px-4 py-3 sm:px-5">
          <div>
            <h2 id="neg-t" className="font-semibold text-neutral-900">Cómo va tu negocio</h2>
            <p className="text-xs text-neutral-500">El período elegido cambia todo lo de esta página, salvo los pendientes.</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Período">
            {(['today', 'month', 'quarter', 'year'] as Period[]).map(p => (
              <button key={p} type="button" onClick={() => setPeriod(p)} aria-pressed={period === p} className={chipCls(period === p)}>
                {p === 'today' ? 'Hoy' : p === 'month' ? 'Mes' : p === 'quarter' ? 'Trim.' : 'Año'}
              </button>
            ))}
            <span className="mx-1 h-5 w-px bg-neutral-200" aria-hidden />
            <DateField value={dateFrom} max={dateTo} onChange={(v: string) => setDateFrom(v)}
              className={`border rounded-lg px-2 py-1 text-xs ${period === 'custom' ? 'border-neutral-900' : 'border-neutral-200'}`} />
            <span className="text-xs text-neutral-400">–</span>
            <DateField value={dateTo} min={dateFrom} max={todayStr()} onChange={(v: string) => setDateTo(v)}
              className={`border rounded-lg px-2 py-1 text-xs ${period === 'custom' ? 'border-neutral-900' : 'border-neutral-200'}`} />
            <button type="button" onClick={() => setPeriod('custom')} className={chipCls(period === 'custom')}>Aplicar</button>
          </div>
        </div>

        {/* Cifra protagonista + tres de apoyo */}
        <div className="grid gap-4 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,2fr)] lg:items-center">
          <div>
            <div className="flex items-center gap-1.5 text-sm font-medium text-neutral-600">
              <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: NARANJA }} />Te quedó
            </div>
            {s ? <>
              <div className="num mt-1 text-4xl font-semibold tracking-tight text-neutral-900 sm:text-5xl">${money0(s.ganancia)}</div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                <Delta ahora={s.ganancia} antes={ant?.ganancia} />
                {ant && ant.ganancia > 0 && <span className="text-neutral-500">{contra}</span>}
              </div>
              <p className="mt-1 text-xs text-neutral-500">
                Vendiste ${money0(s.ventas)} − costos ${money0(s.costos)}
                {s.rentabilidad_pct != null && <> · <span className="cursor-help font-medium text-neutral-700"
                  title={`Rentabilidad sobre costo: ganancia ÷ lo que te costó la mercancía vendida. Ganaste $${s.rentabilidad_pct.toLocaleString('de-DE')} por cada $100 en mercancía. Es la misma cuenta que ves en cada producto. No descuenta gastos del mes ni, en VE, la diferencia oficial/paralelo.`}>
                  rentabilidad {s.rentabilidad_pct.toLocaleString('de-DE')}%</span></>}
              </p>
            </> : <div className="mt-2 h-12 w-48 animate-pulse rounded-lg bg-neutral-100" />}
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            <Apoyo punto={AZUL} titulo="Ventas" valor={s ? `$${money0(s.ventas)}` : null} delta={s && <Delta ahora={s.ventas} antes={ant?.ventas} />} />
            <Apoyo titulo="Ventas concretadas" valor={s ? s.cantidad.toLocaleString('es-VE') : null} delta={s && <Delta ahora={s.cantidad} antes={ant?.cantidad} />} />
            <Apoyo titulo="Ticket promedio" valor={s ? (s.cantidad ? `$${money0(s.ventas / s.cantidad)}` : '—') : null}
              delta={s && ant && ant.cantidad > 0 && s.cantidad > 0 ? <Delta ahora={s.ventas / s.cantidad} antes={ant.ventas / ant.cantidad} /> : null}
              ayuda="Lo que deja en promedio cada venta (vendido ÷ ventas)" />
          </div>
        </div>

        {/* Mig 180: productos importados con costo estimado → la ganancia de esas ventas es aproximada. */}
        {s && (s.estimado_pct ?? 0) > 0 && (
          <div className="mx-4 mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-900 sm:mx-5">
            <span>El <b>{s.estimado_pct} %</b> de lo vendido en este período usa <b>costo estimado</b>: la ganancia es aproximada.</span>
            <Link href="/productos/costos" className="font-medium underline underline-offset-2 hover:text-amber-950">Completar costos</Link>
          </div>
        )}

        <div className="border-t border-neutral-100 px-3 pb-3 pt-3 sm:px-4">
          <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-neutral-600" aria-hidden={!datosGrafico}>
            <span className="flex items-center gap-1.5"><span className="h-3 w-2.5 rounded-sm" style={{ background: AZUL }} />Ventas</span>
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full" style={{ background: NARANJA }} />Ganancia</span>
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full" style={{ background: GRIS }} />Ventas · {ANTERIOR[period].toLowerCase()}</span>
          </div>
          {datosGrafico ? (
            <div className="relative h-64" role="img" aria-label={`Gráfico de ventas y ganancia del período${s ? `: vendiste $${money0(s.ventas)} y te quedaron $${money0(s.ganancia)}` : ''}`}>
              <Chart type="bar" data={datosGrafico} options={chartOptions} />
            </div>
          ) : chart ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <p className="text-sm font-medium text-neutral-700">Todavía no hay ventas en este período</p>
              <Link href="/ventas?new=1" className="btn-secondary text-sm">Registrar una venta</Link>
            </div>
          ) : <div className="h-64 animate-pulse rounded-lg bg-neutral-50" />}
        </div>
      </section>

      {/* 14-11: lo que era Reportes → Resumen, con el mismo período */}
      <BloquesInicio period={period} dateFrom={period === 'custom' ? dateFrom : undefined} dateTo={period === 'custom' ? dateTo : undefined}
        reportes={reportes} cayendo={false} />
    </div>
  )
}

/** Cifra de apoyo junto a la protagonista: título (con su puntito si es una serie del gráfico), valor y ▲▼. */
function Apoyo({ punto, titulo, valor, delta, ayuda }: { punto?: string; titulo: string; valor: string | null; delta?: React.ReactNode; ayuda?: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-neutral-50 px-3 py-2.5" title={ayuda}>
      <div className="flex items-center gap-1.5 text-[11px] font-medium leading-tight text-neutral-500 sm:text-xs">
        {punto && <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: punto }} />}
        <span className="truncate">{titulo}</span>
      </div>
      {valor != null
        ? <div className="num mt-0.5 truncate text-base font-semibold tracking-tight text-neutral-900 sm:text-xl">{valor}</div>
        : <div className="mt-1 h-6 w-16 animate-pulse rounded bg-neutral-200/70" />}
      <div className="mt-0.5 min-h-[1rem] text-[11px] sm:text-xs">{delta}</div>
    </div>
  )
}
