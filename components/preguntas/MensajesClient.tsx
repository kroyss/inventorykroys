'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { PageHeader, Tabs, EmptyState, Cargando, StatusBadge, STATUS_LABELS } from '@/components/ui'
import { problemasDelTexto, revisarTexto } from '@/lib/preguntasTexto'

interface Conversacion {
  pack_id: string; sin_leer: number; ultimo_texto: string | null; ultimo_de_comprador: boolean | null
  ultimo_at: string | null; productos: string | null; cuenta: string; venta_estado: string | null
}
interface Mensaje { propio: boolean; texto: string; fecha: string; leido: string | null; moderacion: string | null; adjuntos: number }

function hace(fecha: string | null) {
  if (!fecha) return ''
  const min = Math.round((Date.now() - new Date(fecha).getTime()) / 60000)
  if (min < 1) return 'recién'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  return h < 48 ? `hace ${h} h` : `hace ${Math.round(h / 24)} días`
}

/** Bandeja de mensajes post-venta de todas las cuentas de MercadoLibre de la empresa. */
export default function MensajesClient() {
  const [vista, setVista] = useState<'sin_leer' | 'todas'>('sin_leer')
  const [lista, setLista] = useState<Conversacion[] | null>(null)
  const [cont, setCont] = useState<{ conversaciones: number; mensajes: number } | null>(null)
  const [abierta, setAbierta] = useState<Conversacion | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const r = await fetch(`/api/mensajes?vista=${vista}`)
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error ?? 'No se pudo cargar'); return }
    setLista(d.conversaciones); setCont(d.sin_leer)
  }, [vista])
  useEffect(() => { cargar() }, [cargar])
  useEffect(() => { const t = setInterval(cargar, 60_000); return () => clearInterval(t) }, [cargar])

  return (
    <div className="space-y-4">
      <PageHeader title="Mensajes" subtitle="Mensajes de tus ventas en MercadoLibre, de todas tus cuentas, para que ninguno quede sin respuesta" />
      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded-lg text-sm">{error}</div>}
      <Tabs value={vista} onChange={v => { setVista(v); setAbierta(null) }} items={[
        { value: 'sin_leer', label: 'Sin leer', count: cont?.conversaciones },
        { value: 'todas', label: 'Recientes' },
      ]} />
      {!lista ? <Cargando /> : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-start">
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm divide-y divide-neutral-100 overflow-hidden">
            {lista.length === 0 ? (
              <EmptyState message={vista === 'sin_leer' ? 'No hay mensajes sin leer. Todo al día.' : 'Todavía no hay conversaciones.'} />
            ) : lista.map(c => (
              <button key={c.pack_id} onClick={() => setAbierta(c)}
                className={`w-full text-left px-4 py-3 space-y-1 transition-colors ${abierta?.pack_id === c.pack_id ? 'bg-lime-50/70' : 'hover:bg-neutral-50'}`}>
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                  <span className="font-semibold text-neutral-700 bg-neutral-100 rounded-full px-2 py-0.5">{c.cuenta}</span>
                  {c.sin_leer > 0 && <span className="bg-red-500 text-white rounded-full px-1.5 py-0.5 text-[11px] font-semibold num">{c.sin_leer}</span>}
                  <span className="ml-auto whitespace-nowrap">{hace(c.ultimo_at)}</span>
                </div>
                <p className="text-sm font-medium text-neutral-900 truncate">{c.productos ?? `Venta ${c.pack_id}`}</p>
                <p className={`text-sm truncate ${c.sin_leer > 0 ? 'text-neutral-900' : 'text-neutral-500'}`}>
                  {c.ultimo_de_comprador === false && <span className="text-neutral-400">Tú: </span>}{c.ultimo_texto ?? '—'}
                </p>
              </button>
            ))}
          </div>
          {abierta
            ? <Hilo key={abierta.pack_id} c={abierta} onCambio={cargar} />
            : <div className="hidden lg:block bg-white rounded-xl border border-dashed border-neutral-200 p-10 text-center text-sm text-neutral-400">Elige una conversación</div>}
        </div>
      )}
    </div>
  )
}

interface NotaML { id: string; texto: string; fecha: string; origen: string | null }

