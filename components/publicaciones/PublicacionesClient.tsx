'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Fila {
  item_id: string; titulo: string; precio: number | null; moneda: string | null; disponible: number; estado: string
  thumbnail: string | null; sku: string | null; cuenta: string; variantes: number; editada_at: string | null
}
interface Respuesta { filas: Fila[]; total: number; porPagina: number; cuentas: { id: number; nickname: string }[] }

const precio = (n: number | null, m: string | null) => n == null ? '—'
  : `${m === 'COP' ? '$' : 'US$'} ${n.toLocaleString('de-DE', { maximumFractionDigits: m === 'COP' ? 0 : 2, minimumFractionDigits: m === 'COP' ? 0 : 2 })}`

/** Publicaciones (Fase 6): buscar una publicación de las cuentas conectadas y abrir su editor. */
export default function PublicacionesClient() {
  const [q, setQ] = useState('')
  const [buscar, setBuscar] = useState('')
  const [cuenta, setCuenta] = useState('')
  const [estado, setEstado] = useState('')
  const [pagina, setPagina] = useState(1)
  const [r, setR] = useState<Respuesta | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => { const t = setTimeout(() => { setBuscar(q); setPagina(1) }, 300); return () => clearTimeout(t) }, [q])
  useEffect(() => {
    let vivo = true
    const p = new URLSearchParams({ q: buscar, cuenta, estado, pagina: String(pagina) })
    fetch(`/api/publicaciones?${p}`).then(x => x.ok ? x.json() : Promise.reject())
      .then(d => { if (vivo) { setR(d); setError(false) } }).catch(() => { if (vivo) setError(true) })
    return () => { vivo = false }
  }, [buscar, cuenta, estado, pagina])

  const paginas = r ? Math.max(1, Math.ceil(r.total / r.porPagina)) : 1
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por título, SKU o número (MLV…)"
          className="flex-1 min-w-[220px] rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
        {r && r.cuentas.length > 1 && (
          <select value={cuenta} onChange={e => { setCuenta(e.target.value); setPagina(1) }} className="rounded-lg border border-neutral-300 px-2 py-2 text-sm bg-white">
            <option value="">Todas las cuentas</option>
            {r.cuentas.map(c => <option key={c.id} value={c.id}>{c.nickname}</option>)}
          </select>
        )}
        <select value={estado} onChange={e => { setEstado(e.target.value); setPagina(1) }} className="rounded-lg border border-neutral-300 px-2 py-2 text-sm bg-white">
          <option value="">Activas y pausadas</option><option value="active">Activas</option><option value="paused">Pausadas</option>
        </select>
      </div>
      {error ? <p className="text-sm text-neutral-500">No se pudo cargar la lista. Prueba de nuevo.</p> : !r ? (
        <div className="space-y-2">{[0, 1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl border border-neutral-200 bg-neutral-50 animate-pulse" />)}</div>
      ) : !r.filas.length ? (
        <p className="text-sm text-neutral-500 bg-white rounded-xl border border-neutral-200 px-4 py-6 text-center">
          {buscar ? 'No hay publicaciones con esa búsqueda.' : 'Todavía no se leyeron las publicaciones de tus cuentas (se leen solas cada pocas horas).'}
        </p>
      ) : (
        <>
          <p className="text-xs text-neutral-500">{r.total.toLocaleString('es-VE')} publicaciones</p>
          <ul className="bg-white rounded-xl border border-neutral-200 shadow-sm divide-y divide-neutral-100">
            {r.filas.map(f => (
              <li key={f.item_id}>
                <Link href={`/publicaciones/${f.item_id}`} className="flex items-center gap-3 px-3 py-2.5 hover:bg-neutral-50">
                  <span className="w-12 h-12 shrink-0 rounded-md bg-neutral-50 border border-neutral-200 overflow-hidden">
                    {f.thumbnail && <img src={f.thumbnail.replace(/^http:/, 'https:')} alt="" className="w-full h-full object-contain" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-neutral-900 truncate">{f.titulo}</span>
                    <span className="block text-xs text-neutral-500">
                      {f.item_id} · {f.cuenta}{f.sku ? ` · SKU ${f.sku}` : ''}{f.variantes ? ` · ${f.variantes} variantes` : ''}
                      {f.estado === 'paused' && <span className="ml-1 text-amber-700">· Pausada</span>}
                      {f.editada_at && <span className="ml-1 text-sky-700">· editada aquí</span>}
                    </span>
                  </span>
                  <span className="text-right shrink-0">
                    <span className="block text-sm font-medium num">{precio(f.precio, f.moneda)}</span>
                    <span className={`block text-xs num ${f.disponible > 0 ? 'text-neutral-500' : 'text-red-600'}`}>{f.disponible} disp.</span>
                  </span>
                  <span className="text-neutral-300">→</span>
                </Link>
              </li>
            ))}
          </ul>
          {paginas > 1 && (
            <div className="flex items-center justify-center gap-3 text-sm">
              <button type="button" disabled={pagina <= 1} onClick={() => setPagina(p => p - 1)} className="px-3 py-1 rounded-lg border border-neutral-300 disabled:opacity-40">←</button>
              <span className="text-neutral-600">{pagina} de {paginas}</span>
              <button type="button" disabled={pagina >= paginas} onClick={() => setPagina(p => p + 1)} className="px-3 py-1 rounded-lg border border-neutral-300 disabled:opacity-40">→</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
