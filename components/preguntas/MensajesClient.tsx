'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PageHeader, Tabs, EmptyState, Cargando, StatusBadge, STATUS_LABELS } from '@/components/ui'
import { problemasDelTexto, revisarTexto } from '@/lib/preguntasTexto'
import { useConfirm } from '@/components/ui/ConfirmProvider'

interface Conversacion {
  pack_id: string; sin_leer: number; ultimo_texto: string | null; ultimo_de_comprador: boolean | null
  ultimo_at: string | null; productos: string | null; cuenta: string; venta_estado: string | null; notas: string | null
  comprador_nick: string | null; comprador_nombre: string | null
}
interface Adjunto { archivo: string; nombre: string; tipo: string | null }
interface Mensaje { propio: boolean; texto: string; fecha: string; leido: string | null; moderacion: string | null; adjuntos: Adjunto[] }

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
  const [vista, setVista] = useState<'sin_leer' | 'con_nota' | 'todas'>('sin_leer')
  const [lista, setLista] = useState<Conversacion[] | null>(null)
  const [cont, setCont] = useState<{ conversaciones: number; mensajes: number; con_nota: number } | null>(null)
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
        { value: 'con_nota', label: 'Con nota', count: cont?.con_nota },
        { value: 'todas', label: 'Recientes' },
      ]} />
      {!lista ? <Cargando /> : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-start">
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm divide-y divide-neutral-100 overflow-hidden">
            {lista.length === 0 ? (
              <EmptyState message={vista === 'sin_leer' ? 'No hay mensajes sin leer. Todo al día.' : vista === 'con_nota' ? 'Ninguna venta con nota.' : 'Todavía no hay conversaciones.'} />
            ) : lista.map(c => (
              <button key={c.pack_id} onClick={() => setAbierta(c)}
                className={`w-full text-left px-4 py-3 space-y-1 transition-colors ${abierta?.pack_id === c.pack_id ? 'bg-lime-50/70' : 'hover:bg-neutral-50'}`}>
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                  <span className="font-semibold text-neutral-700 bg-neutral-100 rounded-full px-2 py-0.5">{c.cuenta}</span>
                  <Comprador nick={c.comprador_nick} nombre={c.comprador_nombre} />
                  {c.sin_leer > 0 && <span className="bg-red-500 text-white rounded-full px-1.5 py-0.5 text-[11px] font-semibold num">{c.sin_leer}</span>}
                  <span className="ml-auto whitespace-nowrap">{hace(c.ultimo_at)}</span>
                </div>
                <p className="text-sm font-medium text-neutral-900 truncate">{c.productos ?? `Venta ${c.pack_id}`}</p>
                <p className={`text-sm truncate ${c.sin_leer > 0 ? 'text-neutral-900' : 'text-neutral-500'}`}>
                  {c.ultimo_de_comprador === false && <span className="text-neutral-400">Tú: </span>}{c.ultimo_texto ? sinEtiquetas(c.ultimo_texto) : '—'}
                </p>
                {c.notas && (
                  <p className="text-xs text-amber-800 truncate">
                    <span className="font-semibold bg-amber-100 rounded px-1.5 py-0.5 mr-1.5">Nota</span>{c.notas}
                  </p>
                )}
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

function Hilo({ c, onCambio }: { c: Conversacion; onCambio: () => void }) {
  const [mensajes, setMensajes] = useState<Mensaje[] | null>(null)
  const [comprador, setComprador] = useState<{ nick: string | null; nombre: string | null } | null>(null)
  const [items, setItems] = useState<{ id: string; titulo: string; cantidad: number; link: string | null }[] | null>(null)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [archivos, setArchivos] = useState<File[]>([])
  const fin = useRef<HTMLDivElement>(null)
  const elegir = useRef<HTMLInputElement>(null)

  // Fotos/PDF para mandar: con el clip o pegando (Ctrl+V) una captura en el cuadro de texto.
  const agregar = (lista: File[]) => {
    setError(null)
    const malos = lista.filter(f => !TIPOS_OK.test(f.type) || f.size > MAX_MB * 1024 * 1024)
    if (malos.length) setError(`"${malos[0].name}": solo fotos JPG/PNG o PDF de hasta ${MAX_MB} MB`)
    const buenos = lista.filter(f => !malos.includes(f)).map(nombrar)
    setArchivos(a => [...a, ...buenos].slice(0, 5))
  }
  const pegar = (e: React.ClipboardEvent) => {
    const imgs = [...e.clipboardData.files].filter(f => f.type.startsWith('image/'))
    if (!imgs.length) return
    e.preventDefault()
    agregar(imgs)
  }

  const leer = useCallback(async (marcar = false) => {
    const r = await fetch(`/api/mensajes/${c.pack_id}${marcar ? '?leida=1' : ''}`)
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error ?? 'No se pudo leer'); return }
    setMensajes(d.mensajes)
    if (d.items) setItems(d.items)
    if (d.comprador) setComprador(d.comprador)
    if (marcar) onCambio()
  }, [c.pack_id, onCambio])
  useEffect(() => { leer() }, [leer])
  useEffect(() => { fin.current?.scrollIntoView({ block: 'end' }) }, [mensajes])

  const problemas = texto.trim() ? problemasDelTexto(texto, 'mensaje') : []
  const avisosTexto = texto.trim() ? revisarTexto(texto, 'mensaje').avisos : []
  const enviar = async () => {
    setEnviando(true); setError(null)
    try {
      let init: RequestInit
      if (archivos.length) {
        const form = new FormData()
        form.append('texto', texto)
        archivos.forEach(f => form.append('archivo', f, f.name))
        init = { method: 'POST', body: form }
      } else {
        init = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto }) }
      }
      const r = await fetch(`/api/mensajes/${c.pack_id}`, init)
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError([d.error, ...(d.problemas ?? [])].filter(Boolean).join(' · ')); return }
      setMensajes(d.mensajes); setTexto(''); setArchivos([]); onCambio()
      const ultimo = (d.mensajes as Mensaje[]).filter(m => m.propio).pop()
      if (ultimo?.moderacion && ultimo.moderacion !== 'clean') setError(`MercadoLibre moderó el mensaje (${ultimo.moderacion})`)
    } finally { setEnviando(false) }
  }

  return (
    <section className="bg-white rounded-xl border border-neutral-200 shadow-sm flex flex-col max-h-[75vh]">
      <header className="px-4 py-3 border-b border-neutral-100 space-y-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
          <span className="font-semibold text-neutral-700 bg-neutral-100 rounded-full px-2 py-0.5">{c.cuenta}</span>
          <Comprador nick={comprador?.nick ?? c.comprador_nick} nombre={comprador?.nombre ?? c.comprador_nombre} grande />
          <span className="font-mono">{c.pack_id}</span>
          {c.venta_estado
            ? <StatusBadge status={c.venta_estado} label={STATUS_LABELS[c.venta_estado]} />
            : <span className="text-amber-700">No está cargada en el sistema</span>}
          {c.sin_leer > 0 && (
            <button onClick={() => leer(true)} className="ml-auto btn-ghost text-xs px-2 py-1">Marcar como leída</button>
          )}
        </div>
        {items?.length ? (
          <p className="text-sm font-medium text-neutral-900">
            {items.map((it, i) => (
              <span key={it.id + i}>
                {i > 0 && <span className="text-neutral-300"> · </span>}
                {it.cantidad} ×{' '}
                {it.link
                  ? <a href={it.link} target="_blank" rel="noreferrer" title="Ver la publicación en MercadoLibre"
                      className="hover:underline underline-offset-2">{it.titulo} <span className="text-neutral-400">↗</span></a>
                  : it.titulo}
              </span>
            ))}
          </p>
        ) : c.productos && <p className="text-sm font-medium text-neutral-900">{c.productos}</p>}
        <p className="text-[11px] text-neutral-400">Leerla aquí no la marca como leída en MercadoLibre.</p>
        <NotasVenta pack={c.pack_id} onCambio={onCambio} />
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-[12rem]">
        {!mensajes ? <p className="text-sm text-neutral-400">Cargando…</p> : mensajes.map((m, i) => (
          <div key={i} className={`text-sm rounded-lg px-3 py-2 max-w-[85%] whitespace-pre-line ${m.propio ? 'ml-auto bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-900'}`}>
            <TextoConLinks texto={m.texto} />
            {m.adjuntos.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {m.adjuntos.map(a => {
                  const url = `/api/mensajes/${c.pack_id}/adjunto?f=${encodeURIComponent(a.archivo)}`
                  const imagen = a.tipo?.startsWith('image/') || /\.(jpe?g|png|gif|webp)$/i.test(a.archivo)
                  return imagen ? (
                    <a key={a.archivo} href={url} target="_blank" rel="noreferrer" title={a.nombre}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={a.nombre} className="max-h-48 max-w-full rounded-md border border-black/10 bg-white" />
                    </a>
                  ) : (
                    <a key={a.archivo} href={url} target="_blank" rel="noreferrer"
                      className="text-xs underline underline-offset-2 opacity-80 hover:opacity-100">📎 {a.nombre}</a>
                  )
                })}
              </div>
            )}
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
          onPaste={pegar}
          placeholder="Escribe la respuesta… (Ctrl+V pega una foto · Ctrl+Enter para enviar)"
          className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm resize-y" />
        {archivos.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {archivos.map((f, i) => <Previa key={i} f={f} onQuitar={() => setArchivos(a => a.filter((_, j) => j !== i))} />)}
          </div>
        )}
        {problemas.length > 0 && <p className="text-xs text-red-600">MercadoLibre lo rechazaría: {problemas.join(' · ')}</p>}
        {avisosTexto.length > 0 && <p className="text-xs text-amber-700">Ojo: {avisosTexto.join(' · ')}. Puedes publicar igual; al publicar se verifica si quedó.</p>}
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => elegir.current?.click()} disabled={archivos.length >= 5}
              className="btn-ghost text-xs px-2 py-1" title="Adjuntar fotos o PDF (también puedes pegarlas con Ctrl+V)">📎 Adjuntar</button>
            <input ref={elegir} type="file" multiple accept="image/jpeg,image/png,application/pdf" className="hidden"
              onChange={e => { agregar([...(e.target.files ?? [])]); e.target.value = '' }} />
            <span className="text-xs text-neutral-400">{texto.length}/350</span>
          </div>
          <button onClick={enviar} disabled={enviando || !texto.trim() || problemas.length > 0} className="btn-primary text-sm"
            title={!texto.trim() && archivos.length ? 'Escribe un mensaje para acompañar el archivo' : undefined}>
            {enviando ? 'Enviando…' : 'Responder'}
          </button>
        </div>
      </footer>
    </section>
  )
}

