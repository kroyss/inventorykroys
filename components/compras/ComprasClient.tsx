'use client'

import { useState, useEffect, useCallback } from 'react'
import type { PurchaseOrder, PurchaseOrderItem, Supplier, UserRole } from '@/lib/types'
import { Stepper, KPICard, int, Pagination } from '@/components/ui'
import { Combobox } from '@/components/ui/Combobox'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { itemsTooltip } from '@/lib/itemsTooltip'
import { blockNumberKeys, blockIntKeys } from '@/lib/inputGuards'
import { SortableTh, toggleSort, type SortState } from './SortableTh'
import { matchTokens } from '@/lib/search'

const PAGE_SIZE = 15

const LOCAL_STEPS = [
  { key: 'PENDIENTE',  label: 'Pendiente' },
  { key: 'PAGADA',     label: 'Pagada' },
  { key: 'EN_CAMINO',  label: 'En camino' },
  { key: 'RECIBIDA',   label: 'Recibida' },
  { key: 'FINALIZADA', label: 'Finalizada' },
]

const fmt = (n: number) =>
  Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const STATUS_LABELS: Record<string, string> = {
  PENDIENTE:     'Pendiente',
  PAGADA:        'Pagada',
  EN_CAMINO:     'En Camino',
  RECIBIDA:      'Recibida',
  PARCIAL:       'Parcial',
  FINALIZADA:    'Finalizada',
  INCONSISTENTE: 'Inconsistente',
  REABIERTA:     'Reabierta',
}

const STATUS_COLORS: Record<string, string> = {
  PENDIENTE:     'bg-neutral-100 text-neutral-700',
  PAGADA:        'bg-neutral-100 text-neutral-700',
  EN_CAMINO:     'bg-neutral-100 text-neutral-700',
  RECIBIDA:      'bg-neutral-100 text-neutral-700',
  PARCIAL:       'bg-neutral-100 text-neutral-700',
  FINALIZADA:    'bg-neutral-100 text-neutral-700',
  INCONSISTENTE: 'bg-neutral-100 text-neutral-700',
  REABIERTA:     'bg-neutral-100 text-neutral-700',
}

interface FormItem {
  product_id: number
  product_name: string
  product_code: string
  quantity: number
  unit_cost_usd: number
}

interface RecvItem {
  product_id: number
  product_name: string
  product_code: string
  expected: number
  received_qty: number
  already_received: number
}

interface Props {
  initialOrders: PurchaseOrder[]
  initialSuppliers: Supplier[]
  userRole: UserRole
  historyMode?: boolean
  /** Aviso al padre (ComprasTabs) tras cualquier cambio, para refrescar contadores y la otra pestaña. */
  onChanged?: () => void
  /** El padre pide abrir el form de creación (botón unificado "+ Compra"). */
  autoCreate?: boolean
  onAutoCreateHandled?: () => void
}

