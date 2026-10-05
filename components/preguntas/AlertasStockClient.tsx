'use client'
import { useEffect, useState } from 'react'
import { PageHeader, Tabs, Cargando } from '@/components/ui'
import { useConfirm } from '@/components/ui/ConfirmProvider'

interface Fila {
  item_id: string; variante_id: string; titulo: string; variante: string | null; disponible: number; estado: string
  permalink: string | null; imagen: string | null; agotada_desde: string | null; bajo_desde: string | null
  ultima_agotada_at: string | null; cuenta: string
}
interface Datos {
  filas: Fila[]; contadores: { agotadas: number; bajas: number }; umbral: number
  revision: { desde: string | null; hasta: string | null; cuentas: number }; esAdmin: boolean
}
type Vista = 'agotadas' | 'bajas'

const hace = (s: string | null) => {
  if (!s) return '—'
  const h = (Date.now() - new Date(s).getTime()) / 3_600_000
  if (h < 1) return 'hace menos de 1 h'
  if (h < 24) return `hace ${Math.floor(h)} h`
  const d = Math.floor(h / 24)
  return `hace ${d} día${d === 1 ? '' : 's'}`
}

/** Automatizaciones → Stock: publicaciones (y variantes) de MercadoLibre vendidas en 30 días, agotadas o por agotarse. */
export default function AlertasStockClient() {
  const [vista, setVista] = useState<Vista>('agotadas')
  const [datos, setDatos] = useState<Datos | null>(null)
  const [datosDe, setDatosDe] = useState<Vista | null>(null)   // de qué pestaña son los datos cargados
  const [buscar, setBuscar] = useState('')
  const [revisando, setRevisando] = useState(false)
  const [umbral, setUmbral] = useState('')
  const [vez, setVez] = useState(0)
  // Reponer desde aquí (admin): nuevo stock por fila (clave item:variante); solo las marcadas se envían.
  const confirm = useConfirm()
  const [nuevo, setNuevo] = useState<Record<string, string>>({})
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set())
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<Record<string, { ok: boolean; error?: string }>>({})
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  const clave = (f: Fila) => `${f.item_id}:${f.variante_id}`

  useEffect(() => {
    let vivo = true
    fetch(`/api/alertas-stock?vista=${vista}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then((d: Datos | null) => { if (vivo && d) { setDatos(d); setDatosDe(vista); setUmbral(u => u || String(d.umbral)) } })
      .catch(() => {})
    return () => { vivo = false }
  }, [vista, vez])

  const revisar = async () => {
    setRevisando(true)
    try {
      const r = await fetch('/api/alertas-stock/revisar', { method: 'POST' })
      if (r.status === 429) alert('Ya se revisó hace menos de 10 minutos. Vuelve a intentarlo en un rato.')
    } finally { setRevisando(false); setVez(n => n + 1) }
  }
  const guardarUmbral = async () => {
    const n = parseInt(umbral, 10)
    if (!(n >= 1 && n <= 100)) return
    await fetch('/api/alertas-stock', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ umbral: n }) })
    setVez(x => x + 1)
  }

  const escribir = (f: Fila, v: string) => {
    const limpio = v.replace(/\D/g, '').slice(0, 5)
    setNuevo(n => ({ ...n, [clave(f)]: limpio }))
    setMarcadas(m => { const x = new Set(m); if (limpio !== '') x.add(clave(f)); else x.delete(clave(f)); return x })
  }
  const alternar = (f: Fila) => setMarcadas(m => { const x = new Set(m); if (x.has(clave(f))) x.delete(clave(f)); else x.add(clave(f)); return x })

  const enviar = async () => {
    const lista = (datos?.filas ?? []).filter(f => marcadas.has(clave(f)) && (nuevo[clave(f)] ?? '') !== '')
    if (!lista.length) return
    const cuentas = [...new Set(lista.map(f => f.cuenta))].join(', ')
    if (!await confirm({ title: 'Actualizar stock en MercadoLibre',
      message: `Vas a cambiar la cantidad disponible de ${lista.length} publicación${lista.length === 1 ? '' : 'es'} en ${cuentas}. Solo cambia la cantidad, nada más.`,
      confirmText: 'Actualizar' })) return
    setEnviando(true); setAviso(null)
    try {
      const r = await fetch('/api/alertas-stock/actualizar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cambios: lista.map(f => ({ item_id: f.item_id, variante_id: f.variante_id, cantidad: parseInt(nuevo[clave(f)], 10) })) }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setAviso({ ok: false, texto: d.error ?? 'No se pudo actualizar' }); return }
      const res: Record<string, { ok: boolean; error?: string }> = {}
      for (const x of d.resultado as { item_id: string; variante_id: string; ok: boolean; error?: string }[]) res[`${x.item_id}:${x.variante_id}`] = x
      setResultado(res)
      const bien = Object.values(res).filter(x => x.ok).length, mal = Object.values(res).length - bien
      setAviso({ ok: mal === 0, texto: `${bien} actualizada${bien === 1 ? '' : 's'} en MercadoLibre${mal ? ` · ${mal} con error (mira cada fila)` : ''}.` })
      setMarcadas(m => { const x = new Set(m); for (const [k, v] of Object.entries(res)) if (v.ok) x.delete(k); return x })
      setNuevo(n => { const x = { ...n }; for (const [k, v] of Object.entries(res)) if (v.ok) delete x[k]; return x })
      setVez(n => n + 1)
    } finally { setEnviando(false) }
  }
  const cuantas = (datos?.filas ?? []).filter(f => marcadas.has(clave(f)) && (nuevo[clave(f)] ?? '') !== '').length

  const q = buscar.trim().toLowerCase()
  const filas = (datos?.filas ?? []).filter(f => !q || `${f.titulo} ${f.variante ?? ''} ${f.item_id} ${f.cuenta}`.toLowerCase().includes(q))

  return (
    <div className="space-y-4">
      <PageHeader title="Stock"
        subtitle="Lo que vendiste en los últimos 30 días y se agotó o está por agotarse en MercadoLibre, por variante"
        actions={<button onClick={revisar} disabled={revisando} className="btn-secondary text-sm">{revisando ? 'Revisando…' : 'Revisar ahora'}</button>} />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-neutral-500">
        <span>
          Se revisa sola cada 2 horas{datos?.revision.hasta ? ` · última revisión ${hace(datos.revision.hasta)}` : ' · todavía no se revisó: toca "Revisar ahora"'}.
          {' '}El tiempo de cada una cuenta desde que el sistema la vio así (lo que ya estaba agotado al empezar, el 02/10, cuenta desde ese día).
        </span>
        {datos?.esAdmin && (
          <label className="flex items-center gap-1.5">
            Por agotarse = menos de
            <input type="number" min={1} max={100} value={umbral} onChange={e => setUmbral(e.target.value)}
              className="w-14 border border-neutral-300 rounded px-1.5 py-0.5 text-neutral-800" />
            unidades
            {datos && umbral !== String(datos.umbral) && <button onClick={guardarUmbral} className="underline underline-offset-2 text-sky-700">guardar</button>}
          </label>
        )}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <Tabs value={vista} onChange={setVista} items={[
          { value: 'agotadas', label: 'Agotadas', count: datos?.contadores.agotadas },
          { value: 'bajas', label: `Por agotarse (< ${datos?.umbral ?? 3})`, count: datos?.contadores.bajas },
        ]} />
        <input type="search" value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar publicación, variante o cuenta…"
          className="w-full sm:w-72 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm" />
      </div>

      {datos?.esAdmin && (datos.filas.length > 0 || aviso) && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-xl border border-neutral-200 shadow-sm px-4 py-2.5">
          <p className="text-sm text-neutral-600">
            {aviso ? <span className={aviso.ok ? 'text-emerald-700' : 'text-red-600'}>{aviso.ok ? '✓ ' : ''}{aviso.texto}</span>
              : 'Escribe el stock nuevo en cada fila y actualízalo en MercadoLibre sin salir de aquí.'}
          </p>
          <button onClick={enviar} disabled={!cuantas || enviando} className="btn-primary text-sm disabled:opacity-40">
            {enviando ? 'Actualizando…' : `Actualizar en MercadoLibre${cuantas ? ` (${cuantas})` : ''}`}
          </button>
        </div>
      )}

      {/* Al cambiar de pestaña no se muestra la lista anterior mientras llega la nueva. */}
      {!datos || datosDe !== vista ? <Cargando /> : filas.length === 0 ? (
        <p className="text-sm text-neutral-500 bg-white rounded-xl border border-neutral-200 p-6 text-center">
          {vista === 'agotadas' ? 'Nada de lo vendido en 30 días está agotado. 👌' : 'Nada de lo vendido en 30 días está por agotarse.'}
        </p>
      ) : (
        <ul className="bg-white rounded-xl border border-neutral-200 shadow-sm divide-y divide-neutral-100">
          {filas.map(f => (
            <li key={`${f.item_id}-${f.variante_id}`} className="px-4 py-2.5 flex items-center gap-3">
              {datos.esAdmin && (
                <input type="checkbox" checked={marcadas.has(clave(f))} onChange={() => alternar(f)} disabled={(nuevo[clave(f)] ?? '') === ''}
                  title={(nuevo[clave(f)] ?? '') === '' ? 'Escribe primero el stock nuevo' : 'Incluir en la actualización'}
                  className="w-4 h-4 accent-neutral-900 shrink-0" />
              )}
              {f.imagen
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={f.imagen.replace(/^http:/, 'https:')} alt="" className="w-11 h-11 rounded object-cover bg-neutral-100 shrink-0" />
                : <span className="w-11 h-11 rounded bg-neutral-100 shrink-0" />}
              <div className="min-w-0 flex-1">
                <p className="text-sm text-neutral-900 truncate">
                  {f.permalink
                    ? <a href={f.permalink} target="_blank" rel="noreferrer" className="hover:underline underline-offset-2">{f.titulo} <span className="text-neutral-400">↗</span></a>
                    : f.titulo}
                </p>
                <p className="text-xs text-neutral-500 truncate">
                  {f.variante && <span className="text-neutral-700 font-medium">{f.variante} · </span>}
                  {f.cuenta} · {f.item_id}
                  {f.estado === 'paused' && <span className="text-amber-700"> · pausada por ML</span>}
                </p>
                {resultado[clave(f)] && !resultado[clave(f)].ok && <p className="text-xs text-red-600">{resultado[clave(f)].error}</p>}
              </div>
              {datos.esAdmin && (
                <input inputMode="numeric" value={nuevo[clave(f)] ?? ''} onChange={e => escribir(f, e.target.value)} placeholder="Nuevo"
                  aria-label={`Stock nuevo de ${f.titulo}`}
                  className="w-20 border border-neutral-300 rounded-lg px-2 py-1 text-sm text-right num shrink-0" />
              )}
              <div className="text-right shrink-0">
                <p className={`text-sm font-semibold num ${f.disponible <= 0 ? 'text-red-600' : f.disponible < (datos?.umbral ?? 3) ? 'text-amber-600' : 'text-emerald-700'}`}>
                  {f.disponible <= 0 ? 'Agotada' : `${f.disponible} u.`}
                </p>
                <p className="text-[11px] text-neutral-400">
                  {vista === 'agotadas' ? `sin stock desde ${hace(f.agotada_desde)}` : `bajo desde ${hace(f.bajo_desde)}`}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
