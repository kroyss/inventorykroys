'use client'
import { useEffect, useMemo, useState } from 'react'

// "Datos del producto" que la IA usa al responder (ml_item_notas): verlos, corregirlos y borrarlos,
// en la pregunta (DatosDeItem) y todos juntos en Preguntas → Configuración (DatosProductos).

export interface Dato { id: number; texto: string; created_at: string; por: string | null }
interface DatoConItem extends Dato { item_id: string; titulo: string | null; link: string | null; imagen: string | null; estado: string | null }

const fecha = (s: string) => new Date(s).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' })

/** Un dato: texto, fecha y quién lo anotó; Editar (en el lugar) y Borrar. */
function FilaDato({ d, onCambio }: { d: Dato; onCambio: () => void }) {
  const [editando, setEditando] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const guardar = async () => {
    if (!editando || editando.trim().length < 3) { setError('Escribe al menos 3 letras'); return }
    setOcupado(true); setError(null)
    const r = await fetch('/api/preguntas/notas', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: d.id, texto: editando }),
    })
    setOcupado(false)
    if (!r.ok) { setError('No se pudo guardar'); return }
    setEditando(null); onCambio()
  }
  const borrar = async () => {
    if (!confirm('¿Borrar este dato? La IA deja de usarlo en las próximas preguntas.')) return
    setOcupado(true)
    const r = await fetch(`/api/preguntas/notas?id=${d.id}`, { method: 'DELETE' })
    setOcupado(false)
    if (r.ok) onCambio(); else setError('No se pudo borrar')
  }

  if (editando !== null) return (
    <div className="space-y-1.5 py-1.5">
      <textarea value={editando} onChange={e => setEditando(e.target.value)} rows={2} maxLength={500} autoFocus
        className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-sky-100 focus:border-sky-300" />
      <div className="flex items-center gap-2">
        {error && <span className="text-xs text-red-600">{error}</span>}
        <button onClick={() => { setEditando(null); setError(null) }} className="ml-auto btn-ghost text-xs px-2.5 py-1">Cancelar</button>
        <button onClick={guardar} disabled={ocupado} className="btn-primary text-xs px-3 py-1">{ocupado ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </div>
  )
  return (
    <div className="group flex items-start gap-3 py-1.5">
      <p className="flex-1 text-sm text-neutral-800 whitespace-pre-line">{d.texto}</p>
      <span className="text-[11px] text-neutral-400 whitespace-nowrap pt-0.5">{fecha(d.created_at)}{d.por ? ` · ${d.por}` : ''}</span>
      <span className="flex gap-1 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <button onClick={() => setEditando(d.texto)} disabled={ocupado} className="text-[11px] text-neutral-500 hover:text-neutral-900 px-1">Editar</button>
        <button onClick={borrar} disabled={ocupado} className="text-[11px] text-neutral-400 hover:text-red-600 px-1">Borrar</button>
      </span>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  )
}

/** En la pregunta: "N datos guardados" despliega los de esa publicación. */
export function DatosDeItem({ itemId, n, version }: { itemId: string; n: number; version: number }) {
  const [abierto, setAbierto] = useState(false)
  // La lista leída y en qué `version` (datos anotados desde la tarjeta) se leyó: el total suma lo
  // anotado después sin releer.
  const [leido, setLeido] = useState<{ lista: Dato[]; version: number } | null>(null)
  const lista = leido?.lista ?? null

  const cargar = () => {
    const v = version
    fetch(`/api/preguntas/notas?item_id=${itemId}`).then(r => (r.ok ? r.json() : [])).then((d: Dato[]) => setLeido({ lista: d, version: v }))
  }
  // Se anotó uno nuevo con la lista abierta: se relee.
  useEffect(() => { if (version > 0 && abierto) cargar() }, [version]) // eslint-disable-line react-hooks/exhaustive-deps
  const total = leido ? leido.lista.length + (version - leido.version) : n + version

  if (total === 0) return null
  return <>
    <button onClick={() => { const a = !abierto; setAbierto(a); if (a) cargar() }}
      className="btn-ghost text-sm text-sky-700" title="Lo que la IA ya sabe de esta publicación">
      {total} dato{total === 1 ? '' : 's'} guardado{total === 1 ? '' : 's'} {abierto ? '▲' : '▼'}
    </button>
    {abierto && (
      <div className="basis-full order-last rounded-lg border border-sky-100 bg-sky-50/50 px-3 py-1.5 divide-y divide-sky-100">
        {!lista ? <p className="text-xs text-neutral-400 py-1.5">Cargando…</p>
          : lista.map(d => <FilaDato key={d.id} d={d} onCambio={cargar} />)}
      </div>
    )}
  </>
}

