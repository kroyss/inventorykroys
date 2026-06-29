'use client'
import { useState, useEffect, useCallback } from 'react'
import type { ImportOrder, Supplier, UserRole } from '@/lib/types'
import ImportsForm from './ImportsForm'
import ImportFiles from './ImportFiles'
import { Stepper, KPICard, int, Pagination } from '@/components/ui'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { itemsTooltip } from '@/lib/itemsTooltip'
import { blockNumberKeys, blockIntKeys } from '@/lib/inputGuards'
import { SortableTh, toggleSort, type SortState } from './SortableTh'
import { Combobox } from '@/components/ui/Combobox'

const PAGE_SIZE = 15

// Main 12-state flow (terminal INCONSISTENTE shown off-path)
const IMPORT_STEPS = [
  { key: 'PENDIENTE',           label: 'Pendiente' },
  { key: 'PAGO_PARCIAL',        label: '50%' },
  { key: 'ESPERANDO_FOTOS',     label: 'Fotos' },
  { key: 'PAGADA',              label: '100%' },
  { key: 'EN_TRANSITO',         label: 'Tránsito' },
  { key: 'ADUANA',              label: 'Aduana' },
  { key: 'EN_IMPORTADOR_PAGAR', label: 'Importador' },
  { key: 'EN_CAMINO',           label: 'En camino' },
  { key: 'RECIBIDA',            label: 'Recibida' },
  { key: 'FINALIZADA',          label: 'Finalizada' },
]

const fmt = (n: number) =>
  Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const STATUS_LABELS: Record<string, string> = {
  PENDIENTE:           'Pendiente',
  PAGO_PARCIAL:        'Pago 50%',
  ESPERANDO_FOTOS:     'Esperando fotos',
  PAGADA:              'Pagada 100%',
  EN_TRANSITO:         'En tránsito',
  ADUANA:              'En aduana',
  EN_IMPORTADOR_PAGAR: 'Importador por pagar',
  EN_CAMINO:           'En camino',
  RECIBIDA:            'Recibida',
  PARCIAL:             'Parcial',
  FINALIZADA:          'Finalizada',
  INCONSISTENTE:       'Inconsistente',
}

const STATUS_COLORS: Record<string, string> = {
  PENDIENTE:           'bg-neutral-100 text-neutral-700',
  PAGO_PARCIAL:        'bg-neutral-100 text-neutral-700',
  ESPERANDO_FOTOS:     'bg-neutral-100 text-neutral-700',
  PAGADA:              'bg-neutral-100 text-neutral-700',
  EN_TRANSITO:         'bg-neutral-100 text-neutral-700',
  ADUANA:              'bg-neutral-100 text-neutral-700',
  EN_IMPORTADOR_PAGAR: 'bg-neutral-100 text-neutral-700',
  EN_CAMINO:           'bg-neutral-100 text-neutral-700',
  RECIBIDA:            'bg-neutral-100 text-neutral-700',
  PARCIAL:             'bg-neutral-100 text-neutral-700',
  FINALIZADA:          'bg-neutral-100 text-neutral-700',
  INCONSISTENTE:       'bg-neutral-100 text-neutral-700',
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
  initialOrders: ImportOrder[]
  suppliers: Supplier[]
  userRole: UserRole
  historyMode?: boolean
  /** Aviso al padre (ComprasTabs) tras cualquier cambio, para refrescar contadores y la otra pestaña. */
  onChanged?: () => void
  /** El padre pide abrir el form de creación (botón unificado "+ Compra"). */
  autoCreate?: boolean
  onAutoCreateHandled?: () => void
}