// Adjuntos que se pueden mandar (ML acepta JPG, PNG, PDF y TXT; nginx corta en 20 MB).
const MAX_MB = 15
const TIPOS_OK = /^(image\/(jpeg|png)|application\/pdf)$/
// Una captura pegada llega como "image.png": se le pone un nombre con fecha para no repetir.
function nombrar(f: File) {
  if (f.name && f.name !== 'image.png') return f
  const ext = f.type === 'image/jpeg' ? 'jpg' : 'png'
  return new File([f], `captura-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 6)}.${ext}`, { type: f.type })
}

function Previa({ f, onQuitar }: { f: File; onQuitar: () => void }) {
  const url = useMemo(() => (f.type.startsWith('image/') ? URL.createObjectURL(f) : null), [f])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])
  return (
    <div className="relative group">
      {url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={url} alt={f.name} className="h-16 w-16 object-cover rounded-md border border-neutral-200" />
        : <div className="h-16 w-28 rounded-md border border-neutral-200 bg-neutral-50 text-[11px] text-neutral-600 p-1.5 break-all overflow-hidden">📄 {f.name}</div>}
      <button type="button" onClick={onQuitar} title="Quitar"
        className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-neutral-900 text-white text-xs leading-5 text-center">×</button>
    </div>
  )
}

