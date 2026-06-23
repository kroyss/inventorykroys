'use client'
import { useState, useEffect, useCallback } from 'react'
import type { Sale, SaleStatus, SaleItem, InventoryItem, UserRole, Country } from '@/lib/types'
import VentasForm from './VentasForm'
import { Pagination } from '@/components/ui'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { itemsTooltip } from '@/lib/itemsTooltip'

const PAGE_SIZE = 15

const money = (n: number) =>
  Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const STATUS_LABELS: Record<SaleStatus, string> = {
  BORRADOR:         'Borrador',
  PAGO_VERIFICADO:  'Verificado',
  PROCESADA:        'Procesada',
  DESCARGADA:       'Descargada',
  DESCARGADA_LOCAL: 'Local entregada',
  REABIERTA:        'Reabierta',
}

const STATUS_COLORS: Record<SaleStatus, string> = {
  BORRADOR:         'bg-neutral-100 text-neutral-700',
  PAGO_VERIFICADO:  'bg-neutral-100 text-neutral-700',
  PROCESADA:        'bg-neutral-100 text-neutral-700',
  DESCARGADA:       'bg-neutral-100 text-neutral-700',
  DESCARGADA_LOCAL: 'bg-neutral-100 text-neutral-700',
  REABIERTA:        'bg-neutral-100 text-neutral-700',
}

const CHIP_LABELS: Record<string, string> = {
  all:              'Todas',
  BORRADOR:         'Borrador',
  PAGO_VERIFICADO:  'Verificado',
  PROCESADA:        'Procesada',
  DESCARGADA:       'Descargada',
  DESCARGADA_LOCAL: 'Local',
}

interface Counts {
  all: number
  BORRADOR: number
  PAGO_VERIFICADO: number
  PROCESADA: number
  DESCARGADA: number
  DESCARGADA_LOCAL: number
  REABIERTA: number
}

interface SalesResponse {
  rows: Sale[]
  page: number
  pageSize: number
  total: number
  counts: Counts
}

interface Props {
  products: InventoryItem[]
  userRole: UserRole
  country: Country
}

type Filter = 'all' | SaleStatus

const EMPTY_COUNTS: Counts = {
  all: 0, BORRADOR: 0, PAGO_VERIFICADO: 0, PROCESADA: 0,
  DESCARGADA: 0, DESCARGADA_LOCAL: 0, REABIERTA: 0,
}

