'use client'
import { useCallback, useEffect, useState } from 'react'

// Primera jornada (07-11-2026, migración 147, caso Urdaneta): el primer día en Despachos llegan también las guías de
// días anteriores, que muchas veces ya se enviaron por fuera. Se pregunta cuáles ya salieron y se sacan de la jornada
// y del manifiesto SIN cancelar la venta ("Ya la envié"). Se ve solo hasta cerrar la primera jornada.
interface Envio {
  id: number; venta: string | null; carrier: string; guia: string | null; destinatario: string | null; impresa: boolean
  compra: string | null; productos: string | null
}

const dm = (f: string | null) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}` : '—')

export default function PrimeraJornada({ onCambio }: { onCambio: (msg: string) => void }) {
  const [d, setD] = useState<{ hoy: string; envios: Envio[] } | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [marcadas, setMarcadas] = useState<Set<number>>(new Set())
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cargar = useCallback(() => fetch('/api/despachos/primera').then(r => (r.ok ? r.json() : null)).then(setD).catch(() => {}), [])
  useEffect(() => { cargar() }, [cargar])
  if (!d?.envios.length) return null
  const viejas = d.envios.filter(e => e.compra && e.compra < d.hoy)
  const marcar = (id: number) => setMarcadas(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const sacar = async () => {
    setOcupado(true); setError(null)
    const r = await fetch('/api/despachos/apartados', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'ya_enviadas', ids: [...marcadas] }) })
    const j = await r.json().catch(() => ({}))
    setOcupado(false)
    if (!r.ok) { setError(j.error ?? 'No se pudo'); return }
    setMarcadas(new Set()); setAbierto(false)
    onCambio(`${j.n ?? marcadas.size} envío(s) marcados «Ya la envié»: salen de esta jornada y del manifiesto. La venta no se cancela.`)
    cargar()
  }
  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900 space-y-2">
      <p className="font-medium">Es tu primer día en Despachos: llegaron también {viejas.length} guía(s) de días anteriores</p>
      <p className="text-xs">Si algunas ya las enviaste por tu cuenta antes de usar el sistema, márcalas aquí: salen de esta jornada y del manifiesto, y la venta <b>no</b> se cancela. No uses «No se enviará» para esas: esa opción es para ventas que no se concretaron.</p>
      {!abierto ? (
        <button type="button" onClick={() => setAbierto(true)} className="btn-secondary text-xs">¿Cuáles ya enviaste?</button>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2 text-xs">
            <button type="button" onClick={() => setMarcadas(new Set(viejas.map(e => e.id)))} className="btn-secondary text-xs">Marcar las de días anteriores ({viejas.length})</button>
            <button type="button" onClick={() => setMarcadas(new Set())} className="btn-secondary text-xs">Desmarcar todas</button>
          </div>
          <ul className="max-h-80 overflow-auto divide-y divide-sky-100 rounded-lg border border-sky-200 bg-white text-xs text-neutral-800">
            {d.envios.map(e => (
              <li key={e.id}>
                <label className="flex cursor-pointer items-start gap-2 px-3 py-2">
                  <input type="checkbox" checked={marcadas.has(e.id)} onChange={() => marcar(e.id)} className="mt-0.5" />
                  <span className="min-w-0">
                    <span className="font-medium">Compra {dm(e.compra)}{e.compra === d.hoy ? ' (hoy)' : ''}</span>
                    {' · '}{e.destinatario ?? 'sin nombre'} · {e.carrier} {e.guia ?? ''} · venta {e.venta ?? '—'}
                    {e.productos && <span className="block truncate text-neutral-500">📦 {e.productos}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {error && <p className="text-xs text-red-700">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={ocupado || !marcadas.size} onClick={sacar} className="btn-primary text-xs disabled:opacity-50">
              Ya las envié: sacar {marcadas.size || ''} de la jornada</button>
            <button type="button" onClick={() => setAbierto(false)} className="btn-secondary text-xs">Cerrar</button>
          </div>
          <p className="text-[11px] text-sky-800">Si ya imprimiste el PDF, las etiquetas de esas guías simplemente no se usan.</p>
        </div>
      )}
    </div>
  )
}
