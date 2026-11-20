'use client'
import { useEffect, useState, useMemo, useRef } from 'react'
import { Chart } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement, BarElement, BarController, LineController,
  Tooltip, Filler,
} from 'chart.js'
import type { ChartOptions, ChartData as ChartJsData, Plugin, ScriptableContext } from 'chart.js'
import Link from '@/components/ui/Link'
import type { Country } from '@/lib/types'
import { Cargando, chipCls } from '@/components/ui'
import BonusPipeline from './BonusPipeline'
import RateBar from './RateBar'
import { DateField } from '@/components/ui/DateField'
import AvisoStockVerificar from './AvisoStockVerificar'
import BloquesInicio from './BloquesInicio'
import Pendientes, { type Pendiente } from './Pendientes'
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

interface ChartPoint { label: string; ventas: number; costos: number; cantidad: number; anterior?: number; anterior_costos?: number }
export interface ChartData {
  chart_data: ChartPoint[]
  /** 20-11: etiqueta de «ahora» en el eje (con Hoy / Mes / Año el eje sigue hasta el fin del período). */
  hoy?: string
  summary: { ventas: number; costos: number; ganancia: number; ganancia_pct: number; margen_pct?: number; rentabilidad_pct?: number | null; cantidad: number; unidades?: number; estimado_pct?: number }
  /** 19-11: el mismo tramo del período anterior (para el ▲▼ de las cifras). */
  anterior?: { ventas: number; ganancia: number; cantidad: number; unidades?: number }
}
type Metrica = 'ventas' | 'ganancia'

type Period = 'today' | 'month' | 'quarter' | 'year'

// 19-11 (Inicio nuevo, guía dataviz): dos series con colores validados (azul = ventas, naranja = ganancia; pasan las
// pruebas de daltonismo y contraste) y el período anterior en gris, sin punteados. El texto nunca va del color de la
// serie: el puntito de color al lado es el que dice cuál es.
// 20-11 (el dueño, comparando con Mercasist): el gráfico pasa a ACUMULADO contra el período anterior a la misma
// fecha, una métrica a la vez (pestañas Ventas | Ganancia): línea de color = este período, gris = el anterior.
const AZUL = '#2a78d6', NARANJA = '#eb6834', GRIS = '#b5b5b0'
const LAVADO: Record<Metrica, [string, string]> = { ventas: ['rgba(42,120,214,0.16)', 'rgba(42,120,214,0)'], ganancia: ['rgba(235,104,52,0.16)', 'rgba(235,104,52,0)'] }

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

/** Montos del eje: $0 · $850 · $1,2 k · $15 k. */
const montoEje = (n: number) => {
  const a = Math.abs(n)
  if (a < 1000) return `${n < 0 ? '-' : ''}$${Math.round(a)}`
  return `${n < 0 ? '-' : ''}$${(a / 1000).toLocaleString('de-DE', { maximumFractionDigits: a >= 10000 ? 0 : 1 })} k`
}

/** «1–20 nov» para el botón de fechas. */
function textoFechas(a: string, b: string) {
  const f = (x: string) => `${Number(x.slice(8))} ${MESES[Number(x.slice(5, 7)) - 1]}`
  if (a === b) return f(a)
  return a.slice(0, 7) === b.slice(0, 7) ? `${Number(a.slice(8))}–${f(b)}` : `${f(a)} – ${f(b)}`
}

/** El valor de hoy, escrito al final de la línea de color (la única cifra sobre el gráfico). 20-11: si el eje sigue
 *  hasta el fin del período, también «cerró $X» al final de la gris (en cuánto terminó el período anterior). */