export default function ComprasClient({ initialOrders, initialSuppliers, userRole, historyMode = false, onChanged, autoCreate = false, onAutoCreateHandled }: Props) {
  const isAdmin = userRole === 'admin'
  const confirm = useConfirm()

  const [orders, setOrders]       = useState<PurchaseOrder[]>(initialOrders)
  const [suppliers, setSuppliers] = useState<Supplier[]>(initialSuppliers)
  const [selected, setSelected]   = useState<PurchaseOrder | null>(null)
  // Single chip filter: replaces previous active/all/done + kpi filter
  type ChipFilter = 'all' | 'pendientes' | 'transito' | 'recibir' | 'inconsistentes' | 'finalizadas'
  const [chipFilter, setChipFilter] = useState<ChipFilter>('all')
  const [search, setSearch]       = useState('')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  // Create/Edit modal
  const [showForm, setShowForm]   = useState(false)
  const [editId, setEditId]       = useState<number | null>(null)
  const [formSupplierName, setFormSupplierName] = useState('')
  const [formSupplierId, setFormSupplierId]     = useState<number | null>(null)
  const [formNotes, setFormNotes] = useState('')
  const [formItems, setFormItems] = useState<FormItem[]>([])
  const [products, setProducts]   = useState<{id:number;code:string;name:string;total_cost?:number;quantity?:number}[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [showProductList, setShowProductList] = useState(false)
  const [formMsg, setFormMsg] = useState('')

  // Receive modal
  const [showReceive, setShowReceive]   = useState(false)
  const [recvItems, setRecvItems]       = useState<RecvItem[]>([])
  const [recvPartial, setRecvPartial]   = useState(false)

  // Inconsistente modal
  const [showIncNote, setShowIncNote]   = useState(false)
  const [incNote, setIncNote]           = useState('')

  // Orden por columna (default: último movimiento, descendente)
  const [sort, setSort] = useState<SortState>({ key: 'updated_at', dir: 'desc' })
  const onSort = (key: string) => setSort(prev => toggleSort(prev, key))

  // Paginación
  const [page, setPage] = useState(1)
  useEffect(() => { setPage(1) }, [chipFilter, search, sort])

  // Esc cierra el overlay de encima primero, luego el slide-over de detalle
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (showIncNote)      { setShowIncNote(false) }
      else if (showReceive) { setShowReceive(false) }
      else if (showForm)    { setShowForm(false) }
      else if (selected)    { setSelected(null) }
    }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [showIncNote, showReceive, showForm, selected])

  const reload = useCallback(async () => {
    const r = await fetch('/api/purchases', { cache: 'no-store' })
    if (r.ok) {
      const data: PurchaseOrder[] = await r.json()
      setOrders(data)
      setSelected(prev => {
        if (!prev) return null
        const fresh = data.find(o => o.id === prev.id) ?? null
        // En las pestañas activas, si la orden pasó a Historial (FINALIZADA/INCONSISTENTE)
        // ya no pertenece a esta vista: cerrar el detalle para que no quede "pegada".
        if (fresh && !historyMode && ['FINALIZADA', 'INCONSISTENTE'].includes(fresh.status)) return null
        return fresh
      })
      onChanged?.()  // refresca contadores y la otra pestaña en ComprasTabs
    }
  }, [historyMode, onChanged])

  useEffect(() => {
    if (showForm) {
      fetch('/api/products').then(r => r.json()).then(setProducts)
    }
  }, [showForm])

  const CHIP_GROUPS: Record<ChipFilter, string[] | null> = {
    all:            null,
    pendientes:     ['PENDIENTE', 'REABIERTA'],
    transito:       ['PAGADA', 'EN_CAMINO'],
    recibir:        ['RECIBIDA', 'PARCIAL'],
    inconsistentes: ['INCONSISTENTE'],
    finalizadas:    ['FINALIZADA'],
  }

  const CHIP_LABELS: Record<ChipFilter, string> = {
    all:            'Todas',
    pendientes:     'Pendientes',
    transito:       'En tránsito',
    recibir:        'Por recibir',
    inconsistentes: 'Inconsistentes',
    finalizadas:    'Finalizadas',
  }

  const baseVisible = orders.filter(o => {
    // Historial (solo lectura): muestra finalizadas/inconsistentes
    if (historyMode) return ['FINALIZADA', 'INCONSISTENTE'].includes(o.status)
    // Activas: finalizadas e inconsistentes viven solo en Historial
    if (['FINALIZADA', 'INCONSISTENTE'].includes(o.status)) return false
    if (!isAdmin && !['EN_CAMINO','RECIBIDA','PARCIAL'].includes(o.status)) return false
    return true
  })

  // Valor de orden por columna clickeable
  const SORT_ACCESSORS: Record<string, (o: PurchaseOrder) => string | number> = {
    order_number: o => o.order_number,
    supplier:     o => (o.supplier_name ?? '').toLowerCase(),
    productos:    o => o.items.length,
    cantidad:     o => o.items.reduce((a, i) => a + i.quantity, 0),
    total:        o => o.total_usd ?? 0,
    updated_at:   o => new Date(o.updated_at ?? o.created_at ?? 0).getTime(),
    estado:       o => STATUS_LABELS[o.status] ?? o.status,
  }

  const visibleOrders = [...baseVisible.filter(o => {
    const grp = CHIP_GROUPS[chipFilter]
    if (grp && !grp.includes(o.status)) return false
    if (!search) return true
    const q = search.toLowerCase()
    return o.order_number.toLowerCase().includes(q)
      || (o.supplier_name ?? '').toLowerCase().includes(q)
      || (o.notes ?? '').toLowerCase().includes(q)
      || o.items.some(i => i.product_name.toLowerCase().includes(q) || i.product_code.toLowerCase().includes(q))
  })].sort((a, b) => {
    const get = SORT_ACCESSORS[sort.key] ?? SORT_ACCESSORS.updated_at
    const va = get(a), vb = get(b)
    let r = typeof va === 'number' && typeof vb === 'number'
      ? va - vb
      : String(va).localeCompare(String(vb), 'es', { numeric: true })
    if (r === 0) return b.order_number.localeCompare(a.order_number)  // desempate estable
    return sort.dir === 'asc' ? r : -r
  })

  const chipCount = (k: ChipFilter) => {
    const grp = CHIP_GROUPS[k]
    return grp ? baseVisible.filter(o => grp.includes(o.status)).length : baseVisible.length
  }

  const paginatedOrders = visibleOrders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function openCreate() {
    setEditId(null)
    setFormSupplierName('')
    setFormSupplierId(null)
    setFormNotes('')
    setFormItems([])
    setError('')
    setShowForm(true)
  }

  // Botón unificado "+ Compra" del padre: abre el form al activarse autoCreate
  useEffect(() => {
    if (autoCreate && !historyMode && isAdmin) { openCreate(); onAutoCreateHandled?.() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCreate])

  // Open create modal when arriving via command palette (/compras?new=1)
  // Skip if ?tab=import (that opens the import form instead)
  // If ?from=reposicion: load items stashed in sessionStorage by the report
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    if (!isAdmin || p.get('new') !== '1' || p.get('tab') === 'import') return
    openCreate()

    if (p.get('from') === 'reposicion') {
      const raw = sessionStorage.getItem('repo_items')
      if (!raw) return
      sessionStorage.removeItem('repo_items')
      try {
        const repoItems = JSON.parse(raw) as { id: number; code: string; name: string; quantity: number }[]
        if (!repoItems.length) return
        // Pre-fill formItems immediately; product_id is what we need for the POST
        setFormItems(repoItems.map(r => ({
          product_id:    r.id,
          product_name:  r.name,
          product_code:  r.code,
          quantity:      r.quantity,
          unit_cost_usd: 0,
        })))
        setFormMsg(`${repoItems.length} producto(s) cargados desde Reposición. Selecciona proveedor y completa los costos.`)
        setTimeout(() => setFormMsg(''), 5000)
      } catch { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function openEdit(o: PurchaseOrder) {
    setEditId(o.id)
    setFormSupplierName(o.supplier_name ?? '')
    setFormSupplierId(o.supplier_id ?? null)
    setFormNotes(o.notes ?? '')
    setFormItems(o.items.map(i => ({
      product_id: i.product_id,
      product_name: i.product_name,
      product_code: i.product_code,
      quantity: i.quantity,
      unit_cost_usd: i.unit_cost_usd,
    })))
    setError('')
    setShowForm(true)
  }

  function addProductToForm(p: {id:number;code:string;name:string;total_cost?:number}) {
    const exists = formItems.find(i => i.product_id === p.id)
    if (exists) return
    setFormItems(prev => [...prev, {
      product_id: p.id,
      product_name: p.name,
      product_code: p.code,
      quantity: 1,
      // Pre-llena con el costo registrado del producto (igual que legacy); editable.
      unit_cost_usd: p.total_cost ?? 0,
    }])
    setProductSearch('')
    setShowProductList(false)
  }

  function updateFormItem(idx: number, field: keyof FormItem, val: string) {
    setFormItems(prev => prev.map((it, i) =>
      i === idx ? { ...it, [field]: field === 'quantity' || field === 'unit_cost_usd' ? parseFloat(val) || 0 : val } : it
    ))
  }

  function removeFormItem(idx: number) {
    setFormItems(prev => prev.filter((_, i) => i !== idx))
  }

  // mode: 'close' = guardar y cerrar | 'another' = guardar y crear otra | 'continue' = guardar y abrir detalle
  async function saveOrder(mode: 'close' | 'another' | 'continue' = 'close') {
    if (!formSupplierName.trim()) { setError('Indique un proveedor'); return }
    if (formItems.length === 0) { setError('Agregue al menos un producto'); return }
    setSaving(true); setError('')
    const body = {
      supplier_id: formSupplierId ?? undefined,
      supplier_name: formSupplierName.trim(),
      notes: formNotes || undefined,
      items: formItems.map(i => ({ product_id: i.product_id, quantity: i.quantity, unit_cost_usd: i.unit_cost_usd })),
    }
    const url = editId ? `/api/purchases/${editId}` : '/api/purchases'
    const method = editId ? 'PUT' : 'POST'
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await r.json()
    setSaving(false)
    if (!r.ok) { setError(data.error ?? 'Error'); return }
    await reload()

    if (mode === 'another' && !editId) {
      // reset for next order, keep panel open
      setFormSupplierName('')
      setFormSupplierId(null)
      setFormNotes('')
      setFormItems([])
      setProductSearch('')
      setFormMsg('Orden creada. Listo para la siguiente.')
      setTimeout(() => setFormMsg(''), 3000)
    } else if (mode === 'continue') {
      // Open the just-saved order's detail to advance its states
      const targetId = editId ?? data.id
      setShowForm(false)
      const list: PurchaseOrder[] = await fetch('/api/purchases').then(x => x.json())
      const fresh = list.find(o => o.id === targetId)
      if (fresh) setSelected(fresh)
    } else {
      setShowForm(false)
    }
  }

  async function doAction(action: string, note?: string) {
    if (!selected) return
    setSaving(true); setError('')
    const r = await fetch(`/api/purchases/${selected.id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, note }),
    })
    const data = await r.json()
    setSaving(false)
    if (!r.ok) {
      setError(data.error ?? 'Error')
      await reload() // sincroniza la UI con el estado real (pudo cambiar en otra sesión)
      return
    }
    await reload()
  }

  // Recepción: deshacer último paso (vuelve un estado atrás)
  async function undoLast() {
    if (!selected) return
    const msg = selected.status === 'PARCIAL'
      ? 'Se revertirán TODAS las recepciones parciales y el inventario cargado, volviendo a EN CAMINO. ¿Continuar?'
      : selected.status === 'RECIBIDA'
        ? 'Se anularán las cantidades recibidas, volviendo a EN CAMINO. ¿Continuar?'
        : 'Se revertirá la finalización (y su inventario), volviendo a RECIBIDA. ¿Continuar?'
    if (!await confirm({ title: 'Deshacer último cambio', message: msg, confirmText: 'Deshacer' })) return
    await doAction('undo')
  }

  // Recepción: reabrir desde cero (vuelve a EN CAMINO)
  async function resetReception() {
    if (!selected) return
    if (!await confirm({
      title: 'Reabrir recepción',
      message: 'Se revertirá el inventario cargado y se borrarán las cantidades recibidas, volviendo a EN CAMINO para recibir de nuevo. ¿Continuar?',
      confirmText: 'Reabrir',
    })) return
    await doAction('reset_reception')
  }

  // Recepción: finalizar (carga el inventario con lo recibido)
  async function finalizeReception() {
    if (!selected) return
    if (!await confirm({
      title: 'Finalizar recepción',
      message: 'Se cargará al inventario lo recibido y la orden quedará FINALIZADA. ¿Continuar?',
      confirmText: 'Finalizar y cargar',
    })) return
    await doAction('finalize')
  }

  function openReceive() {
    if (!selected) return
    setRecvItems(selected.items.map(i => ({
      product_id: i.product_id,
      product_name: i.product_name,
      product_code: i.product_code,
      expected: i.quantity,
      received_qty: i.quantity - (i.total_received_qty ?? 0),
      already_received: i.total_received_qty ?? 0,
    })))
    setRecvPartial(false)
    setShowReceive(true)
  }

  async function submitReceive() {
    if (!selected) return

    // Advertir solo si difiere de lo que FALTA (esperado − ya recibido), no del
    // total: al "recibir más" de una parcial, recibir lo que resta NO es discrepancia.
    const diffs = recvPartial ? [] : recvItems
      .filter(i => i.received_qty > 0)
      .map(i => ({ i, rem: i.expected - i.already_received }))
      .filter(({ i, rem }) => i.received_qty !== rem)
      .map(({ i, rem }) => {
        const d = i.received_qty - rem
        return `· ${i.product_name}: esperado ${rem}, recibes ${i.received_qty} (${d > 0 ? '+' : ''}${d})`
      })
    if (diffs.length > 0) {
      const ok = await confirm({
        title: 'Cantidades distintas a lo esperado',
        message: `Algunos productos se registrarán con una cantidad diferente:\n\n${diffs.join('\n')}\n\nSe registrará tal como lo ingresaste. ¿Continuar?`,
        confirmText: 'Sí, registrar así',
      })
      if (!ok) return
    }

    setSaving(true); setError('')
    const r = await fetch(`/api/purchases/${selected.id}/receive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        partial: recvPartial,
        items: recvItems.map(i => ({ product_id: i.product_id, received_qty: i.received_qty })),
      }),
    })
    const data = await r.json()
    setSaving(false)
    if (!r.ok) { setError(data.error ?? 'Error'); return }
    setShowReceive(false)
    await reload()
  }

  async function deleteOrder() {
    if (!selected) return
    if (!await confirm({ title: 'Eliminar orden', message: `¿Eliminar la orden ${selected.order_number}? Esta acción no se puede deshacer.`, confirmText: 'Eliminar', danger: true })) return
    setSaving(true)
    const r = await fetch(`/api/purchases/${selected.id}`, { method: 'DELETE' })
    setSaving(false)
    if (!r.ok) { const d = await r.json(); setError(d.error ?? 'Error'); return }
    setSelected(null)
    await reload()
  }

  // Eliminar proveedor (solo si no tiene órdenes; el backend valida y avisa)
  async function deleteSupplier(opt: { id: number; name: string }) {
    if (!await confirm({ title: 'Eliminar proveedor', message: `¿Eliminar el proveedor "${opt.name}"?`, confirmText: 'Eliminar', danger: true })) return
    const r = await fetch(`/api/suppliers/${opt.id}`, { method: 'DELETE' })
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      await confirm({ title: 'No se puede eliminar', message: d.error ?? 'El proveedor tiene órdenes registradas.', confirmText: 'Entendido', cancelText: '' })
      return
    }
    setSuppliers(prev => prev.filter(s => s.id !== opt.id))
    if (formSupplierId === opt.id) { setFormSupplierName(''); setFormSupplierId(null) }
  }

  const filteredProducts = products.filter(p =>
    !!productSearch.trim() && matchTokens(productSearch, p.code, p.name)
  ).slice(0, 10)

  const formTotal = formItems.reduce((s, i) => s + i.quantity * i.unit_cost_usd, 0)

  // ── KPIs (local purchases) ──
  const kpis = {
    pendientes: orders.filter(o => o.status === 'PENDIENTE').length,
    enTransito: orders.filter(o => ['PAGADA', 'EN_CAMINO'].includes(o.status)).length,
    porRecibir: orders.filter(o => ['RECIBIDA', 'PARCIAL'].includes(o.status)).length,
    valorActivo: orders
      .filter(o => !['FINALIZADA'].includes(o.status))
      .reduce((s, o) => s + (o.total_usd || 0), 0),
    totalPagado: orders.reduce((s, o) => s + (o.total_paid || 0), 0),
  }

  // Finalizadas/Inconsistentes ya no van en chips: viven en la pestaña Historial.
  const CHIP_ORDER: ChipFilter[] = ['all','pendientes','transito','recibir']

  return (
    <div className="space-y-4">
      {/* Toolbar: chips + buscador + nueva compra */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 gap-2">
        {!historyMode ? (
          <div className="flex gap-1.5 overflow-x-auto bg-white rounded-xl border border-neutral-200 shadow-sm p-2">
            {CHIP_ORDER.map(c => {
              const active = chipFilter === c
              return (
                <button key={c} onClick={() => setChipFilter(c)}
                  className={`px-3 py-1 rounded-full border text-xs whitespace-nowrap transition-colors ${
                    active ? 'bg-neutral-900 border-neutral-900 text-white' : 'bg-white border-neutral-200 text-neutral-600 hover:border-neutral-400'
                  }`}>
                  {CHIP_LABELS[c]} <span className={active ? 'text-white/60' : 'text-neutral-400'}>{chipCount(c)}</span>
                </button>
              )
            })}
          </div>
        ) : <div />}
        <div className="flex gap-2 items-center flex-wrap">
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar…"
            className="border border-neutral-300 rounded-lg px-3 py-2 text-sm flex-1 min-w-[140px] md:flex-none md:w-40 focus:outline-none focus:ring-2 focus:ring-neutral-800"
          />
        </div>
      </div>

      {/* Resumen financiero compacto */}
      {isAdmin && (
        <div className="text-xs text-neutral-500 -mt-2">
          Valor activo: <span className="font-semibold text-neutral-800">${fmt(kpis.valorActivo)}</span>
          <span className="mx-2 text-neutral-300">·</span>
          Total pagado: <span className="font-semibold text-green-700">${fmt(kpis.totalPagado)}</span>
        </div>
      )}

    {/* Tabla ancha */}
    <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-xs text-neutral-500">
            <tr className="border-b border-neutral-100">
              <SortableTh label="Orden" sortKey="order_number" sort={sort} onSort={onSort} />
              <SortableTh label="Proveedor" sortKey="supplier" sort={sort} onSort={onSort} />
              <th className="px-3 py-2 text-left">Detalle</th>
              <SortableTh label="Productos" sortKey="productos" sort={sort} onSort={onSort} align="right" title="Productos distintos (completos/total en recepción)" />
              <SortableTh label="Cantidad" sortKey="cantidad" sort={sort} onSort={onSort} align="right" title="Unidades totales (recibidas/total en recepción)" />
              {isAdmin && <SortableTh label="Total" sortKey="total" sort={sort} onSort={onSort} align="right" />}
              <SortableTh label="Últ. mov." sortKey="updated_at" sort={sort} onSort={onSort} align="right" title="Fecha del último movimiento" />
              <SortableTh label="Estado" sortKey="estado" sort={sort} onSort={onSort} align="center" />
              {historyMode && <th className="px-2 py-2 text-center">Inconsistente</th>}
            </tr>
          </thead>
          <tbody>
            {visibleOrders.length === 0 && (
              <tr><td colSpan={(isAdmin ? 8 : 7) + (historyMode ? 1 : 0)} className="px-3 py-8 text-center text-neutral-400">Sin órdenes</td></tr>
            )}
            {paginatedOrders.map((o, idx) => {
              const dateSrc = o.updated_at ?? o.created_at
              const date = dateSrc ? new Date(dateSrc).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' }) : ''
              const units     = o.items.reduce((a, i) => a + i.quantity, 0)
              const prods     = o.items.length
              const recUnits  = o.items.reduce((a, i) => a + (i.total_received_qty || i.received_qty || 0), 0)
              const recProds  = o.items.filter(i => (i.total_received_qty || i.received_qty || 0) >= i.quantity).length
              const receiving = ['PARCIAL','RECIBIDA'].includes(o.status)
              return (
                <tr key={o.id} onClick={() => setSelected(o)}
                  className={`border-b border-neutral-50 hover:bg-neutral-50 cursor-pointer ${idx % 2 ? 'bg-neutral-50/40' : ''} ${selected?.id === o.id ? 'bg-blue-50' : ''}`}>
                  <td className="px-3 py-2 font-mono text-xs font-bold text-neutral-900 whitespace-nowrap">{o.order_number}</td>
                  <td className="px-3 py-2 text-neutral-700 max-w-[12rem] truncate">{o.supplier_name || '—'}</td>
                  <td className="px-3 py-2 text-xs text-neutral-500 max-w-[18rem] truncate cursor-help"
                    title={itemsTooltip(o.items, o.notes)}>
                    {o.items.map((i, k) => (
                      <span key={i.id}>
                        {k > 0 && <span className="text-neutral-300"> · </span>}
                        {i.product_name} <span className="text-neutral-400">x{i.quantity}</span>
                      </span>
                    ))}
                    {o.notes && <span className="text-purple-600 italic"> · {o.notes}</span>}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {receiving ? (
                      <span className={recProds >= prods ? 'text-green-600 font-medium' : 'text-orange-500 font-medium'}>
                        {recProds}/{prods}
                      </span>
                    ) : (
                      <span className="text-neutral-700 font-medium">{prods}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {receiving ? (
                      <span className={recUnits >= units ? 'text-green-600 font-medium' : 'text-orange-500 font-medium'}>
                        {recUnits}/{units}
                      </span>
                    ) : (
                      <span className="text-neutral-700 font-medium">{units}</span>
                    )}
                    <span className="text-neutral-400 text-xs"> und</span>
                  </td>
                  {isAdmin && <td className="px-3 py-2 text-right font-bold text-neutral-900 whitespace-nowrap">${fmt(o.total_usd)}</td>}
                  <td className="px-3 py-2 text-right text-neutral-400 text-xs whitespace-nowrap">{date}</td>
                  <td className="px-3 py-2 text-center">
                    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-neutral-100 text-neutral-700">
                      {STATUS_LABELS[o.status] ?? o.status}
                    </span>
                  </td>
                  {historyMode && (
                    <td className="px-2 py-2 text-center">
                      {(o.is_incomplete || o.status === 'INCONSISTENTE') ? (
                        <span className="text-red-600 cursor-help" title={o.incomplete_note || o.notes || 'Inconsistente'}>⚠</span>
                      ) : (
                        <span className="text-neutral-300 text-xs">—</span>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <Pagination total={visibleOrders.length} page={page} pageSize={PAGE_SIZE} onChange={setPage} />
    </div>

    {/* Slide-over detalle */}
    {selected && (
      <div className="fixed inset-0 z-50">
        <div className="absolute inset-0 bg-black/30" onClick={() => setSelected(null)} />
        <div className="absolute right-0 top-0 h-full w-full max-w-2xl bg-white shadow-2xl flex flex-col">
          {/* Header */}
          <div className="p-5 border-b border-neutral-100 shrink-0">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-xl font-bold text-neutral-800 font-mono">{selected.order_number}</h3>
                <p className="text-neutral-600 mt-1">{selected.supplier_name}</p>
                {selected.reopen_count > 0 && (
                  <p className="text-xs text-orange-600 mt-1">Reabierta {selected.reopen_count} vez(ces)</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-sm font-semibold ${STATUS_COLORS[selected.status] ?? 'bg-gray-100'}`}>
                  {STATUS_LABELS[selected.status] ?? selected.status}
                </span>
                <button onClick={() => setSelected(null)} className="text-neutral-400 hover:text-neutral-700 text-xl leading-none">×</button>
              </div>
            </div>

            <div className="mt-4 border-t border-neutral-100 pt-3">
              <Stepper
                steps={LOCAL_STEPS}
                current={selected.status === 'PARCIAL' ? 'RECIBIDA' : selected.status === 'REABIERTA' ? 'PENDIENTE' : selected.status}
                terminal="INCONSISTENTE"
              />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
              {isAdmin && (
                <div>
                  <span className="text-neutral-500">Total:</span>
                  <span className="ml-2 font-semibold">${fmt(selected.total_usd)}</span>
                </div>
              )}
              {selected.received_by && (
                <div>
                  <span className="text-neutral-500">Recibido por:</span>
                  <span className="ml-2">{selected.received_by}</span>
                </div>
              )}
              {selected.notes && (
                <div className="col-span-2">
                  <span className="text-neutral-500">Notas:</span>
                  <span className="ml-2 text-purple-600 italic">{selected.notes}</span>
                </div>
              )}
              {selected.is_incomplete && selected.incomplete_note && (
                <div className="col-span-2 text-red-600">
                  <span className="font-semibold">Inconsistencia:</span>
                  <span className="ml-2">{selected.incomplete_note}</span>
                </div>
              )}
            </div>

            {error && <div className="mt-3 bg-red-50 text-red-700 p-3 rounded text-sm">{error}</div>}

            {['PAGADA','EN_CAMINO','RECIBIDA','PARCIAL'].includes(selected.status) && (
              <div className="mt-4">
                <a href={`/recepcion/local/${selected.id}`} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 border border-neutral-300 rounded-lg text-neutral-700 hover:bg-neutral-50">
                  🖨 Imprimir lista de recepción
                </a>
              </div>
            )}

            {isAdmin && !historyMode && (
              <div className="mt-4 flex flex-wrap gap-2">
                {(selected.status === 'PENDIENTE' || selected.status === 'REABIERTA') && (
                  <>
                    <button onClick={() => openEdit(selected)} className="btn-secondary text-sm">Editar</button>
                    <button onClick={() => doAction('advance')} disabled={saving} className="btn-primary text-sm">Marcar Pagada</button>
                    <button onClick={deleteOrder} disabled={saving} className="btn-danger text-sm">Eliminar</button>
                  </>
                )}
                {selected.status === 'PAGADA' && (
                  <button onClick={() => doAction('advance')} disabled={saving} className="btn-primary text-sm">En Camino</button>
                )}
                {selected.status === 'EN_CAMINO' && (
                  <button onClick={openReceive} className="btn-primary text-sm">Recibir</button>
                )}
                {selected.status === 'RECIBIDA' && (
                  <>
                    <button onClick={() => doAction('finalize')} disabled={saving} className="btn-primary text-sm">Finalizar</button>
                    <button onClick={() => setShowIncNote(true)} className="btn-secondary text-sm">Inconsistente</button>
                  </>
                )}
                {selected.status === 'PARCIAL' && (
                  <>
                    <button onClick={openReceive} className="btn-primary text-sm">Recibir Más</button>
                    <button onClick={() => doAction('finalize')} disabled={saving} className="btn-secondary text-sm">Finalizar</button>
                  </>
                )}
                {['FINALIZADA','INCONSISTENTE','RECIBIDA','PARCIAL','PAGADA','EN_CAMINO','REABIERTA'].includes(selected.status) && (
                  <button onClick={() => doAction('reopen')} disabled={saving} className="btn-warning text-sm">Reabrir</button>
                )}
              </div>
            )}
            {!isAdmin && !historyMode && (
              <div className="mt-4 flex flex-wrap gap-2">
                {selected.status === 'EN_CAMINO' && (
                  <button onClick={openReceive} className="btn-primary text-sm">Recibir Mercancía</button>
                )}
                {selected.status === 'PARCIAL' && (
                  <button onClick={openReceive} className="btn-primary text-sm">Recibir Más</button>
                )}
                {['RECIBIDA','PARCIAL'].includes(selected.status) && (
                  <button onClick={finalizeReception} disabled={saving} className="btn-primary text-sm">
                    ✓ Finalizar y cargar al inventario
                  </button>
                )}
                {['PARCIAL','RECIBIDA','FINALIZADA','INCONSISTENTE'].includes(selected.status) && (
                  <>
                    <button onClick={undoLast} disabled={saving} className="btn-secondary text-sm">↩ Deshacer último</button>
                    <button onClick={resetReception} disabled={saving} className="btn-warning text-sm">Reabrir recepción</button>
                  </>
                )}
              </div>
            )}
            {/* En Historial el usuario normal puede reabrir una compra ya finalizada
                (p.ej. para corregir una recepción incompleta): vuelve a EN CAMINO y
                reaparece en su lista activa para recibir de nuevo. */}
            {!isAdmin && historyMode && ['FINALIZADA','INCONSISTENTE'].includes(selected.status) && (
              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={resetReception} disabled={saving} className="btn-warning text-sm">Reabrir recepción</button>
              </div>
            )}
            {isAdmin && historyMode && ['FINALIZADA','INCONSISTENTE'].includes(selected.status) && (
              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={() => doAction('reopen')} disabled={saving} className="btn-warning text-sm">Reabrir</button>
              </div>
            )}
          </div>

          {/* Items table */}
          <div className="flex-1 overflow-y-auto">
            <div className="px-5 py-3 border-b bg-neutral-50 sticky top-0">
              <h4 className="font-semibold text-neutral-700 text-sm">Productos ({selected.items.length})</h4>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-neutral-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-2 text-left">Producto</th>
                  <th className="px-4 py-2 text-right">Cant.</th>
                  {isAdmin && <th className="px-4 py-2 text-right">C/U</th>}
                  {isAdmin && <th className="px-4 py-2 text-right">Total</th>}
                  <th className="px-4 py-2 text-right">Recibido</th>
                </tr>
              </thead>
              <tbody>
                {selected.items.map((item, idx) => (
                  <tr key={idx} className="border-t hover:bg-neutral-50">
                    <td className="px-4 py-2">
                      <span className="text-neutral-500 font-mono text-xs mr-2">{item.product_code}</span>
                      {item.product_name}
                    </td>
                    <td className="px-4 py-2 text-right">{item.quantity}</td>
                    {isAdmin && <td className="px-4 py-2 text-right">${fmt(item.unit_cost_usd)}</td>}
                    {isAdmin && <td className="px-4 py-2 text-right font-semibold">${fmt(item.total_cost_usd)}</td>}
                    <td className="px-4 py-2 text-right">
                      {(() => {
                        // total_received_qty puede venir 0/null en finalizadas (datos legacy
                        // o vía "completa"): una FINALIZADA está recibida al 100%.
                        const rec = item.total_received_qty || item.received_qty ||
                          (selected.status === 'FINALIZADA' ? item.quantity : 0)
                        return (
                          <span className={rec >= item.quantity ? 'text-green-600 font-semibold' : 'text-orange-500'}>
                            {rec}/{item.quantity}
                          </span>
                        )
                      })()}
                    </td>
                  </tr>
                ))}
                {isAdmin && (
                  <tr className="border-t bg-neutral-50 font-semibold">
                    <td colSpan={3} className="px-4 py-2 text-right text-neutral-600">Total:</td>
                    <td className="px-4 py-2 text-right">${fmt(selected.total_usd)}</td>
                    <td />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )}

      {/* Create/Edit slide-over */}
      {showForm && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowForm(false)} />
          <div className="absolute right-0 top-0 h-full w-full max-w-2xl bg-white shadow-2xl flex flex-col">
            <div className="p-5 border-b flex justify-between shrink-0">
              <h3 className="font-semibold text-lg">{editId ? 'Editar Orden' : 'Nueva Orden de Compra'}</h3>
              <button onClick={() => setShowForm(false)} className="text-neutral-400 hover:text-neutral-700 text-xl">×</button>
            </div>
            <div className="p-5 space-y-4 flex-1 overflow-y-auto">
              {error && <div className="bg-red-50 text-red-700 p-3 rounded text-sm">{error}</div>}
              {formMsg && <div className="bg-green-50 text-green-700 border border-green-200 p-3 rounded text-sm">{formMsg}</div>}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Proveedor *</label>
                  <Combobox
                    value={formSupplierName}
                    options={suppliers}
                    placeholder="Escribe o busca el proveedor…"
                    onChange={(name, id) => { setFormSupplierName(name); setFormSupplierId(id) }}
                    onDelete={deleteSupplier}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Notas</label>
                  <input
                    value={formNotes}
                    onChange={e => setFormNotes(e.target.value)}
                    className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-800"
                    placeholder="Notas opcionales..."
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Buscar Producto</label>
                <div className="relative">
                  <input
                    value={productSearch}
                    onChange={e => { setProductSearch(e.target.value); setShowProductList(true) }}
                    onFocus={() => setShowProductList(true)}
                    placeholder="Código o nombre..."
                    className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-800"
                  />
                  {showProductList && filteredProducts.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border rounded shadow-lg max-h-48 overflow-y-auto">
                      {filteredProducts.map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => addProductToForm(p)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-neutral-50 flex justify-between gap-2"
                        >
                          <span className="truncate">
                            <span className="font-mono text-neutral-500 mr-2">{p.code}</span>
                            {p.name}
                          </span>
                          {(p.total_cost ?? 0) > 0 && (
                            <span className="text-neutral-400 whitespace-nowrap">${fmt(p.total_cost!)}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {formItems.length > 0 && (
                <div className="border rounded overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-50 text-xs text-neutral-500 uppercase">
                      <tr>
                        <th className="px-3 py-2 text-left">Producto</th>
                        <th className="px-3 py-2 text-right w-20">Cant.</th>
                        <th className="px-3 py-2 text-right w-28">Costo U.</th>
                        <th className="px-3 py-2 text-right w-28">Total</th>
                        <th className="px-3 py-2 w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {formItems.map((item, idx) => (
                        <tr key={idx} className="border-t">
                          <td className="px-3 py-1.5 text-xs">
                            <span className="text-neutral-400 mr-1">{item.product_code}</span>
                            {item.product_name}
                          </td>
                          <td className="px-3 py-1.5">
                            <input
                              type="number" min={1} onKeyDown={blockIntKeys}
                              value={item.quantity}
                              onChange={e => updateFormItem(idx, 'quantity', e.target.value)}
                              className="w-full text-right border rounded px-2 py-1 text-sm"
                            />
                          </td>
                          <td className="px-3 py-1.5">
                            <input
                              type="number" min={0} step="0.01" onKeyDown={blockNumberKeys}
                              value={item.unit_cost_usd}
                              onChange={e => updateFormItem(idx, 'unit_cost_usd', e.target.value)}
                              className="w-full text-right border rounded px-2 py-1 text-sm"
                            />
                          </td>
                          <td className="px-3 py-1.5 text-right font-semibold">
                            ${fmt(item.quantity * item.unit_cost_usd)}
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            <button onClick={() => removeFormItem(idx)} className="text-red-400 hover:text-red-600">×</button>
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t bg-neutral-50">
                        <td colSpan={3} className="px-3 py-2 text-right font-semibold text-sm">Total:</td>
                        <td className="px-3 py-2 text-right font-bold">${fmt(formTotal)}</td>
                        <td />
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="p-5 border-t flex flex-wrap justify-end gap-2 shrink-0 bg-neutral-50">
              <button onClick={() => setShowForm(false)} className="btn-secondary">Cancelar</button>
              {editId ? (
                <button onClick={() => saveOrder('close')} disabled={saving} className="btn-primary">
                  {saving ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              ) : (
                <>
                  <button onClick={() => saveOrder('close')} disabled={saving} className="btn-secondary">
                    {saving ? 'Guardando...' : 'Crear Orden'}
                  </button>
                  <button onClick={() => saveOrder('continue')} disabled={saving} className="btn-primary">
                    {saving ? 'Guardando...' : 'Crear y continuar'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Receive Modal */}
      {showReceive && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-lg">
            <div className="p-5 border-b flex justify-between">
              <h3 className="font-semibold text-lg">Recibir Mercancía — {selected?.order_number}</h3>
              <button onClick={() => setShowReceive(false)} className="text-neutral-400 hover:text-neutral-600 text-xl">×</button>
            </div>
            <div className="p-5 space-y-4">
              {error && <div className="bg-red-50 text-red-700 p-3 rounded text-sm">{error}</div>}
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-xs text-neutral-500 uppercase">
                  <tr>
                    <th className="px-3 py-2 text-left">Producto</th>
                    <th className="px-3 py-2 text-right">Esperado</th>
                    <th className="px-3 py-2 text-right">Recibir</th>
                  </tr>
                </thead>
                <tbody>
                  {recvItems.map((item, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="px-3 py-2 text-xs">
                        <span className="text-neutral-400 mr-1">{item.product_code}</span>
                        {item.product_name}
                        {item.already_received > 0 && (
                          <span className="ml-1 text-orange-500">(ya {item.already_received})</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-neutral-500">{item.expected - item.already_received}</td>
                      <td className="px-3 py-2">
                        <input
                          type="number" min={0} onKeyDown={blockIntKeys}
                          value={item.received_qty}
                          onChange={e => setRecvItems(prev =>
                            prev.map((r, i) => i === idx ? { ...r, received_qty: parseInt(e.target.value) || 0 } : r)
                          )}
                          className="w-full text-right border rounded px-2 py-1"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={recvPartial}
                  onChange={e => setRecvPartial(e.target.checked)}
                  className="rounded"
                />
                <span>Recepción parcial (carga inventario ahora, permite recibir más después)</span>
              </label>
            </div>
            <div className="p-5 border-t flex justify-end gap-3">
              <button onClick={() => setShowReceive(false)} className="btn-secondary">Cancelar</button>
              <button onClick={submitReceive} disabled={saving} className="btn-primary">
                {saving ? 'Guardando...' : 'Confirmar Recepción'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inconsistente note modal */}
      {showIncNote && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-sm">
            <div className="p-5 border-b">
              <h3 className="font-semibold">Marcar como Inconsistente</h3>
            </div>
            <div className="p-5">
              <label className="block text-sm font-medium text-neutral-700 mb-1">Nota explicativa *</label>
              <textarea
                value={incNote}
                onChange={e => setIncNote(e.target.value)}
                rows={3}
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-800"
                placeholder="Describe la inconsistencia..."
              />
            </div>
            <div className="p-5 border-t flex justify-end gap-3">
              <button onClick={() => setShowIncNote(false)} className="btn-secondary">Cancelar</button>
              <button
                onClick={async () => {
                  if (!incNote.trim()) return
                  await doAction('inconsistente', incNote)
                  setShowIncNote(false)
                  setIncNote('')
                }}
                disabled={saving || !incNote.trim()}
                className="btn-danger"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
