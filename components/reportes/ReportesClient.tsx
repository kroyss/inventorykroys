'use client'
import { useState, useEffect, useMemo, useRef, Fragment } from 'react'
import {
  DateRangeBar, presetRange, type DatePreset,
  KPICard, DataTable, exportRows, money, type Column,
} from '@/components/ui'
import { usePersistedTab } from '@/lib/usePersistedTab'
import { matchFuzzy } from '@/lib/search'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import NumberInput from '@/components/ui/NumberInput'
import * as XLSX from 'xlsx'
import { useDeepLinkParam } from '@/lib/useDeepLinkParam'

type Tab = 'ventas' | 'compras' | 'inventario' | 'stock' | 'top' | 'transito' | 'conteos'

// Valores aceptados en los deep-links ?tab= y ?sub= (en mayúsculas: el hook
// normaliza, para que el link funcione escrito de cualquier forma).
const REPORT_TABS = ['VENTAS', 'COMPRAS', 'INVENTARIO', 'STOCK', 'TOP', 'TRANSITO', 'CONTEOS'] as const
const STOCK_SUBS  = ['REPOSICION', 'REMATE', 'NUEVOS', 'DECLIVE'] as const

const PERIOD_TABS: { key: Tab; label: string }[] = [
  { key: 'ventas',  label: 'Ventas' },
  { key: 'compras', label: 'Compras' },
  { key: 'top',     label: 'Top productos' },
]
const STATE_TABS: { key: Tab; label: string }[] = [
  { key: 'inventario', label: 'Inventario' },
  { key: 'stock',      label: 'Stock' },
  { key: 'transito',   label: 'En tránsito' },
  { key: 'conteos',    label: 'Conteos' },
]