const valorAlFinal: Plugin<'line'> = {
  id: 'valorAlFinal',
  afterDatasetsDraw(c) {
    const meta = c.getDatasetMeta(0)
    const pts = meta?.data
    if (!pts?.length || meta.hidden) return
    const datos = c.data.datasets[0].data as (number | null)[]
    let i = datos.length - 1
    while (i > 0 && datos[i] == null) i--
    const ult = pts[i]
    const v = Number(datos[i] ?? 0)
    const { ctx, chartArea } = c
    ctx.save()
    // «cerró $X» al final de la línea gris, solo si sigue más allá de hoy.
    const gris = c.getDatasetMeta(1)?.data
    const datosGris = c.data.datasets[1]?.data as number[] | undefined
    if (gris?.length && datosGris && i < gris.length - 1) {
      const fin = gris[gris.length - 1]
      const t = `cerró $${money0(Number(datosGris[datosGris.length - 1] ?? 0))}`
      ctx.font = '500 11px Inter, system-ui, sans-serif'
      const wg = ctx.measureText(t).width
      ctx.fillStyle = '#737373'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.textBaseline = 'middle'
      const yg = Math.max(chartArea.top + 8, fin.y - 10)
      ctx.strokeText(t, Math.min(fin.x - wg, chartArea.right - wg), yg)
      ctx.fillText(t, Math.min(fin.x - wg, chartArea.right - wg), yg)
    }
    ctx.fillStyle = String(c.data.datasets[0].borderColor)
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(ult.x, ult.y, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    const txt = '$' + money0(v)
    ctx.font = '600 12px Inter, system-ui, sans-serif'
    const w = ctx.measureText(txt).width
    // A la izquierda del punto si no entra a la derecha; arriba del punto para no tapar la línea.
    const x = ult.x + 8 + w > chartArea.right ? ult.x - 8 - w : ult.x + 8
    const y = Math.max(chartArea.top + 10, ult.y - 10)
    ctx.fillStyle = '#262626'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 4
    ctx.strokeText(txt, x, y)
    ctx.fillText(txt, x, y)
    ctx.restore()
  },
}

const CONTRA: Record<Period | 'custom', string> = {
  today: 'que ayer a esta hora', month: 'que el mes pasado a la fecha', quarter: 'que los 3 meses anteriores',
  year: 'que el año pasado a la fecha', custom: 'que los mismos días justo antes',
}
/** Etiqueta de la línea gris: «Mes pasado a la fecha». */
const ANTERIOR_A_LA_FECHA: Record<Period | 'custom', string> = {
  today: 'Ayer a esta hora', month: 'Mes pasado a la fecha', quarter: '3 meses anteriores', year: 'Año pasado a la fecha', custom: 'Días anteriores',
}

/** ▲▼ contra el período anterior. 20-11: con bases chicas el % engaña (de 1 a 3 es «▲ 200 %»): entonces dice
 *  «▲ antes 1». `fmt` da formato al «antes» (montos con $); `chica` = base desde la que ya se muestra el %. */
function Delta({ ahora, antes, fmt = (n: number) => n.toLocaleString('es-VE'), chica = 5 }: {
  ahora: number; antes: number | undefined; fmt?: (n: number) => string; chica?: number
}) {
  if (antes == null) return null
  if (antes <= 0) return ahora > 0 ? <span className="num text-neutral-500">antes {fmt(0)}</span> : null
  const pct = Math.round(((ahora - antes) / antes) * 1000) / 10
  if (pct === 0) return <span className="text-neutral-500">igual</span>
  const color = pct > 0 ? 'text-emerald-700' : 'text-red-600'
  if (antes < chica || Math.abs(pct) >= 100) {
    return <span className={`num font-medium ${color}`}>{pct > 0 ? '▲' : '▼'} <span className="font-normal">antes</span> {fmt(antes)}</span>
  }
  return (
    <span className={`num font-medium ${color}`}>
      {pct > 0 ? '▲' : '▼'} {Math.abs(pct).toLocaleString('de-DE')}%
    </span>
  )
}
const fmtMonto = (n: number) => `$${money0(n)}`

export default function DashboardAdmin({ country, bonos, puedeTasas, descuento, importaciones, analisisStock, etapas = true, categorias = true, porConfirmar = false, reportes = false, ajustes = false, inicial }: {
  inicial?: { summary: Summary | null; chart: ChartData | null }   // 12-11: lo que ya vino en el HTML (lib/inicial.ts)
  country: Country; bonos: boolean; puedeTasas: boolean
  ajustes?: boolean        // 19-11: puede entrar a Ajustes (la píldora de la tasa lleva ahí)
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
  const [metrica, setMetrica] = useState<Metrica>('ventas')
  const [fechasAbiertas, setFechasAbiertas] = useState(false)
  // Mientras llega el período nuevo, el gráfico anterior queda a media luz (no salta ni se vacía).
  const [cargandoGrafico, setCargandoGrafico] = useState(false)
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
    let vivo = true
    setCargandoGrafico(true)
    fetch(url).then(r => r.ok ? r.json() : Promise.reject())
      .then(j => { if (vivo) setChart(j) }).catch(() => {})
      .finally(() => { if (vivo) setCargandoGrafico(false) })
    return () => { vivo = false }
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

  // Acumulados: lo que llevas hasta cada día (este período) y lo que llevabas el período anterior a esa misma altura.
  const serie = useMemo(() => {
    const d = chart?.chart_data ?? []
    const hoy = chart?.hoy
    // 20-11: la línea de este período llega hasta hoy (null después); la gris sigue hasta el fin del período.
    const out: { label: string; dia: number; actual: number | null; anterior: number; cantidad: number }[] = []
    let a = 0, b = 0
    for (const p of d) {
      const ahora = metrica === 'ventas' ? p.ventas : p.ventas - p.costos
      const antes = metrica === 'ventas' ? (p.anterior ?? 0) : (p.anterior ?? 0) - (p.anterior_costos ?? 0)
      a += ahora; b += antes
      const futuro = !!hoy && p.label > hoy
      out.push({ label: p.label, dia: ahora, actual: futuro ? null : Math.round(a * 100) / 100, anterior: Math.round(b * 100) / 100, cantidad: p.cantidad })
    }
    return out
  }, [chart, metrica])
  // Dónde está hoy en la serie (lo que llevas y lo que llevabas a esta fecha), y el cierre del período anterior.
  const iHoy = (() => { let i = serie.length - 1; while (i > 0 && serie[i].actual == null) i--; return i })()
  const enHoy = serie[iHoy]
  const cierre = iHoy < serie.length - 1 ? serie[serie.length - 1]?.anterior : null
  const hayDatos = serie.some(p => p.dia !== 0 || p.anterior !== 0)
  const color = metrica === 'ventas' ? AZUL : NARANJA

  const datosGrafico = useMemo<ChartJsData<'line'> | null>(() => {
    if (!serie.length || !hayDatos) return null
    return {
      labels: serie.map(p => p.label),
      datasets: [
        { label: metrica === 'ventas' ? 'Ventas' : 'Ganancia', data: serie.map(p => p.actual), borderColor: color, borderWidth: 2.25,
          pointBackgroundColor: color, pointBorderColor: '#fff', pointBorderWidth: 2, fill: 'origin', order: 1,
          backgroundColor: (ctx: ScriptableContext<'line'>) => {
            const { chartArea, ctx: c } = ctx.chart
            if (!chartArea) return LAVADO[metrica][0]
            const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom)
            g.addColorStop(0, LAVADO[metrica][0]); g.addColorStop(1, LAVADO[metrica][1])
            return g
          } },
        { label: ANTERIOR_A_LA_FECHA[period], data: serie.map(p => p.anterior), borderColor: GRIS, backgroundColor: GRIS, borderWidth: 1.75,
          pointBackgroundColor: GRIS, pointBorderColor: '#fff', pointBorderWidth: 2, fill: false, order: 2 },
      ],
    }
  }, [serie, hayDatos, metrica, color, period])

  const chartOptions = useMemo<ChartOptions<'line'>>(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 350 },
    interaction: { mode: 'index', intersect: false },
    layout: { padding: { right: 8, top: 6 } },
    plugins: {
      legend: { display: false },   // la leyenda va en HTML, arriba del gráfico
      tooltip: {
        backgroundColor: 'rgba(23,23,23,0.94)', padding: 10, cornerRadius: 8, boxWidth: 8, boxHeight: 8, boxPadding: 4, usePointStyle: true,
        titleFont: { size: 12, weight: 'bold' }, bodyFont: { size: 12 }, footerFont: { size: 11, weight: 'normal' }, footerColor: '#d4d4d4',
        filter: item => item.parsed.y != null,
        callbacks: {
          title: items => etiquetaLarga(String(items[0]?.label ?? '')),
          label: ctx => ctx.datasetIndex === 0 ? ` Llevas: $${money(ctx.parsed.y ?? 0)}` : ` ${ctx.dataset.label}: $${money(ctx.parsed.y ?? 0)}`,
          afterBody: items => {
            const p = serie[items[0]?.dataIndex ?? -1]
            if (!p || p.actual == null) return ''
            const dif = p.actual - p.anterior
            if (Math.abs(dif) < 0.005) return ' Igual que antes'
            return ` ${dif > 0 ? '▲' : '▼'} $${money(Math.abs(dif))} ${dif > 0 ? 'más' : 'menos'} que antes`
          },
          footer: items => {
            const p = serie[items[0]?.dataIndex ?? -1]
            if (!p || p.actual == null) return ''
            const cuando = period === 'today' ? 'Esa hora' : period === 'year' ? 'Ese mes' : 'Ese día'
            return `${cuando}: $${money(p.dia)}${metrica === 'ventas' ? ` · ${p.cantidad} venta${p.cantidad === 1 ? '' : 's'}` : ''}`
          },
        },
      },
    },
    elements: { point: { radius: 0, hoverRadius: 5, hitRadius: 14 }, line: { tension: 0.25, cubicInterpolationMode: 'monotone' } },
    scales: {
      y: {
        beginAtZero: true,
        border: { display: false },
        ticks: { maxTicksLimit: 5, font: { size: 11 }, color: '#8a8a85', padding: 8, callback: v => montoEje(Number(v)) },
        grid: { color: 'rgba(0,0,0,0.05)' },
      },
      x: {
        border: { display: false },
        grid: { display: false },
        ticks: {
          color: '#8a8a85', font: { size: 11 }, maxRotation: 0, autoSkipPadding: 18,
          callback(v) { return etiquetaCorta(String(this.getLabelForValue(Number(v)))) },
        },
      },
    },
  }), [serie, period, metrica])

  if (!summary) return <Cargando />

  const s = chart?.summary
  const ant = chart?.anterior
  const contra = CONTRA[period]

  // ── Pendientes (19-11): nombres cortos, por urgencia; el detalle va en el title. ──
  const pendientes: Pendiente[] = [
    ...(porConfirmar ? [{ label: 'Por confirmar', n: pc.datos ? pendientesPorConfirmar(pc.datos) : null, tono: 'atencion' as const, href: '/ventas?vista=confirmar', ayuda: 'Ventas de MercadoLibre que todavía no registraste' }] : []),
    { label: 'Sin stock', n: summary.no_stock, tono: 'problema', href: '/inventario?estado=SIN_STOCK', ayuda: 'Productos activos en 0' },
    ...(analisisStock ? [{ label: 'Reponer', n: summary.reposicion_count, tono: 'atencion' as const, href: '/inventario/reponer?sub=reposicion', ayuda: 'Lo que tienes no alcanza para lo que tarda en llegar' }] : []),
    { label: 'Stock bajo', n: summary.low_stock_alerts, tono: 'atencion', href: '/inventario?estado=BAJO', ayuda: 'Por debajo del mínimo' },
    { label: 'Borradores', n: summary.pending_sales, tono: 'atencion', href: '/ventas?estado=BORRADOR', ayuda: 'Ventas sin terminar de cargar' },
    ...(conCayendo ? [{ label: 'En caída', n: caen, tono: 'atencion' as const, href: '/inventario/reponer?sub=declive', ayuda: 'Se están cayendo: venden la mitad o menos que en los 4 meses anteriores' }] : []),
    ...(analisisStock ? [{ label: 'Remate', n: summary.remate_count, tono: 'atencion' as const, href: '/inventario/reponer?sub=remate', ayuda: 'Para remate: tienes stock y casi no se venden' }] : []),
    ...(etapas ? [{ label: 'En camino', n: summary.in_transit, tono: 'info' as const, href: '/reportes?tab=transito', ayuda: 'Compras e importaciones que todavía no llegan' }] : []),
  ]


  return (
    <div className="space-y-5">
      <h1 className="sr-only">Inicio</h1>

      {/* 19-11 (el dueño): la primera línea es «lo que hay que hacer»: los pendientes a la izquierda (crecen hacia abajo
          según cuántos haya); a la derecha, FIJOS, Nueva venta / Nueva compra y debajo la tasa (VE). En el celular, arriba. */}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 sm:flex-nowrap">
        <div className="order-2 min-w-0 basis-full sm:order-1 sm:flex-1 sm:basis-auto">
          <Pendientes items={pendientes} titulo={false} />
        </div>
        <div className="order-1 flex w-full flex-wrap items-center justify-between gap-2 sm:order-2 sm:w-auto sm:shrink-0 sm:flex-col sm:items-end sm:justify-start">
          <div className="flex items-center gap-2 sm:order-1">
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
          {country === 'VE' && <div className="sm:order-2"><RateBar puedeActualizar={puedeTasas} descuento={descuento} exceso={categorias} ajustes={ajustes} /></div>}
        </div>
      </div>

      <AvisoStockVerificar n={summary.por_verificar ?? 0} />

      {country === 'VE' && bonos && <BonusPipeline detalle />}

      {/* Cómo va el negocio: el período manda sobre todo lo de abajo */}
      <section aria-labelledby="neg-t" className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 px-4 py-3 sm:px-5">
          <div>
            <h2 id="neg-t" className="font-semibold text-neutral-900">Cómo va tu negocio</h2>
            <p className="text-xs text-neutral-500">El período elegido cambia todo lo de esta página, salvo los pendientes.</p>
          </div>
          {/* 20-11: Hoy / Mes / Trim. / Año y «Fechas…», que abre las dos fechas solo cuando se necesitan. */}
          <div className="relative flex flex-wrap items-center gap-1.5" role="group" aria-label="Período">
            {(['today', 'month', 'quarter', 'year'] as Period[]).map(p => (
              <button key={p} type="button" onClick={() => { setPeriod(p); setFechasAbiertas(false) }} aria-pressed={period === p} className={chipCls(period === p)}>
                {p === 'today' ? 'Hoy' : p === 'month' ? 'Mes' : p === 'quarter' ? 'Trim.' : 'Año'}
              </button>
            ))}
            <button type="button" onClick={() => setFechasAbiertas(v => !v)} aria-expanded={fechasAbiertas} aria-pressed={period === 'custom'}
              className={chipCls(period === 'custom')}>
              {period === 'custom' ? textoFechas(dateFrom, dateTo) : 'Fechas…'}
            </button>
            {fechasAbiertas && <>
              <div className="fixed inset-0 z-10" onClick={() => setFechasAbiertas(false)} aria-hidden />
              <FechasPopover desde={dateFrom} hasta={dateTo} onAplicar={(a, b) => { setDateFrom(a); setDateTo(b); setPeriod('custom'); setFechasAbiertas(false) }} />
            </>}
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
                <Delta ahora={s.ganancia} antes={ant?.ganancia} fmt={fmtMonto} chica={(ant?.cantidad ?? 0) < 5 ? Infinity : 0} />
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
            {/* 20-11: «Ventas $» ya está en «Vendiste …» de Te quedó y en el gráfico: en su lugar, las unidades. */}
            <Apoyo titulo="Ventas registradas" valor={s ? s.cantidad.toLocaleString('es-VE') : null} delta={s && <Delta ahora={s.cantidad} antes={ant?.cantidad} />}
              ayuda="Las ventas procesadas en Ventas de este sistema. Las de MercadoLibre, registradas o no, están más abajo por cuenta." />
            <Apoyo titulo="Unidades vendidas" valor={s ? (s.unidades ?? 0).toLocaleString('es-VE') : null}
              delta={s && ant?.unidades != null ? <Delta ahora={s.unidades ?? 0} antes={ant.unidades} /> : null}
              ayuda="Cuántas unidades salieron en esas ventas" />
            <Apoyo titulo="Ticket promedio" valor={s ? (s.cantidad ? `$${money0(s.ventas / s.cantidad)}` : '—') : null}
              delta={s && ant && ant.cantidad > 0 && s.cantidad > 0 ? <Delta ahora={s.ventas / s.cantidad} antes={ant.ventas / ant.cantidad} fmt={fmtMonto} chica={ant.cantidad < 5 ? Infinity : 0} /> : null}
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
          {/* 20-11: una métrica a la vez (pestañas) y su leyenda con el total de cada línea. */}
          <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1">
            <div className="inline-flex rounded-lg bg-neutral-100 p-0.5 text-xs font-medium" role="tablist" aria-label="Qué mostrar en el gráfico">
              {(['ventas', 'ganancia'] as Metrica[]).map(m => (
                <button key={m} type="button" role="tab" aria-selected={metrica === m} onClick={() => setMetrica(m)}
                  className={`rounded-md px-3 py-1 transition ${metrica === m ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-800'}`}>
                  {m === 'ventas' ? 'Ventas' : 'Ganancia'}
                </button>
              ))}
            </div>
            {datosGrafico && enHoy && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-600">
                <span className="flex items-center gap-1.5"><span aria-hidden className="h-0.5 w-4 rounded-full" style={{ background: color }} />
                  {period === 'today' ? 'Hoy' : period === 'month' ? 'Este mes' : period === 'year' ? 'Este año' : 'Este período'}
                  <b className="num font-semibold text-neutral-900">${money0(enHoy.actual ?? 0)}</b></span>
                <span className="flex items-center gap-1.5"><span aria-hidden className="h-0.5 w-4 rounded-full" style={{ background: GRIS }} />
                  {ANTERIOR_A_LA_FECHA[period]} <b className="num font-semibold text-neutral-700">${money0(enHoy.anterior)}</b>
                  {cierre != null && <span className="text-neutral-500">· cerró <span className="num">${money0(cierre)}</span></span>}</span>
              </div>
            )}
          </div>
          {datosGrafico ? (
            <div className={`relative h-56 transition-opacity sm:h-64 ${cargandoGrafico ? 'opacity-50' : ''}`} role="img"
              aria-label={`${metrica === 'ventas' ? 'Ventas' : 'Ganancia'} acumulada del período: $${money0(enHoy?.actual ?? 0)}, contra $${money0(enHoy?.anterior ?? 0)} ${ANTERIOR_A_LA_FECHA[period].toLowerCase()}${cierre != null ? `; el período anterior cerró en $${money0(cierre)}` : ''}`}>
              <Chart type="line" data={datosGrafico} options={chartOptions} plugins={[valorAlFinal]} />
            </div>
          ) : chart ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <p className="text-sm font-medium text-neutral-700">Todavía no hay ventas en este período</p>
              <Link href="/ventas?new=1" className="btn-secondary text-sm">Registrar una venta</Link>
            </div>
          ) : <div className="h-56 animate-pulse rounded-lg bg-neutral-50 sm:h-64" />}
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

/** «Fechas…» (20-11): las dos fechas en un recuadro, se aplican juntas. */
function FechasPopover({ desde, hasta, onAplicar }: { desde: string; hasta: string; onAplicar: (a: string, b: string) => void }) {
  const [a, setA] = useState(desde)
  const [b, setB] = useState(hasta)
  return (
    <div className="absolute right-0 top-full z-20 mt-1.5 w-64 rounded-xl border border-neutral-200 bg-white p-3 shadow-lg">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-neutral-500">Desde
          <DateField value={a} max={b} onChange={(v: string) => setA(v)} className="mt-0.5 w-full rounded-lg border border-neutral-200 px-2 py-1 text-xs" />
        </label>
        <label className="text-xs text-neutral-500">Hasta
          <DateField value={b} min={a} max={todayStr()} onChange={(v: string) => setB(v)} className="mt-0.5 w-full rounded-lg border border-neutral-200 px-2 py-1 text-xs" />
        </label>
      </div>
      <button type="button" disabled={!a || !b || a > b} onClick={() => onAplicar(a, b)} className="btn-primary mt-3 w-full text-sm disabled:opacity-50">Aplicar</button>
    </div>
  )
}
