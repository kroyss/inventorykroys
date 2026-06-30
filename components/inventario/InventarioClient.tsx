'use client'
import { useState, useCallback, useEffect } from 'react'
import type { InventoryItem, InventoryMovement, StockStatus, UserRole, Country } from '@/lib/types'
import { Pagination } from '@/components/ui'
import { useEscape } from '@/components/ui/useEscape'
import { matchTokens } from '@/lib/search'

// ─── helpers ────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
// Pesos colombianos: sin decimales (ej. 140.700)
function fmtPeso(n: number) {
  return Number(n).toLocaleString('de-DE', { maximumFractionDigits: 0 })
}
function fmtDate(s: string) {
  return new Date(s).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const STATUS_LABEL: Record<StockStatus, string> = {
  OK:        'OK',
  BAJO:      'BAJO',
  SIN_STOCK: 'SIN STOCK',
  INACTIVO:  'INACTIVO',
}
const STATUS_COLOR: Record<StockStatus, string> = {
  OK:        'bg-green-50 text-green-700',
  BAJO:      'bg-yellow-50 text-yellow-700',
  SIN_STOCK: 'bg-red-50 text-red-700',
  INACTIVO:  'bg-neutral-100 text-neutral-400',
}
const STATUS_DOT: Record<StockStatus, string> = {
  OK:        'bg-green-500',
  BAJO:      'bg-yellow-500',
  SIN_STOCK: 'bg-red-500',
  INACTIVO:  'bg-neutral-300',
}

type SortKey = 'code' | 'name' | 'quantity' | 'min_stock' | 'max_stock' | 'sale_price' | 'mlprice' | 'ventas_6m' | 'status'

// ─── component ──────────────────────────────────────────────────────────────
interface Props {
  initialItems: InventoryItem[]
  userRole:     UserRole
  country:      Country
}

export default function InventarioClient({ initialItems, userRole, country }: Props) {
  const isAdmin = userRole === 'admin'
  const isCO    = country === 'CO'
  const isVE    = country === 'VE'
  // En CO el precio de venta está en pesos (sin decimales); en VE en USD.
  const priceLabel = (n: number) => isCO ? `$${fmtPeso(n)}` : `$${fmt(n)}`
  // Precio ML (solo VE) = costo × (1+ganancia%) × (1+exceso%) = publicado con exceso.
  const [veExcess, setVeExcess] = useState(0)
  useEffect(() => {
    if (country !== 'VE') return
    fetch('/api/rates/latest').then(r => r.json()).then(d => setVeExcess(d?.excess_percentage ?? 0)).catch(() => {})
  }, [country])
  const mlPriceVE = (it: InventoryItem) =>
    it.total_cost * (1 + (it.profit_percentage ?? 0) / 100) * (1 + veExcess / 100)
  const [items,    setItems]    = useState<InventoryItem[]>(initialItems)
  const [selected, setSelected] = useState<InventoryItem | null>(null)
  const [search,   setSearch]   = useState('')
  const [statusF,  setStatusF]  = useState<StockStatus | ''>('')
  const [sortKey,  setSortKey]  = useState<SortKey>('name')
  const [sortDir,  setSortDir]  = useState<'asc' | 'desc'>('asc')
  const [tab,      setTab]      = useState<'config' | 'movimientos'>('config')
  const [msg,      setMsg]      = useState<{ type: 'error' | 'ok'; text: string } | null>(null)

  // config panel
  const [configEditing, setConfigEditing] = useState(false)
  const [configForm,    setConfigForm]    = useState({ min_stock: 0, max_stock: 0, sale_price: 0 })
  const [savingConfig,  setSavingConfig]  = useState(false)

  // adjustment panel
  const [adjForm, setAdjForm] = useState({ movement_type: 'IN' as 'IN' | 'OUT' | 'ADJUST', quantity: 0, notes: '' })
  const [savingAdj, setSavingAdj] = useState(false)

  // movements
  const [movements,      setMovements]      = useState<InventoryMovement[]>([])
  const [loadingMovements, setLoadingMovements] = useState(false)
  const [movPage, setMovPage] = useState(1)
  const MOV_PAGE_SIZE = 15

  // Apply ?estado= filter from URL (deep-link from dashboard)
  useEffect(() => {
    const e = new URLSearchParams(window.location.search).get('estado')
    if (e && ['SIN_STOCK', 'BAJO', 'OK', 'INACTIVO'].includes(e)) setStatusF(e as StockStatus)
  }, [])

  // Esc closes the slide-over
  useEscape(!!selected, () => setSelected(null))

  // ── select product → open slide-over ──
  async function selectItem(item: InventoryItem) {
    const nextTab = isAdmin ? 'config' : 'movimientos'
    setSelected(item)
    setTab(nextTab)
    setConfigEditing(false)
    setMovements([])
    setMsg(null)
    setConfigForm({ min_stock: item.min_stock, max_stock: item.max_stock, sale_price: item.sale_price })
    setAdjForm({ movement_type: 'IN', quantity: 0, notes: '' })
    // Use nextTab (not stale `tab` state) to decide whether to load movements immediately
    if (nextTab === 'movimientos' || tab === 'movimientos') await loadMovements(item.product_id)
  }

  async function loadMovements(productId: number) {
    setLoadingMovements(true)
    setMovPage(1)
    try {
      const res = await fetch(`/api/inventory/${productId}/movements`)
      setMovements(await res.json())
    } finally {
      setLoadingMovements(false)
    }
  }

  async function handleTabChange(t: 'config' | 'movimientos') {
    setTab(t)
    if (t === 'movimientos' && selected) await loadMovements(selected.product_id)
  }

  // ── save config ──
  const saveConfig = useCallback(async () => {
    if (!selected) return
    setSavingConfig(true); setMsg(null)
    try {
      const res = await fetch(`/api/inventory/${selected.product_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configForm),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); setMsg({ type: 'error', text: d.error ?? 'Error al guardar' }); return }
      const listRes = await fetch('/api/inventory')
      const updated: InventoryItem[] = await listRes.json()
      setItems(updated)
      const fresh = updated.find(i => i.product_id === selected.product_id)
      if (fresh) { setSelected(fresh); setConfigForm({ min_stock: fresh.min_stock, max_stock: fresh.max_stock, sale_price: fresh.sale_price }) }
      setConfigEditing(false)
      setMsg({ type: 'ok', text: 'Configuración guardada' })
      setTimeout(() => setMsg(null), 2500)
    } finally {
      setSavingConfig(false)
    }
  }, [selected, configForm])

  // ── save adjustment ──
  const saveAdjust = useCallback(async () => {
    if (!selected) return
    if (adjForm.movement_type !== 'ADJUST' && adjForm.quantity <= 0) return
    setSavingAdj(true); setMsg(null)
    try {
      const res = await fetch(`/api/inventory/${selected.product_id}/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adjForm),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); setMsg({ type: 'error', text: d.error ?? 'Error' }); return }
      const listRes = await fetch('/api/inventory')
      const updated: InventoryItem[] = await listRes.json()
      setItems(updated)
      const fresh = updated.find(i => i.product_id === selected.product_id)
      if (fresh) setSelected(fresh)
      setAdjForm({ movement_type: 'IN', quantity: 0, notes: '' })
      if (tab === 'movimientos') await loadMovements(selected.product_id)
      setMsg({ type: 'ok', text: 'Movimiento registrado' })
      setTimeout(() => setMsg(null), 2500)
    } finally {
      setSavingAdj(false)
    }
  }, [selected, adjForm, tab])

  // pagination
  const PAGE_SIZE = 15
  const [page, setPage] = useState(1)

  // ── sort helpers ──
  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir('asc') }
  }
  const sortArrow = (k: SortKey) => sortKey === k ? <span className="ml-1">{sortDir === 'asc' ? '▲' : '▼'}</span> : null

  // ── filter + sort ──
  const filtered = items
    .filter(item => {
      const matchSearch = matchTokens(search, item.code, item.name)
      const matchStatus = !statusF || item.status === statusF
      return matchSearch && matchStatus
    })
    .sort((a, b) => {
      const valueFor = (i: InventoryItem): number | string => {
        switch (sortKey) {
          case 'code':       return i.code
          case 'name':       return i.name.toLowerCase()
          case 'quantity':   return i.quantity
          case 'min_stock':  return i.min_stock
          case 'max_stock':  return i.max_stock
          case 'sale_price': return i.sale_price || i.final_price_usd
          case 'mlprice':    return mlPriceVE(i)
          case 'ventas_6m':  return i.ventas_6m
          case 'status':     return i.status
        }
      }
      const va = valueFor(a), vb = valueFor(b)
      const cmp = typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb))
      return sortDir === 'desc' ? -cmp : cmp
    })

  useEffect(() => { setPage(1) }, [search, statusF, sortKey, sortDir])

  const displayed = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const counts = {
    OK:        items.filter(i => i.status === 'OK').length,
    BAJO:      items.filter(i => i.status === 'BAJO').length,
    SIN_STOCK: items.filter(i => i.status === 'SIN_STOCK').length,
    INACTIVO:  items.filter(i => i.status === 'INACTIVO').length,
  }

  const activeItems = items.filter(i => i.is_active)
  const valorCosto  = activeItems.reduce((s, i) => s + i.quantity * i.total_cost, 0)                        // USD
  const valorVenta  = activeItems.reduce((s, i) => s + i.quantity * (i.sale_price || i.final_price_usd), 0) // CO: pesos · VE: USD

  type StockChip = StockStatus | ''
  const CHIPS: { val: StockChip; label: string; count: number; adminOnly?: boolean }[] = [
    { val: '',          label: 'Todos',        count: items.length },
    { val: 'SIN_STOCK', label: 'Sin stock',    count: counts.SIN_STOCK },
    { val: 'BAJO',      label: 'Stock bajo',   count: counts.BAJO,     adminOnly: true },
    { val: 'OK',        label: 'En nivel',     count: counts.OK,       adminOnly: true },
    // Inactivos ya no se listan en Inventario (solo en Productos).
  ]

  const th = (key: SortKey, label: string, align: 'left' | 'right' | 'center' = 'left') => (
    <th onClick={() => toggleSort(key)}
      className={`px-3 py-2 font-medium text-neutral-500 cursor-pointer select-none hover:text-neutral-800 ${
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
      }`}>
      {label}{sortArrow(key)}
    </th>
  )

  return (
    <div className="space-y-4">
      {/* KPI cards clickeables */}
      <div className={`grid gap-3 ${isAdmin ? 'grid-cols-2 md:grid-cols-5' : 'grid-cols-2 md:grid-cols-3'}`}>
        {CHIPS.filter(c => !c.adminOnly || isAdmin).map(c => {
          const active = statusF === c.val
          return (
            <button key={c.val} onClick={() => setStatusF(c.val as StockStatus)}
              className={`text-left bg-white rounded-xl border p-3 shadow-sm transition-all hover:border-neutral-400 ${
                active ? 'border-neutral-900 ring-1 ring-neutral-900' : 'border-neutral-200'
              }`}>
              <div className="text-xs text-neutral-500 mb-1">{c.label}</div>
              <div className="text-xl font-bold text-neutral-900">{c.count}</div>
            </button>
          )
        })}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {isAdmin && (
          <div className="text-xs text-neutral-500 flex flex-wrap gap-x-4">
            <span>Valor a costo: <span className="font-semibold text-neutral-800">${fmt(valorCosto)}{isCO ? ' USD' : ''}</span></span>
            <span>Valor a venta: <span className="font-semibold text-green-700">{priceLabel(valorVenta)}{isCO ? ' pesos' : ''}</span></span>
          </div>
        )}
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar código o nombre…"
          className="border border-neutral-300 rounded-lg px-3 py-2 text-sm w-full md:w-64 focus:outline-none focus:ring-2 focus:ring-neutral-800"
        />
      </div>

      {/* Tabla completa */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-xs">
              <tr className="border-b border-neutral-100">
                {th('code', 'Código')}
                {th('name', 'Nombre')}
                {th('quantity', 'Stock', 'right')}
                {isAdmin && th('min_stock', 'Mín', 'right')}
                {isAdmin && th('max_stock', 'Máx', 'right')}
                {th('sale_price', 'P. Venta', 'right')}
                {isVE && th('mlprice', 'Precio ML', 'right')}
                {isAdmin && th('ventas_6m', 'Ventas 6m', 'right')}
                {th('status', 'Estado', 'center')}
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {displayed.length === 0 && (
                <tr><td colSpan={(isAdmin ? 9 : 6) + (isVE ? 1 : 0)} className="px-3 py-8 text-center text-neutral-400">Sin resultados</td></tr>
              )}
              {displayed.map((item, i) => (
                <tr key={item.product_id}
                  onClick={() => selectItem(item)}
                  className={`border-b border-neutral-50 hover:bg-neutral-50 cursor-pointer ${i % 2 ? 'bg-neutral-50/40' : ''}`}>
                  <td className="px-3 py-2 font-mono text-xs text-neutral-500">{item.code}</td>
                  <td className="px-3 py-2 font-medium text-neutral-900">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[item.status]}`} />
                      {item.name}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-bold text-neutral-900">{item.quantity}</td>
                  {isAdmin && <td className="px-3 py-2 text-right text-neutral-500">{item.min_stock}</td>}
                  {isAdmin && <td className="px-3 py-2 text-right text-neutral-500">{item.max_stock}</td>}
                  <td className="px-3 py-2 text-right text-neutral-700">{priceLabel(item.sale_price || item.final_price_usd)}</td>
                  {isVE && <td className="px-3 py-2 text-right font-medium text-purple-700">${fmt(mlPriceVE(item))}</td>}
                  {isAdmin && <td className="px-3 py-2 text-right text-neutral-600">{item.ventas_6m}</td>}
                  <td className="px-3 py-2 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[item.status]}`}>
                      {STATUS_LABEL[item.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={e => { e.stopPropagation(); selectItem(item) }}
                      className="text-xs px-2 py-1 rounded border border-neutral-200 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 whitespace-nowrap"
                    >
                      Ajustar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination total={filtered.length} page={page} pageSize={PAGE_SIZE} onChange={setPage} />
      </div>

      {/* ── SLIDE-OVER: detalle / ajuste ── */}
      {selected && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSelected(null)} />
          <div className="absolute right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl flex flex-col">
            {/* header */}
            <div className="px-5 py-4 border-b border-neutral-100 shrink-0">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-bold text-neutral-900 text-lg leading-tight">{selected.name}</h2>
                  <p className="text-xs font-mono text-neutral-400 mt-0.5">{selected.code}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[selected.status]}`}>
                    {STATUS_LABEL[selected.status]}
                  </span>
                  <button onClick={() => setSelected(null)} className="text-neutral-400 hover:text-neutral-700 text-xl leading-none">×</button>
                </div>
              </div>

              {msg && (
                <div className={`mt-2 px-3 py-1.5 rounded text-sm ${msg.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
                  {msg.text}
                </div>
              )}

              <div className="flex flex-wrap gap-4 mt-3 text-sm">
                <div>
                  <span className="text-neutral-400 text-xs">Stock</span>
                  <p className="font-bold text-neutral-900">{selected.quantity}</p>
                </div>
                {isAdmin && (
                  <>
                    <div>
                      <span className="text-neutral-400 text-xs">Valor stock</span>
                      <p className="font-bold text-neutral-900">${fmt(selected.quantity * selected.total_cost)}</p>
                    </div>
                    <div>
                      <span className="text-neutral-400 text-xs">Costo unit.</span>
                      <p className="font-medium text-neutral-700">${fmt(selected.total_cost)}</p>
                    </div>
                    <div>
                      <span className="text-neutral-400 text-xs">Precio venta</span>
                      <p className="font-medium text-neutral-700">{priceLabel(selected.sale_price || selected.final_price_usd)}</p>
                    </div>
                    <div>
                      <span className="text-neutral-400 text-xs">Ventas 6m</span>
                      <p className="font-medium text-neutral-700">{selected.ventas_6m} uds</p>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* tabs — Configuración solo admin */}
            <div className="flex border-b border-neutral-100 shrink-0">
              {(isAdmin ? (['config', 'movimientos'] as const) : (['movimientos'] as const)).map(t => (
                <button
                  key={t}
                  onClick={() => handleTabChange(t)}
                  className={`px-5 py-2.5 text-sm font-medium transition-colors border-b-2 ${
                    tab === t ? 'border-neutral-900 text-neutral-900' : 'border-transparent text-neutral-400 hover:text-neutral-700'
                  }`}
                >
                  {t === 'config' ? 'Configuración' : 'Movimientos'}
                </button>
              ))}
            </div>

            {/* tab content */}
            <div className="flex-1 overflow-y-auto p-5">
              {tab === 'config' && isAdmin && (
                <div className="space-y-5">
                  <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm">
                    <p className="font-semibold text-blue-800 mb-1.5">Recomendaciones (ventas 6m: {selected.ventas_6m})</p>
                    <div className="flex gap-6 text-blue-700">
                      <span>Min recomendado: <strong>{selected.min_stock_rec}</strong></span>
                      <span>Max recomendado: <strong>{selected.max_stock_rec}</strong></span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-neutral-800">Configuración de stock</h3>
                      {!configEditing ? (
                        <button onClick={() => setConfigEditing(true)}
                          className="text-xs px-3 py-1 border border-neutral-300 rounded-lg hover:bg-neutral-50">
                          Editar
                        </button>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setConfigEditing(false); setConfigForm({ min_stock: selected.min_stock, max_stock: selected.max_stock, sale_price: selected.sale_price }) }}
                            className="text-xs px-3 py-1 border border-neutral-300 rounded-lg hover:bg-neutral-50">
                            Cancelar
                          </button>
                          <button onClick={saveConfig} disabled={savingConfig}
                            className="text-xs px-3 py-1 bg-neutral-900 text-white rounded-lg hover:bg-neutral-700 disabled:opacity-50">
                            {savingConfig ? 'Guardando…' : 'Guardar'}
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: 'Stock mínimo',  key: 'min_stock'  as const, rec: selected.min_stock_rec },
                        { label: 'Stock máximo',  key: 'max_stock'  as const, rec: selected.max_stock_rec },
                        { label: 'Precio venta',  key: 'sale_price' as const, rec: null },
                      ].map(({ label, key, rec }) => (
                        <div key={key}>
                          <label className="block text-xs font-medium text-neutral-500 mb-1">
                            {label}
                            {rec !== null && <span className="ml-1 text-blue-500">(rec: {rec})</span>}
                          </label>
                          {configEditing ? (
                            <input
                              type="number" min="0" step={key === 'sale_price' && !isCO ? '0.01' : '1'}
                              value={configForm[key]}
                              onChange={e => setConfigForm(f => ({ ...f, [key]: Number(e.target.value) }))}
                              className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-800"
                            />
                          ) : (
                            <div className="border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-neutral-50 text-neutral-700">
                              {key === 'sale_price' ? priceLabel(configForm[key]) : configForm[key]}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {selected.status !== 'INACTIVO' && (
                    <div className="space-y-3 border-t border-neutral-100 pt-5">
                      <h3 className="font-semibold text-neutral-800">Ajuste de stock</h3>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-neutral-500 mb-1">Tipo</label>
                          <select
                            value={adjForm.movement_type}
                            onChange={e => setAdjForm(f => ({ ...f, movement_type: e.target.value as typeof f.movement_type }))}
                            className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-neutral-800"
                          >
                            <option value="IN">Entrada (+)</option>
                            <option value="OUT">Salida (−)</option>
                            <option value="ADJUST">Ajuste (=)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-neutral-500 mb-1">
                            {adjForm.movement_type === 'ADJUST' ? 'Nuevo total' : 'Cantidad'}
                          </label>
                          <input
                            type="number" min="0" step="1"
                            value={adjForm.quantity}
                            onChange={e => setAdjForm(f => ({ ...f, quantity: Number(e.target.value) }))}
                            className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-800"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-neutral-500 mb-1">Notas</label>
                          <input
                            value={adjForm.notes}
                            onChange={e => setAdjForm(f => ({ ...f, notes: e.target.value }))}
                            placeholder="Opcional"
                            className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-800"
                          />
                        </div>
                      </div>
                      <button
                        onClick={saveAdjust}
                        disabled={savingAdj || adjForm.quantity <= 0}
                        className="px-4 py-2 bg-neutral-900 text-white rounded-lg text-sm font-medium hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {savingAdj ? 'Guardando…' : 'Registrar movimiento'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {tab === 'movimientos' && (
                <div className="space-y-5">
                  {/* Ajuste de stock — visible para todos los usuarios */}
                  {selected.status !== 'INACTIVO' && (
                    <div className="space-y-3">
                      <h3 className="font-semibold text-neutral-800 text-sm">Ajuste de stock</h3>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-neutral-500 mb-1">Tipo</label>
                          <select
                            value={adjForm.movement_type}
                            onChange={e => setAdjForm(f => ({ ...f, movement_type: e.target.value as typeof f.movement_type }))}
                            className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-neutral-800"
                          >
                            <option value="IN">Entrada (+)</option>
                            <option value="OUT">Salida (−)</option>
                            <option value="ADJUST">Ajuste (=)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-neutral-500 mb-1">
                            {adjForm.movement_type === 'ADJUST' ? 'Nuevo total' : 'Cantidad'}
                          </label>
                          <input
                            type="number" min="0" step="1"
                            value={adjForm.quantity}
                            onChange={e => setAdjForm(f => ({ ...f, quantity: Number(e.target.value) }))}
                            className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-800"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-neutral-500 mb-1">Notas</label>
                          <input
                            value={adjForm.notes}
                            onChange={e => setAdjForm(f => ({ ...f, notes: e.target.value }))}
                            placeholder="Opcional"
                            className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-800"
                          />
                        </div>
                      </div>
                      <button
                        onClick={saveAdjust}
                        disabled={savingAdj || adjForm.quantity <= 0}
                        className="px-4 py-2 bg-neutral-900 text-white rounded-lg text-sm font-medium hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {savingAdj ? 'Guardando…' : 'Registrar movimiento'}
                      </button>
                    </div>
                  )}

                  <div className="border-t border-neutral-100 pt-4">
                  {loadingMovements ? (
                    <p className="text-sm text-neutral-400">Cargando…</p>
                  ) : movements.length === 0 ? (
                    <p className="text-sm text-neutral-400">Sin movimientos registrados</p>
                  ) : (
                    <div className="rounded-lg border border-neutral-200 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-neutral-100 bg-neutral-50">
                            <th className="px-2 py-2 text-left text-xs font-medium text-neutral-400">Fecha</th>
                            <th className="px-2 py-2 text-left text-xs font-medium text-neutral-400">Tipo</th>
                            <th className="px-2 py-2 text-right text-xs font-medium text-neutral-400">Cant.</th>
                            <th className="px-2 py-2 text-right text-xs font-medium text-neutral-400">Total</th>
                            <th className="px-2 py-2 text-left text-xs font-medium text-neutral-400">Nota</th>
                            <th className="px-2 py-2 text-left text-xs font-medium text-neutral-400">Usuario</th>
                          </tr>
                        </thead>
                        <tbody>
                          {movements
                            .slice((movPage - 1) * MOV_PAGE_SIZE, movPage * MOV_PAGE_SIZE)
                            .map(m => (
                            <tr key={m.id} className="border-b border-neutral-50">
                              <td className="px-2 py-1.5 text-xs text-neutral-400 whitespace-nowrap">{fmtDate(m.created_at)}</td>
                              <td className="px-2 py-1.5">
                                <span className={`text-xs px-1.5 py-0.5 rounded font-mono font-medium ${
                                  m.movement_type === 'IN'  ? 'bg-green-50 text-green-700' :
                                  m.movement_type === 'OUT' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'
                                }`}>
                                  {m.movement_type}
                                </span>
                              </td>
                              <td className={`px-2 py-1.5 text-right font-medium ${
                                m.movement_type === 'IN'  ? 'text-green-600' :
                                m.movement_type === 'OUT' ? 'text-red-600' : 'text-blue-600'
                              }`}>
                                {m.movement_type === 'IN' ? '+' : m.movement_type === 'OUT' ? '−' : '='}{Math.abs(m.quantity)}
                              </td>
                              <td className="px-2 py-1.5 text-right font-bold text-neutral-700">{m.running_total}</td>
                              <td className="px-2 py-1.5 text-xs text-neutral-500 max-w-[10rem] truncate">{m.notes ?? m.reference ?? '—'}</td>
                              <td className="px-2 py-1.5 text-xs text-neutral-400">{m.username}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <Pagination total={movements.length} page={movPage} pageSize={MOV_PAGE_SIZE} onChange={setMovPage} />
                    </div>
                  )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