/** Preguntas → Configuración: todos los datos, agrupados por publicación, con buscador. */
export function DatosProductos() {
  const [lista, setLista] = useState<DatoConItem[] | null>(null)
  const [buscar, setBuscar] = useState('')
  const cargar = () => fetch('/api/preguntas/notas?todas=1').then(r => (r.ok ? r.json() : [])).then(setLista)
  useEffect(() => { cargar() }, [])

  const grupos = useMemo(() => {
    const q = buscar.trim().toLowerCase()
    const m = new Map<string, DatoConItem[]>()
    for (const d of lista ?? []) {
      if (q && !d.texto.toLowerCase().includes(q) && !(d.titulo ?? '').toLowerCase().includes(q) && !d.item_id.toLowerCase().includes(q)) continue
      m.set(d.item_id, [...(m.get(d.item_id) ?? []), d])
    }
    return [...m.values()]
  }, [lista, buscar])

  return (
    <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-semibold text-neutral-900">Datos de productos para la IA</h2>
          <p className="text-xs text-neutral-500">
            Lo que anotaste con &quot;Anotar dato del producto&quot;. La IA los usa al responder esa publicación: corrige o borra los que ya no apliquen.
          </p>
        </div>
        {lista && lista.length > 0 && (
          <input type="search" value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar producto o dato…"
            className="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm w-full sm:w-64" />
        )}
      </div>

      {!lista ? <p className="text-sm text-neutral-400">Cargando…</p>
        : lista.length === 0 ? <p className="text-sm text-neutral-500">Todavía no hay datos. Se anotan desde cada pregunta con &quot;Anotar dato del producto&quot;.</p>
        : grupos.length === 0 ? <p className="text-sm text-neutral-500">Nada coincide con la búsqueda.</p>
        : (
          <div className="divide-y divide-neutral-100">
            {grupos.map(g => {
              const it = g[0]
              const inactiva = it.estado && it.estado !== 'active'
              return (
                <div key={it.item_id} className="flex gap-3 py-3">
                  <div className="w-10 h-10 shrink-0 rounded-lg border border-neutral-200 bg-white overflow-hidden flex items-center justify-center">
                    {it.imagen
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={it.imagen} alt="" loading="lazy" className="w-full h-full object-contain" />
                      : <span className="text-neutral-300 text-xs">—</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                      {it.link
                        ? <a href={it.link} target="_blank" rel="noreferrer" className="font-medium text-neutral-800 text-sm truncate max-w-full hover:underline underline-offset-2">{it.titulo ?? it.item_id} <span className="text-neutral-400">↗</span></a>
                        : <span className="font-medium text-neutral-800 text-sm truncate">{it.titulo ?? it.item_id}</span>}
                      <span className="font-mono text-neutral-400">{it.item_id}</span>
                      {inactiva && <span className="rounded-full bg-neutral-100 text-neutral-600 px-2 py-0.5">publicación {it.estado === 'paused' ? 'pausada' : 'inactiva'}</span>}
                    </div>
                    <div className="divide-y divide-neutral-50">
                      {g.map(d => <FilaDato key={d.id} d={d} onCambio={cargar} />)}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
    </section>
  )
}
