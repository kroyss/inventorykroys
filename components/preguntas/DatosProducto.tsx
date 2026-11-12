'use client'
import { useEffect, useMemo, useState } from 'react'
import { Ventana } from '@/components/ui/Ventana'

// "Datos del producto" que la IA usa al responder (ml_item_notas): verlos, corregirlos y borrarlos,
// en la pregunta (BotonDatos, ventana en components/ia/CorregirIA.tsx) y todos juntos en Preguntas → Configuración (DatosProductos).

export interface Dato { id: number; texto: string; created_at: string; por: string | null }
interface DatoConItem extends Dato { item_id: string; titulo: string | null; link: string | null; imagen: string | null; estado: string | null }

const fecha = (s: string) => new Date(s).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' })

/** Un dato: texto, fecha y quién lo anotó; Editar (en el lugar) y Borrar. */
export function FilaDato({ d, onCambio }: { d: Dato; onCambio: () => void }) {
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

/** 12-11 (mig 171): casilla «Esta publicación solo la responde mi equipo». `onCambio` avisa a la lista. */
/** `onEstado` = cómo está (al leerla y al cambiarla). */
export function SoloEquipo({ itemId, onCambio, onEstado }: { itemId: string; onCambio?: (solo: boolean) => void; onEstado?: (solo: boolean) => void }) {
  const [solo, setSolo] = useState<boolean | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let vivo = true
    fetch('/api/preguntas/solo-equipo').then(r => (r.ok ? r.json() : [])).then((l: { item_id: string }[]) => { if (!vivo) return; const v = l.some(x => x.item_id === itemId); setSolo(v); onEstado?.(v) }).catch(() => {})
    return () => { vivo = false }
  }, [itemId]) // eslint-disable-line react-hooks/exhaustive-deps
  const cambiar = async (v: boolean) => {
    setSolo(v); setError(false)
    const r = await fetch('/api/preguntas/solo-equipo', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: itemId, solo: v }) }).catch(() => null)
    if (!r?.ok) { setSolo(!v); setError(true); return }
    onCambio?.(v); onEstado?.(v)
  }
  return (
    <label className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer ${solo ? 'border-amber-300 bg-amber-50' : 'border-neutral-200 bg-neutral-50'}`}>
      <input type="checkbox" checked={!!solo} disabled={solo === null} onChange={e => cambiar(e.target.checked)} className="mt-0.5 accent-amber-600" />
      <span>
        <span className="font-medium text-neutral-900">Esta publicación solo la responde mi equipo</span>
        <span className="block text-[11px] text-neutral-500">La IA no responde sola aquí (ni en Modo Total): las preguntas quedan en Sin responder para tu equipo.</span>
        {error && <span className="block text-xs text-red-600">No se pudo guardar</span>}
      </span>
    </label>
  )
}

interface Publicacion { item_id: string; titulo: string; estado: string | null; link: string | null; imagen: string | null; cuenta?: string; datos?: number }

function Miniatura({ src }: { src: string | null }) {
  return (
    <div className="w-10 h-10 shrink-0 rounded-lg border border-neutral-200 bg-white overflow-hidden flex items-center justify-center">
      {src
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={src} alt="" loading="lazy" className="w-full h-full object-contain" />
        : <span className="text-neutral-300 text-xs">—</span>}
    </div>
  )
}

/** 12-11 (el dueño): anotar datos a cualquier publicación ANTES de que lleguen las preguntas. Buscar (activas y pausadas,
 *  todas las cuentas) → elegir → escribir uno o varios datos seguidos. `inicial` = abrir ya con esa publicación. */
function VentanaAgregar({ inicial, onCerrar, onCambio, onSolo }: { inicial: Publicacion | null; onCerrar: () => void; onCambio: () => void; onSolo: (item: Publicacion, solo: boolean) => void }) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState<Publicacion[] | null>(null)
  const [elegida, setElegida] = useState<Publicacion | null>(inicial)
  const [datos, setDatos] = useState<Dato[] | null>(null)
  const [texto, setTexto] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const t = q.trim()
    if (t.length < 2) return
    const c = new AbortController()
    const h = setTimeout(() => {
      fetch(`/api/preguntas/notas?buscar=${encodeURIComponent(t)}`, { signal: c.signal })
        .then(r => (r.ok ? r.json() : [])).then(setRes).catch(() => {})
    }, 300)
    return () => { clearTimeout(h); c.abort() }
  }, [q])

  const cargarDatos = (id: string) => fetch(`/api/preguntas/notas?item_id=${id}`).then(r => (r.ok ? r.json() : [])).then(setDatos)
  useEffect(() => { if (elegida) cargarDatos(elegida.item_id) }, [elegida])

  const guardar = async () => {
    if (!elegida || texto.trim().length < 3 || ocupado) return
    setOcupado(true); setError(null)
    const r = await fetch('/api/preguntas/notas', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: elegida.item_id, texto: texto.trim() }) }).catch(() => null)
    setOcupado(false)
    if (!r?.ok) { setError('No se pudo guardar'); return }
    setTexto(''); cargarDatos(elegida.item_id); onCambio()
  }

  return (
    <Ventana titulo={elegida ? 'Datos para la IA' : 'Agregar datos a un producto'} onCerrar={onCerrar}>
      {!elegida ? <>
        <input type="search" value={q} onChange={e => { setQ(e.target.value); if (e.target.value.trim().length < 2) setRes(null) }} autoFocus
          placeholder="Busca por título o código (MLV…)"
          className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-100 focus:border-sky-300" />
        <p className="text-[11px] text-neutral-500">Busca en tus publicaciones activas y pausadas de todas tus cuentas.</p>
        {res && (res.length === 0 ? <p className="text-sm text-neutral-500">No encontré publicaciones con eso.</p> : (
          <ul className="divide-y divide-neutral-100">
            {res.map(p => (
              <li key={p.item_id}>
                <button type="button" onClick={() => setElegida(p)} className="w-full flex items-center gap-3 py-2 text-left hover:bg-neutral-50 rounded-lg px-1">
                  <Miniatura src={p.imagen} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-neutral-900 truncate">{p.titulo}</span>
                    <span className="block text-[11px] text-neutral-400">
                      <span className="font-mono">{p.item_id}</span>{p.cuenta ? ` · ${p.cuenta}` : ''}{p.estado && p.estado !== 'active' ? ' · pausada' : ''}
                      {p.datos ? <span className="text-sky-700"> · {p.datos} dato{p.datos === 1 ? '' : 's'}</span> : ''}
                    </span>
                  </span>
                  <span className="text-xs text-sky-700 shrink-0">Elegir</span>
                </button>
              </li>
            ))}
          </ul>
        ))}
      </> : <>
        <div className="flex items-center gap-3">
          <Miniatura src={elegida.imagen} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-neutral-900 truncate">{elegida.titulo}</p>
            <p className="text-[11px] text-neutral-400 font-mono">{elegida.item_id}</p>
          </div>
          {!inicial && <button type="button" onClick={() => { setElegida(null); setDatos(null) }} className="text-xs text-sky-700 hover:underline shrink-0">Cambiar</button>}
        </div>
        <SoloEquipo itemId={elegida.item_id} onCambio={v => onSolo(elegida, v)} />
        <div className="space-y-1.5">
          <label htmlFor="dato-nuevo" className="block text-sm font-medium text-neutral-900">¿Qué debe saber la IA de este producto?</label>
          <textarea id="dato-nuevo" value={texto} onChange={e => setTexto(e.target.value)} rows={2} maxLength={500} autoFocus
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); guardar() } }}
            placeholder="Ej.: Material: PVC rígido · No trae batería · Sirve para cualquier vehículo"
            className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-sky-100 focus:border-sky-300" />
          <p className="text-[11px] text-neutral-500">Datos fijos del producto (material, medidas, compatibilidad, qué incluye). La IA los usa en Preguntas y en Mensajes. No pongas precios ni stock: cambian.</p>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onCerrar} className="btn-ghost text-sm">Listo</button>
            <button type="button" onClick={guardar} disabled={ocupado || texto.trim().length < 3} className="btn-primary text-sm">{ocupado ? 'Guardando…' : 'Guardar dato'}</button>
          </div>
        </div>
        <div className="border-t border-neutral-100 pt-2">
          <p className="text-xs font-medium text-neutral-600">Ya guardados{datos ? ` (${datos.length})` : ''}</p>
          {!datos ? <p className="text-xs text-neutral-400 py-1.5">Cargando…</p>
            : datos.length === 0 ? <p className="text-xs text-neutral-400 py-1.5">Ninguno todavía.</p>
            : <div className="divide-y divide-neutral-50">{datos.map(d => <FilaDato key={d.id} d={d} onCambio={() => { cargarDatos(elegida.item_id); onCambio() }} />)}</div>}
        </div>
      </>}
    </Ventana>
  )
}

/** Preguntas → Configuración y Mensajes: todos los datos, agrupados por publicación, con buscador y «Agregar». */
export function DatosProductos() {
  const [lista, setLista] = useState<DatoConItem[] | null>(null)
  const [buscar, setBuscar] = useState('')
  const [agregar, setAgregar] = useState<{ inicial: Publicacion | null } | null>(null)
  // Marcadas «solo mi equipo» (las que no tienen datos se muestran igual, con lo que se sepa de ellas).
  const [solo, setSolo] = useState<Map<string, Publicacion>>(new Map())
  const cargar = () => fetch('/api/preguntas/notas?todas=1').then(r => (r.ok ? r.json() : [])).then(setLista)
  useEffect(() => {
    cargar()
    fetch('/api/preguntas/solo-equipo').then(r => (r.ok ? r.json() : [])).then((l: Publicacion[]) =>
      setSolo(new Map(l.map(x => [x.item_id, x])))).catch(() => {})
  }, [])
  const marcarSolo = (it: Publicacion, v: boolean) => setSolo(m => { const n = new Map(m); if (v) n.set(it.item_id, it); else n.delete(it.item_id); return n })

  // Grupos por publicación: las que tienen datos y las marcadas «solo mi equipo» (aunque no tengan datos), primero esas.
  const grupos = useMemo(() => {
    const q = buscar.trim().toLowerCase()
    const m = new Map<string, { it: Publicacion; datos: DatoConItem[] }>()
    for (const d of lista ?? []) {
      if (q && !d.texto.toLowerCase().includes(q) && !(d.titulo ?? '').toLowerCase().includes(q) && !d.item_id.toLowerCase().includes(q)) continue
      const g = m.get(d.item_id) ?? { it: { item_id: d.item_id, titulo: d.titulo ?? d.item_id, estado: d.estado, link: d.link, imagen: d.imagen }, datos: [] }
      g.datos.push(d); m.set(d.item_id, g)
    }
    for (const it of solo.values()) {
      if (m.has(it.item_id) || (q && !it.titulo.toLowerCase().includes(q) && !it.item_id.toLowerCase().includes(q))) continue
      m.set(it.item_id, { it, datos: [] })
    }
    return [...m.values()].sort((a, b) => Number(solo.has(b.it.item_id)) - Number(solo.has(a.it.item_id)))
  }, [lista, buscar, solo])

  return (
    <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-semibold text-neutral-900">Datos de productos para la IA</h2>
          <p className="text-xs text-neutral-500">
            Lo que la IA sabe de cada publicación y usa al responder en Preguntas y en Mensajes. Agrega datos antes de que pregunten, y corrige o borra los que ya no apliquen.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          {lista && lista.length > 0 && (
            <input type="search" value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar en lo guardado…"
              className="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm flex-1 sm:w-56" />
          )}
          <button type="button" onClick={() => setAgregar({ inicial: null })} className="btn-primary text-sm whitespace-nowrap">+ Agregar datos a un producto</button>
        </div>
      </div>
      {agregar && <VentanaAgregar inicial={agregar.inicial} onCerrar={() => setAgregar(null)} onCambio={cargar} onSolo={marcarSolo} />}

      {!lista ? <p className="text-sm text-neutral-400">Cargando…</p>
        : lista.length === 0 && solo.size === 0 ? <p className="text-sm text-neutral-500">Todavía no hay datos. Toca «+ Agregar datos a un producto», o se anotan desde cada pregunta y al corregir a la IA.</p>
        : grupos.length === 0 ? <p className="text-sm text-neutral-500">Nada coincide con la búsqueda.</p>
        : (
          <div className="divide-y divide-neutral-100">
            {grupos.map(({ it, datos: g }) => {
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
                      {solo.has(it.item_id) && <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 font-medium">Solo la responde tu equipo</span>}
                    </div>
                    <div className="divide-y divide-neutral-50">
                      {g.map(d => <FilaDato key={d.id} d={d} onCambio={cargar} />)}
                    </div>
                    <button type="button" onClick={() => setAgregar({ inicial: it })}
                      className="text-xs text-sky-700 hover:underline">{g.length ? '+ Agregar otro dato' : '+ Agregar dato'} · Responde solo mi equipo</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
    </section>
  )
}