export default function ReportesClient() {
  const [tab,      setTab]      = usePersistedTab<Tab>('tab:reportes', 'ventas')
  const [preset,   setPreset]   = useState<DatePreset>('last90')
  const [dateFrom, setDateFrom] = useState(presetRange('last90').from)
  const [dateTo,   setDateTo]   = useState(presetRange('last90').to)
  const [data,     setData]     = useState<any>(null)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [search,   setSearch]   = useState('')

  // Stock subtab
  const [stockSub, setStockSub] = useState<'reposicion' | 'remate' | 'nuevos' | 'declive'>('reposicion')
  // Top params
  const [topN,       setTopN]       = useState(10)
  const [topOrderBy, setTopOrderBy] = useState<'qty' | 'ganancia' | 'margen'>('qty')
  const [topCat,     setTopCat]     = useState('')
  // Ventas status / Compras tipo / Tránsito tipo filters
  const [ventaStatus, setVentaStatus] = useState('')
  const [compraTipo,  setCompraTipo]  = useState('')
  const [transTipo,   setTransTipo]   = useState('')
  const [categories,  setCategories]  = useState<string[]>([])

  useEffect(() => {
    fetch('/api/profit-categories').then(r => r.json()).then((cs: any[]) => setCategories(cs.map(c => c.name)))
  }, [])

  // Deep-links desde las cards del dashboard: ?tab= y ?sub=. Con useSearchParams
  // se re-aplican si cambia la URL sin desmontar la pantalla.
  const [urlTab] = useDeepLinkParam('tab', REPORT_TABS)
  const [urlSub] = useDeepLinkParam('sub', STOCK_SUBS)
  useEffect(() => { if (urlTab) setTab(urlTab.toLowerCase() as Tab) }, [urlTab])
  useEffect(() => { if (urlSub) setStockSub(urlSub.toLowerCase() as typeof stockSub) }, [urlSub])

  useEffect(() => { load() }, [tab, dateFrom, dateTo, topN, topOrderBy, topCat])

  const handlePreset = (p: DatePreset) => {
    setPreset(p)
    if (p !== 'custom') { const r = presetRange(p); setDateFrom(r.from); setDateTo(r.to) }
  }

  // Guard de "última petición": al cambiar de pestaña rápido quedan varios fetch
  // en vuelo; sin esto, una respuesta vieja (de otra pestaña) llega después y mete
  // datos con forma equivocada → el reporte queda en blanco. Solo se aplica el
  // resultado de la petición más reciente.
  const reqIdRef = useRef(0)
  const load = async () => {
    const myId = ++reqIdRef.current
    setLoading(true); setError(null); setData(null); setSearch('')
    let url = ''
    if (tab === 'ventas')      url = `/api/reports/sales?date_from=${dateFrom}&date_to=${dateTo}`
    if (tab === 'compras')     url = `/api/reports/purchases?date_from=${dateFrom}&date_to=${dateTo}`
    if (tab === 'inventario')  url = `/api/reports/inventory`
    if (tab === 'stock')       url = `/api/reports/stock-analysis`
    if (tab === 'top')         url = `/api/reports/top-products?date_from=${dateFrom}&date_to=${dateTo}&top=${topN}&order_by=${topOrderBy}${topCat ? `&category=${encodeURIComponent(topCat)}` : ''}`
    if (tab === 'transito')    url = `/api/reports/in-transit`
    if (tab === 'conteos')     url = `/api/reports/counts`
    try {
      const res = await fetch(url)
      if (myId !== reqIdRef.current) return        // respuesta obsoleta: la ignora
      if (!res.ok) { setError('Error cargando reporte'); setLoading(false); return }
      const json = await res.json()
      if (myId !== reqIdRef.current) return        // obsoleta tras parsear
      setData(json); setLoading(false)
    } catch {
      if (myId === reqIdRef.current) { setError('Error cargando reporte'); setLoading(false) }
    }
  }

  const needsDates = tab === 'ventas' || tab === 'compras' || tab === 'top'
  const tabBtn = (t: { key: Tab; label: string }) => (
    <button key={t.key} onClick={() => { setData(null); setTab(t.key) }}
      className={`px-4 py-2 rounded-lg text-sm ${tab === t.key ? 'bg-neutral-900 text-white' : 'bg-neutral-100 hover:bg-neutral-200'}`}>
      {t.label}
    </button>
  )

  return (
    <div className="space-y-4">
      {/* grouped tabs */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <span className="text-xs text-neutral-400 mr-1">Por período:</span>
          {PERIOD_TABS.map(tabBtn)}
        </div>
        <div className="h-5 w-px bg-neutral-200 hidden md:block" />
        <div className="flex items-center gap-1">
          <span className="text-xs text-neutral-400 mr-1">Estado actual:</span>
          {STATE_TABS.map(tabBtn)}
        </div>
      </div>

      {/* date filters */}
      {needsDates && (
        <div className="space-y-2">
          <DateRangeBar
            preset={preset} from={dateFrom} to={dateTo}
            onPreset={handlePreset} onFrom={setDateFrom} onTo={setDateTo}
            onApply={load} loading={loading}
          />
          {tab === 'top' && (
            <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-3 flex flex-wrap gap-3 items-end">
              <div>
                <label className="text-xs text-neutral-500 block">Top N</label>
                <NumberInput int min={1} value={topN} emptyValue={10} onValueChange={setTopN}
                  className="mt-1 border rounded px-2 py-1 text-sm w-20" />
              </div>
              <div>
                <label className="text-xs text-neutral-500 block">Ordenar por</label>
                <select value={topOrderBy} onChange={e => setTopOrderBy(e.target.value as any)}
                  className="mt-1 border rounded px-2 py-1 text-sm">
                  <option value="qty">Cantidad</option>
                  <option value="ganancia">Ganancia</option>
                  <option value="margen">Margen</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-neutral-500 block">Categoría</label>
                <select value={topCat} onChange={e => setTopCat(e.target.value)}
                  className="mt-1 border rounded px-2 py-1 text-sm">
                  <option value="">Todas</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>
      )}

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded">{error}</div>}
      {loading && <div className="text-neutral-500 text-sm py-4">Cargando…</div>}

      {!loading && data && tab === 'ventas'     && data.sales       && (
        <SalesReport data={data} search={search} setSearch={setSearch} statusF={ventaStatus} setStatusF={setVentaStatus} />
      )}
      {!loading && data && tab === 'compras'    && data.purchases   && (
        <PurchasesReport data={data} search={search} setSearch={setSearch} tipo={compraTipo} setTipo={setCompraTipo} />
      )}
      {!loading && data && tab === 'inventario' && data.items       && (
        <InventoryReport data={data} search={search} setSearch={setSearch} />
      )}
      {!loading && data && tab === 'stock'      && data.reposicion  && (
        <StockAnalysisReport data={data} sub={stockSub} setSub={setStockSub} onReload={load} />
      )}
      {!loading && data && tab === 'top'      && Array.isArray(data) && <TopProductsReport rows={data} />}
      {!loading && data && tab === 'transito' && Array.isArray(data) && (
        <InTransitReport rows={data} tipo={transTipo} setTipo={setTransTipo} />
      )}
      {!loading && data && tab === 'conteos'  && data.items && (
        <CountsReport data={data} search={search} setSearch={setSearch} />
      )}
    </div>
  )
}

// ── search input ──
function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input type="search" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm w-full md:w-64 focus:outline-none focus:ring-2 focus:ring-neutral-800" />
  )
}

// ───── ventas ─────
function SalesReport({ data, search, setSearch, statusF, setStatusF }: any) {
  const rows = useMemo(() => {
    let r = data.sales as any[]
    if (statusF) r = r.filter(s => s.status === statusF)
    if (search) {
      const q = search.toLowerCase()
      r = r.filter(s => s.ml_order_number.toLowerCase().includes(q) || (s.customer_name ?? '').toLowerCase().includes(q))
    }
    return r
  }, [data.sales, statusF, search])

  const cols: Column<any>[] = [
    { key: 'ml_order_number', label: 'Orden', render: s => <span className="font-mono text-xs">{s.ml_order_number}</span>, sortValue: s => s.ml_order_number },
    { key: 'created_at', label: 'Fecha', render: s => <span className="text-xs">{new Date(s.created_at).toLocaleDateString('es-VE')}</span>, sortValue: s => new Date(s.created_at).getTime() },
    { key: 'customer_name', label: 'Cliente', render: s => s.customer_name || '—', sortValue: s => s.customer_name ?? '' },
    { key: 'status', label: 'Estado', render: s => <span className="text-xs px-2 py-0.5 bg-neutral-100 rounded">{s.status}</span>, sortValue: s => s.status },
    { key: 'total_amount', label: 'Total', align: 'right', render: s => `$${money(s.total_amount)}`, sortValue: s => s.total_amount, total: rs => `$${money(rs.reduce((a, x) => a + x.total_amount, 0))}`, exportValue: s => s.total_amount },
    { key: 'cost', label: 'Costo', align: 'right', render: s => `$${money(s.cost)}`, sortValue: s => s.cost, total: rs => `$${money(rs.reduce((a, x) => a + x.cost, 0))}`, exportValue: s => s.cost },
    { key: 'commission', label: 'Comisión', align: 'right', render: s => <span className="text-red-500">${money(s.commission || 0)}</span>, sortValue: s => s.commission || 0, total: rs => `$${money(rs.reduce((a, x) => a + (x.commission || 0), 0))}`, exportValue: s => s.commission || 0 },
    { key: 'ganancia', label: 'Ganancia', align: 'right', render: s => <span className="text-green-600">${money(s.total_amount - s.cost - (s.commission || 0))}</span>, sortValue: s => s.total_amount - s.cost - (s.commission || 0), total: rs => `$${money(rs.reduce((a, x) => a + (x.total_amount - x.cost - (x.commission || 0)), 0))}`, exportValue: s => s.total_amount - s.cost - (s.commission || 0) },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KPICard compact label="Cantidad" value={data.totals.count} />
        <KPICard compact label="Ventas"   value={`$${money(data.totals.total_amount)}`} />
        <KPICard compact label="Costos"   value={`$${money(data.totals.total_cost)}`} />
        <KPICard compact label="Comisión" value={`$${money(data.totals.total_commission || 0)}`} accent="text-red-500" />
        <KPICard compact label={`Ganancia · ${data.totals.profit_pct}%`} value={`$${money(data.totals.profit)}`} accent="text-green-600" />
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <SearchBar value={search} onChange={setSearch} placeholder="Buscar orden o cliente…" />
        <select value={statusF} onChange={e => setStatusF(e.target.value)} className="border border-neutral-300 rounded-lg px-2 py-1.5 text-sm">
          <option value="">Todos los estados</option>
          <option value="PROCESADA">Procesada</option>
          <option value="DESCARGADA">Descargada</option>
          <option value="DESCARGADA_LOCAL">Local entregada</option>
        </select>
      </div>
      <DataTable columns={cols} rows={rows} exportName="ventas" emptyText="Sin ventas en el período" />
    </div>
  )
}

// ───── compras ─────
function PurchasesReport({ data, search, setSearch, tipo, setTipo }: any) {
  const rows = useMemo(() => {
    let r = data.purchases as any[]
    if (tipo) r = r.filter(o => o.order_type === tipo)
    if (search) {
      const q = search.toLowerCase()
      r = r.filter(o => o.order_number.toLowerCase().includes(q) || (o.supplier_name ?? '').toLowerCase().includes(q))
    }
    return r
  }, [data.purchases, tipo, search])

  const cols: Column<any>[] = [
    { key: 'order_number', label: 'Orden', render: o => <span className="font-mono text-xs">{o.order_number}</span>, sortValue: o => o.order_number },
    { key: 'order_type', label: 'Tipo', render: o => <span className="text-xs">{o.order_type}</span>, sortValue: o => o.order_type },
    { key: 'supplier_name', label: 'Proveedor', sortValue: o => o.supplier_name ?? '' },
    { key: 'status', label: 'Estado', render: o => <span className="px-2 py-0.5 bg-neutral-100 rounded text-xs">{o.status}</span>, sortValue: o => o.status },
    { key: 'total_usd', label: 'Total', align: 'right', render: o => `$${money(o.total_usd)}`, sortValue: o => o.total_usd, total: rs => `$${money(rs.reduce((a, x) => a + x.total_usd, 0))}`, exportValue: o => o.total_usd },
    { key: 'total_paid', label: 'Pagado', align: 'right', render: o => `$${money(o.total_paid)}`, sortValue: o => o.total_paid, total: rs => `$${money(rs.reduce((a, x) => a + x.total_paid, 0))}`, exportValue: o => o.total_paid },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <KPICard compact label="Órdenes"      value={data.totals.count} />
        <KPICard compact label="Total USD"    value={`$${money(data.totals.total_usd)}`} />
        <KPICard compact label="Total pagado" value={`$${money(data.totals.total_paid)}`} accent="text-green-600" />
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <SearchBar value={search} onChange={setSearch} placeholder="Buscar orden o proveedor…" />
        <select value={tipo} onChange={e => setTipo(e.target.value)} className="border border-neutral-300 rounded-lg px-2 py-1.5 text-sm">
          <option value="">Local + Importación</option>
          <option value="local">Solo local</option>
          <option value="import">Solo importación</option>
        </select>
      </div>
      <DataTable columns={cols} rows={rows} exportName="compras" emptyText="Sin compras en el período" />
    </div>
  )
}

// ───── inventario ─────
function InventoryReport({ data, search, setSearch }: any) {
  const rows = useMemo(() => {
    if (!search) return data.items as any[]
    const q = search.toLowerCase()
    return (data.items as any[]).filter(p => p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))
  }, [data.items, search])

  const cols: Column<any>[] = [
    { key: 'code', label: 'Código', render: p => <span className="font-mono text-xs">{p.code}</span>, sortValue: p => p.code },
    { key: 'name', label: 'Producto', sortValue: p => p.name },
    { key: 'quantity', label: 'Stock', align: 'right', sortValue: p => p.quantity, total: rs => rs.reduce((a, x) => a + x.quantity, 0) },
    { key: 'total_cost', label: 'Costo', align: 'right', render: p => `$${money(p.total_cost)}`, sortValue: p => p.total_cost },
    { key: 'sale_price', label: 'Precio', align: 'right', render: p => `$${money(p.sale_price)}`, sortValue: p => p.sale_price },
    { key: 'valor_costo', label: 'Valor costo', align: 'right', render: p => `$${money(p.valor_costo)}`, sortValue: p => p.valor_costo, total: rs => `$${money(rs.reduce((a, x) => a + x.valor_costo, 0))}`, exportValue: p => p.valor_costo },
    { key: 'valor_venta', label: 'Valor venta', align: 'right', render: p => `$${money(p.valor_venta)}`, sortValue: p => p.valor_venta, total: rs => `$${money(rs.reduce((a, x) => a + x.valor_venta, 0))}`, exportValue: p => p.valor_venta },
    { key: 'status', label: 'Estado', align: 'center', render: p => (
      <span className={`px-2 py-0.5 rounded text-xs ${p.status === 'OK' ? 'bg-green-100 text-green-700' : p.status === 'BAJO' ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'}`}>{p.status}</span>
    ), sortValue: p => p.status },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard compact label="Productos"   value={data.totals.count} />
        <KPICard compact label="Unidades"    value={data.totals.total_units} />
        <KPICard compact label="Valor costo" value={`$${money(data.totals.total_cost_value)}`} />
        <KPICard compact label="Valor venta" value={`$${money(data.totals.total_sale_value)}`} accent="text-green-600" />
      </div>
      <div className="flex items-center gap-2">
        <SearchBar value={search} onChange={setSearch} placeholder="Buscar código o producto…" />
        <button onClick={() => window.open('/hoja-inventario', '_blank')}
          title="Hoja configurable: elegís las columnas y la sacás en PDF o Excel (incluye columna en blanco para el conteo físico)"
          className="shrink-0 px-3 py-2 text-sm bg-white border border-neutral-300 rounded-lg text-neutral-700 hover:bg-neutral-100">
          🖨 Hoja configurable
        </button>
      </div>
      <DataTable columns={cols} rows={rows} exportName="inventario" />
    </div>
  )
}

