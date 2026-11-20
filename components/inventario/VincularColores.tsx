'use client'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

// «Vincular por color» (20-11-2026, el dueño). Antes «Dividir por variantes» (17-11), una ventana dentro de Stock vs
// inventario con un enlace chico que nadie veía. Ahora es un panel a la derecha que se abre igual desde Automatizaciones →
// Stock y desde Stock vs inventario. Publicación vinculada ENTERA con variantes: el sistema no sabe qué color es cada
// producto.
//   Paso 1 · Vincular: cada color con su producto (sugerido por el nombre) → POST /api/vincular-ml { accion: 'dividir' }
//            (vincula cada variante y quita el vínculo entero).
//   Paso 2 · Stock (solo con el permiso de cambiar stock): cada color con lo que tienes y lo que hay en ML → POST /api/stock-ml.
//            Opcional: «Listo, después».

interface Variante { id: string; nombre: string | null; disponible: number; foto: string | null }
interface Prod { id: number; code: string; name: string; stock?: number }
interface Datos { item_id: string; titulo: string; estado: string | null; cuenta: string | null; variantes: Variante[]; vinculados: Prod[]
  /** Colores que ya tienen su producto (variante → product_id). */
  actuales: Record<string, number> }

const SIN_PESO = new Set(['color', 'talla', 'modelo', 'tamano', 'tamaño', 'diseno', 'diseño', 'tipo', 'de', 'y', 'con', 'x', 'para'])
const palabras = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/)
  .filter(w => w.length > 1 && !SIN_PESO.has(w))
/** La variante «Negro» → el producto que dice «negro» (solo si hay uno claramente mejor). */
function sugerir(variante: string | null, productos: { id: number; name: string }[]): number | null {
  if (!variante) return null
  const v = palabras(variante)
  const puntos = productos.map(p => { const n = new Set(palabras(p.name)); return { id: p.id, n: v.filter(w => n.has(w)).length } })
    .filter(x => x.n > 0).sort((a, b) => b.n - a.n)
  return puntos.length && (puntos.length === 1 || puntos[0].n > puntos[1].n) ? puntos[0].id : null
}

