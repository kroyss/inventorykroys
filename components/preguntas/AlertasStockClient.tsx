'use client'
import { useEffect, useState } from 'react'
import { PageHeader, Tabs, Cargando } from '@/components/ui'
import { useConfirm } from '@/components/ui/ConfirmProvider'

interface Fila {
  item_id: string; variante_id: string; titulo: string; variante: string | null; disponible: number; estado: string
  permalink: string | null; imagen: string | null; agotada_desde: string | null; bajo_desde: string | null
  ultima_agotada_at: string | null; cuenta: string
  caliente: boolean; descartada_at: string | null   // migración 087: en caliente (suma al aviso) / quitada a mano
}
interface Datos {
  filas: Fila[]; contadores: { agotadas: number; bajas: number }; umbral: number
  revision: { desde: string | null; hasta: string | null; cuentas: number }; esAdmin: boolean; puedeStock: boolean
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
  const [guardandoUmbral, setGuardandoUmbral] = useState(false)
  const [vez, setVez] = useState(0)
  // Reponer desde aquí (admin): nuevo stock por fila (clave item:variante); solo las marcadas se envían.
  const confirm = useConfirm()
  const [nuevo, setNuevo] = useState<Record<string, string>>({})
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set())
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<Record<string, { ok: boolean; error?: string }>>({})
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  const clave = (f: Fila) => `${f.item_id}:${f.variante_id}`
  const [verOlvido, setVerOlvido] = useState(false)
  const [quitando, setQuitando] = useState<string | null>(null)
  // "No hay, quitar" / "Volver a avisar": se mueve al instante y se recarga detrás.
  const descartar = async (f: Fila, quitar: boolean) => {
    setQuitando(clave(f))
    try {
      const r = await fetch('/api/alertas-stock/descartar', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: f.item_id, variante_id: f.variante_id, quitar }) })
      if (r.ok) setDatos(d => d && { ...d,
        filas: d.filas.map(x => clave(x) === clave(f) ? { ...x, caliente: !quitar, descartada_at: quitar ? new Date().toISOString() : null } : x),
        contadores: { ...d.contadores, [vista]: Math.max(0, d.contadores[vista] + (quitar ? -1 : 1)) } })
    } finally { setQuitando(null); setVez(n => n + 1) }
  }

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
    setGuardandoUmbral(true)
    try {
      await fetch('/api/alertas-stock', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ umbral: n }) })
      // Se ve al instante (la lista se recarga detrás).
      setDatos(d => d && { ...d, umbral: n })
      setVez(x => x + 1)
    } finally { setGuardandoUmbral(false) }
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
  const calientes = filas.filter(f => f.caliente)
  const olvido = filas.filter(f => !f.caliente)


  const reciente = (f: Fila) => {
    const d = vista === 'agotadas' ? f.agotada_desde : f.bajo_desde
    return !!d && Date.now() - new Date(d).getTime() < 7 * 86_400_000
  }
  const fila = (f: Fila) => (
    <li key={`${f.item_id}-${f.variante_id}`} className="px-4 py-2.5 flex items-center gap-3">
      {datos?.puedeStock && (
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
      {datos?.puedeStock && (
        <input inputMode="numeric" value={nuevo[clave(f)] ?? ''} onChange={e => escribir(f, e.target.value)} placeholder="Nuevo"
          aria-label={`Stock nuevo de ${f.titulo}`}
          className="w-20 border border-neutral-300 rounded-lg px-2 py-1 text-sm text-right num shrink-0" />
      )}
      {/* "Volver a avisar" solo si la quitaron a mano y todavía está dentro de los 7 días (si no, ya es vieja). */}
      {(f.caliente || (f.descartada_at && reciente(f))) && <button type="button" onClick={() => descartar(f, f.caliente)} disabled={quitando === clave(f)}
        title={f.caliente ? 'No hay para reponer: deja de avisar hasta que lo repongas y vuelva a agotarse' : 'Vuelve a contar en el aviso'}
        className="btn-ghost text-xs px-2 py-1 shrink-0 text-neutral-500 hover:text-neutral-900 disabled:opacity-40">
        {f.caliente ? 'No hay, quitar' : 'Volver a avisar'}
      </button>}
      <div className="text-right shrink-0">
        <p className={`text-sm font-semibold num ${f.disponible <= 0 ? 'text-red-600' : f.disponible < (datos?.umbral ?? 3) ? 'text-amber-600' : 'text-emerald-700'}`}>
          {f.disponible <= 0 ? 'Agotada' : `${f.disponible} u.`}
        </p>
        <p className="text-[11px] text-neutral-400">
          {vista === 'agotadas' ? `sin stock desde ${hace(f.agotada_desde)}` : `bajo desde ${hace(f.bajo_desde)}`}
        </p>
      </div>
    </li>
  )

  return (
    <div className="space-y-4">
      <PageHeader title="Stock"
        subtitle="Lo que vendiste en los últimos 30 días y se agotó o está por agotarse en MercadoLibre, por variante. El aviso cuenta solo lo de los últimos 7 días"
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
              className="w-16 border border-neutral-300 rounded-lg px-2 py-1 text-sm text-neutral-800 num" />
            unidades
            {datos && umbral !== String(datos.umbral) && (
              <button onClick={guardarUmbral} disabled={guardandoUmbral} className="btn-secondary text-xs px-2.5 py-1">{guardandoUmbral ? 'Guardando…' : 'Guardar'}</button>
            )}
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

      {datos?.puedeStock && (datos.filas.length > 0 || aviso) && (
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
      {!datos || datosDe !== vista ? <Cargando /> : calientes.length === 0 ? (
        <p className="text-sm text-neutral-500 bg-white rounded-xl border border-neutral-200 p-6 text-center">
          {vista === 'agotadas' ? 'Nada nuevo agotado en los últimos 7 días. Todo al día. 👌' : 'Nada nuevo por agotarse en los últimos 7 días.'}
        </p>
      ) : (
        <ul className="bg-white rounded-xl border border-neutral-200 shadow-sm divide-y divide-neutral-100">
          {calientes.map(fila)}
        </ul>
      )}

      {/* Con más de 7 días sin reponer, o quitadas con "No hay, quitar": se ven, pero no suman al aviso. */}
      {datos && datosDe === vista && olvido.length > 0 && (
        <div className="rounded-xl border border-neutral-200 bg-white shadow-sm">
          <button type="button" onClick={() => setVerOlvido(v => !v)}
            className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left text-sm text-neutral-600 hover:bg-neutral-50 rounded-xl">
            <span><b className="text-neutral-800">{vista === 'agotadas' ? 'Agotadas' : 'Por agotarse'} con más de 7 días</b> sin reponer o quitadas a mano · {olvido.length}. No suman al aviso.</span>
            <span className="text-neutral-400">{verOlvido ? '▴' : '▾'}</span>
          </button>
          {verOlvido && <ul className="divide-y divide-neutral-100 border-t border-neutral-100">{olvido.map(fila)}</ul>}
        </div>
      )}
    </div>
  )
}
