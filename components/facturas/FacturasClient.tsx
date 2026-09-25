'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { UserRole } from '@/lib/types'
import { bs, fmtDate, type Invoice } from '@/lib/invoices'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import NumberInput from '@/components/ui/NumberInput'
import FacturaForm from './FacturaForm'

type Filter = 'all' | 'EMITIDA' | 'ANULADA' | 'RET_PENDIENTE'
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all',           label: 'Todas' },
  { key: 'EMITIDA',       label: 'Emitidas' },
  { key: 'ANULADA',       label: 'Anuladas' },
  { key: 'RET_PENDIENTE', label: 'Retención pendiente' },
]

const RET_LABEL: Record<string, string> = { PENDIENTE: 'Retención pendiente', RECIBIDA: 'Retención recibida' }

export default function FacturasClient({ userRole }: { userRole: UserRole }) {
  const isAdmin = userRole === 'admin'
  const [rows, setRows]         = useState<Invoice[]>([])
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState<Filter>('all')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch]     = useState('')
  const [selected, setSelected] = useState<Invoice | null>(null)
  const [reemit, setReemit]     = useState<Invoice | null>(null)
  const [showConfig, setShowConfig] = useState(false)
  // Cambia cada vez que llega una versión nueva del detalle → remonta el panel con los datos frescos
  const [detailVersion, setDetailVersion] = useState(0)

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const reqId = useRef(0)
  const load = useCallback(async () => {
    const my = ++reqId.current
    const qs = new URLSearchParams()
    if (filter === 'EMITIDA' || filter === 'ANULADA') qs.set('status', filter)
    if (filter === 'RET_PENDIENTE') qs.set('retention', 'PENDIENTE')
    if (search) qs.set('search', search)
    const data = await fetch(`/api/invoices?${qs}`).then(r => r.json()).catch(() => [])
    if (my !== reqId.current) return
    setRows(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [filter, search])
  useEffect(() => { load() }, [load])

  const openDetail = useCallback(async (id: number) => {
    const inv = await fetch(`/api/invoices/${id}`).then(r => r.json()).catch(() => null)
    if (inv?.id) { setSelected(inv); setDetailVersion(v => v + 1) }
  }, [])

  // Deep-link desde Ventas: /facturas?id=123
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('id')
    if (!id || !/^\d+$/.test(id)) return
    fetch(`/api/invoices/${id}`).then(r => r.json()).then(inv => { if (inv?.id) setSelected(inv) }).catch(() => {})
  }, [])

  // Esc cierra lo que esté arriba
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (reemit) setReemit(null)
      else if (showConfig) setShowConfig(false)
      else if (selected) setSelected(null)
    }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [reemit, showConfig, selected])

  const pendingRet = rows.filter(r => r.status === 'EMITIDA' && r.retention_status === 'PENDIENTE')

  return (
    <div>
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex flex-wrap gap-1.5 bg-white rounded-xl border border-neutral-200 shadow-sm p-2">
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-1 rounded-full border text-xs whitespace-nowrap ${
                filter === f.key ? 'bg-neutral-900 border-neutral-900 text-white' : 'bg-white border-neutral-200 text-neutral-600 hover:border-neutral-400'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input type="search" value={searchInput} onChange={e => setSearchInput(e.target.value)}
            placeholder="N°, cliente, RIF u orden…"
            className="border border-neutral-300 rounded-lg px-3 py-2 text-sm w-full sm:w-60 focus:outline-none focus:ring-2 focus:ring-neutral-800" />
          <a href="/factura/prueba" target="_blank" rel="noreferrer" className="btn-secondary text-sm whitespace-nowrap">Hoja de prueba</a>
          {isAdmin && (
            <button onClick={() => setShowConfig(true)} className="btn-secondary text-sm whitespace-nowrap">Configuración</button>
          )}
        </div>
      </div>

      {filter === 'RET_PENDIENTE' && pendingRet.length > 0 && (
        <div className="mb-3 text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-2">
          {pendingRet.length} {pendingRet.length === 1 ? 'factura espera' : 'facturas esperan'} comprobante de retención ·
          Bs {bs(pendingRet.reduce((a, r) => a + r.retention_bs, 0))} retenidos sin respaldo todavía.
        </div>
      )}

      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-500">
              <tr className="border-b border-neutral-100">
                <th className="px-3 py-2 text-left">N°</th>
                <th className="px-3 py-2 text-left">Fecha</th>
                <th className="px-3 py-2 text-left">Cliente</th>
                <th className="px-3 py-2 text-left hidden md:table-cell">Venta</th>
                <th className="px-3 py-2 text-right">Total Bs</th>
                <th className="px-3 py-2 text-center">Estado</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="px-3 py-8 text-center text-neutral-400">Cargando…</td></tr>}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-neutral-400">
                  Sin facturas. Se emiten desde Ventas → abrir la venta → “Facturar”.
                </td></tr>
              )}
              {!loading && rows.map(r => (
                <tr key={r.id} onClick={() => openDetail(r.id)}
                  className={`border-b border-neutral-50 hover:bg-neutral-50 cursor-pointer ${r.status === 'ANULADA' ? 'text-neutral-400' : ''} ${selected?.id === r.id ? 'bg-blue-50' : ''}`}>
                  <td className="px-3 py-2 font-mono font-bold">{r.invoice_number}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.invoice_date)}</td>
                  <td className="px-3 py-2 max-w-[16rem] truncate">
                    {r.customer_name}
                    {r.customer_doc && <span className="text-xs text-neutral-400 ml-1">{r.customer_doc}</span>}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs hidden md:table-cell">{r.sale_order_number ?? '—'}</td>
                  <td className={`px-3 py-2 text-right tabular-nums whitespace-nowrap ${r.status === 'ANULADA' ? 'line-through' : 'font-semibold'}`}>{bs(r.total_bs)}</td>
                  <td className="px-3 py-2 text-center whitespace-nowrap">
                    {r.status === 'ANULADA' ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-red-50 text-red-700">Anulada</span>
                    ) : r.retention_status !== 'NO_APLICA' ? (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] ${r.retention_status === 'PENDIENTE' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}>
                        {RET_LABEL[r.retention_status]}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-neutral-100 text-neutral-700">Emitida</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <InvoiceDetail
          key={`${selected.id}-${detailVersion}`}
          invoice={selected}
          onClose={() => setSelected(null)}
          onChanged={inv => { setSelected(inv); setDetailVersion(v => v + 1); load() }}
          onReemit={() => setReemit(selected)}
          onOpen={openDetail}
        />
      )}

      {reemit && (
        <FacturaForm
          replaces={reemit}
          onClose={() => setReemit(null)}
          onSaved={inv => { load(); openDetail(inv.id) }}
        />
      )}

      {showConfig && <ConfigPanel onClose={() => setShowConfig(false)} />}
    </div>
  )
}

