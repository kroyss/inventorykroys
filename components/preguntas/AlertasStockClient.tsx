'use client'
import { useEffect, useState } from 'react'
import { PageHeader, Tabs, Cargando } from '@/components/ui'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { AbrirFicha } from './FichaPublicacion'

interface Fila {
  item_id: string; variante_id: string; titulo: string; variante: string | null; disponible: number; estado: string
  permalink: string | null; imagen: string | null; agotada_desde: string | null; bajo_desde: string | null
  ultima_agotada_at: string | null; cuenta: string
  pausada_desde?: string | null   // migración 101: pausada a mano (con stock)
  caliente: boolean; descartada_at: string | null   // migración 087: en caliente (suma al aviso) / quitada a mano
}
interface Datos {
  filas: Fila[]; contadores: { agotadas: number; bajas: number; pausadas: number }; umbral: number
  revision: { desde: string | null; hasta: string | null; cuentas: number }; esAdmin: boolean; puedeStock: boolean
}
type Vista = 'agotadas' | 'bajas' | 'pausadas'

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


  // "Color: Azul 2 Rayas · Talla: M" → "Azul 2 Rayas · M" (como lo muestra la ficha).
  const soloValores = (v: string) => v.split(' · ').map(p => p.replace(/^[^:]+:\s*/, '')).join(' · ')
  const marca = (f: Fila) => f.variante && Number(f.variante_id) > 0 && vista !== 'pausadas'
    ? { id: f.variante_id, texto: vista === 'agotadas' ? 'Esta se agotó' : 'Quedan pocas', tono: 'rojo' as const } : null
  const reciente = (f: Fila) => {
    if (vista === 'pausadas') return true   // pausadas: "Volver a la lista" siempre (no vencen a los 7 días)
    const d = vista === 'agotadas' ? f.agotada_desde : f.bajo_desde
    return !!d && Date.now() - new Date(d).getTime() < 7 * 86_400_000
  }
  const fila = (f: Fila) => (
    // Celular: dos líneas (arriba foto, título y estado; abajo casilla, stock nuevo y botón); antes todo en una
    // línea y el estado se salía del margen. Desde sm: una sola línea en el orden del código (sm:order-none).
    <li key={`${f.item_id}-${f.variante_id}`} className="px-4 py-2.5 flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-2">
      {datos?.puedeStock && vista !== 'pausadas' && (
        <input type="checkbox" checked={marcadas.has(clave(f))} onChange={() => alternar(f)} disabled={(nuevo[clave(f)] ?? '') === ''}
          title={(nuevo[clave(f)] ?? '') === '' ? 'Escribe primero el stock nuevo' : 'Incluir en la actualización'}
          className="order-5 sm:order-none w-4 h-4 accent-neutral-900 shrink-0" />
      )}
      {f.imagen
        ? <AbrirFicha item={f.item_id} marcar={marca(f)} className="order-1 sm:order-none w-11 h-11 shrink-0 overflow-hidden rounded bg-neutral-100 ring-1 ring-transparent hover:ring-neutral-400">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={f.imagen.replace(/^http:/, 'https:')} alt="" className="h-full w-full object-cover" />
          </AbrirFicha>
        : <span className="order-1 sm:order-none w-11 h-11 rounded bg-neutral-100 shrink-0" />}
      <div className="order-2 sm:order-none min-w-0 flex-1 basis-0 sm:basis-auto">
        <p className="text-sm text-neutral-900 truncate">
          {/* Abre la ficha de la publicación encima (como en Preguntas y Mensajes); desde ahí, a ML. */}
          <AbrirFicha item={f.item_id} marcar={marca(f)} className="max-w-full truncate align-bottom hover:underline underline-offset-2">{f.titulo}</AbrirFicha>
        </p>
        {/* La variante completa, en su línea (17-10: "Color: Az…" cortado no decía cuál se agotó). */}
        {f.variante && vista !== 'pausadas' && (
          <p className={`text-xs font-semibold ${vista === 'agotadas' ? 'text-red-700' : 'text-amber-700'}`}>
            {vista === 'agotadas' ? 'Se agotó: ' : 'Quedan pocas: '}{soloValores(f.variante)}
          </p>
        )}
        <p className="text-xs text-neutral-500 truncate">
          {f.cuenta} · {f.item_id}
          {f.estado === 'paused' && <span className="text-amber-700"> · pausada por ML</span>}
        </p>
        {resultado[clave(f)] && !resultado[clave(f)].ok && <p className="text-xs text-red-600">{resultado[clave(f)].error}</p>}
      </div>
      {datos?.puedeStock && vista !== 'pausadas' && (
        <input inputMode="numeric" value={nuevo[clave(f)] ?? ''} onChange={e => escribir(f, e.target.value)} placeholder="Nuevo"
          aria-label={`Stock nuevo de ${f.titulo}`}
          className="order-6 sm:order-none w-20 border border-neutral-300 rounded-lg px-2 py-1 text-sm text-right num shrink-0" />
      )}
      {/* "Volver a avisar" solo si la quitaron a mano y todavía está dentro de los 7 días (si no, ya es vieja). */}
      {/* Columna de ancho fijo (con o sin botón) para que el stock y el estado queden alineados. */}
      <div className="order-7 sm:order-none ml-auto sm:ml-0 sm:w-32 shrink-0 flex justify-end">
        {(f.caliente || (f.descartada_at && reciente(f))) && <button type="button" onClick={() => descartar(f, f.caliente)} disabled={quitando === clave(f)}
          title={vista === 'pausadas' ? (f.caliente ? 'Ya la revisaste: sale de la lista (vuelve si la reactivas y la pausas de nuevo)' : 'Vuelve a la lista')
            : f.caliente ? 'No hay para reponer: deja de avisar hasta que lo repongas y vuelva a agotarse' : 'Vuelve a contar en el aviso'}
          className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-40 ${
            f.caliente ? 'border-neutral-300 text-neutral-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700'
                       : 'border-neutral-300 text-neutral-600 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700'}`}>
          {f.caliente
            ? <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            : <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>}
          {vista === 'pausadas' ? (f.caliente ? 'Quitar' : 'Volver') : f.caliente ? 'No hay, quitar' : 'Volver a avisar'}
        </button>}
      </div>
      <div className="order-3 sm:order-none sm:w-44 text-right shrink-0">
        <p className={`text-sm font-semibold num ${vista === 'pausadas' ? 'text-amber-700' : f.disponible <= 0 ? 'text-red-600' : f.disponible < (datos?.umbral ?? 3) ? 'text-amber-600' : 'text-emerald-700'}`}>
          {vista === 'pausadas' ? `⏸ Pausada · ${f.disponible} u.` : f.disponible <= 0 ? 'Agotada' : `${f.disponible} u.`}
        </p>
        <p className="text-[11px] text-neutral-400 whitespace-nowrap">
          {vista === 'pausadas' ? `pausada ${hace(f.pausada_desde ?? null)}` : vista === 'agotadas' ? `sin stock desde ${hace(f.agotada_desde)}` : `bajo desde ${hace(f.bajo_desde)}`}
        </p>
      </div>
      {/* Corte de línea solo en celular (con algo abajo que mostrar). */}
      {(datos?.puedeStock || f.caliente || (f.descartada_at && reciente(f))) && <div className="order-4 basis-full h-0 sm:hidden" />}
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
          { value: 'pausadas', label: 'Pausadas', count: datos?.contadores.pausadas },
        ]} />
        <input type="search" value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar publicación, variante o cuenta…"
          className="w-full sm:w-72 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm" />
      </div>

      {datos?.puedeStock && vista !== 'pausadas' && (datos.filas.length > 0 || aviso) && (
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
          {vista === 'pausadas' ? 'No hay publicaciones pausadas a mano pendientes. 👌'
            : vista === 'agotadas' ? 'Nada nuevo agotado en los últimos 7 días. Todo al día. 👌' : 'Nada nuevo por agotarse en los últimos 7 días.'}
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
            <span>{vista === 'pausadas'
              ? <><b className="text-neutral-800">Pausadas ya revisadas</b> (quitadas de la lista) · {olvido.length}. Siguen pausadas en MercadoLibre.</>
              : <><b className="text-neutral-800">{vista === 'agotadas' ? 'Agotadas' : 'Por agotarse'} con más de 7 días</b> sin reponer o quitadas a mano · {olvido.length}. No suman al aviso.</>}</span>
            <span className="text-neutral-400">{verOlvido ? '▴' : '▾'}</span>
          </button>
          {verOlvido && <ul className="divide-y divide-neutral-100 border-t border-neutral-100">{olvido.map(fila)}</ul>}
        </div>
      )}
    </div>
  )
}
