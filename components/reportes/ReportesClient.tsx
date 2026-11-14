'use client'
import ResumenMetricas from '@/components/reportes/ResumenMetricas'
import StockReport from '@/components/reportes/StockReport'
import { useState, useEffect, useMemo, useRef, Fragment } from 'react'
import {
  DateRangeBar, presetRange, type DatePreset,
  KPICard, DataTable, exportRows, money, type Column,
  PageHeader, Tabs, StatusBadge, Cargando,
} from '@/components/ui'
import { usePersistedTab } from '@/lib/usePersistedTab'
import { matchFuzzy } from '@/lib/search'
import { useDeepLinkParam } from '@/lib/useDeepLinkParam'

type Tab = 'resumen' | 'ventas' | 'compras' | 'inventario' | 'stock' | 'top' | 'transito' | 'conteos' | 'atencion'

// Valores aceptados en los deep-links ?tab= y ?sub= (en mayúsculas: el hook
// normaliza, para que el link funcione escrito de cualquier forma).
const REPORT_TABS = ['RESUMEN', 'VENTAS', 'COMPRAS', 'INVENTARIO', 'STOCK', 'TOP', 'TRANSITO', 'CONTEOS', 'ATENCION'] as const
const STOCK_SUBS  = ['REPOSICION', 'REMATE', 'NUEVOS', 'DECLIVE'] as const

const PERIOD_TABS: { key: Tab; label: string }[] = [
  { key: 'ventas',  label: 'Ventas' },
  { key: 'compras', label: 'Compras' },
]
const STATE_TABS: { key: Tab; label: string }[] = [
  { key: 'inventario', label: 'Inventario' },
  { key: 'stock',      label: 'Stock' },
  { key: 'transito',   label: 'En tránsito' },
  { key: 'conteos',    label: 'Conteos' },
]