// ─── Detalle ────────────────────────────────────────────────────────────────

function InvoiceDetail({ invoice: inv, onClose, onChanged, onReemit, onOpen }: {
  invoice: Invoice
  onClose: () => void
  onChanged: (inv: Invoice) => void
  onReemit: () => void
  onOpen: (id: number) => void
}) {
  const confirm = useConfirm()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [control, setControl] = useState(inv.control_number ?? '')
  const [voucher, setVoucher] = useState(inv.retention_voucher ?? '')
  const [retDate, setRetDate] = useState(inv.retention_date ?? '')
  const [retAmount, setRetAmount] = useState(inv.retention_amount_bs ?? inv.retention_bs)
  const [voiding, setVoiding] = useState(false)
  const [voidReason, setVoidReason] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const refresh = async () => {
    const fresh = await fetch(`/api/invoices/${inv.id}`).then(r => r.json())
    if (fresh?.id) onChanged(fresh)
  }

  const put = async (body: Record<string, unknown>) => {
    setBusy(true); setError(null)
    const res = await fetch(`/api/invoices/${inv.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    setBusy(false)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setError(data.error ?? 'Error'); return }
    await refresh()
  }

  const doVoid = async () => {
    if (!voidReason.trim()) { setError('Indicá el motivo de la anulación'); return }
    if (!await confirm({
      title: `Anular factura #${inv.invoice_number}`,
      message: 'Queda en la lista como ANULADA y su número no se vuelve a usar. La venta queda libre para facturarla de nuevo.',
      confirmText: 'Anular', danger: true,
    })) return
    setBusy(true); setError(null)
    const res = await fetch(`/api/invoices/${inv.id}/void`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: voidReason }),
    })
    setBusy(false)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setError(data.error ?? 'Error'); return }
    await refresh()
  }

  const upload = async (files: FileList | File[]) => {
    setBusy(true); setError(null)
    for (const f of Array.from(files)) {
      const fd = new FormData()
      fd.append('file', f)
      const res = await fetch(`/api/invoices/${inv.id}/files`, { method: 'POST', body: fd })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? `No se pudo subir ${f.name}`)
      }
    }
    setBusy(false)
    await refresh()
  }

  const removeFile = async (fileId: number, fileName: string) => {
    if (!await confirm({ title: 'Quitar comprobante', message: `¿Quitar ${fileName}?`, confirmText: 'Quitar', danger: true })) return
    await fetch(`/api/invoices/${inv.id}/files/${fileId}`, { method: 'DELETE' })
    await refresh()
  }

  // Pegar una captura del comprobante con Ctrl+V mientras el detalle está abierto
  const hasRetention = inv.retention_status !== 'NO_APLICA'
  useEffect(() => {
    if (!hasRetention) return
    const h = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return
      const files = Array.from(e.clipboardData?.files ?? [])
      if (files.length) { e.preventDefault(); upload(files) }
    }
    document.addEventListener('paste', h)
    return () => document.removeEventListener('paste', h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasRetention, inv.id])

  const voided = inv.status === 'ANULADA'

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-lg bg-white shadow-2xl flex flex-col">
        <div className="p-4 border-b shrink-0">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-sm text-neutral-500">Factura</div>
              <div className="text-2xl font-bold font-mono">#{inv.invoice_number}</div>
            </div>
            <div className="flex items-center gap-2">
              {voided
                ? <span className="px-2 py-1 rounded text-xs bg-red-50 text-red-700">ANULADA</span>
                : <span className="px-2 py-1 rounded text-xs bg-neutral-100 text-neutral-700">Emitida</span>}
              <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 text-xl leading-none">×</button>
            </div>
          </div>
          {voided && (
            <div className="mt-2 text-xs bg-red-50 border border-red-200 text-red-800 rounded px-2 py-1.5">
              Anulada {inv.voided_by ? `por ${inv.voided_by}` : ''}: {inv.void_reason}
              {inv.replaced_by && inv.replaced_by_number && (
                <> · Reemplazada por <button onClick={() => onOpen(inv.replaced_by!)} className="underline font-semibold">#{inv.replaced_by_number}</button></>
              )}
            </div>
          )}
          {inv.replaces_number && (
            <div className="mt-2 text-xs text-neutral-500">Reemplaza a la #{inv.replaces_number} (anulada).</div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded">{error}</div>}

          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <div><div className="text-neutral-500">Fecha</div><div className="font-medium">{fmtDate(inv.invoice_date)}</div></div>
            <div><div className="text-neutral-500">Venta</div><div className="font-mono">{inv.sale_order_number ?? '—'}</div></div>
            <div className="col-span-2"><div className="text-neutral-500">Cliente</div>
              <div className="font-medium">{inv.customer_name}</div>
              <div className="text-neutral-500">
                {inv.customer_doc || 'Consumidor final'}
                {inv.customer_phone && ` · ${inv.customer_phone}`}
              </div>
              {inv.customer_address && <div className="text-neutral-500">{inv.customer_address}</div>}
            </div>
            <div><div className="text-neutral-500">Tasa</div><div>{bs(inv.exchange_rate)} Bs/$</div></div>
            <div><div className="text-neutral-500">Emitida por</div><div>{inv.created_by ?? '—'}</div></div>
            <div><div className="text-neutral-500">Impresiones</div><div>{inv.print_count}</div></div>
          </div>

          <div className="border rounded-lg divide-y">
            {inv.items.map((it, k) => (
              <div key={k} className="flex justify-between gap-2 px-3 py-1.5">
                <span className="min-w-0 truncate">{it.description}</span>
                <span className="shrink-0 tabular-nums text-neutral-600">{it.quantity} × {bs(it.unit_price_bs)}</span>
              </div>
            ))}
            <div className="px-3 py-2 space-y-0.5 tabular-nums bg-neutral-50">
              <div className="flex justify-between"><span className="text-neutral-500">Monto base</span><span>{bs(inv.base_bs)}</span></div>
              <div className="flex justify-between"><span className="text-neutral-500">IVA ({inv.iva_rate}%)</span><span>{bs(inv.iva_bs)}</span></div>
              <div className="flex justify-between font-semibold"><span>Total a pagar</span><span>Bs {bs(inv.total_bs)}</span></div>
            </div>
          </div>

          {/* N° de control de la hoja */}
          <div>
            <label className="text-xs text-neutral-500">N° de control (hoja preimpresa)</label>
            <div className="flex gap-2 mt-1">
              <input value={control} onChange={e => setControl(e.target.value)} placeholder="Opcional"
                className="flex-1 border border-neutral-300 rounded px-3 py-1.5 text-sm" />
              {control !== (inv.control_number ?? '') && (
                <button onClick={() => put({ control_number: control })} disabled={busy} className="btn-secondary text-xs">Guardar</button>
              )}
            </div>
          </div>

          {/* Retención */}
          {hasRetention && (
            <div className={`rounded-lg border p-3 space-y-3 ${inv.retention_status === 'PENDIENTE' ? 'border-amber-300 bg-amber-50/50' : 'border-green-300 bg-green-50/50'}`}>
              <div className="flex items-center justify-between">
                <div className="font-semibold">Retención de IVA ({inv.retention_percent}%)</div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] ${inv.retention_status === 'PENDIENTE' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}>
                  {inv.retention_status === 'PENDIENTE' ? 'Esperando comprobante' : 'Comprobante recibido'}
                </span>
              </div>
              <div className="text-xs tabular-nums space-y-0.5">
                <div className="flex justify-between"><span className="text-neutral-500">Retención calculada</span><span>Bs {bs(inv.retention_bs)}</span></div>
                <div className="flex justify-between font-semibold"><span>Neto a cobrar</span><span>Bs {bs(inv.total_bs - inv.retention_bs)}</span></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <label className="text-xs text-neutral-500">N° de comprobante</label>
                  <input value={voucher} onChange={e => setVoucher(e.target.value)} placeholder="Ej: 20260900000123"
                    className="mt-1 w-full border border-neutral-300 rounded px-3 py-1.5 text-sm font-mono" />
                </div>
                <div>
                  <label className="text-xs text-neutral-500">Fecha comprobante</label>
                  <input type="date" value={retDate} onChange={e => setRetDate(e.target.value)}
                    className="mt-1 w-full border border-neutral-300 rounded px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-neutral-500">Monto retenido (Bs)</label>
                  <NumberInput value={retAmount} onValueChange={setRetAmount}
                    className="mt-1 w-full border border-neutral-300 rounded px-2 py-1.5 text-sm text-right" />
                </div>
              </div>
              {Math.abs(retAmount - inv.retention_bs) > 0.01 && (
                <p className="text-[11px] text-amber-700">El monto del comprobante no coincide con el calculado (Bs {bs(inv.retention_bs)}).</p>
              )}
              <button disabled={busy}
                onClick={() => put({ retention: { voucher: voucher.trim(), date: retDate || null, amount_bs: retAmount } })}
                className="btn-primary text-xs">
                Guardar comprobante
              </button>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-neutral-500">Archivo del comprobante (imagen o PDF)</span>
                  <button onClick={() => fileRef.current?.click()} disabled={busy} className="text-xs underline">+ Adjuntar</button>
                  <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple className="hidden"
                    onChange={e => { if (e.target.files?.length) upload(e.target.files); e.target.value = '' }} />
                </div>
                {(inv.files ?? []).length === 0 ? (
                  <p className="text-[11px] text-neutral-400">Sin archivos. También podés pegar una captura con Ctrl+V.</p>
                ) : (
                  <ul className="space-y-1">
                    {inv.files!.map(f => (
                      <li key={f.id} className="flex items-center justify-between gap-2 text-xs bg-white border rounded px-2 py-1">
                        <a href={`/api/invoices/${inv.id}/files/${f.id}`} target="_blank" rel="noreferrer" className="truncate underline">
                          {f.file_name}
                        </a>
                        <span className="shrink-0 text-neutral-400">{f.file_size_kb} KB</span>
                        <button onClick={() => removeFile(f.id, f.file_name)} className="shrink-0 text-neutral-400 hover:text-red-600">×</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {inv.notes && <div className="text-xs"><div className="text-neutral-500">Notas</div><div>{inv.notes}</div></div>}

          {voiding && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-2">
              <p className="text-xs text-red-800">
                Anular sin reemplazo: usalo si la factura no debía emitirse (venta equivocada, datos del cliente mal).
                Si solo se dañó la hoja, usá “Reimprimir en hoja nueva”.
              </p>
              <input value={voidReason} onChange={e => setVoidReason(e.target.value)} placeholder="Motivo de la anulación"
                className="w-full border border-neutral-300 rounded px-3 py-1.5 text-sm" />
              <div className="flex gap-2">
                <button onClick={doVoid} disabled={busy} className="btn-danger text-xs">Anular factura</button>
                <button onClick={() => setVoiding(false)} className="btn-secondary text-xs">Cancelar</button>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t flex flex-wrap gap-2 shrink-0 bg-neutral-50">
          <a href={`/factura/${inv.id}${voided ? '' : '?print=1'}`} target="_blank" rel="noreferrer"
            className={voided ? 'btn-secondary text-sm' : 'btn-primary text-sm'}>
            {voided ? 'Ver hoja' : inv.print_count > 0 ? 'Reimprimir (mismo N°)' : 'Imprimir'}
          </a>
          {!voided && (
            <>
              <button onClick={onReemit} className="btn-warning text-sm" title="La hoja preimpresa se dañó: anula esta y emite otra con el siguiente número">
                Reimprimir en hoja nueva
              </button>
              {!voiding && <button onClick={() => setVoiding(true)} className="btn-secondary text-sm">Anular</button>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Configuración (admin) ──────────────────────────────────────────────────

function ConfigPanel({ onClose }: { onClose: () => void }) {
  const [loaded, setLoaded] = useState(false)
  const [start, setStart] = useState(1)
  const [next, setNext]   = useState(1)
  const [iva, setIva]     = useState(16)
  const [ox, setOx]       = useState(0)
  const [oy, setOy]       = useState(0)
  const [cx, setCx]       = useState(0)
  const [cy, setCy]       = useState(0)
  const [msg, setMsg]     = useState<string | null>(null)
  const [busy, setBusy]   = useState(false)

  useEffect(() => {
    fetch('/api/invoices/config').then(r => r.json()).then(c => {
      setStart(c.start_number); setNext(c.next_number); setIva(c.iva); setOx(c.offset_x); setOy(c.offset_y); setCx(c.copy_offset_x); setCy(c.copy_offset_y)
      setLoaded(true)
    })
  }, [])

  const save = async () => {
    setBusy(true); setMsg(null)
    const res = await fetch('/api/invoices/config', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ start_number: start, iva, offset_x: ox, offset_y: oy, copy_offset_x: cx, copy_offset_y: cy }),
    })
    setBusy(false)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setMsg(data.error ?? 'Error'); return }
    setNext(data.next_number)
    setMsg('Guardado')
  }

  const field = 'mt-1 w-full border border-neutral-300 rounded px-3 py-2 text-sm'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Configuración de facturación</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 text-xl leading-none">×</button>
        </div>
        {!loaded ? <p className="text-sm text-neutral-400">Cargando…</p> : (
          <>
            <div>
              <label className="text-xs text-neutral-500">Número inicial</label>
              <NumberInput int value={start} onValueChange={setStart} className={field} />
              <p className="text-[11px] text-neutral-400 mt-1">
                La próxima factura toma el mayor entre este número y la última emitida + 1. Próxima: <b>#{next}</b>.
                Ponelo en el número siguiente al último que se usó en Excel.
              </p>
            </div>
            <div>
              <label className="text-xs text-neutral-500">IVA por defecto (%)</label>
              <NumberInput value={iva} onValueChange={setIva} className={field} />
            </div>
            <div>
              <div className="text-xs text-neutral-500">Calibración de impresora — toda la hoja (mm)</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-neutral-400">Horizontal (+ = derecha)</label>
                  <NumberInput value={ox} onValueChange={setOx} emptyValue={0} signed className={field} />
                </div>
                <div>
                  <label className="text-[11px] text-neutral-400">Vertical (+ = abajo)</label>
                  <NumberInput value={oy} onValueChange={setOy} emptyValue={0} signed className={field} />
                </div>
              </div>
              <div className="text-xs text-neutral-500 mt-3">Ajuste extra solo para la COPIA (mm)</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-neutral-400">Horizontal (+ = derecha)</label>
                  <NumberInput value={cx} onValueChange={setCx} emptyValue={0} signed className={field} />
                </div>
                <div>
                  <label className="text-[11px] text-neutral-400">Vertical (− = subir)</label>
                  <NumberInput value={cy} onValueChange={setCy} emptyValue={0} signed className={field} />
                </div>
              </div>
              <p className="text-[11px] text-neutral-400 mt-1">
                Primero cuadrá el original con “toda la hoja”; después, si la copia sale corrida, movela solo a ella acá
                (ej.: sale 5 mm más abajo → Vertical −5).
              </p>
              <p className="text-[11px] text-neutral-400 mt-1">
                Imprimí la <a href="/factura/prueba" target="_blank" rel="noreferrer" className="underline">hoja de prueba</a> en
                papel blanco y ponela al trasluz sobre una impresa desde Excel. Si está corrida, medí la diferencia en mm y cargala acá.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2">
              {msg && <span className="text-xs text-neutral-500 mr-auto">{msg}</span>}
              <button onClick={onClose} className="btn-secondary text-sm">Cerrar</button>
              <button onClick={save} disabled={busy} className="btn-primary text-sm">Guardar</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
