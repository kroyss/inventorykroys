'use client'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ResultadoStock } from './CambiarStock'

// Repartir el inventario entre las publicaciones de un producto SIN salir de Stock (20-11-2026, el dueño: «Repartir»
// llevaba a Stock vs inventario). Panel a la derecha, como las fichas del sistema. Lee lo mismo que la ventana de
// cambiar stock (/api/stock-ml: la publicación + sus gemelas = la misma mercancía en otras publicaciones/cuentas) y
// guarda por el mismo POST (aplicarCambio, queda registrado). Solo cuenta para el reparto la fila que ES este producto
// (la variante vinculada); las demás variantes de una publicación no se tocan ni se muestran.

interface Pub {
  item_id: string; cuenta: string; titulo: string; estado: string; disponible: number; imagen: string | null
  variantes: { id: string; nombre: string; disponible: number }[]
  variante_foco?: string | null
}
interface Datos {
  principal: Pub; variante_foco: string | null; gemelas: Pub[]
  producto: { code: string; name: string; stock: number | null } | null
  al_dia?: boolean
}
interface Linea { k: string; item_id: string; variante_id: string | null; cuenta: string; titulo: string; variante: string | null; actual: number; estado: string }

const clave = (item: string, v: string | null) => `${item}:${v ?? ''}`