function Hilo({ c, onCambio }: { c: Conversacion; onCambio: () => void }) {
  const [mensajes, setMensajes] = useState<Mensaje[] | null>(null)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notas, setNotas] = useState<{ notas: NotaML[]; intentos: { fuente: string; error: string | null }[] } | null>(null)
  const fin = useRef<HTMLDivElement>(null)

  const leer = useCallback(async (marcar = false) => {
    const r = await fetch(`/api/mensajes/${c.pack_id}${marcar ? '?leida=1' : ''}`)
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error ?? 'No se pudo leer'); return }
    setMensajes(d.mensajes)
    if (marcar) onCambio()
  }, [c.pack_id, onCambio])
  useEffect(() => { leer() }, [leer])
  useEffect(() => {
    let vivo = true
    fetch(`/api/mensajes/${c.pack_id}/notas`).then(r => r.ok ? r.json() : null).then(d => { if (vivo) setNotas(d) })
    return () => { vivo = false }
  }, [c.pack_id])
  useEffect(() => { fin.current?.scrollIntoView({ block: 'end' }) }, [mensajes])

  const problemas = texto.trim() ? problemasDelTexto(texto) : []
  const avisosTexto = texto.trim() ? revisarTexto(texto).avisos : []
  const enviar = async () => {
    setEnviando(true); setError(null)
    try {
      const r = await fetch(`/api/mensajes/${c.pack_id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError([d.error, ...(d.problemas ?? [])].filter(Boolean).join(' · ')); return }
      setMensajes(d.mensajes); setTexto(''); onCambio()
      const ultimo = (d.mensajes as Mensaje[]).filter(m => m.propio).pop()
      if (ultimo?.moderacion && ultimo.moderacion !== 'clean') setError(`MercadoLibre moderó el mensaje (${ultimo.moderacion})`)
    } finally { setEnviando(false) }
  }

  return (
    <section className="bg-white rounded-xl border border-neutral-200 shadow-sm flex flex-col max-h-[75vh]">
      <header className="px-4 py-3 border-b border-neutral-100 space-y-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
          <span className="font-semibold text-neutral-700 bg-neutral-100 rounded-full px-2 py-0.5">{c.cuenta}</span>
          <span className="font-mono">{c.pack_id}</span>
          {c.venta_estado
            ? <StatusBadge status={c.venta_estado} label={STATUS_LABELS[c.venta_estado]} />
            : <span className="text-amber-700">No está cargada en el sistema</span>}
          {c.sin_leer > 0 && (
            <button onClick={() => leer(true)} className="ml-auto btn-ghost text-xs px-2 py-1">Marcar como leída</button>
          )}
        </div>
        {c.productos && <p className="text-sm font-medium text-neutral-900">{c.productos}</p>}
        <p className="text-[11px] text-neutral-400">Leerla aquí no la marca como leída en MercadoLibre.</p>
        {notas && (notas.notas.length > 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 space-y-1">
            <p className="text-[11px] font-semibold text-amber-800">Notas de la venta en MercadoLibre</p>
            {notas.notas.map(n => (
              <p key={n.id} className="text-sm text-amber-900 whitespace-pre-line">
                {n.texto} <span className="text-[11px] text-amber-700/70">· {new Date(n.fecha).toLocaleDateString('es-VE')}</span>
              </p>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-neutral-400">
            {notas.intentos.every(i => i.error)
              ? `No se pudieron leer las notas de ML (${notas.intentos.map(i => `${i.fuente}: ${i.error}`).join(' · ')})`
              : 'Sin notas en la venta.'}
          </p>
        ))}
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-[12rem]">
        {!mensajes ? <p className="text-sm text-neutral-400">Cargando…</p> : mensajes.map((m, i) => (
          <div key={i} className={`text-sm rounded-lg px-3 py-2 max-w-[85%] whitespace-pre-line ${m.propio ? 'ml-auto bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-900'}`}>
            {m.texto}
            {m.adjuntos > 0 && <span className="block text-xs opacity-70 mt-1">📎 {m.adjuntos} adjunto(s): míralo en MercadoLibre</span>}
            <div className={`text-[11px] mt-1 ${m.propio ? 'text-neutral-400' : 'text-neutral-500'}`}>
              {new Date(m.fecha).toLocaleString('es-VE')}
              {m.propio && m.moderacion && m.moderacion !== 'clean' ? ` · ${m.moderacion}` : ''}
              {!m.propio && !m.leido ? ' · sin leer' : ''}
            </div>
          </div>
        ))}
        <div ref={fin} />
      </div>
      <footer className="border-t border-neutral-100 p-3 space-y-2">
        <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={2} maxLength={350}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && texto.trim() && !problemas.length) enviar() }}
          placeholder="Escribe la respuesta… (Ctrl+Enter para enviar)"
          className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm resize-y" />
        {problemas.length > 0 && <p className="text-xs text-red-600">MercadoLibre lo rechazaría: {problemas.join(' · ')}</p>}
        {avisosTexto.length > 0 && <p className="text-xs text-amber-700">Ojo: {avisosTexto.join(' · ')}. Puedes publicar igual; al publicar se verifica si quedó.</p>}
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex items-center justify-between">
          <span className="text-xs text-neutral-400">{texto.length}/350</span>
          <button onClick={enviar} disabled={enviando || !texto.trim() || problemas.length > 0} className="btn-primary text-sm">
            {enviando ? 'Enviando…' : 'Responder'}
          </button>
        </div>
      </footer>
    </section>
  )
}
