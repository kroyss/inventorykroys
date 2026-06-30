'use client'
import { useState, useEffect, useMemo, useRef, Fragment } from 'react'
import {
  DateRangeBar, presetRange, type DatePreset,
  KPICard, DataTable, exportRows, money, type Column,
} from '@/components/ui'
import { usePersistedTab } from '@/lib/usePersistedTab'

type Tab = 'ventas' | 'compras' | 'inventario' | 'stock' | 'top' | 'transito'

const PERIOD_TABS: { key: Tab; label: string }[] = [
  { key: 'ventas',  label: 'Ventas' },
  { key: 'compras', label: 'Compras' },
  { key: 'top',     label: 'Top productos' },
]
const STATE_TABS: { key: Tab; label: string }[] = [
  { key: 'inventario', label: 'Inventario' },
  { key: 'stock',      label: 'Stock' },
  { key: 'transito',   label: 'En tránsito' },
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
  const [stockSub, setStockSub] = useState<'reposicion' | 'remate' | 'nuevos'>('reposicion')
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
    // deep-link from dashboard: ?tab= and ?sub=
    const params = new URLSearchParams(window.location.search)
    const t = params.get('tab')
    if (t && ['ventas', 'compras', 'inventario', 'stock', 'top', 'transito'].includes(t)) setTab(t as Tab)
    const s = params.get('sub')
    if (s === 'remate' || s === 'reposicion' || s === 'nuevos') setStockSub(s)
  }, [])

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
                <input type="number" value={topN} onChange={e => setTopN(parseInt(e.target.value) || 10)}
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
        <StockAnalysisReport data={data} sub={stockSub} setSub={setStockSub} />
      )}
      {!loading && data && tab === 'top'      && Array.isArray(data) && <TopProductsReport rows={data} />}
      {!loading && data && tab === 'transito' && Array.isArray(data) && (
        <InTransitReport rows={data} tipo={transTipo} setTipo={setTransTipo} />
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
      <SearchBar value={search} onChange={setSearch} placeholder="Buscar código o producto…" />
      <DataTable columns={cols} rows={rows} exportName="inventario" />
    </div>
  )
}

// ───── stock analysis ─────
const PRIO_META: Record<string, { label: string; rank: number; badge: string; row: string }> = {
  URGENTE:   { label: '🔴 Urgente',  rank: 0, badge: 'bg-red-100 text-red-700',       row: 'bg-red-50/40' },
  PEDIR:     { label: '🟠 Pedir',    rank: 1, badge: 'bg-orange-100 text-orange-700', row: '' },
  EN_CAMINO: { label: '🔵 En camino', rank: 2, badge: 'bg-blue-100 text-blue-700',     row: 'opacity-70' },
}

function StockAnalysisReport({ data, sub, setSub }: any) {
  const [picked, setPicked] = useState<Record<number, number>>({})
  const [hideCovered, setHideCovered] = useState(false)
  const [sortKey, setSortKey] = useState<string>('prioridad')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const togglePick = (id: number, defaultQty: number) => {
    setPicked(p => {
      const next = { ...p }
      if (id in next) delete next[id]
      else next[id] = Math.max(1, defaultQty)
      return next
    })
  }
  const setQty = (id: number, qty: number) => {
    setPicked(p => ({ ...p, [id]: Math.max(1, qty) }))
  }

  const createPO = () => {
    const items = Object.entries(picked).map(([id, qty]) => {
      const row = (data.reposicion as any[]).find(r => r.id === Number(id))
      return { id: Number(id), code: row.code, name: row.name, quantity: qty }
    })
    if (items.length === 0) return
    sessionStorage.setItem('repo_items', JSON.stringify(items))
    window.location.href = '/compras?new=1&from=reposicion'
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
    const f = sortVal[sortKey]
    if (f) {
      l.sort((a, b) => {
        const va = f(a), vb = f(b)
        const r = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))
        return sortDir === 'desc' ? -r : r
      })
    }
    return l
  }, [all, hideCovered, sortKey, sortDir])

  if (sub === 'remate' || sub === 'nuevos') {
    const cols: Column<any>[] = [
      { key: 'code', label: 'Código', render: p => <span className="font-mono text-xs">{p.code}</span>, sortValue: p => p.code },
      { key: 'name', label: 'Producto', sortValue: p => p.name },
      { key: 'stock_actual', label: 'Stock', align: 'right', sortValue: p => p.stock_actual },
      { key: 'ventas_6m', label: 'Ventas 6m', align: 'right', sortValue: p => p.ventas_6m },
      { key: 'venta_mensual', label: 'V. mensual', align: 'right', sortValue: p => p.venta_mensual },
      { key: 'meses_disponible', label: 'Antigüedad', align: 'right', render: p => `${p.meses_disponible} m`, sortValue: p => p.meses_disponible },
      { key: 'meses_duracion', label: 'Duración', align: 'right', render: p => `${p.meses_duracion} m`, sortValue: p => p.meses_duracion },
    ]
    const rows = sub === 'nuevos' ? (data.nuevos ?? []) : data.remate
    return (
      <div className="space-y-3">
        <SubTabs sub={sub} setSub={setSub} data={data} />
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
      <SubTabs sub={sub} setSub={setSub} data={data} />

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
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-500 uppercase">
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
                <th className="px-3 py-2 text-right w-24">A pedir</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr><td colSpan={13} className="px-3 py-8 text-center text-neutral-400">Sin productos para reponer</td></tr>
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
                    <td className="px-3 py-2 text-right">
                      {isPicked ? (
                        <input type="number" min={1} value={picked[p.id]}
                          onChange={e => setQty(p.id, parseInt(e.target.value, 10) || 1)}
                          className="w-16 border border-neutral-300 rounded px-1.5 py-0.5 text-right text-sm" />
                      ) : <span className="text-neutral-300">—</span>}
                    </td>
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
            <button onClick={createPO}
              className="px-4 py-1.5 bg-white text-neutral-900 rounded text-sm font-semibold hover:bg-neutral-100">
              Crear orden de compra →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

type StockSub = 'reposicion' | 'remate' | 'nuevos'
function SubTabs({ sub, setSub, data }: { sub: StockSub; setSub: (s: StockSub) => void; data: any }) {
  return (
    <div className="flex gap-2">
      <button onClick={() => setSub('reposicion')} className={`px-4 py-2 rounded-lg text-sm ${sub === 'reposicion' ? 'bg-orange-500 text-white' : 'bg-neutral-100'}`}>
        Reposición ({data.reposicion.length})
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
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-xs uppercase text-neutral-500">
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
      )}
    </div>
  )
}