export default function ImportsClient({ initialOrders, suppliers, userRole, historyMode = false, onChanged, autoCreate = false, onAutoCreateHandled }: Props) {
  const isAdmin = userRole === 'admin'
  const confirm = useConfirm()

  const [orders, setOrders]       = useState<ImportOrder[]>(initialOrders)
  const [selected, setSelected]   = useState<ImportOrder | null>(null)
  type ChipFilter = 'all' | 'porPagar' | 'transito' | 'recibir' | 'inconsistentes' | 'finalizadas'
  const [chipFilter, setChipFilter] = useState<ChipFilter>('all')
  const [search, setSearch] = useState('')
  const [busy, setBusy]           = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [showForm, setShowForm]   = useState(false)
  const [editing, setEditing]     = useState<ImportOrder | null>(null)

  // Receive modal
  const [showReceive, setShowReceive]   = useState(false)
  const [recvItems, setRecvItems]       = useState<RecvItem[]>([])
  const [recvPartial, setRecvPartial]   = useState(false)

  // Inline state inputs
  const [trackingInput, setTrackingInput] = useState('')
  const [shippingInput, setShippingInput] = useState('')
  const [boxCountInput, setBoxCountInput] = useState('')
  const [notesInput, setNotesInput]       = useState('')
  const [incNote, setIncNote]             = useState('')
  const [showIncNote, setShowIncNote]     = useState(false)
  const [showPay, setShowPay]             = useState<'50' | '100' | null>(null)
  const [payAmount, setPayAmount]         = useState('')
  // Contenedores activos para el paso PAGADA → En tránsito (tracking + contenedor)
  const [containers,  setContainers]        = useState<{ id: number; code: string }[]>([])
  const [trkContName, setTrkContName]       = useState('')
  const [trkContId,   setTrkContId]         = useState<number | null>(null)

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
      if (showIncNote)      { setShowIncNote(false); setIncNote('') }
      else if (showPay)     { closePay() }
      else if (showReceive) { setShowReceive(false) }
      else if (showForm)    { setShowForm(false); setEditing(null) }
      else if (selected)    { setSelected(null) }
    }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [showIncNote, showPay, showReceive, showForm, selected])

  // Contenedores activos (abiertos / en tránsito) para asignar una orden
  const loadActiveContainers = useCallback(async () => {
    try {
      const r = await fetch('/api/containers', { cache: 'no-store' })
      if (r.ok) {
        const all = await r.json() as { id: number; code: string; status: string }[]
        setContainers(all.filter(c => c.status === 'ABIERTO' || c.status === 'EN_TRANSITO'))
      }
    } catch { /* sin contenedores, igual se puede crear */ }
  }, [])

  // Al abrir una orden ya PAGADA, carga contenedores activos para el paso a tránsito
  useEffect(() => {
    setTrkContName(''); setTrkContId(null)
    if (isAdmin && selected?.status === 'PAGADA') loadActiveContainers()
  }, [selected, isAdmin, loadActiveContainers])

  // Botón unificado "+ Compra" del padre: abre el form de importación al activarse
  useEffect(() => {
    if (autoCreate && !historyMode && isAdmin) { setEditing(null); setShowForm(true); onAutoCreateHandled?.() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCreate])

  const reload = useCallback(async () => {
    const r = await fetch('/api/imports', { cache: 'no-store' })
    if (r.ok) {
      const data: ImportOrder[] = await r.json()
      setOrders(data)
      setSelected(prev => {
        if (!prev) return null
        const fresh = data.find(o => o.id === prev.id) ?? null
        // En las pestañas activas, si pasó a Historial (FINALIZADA/INCONSISTENTE)
        // ya no pertenece aquí: cerrar el detalle para que no quede "pegada".
        if (fresh && !historyMode && ['FINALIZADA', 'INCONSISTENTE'].includes(fresh.status)) return null
        return fresh
      })
      onChanged?.()  // refresca contadores y la otra pestaña en ComprasTabs
    }
  }, [historyMode, onChanged])

  useEffect(() => {
    setNotesInput(selected?.notes ?? '')
  }, [selected])

  // deep-link: /compras?tab=import&new=1 opens the import form
  useEffect(() => {
    if (isAdmin && new URLSearchParams(window.location.search).get('new') === '1') {
      setEditing(null); setShowForm(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const CHIP_GROUPS: Record<ChipFilter, string[] | null> = {
    all:            null,
    porPagar:       ['PENDIENTE', 'PAGO_PARCIAL', 'ESPERANDO_FOTOS'],
    transito:       ['EN_TRANSITO', 'ADUANA', 'EN_IMPORTADOR_PAGAR', 'EN_CAMINO'],
    recibir:        ['RECIBIDA', 'PARCIAL'],
    inconsistentes: ['INCONSISTENTE'],
    finalizadas:    ['FINALIZADA'],
  }
  const CHIP_LABELS_I: Record<ChipFilter, string> = {
    all:            'Todas',
    porPagar:       'Por pagar',
    transito:       'En tránsito',
    recibir:        'Por recibir',
    inconsistentes: 'Inconsistentes',
    finalizadas:    'Finalizadas',
  }
  // Usuario normal: solo EN_CAMINO en adelante (la mercancía ya viene en camino).
  // Estados anteriores (tránsito, aduana, pagos, fotos) solo los ve el admin.
  const USER_VISIBLE = ['EN_CAMINO', 'RECIBIDA', 'PARCIAL']
  // Finalizadas/Inconsistentes ya no van en chips: viven en la pestaña Historial.
  const CHIP_ORDER_I: ChipFilter[] = isAdmin
    ? ['all','porPagar','transito','recibir']
    : ['all','recibir']

  // Conjunto base según rol y modo (antes de chip/búsqueda)
  const baseVisible = orders.filter(o => {
    if (historyMode) return ['FINALIZADA', 'INCONSISTENTE'].includes(o.status)
    // Activas: finalizadas e inconsistentes viven solo en Historial
    if (['FINALIZADA', 'INCONSISTENTE'].includes(o.status)) return false
    if (!isAdmin) return USER_VISIBLE.includes(o.status)
    return true
  })

  // Valor de orden por columna clickeable
  const SORT_ACCESSORS: Record<string, (o: ImportOrder) => string | number> = {
    order_number: o => o.order_number,
    supplier:     o => (o.supplier_name ?? '').toLowerCase(),
    productos:    o => o.items.length,
    cantidad:     o => o.items.reduce((a, i) => a + i.quantity, 0),
    cajas:        o => o.box_count ?? 0,
    total:        o => o.total_usd ?? 0,
    updated_at:   o => new Date(o.updated_at ?? o.created_at ?? 0).getTime(),
    estado:       o => STATUS_LABELS[o.status] ?? o.status,
    contenedor:   o => (o.container_code ?? '').toLowerCase(),
    transportista: o => (o.origin_country ?? '').toLowerCase(),
  }

  const visibleOrders = [...baseVisible.filter(o => {
    const grp = CHIP_GROUPS[chipFilter]
    if (grp && !grp.includes(o.status)) return false
    if (!search) return true
    const q = search.toLowerCase()
    return o.order_number.toLowerCase().includes(q)
      || (o.supplier_name ?? '').toLowerCase().includes(q)
      || (o.notes ?? '').toLowerCase().includes(q)
      || (o.tracking_number ?? '').toLowerCase().includes(q)
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

  const chipCountI = (k: ChipFilter) => {
    const grp = CHIP_GROUPS[k]
    return grp ? baseVisible.filter(o => grp.includes(o.status)).length : baseVisible.length
  }

  const paginatedOrders = visibleOrders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const callStatus = async (body: Record<string, unknown>) => {
    if (!selected) return
    setBusy(true); setError(null)
    const res = await fetch(`/api/imports/${selected.id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setBusy(false)
    if (!res.ok) {
      const e = await res.json()
      setError(e.error ?? 'Error')
      reload() // sincroniza con el estado real (pudo cambiar en otra sesión)
      return false
    }
    setTrackingInput(''); setShippingInput(''); setBoxCountInput(''); setIncNote('')
    setTrkContName(''); setTrkContId(null)
    reload()
    return true
  }

  const advanceTo = async (nextStatus: string) => {
    const extras: Record<string, unknown> = {}
    if (nextStatus === 'EN_TRANSITO') {
      if (!trackingInput.trim()) {
        setError('Tracking number requerido')
        return
      }
      if (!trkContName.trim()) {
        setError('Contenedor requerido')
        return
      }
      if (!selected || (selected.file_count ?? 0) < 1) {
        setError('Adjunta al menos una foto antes de pasar a tránsito')
        return
      }
      extras.tracking_number = trackingInput
      // Resolver contenedor: usar el activo elegido o crear uno nuevo
      let cid = trkContId
      if (!cid) {
        setBusy(true)
        const cr = await fetch('/api/containers', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: trkContName.trim() }),
        })
        setBusy(false)
        if (!cr.ok) { setError('No se pudo crear el contenedor'); return }
        cid = (await cr.json()).id
      }
      extras.container_id = cid
    }
    if (nextStatus === 'EN_CAMINO') {
      const sc = parseFloat(shippingInput)
      const bc = parseInt(boxCountInput, 10)
      if (!sc || sc <= 0) { setError('Costo de envío requerido'); return }
      if (!bc || bc <= 0) { setError('Cantidad de cajas requerida'); return }
      extras.shipping_cost = sc
      extras.box_count     = bc
    }
    await callStatus({ status: nextStatus, ...extras })
  }

  const finalize = async (target: 'FINALIZADA' | 'INCONSISTENTE') => {
    if (!selected) return
    if (target === 'INCONSISTENTE' && !incNote.trim()) {
      setError('Nota requerida para inconsistente')
      return
    }
    setBusy(true); setError(null)
    const res = await fetch(`/api/imports/${selected.id}/status/finalize`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: target,
        incomplete_note: target === 'INCONSISTENTE' ? incNote : undefined,
      }),
    })
    setBusy(false)
    if (!res.ok) {
      const e = await res.json()
      setError(e.error ?? 'Error')
      reload() // sincroniza con el estado real (pudo cambiar en otra sesión)
      return
    }
    setIncNote(''); setShowIncNote(false)
    reload()
  }

  const reopen = async () => {
    if (!selected) return
    if (!await confirm({ title: 'Reabrir importación', message: 'Se revertirán archivos, pagos e inventario cargado. ¿Continuar?', confirmText: 'Reabrir' })) return
    await callStatus({ status: 'REABIERTA' })
  }

  // Recepción: deshacer último paso (un estado atrás)
  const undoLast = async () => {
    if (!selected) return
    const msg = selected.status === 'PARCIAL'
      ? 'Se revertirán TODAS las recepciones parciales y el inventario cargado, volviendo a EN CAMINO. ¿Continuar?'
      : selected.status === 'RECIBIDA'
        ? 'Se anularán las cantidades recibidas, volviendo a EN CAMINO. ¿Continuar?'
        : 'Se revertirá la finalización (y su inventario), volviendo a RECIBIDA. ¿Continuar?'
    if (!await confirm({ title: 'Deshacer último cambio', message: msg, confirmText: 'Deshacer' })) return
    await callStatus({ status: 'UNDO' })
  }

  // Recepción: reabrir desde cero (vuelve a EN CAMINO)
  const resetReception = async () => {
    if (!selected) return
    if (!await confirm({
      title: 'Reabrir recepción',
      message: 'Se revertirá el inventario cargado y se borrarán las cantidades recibidas, volviendo a EN CAMINO para recibir de nuevo. ¿Continuar?',
      confirmText: 'Reabrir',
    })) return
    await callStatus({ status: 'RESET_RECEPTION' })
  }

  // Recepción: finalizar (carga inventario con lo recibido)
  const finalizeReception = async () => {
    if (!selected) return
    if (!await confirm({
      title: 'Finalizar recepción',
      message: 'Se cargará al inventario lo recibido y la importación quedará FINALIZADA. ¿Continuar?',
      confirmText: 'Finalizar y cargar',
    })) return
    await finalize('FINALIZADA')
  }

  const deleteOrder = async () => {
    if (!selected) return
    if (!await confirm({ title: 'Eliminar importación', message: `¿Eliminar permanentemente la orden ${selected.order_number}? Esta acción no se puede deshacer.`, confirmText: 'Eliminar', danger: true })) return
    setBusy(true); setError(null)
    const res = await fetch(`/api/imports/${selected.id}`, { method: 'DELETE' })
    setBusy(false)
    if (!res.ok) {
      const e = await res.json()
      setError(e.error ?? 'Error')
      return
    }
    setSelected(null)
    reload()
  }

  const openReceive = () => {
    if (!selected) return
    setRecvItems(selected.items.map(it => ({
      product_id:       it.product_id,
      product_name:     it.product_name,
      product_code:     it.product_code,
      expected:         it.quantity,
      received_qty:     0,
      already_received: it.total_received_qty || it.received_qty || 0,
    })))
    setRecvPartial(false)
    setShowReceive(true)
  }

  const submitReceive = async () => {
    if (!selected) return
    const items = recvItems
      .filter(i => i.received_qty > 0)
      .map(i => ({ product_id: i.product_id, received_qty: i.received_qty }))
    if (items.length === 0) { setError('Indica cantidades a recibir'); return }

    // Advertir si difiere de lo esperado — SOLO en recepción completa
    // (en parcial es obvio que recibes menos del total).
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

    setBusy(true); setError(null)
    const res = await fetch(`/api/imports/${selected.id}/receive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, partial: recvPartial }),
    })
    setBusy(false)
    if (!res.ok) {
      const e = await res.json()
      setError(e.error ?? 'Error')
      return
    }
    setShowReceive(false)
    reload()
  }

  // Monto sugerido: 50% = mitad del total; 100% = lo que falta (total − pagado 50%).
  // Finanzas SUMA ambos pagos, así que el 100% debe ser el restante, no el total.
  const suggestedPay = (step: '50' | '100'): string => {
    if (!selected) return ''
    const total = selected.total_usd || 0
    if (step === '50') return (total / 2).toFixed(2)
    const remaining = total - (selected.paid_50_done ? (selected.paid_50_amount || 0) : 0)
    return Math.max(0, remaining).toFixed(2)
  }
  const closePay = () => { setShowPay(null); setPayAmount('') }
  const openPay = (step: '50' | '100') => {
    setPayAmount(suggestedPay(step))
    setShowPay(step)
  }

  const submitPayment = async () => {
    if (!selected || !showPay) return
    const amount = parseFloat(payAmount)
    if (!amount || amount <= 0) { setError('Monto inválido'); return }
    setBusy(true); setError(null)
    const res = await fetch(`/api/imports/${selected.id}/payment`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payment_step: showPay, amount }),
    })
    setBusy(false)
    if (!res.ok) {
      const e = await res.json()
      setError(e.error ?? 'Error')
      return
    }
    closePay()
    reload()
  }

  const saveNotes = async () => {
    if (!selected) return
    setBusy(true); setError(null)
    const res = await fetch(`/api/imports/${selected.id}/notes`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: notesInput }),
    })
    setBusy(false)
    if (!res.ok) {
      const e = await res.json()
      setError(e.error ?? 'Error')
      return
    }
    reload()
  }

  // ── KPIs (imports) ──
  const kpis = {
    porPagar:   orders.filter(o => ['PENDIENTE', 'PAGO_PARCIAL', 'ESPERANDO_FOTOS'].includes(o.status)).length,
    enTransito: orders.filter(o => ['EN_TRANSITO', 'ADUANA', 'EN_IMPORTADOR_PAGAR', 'EN_CAMINO'].includes(o.status)).length,
    porRecibir: orders.filter(o => ['RECIBIDA', 'PARCIAL'].includes(o.status)).length,
    valorActivo: orders.filter(o => !['FINALIZADA'].includes(o.status)).reduce((s, o) => s + (o.total_usd || 0), 0),
    pagado: orders.reduce((s, o) => s + (o.paid_50_amount || 0) + (o.paid_100_amount || 0), 0),
  }

  return (
    <div>
      {error && (
        <div className="mb-3 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm">{error}</div>
      )}

      {/* Toolbar: chips + buscador + nueva importación */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 gap-2">
        {!historyMode ? (
          <div className="flex gap-1.5 overflow-x-auto bg-white rounded-xl border border-neutral-200 shadow-sm p-2">
            {CHIP_ORDER_I.map(c => {
              const active = chipFilter === c
              return (
                <button key={c} onClick={() => setChipFilter(c)}
                  className={`px-3 py-1 rounded-full border text-xs whitespace-nowrap transition-colors ${
                    active ? 'bg-neutral-900 border-neutral-900 text-white' : 'bg-white border-neutral-200 text-neutral-600 hover:border-neutral-400'
                  }`}>
                  {CHIP_LABELS_I[c]} <span className={active ? 'text-white/60' : 'text-neutral-400'}>{chipCountI(c)}</span>
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
        <div className="text-xs text-neutral-500 -mt-2 mb-2">
          Valor activo: <span className="font-semibold text-neutral-800">${fmt(kpis.valorActivo)}</span>
          <span className="mx-2 text-neutral-300">·</span>
          Pagado: <span className="font-semibold text-green-700">${fmt(kpis.pagado)}</span>
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
                <SortableTh label="Cajas" sortKey="cajas" sort={sort} onSort={onSort} align="right" title="Cantidad de cajas de la orden" />
                {isAdmin && <SortableTh label="Total" sortKey="total" sort={sort} onSort={onSort} align="right" />}
                <SortableTh label="Últ. mov." sortKey="updated_at" sort={sort} onSort={onSort} align="right" title="Fecha del último movimiento" />
                <SortableTh label="Transportista" sortKey="transportista" sort={sort} onSort={onSort} title="Transportista (clic para agrupar)" />
                <SortableTh label="Contenedor" sortKey="contenedor" sort={sort} onSort={onSort} title="Contenedor asignado (clic para agrupar)" />
                <SortableTh label="Estado" sortKey="estado" sort={sort} onSort={onSort} align="center" />
                {historyMode && <th className="px-2 py-2 text-center">Inconsistente</th>}
              </tr>
            </thead>
            <tbody>
              {visibleOrders.length === 0 && (
                <tr><td colSpan={(isAdmin ? 11 : 10) + (historyMode ? 1 : 0)} className="px-3 py-8 text-center text-neutral-400">Sin órdenes</td></tr>
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
                    <td className="px-3 py-2 font-mono text-xs font-bold text-neutral-900 whitespace-nowrap">
                      {o.order_number}
                      {o.file_count > 0 && <span className="ml-1 text-neutral-500 font-normal">📎{o.file_count}</span>}
                    </td>
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
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {o.box_count
                        ? <span className="font-medium text-neutral-700">{o.box_count}</span>
                        : <span className="text-neutral-300">—</span>}
                    </td>
                    {isAdmin && <td className="px-3 py-2 text-right font-bold text-neutral-900 whitespace-nowrap">${fmt(o.total_usd)}</td>}
                    <td className="px-3 py-2 text-right text-neutral-400 text-xs whitespace-nowrap">{date}</td>
                    <td className="px-3 py-2 text-xs text-neutral-600 whitespace-nowrap max-w-[10rem] truncate">
                      {o.origin_country || <span className="text-neutral-300">—</span>}
                    </td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap font-mono">
                      {o.container_code
                        ? <span className="text-blue-700">📦 {o.container_code}</span>
                        : <span className="text-neutral-300">—</span>}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-neutral-100 text-neutral-700">
                        {STATUS_LABELS[o.status] ?? o.status}
                      </span>
                    </td>
                    {historyMode && (
                      <td className="px-2 py-2 text-center">
                        {o.status === 'INCONSISTENTE' ? (
                          <span className="text-red-600 cursor-help" title={o.notes || 'Inconsistente'}>⚠</span>
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
            {/* Header bar */}
            <div className="px-4 py-3 border-b border-neutral-100 shrink-0 flex items-start justify-between">
              <div>
                <div className="font-mono text-sm text-neutral-500">{selected.order_number}</div>
                <div className="font-semibold mt-0.5">{selected.supplier_name}</div>
                <div className="text-xs text-neutral-400 mt-0.5">
                  {isAdmin && <>Total: <span className="font-medium">${fmt(selected.total_usd)}</span></>}
                  {selected.origin_country && <span className={isAdmin ? 'ml-2' : ''}>{isAdmin ? '· ' : ''}🚚 {selected.origin_country}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded text-xs ${STATUS_COLORS[selected.status] ?? 'bg-gray-100'}`}>
                  {STATUS_LABELS[selected.status] ?? selected.status}
                </span>
                <button onClick={() => setSelected(null)} className="text-neutral-400 hover:text-neutral-700 text-xl leading-none">×</button>
              </div>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {/* Stepper */}
              <div className="bg-white rounded-lg border shadow-sm p-4">
                <Stepper
                  steps={IMPORT_STEPS}
                  current={selected.status === 'PARCIAL' ? 'RECIBIDA' : selected.status}
                  terminal="INCONSISTENTE"
                />

                {/* Payment summary — solo admin (montos) */}
                {isAdmin && (
                  <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                    <div className={`p-2 rounded ${selected.paid_50_done ? 'bg-green-50' : 'bg-neutral-100'}`}>
                      <div className="text-neutral-500">Pago 50%</div>
                      {selected.paid_50_done ? (
                        <div className="font-medium text-green-700">${fmt(selected.paid_50_amount)}</div>
                      ) : <div className="text-neutral-400">Pendiente</div>}
                    </div>
                    <div className={`p-2 rounded ${selected.paid_100_done ? 'bg-green-50' : 'bg-neutral-100'}`}>
                      <div className="text-neutral-500">Pago 100%</div>
                      {selected.paid_100_done ? (
                        <div className="font-medium text-green-700">${fmt(selected.paid_100_amount)}</div>
                      ) : <div className="text-neutral-400">Pendiente</div>}
                    </div>
                  </div>
                )}

                {/* Shipping info — tracking y cajas siempre; envío (monto) solo admin */}
                {(selected.tracking_number || selected.box_count > 0 || (isAdmin && selected.shipping_cost > 0)) && (
                  <div className="mt-3 text-xs space-y-1 text-neutral-600">
                    {selected.tracking_number && <div>Tracking: <span className="font-mono">{selected.tracking_number}</span></div>}
                    {isAdmin && selected.shipping_cost > 0 && <div>Envío: ${fmt(selected.shipping_cost)}</div>}
                    {selected.box_count > 0 && <div>Cajas: {selected.box_count}</div>}
                  </div>
                )}
              </div>

              {/* Print reception list */}
              {['EN_TRANSITO','ADUANA','EN_IMPORTADOR_PAGAR','EN_CAMINO','RECIBIDA','PARCIAL'].includes(selected.status) && (
                <div>
                  <a href={`/recepcion/import/${selected.id}`} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 border border-neutral-300 rounded-lg text-neutral-700 hover:bg-neutral-50">
                    🖨 Imprimir lista de recepción
                  </a>
                </div>
              )}

              {/* Action buttons by state */}
              {isAdmin && !historyMode && (
                <div className="bg-white rounded-lg border shadow-sm p-4">
                  <div className="text-xs text-neutral-500 mb-2">Acciones</div>
                  <div className="flex flex-wrap gap-2">
                    {selected.status === 'PENDIENTE' && (
                      <>
                        <button onClick={() => { setEditing(selected); setShowForm(true) }} className="btn-secondary text-sm">Editar</button>
                        <button onClick={() => openPay('50')} className="btn-primary text-sm">Pagar 50%</button>
                        <button onClick={() => openPay('100')} className="btn-primary text-sm">Pagar 100%</button>
                        <button onClick={deleteOrder} disabled={busy} className="btn-danger text-sm">Eliminar</button>
                      </>
                    )}
                    {selected.status === 'PAGO_PARCIAL' && (
                      <>
                        <button onClick={() => openPay('100')} className="btn-primary text-sm">Pagar 100%</button>
                        <button onClick={() => advanceTo('ESPERANDO_FOTOS')} disabled={busy} className="btn-secondary text-sm">Esperar fotos</button>
                      </>
                    )}
                    {selected.status === 'ESPERANDO_FOTOS' && (
                      <>
                        {!selected.paid_100_done && (
                          <button onClick={() => openPay('100')} className="btn-primary text-sm">Pagar 100%</button>
                        )}
                        <button onClick={() => advanceTo('PAGADA')} disabled={busy} className="btn-primary text-sm">
                          Marcar pagada
                        </button>
                        <span className="text-xs text-neutral-400 self-center">(necesita ≥1 archivo)</span>
                      </>
                    )}
                    {selected.status === 'PAGADA' && (
                      <>
                        <input value={trackingInput} onChange={e => setTrackingInput(e.target.value)}
                          placeholder="Tracking number" className="w-56 border rounded px-2 py-1 text-sm" />
                        <div className="w-56">
                          <Combobox
                            value={trkContName}
                            options={containers.map(c => ({ id: c.id, name: c.code }))}
                            placeholder="Contenedor activo o nuevo…"
                            onChange={(name, id) => { setTrkContName(name); setTrkContId(id) }}
                            className="w-full border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-800"
                          />
                        </div>
                        <button onClick={() => advanceTo('EN_TRANSITO')}
                          disabled={busy || !trackingInput.trim() || !trkContName.trim() || (selected.file_count ?? 0) < 1}
                          className="btn-primary text-sm">
                          En tránsito
                        </button>
                        {(selected.file_count ?? 0) < 1 && (
                          <span className="text-xs text-orange-500 self-center">⚠ Adjunta ≥1 foto abajo</span>
                        )}
                      </>
                    )}
                    {selected.status === 'EN_TRANSITO' && (
                      <button onClick={() => advanceTo('ADUANA')} disabled={busy} className="btn-primary text-sm">En aduana</button>
                    )}
                    {selected.status === 'ADUANA' && (
                      <button onClick={() => advanceTo('EN_IMPORTADOR_PAGAR')} disabled={busy} className="btn-primary text-sm">
                        Importador por pagar
                      </button>
                    )}
                    {selected.status === 'EN_IMPORTADOR_PAGAR' && (
                      <>
                        <input type="number" step="0.01" value={shippingInput} onKeyDown={blockNumberKeys} onChange={e => setShippingInput(e.target.value)}
                          placeholder="Costo envío $" className="border rounded px-2 py-1 text-sm w-32" />
                        <input type="number" value={boxCountInput} onKeyDown={blockIntKeys} onChange={e => setBoxCountInput(e.target.value)}
                          placeholder="# cajas" className="border rounded px-2 py-1 text-sm w-24" />
                        <button onClick={() => advanceTo('EN_CAMINO')} disabled={busy} className="btn-primary text-sm">
                          En camino
                        </button>
                      </>
                    )}
                    {selected.status === 'EN_CAMINO' && (
                      <button onClick={openReceive} className="btn-primary text-sm">Recibir mercancía</button>
                    )}
                    {selected.status === 'RECIBIDA' && (
                      <>
                        <button onClick={() => finalize('FINALIZADA')} disabled={busy} className="btn-primary text-sm">Finalizar</button>
                        <button onClick={() => setShowIncNote(true)} className="btn-secondary text-sm">Inconsistente</button>
                      </>
                    )}
                    {selected.status === 'PARCIAL' && (
                      <>
                        <button onClick={openReceive} className="btn-primary text-sm">Recibir más</button>
                        <button onClick={() => finalize('FINALIZADA')} disabled={busy} className="btn-secondary text-sm">Finalizar</button>
                      </>
                    )}
                    {['PAGADA','ESPERANDO_FOTOS','EN_TRANSITO','ADUANA','EN_IMPORTADOR_PAGAR','EN_CAMINO','RECIBIDA','PARCIAL','FINALIZADA','INCONSISTENTE'].includes(selected.status) && (
                      <button onClick={reopen} disabled={busy} className="btn-warning text-sm">Reabrir</button>
                    )}
                  </div>
                </div>
              )}

              {/* Acciones de recepción — usuario normal */}
              {!isAdmin && !historyMode && (
                <div className="bg-white rounded-lg border shadow-sm p-4">
                  <div className="text-xs text-neutral-500 mb-2">Recepción</div>
                  <div className="flex flex-wrap gap-2">
                    {selected.status === 'EN_CAMINO' && (
                      <button onClick={openReceive} className="btn-primary text-sm">Recibir mercancía</button>
                    )}
                    {selected.status === 'PARCIAL' && (
                      <button onClick={openReceive} className="btn-primary text-sm">Recibir más</button>
                    )}
                    {['RECIBIDA','PARCIAL'].includes(selected.status) && (
                      <button onClick={finalizeReception} disabled={busy} className="btn-primary text-sm">
                        ✓ Finalizar y cargar al inventario
                      </button>
                    )}
                    {['PARCIAL','RECIBIDA','FINALIZADA','INCONSISTENTE'].includes(selected.status) && (
                      <>
                        <button onClick={undoLast} disabled={busy} className="btn-secondary text-sm">↩ Deshacer último</button>
                        <button onClick={resetReception} disabled={busy} className="btn-warning text-sm">Reabrir recepción</button>
                      </>
                    )}
                    {!['EN_CAMINO','PARCIAL','RECIBIDA','FINALIZADA','INCONSISTENTE'].includes(selected.status) && (
                      <span className="text-xs text-neutral-400">Esta orden aún no está lista para recepción.</span>
                    )}
                  </div>
                </div>
              )}

              {/* En Historial el usuario normal puede reabrir una importación finalizada
                  (vuelve a EN CAMINO y reaparece en su lista activa). */}
              {!isAdmin && historyMode && ['FINALIZADA','INCONSISTENTE'].includes(selected.status) && (
                <div className="bg-white rounded-lg border shadow-sm p-4">
                  <div className="text-xs text-neutral-500 mb-2">Recepción</div>
                  <button onClick={resetReception} disabled={busy} className="btn-warning text-sm">Reabrir recepción</button>
                </div>
              )}
              {isAdmin && historyMode && ['FINALIZADA','INCONSISTENTE'].includes(selected.status) && (
                <div className="bg-white rounded-lg border shadow-sm p-4">
                  <div className="text-xs text-neutral-500 mb-2">Recepción</div>
                  <button onClick={reopen} disabled={busy} className="btn-warning text-sm">Reabrir</button>
                </div>
              )}

              {/* Files panel */}
              <ImportFiles orderId={selected.id} canEdit={isAdmin} onChange={reload} />

              {/* Notes editor — oculto en historial (solo lectura) */}
              {!historyMode ? (
                <div className="bg-white rounded-lg border shadow-sm p-4">
                  <div className="text-xs text-neutral-500 mb-2">Notas (guardar sin cambiar estado)</div>
                  <textarea value={notesInput} onChange={e => setNotesInput(e.target.value)}
                    rows={3}
                    className="w-full border rounded px-3 py-2 text-sm text-purple-600 italic" />
                  <div className="mt-2 flex justify-end">
                    <button onClick={saveNotes} disabled={busy} className="btn-secondary text-sm">Guardar notas</button>
                  </div>
                </div>
              ) : selected.notes ? (
                <div className="bg-white rounded-lg border shadow-sm p-4">
                  <div className="text-xs text-neutral-500 mb-1">Notas</div>
                  <div className="text-sm text-purple-600 italic whitespace-pre-line">{selected.notes}</div>
                </div>
              ) : null}

              {/* Items */}
              <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
                <div className="px-4 py-2 border-b bg-neutral-50 text-xs text-neutral-500">
                  Productos ({selected.items.length})
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 text-xs text-neutral-500 uppercase">
                    <tr>
                      <th className="px-3 py-2 text-left">Producto</th>
                      <th className="px-3 py-2 text-right">Cant.</th>
                      {isAdmin && <th className="px-3 py-2 text-right">$/u</th>}
                      {isAdmin && <th className="px-3 py-2 text-right">Total</th>}
                      <th className="px-3 py-2 text-right">Recibido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.items.map(i => (
                      <tr key={i.id} className="border-t">
                        <td className="px-3 py-2">
                          <span className="font-mono text-xs text-neutral-400 mr-2">{i.product_code}</span>
                          {i.product_name}
                        </td>
                        <td className="px-3 py-2 text-right">{i.quantity}</td>
                        {isAdmin && <td className="px-3 py-2 text-right">${fmt(i.unit_cost_usd)}</td>}
                        {isAdmin && <td className="px-3 py-2 text-right">${fmt(i.total_cost_usd)}</td>}
                        <td className="px-3 py-2 text-right">
                          {/* Una FINALIZADA está recibida al 100%, aunque el dato venga 0 (legacy/vía completa) */}
                          {i.total_received_qty || i.received_qty ||
                            (selected.status === 'FINALIZADA' ? i.quantity : 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Receive modal */}
      {showReceive && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b">
              <h2 className="font-semibold">Recibir mercancía</h2>
              <label className="text-xs mt-2 flex items-center gap-2">
                <input type="checkbox" checked={recvPartial} onChange={e => setRecvPartial(e.target.checked)} />
                Recepción parcial (carga inventario inmediatamente)
              </label>
            </div>
            <div className="p-4">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-xs text-neutral-500 uppercase">
                  <tr>
                    <th className="px-3 py-2 text-left">Producto</th>
                    <th className="px-3 py-2 text-right">Pedido</th>
                    <th className="px-3 py-2 text-right">Ya recibido</th>
                    <th className="px-3 py-2 text-right">A recibir</th>
                  </tr>
                </thead>
                <tbody>
                  {recvItems.map((it, idx) => (
                    <tr key={it.product_id} className="border-t">
                      <td className="px-3 py-2">
                        <span className="font-mono text-xs text-neutral-400 mr-2">{it.product_code}</span>
                        {it.product_name}
                      </td>
                      <td className="px-3 py-2 text-right">{it.expected}</td>
                      <td className="px-3 py-2 text-right text-neutral-500">{it.already_received}</td>
                      <td className="px-3 py-2 text-right">
                        <input type="number" min={0} value={it.received_qty} onKeyDown={blockIntKeys}
                          onChange={e => {
                            const next = [...recvItems]
                            next[idx].received_qty = parseInt(e.target.value) || 0
                            setRecvItems(next)
                          }}
                          className="w-20 border rounded px-2 py-1 text-sm text-right" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t flex justify-end gap-2 bg-neutral-50">
              <button onClick={() => setShowReceive(false)} className="btn-secondary text-sm">Cancelar</button>
              <button onClick={submitReceive} disabled={busy} className="btn-primary text-sm">Confirmar recepción</button>
            </div>
          </div>
        </div>
      )}

      {/* Payment modal */}
      {showPay && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="p-4 border-b">
              <h2 className="font-semibold">Registrar pago {showPay}%</h2>
            </div>
            <div className="p-4">
              <label className="text-xs text-neutral-500">
                Monto $ {showPay === '100' && selected?.paid_50_done ? '(lo que falta)' : '(sugerido)'}
              </label>
              <input type="number" step="0.01" min={0} value={payAmount} onKeyDown={blockNumberKeys} onChange={e => setPayAmount(e.target.value)}
                placeholder="0.00" autoFocus
                className="mt-1 w-full border rounded px-3 py-2 text-sm" />
              {selected && (
                <p className="mt-2 text-[11px] text-neutral-500 leading-relaxed">
                  {showPay === '50'
                    ? <>Sugerido: mitad del total (${fmt(selected.total_usd / 2)} de ${fmt(selected.total_usd)}). Es la plata que sale ahora; va a Finanzas, no cambia el costo del producto.</>
                    : selected.paid_50_done
                      ? <>Sugerido: el <b>restante</b> (${fmt(selected.total_usd)} total − ${fmt(selected.paid_50_amount)} ya pagado = ${fmt(Math.max(0, selected.total_usd - selected.paid_50_amount))}). Finanzas suma ambos pagos, por eso aquí va solo lo que falta.</>
                      : <>Sugerido: el total (${fmt(selected.total_usd)}), porque no hubo pago del 50%. Va a Finanzas como la plata que sale.</>}
                </p>
              )}
            </div>
            <div className="p-4 border-t flex justify-end gap-2 bg-neutral-50">
              <button onClick={closePay} className="btn-secondary text-sm">Cancelar</button>
              <button onClick={submitPayment} disabled={busy || !payAmount} className="btn-primary text-sm">Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* Inconsistente note modal */}
      {showIncNote && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="p-4 border-b">
              <h2 className="font-semibold">Marcar inconsistente</h2>
            </div>
            <div className="p-4">
              <label className="text-xs text-neutral-500">Nota (qué llegó incorrecto)</label>
              <textarea value={incNote} onChange={e => setIncNote(e.target.value)}
                rows={3} autoFocus
                className="mt-1 w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div className="p-4 border-t flex justify-end gap-2 bg-neutral-50">
              <button onClick={() => { setShowIncNote(false); setIncNote('') }} className="btn-secondary text-sm">Cancelar</button>
              <button onClick={() => finalize('INCONSISTENTE')} disabled={busy || !incNote.trim()} className="btn-danger text-sm">
                Confirmar inconsistente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <ImportsForm
          editing={editing}
          suppliers={suppliers}
          carriers={[...new Set(orders.map(o => o.origin_country).filter(Boolean) as string[])].sort()}
          onClose={() => { setShowForm(false); setEditing(null) }}
          onSaved={() => { setShowForm(false); setEditing(null); reload() }}
          onReload={reload}
          onContinue={async (oid) => {
            setShowForm(false); setEditing(null)
            const list: ImportOrder[] = await fetch('/api/imports').then(x => x.json())
            setOrders(list)
            const fresh = list.find(o => o.id === oid)
            if (fresh) setSelected(fresh)
          }}
        />
      )}
    </div>
  )
}
