'use client'
// «La registré como venta local» (mig 165, 11-11): enlaza una venta de ML con la venta LOCAL-… que el equipo cargó a mano
// (cobro destino). Se usa en Ventas → Por confirmar y en Calificaciones. API: /api/sales/enlazar-local.
import { useState } from 'react'

interface Candidata { id: number; numero: string; cliente: string | null; total: number | null; created_at: string; status: string
  productos: string | null; mismo_producto: boolean; parecido: number; enlazada_a: string | null }

export default function EnlazarLocal({ numero, enlazada = false, onHecho, className = '' }: {
  numero: string; enlazada?: boolean; onHecho?: () => void; className?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [datos, setDatos] = useState<{ enlazada: number | null; comprador: string | null; ventas: Candidata[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const abrir = async () => {
    setAbierto(true); setDatos(null); setError(null)
    const r = await fetch(`/api/sales/enlazar-local?numero=${encodeURIComponent(numero)}`).catch(() => null)
    const j = await r?.json().catch(() => null)
    if (!r?.ok) setError(j?.error ?? 'No se pudo cargar'); else setDatos(j)
  }
  const guardar = async (saleId: number | null) => {
    setGuardando(true); setError(null)
    const r = await fetch('/api/sales/enlazar-local', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ numero, saleId }) }).catch(() => null)
    setGuardando(false)
    if (!r?.ok) { setError((await r?.json().catch(() => null))?.error ?? 'No se pudo guardar'); return }
    setAbierto(false); onHecho?.()
  }

  return (
    <>
      <button type="button" onClick={abrir}
        className={`text-xs font-medium text-sky-700 hover:text-sky-900 hover:underline ${className}`}>
        {enlazada ? '🔗 Enlazada a venta local · cambiar' : '🔗 La registré como venta local'}
      </button>
      {abierto && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center" onClick={() => setAbierto(false)}>
          <div className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="border-b border-neutral-200 px-4 py-3">
              <p className="font-semibold text-neutral-900">Enlazar con una venta local</p>
              <p className="text-xs text-neutral-500">Venta de MercadoLibre {numero}{datos?.comprador ? ` · ${datos.comprador}` : ''}. Elige la venta LOCAL que registraron por ella:
                queda como registrada (sale del aviso y en Calificaciones cuenta como concretada). No cambia la venta local ni el inventario.</p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {error && <p className="m-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
              {!datos && !error && <p className="p-6 text-center text-sm text-neutral-400">Cargando…</p>}
              {datos && !datos.ventas.length && <p className="p-6 text-center text-sm text-neutral-500">No hay ventas LOCAL cerca de esa fecha.</p>}
              <ul className="divide-y divide-neutral-100">
                {datos?.ventas.map(v => {
                  const esta = datos.enlazada === v.id
                  return (
                    <li key={v.id} className={`flex items-center gap-3 px-4 py-2.5 ${esta ? 'bg-sky-50' : ''}`}>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <span className="font-mono text-xs text-neutral-700">{v.numero}</span>
                          <span className="text-sm font-medium text-neutral-800 truncate">{v.cliente ?? 'Sin nombre'}</span>
                          <span className="text-xs text-neutral-400">{new Date(v.created_at).toLocaleDateString('es-VE')}</span>
                          {v.mismo_producto && <span className="rounded-full bg-emerald-50 px-1.5 text-[10px] font-medium text-emerald-700">mismo producto</span>}
                        </div>
                        <p className="text-xs text-neutral-500 line-clamp-1">{v.productos ?? '—'}{v.total != null ? ` · ${v.total.toLocaleString('de-DE', { minimumFractionDigits: 2 })}` : ''}</p>
                        {v.enlazada_a && !esta && <p className="text-[11px] text-amber-700">Ya enlazada a la venta ML {v.enlazada_a}</p>}
                      </div>
                      {esta
                        ? <button type="button" disabled={guardando} onClick={() => guardar(null)} className="btn-secondary !px-3 !py-1 text-xs">Deshacer</button>
                        : <button type="button" disabled={guardando} onClick={() => guardar(v.id)} className="btn-primary !px-3 !py-1 text-xs">Enlazar</button>}
                    </li>
                  )
                })}
              </ul>
            </div>
            <div className="border-t border-neutral-200 px-4 py-2.5 text-right">
              <button type="button" onClick={() => setAbierto(false)} className="btn-secondary text-sm">Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
