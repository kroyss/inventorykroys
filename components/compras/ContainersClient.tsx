'use client'
import { useState, useEffect, useCallback } from 'react'
import type { ImportContainer, ContainerStatus } from '@/lib/types'
import { money, int } from '@/components/ui'
import { useConfirm } from '@/components/ui/ConfirmProvider'

const STATUS_LABELS: Record<ContainerStatus, string> = {
  ABIERTO: 'Abierto', EN_TRANSITO: 'En tránsito', RECIBIDO: 'Recibido', CERRADO: 'Cerrado',
}
const STATUS_OPTS: ContainerStatus[] = ['ABIERTO', 'EN_TRANSITO', 'RECIBIDO', 'CERRADO']

interface OrderRow {
  id: number; order_number: string; status: string
  total_usd: number; box_count: number; supplier_name: string | null; file_count: number
}
interface Detail {
  container: ImportContainer
  orders: OrderRow[]
  available: OrderRow[]
}

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'

export default function ContainersClient({ onChanged }: { onChanged?: () => void }) {
  const confirm = useConfirm()
  const [list, setList]       = useState<ImportContainer[]>([])
  const [detail, setDetail]   = useState<Detail | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [pick, setPick]       = useState<Set<number>>(new Set())

  const load = useCallback(async () => {
    const r = await fetch('/api/containers', { cache: 'no-store' })
    if (r.ok) setList(await r.json())
  }, [])
  useEffect(() => { load() }, [load])

  const openDetail = async (id: number) => {
    setError(null); setPick(new Set())
    const r = await fetch(`/api/containers/${id}`)
    if (r.ok) setDetail(await r.json())
  }
  const reloadDetail = async () => { if (detail) await openDetail(detail.container.id) }

  // Esc cierra
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (showCreate) setShowCreate(false)
      else if (detail) setDetail(null)
    }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [showCreate, detail])

  const saveMeta = async (patch: Record<string, unknown>) => {
    if (!detail) return
    setBusy(true); setError(null)
    const r = await fetch(`/api/containers/${detail.container.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    })
    setBusy(false)
    if (!r.ok) { setError((await r.json()).error ?? 'Error'); return }
    await reloadDetail(); await load(); onChanged?.()
  }

  const setMembership = async (add?: number[], remove?: number[]) => {
    if (!detail) return
    setBusy(true); setError(null)
    const r = await fetch(`/api/containers/${detail.container.id}/orders`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ add, remove }),
    })
    setBusy(false)
    if (!r.ok) { setError((await r.json()).error ?? 'Error'); return }
    setPick(new Set())
    await reloadDetail(); await load(); onChanged?.()
  }

  const del = async () => {
    if (!detail) return
    if (!await confirm({ title: 'Eliminar contenedor', message: `¿Eliminar ${detail.container.code}? Las órdenes quedan sin contenedor (no se borran).`, confirmText: 'Eliminar', danger: true })) return
    const r = await fetch(`/api/containers/${detail.container.id}`, { method: 'DELETE' })
    if (r.ok) { setDetail(null); load(); onChanged?.() }
  }

  const aggUsd = detail?.orders.reduce((s, o) => s + (o.total_usd || 0), 0) ?? 0
  const aggBox = detail?.orders.reduce((s, o) => s + (o.box_count || 0), 0) ?? 0

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-neutral-500">Agrupa varias importaciones bajo un contenedor/lote.</div>
        <button onClick={() => setShowCreate(true)} className="btn-primary text-sm">+ Contenedor</button>
      </div>

      {error && !detail && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm">{error}</div>}

      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-500">
              <tr className="border-b border-neutral-100">
                <th className="px-3 py-2 text-left">Contenedor</th>
                <th className="px-3 py-2 text-left">Nombre</th>
                <th className="px-3 py-2 text-center">Estado</th>
                <th className="px-3 py-2 text-right">Órdenes</th>
                <th className="px-3 py-2 text-right">Cajas</th>
                <th className="px-3 py-2 text-right">Total USD</th>
                <th className="px-3 py-2 text-right">ETA</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-neutral-400">Sin contenedores</td></tr>
              )}
              {list.map((c, i) => (
                <tr key={c.id} onClick={() => openDetail(c.id)}
                  className={`border-b border-neutral-50 hover:bg-neutral-50 cursor-pointer ${i % 2 ? 'bg-neutral-50/40' : ''}`}>
                  <td className="px-3 py-2 font-mono text-xs font-bold text-neutral-900 whitespace-nowrap">{c.code}</td>
                  <td className="px-3 py-2 text-neutral-700 max-w-[16rem] truncate">{c.name || '—'}</td>
                  <td className="px-3 py-2 text-center">
                    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-neutral-100 text-neutral-700">{STATUS_LABELS[c.status]}</span>
                  </td>
                  <td className="px-3 py-2 text-right text-neutral-700 font-medium">{int(c.order_count)}</td>
                  <td className="px-3 py-2 text-right text-neutral-600">{c.total_boxes || '—'}</td>
                  <td className="px-3 py-2 text-right font-bold text-neutral-900 whitespace-nowrap">${money(c.total_usd)}</td>
                  <td className="px-3 py-2 text-right text-neutral-400 text-xs whitespace-nowrap">{fmtDate(c.eta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Detalle ── */}
      {detail && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDetail(null)} />
          <div className="absolute right-0 top-0 h-full w-full max-w-2xl bg-white shadow-2xl flex flex-col">
            <div className="p-5 border-b border-neutral-100 shrink-0 flex items-start justify-between">
              <div>
                <h3 className="text-xl font-bold text-neutral-800 font-mono">{detail.container.code}</h3>
                <p className="text-neutral-600 mt-1">{detail.container.name || 'Sin nombre'}</p>
              </div>
              <div className="flex items-center gap-2">
                <select value={detail.container.status} disabled={busy}
                  onChange={e => saveMeta({ status: e.target.value })}
                  className="border border-neutral-300 rounded-lg px-2 py-1 text-sm bg-white">
                  {STATUS_OPTS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
                <button onClick={() => setDetail(null)} className="text-neutral-400 hover:text-neutral-700 text-xl leading-none">×</button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">{error}</div>}

              {/* Agregados */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-2.5">
                  <div className="text-[11px] text-neutral-500">Órdenes</div>
                  <div className="text-lg font-bold">{detail.orders.length}</div>
                </div>
                <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-2.5">
                  <div className="text-[11px] text-neutral-500">Cajas</div>
                  <div className="text-lg font-bold">{aggBox}</div>
                </div>
                <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-2.5">
                  <div className="text-[11px] text-neutral-500">Total USD</div>
                  <div className="text-lg font-bold">${money(aggUsd)}</div>
                </div>
              </div>

              {/* Metadata editable */}
              <ContainerMeta detail={detail} busy={busy} onSave={saveMeta} />

              {/* Órdenes asignadas */}
              <div>
                <div className="text-sm font-semibold text-neutral-700 mb-2">Órdenes en este contenedor</div>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <tbody>
                      {detail.orders.length === 0 && <tr><td className="px-3 py-3 text-neutral-400">Sin órdenes asignadas</td></tr>}
                      {detail.orders.map(o => (
                        <tr key={o.id} className="border-b border-neutral-50">
                          <td className="px-3 py-2 font-mono text-xs font-bold">{o.order_number}</td>
                          <td className="px-3 py-2 text-neutral-500">{o.supplier_name || '—'}</td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">{o.box_count || 0} cajas</td>
                          <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">${money(o.total_usd)}</td>
                          <td className="px-3 py-2 text-right">
                            <button onClick={() => setMembership(undefined, [o.id])} disabled={busy}
                              className="text-xs px-2 py-1 rounded hover:bg-red-50 text-neutral-400 hover:text-red-600">Quitar</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Agregar órdenes disponibles */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-semibold text-neutral-700">Agregar órdenes (sin contenedor)</div>
                  {pick.size > 0 && (
                    <button onClick={() => setMembership([...pick])} disabled={busy} className="btn-primary text-xs">
                      Agregar {pick.size}
                    </button>
                  )}
                </div>
                {detail.available.length === 0 ? (
                  <div className="text-xs text-neutral-400">No hay importaciones libres para agregar.</div>
                ) : (
                  <div className="border rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                    <table className="w-full text-sm">
                      <tbody>
                        {detail.available.map(o => (
                          <tr key={o.id} className="border-b border-neutral-50 hover:bg-neutral-50">
                            <td className="px-3 py-2 w-8">
                              <input type="checkbox" checked={pick.has(o.id)}
                                onChange={() => setPick(p => { const n = new Set(p); n.has(o.id) ? n.delete(o.id) : n.add(o.id); return n })} />
                            </td>
                            <td className="px-3 py-2 font-mono text-xs font-bold">{o.order_number}</td>
                            <td className="px-3 py-2 text-neutral-500">{o.supplier_name || '—'}</td>
                            <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">${money(o.total_usd)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="pt-2">
                <button onClick={del} className="btn-danger text-sm">Eliminar contenedor</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Crear ── */}
      {showCreate && (
        <CreateContainer
          onClose={() => setShowCreate(false)}
          onCreated={async (id) => { setShowCreate(false); await load(); onChanged?.(); openDetail(id) }}
          onError={setError}
        />
      )}
    </div>
  )
}

// ── Metadata editable del contenedor ──
function ContainerMeta({ detail, busy, onSave }: { detail: Detail; busy: boolean; onSave: (p: Record<string, unknown>) => void }) {
  const c = detail.container
  const [name, setName] = useState(c.name ?? '')
  const [origin, setOrigin] = useState(c.origin_country ?? '')
  const [tracking, setTracking] = useState(c.tracking_number ?? '')
  const [shipping, setShipping] = useState(c.shipping_cost != null ? String(c.shipping_cost) : '')
  const [eta, setEta] = useState(c.eta ? c.eta.slice(0, 10) : '')
  const [notes, setNotes] = useState(c.notes ?? '')

  return (
    <div className="border rounded-lg p-3 space-y-3 bg-neutral-50/50">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] text-neutral-500 mb-1">Nombre / descripción</label>
          <input value={name} onChange={e => setName(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-[11px] text-neutral-500 mb-1">Origen</label>
          <input value={origin} onChange={e => setOrigin(e.target.value)} placeholder="China…" className="w-full border rounded px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-[11px] text-neutral-500 mb-1">Tracking</label>
          <input value={tracking} onChange={e => setTracking(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-[11px] text-neutral-500 mb-1">Costo de envío (USD)</label>
          <input type="number" step="0.01" value={shipping} onChange={e => setShipping(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-[11px] text-neutral-500 mb-1">ETA / llegada</label>
          <input type="date" value={eta} onChange={e => setEta(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-[11px] text-neutral-500 mb-1">Notas</label>
          <input value={notes} onChange={e => setNotes(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm" />
        </div>
      </div>
      <div className="text-right">
        <button disabled={busy} onClick={() => onSave({
          name: name || null, origin_country: origin || null, tracking_number: tracking || null,
          shipping_cost: shipping ? parseFloat(shipping) : null,
          eta: eta || null, notes: notes || null,
        })} className="btn-secondary text-sm">Guardar datos</button>
      </div>
    </div>
  )
}

// ── Crear contenedor ──
function CreateContainer({ onClose, onCreated, onError }: {
  onClose: () => void; onCreated: (id: number) => void; onError: (m: string) => void
}) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [origin, setOrigin] = useState('')
  const [eta, setEta] = useState('')
  const [busy, setBusy] = useState(false)

  const create = async () => {
    setBusy(true)
    const r = await fetch('/api/containers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code || undefined, name: name || undefined, origin_country: origin || undefined, eta: eta || undefined }),
    })
    setBusy(false)
    if (!r.ok) { onError((await r.json()).error ?? 'Error'); return }
    const d = await r.json()
    onCreated(d.id)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b flex justify-between">
          <h3 className="font-semibold">Nuevo contenedor</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 text-xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Código (vacío = se genera CONTENEDOR-XXXX)</label>
            <input value={code} onChange={e => setCode(e.target.value)} placeholder="CONTENEDOR-323" className="w-full border rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Nombre / descripción</label>
            <input value={name} onChange={e => setName(e.target.value)} className="w-full border rounded px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-neutral-500 mb-1">Origen</label>
              <input value={origin} onChange={e => setOrigin(e.target.value)} placeholder="China" className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-neutral-500 mb-1">ETA / llegada</label>
              <input type="date" value={eta} onChange={e => setEta(e.target.value)} className="w-full border rounded px-3 py-2 text-sm" />
            </div>
          </div>
        </div>
        <div className="p-5 border-t flex justify-end gap-2 bg-neutral-50">
          <button onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
          <button onClick={create} disabled={busy} className="btn-primary text-sm">{busy ? 'Creando…' : 'Crear'}</button>
        </div>
      </div>
    </div>
  )
}