export default function VentasClient({ products, userRole, country }: Props) {
  const [sales, setSales]       = useState<Sale[]>([])
  const [counts, setCounts]     = useState<Counts>(EMPTY_COUNTS)
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(1)
  const [loading, setLoading]   = useState(true)
  const [selected, setSelected] = useState<Sale | null>(null)
  const [filter, setFilter]     = useState<Filter>('all')
  const [search, setSearch]     = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing]   = useState<Sale | null>(null)
  const [selection, setSelection] = useState<Set<number>>(new Set())
  const [busy, setBusy]         = useState(false)
  const [error, setError]       = useState<string | null>(null)

  // Orden por columna (server-side; default fecha desc)
  type SortKey = 'order_number' | 'customer' | 'units' | 'total' | 'created_at' | 'status'
  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    // números/fecha arrancan desc; texto asc
    else { setSortKey(k); setSortDir(['units', 'total', 'created_at'].includes(k) ? 'desc' : 'asc') }
  }
  const sortArrow = (k: SortKey) => sortKey === k
    ? <span className="ml-1 text-[9px]">{sortDir === 'asc' ? '▲' : '▼'}</span> : null
  const th = (key: SortKey, label: string, align: 'left' | 'right' | 'center' = 'left', title?: string) => (
    <th onClick={() => toggleSort(key)} title={title}
      className={`px-3 py-2 cursor-pointer select-none hover:text-neutral-800 ${
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
      }`}>
      {label}{sortArrow(key)}
    </th>
  )

  const isAdmin = userRole === 'admin'
  const confirm = useConfirm()

  // Debounce the search box
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 350)
    return () => clearTimeout(t)
  }, [searchInput])

  // Reset to page 1 whenever the filter, search, date range or sort changes
  useEffect(() => { setPage(1) }, [filter, search, dateFrom, dateTo, sortKey, sortDir])

  // Esc cierra el form si está abierto, si no el slide-over de detalle
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (showForm)      { setShowForm(false); setEditing(null) }
      else if (selected) { setSelected(null) }
    }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [showForm, selected])

  // Apply ?new=1 / ?estado= deep-links on first mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('new') === '1') { setEditing(null); setShowForm(true) }
    const estado = params.get('estado')
    if (estado) setFilter(estado as Filter)
  }, [])

  const fetchSales = useCallback(async () => {
    setLoading(true)
    const qs = new URLSearchParams({
      page:     String(page),
      pageSize: String(PAGE_SIZE),
    })
    if (filter !== 'all') qs.set('status', filter)
    if (search)           qs.set('search', search)
    if (dateFrom)         qs.set('date_from', dateFrom)
    if (dateTo)           qs.set('date_to', dateTo)
    qs.set('sort_by', sortKey)
    qs.set('sort_dir', sortDir)
    const res: SalesResponse = await fetch(`/api/sales?${qs}`).then(r => r.json())
    setSales(res.rows)
    setCounts(res.counts ?? EMPTY_COUNTS)
    setTotal(res.total ?? 0)
    setLoading(false)
    // Keep the selected detail in sync if it's on this page
    setSelected(prev => prev ? (res.rows.find(s => s.id === prev.id) ?? prev) : null)
  }, [page, filter, search, dateFrom, dateTo, sortKey, sortDir])

  useEffect(() => { fetchSales() }, [fetchSales])

  const reload = () => fetchSales()

  const doAction = async (
    status: 'PAGO_VERIFICADO' | 'PROCESADA' | 'REABIERTA' | 'DESCARGADA',
    extra?: Record<string, unknown>,
  ) => {
    if (!selected) return
    setBusy(true); setError(null)
    const res = await fetch(`/api/sales/${selected.id}/status`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status, ...extra }),
    })
    setBusy(false)
    if (!res.ok) {
      const e = await res.json()
      setError(e.error ?? 'Error')
      return
    }
    // Fetch the updated sale directly by ID so the slide-over reflects the
    // new status/buttons immediately, regardless of current list filter.
    const fresh: Sale = await fetch(`/api/sales/${selected.id}`).then(r => r.json())
    if (fresh?.id) setSelected(fresh)
    reload()
  }

  const deleteSale = async () => {
    if (!selected) return
    if (!await confirm({ title: 'Eliminar venta', message: `¿Eliminar la venta ${selected.ml_order_number}? Esta acción no se puede deshacer.`, confirmText: 'Eliminar', danger: true })) return
    setBusy(true); setError(null)
    const res = await fetch(`/api/sales/${selected.id}`, { method: 'DELETE' })
    setBusy(false)
    if (!res.ok) {
      const e = await res.json()
      setError(e.error ?? 'Error')
      return
    }
    setSelected(null)
    reload()
  }

  const exportIds = (ids: number[]) => {
    if (ids.length === 0) return
    const link = document.createElement('a')
    link.href = `/api/sales/export-excel?ids=${ids.join(',')}`
    link.download = 'datos.xlsx'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setTimeout(reload, 1500)  // refleja el paso a DESCARGADA
    setSelection(new Set())
  }

  const exportSelected = () => exportIds(Array.from(selection))

  // Export all PROCESADA across all pages — fetch their ids first
  const exportAllProcessed = async () => {
    const qs = new URLSearchParams({ page: '1', pageSize: '1000', status: 'PROCESADA' })
    const res: SalesResponse = await fetch(`/api/sales?${qs}`).then(r => r.json())
    exportIds(res.rows.map(s => s.id))
  }

  const toggleSelection = (id: number) => {
    const next = new Set(selection)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelection(next)
  }

  const processableTotal = counts.PROCESADA
  const borradorCount    = counts.BORRADOR

  return (
    <div>
      {error && (
        <div className="mb-3 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded">{error}</div>
      )}

      {/* Toolbar */}
      <div className="mb-4 space-y-2">
        {/* Fila 1: chips de estado */}
        <div className="flex flex-wrap gap-1.5 bg-white rounded-xl border border-neutral-200 shadow-sm p-2">
          {(['all','BORRADOR','PAGO_VERIFICADO','PROCESADA','DESCARGADA','DESCARGADA_LOCAL'] as Filter[])
            .filter(f => country !== 'CO' || f !== 'PAGO_VERIFICADO')
            .map(f => {
            const count  = f === 'all' ? counts.all : counts[f as keyof Counts]
            const active = filter === f
            return (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-full border text-xs whitespace-nowrap transition-colors ${
                  active ? 'bg-neutral-900 border-neutral-900 text-white' : 'bg-white border-neutral-200 text-neutral-600 hover:border-neutral-400'
                }`}>
                {CHIP_LABELS[f]} <span className={active ? 'text-white/60' : 'text-neutral-400'}>{count}</span>
              </button>
            )
          })}
        </div>

        {/* Fila 2: búsqueda + fechas (izq) · acciones (der) */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="search"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Buscar…"
              className="border border-neutral-300 rounded-lg px-3 py-2 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-neutral-800"
            />
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={e => setDateFrom(e.target.value)}
                title="Desde"
                className="border border-neutral-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-800"
              />
              <span className="text-neutral-400 text-xs">–</span>
              <input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={e => setDateTo(e.target.value)}
                title="Hasta"
                className="border border-neutral-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-800"
              />
              {(dateFrom || dateTo) && (
                <button onClick={() => { setDateFrom(''); setDateTo('') }}
                  title="Limpiar fechas"
                  className="px-2 py-2 text-neutral-400 hover:text-neutral-700 text-sm">
                  ✕
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {borradorCount > 0 && filter !== 'BORRADOR' && (
              <button onClick={() => setFilter('BORRADOR')}
                title="Hay ventas en borrador pendientes"
                className="px-3 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 whitespace-nowrap">
                ⚠ Borradores ({borradorCount})
              </button>
            )}
            {selection.size > 0 ? (
              <button onClick={exportSelected} className="btn-secondary text-sm whitespace-nowrap">
                Exportar ({selection.size})
              </button>
            ) : processableTotal > 0 && (
              <button onClick={exportAllProcessed}
                className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 whitespace-nowrap">
                ↓ Procesadas ({processableTotal})
              </button>
            )}
            <button onClick={() => { setEditing(null); setShowForm(true) }} className="btn-primary text-sm whitespace-nowrap">
              Nueva venta
            </button>
          </div>
        </div>
      </div>

      {/* Tabla ancha */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-500">
              <tr className="border-b border-neutral-100">
                <th className="w-8 px-3 py-2" />
                {th('order_number', 'Orden')}
                {th('customer', 'Cliente')}
                <th className="px-3 py-2 text-left">Productos</th>
                {th('units', 'Und/Prod', 'right', 'Unidades totales / Cantidad de productos')}
                {th('total', 'Total', 'right')}
                {th('created_at', 'Fecha', 'right')}
                {th('status', 'Estado', 'center')}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-neutral-400">Cargando…</td></tr>
              )}
              {!loading && sales.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-neutral-400">Sin ventas</td></tr>
              )}
              {!loading && sales.map((s, idx) => {
                const date = s.created_at ? new Date(s.created_at).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' }) : ''
                return (
                  <tr key={s.id} onClick={() => setSelected(s)}
                    className={`border-b border-neutral-50 hover:bg-neutral-50 cursor-pointer ${idx % 2 ? 'bg-neutral-50/40' : ''} ${selected?.id === s.id ? 'bg-blue-50' : ''}`}>
                    <td className="px-3 py-2 text-center" onClick={e => e.stopPropagation()}>
                      {s.status === 'PROCESADA' && (
                        <input type="checkbox" checked={selection.has(s.id)} onChange={() => toggleSelection(s.id)} />
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs font-bold text-neutral-900 whitespace-nowrap">{s.ml_order_number}</td>
                    <td className="px-3 py-2 text-neutral-700 max-w-[12rem] truncate">{s.customer_name || '—'}</td>
                    <td className="px-3 py-2 text-xs text-neutral-500 max-w-[18rem] truncate cursor-help"
                      title={itemsTooltip(s.items, s.notes)}>
                      {s.items.map((i, k) => (
                        <span key={i.id}>
                          {k > 0 && <span className="text-neutral-300"> · </span>}
                          {i.product_name} <span className="text-neutral-400">x{i.quantity}</span>
                        </span>
                      ))}
                      {s.notes && <span className="text-purple-600 italic"> · {s.notes}</span>}
                    </td>
                    <td className="px-3 py-2 text-right text-neutral-600 whitespace-nowrap">
                      {s.items.reduce((a, i) => a + i.quantity, 0)}
                      <span className="text-neutral-300 text-xs"> / {s.items.length}</span>
                    </td>
                    <td className="px-3 py-2 text-right font-bold text-neutral-900 whitespace-nowrap">${money(s.total_amount)}</td>
                    <td className="px-3 py-2 text-right text-neutral-400 text-xs whitespace-nowrap">{date}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_COLORS[s.status]}`}>
                        {STATUS_LABELS[s.status]}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <Pagination total={total} page={page} pageSize={PAGE_SIZE} onChange={setPage} />
      </div>

      {/* Slide-over detalle */}
      {selected && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSelected(null)} />
          <div className="absolute right-0 top-0 h-full w-full max-w-lg bg-white shadow-2xl flex flex-col">
            <div className="p-4 border-b shrink-0">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-mono text-sm text-neutral-500">{selected.ml_order_number}</div>
                  <div className="font-semibold mt-1">{selected.customer_name || 'Sin nombre'}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded text-xs ${STATUS_COLORS[selected.status]}`}>
                    {STATUS_LABELS[selected.status]}
                  </span>
                  <button onClick={() => setSelected(null)} className="text-neutral-400 hover:text-neutral-700 text-xl leading-none">×</button>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="text-neutral-500">Total</div>
                  <div className="font-semibold">${money(selected.total_amount)}</div>
                </div>
                {selected.discount_percent > 0 && (
                  <div>
                    <div className="text-neutral-500">Descuento</div>
                    <div className="font-semibold">{selected.discount_percent}%</div>
                  </div>
                )}
                <div>
                  <div className="text-neutral-500">Creada por</div>
                  <div className="font-medium">{selected.created_by ?? '—'}</div>
                </div>
                {selected.verified_by && (
                  <div>
                    <div className="text-neutral-500">Verificada por</div>
                    <div className="font-medium">{selected.verified_by}</div>
                  </div>
                )}
              </div>
              {selected.notes && (
                <div className="mt-3 text-xs">
                  <div className="text-neutral-500">Notas</div>
                  <div className="text-purple-600 italic whitespace-pre-line">{selected.notes}</div>
                </div>
              )}
            </div>

            <div className="px-4 py-3 flex-1 overflow-y-auto">
              <div className="text-xs text-neutral-500 mb-2">Productos ({selected.items.length})</div>
              <div className="space-y-1">
                {selected.items.map((i: SaleItem) => (
                  <div key={i.id} className="flex justify-between text-sm">
                    <div>
                      <span className="text-neutral-400 mr-2">{i.product_code}</span>
                      {i.product_name}
                    </div>
                    <div>{i.quantity} × ${money(i.unit_price)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 border-t flex flex-wrap gap-2 shrink-0 bg-neutral-50">
              {(selected.status === 'BORRADOR' || selected.status === 'REABIERTA') && (
                <>
                  {selected.status === 'BORRADOR' && (
                    <button onClick={deleteSale} disabled={busy} className="btn-danger text-sm">Eliminar</button>
                  )}
                  <button onClick={() => { setEditing(selected); setShowForm(true) }} className="btn-secondary text-sm">Editar</button>
                  {selected.ml_order_number.startsWith('LOCAL-') ? (
                    // LOCAL: salta a entregada (descuenta inventario) en un paso
                    <button onClick={() => doAction('PAGO_VERIFICADO')} disabled={busy} className="btn-primary text-sm">
                      {country === 'CO' ? 'Entregar' : 'Verificar y entregar'}
                    </button>
                  ) : country === 'CO' ? (
                    // CO: sin verificar pago. El FLEX se marca al crear la venta:
                    // FLEX → PROCESADA (espera Excel); no FLEX → DESCARGADA directo
                    <button
                      onClick={() => selected.is_flex ? doAction('PROCESADA') : doAction('DESCARGADA')}
                      disabled={busy} className="btn-primary text-sm">
                      {selected.is_flex ? 'Procesar (FLEX)' : 'Procesar → Descargada'}
                    </button>
                  ) : (
                    <button onClick={() => doAction('PAGO_VERIFICADO')} disabled={busy} className="btn-primary text-sm">Verificar pago</button>
                  )}
                </>
              )}
              {!['BORRADOR','REABIERTA'].includes(selected.status) && (
                <button onClick={() => doAction('REABIERTA')} disabled={busy} className="btn-warning text-sm">Reabrir</button>
              )}
              {selected.status === 'PAGO_VERIFICADO' && (
                <button onClick={() => doAction('PROCESADA')} disabled={busy} className="btn-primary text-sm">Procesar</button>
              )}
              {['PROCESADA','DESCARGADA','DESCARGADA_LOCAL'].includes(selected.status) && (
                <button onClick={() => setSelected(null)} className="btn-secondary text-sm">Salir</button>
              )}
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <VentasForm
          editing={editing}
          products={products}
          country={country}
          onClose={() => { setShowForm(false); setEditing(null) }}
          onSaved={() => { setShowForm(false); setEditing(null); reload() }}
          onContinue={async (id) => {
            setShowForm(false); setEditing(null)
            const fresh: Sale = await fetch(`/api/sales/${id}`).then(r => r.json())
            if (fresh?.id) setSelected(fresh)
            reload()
          }}
        />
      )}
    </div>
  )
}
