'use client'
// Corregir pedido (20-10, migración 108; API /api/sales/[id]/ajuste): cambio de última hora sobre una venta que ya
// descontó inventario. Una ventana: los productos de la venta (cambiar, agregar, quitar), el motivo y guardar.
// Se corrige la misma venta y el inventario se ajusta por la diferencia; queda la nota (VentaAjustes).
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { InventoryItem, SaleItem } from '@/lib/types'

type Linea = { key: number; product_id: number | null; quantity: number; unit_price: number }
const money = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function CorregirPedido({ saleId, orden, items, products, facturaEmitida, onCerrar, onListo }: {
  saleId: number; orden: string; items: SaleItem[]; products: InventoryItem[]; facturaEmitida: string | null
  onCerrar: () => void; onListo: (msg: string) => void
}) {
  const [lineas, setLineas] = useState<Linea[]>(() =>
    items.map((i, k) => ({ key: k, product_id: i.product_id, quantity: i.quantity, unit_price: i.unit_price })))
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const porId = useMemo(() => new Map(products.map(p => [p.product_id, p])), [products])
  const nombre = (pid: number | null) => pid == null ? '' : porId.get(pid)?.name ?? items.find(i => i.product_id === pid)?.product_name ?? `#${pid}`

  useEffect(() => {
    const k = (ev: KeyboardEvent) => { if (ev.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onCerrar])

  // Lo que cambia en inventario (por producto): + sale más, − vuelve al stock.
  const cambios = useMemo(() => {
    const antes = new Map<number, number>(), despues = new Map<number, number>()
    for (const i of items) antes.set(i.product_id, (antes.get(i.product_id) ?? 0) + i.quantity)
    for (const l of lineas) if (l.product_id != null) despues.set(l.product_id, (despues.get(l.product_id) ?? 0) + l.quantity)
    return [...new Set([...antes.keys(), ...despues.keys()])]
      .map(pid => ({ pid, d: (despues.get(pid) ?? 0) - (antes.get(pid) ?? 0) })).filter(x => x.d !== 0)
  }, [items, lineas])
  const totalAntes = items.reduce((s, i) => s + i.quantity * i.unit_price, 0)
  const totalDespues = lineas.reduce((s, l) => s + (l.product_id != null ? l.quantity * l.unit_price : 0), 0)
  const faltaProducto = lineas.some(l => l.product_id == null)

  const cambiar = (key: number, c: Partial<Linea>) => setLineas(ls => ls.map(l => l.key === key ? { ...l, ...c } : l))
  // Al elegir otro producto se mantiene el precio de la línea (cambio de color/modelo); en una línea nueva, el de venta.
  const elegir = (l: Linea, texto: string) => {
    const p = products.find(x => `${x.code} · ${x.name}` === texto)
    if (!p) return
    cambiar(l.key, { product_id: p.product_id, unit_price: l.product_id == null && !l.unit_price ? (p.sale_price || p.final_price_usd || 0) : l.unit_price })
  }

  const guardar = async () => {
    setGuardando(true); setError(null)
    const r = await fetch(`/api/sales/${saleId}/ajuste`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo, items: lineas.filter(l => l.product_id != null).map(l => ({ product_id: l.product_id, quantity: l.quantity, unit_price: l.unit_price })) }),
    })
    const d = await r.json().catch(() => ({}))
    setGuardando(false)
    if (!r.ok) { setError(d.error ?? 'No se pudo guardar'); return }
    onListo(`Pedido corregido: inventario ajustado y nota guardada.${d.factura ? ` Ojo: la factura #${d.factura} quedó con los productos viejos: corrígela en Facturas.` : ''}`)
  }

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" role="dialog" aria-modal="true"
      onMouseDown={e => { if (e.target === e.currentTarget) onCerrar() }}>
      <div className="flex max-h-[95vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b px-5 py-3">
          <div>
            <h3 className="font-semibold">Corregir pedido</h3>
            <p className="text-xs text-neutral-500">Venta <span className="font-mono">{orden}</span> · se corrige esta misma venta y el inventario se ajusta por la diferencia.</p>
          </div>
          <button onClick={onCerrar} className="btn-ghost !px-2 !py-1" aria-label="Cerrar">✕</button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm">
          {facturaEmitida && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              ⚠️ Esta venta tiene la <b>factura #{facturaEmitida}</b>. Después de corregir, corrígela en Facturas (“Salió mal”).
            </p>
          )}
          <datalist id="cp-productos">
            {products.filter(p => p.is_active).map(p => <option key={p.product_id} value={`${p.code} · ${p.name}`}>{`stock ${p.quantity}`}</option>)}
          </datalist>
          <table className="w-full text-sm">
            <thead className="text-xs text-neutral-500">
              <tr><th className="pb-1 text-left font-normal">Producto</th><th className="w-20 pb-1 text-left font-normal">Cant.</th><th className="w-28 pb-1 text-left font-normal">Precio</th><th className="w-6" /></tr>
            </thead>
            <tbody>
              {lineas.map(l => (
                <tr key={l.key} className="align-top">
                  <td className="py-1 pr-2">
                    <input list="cp-productos" defaultValue={l.product_id != null ? `${porId.get(l.product_id)?.code ?? ''} · ${nombre(l.product_id)}` : ''}
                      onChange={ev => elegir(l, ev.target.value)} placeholder="Buscar producto…"
                      className="w-full rounded border border-neutral-300 px-2 py-1 text-sm" />
                    {l.product_id != null && porId.get(l.product_id) && <div className="text-[11px] text-neutral-400">stock {porId.get(l.product_id)!.quantity}</div>}
                  </td>
                  <td className="py-1 pr-2">
                    <input type="number" min={1} value={l.quantity} onChange={ev => cambiar(l.key, { quantity: Math.max(1, parseInt(ev.target.value) || 1) })}
                      className="w-full rounded border border-neutral-300 px-2 py-1 text-sm" />
                  </td>
                  <td className="py-1 pr-2">
                    <input type="number" min={0} step="0.01" value={l.unit_price} onChange={ev => cambiar(l.key, { unit_price: Math.max(0, parseFloat(ev.target.value) || 0) })}
                      className="w-full rounded border border-neutral-300 px-2 py-1 text-sm" />
                  </td>
                  <td className="py-1">
                    <button onClick={() => setLineas(ls => ls.filter(x => x.key !== l.key))} disabled={lineas.length === 1}
                      title="Quitar" className="px-1 text-neutral-400 hover:text-red-600 disabled:opacity-30">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={() => setLineas(ls => [...ls, { key: Date.now(), product_id: null, quantity: 1, unit_price: 0 }])}
            className="text-xs font-medium text-sky-700 hover:underline">+ Agregar producto</button>

          {cambios.length > 0 && (
            <div className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-700">
              <div className="mb-1 font-medium">Inventario:</div>
              {cambios.map(c => (
                <div key={c.pid}>{c.d > 0 ? `sale ${c.d}` : `vuelve ${-c.d}`} × {nombre(c.pid)}</div>
              ))}
              {Math.abs(totalDespues - totalAntes) > 0.004 && (
                <div className="mt-1 text-neutral-500">Total (antes del descuento): {money(totalAntes)} → <b>{money(totalDespues)}</b></div>
              )}
            </div>
          )}

          <label className="block text-xs text-neutral-500">¿Qué pasó? (queda en la nota de la venta)
            <input value={motivo} onChange={ev => setMotivo(ev.target.value)} maxLength={300}
              placeholder="Ej.: el cliente pidió una en azul por el chat"
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900" />
          </label>
          {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-red-700">{error}</div>}
        </div>
        <div className="flex justify-end gap-2 border-t bg-neutral-50 px-5 py-3">
          <button onClick={onCerrar} className="btn-secondary text-sm">Cancelar</button>
          <button onClick={guardar} disabled={guardando || faltaProducto || motivo.trim().length < 3 || cambios.length === 0 && Math.abs(totalDespues - totalAntes) < 0.005}
            className="btn-primary text-sm disabled:opacity-50">{guardando ? 'Guardando…' : 'Guardar corrección'}</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** La nota: cada corrección de la venta (antes → después, quién, cuándo, por qué). */
export function NotaAjustes({ saleId, version }: { saleId: number; version: number }) {
  type Item = { nombre: string; cantidad: number; precio: number }
  type Ajuste = { id: number; fecha: string; motivo: string; antes: Item[]; despues: Item[]; por: string | null; despues_de_enviado: boolean; factura: string | null }
  const [ajustes, setAjustes] = useState<Ajuste[]>([])
  useEffect(() => {
    let vivo = true
    fetch(`/api/sales/${saleId}/ajuste`).then(r => r.ok ? r.json() : null).then(d => { if (vivo && d) setAjustes(d.ajustes) }).catch(() => {})
    return () => { vivo = false }
  }, [saleId, version])
  if (!ajustes.length) return null
  const txt = (xs: Item[]) => xs.map(x => `${x.cantidad} × ${x.nombre}`).join(' + ')
  const fecha = (f: string) => new Date(f).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  return (
    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
      <div className="mb-1 text-xs font-semibold text-amber-900">⚠ Pedido corregido {ajustes.length > 1 ? `${ajustes.length} veces` : ''}</div>
      <ul className="space-y-2">
        {ajustes.map(a => (
          <li key={a.id} className="text-xs text-neutral-700">
            <div><span className="text-neutral-500">Antes:</span> {txt(a.antes)}</div>
            <div><span className="text-neutral-500">Ahora:</span> <b>{txt(a.despues)}</b></div>
            <div className="text-neutral-500">{a.por ?? '—'} · {fecha(a.fecha)}{a.despues_de_enviado ? ' · después de enviado' : ' · antes de salir'} · “{a.motivo}”</div>
            {a.factura && <div className="text-amber-800">La factura #{a.factura} tenía los productos de antes.</div>}
          </li>
        ))}
      </ul>
    </div>
  )
}