// ───── conteos físicos ─────
// Solo lista productos con diferencia: los que coincidieron no generan ajuste,
// y esa ausencia ya dice que el producto viene sano.
function CountsReport({ data, search, setSearch }: any) {
  const conteos: any[] = data.conteos
  const [ref,   setRef]   = useState<string>(conteos[0]?.reference ?? '')
  const [soloReinc, setSoloReinc] = useState(false)

  const resumen = conteos.find(c => c.reference === ref)

  const rows = useMemo(() => {
    let r = (data.items as any[]).filter(x => x.reference === ref)
    if (soloReinc) r = r.filter(x => x.veces >= 2)
    if (search) r = r.filter(x => matchFuzzy(search, x.code, x.name))
    return r
  }, [data.items, ref, soloReinc, search])

  const cols: Column<any>[] = [
    { key: 'code', label: 'Código', render: p => <span className="font-mono text-xs">{p.code}</span>, sortValue: p => p.code },
    { key: 'name', label: 'Producto', sortValue: p => p.name },
    { key: 'delta', label: 'Diferencia', align: 'right', sortValue: p => p.delta,
      render: p => <span className={p.delta < 0 ? 'text-red-600 font-semibold' : 'text-green-600 font-semibold'}>{p.delta > 0 ? '+' : ''}{p.delta}</span>,
      total: rs => rs.reduce((a, x) => a + x.delta, 0) },
    { key: 'stock_actual', label: 'Stock actual', align: 'right', sortValue: p => p.stock_actual },
    { key: 'veces', label: 'Conteos con diferencia', align: 'center', sortValue: p => p.veces,
      render: p => (
        <span className={`px-2 py-0.5 rounded text-xs ${p.veces >= 2 ? 'bg-red-100 text-red-700 font-semibold' : 'bg-neutral-100 text-neutral-600'}`}>
          {p.veces}
        </span>
      ) },
    { key: 'notes', label: 'Nota', render: p => <span className="text-xs text-neutral-500">{p.notes ?? '—'}</span>, sortValue: p => p.notes ?? '' },
  ]

  if (conteos.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6 text-sm text-neutral-500">
        Todavía no hay conteos registrados. Un conteo aparece acá cuando sus ajustes de stock
        se guardan con una referencia que empieza con <b>CONTEO</b> (ej. <code>CONTEO-2026-11</code>).
      </div>
    )
  }

  const reincidentes = (data.items as any[]).filter(x => x.reference === ref && x.veces >= 2).length

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard compact label="Productos con diferencia" value={resumen?.productos ?? 0} />
        <KPICard compact label="Unidades faltantes" value={resumen?.faltantes ?? 0} accent="text-red-600" />
        <KPICard compact label="Unidades sobrantes" value={resumen?.sobrantes ?? 0} accent="text-green-600" />
        <KPICard compact label="Reincidentes" value={reincidentes} accent={reincidentes > 0 ? 'text-amber-600' : undefined} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select value={ref} onChange={e => setRef(e.target.value)}
          className="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm">
          {conteos.map(c => (
            <option key={c.reference} value={c.reference}>
              {c.reference} · {c.fecha} · {c.productos} productos
            </option>
          ))}
        </select>
        <SearchBar value={search} onChange={setSearch} placeholder="Buscar código o producto…" />
        <label className="flex items-center gap-1.5 text-sm text-neutral-600">
          <input type="checkbox" checked={soloReinc} onChange={e => setSoloReinc(e.target.checked)} />
          Solo reincidentes
        </label>
      </div>

      {reincidentes > 0 && (
        <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
          <b>{reincidentes}</b> {reincidentes === 1 ? 'producto dio' : 'productos dieron'} diferencia en 2 o más conteos.
          A esa altura ya no es error de conteo: es consumo sin registrar, variantes que se confunden al vender o pérdida real.
        </div>
      )}

      <DataTable columns={cols} rows={rows} exportName={`conteo_${ref}`} />
    </div>
  )
}