// analisisStock: módulo. Sin él no están Stock (reposición/declive/remate, calibrado a importaciones)
// ni Conteos (conteos físicos).
// importaciones: módulo. Sin él no se ofrece el filtro Local/Importación (solo hay compras locales).
// atencion: «Atención ML» (preguntas, respuestas, tiempo y ventas de ML; módulo atencion_ml, 08-11).
// metricas: «Resumen» (módulo metricas, 08-11): todo junto con período contra el anterior; es la primera pestaña.
export default function ReportesClient({ analisisStock, conteos = false, importaciones, despachaVE = false, metricas = false }: { analisisStock: boolean; conteos?: boolean; importaciones: boolean; despachaVE?: boolean; atencion?: boolean; metricas?: boolean }) {
  const [tabGuardada, setTab]    = usePersistedTab<Tab>('tab:reportes', metricas ? 'resumen' : 'ventas')
  // 14-11: «Atención ML» ya no es pestaña (sus números están en Resumen → Atención en MercadoLibre); un link viejo cae en Resumen.
  // 14-11: «Top productos» pasó a Resumen → Más vendidos → Ver detalle; un link viejo (?tab=top) cae en Resumen.
  const tab = tabGuardada === 'atencion' || tabGuardada === 'top' ? (metricas ? 'resumen' : 'ventas')
    : (!analisisStock && tabGuardada === 'stock') || (!conteos && tabGuardada === 'conteos') || (!metricas && tabGuardada === 'resumen') ? 'ventas' : tabGuardada
  const stateTabs = STATE_TABS.filter(t => (analisisStock || t.key !== 'stock') && (conteos || t.key !== 'conteos'))
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
  // Ventas status / Compras tipo / Tránsito tipo filters
  const [ventaStatus, setVentaStatus] = useState('')
  const [compraTipo,  setCompraTipo]  = useState('')
  const [transTipo,   setTransTipo]   = useState('')

  // Deep-links desde las cards del dashboard: ?tab= y ?sub=. Con useSearchParams
  // se re-aplican si cambia la URL sin desmontar la pantalla.
  const [urlTab] = useDeepLinkParam('tab', REPORT_TABS)
  const [urlSub] = useDeepLinkParam('sub', STOCK_SUBS)
  useEffect(() => { if (urlTab) setTab(urlTab.toLowerCase() as Tab) }, [urlTab])
  useEffect(() => { if (urlSub) setStockSub(urlSub.toLowerCase() as typeof stockSub) }, [urlSub])

  useEffect(() => { load() }, [tab, dateFrom, dateTo])

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
    if (tab === 'transito')    url = `/api/reports/in-transit`
    if (tab === 'conteos')     url = `/api/reports/counts`
    if (!url) { setLoading(false); return }       // Atención ML carga sola (ResumenAtencion)
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

  const needsDates = tab === 'ventas' || tab === 'compras'

  return (
    <div className="space-y-4">
      <PageHeader title="Reportes" subtitle="Por período (ventas, compras, más vendidos) o del estado actual del inventario" />
      {/* pestañas en dos grupos: por período | estado actual */}
      <Tabs value={tab} onChange={t => { setData(null); setTab(t) }} items={[
        ...(metricas ? [{ value: 'resumen' as Tab, label: 'Resumen', group: 'periodo' }] : []),
        ...PERIOD_TABS.map(t => ({ value: t.key, label: t.label, group: 'periodo' })),
        ...stateTabs.map(t => ({ value: t.key, label: t.label, group: 'estado' })),
      ]} />

      {/* date filters */}
      {needsDates && (
        <div className="space-y-2">
          <DateRangeBar
            preset={preset} from={dateFrom} to={dateTo}
            onPreset={handlePreset} onFrom={setDateFrom} onTo={setDateTo}
            onApply={load} loading={loading}
          />
        </div>
      )}

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded">{error}</div>}
      {loading && <Cargando />}

      {!loading && data && tab === 'ventas'     && data.sales       && (
        <SalesReport data={data} search={search} setSearch={setSearch} statusF={ventaStatus} setStatusF={setVentaStatus} despachaVE={despachaVE} />
      )}
      {!loading && data && tab === 'compras'    && data.purchases   && (
        <PurchasesReport data={data} search={search} setSearch={setSearch} tipo={importaciones ? compraTipo : ''} setTipo={setCompraTipo} importaciones={importaciones} />
      )}
      {!loading && data && tab === 'inventario' && data.items       && (
        <InventoryReport data={data} search={search} setSearch={setSearch} />
      )}
      {!loading && data && tab === 'stock'      && data.reposicion  && (
        <StockReport data={data} sub={stockSub} setSub={setStockSub} onReload={load} />
      )}
      {tab === 'resumen' && <ResumenMetricas />}
      {!loading && data && tab === 'transito' && Array.isArray(data) && (
        <InTransitReport rows={data} tipo={importaciones ? transTipo : ''} setTipo={setTransTipo} importaciones={importaciones} />
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
function SalesReport({ data, search, setSearch, statusF, setStatusF, despachaVE }: any) {
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
    { key: 'status', label: 'Estado', render: s => <StatusBadge status={s.status} />, sortValue: s => s.status },
    { key: 'total_amount', label: 'Total', align: 'right', render: s => `$${money(s.total_amount)}`, sortValue: s => s.total_amount, total: rs => `$${money(rs.reduce((a, x) => a + x.total_amount, 0))}`, exportValue: s => s.total_amount },
    { key: 'cost', label: 'Costo', align: 'right', render: s => `$${money(s.cost)}`, sortValue: s => s.cost, total: rs => `$${money(rs.reduce((a, x) => a + x.cost, 0))}`, exportValue: s => s.cost },
    { key: 'commission', label: 'Comisión', align: 'right', render: s => <span className="text-neutral-600">${money(s.commission || 0)}</span>, sortValue: s => s.commission || 0, total: rs => `$${money(rs.reduce((a, x) => a + (x.commission || 0), 0))}`, exportValue: s => s.commission || 0 },
    { key: 'ganancia', label: 'Ganancia', align: 'right', render: s => <span className="text-emerald-600 font-medium">${money(s.total_amount - s.cost - (s.commission || 0))}</span>, sortValue: s => s.total_amount - s.cost - (s.commission || 0), total: rs => `$${money(rs.reduce((a, x) => a + (x.total_amount - x.cost - (x.commission || 0)), 0))}`, exportValue: s => s.total_amount - s.cost - (s.commission || 0) },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KPICard compact label="Cantidad" value={data.totals.count} />
        <KPICard compact label="Ventas"   value={`$${money(data.totals.total_amount)}`} />
        <KPICard compact label="Costos"   value={`$${money(data.totals.total_cost)}`} />
        <KPICard compact label="Comisión" value={`$${money(data.totals.total_commission || 0)}`} />
        <KPICard compact label={`Ganancia · ${data.totals.margin_pct ?? data.totals.profit_pct}% s/venta`}
          value={`$${money(data.totals.profit)}`} tone="bueno" />
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <SearchBar value={search} onChange={setSearch} placeholder="Buscar orden o cliente…" />
        <select value={statusF} onChange={e => setStatusF(e.target.value)} className="border border-neutral-300 rounded-lg px-2 py-1.5 text-sm">
          <option value="">Todos los estados</option>
          <option value="PROCESADA">{despachaVE ? 'Por despachar' : 'Procesada'}</option>
          <option value="DESCARGADA">{despachaVE ? 'Despachada' : 'Descargada'}</option>
          <option value="DESCARGADA_LOCAL">Local entregada</option>
        </select>
      </div>
      <DataTable columns={cols} rows={rows} exportName="ventas" emptyText="Sin ventas en el período" />
    </div>
  )
}

// ───── compras ─────
function PurchasesReport({ data, search, setSearch, tipo, setTipo, importaciones }: any) {
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
        <KPICard compact label="Total pagado" value={`$${money(data.totals.total_paid)}`} />
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <SearchBar value={search} onChange={setSearch} placeholder="Buscar orden o proveedor…" />
        {importaciones && <select value={tipo} onChange={e => setTipo(e.target.value)} className="border border-neutral-300 rounded-lg px-2 py-1.5 text-sm">
          <option value="">Local + Importación</option>
          <option value="local">Solo local</option>
          <option value="import">Solo importación</option>
        </select>}
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
      <StatusBadge status={p.status} />
    ), sortValue: p => p.status },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard compact label="Productos"   value={data.totals.count} />
        <KPICard compact label="Unidades"    value={data.totals.total_units} />
        <KPICard compact label="Valor costo" value={`$${money(data.totals.total_cost_value)}`} />
        <KPICard compact label="Valor venta" value={`$${money(data.totals.total_sale_value)}`} />
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
        <KPICard compact label="Unidades faltantes" value={resumen?.faltantes ?? 0} tone={(resumen?.faltantes ?? 0) > 0 ? 'problema' : 'neutro'} />
        <KPICard compact label="Unidades sobrantes" value={resumen?.sobrantes ?? 0} />
        <KPICard compact label="Reincidentes" value={reincidentes} tone={reincidentes > 0 ? 'atencion' : 'neutro'} />
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

// ───── in transit ─────
function InTransitReport({ rows, tipo, setTipo, importaciones }: any) {
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
          {importaciones && <select value={tipo} onChange={e => setTipo(e.target.value)} className="border border-neutral-300 rounded-lg px-2 py-1.5 text-sm">
            <option value="">Local + Importación</option>
            <option value="local">Solo local</option>
            <option value="import">Solo importación</option>
          </select>}
          <span className="text-xs text-neutral-500">
            {filtered.length} orden{filtered.length === 1 ? '' : 'es'} · <span className="text-amber-600 font-semibold">{totalPend}</span> und pendientes
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
            <thead className="bg-neutral-50 text-xs text-neutral-500 sticky top-0 z-10 shadow-[0_1px_0_rgba(0,0,0,0.06)]">
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
                        {importaciones && <span className="text-neutral-400 text-xs"> · {o.tipo}</span>}
                        {o.supplier_name && <span className="text-neutral-500 text-xs"> · {o.supplier_name}</span>}
                        <span className="ml-2 inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-neutral-200 text-neutral-700">{o.status}</span>
                      </td>
                      <td className="px-3 py-1.5 text-right text-xs text-amber-600 font-semibold whitespace-nowrap">{pend} pend.</td>
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