// Los mensajes de ML traen los links como <a href="…">texto</a>: se muestran como links.
const LINK = /<a\s[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi
const BR = /<br\s*\/?>/gi
const sinEtiquetas = (t: string) => t.replace(BR, ' ').replace(LINK, '$2').replace(/<[^>]+>/g, '')

function TextoConLinks({ texto: crudo }: { texto: string }) {
  const texto = crudo.replace(BR, '\n')
  const partes: React.ReactNode[] = []
  let desde = 0
  for (const m of texto.matchAll(LINK)) {
    partes.push(texto.slice(desde, m.index).replace(/<[^>]+>/g, ''))
    partes.push(<a key={m.index} href={m[1]} target="_blank" rel="noreferrer" className="underline underline-offset-2">{m[2]}</a>)
    desde = m.index + m[0].length
  }
  partes.push(texto.slice(desde).replace(/<[^>]+>/g, ''))
  return <>{partes}</>
}

interface NotaML { id: string; texto: string; fecha: string; fuente: 'orden' | 'pack' }

/** Notas de la venta en MercadoLibre: se ven, se agregan, se cambian y se borran (el
 *  comprador no las ve). Las ventas con nota quedan en la pestaña "Con nota". */
function NotasVenta({ pack, onCambio }: { pack: string; onCambio: () => void }) {
  const [datos, setDatos] = useState<{ notas: NotaML[]; error: string | null } | null>(null)
  const [editando, setEditando] = useState<{ id: string | null; texto: string } | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const confirm = useConfirm()

  useEffect(() => {
    let vivo = true
    fetch(`/api/mensajes/${pack}/notas`).then(r => r.ok ? r.json() : null).then(d => { if (vivo) setDatos(d) })
    return () => { vivo = false }
  }, [pack])

  const enviar = async (method: 'POST' | 'PUT' | 'DELETE', body: object) => {
    setGuardando(true); setError(null)
    try {
      const r = await fetch(`/api/mensajes/${pack}/notas`, {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error ?? 'No se pudo guardar la nota'); return }
      setDatos(d); setEditando(null); onCambio()
    } finally { setGuardando(false) }
  }
  const guardar = () => {
    if (!editando) return
    const n = datos?.notas.find(x => x.id === editando.id)
    if (n) enviar('PUT', { id: n.id, fuente: n.fuente, texto: editando.texto })
    else enviar('POST', { texto: editando.texto })
  }
  const borrar = async (n: NotaML) => {
    if (!await confirm({ title: 'Borrar nota', message: `Se borra de la venta en MercadoLibre: “${n.texto}”`, confirmText: 'Borrar', danger: true })) return
    enviar('DELETE', { id: n.id, fuente: n.fuente })
  }

  if (!datos) return null
  const editor = editando && (
    <div className="space-y-1.5">
      <textarea value={editando.texto} onChange={e => setEditando({ ...editando, texto: e.target.value })} rows={2} maxLength={300} autoFocus
        placeholder="Ej.: el comprador cambia a la talla L · garantía, espera fotos…"
        className="w-full border border-amber-300 rounded-lg px-2.5 py-1.5 text-sm bg-white resize-y" />
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-amber-700/70">{editando.texto.length}/300 · el comprador no la ve</span>
        <button onClick={() => setEditando(null)} className="ml-auto btn-ghost text-xs px-2 py-1">Cancelar</button>
        <button onClick={guardar} disabled={guardando || !editando.texto.trim()} className="btn-primary text-xs px-3 py-1">
          {guardando ? 'Guardando…' : 'Guardar en ML'}
        </button>
      </div>
    </div>
  )

  return (
    <div className={`rounded-lg px-3 py-2 space-y-1.5 ${datos.notas.length || editando ? 'bg-amber-50 border border-amber-200' : ''}`}>
      <div className="flex items-center gap-2">
        <p className={`text-[11px] font-semibold ${datos.notas.length ? 'text-amber-800' : 'text-neutral-400'}`}>
          {datos.notas.length ? 'Notas de la venta en MercadoLibre' : datos.error ? `No se pudieron leer las notas (${datos.error})` : 'Sin notas en la venta'}
        </p>
        {!editando && (
          <button onClick={() => setEditando({ id: null, texto: '' })} className="ml-auto text-xs text-amber-800 underline underline-offset-2">+ Agregar nota</button>
        )}
      </div>
      {datos.notas.map(n => editando?.id === n.id ? <div key={n.id}>{editor}</div> : (
        <div key={n.id} className="flex items-start gap-2 text-sm text-amber-900">
          <p className="whitespace-pre-line flex-1">{n.texto} <span className="text-[11px] text-amber-700/70">· {new Date(n.fecha).toLocaleDateString('es-VE')}</span></p>
          {!editando && <>
            <button onClick={() => setEditando({ id: n.id, texto: n.texto })} className="text-[11px] text-amber-800 hover:underline">Editar</button>
            <button onClick={() => borrar(n)} className="text-[11px] text-amber-700/70 hover:text-red-600">Borrar</button>
          </>}
        </div>
      ))}
      {editando && editando.id === null && editor}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

/** Comprador: nombre (si ML lo da) y nick. */
function Comprador({ nick, nombre, grande = false }: { nick: string | null; nombre: string | null; grande?: boolean }) {
  if (!nick && !nombre) return null
  return (
    <span className={`truncate min-w-0 ${grande ? 'text-neutral-800' : 'text-neutral-600'}`} title={[nombre, nick].filter(Boolean).join(' · ')}>
      {nombre && <span className="font-medium">{nombre}</span>}
      {nick && <span className="text-neutral-400">{nombre ? ' · ' : ''}{nick}</span>}
    </span>
  )
}
