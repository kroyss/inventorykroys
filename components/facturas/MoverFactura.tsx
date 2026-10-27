'use client'
import { useEffect, useState } from 'react'
import type { Invoice } from '@/lib/invoices'

interface VentaBusqueda { id: number; ml_order_number: string; customer_name: string | null; total_amount: number; status: string }

/**
 * "Se hizo en la venta equivocada" (27-10, ¿Salió mal?): elegir la venta correcta y pasar la factura (mismo número,
 * mismo impreso; PUT /api/invoices/[id]/mover). Si los productos no coinciden, lo muestra y pide confirmar.
 */
export default function MoverFactura({ invoice: inv, onCerrar, onMovida }: {
  invoice: Invoice
  onCerrar: () => void
  onMovida: (r: { de: string | null; a: string; deId: number | null }) => void
}) {
  const [buscar, setBuscar] = useState('')
  const [ventas, setVentas] = useState<VentaBusqueda[]>([])
  const [elegida, setElegida] = useState<VentaBusqueda | null>(null)
  const [motivo, setMotivo] = useState('La factura se hizo en la venta equivocada')
  const [diferencias, setDiferencias] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    const q = buscar.trim()
    if (q.length < 3) { setVentas([]); return }
    const t = setTimeout(() => {
      fetch(`/api/sales?search=${encodeURIComponent(q)}&pageSize=8`).then(r => r.ok ? r.json() : null)
        .then(d => setVentas(((d?.rows ?? []) as VentaBusqueda[]).filter(v => v.id !== inv.sale_id)))
        .catch(() => {})
    }, 300)
    return () => clearTimeout(t)
  }, [buscar, inv.sale_id])

  async function mover(confirmar = false) {
    if (!elegida) return
    setEnviando(true); setError(null)
    const r = await fetch(`/api/invoices/${inv.id}/mover`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sale_id: elegida.id, motivo, confirmar }),
    }).catch(() => null)
    const d = r ? await r.json().catch(() => ({})) : {}
    setEnviando(false)
    if (r?.ok) return onMovida(d)
    if (d.requiereConfirmar) return setDiferencias(d.diferencias ?? [])
    setError(d.error ?? 'No se pudo mover la factura')
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onCerrar} />
      <div className="relative w-full max-w-lg space-y-3 rounded-xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Pasar la factura #{inv.invoice_number} a otra venta</h2>
            <p className="text-xs text-neutral-500">Hoy está en la venta {inv.sale_order_number ?? '—'}. Mantiene su número y lo impreso.</p>
          </div>
          <button onClick={onCerrar} className="text-xl leading-none text-neutral-400 hover:text-neutral-700">×</button>
        </div>

        <label className="block text-sm">
          <span className="mb-1 block text-xs text-neutral-500">Busca la venta correcta (n.º de orden o cliente)</span>
          <input autoFocus value={buscar} onChange={e => { setBuscar(e.target.value); setElegida(null); setDiferencias(null) }}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2" placeholder="2000…" />
        </label>
        {ventas.length > 0 && (
          <ul className="max-h-56 divide-y divide-neutral-100 overflow-y-auto rounded-lg border border-neutral-200">
            {ventas.map(v => (
              <li key={v.id}>
                <button onClick={() => { setElegida(v); setDiferencias(null) }}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-neutral-50 ${elegida?.id === v.id ? 'bg-lime-50' : ''}`}>
                  <span className="min-w-0">
                    <span className="block font-medium text-neutral-900">{v.ml_order_number}</span>
                    <span className="block truncate text-xs text-neutral-500">{v.customer_name ?? '—'} · {v.status}</span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold">${v.total_amount.toFixed(2)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {elegida && (
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-neutral-500">Motivo</span>
            <input value={motivo} onChange={e => setMotivo(e.target.value)} className="w-full rounded-lg border border-neutral-300 px-3 py-2" />
          </label>
        )}
        {diferencias && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <p className="font-medium">Los productos de la factura no coinciden con los de la venta {elegida?.ml_order_number}:</p>
            <ul className="mt-1 list-disc pl-4">{diferencias.map(d => <li key={d}>{d}</li>)}</ul>
            <p className="mt-1">Si igual es la venta correcta, muévela. Si no, elige otra.</p>
          </div>
        )}
        {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={onCerrar} className="btn-ghost text-sm">Cancelar</button>
          <button onClick={() => mover(!!diferencias)} disabled={!elegida || !motivo.trim() || enviando} className="btn-primary text-sm">
            {enviando ? 'Moviendo…' : diferencias ? 'Mover igual' : `Pasar a ${elegida?.ml_order_number ?? 'la venta'}`}
          </button>
        </div>
      </div>
    </div>
  )
}
