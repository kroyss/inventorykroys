'use client'
import CorregirPedido, { NotaAjustes } from '@/components/ventas/CorregirPedido'
import AvisoReabrir from '@/components/ventas/AvisoReabrir'
import { LineaBancoVenta } from '@/components/ventas/LineaBanco'
import { useState, useEffect, useCallback, useRef } from 'react'
import type { Sale, SaleStatus, SaleItem, InventoryItem, UserRole, Country } from '@/lib/types'
import VentasForm from './VentasForm'
import PorConfirmar, { usePorConfirmar, pendientesPorConfirmar, NumeroBoton } from './PorConfirmar'
import FacturaForm from '@/components/facturas/FacturaForm'
import SalioMal from '@/components/facturas/SalioMal'
import MoverFactura from '@/components/facturas/MoverFactura'
import { useImprimirFactura } from '@/components/facturas/ImprimirAqui'
import { bs, type Invoice } from '@/lib/invoices'
import { Pagination, PageHeader, StatusBadge, chipCls, ESTADOS_VENTA_VE } from '@/components/ui'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { useRefetchOnFocus } from '@/lib/useRefetchOnFocus'
import { itemsTooltip } from '@/lib/itemsTooltip'
import { useDeepLinkParam } from '@/lib/useDeepLinkParam'
import { DateField } from '@/components/ui/DateField'

const PAGE_SIZE = 15

// Estados aceptados en ?estado= (deep-link desde las cards del dashboard)
const DEEP_LINK_STATUSES = [
  'BORRADOR', 'PAGO_VERIFICADO', 'PROCESADA',
  'DESCARGADA', 'DESCARGADA_LOCAL', 'REABIERTA',
] as const

const money = (n: number) =>
  Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const STATUS_BASE: Record<string, string> = {
  BORRADOR:         'Borrador',
  PAGO_VERIFICADO:  'Verificado',
  PROCESADA:        'Procesada',
  DESCARGADA:       'Descargada',
  DESCARGADA_LOCAL: 'Local entregada',
  REABIERTA:        'Reabierta',
}

const CHIP_BASE: Record<string, string> = {
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
  products: InventoryItem[]  // snapshot inicial cargado en el server
  userRole: UserRole
  country: Country
  facturas: boolean   // módulo Facturas (solo VE): sin él no se muestra el cuadro de factura
  porConfirmar: boolean   // cuentas de ML conectadas (módulo preguntas): pestaña "Por confirmar"
  pagoEnFila?: boolean   // cliente con inventario y Pagos ME (25-10): ✓ / ✗ del pago también en Por confirmar
  verificarPagos?: boolean   // VE: paso "Pago verificado" antes de procesar (módulo verificar_pagos; apagado = Inventario simple)
}

type Filter = 'all' | SaleStatus

const EMPTY_COUNTS: Counts = {
  all: 0, BORRADOR: 0, PAGO_VERIFICADO: 0, PROCESADA: 0,
  DESCARGADA: 0, DESCARGADA_LOCAL: 0, REABIERTA: 0,
}

