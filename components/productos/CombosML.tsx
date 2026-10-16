'use client'
import { useCallback, useEffect, useState } from 'react'

// Combos (migración 098): cuántas unidades del producto trae cada publicación de MercadoLibre.
//  - PublicacionesML: en la ficha del producto, sus publicaciones por cuenta con su "trae N u.", editable.
//  - RevisarCombos: aviso en Productos con las publicaciones vinculadas en 1 cuyo título dice que son combo.

interface Publicacion { id: number; cuenta: string; codigo: string; unidades: number; titulo: string | null; permalink: string | null; sugeridas: number | null }
interface Posible { id: number; product_id: number; code: string; name: string; cuenta: string; codigo: string; titulo: string; sugeridas: number }

const urlML = (codigo: string, permalink: string | null) =>
  permalink ?? `https://articulo.mercadolibre.com.ve/MLV-${codigo.split(':')[0]}`

async function guardarUnidades(productoId: number, id: number, unidades: number) {
  const r = await fetch(`/api/products/${productoId}/publicaciones`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, unidades }),
  })
  return r.ok
}

/** Ficha del producto: publicaciones vinculadas, por cuenta, con cuántas unidades trae cada una. */
export function PublicacionesML({ productoId }: { productoId: number }) {
  const [lista, setLista] = useState<Publicacion[] | null>(null)
  const [editando, setEditando] = useState<Record<number, number>>({})
  const [msg, setMsg] = useState<string | null>(null)
  const cargar = useCallback(async () => {
    const r = await fetch(`/api/products/${productoId}/publicaciones`)
    const d = await r.json().catch(() => null)
    setLista(r.ok && d ? d.publicaciones : [])
  }, [productoId])
  useEffect(() => {
    let vivo = true
    fetch(`/api/products/${productoId}/publicaciones`).then(r => r.ok ? r.json() : null)
      .then(d => { if (vivo) setLista(d?.publicaciones ?? []) }).catch(() => { if (vivo) setLista([]) })
    return () => { vivo = false }
  }, [productoId])

  const guardar = async (p: Publicacion) => {
    const n = editando[p.id]
    if (n == null || n === p.unidades) return
    if (await guardarUnidades(productoId, p.id, n)) { setMsg('Guardado'); setEditando(e => { const x = { ...e }; delete x[p.id]; return x }); cargar() }
    else setMsg('No se pudo guardar')
  }
  const quitar = async (p: Publicacion) => {
    if (!confirm(`¿Quitar el vínculo con ${p.codigo}? Las próximas ventas de esa publicación ya no traerán este producto.`)) return
    const r = await fetch(`/api/products/${productoId}/publicaciones?vinculo=${p.id}`, { method: 'DELETE' })
    if (r.ok) cargar(); else setMsg('No se pudo quitar')
  }

  if (!lista) return <p className="text-xs text-neutral-400">Cargando…</p>
  if (!lista.length) return <p className="text-neutral-400 text-xs">Sin publicaciones de MercadoLibre vinculadas</p>
  const cuentas = [...new Set(lista.map(p => p.cuenta))]
  return (
    <div className="space-y-2">
      {cuentas.map(c => (
        <div key={c}>
          <p className="text-[11px] font-mono text-neutral-500 mb-1">{c}</p>
          <ul className="space-y-1">
            {lista.filter(p => p.cuenta === c).map(p => {
              const n = editando[p.id] ?? p.unidades
              return (
                <li key={p.id} className="flex items-center gap-2 bg-neutral-50 border border-neutral-200 rounded-lg px-2.5 py-1.5 text-xs">
                  <a href={urlML(p.codigo, p.permalink)} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-neutral-800 hover:underline" title={p.titulo ?? p.codigo}>
                    {p.titulo ?? p.codigo} <span className="font-mono text-neutral-400">{p.codigo}</span>
                  </a>
                  {p.unidades > 1 && <span className="rounded bg-emerald-100 text-emerald-800 px-1.5 py-px">combo</span>}
                  <span className="text-neutral-500">trae</span>
                  <input type="number" min={1} max={500} value={n}
                    onChange={e => setEditando({ ...editando, [p.id]: Math.max(1, Math.min(500, Number(e.target.value) || 1)) })}
                    onBlur={() => guardar(p)} onKeyDown={e => { if (e.key === 'Enter') guardar(p) }}
                    className="w-12 border border-neutral-300 rounded px-1 py-0.5 text-right" />
                  <span className="text-neutral-500">u.</span>
                  {p.sugeridas && p.unidades === 1 && editando[p.id] == null && (
                    <button onClick={() => setEditando({ ...editando, [p.id]: p.sugeridas! })} className="text-sky-700 underline" title="Lo dice el título">¿{p.sugeridas}?</button>
                  )}
                  <button onClick={() => quitar(p)} className="text-neutral-400 hover:text-red-700" title="Quitar el vínculo">✕</button>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
      {msg && <p className="text-[11px] text-neutral-500">{msg}</p>}
    </div>
  )
}

/** Productos: "N publicaciones vinculadas parecen combos" → revisarlas y poner cuántas trae cada una. */
export function RevisarCombos({ onCambio }: { onCambio: () => void }) {
  const [posibles, setPosibles] = useState<Posible[]>([])
  const [abierto, setAbierto] = useState(false)
  const [valores, setValores] = useState<Record<number, number>>({})
  const [guardando, setGuardando] = useState(false)
  useEffect(() => {
    let vivo = true
    fetch('/api/products/posibles-combos').then(r => r.ok ? r.json() : null)
      .then(d => { if (vivo && d) setPosibles(d.posibles) }).catch(() => {})
    return () => { vivo = false }
  }, [])
  if (!posibles.length) return null

  const guardar = async () => {
    setGuardando(true)
    for (const p of posibles) await guardarUnidades(p.product_id, p.id, valores[p.id] ?? p.sugeridas)
    setGuardando(false)
    setPosibles([]); setAbierto(false); onCambio()
  }
  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-900">
      <div className="flex flex-wrap items-center gap-2">
        <span>📦 <b>{posibles.length}</b> publicaci{posibles.length === 1 ? 'ón vinculada parece' : 'ones vinculadas parecen'} combo por su título: confirma cuántas unidades trae cada una para que las ventas descuenten bien el stock.</span>
        <button onClick={() => setAbierto(a => !a)} className="ml-auto btn-secondary text-xs">{abierto ? 'Cerrar' : 'Revisar'}</button>
      </div>
      {abierto && (
        <div className="mt-2 space-y-2">
          <ul className="divide-y divide-sky-100 rounded-lg border border-sky-200 bg-white text-xs">
            {posibles.map(p => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 px-3 py-1.5">
                <span className="min-w-0 flex-1 truncate" title={p.titulo}>
                  <span className="font-mono text-neutral-500">{p.code}</span> {p.name}
                  <span className="block text-neutral-400 truncate">{p.cuenta} · {p.titulo}</span>
                </span>
                <span className="text-neutral-500">trae</span>
                <input type="number" min={1} max={500} value={valores[p.id] ?? p.sugeridas}
                  onChange={e => setValores({ ...valores, [p.id]: Math.max(1, Math.min(500, Number(e.target.value) || 1)) })}
                  className="w-12 border border-neutral-300 rounded px-1 py-0.5 text-right" />
                <span className="text-neutral-500">u.</span>
                <button onClick={() => setValores({ ...valores, [p.id]: 1 })} className="text-neutral-500 underline">No es combo</button>
              </li>
            ))}
          </ul>
          <div className="flex justify-end">
            <button onClick={guardar} disabled={guardando} className="btn-primary text-xs">{guardando ? 'Guardando…' : 'Guardar todo'}</button>
          </div>
        </div>
      )}
    </div>
  )
}
