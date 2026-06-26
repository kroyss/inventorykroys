'use client'
import { useEffect, useState } from 'react'
import type { Sale, InventoryItem, Country } from '@/lib/types'
import { Combobox, type ComboOption } from '@/components/ui/Combobox'
import { blockNumberKeys, blockIntKeys, digitsOnly } from '@/lib/inputGuards'

interface FormItem {
  product_id: number
  product_name: string
  product_code: string
  quantity: number
  unit_price: number
  notes?: string
}

interface Props {
  editing: Sale | null
  products: InventoryItem[]
  country: Country
  onClose: () => void
  onSaved: () => void                 // guardar + cerrar panel
  onContinue?: (id: number) => void   // guardar y abrir el detalle para avanzar estados
}

const money = (n: number) =>
  Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function VentasForm({ editing, products, country, onClose, onSaved, onContinue }: Props) {
  const [orderNumber, setOrderNumber] = useState(editing?.ml_order_number ?? '')
  const [customer,    setCustomer]    = useState(editing?.customer_name ?? '')
  const [discount,    setDiscount]    = useState(editing?.discount_percent ?? 0)
  const [notes,       setNotes]       = useState(editing?.notes ?? '')
  const [items, setItems] = useState<FormItem[]>(
    editing?.items.map(i => ({
      product_id:   i.product_id,
      product_name: i.product_name,
      product_code: i.product_code,
      quantity:     i.quantity,
      unit_price:   i.unit_price,
      notes:        i.notes ?? '',
    })) ?? []
  )
  const [search, setSearch] = useState('')
  const [customers, setCustomers] = useState<ComboOption[]>([])
  useEffect(() => { fetch('/api/sales/customers').then(r => r.json()).then(setCustomers).catch(() => {}) }, [])

  // VE: tasa para calcular el precio REAL (paralelo) que va a la venta.
  const [veRate, setVeRate] = useState<{ official: number; parallel: number } | null>(null)
  useEffect(() => {
    if (country !== 'VE') return
    fetch('/api/rates/latest').then(r => r.json())
      .then(d => { if (d?.official_rate > 0 && d?.parallel_rate > 0) setVeRate({ official: d.official_rate, parallel: d.parallel_rate }) })
      .catch(() => {})
  }, [country])
  const [busy,   setBusy]   = useState(false)
  const [error,  setError]  = useState<string | null>(null)
  const [isLocal, setIsLocal] = useState(editing?.ml_order_number.startsWith('LOCAL-') ?? false)
  const [isFlex, setIsFlex] = useState(editing?.is_flex ?? false)  // CO: venta FLEX
  const [mounted, setMounted] = useState(false)

  // slide-in on mount
  useEffect(() => { setMounted(true) }, [])

  // Auto-generate LOCAL number
  useEffect(() => {
    if (!editing && isLocal && !orderNumber.startsWith('LOCAL-')) {
      fetch('/api/sales/next-local-number').then(r => r.json()).then(d => setOrderNumber(d.next_local))
    }
    if (!editing && !isLocal && orderNumber.startsWith('LOCAL-')) {
      setOrderNumber('')
    }
  }, [isLocal, editing, orderNumber])

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.code.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 20)

  // VE: el monto que va a la venta es el precio REAL que recibís (oficial→paralelo),
  // congelado a la tasa del momento (snapshot). CO: el precio en pesos. Fallback al base.
  const defaultPrice = (p: InventoryItem) => {
    if (country === 'VE' && veRate && veRate.parallel > 0 && p.final_price_usd > 0) {
      return Math.round(p.final_price_usd * veRate.official / veRate.parallel * 100) / 100
    }
    return p.sale_price || p.final_price_usd
  }

  const addItem = (p: InventoryItem) => {
    if (items.some(i => i.product_id === p.product_id)) return
    setItems([...items, {
      product_id:   p.product_id,
      product_name: p.name,
      product_code: p.code,
      quantity:     1,
      unit_price:   defaultPrice(p),
    }])
    setSearch('')
  }

  const updateItem = (idx: number, patch: Partial<FormItem>) => {
    const next = [...items]
    next[idx] = { ...next[idx], ...patch }
    setItems(next)
  }

  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx))

  const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0)
  const totalQty = items.reduce((s, i) => s + i.quantity, 0)
  const total    = discount > 0 ? subtotal * (1 - discount / 100) : subtotal

  const close = () => {
    setMounted(false)
    setTimeout(onClose, 180)  // let slide-out play
  }

  // mode: 'close' = guardar y cerrar | 'continue' = guardar y abrir detalle para avanzar estados
  const save = async (mode: 'close' | 'continue' = 'close') => {
    if (!orderNumber.trim()) { setError('Número de orden requerido'); return }
    if (items.length === 0)  { setError('Agrega al menos un producto'); return }

    setBusy(true); setError(null)
    const body = {
      ml_order_number:  orderNumber.trim(),
      customer_name:    customer.trim(),
      discount_percent: discount,
      notes:            notes.trim(),
      // FLEX solo aplica en CO y en ventas no-LOCAL
      ...(country === 'CO' ? { is_flex: isFlex && !isLocal } : {}),
      items: items.map(i => ({
        product_id: i.product_id,
        quantity:   i.quantity,
        unit_price: i.unit_price,
        notes:      i.notes ?? '',
      })),
    }
    const res = editing
      ? await fetch(`/api/sales/${editing.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      : await fetch('/api/sales',                { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) {
      setError(data.error ?? 'Error')
      return
    }
    if (mode === 'continue') {
      const targetId = editing?.id ?? data.id
      if (targetId && onContinue) onContinue(targetId)
      else onSaved()
    } else {
      onSaved()
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      {/* overlay */}
      <div
        className={`absolute inset-0 bg-black/30 transition-opacity duration-200 ${mounted ? 'opacity-100' : 'opacity-0'}`}
        onClick={close}
      />
      {/* slide-over panel */}
      <div className={`absolute right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl flex flex-col transition-transform duration-200 ${mounted ? 'translate-x-0' : 'translate-x-full'}`}>
        {/* header */}
        <div className="px-5 py-4 border-b flex items-center justify-between shrink-0">
          <h2 className="font-semibold text-lg">{editing ? 'Editar venta' : 'Nueva venta'}</h2>
          <button onClick={close} className="text-neutral-400 hover:text-neutral-700 text-xl leading-none">✕</button>
        </div>

        {/* scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">{error}</div>}

          {(!editing || (country === 'CO' && !isLocal)) && (
            <div className="flex gap-2">
              {!editing && (
                <label className={`flex-1 flex items-center gap-2 text-sm rounded-lg border px-3 py-2 cursor-pointer transition-colors font-medium ${
                  isLocal
                    ? 'bg-orange-500 border-orange-500 text-white'
                    : 'bg-orange-50 border-orange-300 text-orange-700 hover:bg-orange-100'
                }`}>
                  <input type="checkbox" checked={isLocal}
                    onChange={e => { setIsLocal(e.target.checked); if (e.target.checked) setIsFlex(false) }}
                    className="accent-orange-600 w-4 h-4" />
                  Venta LOCAL
                </label>
              )}
              {country === 'CO' && !isLocal && (
                <label className={`flex items-center gap-2 text-sm rounded-lg border px-3 py-2 cursor-pointer transition-colors font-medium whitespace-nowrap ${
                  isFlex
                    ? 'bg-green-500 border-green-500 text-white'
                    : 'bg-green-50 border-green-300 text-green-700 hover:bg-green-100'
                }`}>
                  <input type="checkbox" checked={isFlex} onChange={e => setIsFlex(e.target.checked)} className="accent-green-600 w-4 h-4" />
                  Venta FLEX
                </label>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-neutral-500">Número de orden ML</label>
              <input value={orderNumber} onChange={e => setOrderNumber(digitsOnly(e.target.value))}
                disabled={isLocal} inputMode="numeric"
                className="mt-1 w-full border rounded px-3 py-2 text-sm" placeholder="Solo números" />
            </div>
            <div>
              <label className="text-xs text-neutral-500">Cliente</label>
              <div className="mt-1">
                <Combobox
                  value={customer}
                  options={customers}
                  placeholder="Escribe o busca el cliente…"
                  onChange={name => setCustomer(name)}
                />
              </div>
            </div>
          </div>

          {/* Items */}
          <div>
            <label className="text-xs text-neutral-500">Productos</label>
            <input value={search} onChange={e => setSearch(e.target.value)}
              className="mt-1 w-full border rounded px-3 py-2 text-sm" placeholder="Buscar por código o nombre…" />
            {search && (
              <div className="border rounded mt-1 max-h-48 overflow-y-auto bg-white shadow-sm">
                {filtered.map(p => (
                  <div key={p.product_id} onClick={() => addItem(p)}
                    className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm flex justify-between border-b last:border-0">
                    <div>
                      <span className="font-mono text-xs text-neutral-400 mr-2">{p.code}</span>
                      {p.name}
                    </div>
                    <div className="text-neutral-500 text-xs">
                      stock {p.quantity} · ${money(p.sale_price || p.final_price_usd)}
                    </div>
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
                    <th className="px-3 py-2 w-24">Precio</th>
                    <th className="px-3 py-2 w-24 text-right">Subtotal</th>
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
                        <input type="number" step="0.01" min={0} value={it.unit_price} onKeyDown={blockNumberKeys}
                          onChange={e => updateItem(idx, { unit_price: parseFloat(e.target.value) || 0 })}
                          className="w-full border rounded px-2 py-1 text-sm" />
                      </td>
                      <td className="px-3 py-2 text-right">${money(it.quantity * it.unit_price)}</td>
                      <td className="px-2 py-1">
                        <button onClick={() => removeItem(idx)} className="text-red-500 hover:text-red-700">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {country === 'VE' && veRate && items.length > 0 && (
            <p className="text-[11px] text-neutral-400 -mt-1">
              El precio es <b>lo que recibís en paralelo</b> (real, ya descontado el cambiario), congelado a la tasa de hoy. Editable por línea.
            </p>
          )}

          <div className="flex items-end justify-between gap-4">
            <div className="w-20 shrink-0">
              <label className="text-xs text-neutral-500">Desc. %</label>
              <input type="number" min={0} max={100} step="0.01" value={discount} onKeyDown={blockNumberKeys}
                onChange={e => setDiscount(parseFloat(e.target.value) || 0)}
                className="mt-1 w-full border rounded px-2 py-2 text-sm text-center" />
            </div>
            <div className="text-center">
              <div className="text-xs text-neutral-500">Cantidad</div>
              <div className="text-lg font-semibold mt-1">{totalQty}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-neutral-500">Total</div>
              <div className="text-2xl font-bold">${money(total)}</div>
              {discount > 0 && <div className="text-xs text-neutral-400">Subtotal: ${money(subtotal)}</div>}
            </div>
          </div>

          <div>
            <label className="text-xs text-neutral-500">Notas</label>
            <input value={notes} onChange={e => setNotes(e.target.value)}
              className="mt-1 w-full border rounded px-3 py-2 text-sm" />
          </div>
        </div>

        {/* sticky footer */}
        <div className="px-5 py-4 border-t flex justify-end gap-2 bg-neutral-50 shrink-0">
          <button onClick={close} className="btn-secondary text-sm">Cancelar</button>
          {editing ? (
            <button onClick={() => save('close')} disabled={busy} className="btn-primary text-sm">
              {busy ? 'Guardando…' : 'Actualizar'}
            </button>
          ) : (
            <>
              <button onClick={() => save('close')} disabled={busy || items.length === 0} className="btn-secondary text-sm">
                {busy ? 'Guardando…' : 'Crear venta'}
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
