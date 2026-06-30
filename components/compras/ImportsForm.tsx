'use client'
import { useEffect, useState } from 'react'
import type { ImportOrder, Supplier } from '@/lib/types'
import { Combobox } from '@/components/ui/Combobox'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { matchTokens } from '@/lib/search'
import { blockNumberKeys, blockIntKeys } from '@/lib/inputGuards'

interface FormItem {
  product_id: number
  product_name: string
  product_code: string
  quantity: number
  unit_cost_usd: number
  notes?: string
}

interface ProductRow {
  id: number
  code: string
  name: string
  base_cost?: number   // costo del producto (lo que se paga al proveedor, sin envío)
  total_cost?: number  // base + envío estimado (NO se usa para importaciones)
}

interface Props {
  editing: ImportOrder | null
  suppliers: Supplier[]
  carriers?: string[]
  onClose: () => void
  onSaved: () => void
  onReload?: () => void
  onContinue?: (id: number) => void
}

const fmt = (n: number) =>
  Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function ImportsForm({ editing, suppliers, carriers = [], onClose, onSaved, onReload, onContinue }: Props) {
  const confirm = useConfirm()
  const [supplierList, setSupplierList] = useState<Supplier[]>(suppliers)
  const [supplierId,   setSupplierId]   = useState<number | null>(editing?.supplier_id ?? null)
  const [supplierName, setSupplierName] = useState(editing?.supplier_name ?? '')
  const [origin,     setOrigin]     = useState(editing?.origin_country ?? '')
  const [notes,      setNotes]      = useState(editing?.notes ?? '')
  const [items, setItems] = useState<FormItem[]>(
    editing?.items.map(i => ({
      product_id:    i.product_id,
      product_name:  i.product_name,
      product_code:  i.product_code,
      quantity:      i.quantity,
      unit_cost_usd: i.unit_cost_usd,
      notes:         i.notes ?? '',
    })) ?? []
  )
  const [products, setProducts] = useState<ProductRow[]>([])
  const [search,   setSearch]   = useState('')
  const [busy,     setBusy]     = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [okMsg,    setOkMsg]    = useState<string | null>(null)
  const [mounted,  setMounted]  = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const closePanel = () => { setMounted(false); setTimeout(onClose, 180) }

  useEffect(() => {
    fetch('/api/products').then(r => r.json()).then((rows: ProductRow[]) => setProducts(rows))
  }, [])

  const filtered = products.filter(p => matchTokens(search, p.name, p.code)).slice(0, 20)

  const addItem = (p: ProductRow) => {
    if (items.some(i => i.product_id === p.id)) return
    // Pre-llena con el COSTO DE PRODUCTO (base, sin envío), que es lo que se le
    // paga al proveedor. El envío de la importación se registra aparte. Editable.
    setItems([...items, { product_id: p.id, product_name: p.name, product_code: p.code, quantity: 1, unit_cost_usd: p.base_cost ?? 0 }])
    setSearch('')
  }

  const updateItem = (idx: number, patch: Partial<FormItem>) => {
    const next = [...items]
    next[idx] = { ...next[idx], ...patch }
    setItems(next)
  }

  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx))

  async function deleteSupplier(opt: { id: number; name: string }) {
    if (!await confirm({ title: 'Eliminar proveedor', message: `¿Eliminar el proveedor "${opt.name}"?`, confirmText: 'Eliminar', danger: true })) return
    const r = await fetch(`/api/suppliers/${opt.id}`, { method: 'DELETE' })
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      await confirm({ title: 'No se puede eliminar', message: d.error ?? 'El proveedor tiene órdenes registradas.', confirmText: 'Entendido', cancelText: '' })
      return
    }
    setSupplierList(prev => prev.filter(s => s.id !== opt.id))
    if (supplierId === opt.id) { setSupplierName(''); setSupplierId(null) }
  }

  const total = items.reduce((s, i) => s + i.quantity * i.unit_cost_usd, 0)

  // mode: 'close' = guardar y cerrar | 'another' = crear otra | 'continue' = abrir detalle
  const save = async (mode: 'close' | 'another' | 'continue' = 'close') => {
    if (!supplierName.trim()) { setError('Proveedor requerido'); return }
    if (items.length === 0) { setError('Agrega al menos un producto'); return }
    if (items.some(i => i.unit_cost_usd <= 0)) { setError('Todos los productos deben tener costo'); return }

    setBusy(true); setError(null); setOkMsg(null)
    const body = {
      supplier_id:    supplierId ?? undefined,
      supplier_name:  supplierName.trim(),
      origin_country: origin.trim() || undefined,
      notes:          notes.trim() || undefined,
      items: items.map(i => ({
        product_id:    i.product_id,
        quantity:      i.quantity,
        unit_cost_usd: i.unit_cost_usd,
        notes:         i.notes ?? '',
      })),
    }
    const res = editing
      ? await fetch(`/api/imports/${editing.id}`, { method: 'PUT',  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      : await fetch('/api/imports',                { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) {
      setError(data.error ?? 'Error')
      return
    }

    if (mode === 'another' && !editing) {
      onReload?.()
      setSupplierName(''); setSupplierId(null)
      setOrigin(''); setNotes(''); setItems([]); setSearch('')
      setOkMsg('Importación creada. Listo para la siguiente.')
      setTimeout(() => setOkMsg(null), 3000)
    } else if (mode === 'continue') {
      const targetId = editing?.id ?? data.id
      if (targetId && onContinue) onContinue(targetId)
      else onSaved()
    } else {
      onSaved()
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className={`absolute inset-0 bg-black/30 transition-opacity duration-200 ${mounted ? 'opacity-100' : 'opacity-0'}`} onClick={closePanel} />
      <div className={`absolute right-0 top-0 h-full w-full max-w-2xl bg-white shadow-2xl flex flex-col transition-transform duration-200 ${mounted ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="px-5 py-4 border-b flex items-center justify-between shrink-0">
          <h2 className="font-semibold text-lg">{editing ? 'Editar importación' : 'Nueva importación'}</h2>
          <button onClick={closePanel} className="text-neutral-400 hover:text-neutral-700 text-xl leading-none">✕</button>
        </div>
        <div className="px-5 py-4 space-y-3 flex-1 overflow-y-auto">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">{error}</div>}
          {okMsg && <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded text-sm">{okMsg}</div>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-neutral-500">Proveedor</label>
              <div className="mt-1">
                <Combobox
                  value={supplierName}
                  options={supplierList}
                  placeholder="Escribe o busca el proveedor…"
                  onChange={(name, id) => { setSupplierName(name); setSupplierId(id) }}
                  onDelete={deleteSupplier}
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-neutral-500">Transportista</label>
              <div className="mt-1">
                <Combobox
                  value={origin}
                  options={carriers.map((c, i) => ({ id: i, name: c }))}
                  placeholder="Escribe o busca el transportista…"
                  onChange={(name) => setOrigin(name)}
                />
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs text-neutral-500">Notas</label>
            <input value={notes} onChange={e => setNotes(e.target.value)}
              className="mt-1 w-full border rounded px-3 py-2 text-sm" />
          </div>

          <div>
            <label className="text-xs text-neutral-500">Productos</label>
            <input value={search} onChange={e => setSearch(e.target.value)}
              className="mt-1 w-full border rounded px-3 py-2 text-sm" placeholder="Buscar…" />
            {search && (
              <div className="border rounded mt-1 max-h-48 overflow-y-auto bg-white shadow-sm">
                {filtered.map(p => (
                  <div key={p.id} onClick={() => addItem(p)}
                    className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm border-b last:border-0 flex justify-between gap-2">
                    <span className="truncate">
                      <span className="font-mono text-xs text-neutral-400 mr-2">{p.code}</span>
                      {p.name}
                    </span>
                    {(p.base_cost ?? 0) > 0 && (
                      <span className="text-neutral-400 whitespace-nowrap">${fmt(p.base_cost!)}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {items.length > 0 && (
            <div className="border rounded">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-xs text-neutral-500 uppercase">
                  <tr>
                    <th className="px-3 py-2 text-left">Producto</th>
                    <th className="px-3 py-2 w-20">Cant.</th>
                    <th className="px-3 py-2 w-28">Costo $/u</th>
                    <th className="px-3 py-2 w-28 text-right">Total</th>
                    <th className="px-3 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="px-3 py-2">
                        <div className="text-xs text-neutral-400 font-mono">{it.product_code}</div>
                        <div>{it.product_name}</div>
                      </td>
                      <td className="px-2 py-1">
                        <input type="number" min={1} value={it.quantity} onKeyDown={blockIntKeys}
                          onChange={e => updateItem(idx, { quantity: parseInt(e.target.value) || 1 })}
                          className="w-full border rounded px-2 py-1 text-sm" />
                      </td>
                      <td className="px-2 py-1">
                        <input type="number" step="0.01" min={0} value={it.unit_cost_usd} onKeyDown={blockNumberKeys}
                          onChange={e => updateItem(idx, { unit_cost_usd: parseFloat(e.target.value) || 0 })}
                          className="w-full border rounded px-2 py-1 text-sm" />
                      </td>
                      <td className="px-3 py-2 text-right">${fmt(it.quantity * it.unit_cost_usd)}</td>
                      <td className="px-2 py-1">
                        <button onClick={() => removeItem(idx)} className="text-red-500 hover:text-red-700">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="text-right text-lg font-bold">Total: ${fmt(total)}</div>
        </div>

        <div className="px-5 py-4 border-t flex flex-wrap justify-end gap-2 bg-neutral-50 shrink-0">
          <button onClick={closePanel} className="btn-secondary text-sm">Cancelar</button>
          {editing ? (
            <button onClick={() => save('close')} disabled={busy} className="btn-primary text-sm">
              {busy ? 'Guardando…' : 'Actualizar'}
            </button>
          ) : (
            <>
              <button onClick={() => save('close')} disabled={busy || items.length === 0} className="btn-secondary text-sm">
                {busy ? 'Guardando…' : 'Crear importación'}
              </button>
              <button onClick={() => save('continue')} disabled={busy || items.length === 0} className="btn-primary text-sm">
                {busy ? 'Guardando…' : 'Crear y continuar'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