export default function RepartirStock({ item, variante, onCerrar, onGuardado }: {
  item: string; variante: string | null; onCerrar: () => void; onGuardado?: (r: ResultadoStock[]) => void
}) {
  const [d, setD] = useState<Datos | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [valores, setValores] = useState<Record<string, string>>({})
  const [reactivar, setReactivar] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [resultados, setResultados] = useState<Record<string, ResultadoStock>>({})

  useEffect(() => {
    let vivo = true
    const v = variante && variante !== '0' ? `&variante=${variante}` : ''
    fetch(`/api/stock-ml?item=${item}${v}`).then(async r => {
      const j = await r.json().catch(() => ({}))
      if (!vivo) return
      if (r.ok) setD(j); else setError(j.error ?? 'No se pudo leer la publicación en MercadoLibre')
    }).catch(() => vivo && setError('No se pudo conectar'))
    return () => { vivo = false }
  }, [item, variante])

  // Esc cierra; la página de atrás no se desplaza mientras está abierto.
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onCerrar() } }
    window.addEventListener('keydown', h, true)
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', h, true); document.body.style.overflow = antes }
  }, [onCerrar])

  // Una línea por publicación: la variante que es este producto, o la publicación entera si no tiene variantes.
  const lineas = useMemo<Linea[]>(() => {
    if (!d) return []
    const pubs = [{ ...d.principal, variante_foco: d.variante_foco }, ...d.gemelas]
    const vistas = new Set<string>()
    return pubs.flatMap((p): Linea[] => {
      if (vistas.has(p.item_id)) return []
      vistas.add(p.item_id)
      const base = { item_id: p.item_id, cuenta: p.cuenta, titulo: p.titulo, estado: p.estado }
      if (!p.variantes.length) return [{ ...base, k: clave(p.item_id, null), variante_id: null, variante: null, actual: p.disponible }]
      const v = p.variantes.find(x => x.id === p.variante_foco)
      return v ? [{ ...base, k: clave(p.item_id, v.id), variante_id: v.id, variante: v.nombre, actual: v.disponible }] : []
    })
  }, [d])

  const stock = d?.producto?.stock ?? null
  const valor = (l: Linea) => { const t = valores[l.k]; return t === undefined || t === '' ? l.actual : parseInt(t, 10) || 0 }
  const repartido = lineas.reduce((s, l) => s + valor(l), 0)
  const pasa = stock != null && repartido > Math.max(0, stock)
  const cambios = lineas.filter(l => valor(l) !== l.actual).map(l => ({ item_id: l.item_id, variante_id: l.variante_id, cantidad: valor(l) }))
  const pausadas = lineas.filter(l => l.estado === 'paused')
  const aReactivar = reactivar ? [...new Set(pausadas.map(l => l.item_id))].filter(i => !cambios.some(c => c.item_id === i))
    .map(i => ({ item_id: i, variante_id: null, cantidad: null })) : []
  const todo = [...cambios, ...aReactivar]

  // «Repartir parejo»: el inventario en partes iguales; lo que sobra va primero a la publicación que se agotó.
  const parejo = () => {
    if (stock == null || !lineas.length) return
    const n = Math.max(0, stock), base = Math.floor(n / lineas.length), resto = n % lineas.length
    setValores(Object.fromEntries(lineas.map((l, i) => [l.k, String(base + (i < resto ? 1 : 0))])))
  }

  const guardar = async () => {
    if (!todo.length) return
    setGuardando(true); setError(null)
    try {
      const r = await fetch('/api/stock-ml', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cambios: todo, reactivar: reactivar && pausadas.length > 0, origen: 'stock' }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setError(j.error ?? 'No se pudo guardar'); return }
      const res = j.resultados as ResultadoStock[]
      setResultados(Object.fromEntries(res.map(x => [clave(x.item_id, x.variante_id), x])))
      onGuardado?.(res)
      if (res.every(x => x.ok)) onCerrar()
    } catch { setError('No se pudo conectar') } finally { setGuardando(false) }
  }

  return createPortal(
    <div className="fixed inset-0 z-[110] flex justify-end bg-black/40" role="dialog" aria-modal="true" aria-label="Repartir stock"
      onMouseDown={e => { if (e.target === e.currentTarget) onCerrar() }}>
      <div className="flex h-full w-full flex-col bg-white shadow-2xl sm:max-w-md">
        <div className="flex items-start gap-3 border-b border-neutral-200 px-4 py-3">
          {d?.principal.imagen
            ? <img src={d.principal.imagen} alt="" className="h-12 w-12 shrink-0 rounded-lg object-contain ring-1 ring-neutral-200" />
            : <div className="h-12 w-12 shrink-0 rounded-lg bg-neutral-100" />}
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">Repartir stock</p>
            <p className="line-clamp-2 text-sm font-medium text-neutral-900">{d?.producto?.name ?? d?.principal.titulo ?? 'Leyendo…'}</p>
            {d?.producto && <p className="font-mono text-[11px] text-neutral-400">{d.producto.code}</p>}
          </div>
          <button type="button" onClick={onCerrar} className="btn-ghost shrink-0 !px-2 !py-1" aria-label="Cerrar">✕</button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {!d && !error && <p className="text-sm text-neutral-400">Leyendo tus publicaciones en MercadoLibre…</p>}

          {d && stock != null && (
            <div className={`rounded-xl px-3.5 py-3 ring-1 ring-inset ${pasa ? 'bg-amber-50 ring-amber-200' : 'bg-neutral-50 ring-neutral-200'}`}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm text-neutral-600">Tienes <b className="num text-neutral-900">{stock}</b> en inventario</p>
                <p className={`text-sm font-semibold num ${pasa ? 'text-amber-700' : repartido === stock ? 'text-emerald-700' : 'text-neutral-700'}`}>
                  Repartiste {repartido} de {Math.max(0, stock)}
                </p>
              </div>
              {pasa && <p className="mt-1 text-xs text-amber-800">⚠ Pones más de lo que tienes: si se vende de más no vas a poder cumplir.</p>}
              {!d.al_dia && <p className="mt-1 text-xs text-neutral-500">Tu inventario no está marcado «al día»: revisa que ese número sea real.</p>}
              {lineas.length > 1 && stock > 0 && (
                <button type="button" onClick={parejo} className="mt-2 text-xs font-medium text-sky-700 underline-offset-2 hover:underline">
                  Repartir parejo entre las {lineas.length}
                </button>
              )}
            </div>
          )}

          {d && (
            <ul className="divide-y divide-neutral-100 rounded-xl ring-1 ring-neutral-200">
              {lineas.map(l => {
                const res = resultados[l.k] ?? resultados[clave(l.item_id, null)]
                return (
                  <li key={l.k} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-neutral-500">
                        <span className="rounded-full bg-neutral-100 px-1.5 py-px font-semibold text-neutral-700">{l.cuenta}</span>
                        <span className="font-mono">{l.item_id}</span>
                        {l.estado === 'paused' && <span className="font-medium text-amber-700">⏸ pausada</span>}
                      </p>
                      <p className="truncate text-sm text-neutral-800" title={l.titulo}>{l.variante ?? l.titulo}</p>
                      <p className={`text-[11px] num ${l.actual > 0 ? 'text-neutral-500' : 'text-red-600'}`}>Hoy en ML: {l.actual}</p>
                      {res && !res.ok && <p className="text-[11px] text-red-600">{res.error}</p>}
                    </div>
                    {res?.ok && <span className="text-sm text-emerald-700" aria-label="Guardado">✓</span>}
                    <input inputMode="numeric" value={valores[l.k] ?? ''} placeholder={String(l.actual)}
                      aria-label={`Stock nuevo en ${l.cuenta} ${l.item_id}`}
                      onChange={e => setValores(x => ({ ...x, [l.k]: e.target.value.replace(/\D/g, '').slice(0, 5) }))}
                      className="h-9 w-20 shrink-0 rounded-lg border border-neutral-300 px-2 text-right text-sm num" />
                  </li>
                )
              })}
              {!lineas.length && <li className="px-3 py-3 text-sm text-neutral-500">No encontré publicaciones vinculadas a este producto.</li>}
            </ul>
          )}

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>

        {d && (
          <div className="space-y-2 border-t border-neutral-200 px-4 py-3">
            {pausadas.length > 0 && (
              <label className="flex items-center gap-2 text-sm text-neutral-700">
                <input type="checkbox" checked={reactivar} onChange={e => setReactivar(e.target.checked)} className="h-4 w-4 accent-neutral-900" />
                Reactivar las pausadas
              </label>
            )}
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={onCerrar} className="btn-ghost h-9 py-0 text-sm">Cancelar</button>
              <button type="button" onClick={guardar} disabled={guardando || !todo.length} className="btn-primary h-9 py-0 text-sm">
                {guardando ? 'Guardando…' : pasa ? 'Guardar igual' : 'Guardar en MercadoLibre'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