export default function VincularColores({ item, foco = null, imagen = null, conStock, onCerrar, onHecho }: {
  item: string
  /** Variante que se agotó (desde Stock): va primero y resaltada. */
  foco?: string | null
  imagen?: string | null
  /** Con el permiso de cambiar stock en ML: después de vincular, paso 2. */
  conStock: boolean
  onCerrar: () => void
  /** Se llama al vincular (y otra vez si guarda stock): la pantalla de atrás se relee. */
  onHecho: () => void
}) {
  const [d, setD] = useState<Datos | null>(null)
  const [todos, setTodos] = useState<Prod[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [elegido, setElegido] = useState<Record<string, number | null>>({})
  const [buscando, setBuscando] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [paso, setPaso] = useState<1 | 2>(1)
  const [valores, setValores] = useState<Record<string, string>>({})
  const [resultados, setResultados] = useState<Record<string, { ok: boolean; error?: string }>>({})

  useEffect(() => {
    let vivo = true
    Promise.all([
      fetch(`/api/vincular-ml?colores=${item}`, { cache: 'no-store' }).then(async r => ({ ok: r.ok, j: await r.json().catch(() => ({})) })),
      fetch('/api/vincular-ml?productos=1', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ productos: [] })),
    ]).then(([a, b]) => {
      if (!vivo) return
      setTodos(b.productos ?? [])
      if (!a.ok) { setError(a.j.error ?? 'No se pudo leer la publicación'); return }
      const datos = a.j as Datos
      if (foco) datos.variantes.sort((x, y) => Number(y.id === foco) - Number(x.id === foco))
      setD(datos)
      setElegido(Object.fromEntries(datos.variantes.map(v => [v.id, datos.actuales?.[v.id] ?? sugerir(v.nombre, datos.vinculados)])))
    }).catch(() => vivo && setError('No se pudo conectar'))
    return () => { vivo = false }
  }, [item, foco])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onCerrar() } }
    window.addEventListener('keydown', h, true)
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', h, true); document.body.style.overflow = antes }
  }, [onCerrar])

  const prod = (id: number | null | undefined) => (id == null ? null : d?.vinculados.find(y => y.id === id) ?? todos?.find(y => y.id === id) ?? null)
  const stockDe = (id: number | null | undefined) => (id == null ? null : todos?.find(y => y.id === id)?.stock ?? null)
  const variantes = d?.variantes ?? []
  const faltan = variantes.filter(v => elegido[v.id] == null).length
  const q = texto.trim().toLowerCase()
  const encontrados = q.length >= 2 ? (todos ?? []).filter(x => `${x.code} ${x.name}`.toLowerCase().includes(q)).slice(0, 8) : []

  const vincular = async () => {
    if (!d?.cuenta) { setError('No encontré la cuenta de esta publicación'); return }
    setGuardando(true); setError(null)
    try {
      const r = await fetch('/api/vincular-ml', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        accion: 'dividir', item: d.item_id.replace(/^[A-Z]{3}/, ''), cuenta: d.cuenta,
        asignaciones: variantes.map(v => ({ variante: v.id, product_id: elegido[v.id] })) }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setError(j.error ?? 'No se pudo vincular'); return }
      onHecho()
      if (conStock) setPaso(2); else onCerrar()
    } catch { setError('No se pudo conectar') } finally { setGuardando(false) }
  }

  const valor = (v: Variante) => { const t = valores[v.id]; return t === undefined || t === '' ? v.disponible : parseInt(t, 10) || 0 }
  const cambios = variantes.filter(v => valor(v) !== v.disponible).map(v => ({ item_id: d!.item_id, variante_id: v.id, cantidad: valor(v) }))
  // Lo que se pone de cada producto, sumando sus colores (un producto puede quedar en varios colores).
  const pasa = (v: Variante) => {
    const id = elegido[v.id]; const st = stockDe(id)
    if (st == null) return false
    return variantes.filter(x => elegido[x.id] === id).reduce((s, x) => s + valor(x), 0) > Math.max(0, st)
  }
  const guardarStock = async () => {
    if (!cambios.length) return
    setGuardando(true); setError(null)
    try {
      const r = await fetch('/api/stock-ml', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cambios, reactivar: d?.estado === 'paused', origen: 'stock' }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setError(j.error ?? 'No se pudo guardar'); return }
      const res = j.resultados as { variante_id: string | null; ok: boolean; error?: string }[]
      setResultados(Object.fromEntries(res.map(x => [x.variante_id ?? '', x])))
      onHecho()
      if (res.every(x => x.ok)) onCerrar()
    } catch { setError('No se pudo conectar') } finally { setGuardando(false) }
  }

  const foto = (v: Variante) => v.foto
    ? <img src={v.foto} alt="" loading="lazy" className="h-11 w-11 shrink-0 rounded-lg bg-white object-contain ring-1 ring-neutral-200" />
    : <span className="h-11 w-11 shrink-0 rounded-lg bg-neutral-100" aria-hidden />

  return createPortal(
    <div className="fixed inset-0 z-[110] flex justify-end bg-black/40" role="dialog" aria-modal="true" aria-label="Vincular por color"
      onMouseDown={e => { if (e.target === e.currentTarget) onCerrar() }}>
      <div className="flex h-full w-full flex-col bg-white shadow-2xl sm:max-w-md">
        <div className="flex items-start gap-3 border-b border-neutral-200 px-4 py-3">
          {imagen ? <img src={imagen} alt="" className="h-12 w-12 shrink-0 rounded-lg object-contain ring-1 ring-neutral-200" />
            : <div className="h-12 w-12 shrink-0 rounded-lg bg-neutral-100" />}
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
              Vincular por color · {paso === 1 ? 'paso 1 de 2' : 'paso 2 de 2'}
            </p>
            <p className="line-clamp-2 text-sm font-medium text-neutral-900">{d?.titulo ?? 'Leyendo…'}</p>
            {d && <p className="text-[11px] text-neutral-500"><b className="font-semibold text-neutral-700">{d.cuenta}</b> · <span className="font-mono">{d.item_id}</span></p>}
          </div>
          <button type="button" onClick={onCerrar} className="btn-ghost shrink-0 !px-2 !py-1" aria-label="Cerrar">✕</button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {!d && !error && <p className="text-sm text-neutral-400">Leyendo los colores de la publicación…</p>}

          {d && paso === 1 && <>
            <p className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900 ring-1 ring-inset ring-amber-200">
              Está vinculada <b>entera</b>{d.vinculados.length ? <> a {d.vinculados.map(x => x.code).join(', ')}</> : null}: el sistema no sabe qué
              color es cada producto. Elige el producto de cada color y toca <b>Vincular</b>.
            </p>
            <ul className="divide-y divide-neutral-100 rounded-xl ring-1 ring-neutral-200">
              {variantes.map(v => {
                const p = prod(elegido[v.id])
                return (
                  <li key={v.id} className={`space-y-2 px-3 py-2.5 ${v.id === foco ? 'bg-sky-50/60' : ''}`}>
                    <div className="flex items-center gap-3">
                      {foto(v)}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-neutral-900">{v.nombre ?? `Variante ${v.id}`}
                          {v.id === foco && <span className="ml-1.5 text-[11px] font-medium text-red-600">se agotó</span>}</p>
                        <p className={`text-[11px] ${v.disponible > 0 ? 'text-neutral-500' : 'text-red-600'}`}>Hoy en ML: {v.disponible}</p>
                      </div>
                    </div>
                    {buscando === v.id ? (
                      <div className="space-y-1">
                        <input autoFocus value={texto} onChange={e => setTexto(e.target.value)} placeholder={todos ? 'Busca por código o nombre' : 'Cargando productos…'}
                          className="h-9 w-full rounded-lg border border-neutral-300 px-2.5 text-base sm:text-sm" />
                        <div className="max-h-56 overflow-y-auto">
                          {encontrados.map(x => (
                            <button key={x.id} type="button" onClick={() => { setElegido(e => ({ ...e, [v.id]: x.id })); setBuscando(null) }}
                              className="block w-full truncate rounded-lg px-2 py-1.5 text-left text-sm hover:bg-neutral-100">
                              <span className="font-mono text-xs text-neutral-400">{x.code}</span> {x.name} <span className="text-neutral-400">· {x.stock} u.</span>
                            </button>
                          ))}
                          {q.length >= 2 && !encontrados.length && <p className="px-2 py-1 text-xs text-neutral-400">No hay productos con ese nombre</p>}
                        </div>
                        <button type="button" onClick={() => setBuscando(null)} className="text-xs text-neutral-500 underline">cancelar</button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        {p
                          ? <span className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-lime-100 px-2.5 py-1 font-medium text-lime-900" title={p.name}>✓ {p.code} · {p.name}</span>
                          : <span className="font-medium text-amber-700">Elige el producto:</span>}
                        {d.vinculados.filter(x => x.id !== elegido[v.id]).map(x => (
                          <button key={x.id} type="button" onClick={() => setElegido(e => ({ ...e, [v.id]: x.id }))} title={x.name}
                            className="rounded-full border border-neutral-300 px-2.5 py-1 hover:border-neutral-500">{x.code}</button>
                        ))}
                        <button type="button" onClick={() => { setBuscando(v.id); setTexto('') }}
                          className="rounded-full px-2 py-1 text-neutral-500 underline-offset-2 hover:text-neutral-800 hover:underline">otro producto…</button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </>}

          {d && paso === 2 && <>
            <p className="rounded-xl bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-900 ring-1 ring-inset ring-emerald-200">
              ✓ Listo, cada color quedó con su producto. Ahora, si quieres, pon el stock de cada color en MercadoLibre.
            </p>
            <ul className="divide-y divide-neutral-100 rounded-xl ring-1 ring-neutral-200">
              {variantes.map(v => {
                const st = stockDe(elegido[v.id])
                const res = resultados[v.id]
                return (
                  <li key={v.id} className="flex items-center gap-3 px-3 py-2.5">
                    {foto(v)}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-neutral-900">{v.nombre ?? `Variante ${v.id}`}</p>
                      <p className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-neutral-500">
                        <span className={v.disponible > 0 ? '' : 'text-red-600'}>Hoy en ML: {v.disponible}</span>
                        {st != null && <span>· Tienes {st}</span>}
                        {st != null && st > 0 && st !== valor(v) && (
                          <button type="button" onClick={() => setValores(x => ({ ...x, [v.id]: String(st) }))}
                            className="rounded-full bg-emerald-50 px-1.5 py-px font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200 hover:bg-emerald-100">poner {st}</button>
                        )}
                      </p>
                      {pasa(v) && <p className="text-[11px] font-medium text-amber-700">⚠ más de lo que tienes</p>}
                      {res && !res.ok && <p className="text-[11px] text-red-600">{res.error}</p>}
                    </div>
                    {res?.ok && <span className="text-sm text-emerald-700" aria-label="Guardado">✓</span>}
                    <input inputMode="numeric" value={valores[v.id] ?? ''} placeholder={String(v.disponible)} aria-label={`Stock nuevo de ${v.nombre ?? v.id}`}
                      onChange={e => setValores(x => ({ ...x, [v.id]: e.target.value.replace(/\D/g, '').slice(0, 5) }))}
                      className="h-9 w-20 shrink-0 rounded-lg border border-neutral-300 px-2 text-right text-sm num" />
                  </li>
                )
              })}
            </ul>
          </>}

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>

        {d && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-neutral-200 px-4 py-3">
            {paso === 1 ? <>
              {faltan > 0 && <span className="mr-auto text-xs text-amber-700">Faltan {faltan} color{faltan === 1 ? '' : 'es'} por elegir</span>}
              <button type="button" onClick={onCerrar} className="btn-ghost h-9 py-0 text-sm">Cancelar</button>
              <button type="button" disabled={guardando || faltan > 0} onClick={vincular} className="btn-primary h-9 py-0 text-sm disabled:opacity-50">
                {guardando ? 'Vinculando…' : 'Vincular'}</button>
            </> : <>
              <button type="button" onClick={onCerrar} className="btn-ghost h-9 py-0 text-sm">Listo, después</button>
              <button type="button" disabled={guardando || !cambios.length} onClick={guardarStock} className="btn-primary h-9 py-0 text-sm disabled:opacity-50">
                {guardando ? 'Guardando…' : 'Guardar en MercadoLibre'}</button>
            </>}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
