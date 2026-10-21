'use client'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

// Cambiar stock en MercadoLibre (2026-10-21; API /api/stock-ml, lib/stockML.ts). UNA sola ventana para todo:
// el chip ✎ de Preguntas y Mensajes, la ficha de la publicación, "Reponer stock" de Preguntas y Stock → Pausadas.
// Corta a propósito (decisión del dueño: "no saturar"): un cuadro por publicación o variante; las gemelas (la misma
// mercancía en la otra cuenta) y el stock del inventario aparecen SOLO si existen.

interface Pub {
  item_id: string; cuenta: string; titulo: string; estado: string; disponible: number; imagen: string | null
  variantes: { id: string; nombre: string; disponible: number }[]
  variante_foco?: string | null
}
interface Datos { principal: Pub; variante_foco: string | null; gemelas: Pub[]; producto: { code: string; name: string; stock: number | null } | null }
export interface ResultadoStock { item_id: string; variante_id: string | null; ok: boolean; estado?: string; disponible?: number; total?: number; error?: string }

const clave = (item: string, v: string | null) => `${item}:${v ?? ''}`

export default function CambiarStock({ item, variante = null, origen, publicar, onCerrar, onGuardado }: {
  item: string; variante?: string | null; origen: 'preguntas' | 'mensajes' | 'ficha' | 'stock' | 'pausadas'
  /** Preguntas: casilla "Publicar mi respuesta al guardar" (marcada si ya escribió algo). */
  publicar?: boolean
  onCerrar: () => void
  onGuardado?: (resultados: ResultadoStock[], publicar: boolean) => void
}) {
  const [d, setD] = useState<Datos | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [valores, setValores] = useState<Record<string, string>>({})
  const [reactivar, setReactivar] = useState(true)
  const [conPublicar, setConPublicar] = useState(!!publicar)
  const [guardando, setGuardando] = useState(false)
  const [resultados, setResultados] = useState<Record<string, ResultadoStock>>({})

  useEffect(() => {
    let vivo = true
    fetch(`/api/stock-ml?item=${item}${variante ? `&variante=${variante}` : ''}`).then(async r => {
      const j = await r.json().catch(() => ({}))
      if (!vivo) return
      if (r.ok) setD(j); else setError(j.error ?? 'No se pudo leer la publicación en MercadoLibre')
    })
    return () => { vivo = false }
  }, [item, variante])

  // Esc cierra solo esta ventana (en captura en window: antes que la de atrás).
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onCerrar() } }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [onCerrar])

  const pubs = useMemo(() => (d ? [{ ...d.principal, variante_foco: d.variante_foco }, ...d.gemelas] : []), [d])
  const hayPausada = pubs.some(p => p.estado === 'paused')
  const cambios = pubs.flatMap(p => {
    const filas = p.variantes.length ? p.variantes.map(v => ({ v: v.id as string | null, actual: v.disponible })) : [{ v: null as string | null, actual: p.disponible }]
    return filas.flatMap(f => {
      const t = valores[clave(p.item_id, f.v)]
      if (t === undefined || t === '') return []
      const n = parseInt(t, 10)
      return Number.isFinite(n) && n !== f.actual ? [{ item_id: p.item_id, variante_id: f.v, cantidad: n }] : []
    })
  })
  // Reactivar sin cambiar la cantidad: la publicación pausada va igual (cantidad null = la que tiene).
  const aReactivar = reactivar ? pubs.filter(p => p.estado === 'paused' && !cambios.some(c => c.item_id === p.item_id))
    .map(p => ({ item_id: p.item_id, variante_id: null, cantidad: null })) : []
  const todo = [...cambios, ...aReactivar]
  const cuentas = new Set(todo.map(c => c.item_id)).size

  const guardar = async () => {
    if (!todo.length) return
    setGuardando(true); setError(null)
    const r = await fetch('/api/stock-ml', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cambios: todo, reactivar: reactivar && hayPausada, origen }),
    })
    const j = await r.json().catch(() => ({}))
    setGuardando(false)
    if (!r.ok) { setError(j.error ?? 'No se pudo guardar'); return }
    const res = j.resultados as ResultadoStock[]
    setResultados(Object.fromEntries(res.map(x => [clave(x.item_id, x.variante_id), x])))
    if (res.every(x => x.ok)) { onGuardado?.(res, conPublicar); onCerrar() }
  }

  const fila = (p: Pub, v: { id: string | null; nombre: string | null; disponible: number }, foco: boolean) => {
    const k = clave(p.item_id, v.id)
    const res = resultados[k] ?? (v.id ? undefined : resultados[clave(p.item_id, null)])
    return (
      <li key={k} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${foco ? 'bg-sky-50 ring-1 ring-inset ring-sky-200' : ''}`}>
        <span className="min-w-0 flex-1 truncate text-sm text-neutral-800" title={v.nombre ?? ''}>{v.nombre ?? 'Unidades'}</span>
        <span className={`shrink-0 text-xs tabular-nums ${v.disponible > 0 ? 'text-neutral-500' : 'text-red-600'}`}>{v.disponible} u.</span>
        <input inputMode="numeric" value={valores[k] ?? ''} placeholder={String(v.disponible)} aria-label={`Stock nuevo de ${v.nombre ?? p.titulo}`}
          onChange={e => setValores(x => ({ ...x, [k]: e.target.value.replace(/\D/g, '').slice(0, 5) }))}
          className="w-20 shrink-0 rounded-lg border border-neutral-300 px-2 py-1 text-right text-sm tabular-nums" />
        {res && <span className={`shrink-0 text-xs ${res.ok ? 'text-emerald-700' : 'text-red-600'}`} title={res.error}>{res.ok ? '✓' : '✕'}</span>}
      </li>
    )
  }

  const bloque = (p: Pub, i: number) => {
    const errores = Object.values(resultados).filter(r => r.item_id === p.item_id && !r.ok && r.error)
    return (
      <div key={p.item_id} className={i > 0 ? 'border-t border-neutral-100 pt-3' : ''}>
        {i > 0 && <p className="mb-1 text-[11px] font-medium text-neutral-500">La misma mercancía en la otra cuenta</p>}
        <div className="mb-1 flex items-center gap-2">
          <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-700">{p.cuenta}</span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-900" title={p.titulo}>{p.titulo}</span>
          {p.estado === 'paused' && <span className="shrink-0 text-[11px] font-medium text-amber-700">⏸ Pausada</span>}
        </div>
        <ul className="space-y-1">
          {p.variantes.length
            ? [...p.variantes].sort((a, b) => Number(b.id === p.variante_foco) - Number(a.id === p.variante_foco))
                .map(v => fila(p, v, v.id === p.variante_foco))
            : fila(p, { id: null, nombre: null, disponible: p.disponible }, false)}
        </ul>
        {errores.map((r, k) => <p key={k} className="mt-1 text-xs text-red-600">{r.error}</p>)}
      </div>
    )
  }

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onCerrar() }} role="dialog" aria-modal="true" aria-label="Cambiar stock en MercadoLibre">
      <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-neutral-100 px-4 py-3">
          <h3 className="font-semibold text-neutral-900">Stock en MercadoLibre</h3>
          <button onClick={onCerrar} className="btn-ghost !px-2 !py-1" aria-label="Cerrar">✕</button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {!d && !error && <p className="text-sm text-neutral-400">Leyendo la publicación en MercadoLibre…</p>}
          {d?.producto?.stock != null && (
            <p className="text-xs text-neutral-500">En tu inventario: <b className="font-medium text-neutral-700">{d.producto.stock} u.</b> · {d.producto.code}</p>
          )}
          {pubs.map(bloque)}
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>
        {d && (
          <div className="space-y-2 border-t border-neutral-100 px-4 py-3">
            {hayPausada && (
              <label className="flex items-center gap-2 text-sm text-neutral-700">
                <input type="checkbox" checked={reactivar} onChange={e => setReactivar(e.target.checked)} className="h-4 w-4 accent-neutral-900" />
                Reactivar la publicación pausada
              </label>
            )}
            {publicar !== undefined && (
              <label className="flex items-center gap-2 text-sm text-neutral-700">
                <input type="checkbox" checked={conPublicar} onChange={e => setConPublicar(e.target.checked)} className="h-4 w-4 accent-neutral-900" />
                Publicar mi respuesta al guardar
              </label>
            )}
            <div className="flex items-center justify-end gap-2">
              <button onClick={onCerrar} className="btn-ghost text-sm">Cancelar</button>
              <button onClick={guardar} disabled={guardando || !todo.length} className="btn-primary text-sm">
                {guardando ? 'Guardando…' : cuentas > 1 ? `Guardar en las ${cuentas} publicaciones` : 'Guardar en MercadoLibre'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