// ───── stock analysis ─────
// Componente estable (fuera del render de StockAnalysisReport): si se define
// adentro, React lo trata como un tipo nuevo en cada tecla y remonta el
// input, perdiendo el foco a cada letra.
function StockSearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input type="search" value={value} onChange={e => onChange(e.target.value)}
      placeholder="Buscar producto (admite errores de tipeo)…"
      className="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-neutral-800" />
  )
}

const PRIO_META: Record<string, { label: string; rank: number; badge: string; row: string }> = {
  URGENTE:   { label: '🔴 Urgente',  rank: 0, badge: 'bg-red-100 text-red-700',       row: 'bg-red-50/40' },
  PEDIR:     { label: '🟠 Pedir',    rank: 1, badge: 'bg-orange-100 text-orange-700', row: '' },
  EN_CAMINO: { label: '🔵 En camino', rank: 2, badge: 'bg-blue-100 text-blue-700',     row: 'opacity-70' },
}

function StockAnalysisReport({ data, sub, setSub, onReload }: any) {
  const [picked, setPicked] = useState<Record<number, number>>({})
  const [hideCovered, setHideCovered] = useState(false)
  const [sortKey, setSortKey] = useState<string>('prioridad')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)
  const confirm = useConfirm()

  // Desactivar un producto desde el reporte (sale de circulación). Exige stock 0
  // (el servidor también lo valida); útil para descontinuar modelos viejos.
  const deactivate = async (p: any) => {
    if (p.stock_actual > 0) return
    if (!await confirm({ title: 'Desactivar producto', message: `¿Desactivar ${p.code} · ${p.name}? Saldrá de circulación (podés reactivarlo desde Productos).`, confirmText: 'Desactivar', danger: true })) return
    setBusyId(p.id)
    const res = await fetch(`/api/products/${p.id}/status`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'deactivate' }),
    })
    setBusyId(null)
    if (res.ok) onReload?.()
    else alert((await res.json()).error ?? 'No se pudo desactivar')
  }

  // Columna de acción reutilizable (Declive / Remate): desactivar si stock 0.
  const accionCol: Column<any> = {
    key: 'acciones', label: '', align: 'right',
    render: (p: any) => p.stock_actual === 0
      ? <button onClick={() => deactivate(p)} disabled={busyId === p.id}
          className="text-xs px-2 py-1 border border-red-300 text-red-600 rounded hover:bg-red-50 disabled:opacity-50 whitespace-nowrap">
          {busyId === p.id ? '…' : 'Desactivar'}
        </button>
      : <span className="text-[10px] text-neutral-400" title="Tiene stock; vendé o ajustá a 0 para poder desactivar">con stock</span>,
    sortValue: (p: any) => p.stock_actual === 0 ? 0 : 1,
  }

  const togglePick = (id: number, defaultQty: number) => {
    setPicked(p => {
      const next = { ...p }
      if (id in next) delete next[id]
      else next[id] = Math.max(1, defaultQty)
      return next
    })
  }
  // Filas del pedido a partir de la selección (ordenadas por código).
  const pedidoRows = () => Object.entries(picked)
    .map(([id, qty]) => {
      const p = (data.reposicion as any[]).find(r => r.id === Number(id))
      return { p, qty, costoTotal: Math.round((p.cost || 0) * qty * 100) / 100 }
    })
    .sort((a, b) => String(a.p.code).localeCompare(String(b.p.code)))

  // Exportar lista de pedido a Excel (.xlsx), organizada por columnas.
  const exportPedidoExcel = () => {
    const rows = pedidoRows()
    if (rows.length === 0) return
    const header = ['Código', 'Producto', 'Categoría', 'A pedir', 'Stock', 'En camino', 'V. mensual', 'Costo unit', 'Costo total']
    const aoa: (string | number)[][] = [header, ...rows.map(({ p, qty, costoTotal }) => [
      p.code, p.name, p.categoria ?? '', qty, p.stock_actual, p.en_transito, p.venta_mensual,
      Math.round((p.cost || 0) * 100) / 100, costoTotal,
    ])]
    const totalUds = rows.reduce((s, r) => s + r.qty, 0)
    const totalUsd = Math.round(rows.reduce((s, r) => s + r.costoTotal, 0) * 100) / 100
    aoa.push([], ['', 'TOTAL', '', totalUds, '', '', '', '', totalUsd])
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = [{ wch: 10 }, { wch: 42 }, { wch: 14 }, { wch: 8 }, { wch: 7 }, { wch: 9 }, { wch: 10 }, { wch: 10 }, { wch: 11 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Pedido')
    XLSX.writeFile(wb, `pedido_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  // Exportar lista de pedido a TXT ordenado (descarga).
  const exportPedidoTxt = () => {
    const rows = pedidoRows()
    if (rows.length === 0) return
    const totalUds = rows.reduce((s, r) => s + r.qty, 0)
    const lines = rows.map(({ p, qty }) => `${String(p.code).padEnd(10)} ${String(qty).padStart(4)} u   ${p.name}`)
    const sep = '-'.repeat(48)
    const txt = [`PEDIDO — ${new Date().toLocaleDateString('es-VE')}`, sep, ...lines, sep,
      `TOTAL: ${rows.length} productos · ${totalUds} unidades`].join('\n')
    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `pedido_${new Date().toISOString().slice(0, 10)}.txt`; a.click()
    URL.revokeObjectURL(url)
  }

  // Reposición — custom table with selection + priority + sort.
  // NOTE: estos hooks van ANTES de cualquier early return (reglas de hooks).
  const all: any[] = data.reposicion
  const list = useMemo(() => {
    const sortVal: Record<string, (p: any) => number | string> = {
      code:             p => p.code,
      name:             p => p.name,
      categoria:        p => p.categoria_pct ?? -1,
      stock_actual:     p => p.stock_actual,
      en_transito:      p => p.en_transito,
      venta_mensual:    p => p.venta_mensual,
      cobertura:        p => p.cobertura,
      cobertura_total:  p => p.cobertura_total,
      ganancia_mensual: p => p.ganancia_mensual,
      sugerido_comprar: p => p.sugerido_comprar,
      prioridad:        p => PRIO_META[p.prioridad]?.rank ?? 9,
    }
    let l = hideCovered ? all.filter(p => p.prioridad !== 'EN_CAMINO') : [...all]
    if (search.trim()) l = l.filter(p => matchFuzzy(search, p.code, p.name, p.categoria))
    const f = sortVal[sortKey]
    if (f) {
      l.sort((a, b) => {
        const va = f(a), vb = f(b)
        const r = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))
        return sortDir === 'desc' ? -r : r
      })
    }
    return l
  }, [all, hideCovered, search, sortKey, sortDir])


  if (sub === 'declive') {
    const cols: Column<any>[] = [
      { key: 'code', label: 'Código', render: p => <span className="font-mono text-xs">{p.code}</span>, sortValue: p => p.code },
      { key: 'name', label: 'Producto', sortValue: p => p.name },
      { key: 'stock_actual', label: 'Stock', align: 'right', sortValue: p => p.stock_actual },
      { key: 'ventas_4m_prior', label: 'Antes (5-8m)', align: 'right', render: p => `${p.ventas_4m_prior} u`, sortValue: p => p.ventas_4m_prior },
      { key: 'ventas_4m_recent', label: 'Ahora (últ. 4m)', align: 'right', render: p => `${p.ventas_4m_recent} u`, sortValue: p => p.ventas_4m_recent },
      { key: 'caida', label: 'Caída', align: 'right',
        render: p => { const d = p.ventas_4m_prior > 0 ? Math.round((1 - p.ventas_4m_recent / p.ventas_4m_prior) * 100) : 0; return <span className="text-red-600 font-medium">−{d}%</span> },
        sortValue: p => p.ventas_4m_prior > 0 ? (p.ventas_4m_recent / p.ventas_4m_prior) : 1 },
      accionCol,
    ]
    const baseRows = data.declive ?? []
    const rows = search.trim() ? baseRows.filter((p: any) => matchFuzzy(search, p.code, p.name)) : baseRows
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <SubTabs sub={sub} setSub={setSub} data={data} />
          <StockSearchBox value={search} onChange={setSearch} />
        </div>
        <p className="text-xs text-neutral-500 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          📉 Ventas en caída: los 4 meses previos (5-8) vendieron al menos el <b>doble</b> que los
          últimos 4. Candidatos a <b>descontinuar</b>. Si ya están en stock 0, podés desactivarlos acá.
        </p>
        <DataTable columns={cols} rows={rows} exportName="stock_declive" emptyText="Sin productos en declive" />
      </div>
    )
  }

  if (sub === 'remate' || sub === 'nuevos') {
    const cols: Column<any>[] = [
      { key: 'code', label: 'Código', render: p => <span className="font-mono text-xs">{p.code}</span>, sortValue: p => p.code },
      { key: 'name', label: 'Producto', sortValue: p => p.name },
      { key: 'stock_actual', label: 'Stock', align: 'right', sortValue: p => p.stock_actual },
      { key: 'ventas_6m', label: 'Ventas 6m', align: 'right', sortValue: p => p.ventas_6m },
      { key: 'venta_mensual', label: 'V. mensual', align: 'right', sortValue: p => p.venta_mensual },
      { key: 'meses_disponible', label: 'Antigüedad', align: 'right', render: p => `${p.meses_disponible} m`, sortValue: p => p.meses_disponible },
      { key: 'meses_duracion', label: 'Duración', align: 'right', render: p => `${p.meses_duracion} m`, sortValue: p => p.meses_duracion },
      // En remate se puede desactivar (stock 0); en nuevos no tiene sentido.
      ...(sub === 'remate' ? [accionCol] : []),
    ]
    const baseRows = sub === 'nuevos' ? (data.nuevos ?? []) : data.remate
    const rows = search.trim() ? baseRows.filter((p: any) => matchFuzzy(search, p.code, p.name)) : baseRows
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <SubTabs sub={sub} setSub={setSub} data={data} />
          <StockSearchBox value={search} onChange={setSearch} />
        </div>
        {sub === 'nuevos' && (
          <p className="text-xs text-neutral-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
            🆕 Recién llegados (menos de 3 meses en inventario). Tienen pocas ventas porque aún
            no tuvieron tiempo de exposición, por eso <b>no</b> se cuentan como remate todavía.
          </p>
        )}
        <DataTable columns={cols} rows={rows} exportName={sub === 'nuevos' ? 'stock_nuevos' : 'stock_remate'} emptyText="Sin productos" />
      </div>
    )
  }

  // Resúmenes de prioridad (no son hooks, pueden ir tras el early return)
  const urgentes = all.filter(p => p.prioridad === 'URGENTE')
  const aPedir   = all.filter(p => p.prioridad === 'PEDIR')
  const enCamino = all.filter(p => p.prioridad === 'EN_CAMINO')
  const gananciaRiesgo = [...urgentes, ...aPedir].reduce((s, p) => s + (p.ganancia_mensual || 0), 0)

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir(key === 'ganancia_mensual' || key === 'sugerido_comprar' ? 'desc' : 'asc') }
  }
  const Th = ({ k, label, align = 'left' }: { k: string; label: string; align?: 'left' | 'right' }) => (
    <th onClick={() => toggleSort(k)}
      className={`px-3 py-2 cursor-pointer select-none hover:text-neutral-800 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      {label}{sortKey === k && <span className="ml-1">{sortDir === 'asc' ? '▲' : '▼'}</span>}
    </th>
  )

  const pickedCount = Object.keys(picked).length
  const pickedQty   = Object.values(picked).reduce((s, q) => s + q, 0)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <SubTabs sub={sub} setSub={setSub} data={data} />
        <StockSearchBox value={search} onChange={setSearch} />
      </div>

      {/* resumen de prioridad */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard compact label="🔴 Urgentes"        value={urgentes.length} accent="text-red-600" />
        <KPICard compact label="🟠 A pedir"          value={aPedir.length} accent="text-orange-600" />
        <KPICard compact label="🔵 Ya en camino"     value={enCamino.length} accent="text-blue-600" />
        <KPICard compact label="Ganancia/mes en riesgo" value={`$${money(gananciaRiesgo)}`} />
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <label className="flex items-center gap-2 text-xs text-neutral-600 cursor-pointer">
          <input type="checkbox" checked={hideCovered} onChange={e => setHideCovered(e.target.checked)} />
          Ocultar los que ya están cubiertos por lo que viene en camino
        </label>
        <span className="text-xs text-neutral-400">{list.length} productos</span>
      </div>

      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
        <div className="overflow-auto max-h-[70vh]">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-500 uppercase sticky top-0 z-10 shadow-[0_1px_0_rgba(0,0,0,0.06)]">
              <tr>
                <th className="px-3 py-2 w-8">
                  <input type="checkbox"
                    checked={pickedCount > 0 && pickedCount === list.length}
                    onChange={() => {
                      if (pickedCount === list.length) setPicked({})
                      else setPicked(Object.fromEntries(list.filter(r => r.sugerido_comprar > 0).map(r => [r.id, r.sugerido_comprar])))
                    }} />
                </th>
                <Th k="prioridad" label="Prioridad" />
                <Th k="code" label="Código" />
                <Th k="name" label="Producto" />
                <Th k="categoria" label="Categoría" align="right" />
                <Th k="stock_actual" label="Stock" align="right" />
                <Th k="en_transito" label="En camino" align="right" />
                <Th k="venta_mensual" label="V. mens" align="right" />
                <Th k="cobertura" label="Cobertura" align="right" />
                <Th k="cobertura_total" label="Cob+tránsito" align="right" />
                <Th k="ganancia_mensual" label="Gan/mes" align="right" />
                <Th k="sugerido_comprar" label="Sugerido" align="right" />
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr><td colSpan={12} className="px-3 py-8 text-center text-neutral-400">Sin productos para reponer</td></tr>
              )}
              {list.map((p, i) => {
                const isPicked = p.id in picked
                const meta = PRIO_META[p.prioridad] ?? PRIO_META.PEDIR
                return (
                  <tr key={p.id} title={p.alerta}
                    className={`border-t border-neutral-50 hover:bg-neutral-50 ${isPicked ? 'bg-emerald-50/60' : meta.row || (i % 2 ? 'bg-neutral-50/40' : '')}`}>
                    <td className="px-3 py-2 text-center">
                      <input type="checkbox" checked={isPicked}
                        onChange={() => togglePick(p.id, p.sugerido_comprar)} />
                    </td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs whitespace-nowrap ${meta.badge}`}>{meta.label}</span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{p.code}</td>
                    <td className="px-3 py-2">{p.name}</td>
                    <td className="px-3 py-2 text-right">
                      {p.categoria
                        ? <span className="px-2 py-0.5 rounded text-xs whitespace-nowrap"
                            style={{ backgroundColor: (p.categoria_color || '#999') + '22', color: p.categoria_color || '#666' }}>
                            {p.categoria}{p.categoria_pct != null ? ` ${p.categoria_pct}%` : ''}
                          </span>
                        : <span className="text-neutral-300">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right">{p.stock_actual}</td>
                    <td className={`px-3 py-2 text-right ${p.en_transito > 0 ? 'text-blue-600 font-medium' : 'text-neutral-300'}`}>{p.en_transito || '—'}</td>
                    <td className="px-3 py-2 text-right">{p.venta_mensual}</td>
                    <td className="px-3 py-2 text-right">{p.cobertura} m</td>
                    <td className="px-3 py-2 text-right font-medium">{p.cobertura_total} m</td>
                    <td className="px-3 py-2 text-right text-green-600">${money(p.ganancia_mensual)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{p.sugerido_comprar}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Floating action bar */}
      {pickedCount > 0 && (
        <div className="sticky bottom-4 z-30 flex items-center justify-between gap-3 bg-neutral-900 text-white rounded-xl shadow-lg px-4 py-3">
          <div className="text-sm">
            <span className="font-bold">{pickedCount}</span> productos seleccionados
            <span className="text-neutral-400 mx-2">·</span>
            <span className="font-bold">{pickedQty}</span> unidades
          </div>
          <div className="flex gap-2">
            <button onClick={() => setPicked({})}
              className="px-3 py-1.5 text-sm text-neutral-300 hover:text-white">
              Limpiar
            </button>
            <button onClick={exportPedidoExcel} title="Descargar lista de pedido en Excel"
              className="px-3 py-1.5 border border-neutral-600 text-white rounded text-sm font-medium hover:bg-neutral-800">
              📊 Excel
            </button>
            <button onClick={exportPedidoTxt} title="Descargar lista de pedido en TXT ordenado"
              className="px-4 py-1.5 bg-white text-neutral-900 rounded text-sm font-semibold hover:bg-neutral-100">
              📄 TXT
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

type StockSub = 'reposicion' | 'remate' | 'nuevos' | 'declive'
function SubTabs({ sub, setSub, data }: { sub: StockSub; setSub: (s: StockSub) => void; data: any }) {
  return (
    <div className="flex gap-2 flex-wrap">
      <button onClick={() => setSub('reposicion')} className={`px-4 py-2 rounded-lg text-sm ${sub === 'reposicion' ? 'bg-orange-500 text-white' : 'bg-neutral-100'}`}>
        Reposición ({data.reposicion.length})
      </button>
      <button onClick={() => setSub('declive')} className={`px-4 py-2 rounded-lg text-sm ${sub === 'declive' ? 'bg-amber-500 text-white' : 'bg-neutral-100'}`}>
        Declive ({(data.declive ?? []).length})
      </button>
      <button onClick={() => setSub('remate')} className={`px-4 py-2 rounded-lg text-sm ${sub === 'remate' ? 'bg-red-500 text-white' : 'bg-neutral-100'}`}>
        Remate ({data.remate.length})
      </button>
      <button onClick={() => setSub('nuevos')} className={`px-4 py-2 rounded-lg text-sm ${sub === 'nuevos' ? 'bg-blue-500 text-white' : 'bg-neutral-100'}`}>
        Nuevos ({(data.nuevos ?? []).length})
      </button>
    </div>
  )
}

// ───── top products ─────
function TopProductsReport({ rows }: { rows: any[] }) {
  const maxQty = Math.max(...rows.map(r => r.total_qty), 1)
  const totalVenta = rows.reduce((a, x) => a + x.total_venta, 0)
  const totalGan   = rows.reduce((a, x) => a + x.ganancia, 0)

  const cols: Column<any>[] = [
    { key: 'code', label: 'Código', render: p => <span className="font-mono text-xs">{p.code}</span>, sortValue: p => p.code },
    { key: 'name', label: 'Producto', sortValue: p => p.name },
    { key: 'category', label: 'Categoría', render: p => <span className="text-xs">{p.category}</span>, sortValue: p => p.category },
    { key: 'total_qty', label: 'Cant.', align: 'right', sortValue: p => p.total_qty,
      render: p => (
        <div className="flex items-center justify-end gap-2">
          <div className="h-1.5 bg-blue-200 rounded" style={{ width: `${Math.round(p.total_qty / maxQty * 60)}px` }} />
          <span>{p.total_qty}</span>
        </div>
      ), total: rs => rs.reduce((a, x) => a + x.total_qty, 0) },
    { key: 'total_venta', label: 'Venta', align: 'right', render: p => `$${money(p.total_venta)}`, sortValue: p => p.total_venta, total: () => `$${money(totalVenta)}`, exportValue: p => p.total_venta },
    { key: 'total_costo', label: 'Costo', align: 'right', render: p => `$${money(p.total_costo)}`, sortValue: p => p.total_costo, exportValue: p => p.total_costo },
    { key: 'total_comision', label: 'Comisión', align: 'right', render: p => <span className="text-red-500">${money(p.total_comision || 0)}</span>, sortValue: p => p.total_comision || 0, exportValue: p => p.total_comision || 0 },
    { key: 'ganancia', label: 'Ganancia', align: 'right', render: p => <span className="text-green-600">${money(p.ganancia)}</span>, sortValue: p => p.ganancia, total: () => `$${money(totalGan)}`, exportValue: p => p.ganancia },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <KPICard compact label="Productos"     value={rows.length} />
        <KPICard compact label="Venta total"   value={`$${money(totalVenta)}`} />
        <KPICard compact label="Ganancia total" value={`$${money(totalGan)}`} accent="text-green-600" />
      </div>
      <DataTable columns={cols} rows={rows} exportName="top_productos" emptyText="Sin ventas en el período" />
    </div>
  )
}

// ───── in transit ─────
function InTransitReport({ rows, tipo, setTipo }: any) {
  const filtered = tipo ? (rows as any[]).filter(o => o.tipo === tipo) : rows
  const exportFlat = () => {
    const flat: Record<string, unknown>[] = []
    for (const o of filtered) for (const i of o.items) {
      flat.push({ Orden: o.order_number, Tipo: o.tipo, Proveedor: o.supplier_name, Estado: o.status, Codigo: i.code, Producto: i.name, Cantidad: i.quantity, Recibido: i.received, Pendiente: i.pending })
    }
    exportRows(`transito_${new Date().toISOString().slice(0, 10)}.xlsx`, flat, 'Transito')
  }

  const totalPend = (filtered as any[]).reduce((s, o) => s + o.items.reduce((a: number, i: any) => a + i.pending, 0), 0)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex items-center gap-3">
          <select value={tipo} onChange={e => setTipo(e.target.value)} className="border border-neutral-300 rounded-lg px-2 py-1.5 text-sm">
            <option value="">Local + Importación</option>
            <option value="local">Solo local</option>
            <option value="import">Solo importación</option>
          </select>
          <span className="text-xs text-neutral-500">
            {filtered.length} orden{filtered.length === 1 ? '' : 'es'} · <span className="text-orange-600 font-semibold">{totalPend}</span> und pendientes
          </span>
        </div>
        <button onClick={exportFlat} disabled={filtered.length === 0}
          className="text-xs px-3 py-1.5 border border-neutral-200 rounded-lg text-neutral-600 hover:bg-neutral-50 disabled:opacity-40">
          ↓ Exportar Excel
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-neutral-400 text-sm py-8 text-center">Sin órdenes en tránsito</div>
      ) : (
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
          <div className="overflow-auto max-h-[70vh]">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-xs uppercase text-neutral-500 sticky top-0 z-10 shadow-[0_1px_0_rgba(0,0,0,0.06)]">
              <tr className="border-b border-neutral-100">
                <th className="px-3 py-2 text-left">Producto</th>
                <th className="px-3 py-2 text-right w-20">Cant.</th>
                <th className="px-3 py-2 text-right w-24">Recibido</th>
                <th className="px-3 py-2 text-right w-24">Pendiente</th>
              </tr>
            </thead>
            <tbody>
              {(filtered as any[]).map((o: any, idx: number) => {
                const pend = o.items.reduce((a: number, i: any) => a + i.pending, 0)
                return (
                  <Fragment key={idx}>
                    <tr className="bg-neutral-50/70 border-t border-neutral-200">
                      <td colSpan={3} className="px-3 py-1.5">
                        <span className="font-mono font-semibold text-neutral-800">{o.order_number}</span>
                        <span className="text-neutral-400 text-xs"> · {o.tipo}</span>
                        {o.supplier_name && <span className="text-neutral-500 text-xs"> · {o.supplier_name}</span>}
                        <span className="ml-2 inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-neutral-200 text-neutral-700">{o.status}</span>
                      </td>
                      <td className="px-3 py-1.5 text-right text-xs text-orange-600 font-semibold whitespace-nowrap">{pend} pend.</td>
                    </tr>
                    {o.items.map((i: any, k: number) => (
                      <tr key={k} className="border-t border-neutral-50">
                        <td className="px-3 py-1.5">
                          <span className="font-mono text-xs text-neutral-400 mr-2">{i.code}</span>{i.name}
                        </td>
                        <td className="px-3 py-1.5 text-right">{i.quantity}</td>
                        <td className="px-3 py-1.5 text-right text-green-600">{i.received}</td>
                        <td className="px-3 py-1.5 text-right font-semibold">{i.pending}</td>
                      </tr>
                    ))}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  )
}