export default function VentasClient({ products: initialProducts, userRole, country, facturas, porConfirmar, verificarPagos = true, pagoEnFila = false }: Props) {
  // VE sin verificar pagos: se procesa directo desde borrador (como CO, pero sin FLEX ni Excel).
  const directoVE = country === 'VE' && !verificarPagos
  // VE con el flujo completo: "Por despachar" / "Despachada" (ESTADOS_VENTA_VE); CO y VE simple quedan igual.
  const despachaVE = country === 'VE' && !directoVE
  const STATUS_LABELS = despachaVE ? { ...STATUS_BASE, ...ESTADOS_VENTA_VE } : STATUS_BASE
  const CHIP_LABELS = despachaVE ? { ...CHIP_BASE, ...ESTADOS_VENTA_VE } : CHIP_BASE
  // Por confirmar (2026-10-12): ventas de ML sin registrar; "Confirmar" abre el form con ese número.
  const [vistaPC, setVistaPC] = useState(false)
  const [numeroNuevo, setNumeroNuevo] = useState<string | null>(null)
  const pc = usePorConfirmar(porConfirmar)
  // El número del chip: solo las que tienen pago (las que hay que trabajar; 0 = al día). Sin Pagos ME, todas las vigentes.
  const pendientesPC = pendientesPorConfirmar(pc.datos)
  // Productos en estado (no solo el prop del server): se refrescan al volver el
  // foco a la pestaña, para detectar stock ajustado o productos nuevos creados
  // en paralelo sin recargar la página.
  const [products, setProducts] = useState<InventoryItem[]>(initialProducts)
  const refetchProducts = useCallback(async () => {
    try {
      const rows: InventoryItem[] = await fetch('/api/sales/products', { cache: 'no-store' }).then(r => r.json())
      if (Array.isArray(rows)) setProducts(rows)
    } catch { /* si falla, se queda con lo último cargado */ }
  }, [])

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
  // Al abrir el form, traer la lista más reciente (por si se creó un producto
  // o se ajustó stock desde otra pantalla antes de abrirlo); y mientras el form
  // esté abierto, refrescar al volver el foco a la pestaña. Sin form abierto no
  // se pide nada: la lista de productos no se usa en la vista de ventas.
  useEffect(() => { if (showForm) refetchProducts() }, [showForm, refetchProducts])
  useRefetchOnFocus(refetchProducts, showForm)
  const [editing, setEditing]   = useState<Sale | null>(null)
  const [selection, setSelection] = useState<Set<number>>(new Set())
  // Modo re-descarga: habilita seleccionar ventas YA descargadas para volver a
  // bajar su Excel (recuperación cuando una descarga anterior falló).
  const [redownloadMode, setRedownloadMode] = useState(false)
  const [busy, setBusy]         = useState(false)
  // Corregir pedido (mig. 108): ventana y versión de la nota (se relee al guardar).
  const [corrigePedido, setCorrigePedido] = useState(false)
  // 22-10: Reabrir pide confirmación (AvisoReabrir). soloCorregir: desde Despachos se abre Corregir pedido SIN la ficha detrás.
  const [avisoReabrir, setAvisoReabrir] = useState(false)
  const [soloCorregir, setSoloCorregir] = useState(false)
  const [ajustesVer, setAjustesVer] = useState(0)
  const [avisoAjuste, setAvisoAjuste] = useState<string | null>(null)
  const [error, setError]       = useState<string | null>(null)
  // Facturación (solo VE): facturas de la venta abierta y el form de "Facturar"
  const [saleInvoices, setSaleInvoices] = useState<Invoice[]>([])
  const [invoicing, setInvoicing] = useState(false)
  // 18-10: corregir la factura desde la misma venta (antes solo en Facturas; un usuario no lo encontró e hizo
  // una venta LOCAL repetida para poder facturar de nuevo → factura doble y stock descontado dos veces).
  const [corrigiendo, setCorrigiendo] = useState<Invoice | null>(null)
  const [salioMal, setSalioMal] = useState<Invoice | null>(null)            // pregunta qué pasó
  const [moviendo, setMoviendo] = useState<Invoice | null>(null)            // factura en la venta equivocada (27-10)
  const [movida, setMovida] = useState<string | null>(null)
  const [editandoFactura, setEditandoFactura] = useState<Invoice | null>(null)   // mismo número
  const { imprimir: verFactura, marco: marcoFactura } = useImprimirFactura()
  // Borrador autoguardado de "Facturar venta" (se llenó a medias y se sigue después)
  const [invoiceDraftAt, setInvoiceDraftAt] = useState<string | null>(null)

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
      if (salioMal)      { setSalioMal(null) }
      else if (corrigiendo) { setCorrigiendo(null) }
      else if (editandoFactura) { setEditandoFactura(null) }
      else if (invoicing) { setInvoicing(false) }
      else if (showForm) { setShowForm(false); setEditing(null); setNumeroNuevo(null) }
      else if (selected) { setSelected(null) }
    }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [showForm, selected, invoicing, corrigiendo, salioMal, editandoFactura])

  const selectedId = selected?.id
  const loadSaleInvoices = useCallback(async (saleId: number) => {
    const [rows, draft] = await Promise.all([
      fetch(`/api/invoices?sale_id=${saleId}`).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`/api/invoices/drafts/${saleId}`).then(r => r.ok ? r.json() : null).catch(() => null),
    ])
    setSaleInvoices(Array.isArray(rows) ? rows : [])
    setInvoiceDraftAt(draft?.updated_at ?? null)
  }, [])
  useEffect(() => {
    setSaleInvoices([])
    setInvoiceDraftAt(null)
    if (facturas && selectedId) loadSaleInvoices(selectedId)
  }, [country, selectedId, loadSaleInvoices])
  const activeInvoice = saleInvoices.find(i => i.status === 'EMITIDA') ?? null

  // Deep-links desde el dashboard: ?estado= aplica el chip, ?new=1 abre el form.
  // Con useSearchParams se re-aplica si cambia la URL sin desmontar la pantalla.
  const [urlEstado] = useDeepLinkParam('estado', DEEP_LINK_STATUSES)
  useEffect(() => { if (urlEstado) setFilter(urlEstado as Filter) }, [urlEstado])
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    if (q.get('new') === '1') {
      setEditing(null); setShowForm(true)
    } else if (q.get('vista') === 'confirmar' && porConfirmar) setVistaPC(true)
    // ?venta=<número> (desde Despachos → En espera → "Corregir pedido"): abre esa venta.
    // &editar=1 ("Editar venta →" en una fila del lote de Despachos, 22-10): venta PROCESADA → Corregir pedido directo
    // (no se reabre: sigue procesada y el stock se ajusta por la diferencia), sin la ficha detrás. Borrador → Editar venta.
    const venta = q.get('venta')?.trim()
    if (venta) {
      fetch(`/api/sales?search=${encodeURIComponent(venta)}&pageSize=5`).then(r => r.ok ? r.json() : null).then(async d => {
        const s = (d?.rows ?? d?.sales ?? []).find((x: Sale) => x.ml_order_number === venta)
        if (!s) return
        const fresh: Sale = await fetch(`/api/sales/${s.id}`).then(r => r.json())
        if (!fresh?.id) return
        if (q.get('editar') !== '1') { setSelected(fresh); return }
        if (['PROCESADA', 'DESCARGADA', 'DESCARGADA_LOCAL'].includes(fresh.status)) {
          setSelected(fresh); setSoloCorregir(true); setAvisoAjuste(null); setCorrigePedido(true); return
        }
        setSelected(null); setEditing(fresh); setShowForm(true)
      }).catch(() => {})
    }
  }, [])

  // Guard de "última petición": al entrar desde el dashboard salen dos consultas
  // casi juntas (la del montaje sin filtro y la del ?estado=), y al clickear un
  // chip se encima con la anterior. Sin esto, la respuesta vieja —normalmente la
  // de "todas", que es la más pesada y tarda más— pisaba a la filtrada y quedaba
  // el chip marcado con la lista completa. Solo se aplica la más reciente.
  const reqIdRef = useRef(0)

  const fetchSales = useCallback(async () => {
    const myId = ++reqIdRef.current
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
    if (myId !== reqIdRef.current) return   // respuesta obsoleta: la descarta
    setSales(res.rows)
    setCounts(res.counts ?? EMPTY_COUNTS)
    setTotal(res.total ?? 0)
    setLoading(false)
    // Keep the selected detail in sync if it's on this page
    setSelected(prev => prev ? (res.rows.find(s => s.id === prev.id) ?? prev) : null)
  }, [page, filter, search, dateFrom, dateTo, sortKey, sortDir])

  useEffect(() => { fetchSales() }, [fetchSales])
  // La pantalla se deja abierta todo el día: sin esto, la lista se queda con lo
  // que había al abrirla y no se ven las ventas que cargan los demás.
  useRefetchOnFocus(fetchSales, true, 60_000)

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

  // Datos mínimos para avanzar de estado (el servidor exige lo mismo). Sirve
  // sobre todo para ventas viejas, creadas cuando el cliente no era obligatorio.
  const missingToAdvance = !selected
    ? []
    : [
        ...(!selected.ml_order_number?.trim() ? ['número de orden'] : []),
        ...(!selected.customer_name?.trim()   ? ['cliente'] : []),
        ...(selected.items.length === 0       ? ['productos'] : []),
      ]
  const canAdvance = missingToAdvance.length === 0

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

  const exportIds = (ids: number[], redownload = false) => {
    if (ids.length === 0) return
    const link = document.createElement('a')
    link.href = `/api/sales/export-excel?ids=${ids.join(',')}${redownload ? '&redownload=1' : ''}`
    link.download = 'datos.xlsx'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setTimeout(reload, 1500)  // refleja el paso a DESCARGADA
    setSelection(new Set())
  }

  const exportSelected = () => exportIds(Array.from(selection), redownloadMode)

  // Export all PROCESADA across all pages — fetch their ids first
  const exportAllProcessed = async () => {
    const qs = new URLSearchParams({ page: '1', pageSize: '1000', status: 'PROCESADA' })
    const res: SalesResponse = await fetch(`/api/sales?${qs}`).then(r => r.json())
    exportIds(res.rows.map(s => s.id))
  }

  // Modo RE: re-descargar TODAS las DESCARGADA del rango de fechas (el servidor
  // arma el Excel con el filtro; no cambia estados). Sin búsqueda de texto, para
  // que el número del botón sea exactamente lo que baja.
  const canRedownloadRange = redownloadMode && !!dateFrom && !!dateTo && !search
    && counts.DESCARGADA > 0
  const redownloadRange = async () => {
    if (!await confirm({
      title: 'Re-descargar por fechas',
      message: `Se bajará el Excel de las ${counts.DESCARGADA} ventas DESCARGADA entre ${dateFrom} y ${dateTo}. No cambia el estado de ninguna.`,
      confirmText: 'Re-descargar',
    })) return
    const link = document.createElement('a')
    link.href = `/api/sales/export-excel?redownload=1&by_filter=1&date_from=${dateFrom}&date_to=${dateTo}`
    link.download = 'datos.xlsx'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const toggleSelection = (id: number) => {
    const next = new Set(selection)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelection(next)
  }

  const processableTotal = counts.PROCESADA
  const borradorCount    = counts.BORRADOR

  // TEMPORAL (sep 2026): en VE las etiquetas salen por Despachos, que pasa la venta
  // a DESCARGADA al imprimir. Bajar el Excel antes la marcaría DESCARGADA y su etiqueta
  // saldría como reimpresión (el Reportador no le escribe). Se ocultan los botones
  // (Procesadas, Exportar, RE, Re-descargar fechas) y las casillas; el código y
  // /api/sales/export-excel siguen. Si Despachos queda firme, borrar todo esto
  // (exportIds, exportAllProcessed, redownload*, selection) y la ruta del Excel.
  // CO no tiene Despachos: ahí se mantiene.
  const excelVisible = country !== 'VE'

  return (
    <div>
      <PageHeader title="Ventas" subtitle="Órdenes de MercadoLibre y ventas locales" actions={
        <>
          {/* Con ML conectado lo normal es confirmar las ventas que ya llegaron; "Nueva venta" queda para lo suelto (LOCAL…). */}
          {porConfirmar && (
            <button onClick={() => setVistaPC(true)} title="Ventas de MercadoLibre que todavía no están registradas"
              className="btn-secondary text-sm whitespace-nowrap">
              Por confirmar<NumeroBoton n={pendientesPC} cargando={!pc.datos} />
            </button>
          )}
          <button onClick={() => { setEditing(null); setShowForm(true) }}
            className={`${porConfirmar ? 'btn-secondary' : 'btn-primary'} text-sm whitespace-nowrap`}>
            Nueva venta
          </button>
        </>
      } />
      {error && (
        <div className="mb-3 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded">{error}</div>
      )}

      {/* Toolbar */}
      <div className="mb-4 space-y-2">
        {/* Fila 1: chips de estado */}
        <div className="flex flex-wrap gap-1.5">
          {porConfirmar && (
            <button onClick={() => setVistaPC(true)} title="Ventas de MercadoLibre que todavía no están registradas"
              className={vistaPC || !pendientesPC ? chipCls(vistaPC)
                : 'px-3 py-1 text-xs font-medium rounded-full border transition-colors whitespace-nowrap bg-amber-50 text-amber-900 border-amber-300 hover:border-amber-500'}>
              Por confirmar <span className={vistaPC ? 'text-white/60' : pendientesPC ? 'text-amber-600' : 'text-neutral-400'}>{pc.datos ? pendientesPC : '·'}</span>
            </button>
          )}
          {porConfirmar && <span className="mx-0.5 w-px self-stretch bg-neutral-200" aria-hidden="true" />}
          {(['all','BORRADOR','PAGO_VERIFICADO','PROCESADA','DESCARGADA','DESCARGADA_LOCAL'] as Filter[])
            .filter(f => (country !== 'CO' && !directoVE) || f !== 'PAGO_VERIFICADO')
            .map(f => {
            const count  = f === 'all' ? counts.all : counts[f as keyof Counts]
            const active = !vistaPC && filter === f
            return (
              <button key={f} onClick={() => { setVistaPC(false); setFilter(f) }}
                className={chipCls(active)}>
                {CHIP_LABELS[f]} <span className={active ? 'text-white/60' : 'text-neutral-400'}>{count}</span>
              </button>
            )
          })}
        </div>

        {/* Fila 2: búsqueda + fechas (izq) · acciones (der) — apila en mobile */}
        {!vistaPC && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="search"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Buscar…"
              className="border border-neutral-300 rounded-lg px-3 py-2 text-sm flex-1 min-w-0 sm:flex-none sm:w-44 focus:outline-none focus:ring-2 focus:ring-neutral-800"
            />
            <div className="flex items-center gap-1">
              <DateField value={dateFrom}
                max={dateTo || undefined}
                onChange={(v: string) => setDateFrom(v)}
                title="Desde"
                className="border border-neutral-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-800"
              />
              <span className="text-neutral-400 text-xs">–</span>
              <DateField value={dateTo}
                min={dateFrom || undefined}
                onChange={(v: string) => setDateTo(v)}
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
            {/* Modo RE (re-descarga de emergencia): recuperar guías ya descargadas.
                Va junto a las fechas para distinguirlo de las acciones normales. */}
            {excelVisible && <button
              onClick={() => { setRedownloadMode(m => !m); setSelection(new Set()) }}
              title="Emergencia: habilita seleccionar ventas ya descargadas para volver a bajar su Excel"
              className={`px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap border transition-colors ${
                redownloadMode
                  ? 'bg-amber-500 border-amber-500 text-white'
                  : 'bg-white border-neutral-300 text-neutral-600 hover:border-neutral-400'
              }`}>
              ↺ RE
            </button>}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {borradorCount > 0 && filter !== 'BORRADOR' && (
              <button onClick={() => setFilter('BORRADOR')}
                title="Hay ventas en borrador pendientes"
                className="px-3 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 whitespace-nowrap">
                ⚠ Borradores ({borradorCount})
              </button>
            )}
            {!excelVisible ? null : selection.size > 0 ? (
              <button onClick={exportSelected} className="btn-secondary text-sm whitespace-nowrap">
                {redownloadMode ? 'Re-descargar' : 'Exportar'} ({selection.size})
              </button>
            ) : canRedownloadRange ? (
              <button onClick={redownloadRange}
                title="Bajar el Excel de todas las ventas DESCARGADA del rango de fechas"
                className="px-3 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 whitespace-nowrap">
                ↺ Re-descargar fechas ({counts.DESCARGADA})
              </button>
            ) : !redownloadMode && processableTotal > 0 && (
              <button onClick={exportAllProcessed}
                className="btn-secondary text-sm whitespace-nowrap">
                ↓ Procesadas ({processableTotal})
              </button>
            )}
          </div>
        </div>
        )}
      </div>

      {vistaPC && (
        <PorConfirmar datos={pc.datos} onRecargar={pc.cargar}
          onConfirmar={n => { setNumeroNuevo(n); setEditing(null); setShowForm(true) }}
          onVerificarPago={pagoEnFila ? async (id, v) => {
            const r = await fetch('/api/pagos-me/verificar', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ids: [id], verificacion: v }) }).catch(() => null)
            if (!r?.ok) setError('No se pudo guardar la verificación del pago')
            await pc.cargar()
          } : undefined}
          onVerificarCargada={async id => {
            // Ya cargada con pago (22-10): la MISMA venta en Editar venta (no se crea otra), con su pago para verificar.
            const fresh: Sale = await fetch(`/api/sales/${id}`).then(r => r.json()).catch(() => null)
            if (fresh?.id) { setNumeroNuevo(null); setEditing(fresh); setShowForm(true) }
          }} />
      )}

      {/* Tabla (desktop) / tarjetas (mobile) */}
      {!vistaPC && <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
        <div className="hidden md:block overflow-x-auto">
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
                    className={`border-b border-neutral-50 hover:bg-neutral-50 cursor-pointer ${idx % 2 ? 'bg-neutral-50/40' : ''} ${selected?.id === s.id ? 'bg-lime-50/70' : ''}`}>
                    <td className="px-3 py-2 text-center" onClick={e => e.stopPropagation()}>
                      {excelVisible && (s.status === 'PROCESADA' || (redownloadMode && s.status === 'DESCARGADA')) && (
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
                      {s.notes && <span className="text-neutral-500 italic"> · {s.notes}</span>}
                    </td>
                    <td className="px-3 py-2 text-right text-neutral-600 whitespace-nowrap">
                      {s.items.reduce((a, i) => a + i.quantity, 0)}
                      <span className="text-neutral-300 text-xs"> / {s.items.length}</span>
                    </td>
                    <td className="px-3 py-2 text-right font-bold text-neutral-900 whitespace-nowrap">${money(s.total_amount)}</td>
                    <td className="px-3 py-2 text-right text-neutral-400 text-xs whitespace-nowrap">{date}</td>
                    <td className="px-3 py-2 text-center">
                      <StatusBadge status={s.status} label={STATUS_LABELS[s.status]} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Tarjetas (mobile) — misma data que la tabla, en formato apto para teléfono */}
        <div className="md:hidden divide-y divide-neutral-100">
          {loading && (
            <div className="px-4 py-8 text-center text-neutral-400 text-sm">Cargando…</div>
          )}
          {!loading && sales.length === 0 && (
            <div className="px-4 py-8 text-center text-neutral-400 text-sm">Sin ventas</div>
          )}
          {!loading && sales.map(s => {
            const date = s.created_at ? new Date(s.created_at).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' }) : ''
            const units = s.items.reduce((a, i) => a + i.quantity, 0)
            const prods = s.items.map(i => `${i.product_name} ×${i.quantity}`).join(' · ')
            const selectable = excelVisible && (s.status === 'PROCESADA' || (redownloadMode && s.status === 'DESCARGADA'))
            return (
              <div key={s.id} onClick={() => setSelected(s)}
                className={`px-4 py-3 active:bg-neutral-50 cursor-pointer ${selected?.id === s.id ? 'bg-lime-50/70' : ''}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {selectable && (
                      <input type="checkbox" checked={selection.has(s.id)}
                        onClick={e => e.stopPropagation()} onChange={() => toggleSelection(s.id)}
                        className="shrink-0" />
                    )}
                    <span className="font-mono text-xs font-bold text-neutral-900 truncate">{s.ml_order_number}</span>
                  </div>
                  <span className="shrink-0"><StatusBadge status={s.status} label={STATUS_LABELS[s.status]} /></span>
                </div>
                <div className="mt-1 text-sm text-neutral-700 truncate">{s.customer_name || '—'}</div>
                {prods && <div className="mt-0.5 text-xs text-neutral-500 truncate">{prods}</div>}
                <div className="mt-1.5 flex items-center justify-between text-xs">
                  <span className="font-bold text-neutral-900">${money(s.total_amount)}</span>
                  <span className="text-neutral-400">{units} u · {date}</span>
                </div>
              </div>
            )
          })}
        </div>

        <Pagination total={total} page={page} pageSize={PAGE_SIZE} onChange={setPage} />
      </div>}

      {/* Slide-over detalle */}
      {selected && !soloCorregir && (
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
                  <StatusBadge status={selected.status} label={STATUS_LABELS[selected.status]} />
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
                  <div className="text-neutral-500 italic whitespace-pre-line">{selected.notes}</div>
                </div>
              )}
            </div>

            <div className="px-4 py-3 flex-1 overflow-y-auto">
              {facturas && (
                <div className="mb-4 rounded-lg border border-neutral-200 px-3 py-2 text-sm">
                  {activeInvoice ? (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold">🧾 Factura #{activeInvoice.invoice_number}</div>
                          <div className="text-xs text-neutral-500 truncate">
                            {activeInvoice.customer_name} · Bs {bs(activeInvoice.total_bs)}
                            {activeInvoice.retention_status === 'PENDIENTE' && <span className="text-amber-700"> · retención pendiente</span>}
                          </div>
                          {/* Factura de varias ventas (mig 114): con cuáles va junta esta. */}
                          {(() => {
                            const juntas = [activeInvoice.sale_order_number, ...(activeInvoice.otras_ventas ?? []).map(v => v.ml_order_number)]
                              .filter((n): n is string => !!n && n !== selected.ml_order_number)
                            return juntas.length > 0 && (
                              <div className="text-[11px] text-neutral-500">Junto con {juntas.length === 1 ? 'la venta' : `${juntas.length} ventas`}: <span className="font-mono">{juntas.join(', ')}</span></div>
                            )
                          })()}
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button onClick={() => verFactura(activeInvoice.id)} className="btn-secondary text-xs">Imprimir</button>
                          <a href={`/facturas?id=${activeInvoice.id}`} className="btn-secondary text-xs">Ver</a>
                        </div>
                      </div>
                      <div className="mt-2 pt-2 border-t border-neutral-100 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] text-neutral-500">¿Un dato mal, no salió o se dañó la hoja? No hagas otra venta:</span>
                        <button onClick={() => setSalioMal(activeInvoice)} className="btn-warning text-xs">¿Salió mal?</button>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      {invoiceDraftAt ? (
                        <span className="text-xs text-amber-700">
                          Factura a medio llenar · {new Date(invoiceDraftAt).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      ) : (
                        <span className="text-xs text-neutral-500">Sin factura</span>
                      )}
                      <button onClick={() => setInvoicing(true)} className="btn-secondary text-xs">
                        {invoiceDraftAt ? 'Continuar factura' : 'Facturar'}
                      </button>
                    </div>
                  )}
                  {saleInvoices.some(i => i.status === 'ANULADA') && (
                    <div className="mt-1 text-[11px] text-neutral-400">
                      Anuladas: {saleInvoices.filter(i => i.status === 'ANULADA').map(i => `#${i.invoice_number}`).join(', ')}
                    </div>
                  )}
                </div>
              )}
              {/* Lo que dijo el banco de su pago (Comprobar con el banco, mig. 110): para "Verificar pago". */}
              {porConfirmar && !selected.ml_order_number.startsWith('LOCAL-') && ['BORRADOR', 'REABIERTA', 'PAGO_VERIFICADO'].includes(selected.status) && (
                <LineaBancoVenta key={selected.ml_order_number} venta={selected.ml_order_number} />
              )}
              <NotaAjustes saleId={selected.id} version={ajustesVer} />
              {avisoAjuste && <div className="mb-3 rounded border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">{avisoAjuste}</div>}
              <div className="text-xs text-neutral-500 mb-2">Productos ({selected.items.length})</div>
              <div className="space-y-1">
                {selected.items.map((i: SaleItem) => (
                  <div key={i.id} className="flex justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <span className="text-neutral-400 mr-2">{i.product_code}</span>
                      {i.product_name}
                    </div>
                    <div className="shrink-0 whitespace-nowrap">{i.quantity} × ${money(i.unit_price)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 border-t flex flex-wrap gap-2 shrink-0 bg-neutral-50">
              {!canAdvance && ['BORRADOR','REABIERTA','PAGO_VERIFICADO'].includes(selected.status) && (
                <div className="w-full text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                  ⚠️ Falta {missingToAdvance.join(', ')}. Editá la venta para poder avanzarla.
                </div>
              )}
              {(selected.status === 'BORRADOR' || selected.status === 'REABIERTA') && (
                <>
                  {selected.status === 'BORRADOR' && (
                    <button onClick={deleteSale} disabled={busy} className="btn-danger text-sm">Eliminar</button>
                  )}
                  <button onClick={() => { setEditing(selected); setShowForm(true) }} className="btn-secondary text-sm">Editar</button>
                  {selected.ml_order_number.startsWith('LOCAL-') ? (
                    // LOCAL: salta a entregada (descuenta inventario) en un paso
                    <button onClick={() => doAction('PAGO_VERIFICADO')} disabled={busy || !canAdvance} className="btn-primary text-sm">
                      {country === 'CO' || directoVE ? 'Entregar' : 'Verificar y entregar'}
                    </button>
                  ) : directoVE ? (
                    <button onClick={() => doAction('PROCESADA')} disabled={busy || !canAdvance} className="btn-primary text-sm">Procesar</button>
                  ) : country === 'CO' ? (
                    // CO: sin verificar pago. El FLEX se marca al crear la venta:
                    // FLEX → PROCESADA (espera Excel); no FLEX → DESCARGADA directo
                    <button
                      onClick={() => selected.is_flex ? doAction('PROCESADA') : doAction('DESCARGADA')}
                      disabled={busy || !canAdvance} className="btn-primary text-sm">
                      {selected.is_flex ? 'Procesar (FLEX)' : 'Procesar → Descargada'}
                    </button>
                  ) : (
                    <button onClick={() => doAction('PAGO_VERIFICADO')} disabled={busy || !canAdvance} className="btn-primary text-sm">Verificar pago</button>
                  )}
                </>
              )}
              {!['BORRADOR','REABIERTA'].includes(selected.status) && (
                // Gris claro (22-10): es una vuelta atrás poco frecuente, no la acción principal; antes de reabrir, el aviso.
                <button onClick={() => setAvisoReabrir(true)} disabled={busy}
                  className="rounded-lg border border-neutral-200 bg-neutral-100 px-3 py-1.5 text-sm font-medium text-neutral-600 hover:border-neutral-300 hover:bg-neutral-200 disabled:opacity-50">Reabrir</button>
              )}
              {selected.status === 'PAGO_VERIFICADO' && (
                <button onClick={() => doAction('PROCESADA')} disabled={busy || !canAdvance} className="btn-primary text-sm">Procesar</button>
              )}
              {['PROCESADA','DESCARGADA','DESCARGADA_LOCAL'].includes(selected.status) && (
                <button onClick={() => { setAvisoAjuste(null); setCorrigePedido(true) }} disabled={busy}
                  title="Cambio de última hora (otro color, algo más, error al procesar): se corrige esta venta y el inventario se ajusta solo"
                  className="btn-secondary text-sm">Corregir pedido</button>
              )}
              {['PROCESADA','DESCARGADA','DESCARGADA_LOCAL'].includes(selected.status) && (
                <button onClick={() => setSelected(null)} className="btn-secondary text-sm">Salir</button>
              )}
              {['DESCARGADA','DESCARGADA_LOCAL'].includes(selected.status) && (
                <button onClick={() => { setSelected(null); setEditing(null); setShowForm(true) }} className="btn-primary text-sm">Nueva</button>
              )}
            </div>
          </div>
        </div>
      )}

      {corrigePedido && selected && (
        <CorregirPedido saleId={selected.id} orden={selected.ml_order_number} items={selected.items} notaVenta={selected.notes ?? null} products={products}
          facturaEmitida={activeInvoice ? String(activeInvoice.invoice_number) : null}
          onCerrar={() => { setCorrigePedido(false); if (soloCorregir) { setSoloCorregir(false); setSelected(null) } }}
          onListo={async msg => {
            setCorrigePedido(false); setSoloCorregir(false); setAvisoAjuste(msg); setAjustesVer(v => v + 1)
            const fresh: Sale = await fetch(`/api/sales/${selected.id}`).then(r => r.json())
            if (fresh?.id) setSelected(fresh)
            reload(); refetchProducts()
          }} />
      )}

      {avisoReabrir && selected && (
        <AvisoReabrir orden={selected.ml_order_number} guiaImpresa={!!selected.guia_impresa}
          factura={activeInvoice ? String(activeInvoice.invoice_number) : null}
          puedeCorregir={['PROCESADA', 'DESCARGADA', 'DESCARGADA_LOCAL'].includes(selected.status)}
          busy={busy} onCancelar={() => setAvisoReabrir(false)}
          onCorregir={() => { setAvisoReabrir(false); setAvisoAjuste(null); setCorrigePedido(true) }}
          onReabrir={async () => { await doAction('REABIERTA'); setAvisoReabrir(false) }} />
      )}

      {invoicing && selected && (
        <FacturaForm
          sale={selected}
          onClose={() => {
            setInvoicing(false)
            // el form manda lo pendiente al cerrarse; se relee un instante después
            const id = selected.id
            setTimeout(() => loadSaleInvoices(id), 600)
          }}
          onSaved={() => loadSaleInvoices(selected.id)}
        />
      )}

      {salioMal && (
        <SalioMal invoice={salioMal} onCerrar={() => setSalioMal(null)} onElegir={a => {
          const inv = salioMal
          setSalioMal(null)
          if (a === 'mismo') setEditandoFactura(inv)
          else if (a === 'nueva') setCorrigiendo(inv)
          else if (a === 'venta') setMoviendo(inv)
          else verFactura(inv.id)
        }} />
      )}
      {moviendo && (
        <MoverFactura invoice={moviendo} onCerrar={() => setMoviendo(null)} onMovida={r => {
          setMoviendo(null)
          setMovida(`La factura #${moviendo.invoice_number} pasó a la venta ${r.a}. La venta ${r.de ?? ''} quedó sin factura: si no se va a hacer, elimínala.`)
          if (selected) loadSaleInvoices(selected.id)
          fetchSales()
        }} />
      )}
      {movida && (
        <div className="fixed bottom-4 left-1/2 z-[80] w-[min(92vw,32rem)] -translate-x-1/2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 shadow-lg">
          <div className="flex items-start gap-3">
            <span className="flex-1">{movida}</span>
            <button onClick={() => setMovida(null)} className="text-emerald-700 hover:text-emerald-900">×</button>
          </div>
        </div>
      )}
      {marcoFactura}

      {editandoFactura && selected && (
        <FacturaForm
          edita={editandoFactura}
          onClose={() => {
            setEditandoFactura(null)
            const id = selected.id
            setTimeout(() => loadSaleInvoices(id), 600)
          }}
          onSaved={() => loadSaleInvoices(selected.id)}
        />
      )}

      {corrigiendo && selected && (
        <FacturaForm
          replaces={corrigiendo}
          onClose={() => {
            setCorrigiendo(null)
            const id = selected.id
            setTimeout(() => loadSaleInvoices(id), 600)
          }}
          onSaved={() => loadSaleInvoices(selected.id)}
        />
      )}

      {showForm && (
        <VentasForm
          editing={editing}
          products={products}
          country={country}
          procesaDirecto={directoVE}
          numeroInicial={editing ? undefined : numeroNuevo ?? undefined}
          onClose={() => { setShowForm(false); setEditing(null); setNumeroNuevo(null) }}
          onSaved={() => { setShowForm(false); setEditing(null); setNumeroNuevo(null); reload(); pc.cargar() }}
          onContinue={async (id) => {
            setShowForm(false); setEditing(null); setNumeroNuevo(null); pc.cargar()
            const fresh: Sale = await fetch(`/api/sales/${id}`).then(r => r.json())
            if (fresh?.id) setSelected(fresh)
            reload()
          }}
        />
      )}
    </div>
  )
}
