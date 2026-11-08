'use client'
import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

// Cambios en lote (08-11): avance de cada lote (precios, encabezado/pie, lectura de descripciones) y el detalle de cada
// publicación. Los procesa el sistema de a poco (cron cada minuto), aunque nadie tenga la pantalla abierta.
interface Lote { id: number; tipo: string; titulo: string; estado: string; total: number; creado_at: string; terminado_at: string | null; usuario: string | null
  ok: number; sin_cambio: number; saltadas: number; errores: number; pendientes: number }
interface Item { item_id: string; estado: string; mensaje: string | null; datos: Record<string, unknown> | null; hecho_at: string | null; titulo: string | null; cuenta: string | null }

const ESTADO_ITEM: Record<string, [string, string]> = {
  ok: ['Hecho', 'text-emerald-700'], sin_cambio: ['Ya estaba', 'text-neutral-500'], saltada: ['Saltada', 'text-amber-700'],
  error: ['Error', 'text-red-700'], pendiente: ['En cola', 'text-neutral-400'], procesando: ['Mandando…', 'text-sky-700'],
}

export default function LotesClient() {
  const inicial = Number(useSearchParams().get('lote')) || null
  const [lotes, setLotes] = useState<Lote[] | null>(null)
  const [abierto, setAbierto] = useState<number | null>(inicial)
  const [items, setItems] = useState<Item[] | null>(null)

  const cargar = useCallback(() => {
    fetch('/api/publicaciones/lotes').then(r => r.json()).then(d => setLotes(d.lotes ?? [])).catch(() => setLotes([]))
  }, [])
  useEffect(() => { cargar() }, [cargar])
  const enCurso = !!lotes?.some(l => l.estado === 'en_curso')
  useEffect(() => {
    if (!enCurso) return
    const t = setInterval(cargar, 15000)
    return () => clearInterval(t)
  }, [enCurso, cargar])
  useEffect(() => {
    if (!abierto) return
    let vivo = true
    fetch(`/api/publicaciones/lotes/${abierto}`).then(r => r.json()).then(d => { if (vivo) setItems(d.items ?? []) }).catch(() => { if (vivo) setItems([]) })
    return () => { vivo = false }
  }, [abierto, lotes])

  const cancelar = async (id: number) => {
    if (!confirm('¿Cancelar lo que falta? Lo que ya se mandó a MercadoLibre queda como está.')) return
    await fetch(`/api/publicaciones/lotes/${id}`, { method: 'DELETE' })
    cargar()
  }

  if (!lotes) return <div className="h-40 rounded-xl border border-neutral-200 bg-neutral-50 animate-pulse" />
  if (!lotes.length) return <p className="text-sm text-neutral-500 bg-white rounded-xl border border-neutral-200 px-4 py-6 text-center">Todavía no hay cambios en lote. Se crean desde la lista de Publicaciones (elegir varias) o desde «Textos de descripción».</p>
  return (
    <ul className="space-y-2">
      {lotes.map(l => {
        const hechos = l.total - l.pendientes
        const pct = l.total ? Math.round(hechos * 100 / l.total) : 100
        return (
          <li key={l.id} className="bg-white rounded-xl border border-neutral-200 shadow-sm">
            <button type="button" onClick={() => { setItems(null); setAbierto(abierto === l.id ? null : l.id) }} className="w-full text-left px-4 py-3 space-y-1.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-neutral-900">{l.titulo}</span>
                <span className="text-xs text-neutral-500">{new Date(l.creado_at).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })}{l.usuario ? ` · ${l.usuario}` : ''}</span>
              </div>
              <div className="h-1.5 rounded-full bg-neutral-100 overflow-hidden"><div className={`h-full ${l.estado === 'cancelado' ? 'bg-neutral-400' : 'bg-lime-500'}`} style={{ width: `${pct}%` }} /></div>
              <div className="flex flex-wrap gap-x-3 text-xs text-neutral-600">
                <span>{l.estado === 'en_curso' ? `${hechos} de ${l.total}` : l.estado === 'cancelado' ? 'Cancelado' : 'Terminado'}</span>
                {l.ok > 0 && <span className="text-emerald-700">{l.ok} hechas</span>}
                {l.sin_cambio > 0 && <span>{l.sin_cambio} ya estaban</span>}
                {l.saltadas > 0 && <span className="text-amber-700">{l.saltadas} saltadas</span>}
                {l.errores > 0 && <span className="text-red-700">{l.errores} con error</span>}
              </div>
            </button>
            {abierto === l.id && (
              <div className="border-t border-neutral-100 px-4 py-3 space-y-2">
                {l.estado === 'en_curso' && <div className="flex justify-end"><button type="button" onClick={() => cancelar(l.id)} className="text-xs text-red-600 hover:underline">Cancelar lo que falta</button></div>}
                {!items ? <p className="text-xs text-neutral-500">Cargando…</p> : (
                  <ul className="divide-y divide-neutral-100 max-h-96 overflow-y-auto text-xs">
                    {items.map(i => {
                      const [txt, cls] = ESTADO_ITEM[i.estado] ?? [i.estado, '']
                      const pa = i.datos?.precio_antes, pd = i.datos?.precio_nuevo
                      return (
                        <li key={i.item_id} className="py-1.5 flex flex-wrap gap-x-3">
                          <span className={`w-20 font-medium ${cls}`}>{txt}</span>
                          <a href={`/publicaciones/${i.item_id}`} className="min-w-0 flex-1 truncate text-neutral-800 hover:underline">{i.titulo ?? i.item_id}</a>
                          <span className="text-neutral-400">{i.item_id}{i.cuenta ? ` · ${i.cuenta}` : ''}</span>
                          {pa != null && pd != null && <span className="num text-neutral-600">{String(pa)} → {String(pd)}</span>}
                          {i.mensaje && <span className="basis-full text-neutral-500 pl-[5.75rem]">{i.mensaje}</span>}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
