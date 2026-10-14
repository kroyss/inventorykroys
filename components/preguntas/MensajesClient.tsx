'use client'
import TextoConPublicaciones from './TextoConPublicaciones'
import { BotonEditar, BotonEliminar } from './BotonesEdicion'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PreguntasPrevias } from '@/components/preguntas/PreguntasPrevias'
import type { PreguntaPrevia } from '@/lib/preguntasComprador'
import { PageHeader, Tabs, EmptyState, Cargando } from '@/components/ui'
import { problemasDelTexto, revisarTexto } from '@/lib/preguntasTexto'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { CREDITOS_TXT, Sugerencias, UsoIA, avisarUsoIA, type Sugerencia } from '@/components/preguntas/AyudaIA'
import type { MensajeRapido } from '@/lib/mensajesRapidos'
import RecordatoriosPago from '@/components/preguntas/RecordatoriosPago'

export interface Conversacion {
  pack_id: string; sin_leer: number; ultimo_texto: string | null; ultimo_de_comprador: boolean | null
  ultimo_at: string | null; productos: string | null; cuenta: string; despachada_at: string | null; cancelada: boolean | null; con_despachos: boolean; notas: string | null; imagen?: string | null
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
export default function MensajesClient({ pack: packPedido = null }: { pack?: string | null }) {
  const [vista, setVista] = useState<'sin_leer' | 'todas' | 'rapidas' | 'recordatorios'>(packPedido ? 'todas' : 'sin_leer')
  const [rapidas, setRapidas] = useState<{ lista: MensajeRapido[]; esAdmin: boolean; sugeridas: MensajeRapido[] }>({ lista: [], esAdmin: false, sugeridas: [] })
  const [conRecordatorios, setConRecordatorios] = useState(false)
  const [lista, setLista] = useState<Conversacion[] | null>(null)
  const [cont, setCont] = useState<{ conversaciones: number; mensajes: number; con_nota: number } | null>(null)
  const [abierta, setAbierta] = useState<Conversacion | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Atendidas: de a 30 ("Ver 30 más") y buscador (busca en todas las conversaciones, no solo las cargadas).
  const [limite, setLimite] = useState(30)
  const [hayMas, setHayMas] = useState(false)
  const [buscar, setBuscar] = useState('')
  const [q, setQ] = useState('')
  useEffect(() => { const t = setTimeout(() => { setQ(buscar.trim()); setLimite(30) }, 300); return () => clearTimeout(t) }, [buscar])

  const cargar = useCallback(async () => {
    const v = vista === 'rapidas' || vista === 'recordatorios' ? 'sin_leer' : vista
    const r = await fetch(`/api/mensajes?vista=${v}&limite=${limite}${v === 'todas' && q ? `&q=${encodeURIComponent(q)}` : ''}`)
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error ?? 'No se pudo cargar'); return }
    setLista(d.conversaciones); setHayMas(!!d.hay_mas); setCont(d.sin_leer)
    setRapidas({ lista: d.rapidas ?? [], esAdmin: !!d.esAdmin, sugeridas: d.sugeridas ?? [] })
    setConRecordatorios(!!d.recordatorios)
  }, [vista, limite, q])
  useEffect(() => { cargar() }, [cargar])
  useEffect(() => { const t = setInterval(cargar, 60_000); return () => clearInterval(t) }, [cargar])
  // Link directo a una conversación (/mensajes?pack=…, p. ej. desde Calificaciones → "Escribirle"): abre
  // Atendidas con esa conversación (si no está en la lista, la pide sola) y la trae a la vista en el celular.
  const pedidoHecho = useRef(false)
  const hiloRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!packPedido || !lista || pedidoHecho.current) return
    pedidoHecho.current = true
    const c = lista.find(x => x.pack_id === packPedido)
    if (c) { setAbierta(c); return }
    fetch(`/api/mensajes/de-venta?numero=${packPedido}`).then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.conversacion) setAbierta(d.conversacion) }).catch(() => {})
  }, [packPedido, lista])
  useEffect(() => {
    if (packPedido && abierta?.pack_id === packPedido) hiloRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [packPedido, abierta])

  return (
    <div className="space-y-4">
      <PageHeader title="Mensajes" subtitle={<>
        Mensajes de tus ventas en MercadoLibre, de todas tus cuentas, para que ninguno quede sin respuesta
        <span className="block text-xs text-neutral-400 mt-0.5">Leer un mensaje aquí no lo marca como leído en MercadoLibre: se marca cuando respondes o tocas el sobre.</span>
      </>}
        actions={<UsoIA />} />
      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded-lg text-sm">{error}</div>}
      {/* Cada conversación está en UNA: con mensajes sin responder → Por atender; si no → Atendidas. */}
      <Tabs value={vista} onChange={v => { setVista(v); setAbierta(null); setLimite(30) }} items={[
        { value: 'sin_leer', label: 'Por atender', count: cont?.conversaciones },
        { value: 'todas', label: 'Atendidas' },
        ...(rapidas.esAdmin ? [{ value: 'rapidas' as const, label: 'Respuestas rápidas' }] : []),
        ...(conRecordatorios ? [{ value: 'recordatorios' as const, label: 'Recordatorios' }] : []),
      ]} />
      {vista === 'recordatorios' ? <RecordatoriosPago /> : vista === 'rapidas' ? (
        <EditorRapidos key={JSON.stringify(rapidas.lista)} iniciales={rapidas.lista} sugeridas={rapidas.sugeridas} onGuardado={cargar} />
      ) : !lista ? <Cargando /> : (
        // Celular: una sola columna que no se ensancha con el contenido (minmax(0,1fr): antes un texto largo
        // de la conversación estiraba la página y todo se corría de lado), y lista O conversación, no las dos.
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-start">
          <div className={`space-y-2 min-w-0 ${abierta ? 'hidden lg:block' : ''}`}>
          {vista === 'todas' && (
            <div className="relative">
              <svg viewBox="0 0 16 16" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" /></svg>
              <input value={buscar} onChange={e => setBuscar(e.target.value)} type="search"
                placeholder="Buscar comprador, nº de venta o producto…" aria-label="Buscar conversación"
                className="w-full rounded-lg border border-neutral-300 bg-white py-2 pl-9 pr-3 text-sm" />
            </div>
          )}
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm divide-y divide-neutral-100 overflow-hidden">
            {lista.length === 0 ? (
              <EmptyState message={vista === 'sin_leer' ? 'Nada por atender. Todo al día.' : q ? `Nada encontrado con «${q}».` : 'Todavía no hay conversaciones atendidas.'} />
            ) : lista.map(c => (
              <button key={c.pack_id} onClick={() => { setAbierta(c); if (window.innerWidth < 1024) window.scrollTo({ top: 0 }) }}
                className={`w-full text-left px-4 py-3 flex gap-3 transition-colors ${abierta?.pack_id === c.pack_id ? 'bg-lime-50/70' : 'hover:bg-neutral-50'}`}>
                {c.imagen
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={c.imagen} alt="" loading="lazy" className="mt-0.5 h-11 w-11 shrink-0 rounded-md border border-neutral-200 bg-white object-contain" />
                  : <span className="mt-0.5 h-11 w-11 shrink-0 rounded-md bg-neutral-100" />}
                <div className="min-w-0 flex-1 space-y-1">
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
                </div>
              </button>
            ))}
          </div>
          {vista === 'todas' && hayMas && (
            <button type="button" onClick={() => setLimite(n => n + 30)}
              className="w-full rounded-lg border border-dashed border-neutral-300 bg-white py-2 text-xs font-medium text-neutral-600 hover:border-neutral-500 hover:text-neutral-900">
              Ver 30 más
            </button>
          )}
          </div>
          {abierta
            ? <div ref={hiloRef} className="scroll-mt-4 min-w-0 space-y-2">
                <button type="button" onClick={() => setAbierta(null)}
                  className="lg:hidden inline-flex items-center gap-1.5 rounded-full border border-neutral-300 bg-white px-3 h-8 text-xs font-medium text-neutral-700">
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 3L5 8l5 5" /></svg>
                  Volver a la lista
                </button>
                <Hilo key={abierta.pack_id} c={abierta} rapidas={rapidas.lista} onCambio={cargar} />
              </div>
            : <div className="hidden lg:block bg-white rounded-xl border border-dashed border-neutral-200 p-10 text-center text-sm text-neutral-400">Elige una conversación</div>}
        </div>
      )}
    </div>
  )
}

/** La conversación de una venta. La usan la bandeja y Ventas → Nueva venta ("Lo que se habló", 2026-10-12).
 *  soloLectura: sin permiso de Mensajes se lee (y se ven las notas) pero no se responde. */
/** Monto de una venta de ML: USD con 2 decimales, pesos (COP) sin decimales. Formato de-DE (1.234,56). */
const dinero = (n: number, moneda?: string | null) =>
  `${moneda === 'COP' ? '$' : moneda === 'VES' ? 'Bs' : 'US$'} ${n.toLocaleString('de-DE', moneda === 'COP' ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function Hilo({ c, rapidas, onCambio, soloLectura = false, sinNotas = false }: { c: Conversacion; rapidas: MensajeRapido[]; onCambio: () => void; soloLectura?: boolean; sinNotas?: boolean }) {
  const [mensajes, setMensajes] = useState<Mensaje[] | null>(null)
  const [comprador, setComprador] = useState<{ nick: string | null; nombre: string | null } | null>(null)
  const [items, setItems] = useState<{ id: string; titulo: string; variante?: string | null; cantidad: number; precio?: number | null; moneda?: string | null; link: string | null; imagen?: string | null }[] | null>(null)
  const [previas, setPrevias] = useState<PreguntaPrevia[]>([])
  const [recordatorio, setRecordatorio] = useState<{ enviados: number; detenido: string | null } | null>(null)
  const [texto, setTexto] = useState('')
  // De dónde salió el texto (se guarda al enviar, migración 062).
  const [origen, setOrigen] = useState<{ fuente: 'ia' | 'parecida' | 'rapida' | 'propia'; base: string }>({ fuente: 'propia', base: '' })
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [archivos, setArchivos] = useState<File[]>([])
  // Lo recién enviado se muestra con la copia local hasta que ML termina de procesar el adjunto
  // (justo después de enviar, el mensaje puede volver sin él); se relee la conversación en unos segundos.
  const [recienEnviados, setRecienEnviados] = useState<{ url: string | null; nombre: string }[]>([])
  const [ampliada, setAmpliada] = useState<{ url: string; nombre: string } | null>(null)
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([])
  const [pensando, setPensando] = useState(false)
  const [meta, setMeta] = useState<{ confianza: 'alta' | 'media' | 'baja'; falta: string | null } | null>(null)
  // Sugerencias gratis: se piden cuando la conversación ya se leyó (y quedó guardada).
  const leida = mensajes !== null
  const ultimoEsComprador = !!mensajes?.length && !mensajes[mensajes.length - 1].propio
  useEffect(() => {
    if (!leida) return
    let vivo = true
    fetch(`/api/mensajes/${c.pack_id}/sugerencias`).then(r => r.ok ? r.json() : null).then(d => { if (vivo && d) setSugerencias(d.sugerencias) })
    return () => { vivo = false }
  }, [leida, ultimoEsComprador, c.pack_id])
  const proponer = async () => {
    setPensando(true); setError(null)
    try {
      const r = await fetch(`/api/mensajes/${c.pack_id}/borrador`, { method: 'POST' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error ?? 'La IA no respondió'); return }
      setTexto(d.borrador.respuesta); setOrigen({ fuente: 'ia', base: d.borrador.respuesta })
      setMeta({ confianza: d.borrador.confianza, falta: d.borrador.falta_dato })
      avisarUsoIA()
    } finally { setPensando(false) }
  }
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
    if (Array.isArray(d.preguntas)) setPrevias(d.preguntas)
    setRecordatorio(d.recordatorio ?? null)
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
        form.append('fuente', origen.fuente)
        form.append('base', origen.base)
        archivos.forEach(f => form.append('archivo', f, f.name))
        init = { method: 'POST', body: form }
      } else {
        init = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto, ...origen }) }
      }
      const r = await fetch(`/api/mensajes/${c.pack_id}`, init)
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError([d.error, ...(d.problemas ?? [])].filter(Boolean).join(' · ')); return }
      if (archivos.length) {
        setRecienEnviados(archivos.map(f => ({ url: f.type.startsWith('image/') ? URL.createObjectURL(f) : null, nombre: f.name })))
        for (const ms of [4000, 12000]) setTimeout(() => { leer() }, ms)
      }
      setMensajes(d.mensajes); setTexto(''); setOrigen({ fuente: 'propia', base: '' }); setArchivos([]); setMeta(null); setSugerencias([]); onCambio()
      const ultimo = (d.mensajes as Mensaje[]).filter(m => m.propio).pop()
      if (ultimo?.moderacion && ultimo.moderacion !== 'clean') setError(`MercadoLibre moderó el mensaje (${ultimo.moderacion})`)
    } finally { setEnviando(false) }
  }

  return (
    <section className="bg-white rounded-xl border border-neutral-200 shadow-sm flex flex-col max-h-[75vh]">
      {ampliada && <VisorFoto {...ampliada} onCerrar={() => setAmpliada(null)} />}
      <header className="px-4 py-3 border-b border-neutral-100 space-y-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
          <span className="font-semibold text-neutral-700 bg-neutral-100 rounded-full px-2 py-0.5">{c.cuenta}</span>
          <Comprador nick={comprador?.nick ?? c.comprador_nick} nombre={comprador?.nombre ?? c.comprador_nombre} grande />
          <span className="font-mono">{c.pack_id}</span>
          {/* Informativo (sin protagonismo): si su guía ya salió en Despachos. Pudo despacharse sin registrarlo aquí. */}
          {c.cancelada
            ? <span className="text-neutral-400">· cancelada en ML</span>
            : c.con_despachos && (c.despachada_at
              ? <span className="text-neutral-500" title="Su guía salió impresa en Despachos">· despachada {new Date(c.despachada_at).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit' })}</span>
              : <span className="text-neutral-400" title="No hay guía impresa en Despachos para esta venta (pudo despacharse sin registrarla aquí)">· sin despachar en sistema</span>)}
          {/* Como ML: sobre cerrado y en color = sin leer (clic la marca leída); abierto y gris = leída. */}
          {c.sin_leer > 0 ? (
            <button onClick={() => leer(true)} title="Marcar como leída" aria-label="Marcar como leída"
              className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-full text-sky-600 hover:bg-sky-50 hover:text-sky-700 transition-colors">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h13A2.5 2.5 0 0 1 21 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5v-11Zm2.3-.2 6.1 4.6a1 1 0 0 0 1.2 0l6.1-4.6A.5.5 0 0 0 18.5 6h-13a.5.5 0 0 0-.2.3Z" />
              </svg>
            </button>
          ) : (
            <span title="Leída" aria-label="Leída" className="ml-auto inline-flex h-8 w-8 items-center justify-center text-neutral-300">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
                <path d="M3.5 10 12 4l8.5 6v8.5a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5V10Z" />
                <path d="m3.5 10 8.5 6 8.5-6" />
              </svg>
            </span>
          )}
        </div>
        {items?.length ? (
          <div className="flex items-start gap-2.5">
          {items.filter(it => it.imagen).slice(0, 3).map((it, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={it.id + i} src={it.imagen!} alt="" className="h-12 w-12 shrink-0 rounded-md border border-neutral-200 bg-white object-contain" />
          ))}
          <div className="min-w-0 space-y-1.5">
            {items.map((it, i) => (
              <div key={it.id + i}>
                <p className="text-sm font-medium text-neutral-900">
                  {it.link
                    ? <a href={it.link} target="_blank" rel="noreferrer" title="Ver la publicación en MercadoLibre"
                        className="hover:underline underline-offset-2">{it.titulo} <span className="text-neutral-400">↗</span></a>
                    : it.titulo}
                  {it.variante && (
                    <span className="ml-1.5 inline-block align-middle text-xs font-medium text-sky-800 bg-sky-50 ring-1 ring-inset ring-sky-200 rounded-full px-2 py-0.5">{it.variante}</span>
                  )}
                </p>
                {/* Cantidad × precio = total (ML muestra "6 x precio" sin el total). */}
                <p className="text-xs text-neutral-500 tabular-nums">
                  {it.cantidad} × {it.precio != null ? dinero(it.precio, it.moneda) : 'precio no disponible'}
                  {it.precio != null && <> = <b className="font-semibold text-neutral-900">{dinero(it.precio * it.cantidad, it.moneda)}</b></>}
                </p>
              </div>
            ))}
            {items.length > 1 && items.every(it => it.precio != null) && (
              <p className="text-xs text-neutral-500 tabular-nums border-t border-neutral-100 pt-1">
                Total de la venta: <b className="font-semibold text-neutral-900">{dinero(items.reduce((a, it) => a + it.precio! * it.cantidad, 0), items[0].moneda)}</b>
              </p>
            )}
          </div>
          </div>
        ) : c.productos && <p className="text-sm font-medium text-neutral-900">{c.productos}</p>}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
          <PreguntasPrevias n={previas.length} lista={previas} etiqueta="Preguntó antes de comprar" destacado />
        </div>
        {/* En Ventas las notas van junto a los productos (VentasForm): aquí no se repiten. */}
        {!sinNotas && <NotasVenta pack={c.pack_id} onCambio={onCambio} />}
        {recordatorio && !soloLectura && <RecordatorioVenta pack={c.pack_id} r={recordatorio} onCambio={setRecordatorio} />}
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-[12rem]">
        {!mensajes ? <p className="text-sm text-neutral-400">Cargando…</p> : mensajes.map((m, i) => {
          const ultimoPropio = m.propio && !mensajes.slice(i + 1).some(x => x.propio)
          const locales = ultimoPropio && m.adjuntos.length === 0 ? recienEnviados : []
          return (
          <div key={i} className={`text-sm rounded-lg px-3 py-2 max-w-[85%] whitespace-pre-line ${m.propio ? 'ml-auto bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-900'}`}>
            <TextoConLinks texto={m.texto} />
            {m.adjuntos.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {m.adjuntos.map(a => {
                  const url = `/api/mensajes/${c.pack_id}/adjunto?f=${encodeURIComponent(a.archivo)}`
                  const imagen = a.tipo?.startsWith('image/') || /\.(jpe?g|png|gif|webp)$/i.test(a.archivo)
                  return imagen ? (
                    <button key={a.archivo} type="button" onClick={() => setAmpliada({ url, nombre: a.nombre })} title="Ampliar">
                      <ImagenAdjunto url={url} nombre={a.nombre} />
                    </button>
                  ) : (
                    <a key={a.archivo} href={url} target="_blank" rel="noreferrer"
                      className="text-xs underline underline-offset-2 opacity-80 hover:opacity-100">📎 {a.nombre}</a>
                  )
                })}
              </div>
            )}
            {locales.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {locales.map((a, k) => a.url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img key={k} src={a.url} alt={a.nombre} title="Enviada (MercadoLibre la está procesando)"
                    className="max-h-48 max-w-full rounded-md border border-black/10 bg-white" />
                ) : <span key={k} className="text-xs opacity-80">📎 {a.nombre}</span>)}
              </div>
            )}
            <div className={`text-[11px] mt-1 ${m.propio ? 'text-neutral-400' : 'text-neutral-500'}`}>
              {new Date(m.fecha).toLocaleString('es-VE')}
              {m.propio && m.moderacion && m.moderacion !== 'clean' ? ` · ${m.moderacion}` : ''}
              {!m.propio && !m.leido ? ' · sin leer' : ''}
            </div>
          </div>
          )
        })}
        <div ref={fin} />
      </div>
      {soloLectura ? (
        <p className="border-t border-neutral-100 px-4 py-2.5 text-xs text-neutral-400">Para responder desde aquí hace falta el permiso de Mensajes.</p>
      ) : <footer className="border-t border-neutral-100 p-3 space-y-2">
        {ultimoEsComprador && !texto.trim() && (
          <Sugerencias lista={sugerencias} etiqueta="Parecidas:" onUsar={t => { setTexto(t); setOrigen({ fuente: 'parecida', base: t }); setMeta(null) }} />
        )}
        {rapidas.length > 0 && mensajes && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-neutral-400 mr-1">Respuestas rápidas:</span>
            {rapidas.map((rp, i) => (
              <button key={i} type="button" title={rp.texto}
                onClick={() => { const t = rp.texto.slice(0, 350); setTexto(t); setOrigen({ fuente: 'rapida', base: t }); setMeta(null) }}
                className="text-xs rounded-full px-2.5 py-1 ring-1 ring-inset ring-neutral-300 text-neutral-700 hover:bg-neutral-100">
                {rp.titulo}
              </button>
            ))}
          </div>
        )}
        <TextoConPublicaciones value={texto} onTexto={setTexto} cuenta={c.cuenta} rows={2} maxLength={350}
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
        {meta && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded-full px-2 py-0.5 ring-1 ring-inset ${meta.confianza === 'alta' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
              : meta.confianza === 'media' ? 'bg-amber-50 text-amber-700 ring-amber-200' : 'bg-red-50 text-red-700 ring-red-200'}`}>Confianza {meta.confianza}</span>
            {meta.falta && <span className="text-neutral-600">No encontré: <b>{meta.falta}</b></span>}
          </div>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
        {/* flex-wrap: en celular "Proponer con IA" y "Responder" bajan de línea en vez de ensanchar la página. */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => elegir.current?.click()} disabled={archivos.length >= 5}
              className="btn-ghost text-xs px-2 py-1" title="Adjuntar fotos o PDF (también puedes pegarlas con Ctrl+V)">📎 Adjuntar</button>
            <input ref={elegir} type="file" multiple accept="image/jpeg,image/png,application/pdf" className="hidden"
              onChange={e => { agregar([...(e.target.files ?? [])]); e.target.value = '' }} />
            <span className="text-xs text-neutral-400">{texto.length}/350</span>
          </div>
          <button type="button" onClick={proponer} disabled={pensando || !mensajes?.length} className="btn-secondary text-sm ml-auto"
            title="La IA lee la conversación, la nota y la venta, y propone una respuesta (no envía nada)">
            {pensando ? 'Pensando…' : texto ? 'Proponer otra' : 'Proponer con IA'}
            {!pensando && <span className="ml-1.5 text-xs font-normal text-neutral-400">· {CREDITOS_TXT}</span>}
          </button>
          <button onClick={enviar} disabled={enviando || (!texto.trim() && archivos.length === 0) || problemas.length > 0} className="btn-primary text-sm">
            {enviando ? 'Enviando…' : 'Responder'}
          </button>
        </div>
      </footer>}
    </section>
  )
}

// ── Respuestas rápidas (editor, solo admin) ───────────────────────────────
function EditorRapidos({ iniciales, sugeridas, onGuardado }: { iniciales: MensajeRapido[]; sugeridas: MensajeRapido[]; onGuardado: () => void }) {
  const [lista, setLista] = useState<MensajeRapido[]>(iniciales)
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  // Como en Preguntas: cerradas se ve solo el nombre y el comienzo del texto; "Editar" abre una.
  const [abiertas, setAbiertas] = useState<Set<number>>(new Set())
  const alternar = (i: number) => setAbiertas(s => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n })
  const cambiar = (i: number, c: Partial<MensajeRapido>) => { setLista(l => l.map((p, j) => j === i ? { ...p, ...c } : p)); setMsg(null) }

  const guardar = async (nueva: MensajeRapido[] = lista) => {
    const limpias = nueva.map(p => ({ titulo: p.titulo.trim(), texto: p.texto.trim() })).filter(p => p.titulo && p.texto)
    const malas = limpias.filter(p => problemasDelTexto(p.texto, 'mensaje').length)
    if (malas.length) { setMsg({ ok: false, t: `"${malas[0].titulo}": ${problemasDelTexto(malas[0].texto, 'mensaje').join(', ')}` }); return }
    setGuardando(true)
    const r = await fetch('/api/settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mensajes_plantillas: JSON.stringify(limpias) }),
    })
    setGuardando(false)
    if (!r.ok) { setMsg({ ok: false, t: 'No se pudo guardar' }); return }
    setLista(limpias); setAbiertas(new Set()); setMsg({ ok: true, t: 'Guardadas' }); onGuardado()
  }
  const agregar = () => { setAbiertas(s => new Set(s).add(lista.length)); setLista(l => [...l, { titulo: '', texto: '' }]) }
  // Eliminar se guarda al momento (el aviso ya dijo que no hay vuelta atrás).
  const eliminar = (i: number) => {
    const nueva = lista.filter((_, j) => j !== i)
    setAbiertas(new Set())
    if (lista[i].titulo.trim() && lista[i].texto.trim()) guardar(nueva); else setLista(nueva)
  }

  return (
    <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold text-neutral-900">Respuestas rápidas de mensajes</h2>
          <p className="text-xs text-neutral-500">Salen como botones en cada conversación: un clic pone el texto y lo puedes retocar antes de enviar.</p>
        </div>
        <button onClick={agregar} className="btn-secondary text-sm whitespace-nowrap">+ Agregar</button>
      </div>
      {lista.length === 0 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm text-blue-900 space-y-2">
          <p>Todavía no tienes respuestas rápidas. ¿Empiezas con estos ejemplos? Los puedes cambiar antes de guardar.</p>
          <ul className="text-xs text-blue-800 list-disc pl-5 space-y-0.5">{sugeridas.map(x => <li key={x.titulo}><b>{x.titulo}:</b> {x.texto}</li>)}</ul>
          <button onClick={() => setLista(sugeridas)} className="btn-primary text-xs px-3 py-1">Usar estos ejemplos</button>
        </div>
      )}
      {lista.length > 0 && (
        <div className="divide-y divide-neutral-100 border border-neutral-200 rounded-lg">
          {lista.map((p, i) => {
            const n = p.texto.length
            const abierta = abiertas.has(i)
            return (
              <div key={i} className="p-3 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-neutral-900 truncate">{p.titulo || <span className="text-neutral-400">Nueva respuesta</span>}</p>
                    {!abierta && p.texto && <p className="text-xs text-neutral-500 truncate">{p.texto}</p>}
                  </div>
                  <BotonEditar abierta={abierta} onClick={() => alternar(i)} />
                </div>
                {abierta && (
                  <div className="space-y-2 pt-1">
                    <input value={p.titulo} onChange={e => cambiar(i, { titulo: e.target.value })} placeholder="Nombre corto del botón (ej. Ya salió)" maxLength={40}
                      className="w-full border border-neutral-300 rounded-lg px-3 py-1.5 text-sm font-medium" />
                    <textarea value={p.texto} onChange={e => cambiar(i, { texto: e.target.value })} rows={6} maxLength={350}
                      placeholder="Texto del mensaje (ej. ¡Hola! Gracias por tu compra, ya estamos preparando tu pedido)"
                      className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm leading-relaxed resize-y" />
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-[11px] ${n >= 350 ? 'text-red-600 font-medium' : 'text-neutral-400'}`}>{n}/350{n >= 350 ? ' · llegó al límite de MercadoLibre' : ''}</span>
                      <BotonEliminar nombre={p.titulo} onEliminar={() => eliminar(i)} />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      <div className="flex items-center justify-end gap-3">
        {msg && <span className={`text-xs ${msg.ok ? 'text-emerald-700' : 'text-red-600'}`}>{msg.t}</span>}
        <button onClick={() => guardar()} disabled={guardando} className="btn-primary text-sm">{guardando ? 'Guardando…' : 'Guardar respuestas rápidas'}</button>
      </div>
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

/** Foto de la conversación: si ML todavía no la tiene lista (recién enviada), reintenta unas veces. */
function ImagenAdjunto({ url, nombre }: { url: string; nombre: string }) {
  const [intento, setIntento] = useState(0)
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={intento ? `${url}&r=${intento}` : url} alt={nombre}
      onError={() => { if (intento < 4) setTimeout(() => setIntento(n => n + 1), 3000) }}
      className="max-h-48 max-w-full rounded-md border border-black/10 bg-white cursor-zoom-in" />
  )
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
 *  comprador no las ve). */
const unir = (notas: NotaML[]) => notas.map(n => n.texto.trim()).filter(Boolean).join(' · ')   // = unirNotas (lib/notasML)

/** Notas de la venta en MercadoLibre (las mismas en Mensajes y en Ventas): se guardan al instante en ML.
 *  `onNotas`: el texto de todas juntas cada vez que cambian (Ventas lo usa como nota de la venta). */
export function NotasVenta({ pack, onCambio, onNotas }: { pack: string; onCambio: () => void; onNotas?: (texto: string) => void }) {
  const [datos, setDatos] = useState<{ notas: NotaML[]; error: string | null } | null>(null)
  const [editando, setEditando] = useState<{ id: string | null; texto: string } | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const confirm = useConfirm()

  useEffect(() => {
    let vivo = true
    // Al abrir, si ML no tiene notas no se pisa la que ya tenía la venta.
    fetch(`/api/mensajes/${pack}/notas`).then(r => r.ok ? r.json() : null).then(d => { if (vivo) { setDatos(d); if (d && !d.error && unir(d.notas)) onNotas?.(unir(d.notas)) } })
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
      setDatos(d); setEditando(null); onCambio(); onNotas?.(unir(d.notas))
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
    <div className="space-y-2">
      <textarea value={editando.texto} onChange={e => setEditando({ ...editando, texto: e.target.value })} rows={2} maxLength={300} autoFocus
        placeholder="Ej.: el comprador cambia a la talla L · garantía, espera fotos…"
        className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white resize-y focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-300" />
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-neutral-400">{editando.texto.length}/300 · el comprador no la ve</span>
        <button onClick={() => setEditando(null)} className="ml-auto btn-ghost text-xs px-2.5 py-1">Cancelar</button>
        <button onClick={guardar} disabled={guardando || !editando.texto.trim()} className="btn-primary text-xs px-3 py-1">
          {guardando ? 'Guardando…' : 'Guardar en ML'}
        </button>
      </div>
    </div>
  )

  // Sin notas: solo un botón discreto (no un renglón de texto vacío).
  if (!datos.notas.length && !editando) return (
    <div className="flex items-center gap-2">
      <button onClick={() => setEditando({ id: null, texto: '' })}
        className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-neutral-300 px-2.5 py-1 text-xs text-neutral-600 hover:border-amber-400 hover:text-amber-800 hover:bg-amber-50 transition-colors">
        <IconoNota /> + Nota
      </button>
      {datos.error && <span className="text-[11px] text-neutral-400">No se pudieron leer las notas ({datos.error})</span>}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  )

  // Una sola nota por venta (como en ML, que la deja editar pero no agregar otra), en una línea.
  if (editando) return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2.5 space-y-2">
      <div className="flex items-center gap-1.5 text-amber-800">
        <IconoNota />
        <p className="text-[11px] font-semibold uppercase tracking-wide">Nota de la venta</p>
        <span className="text-[11px] text-amber-700/60">· en MercadoLibre, el comprador no la ve</span>
      </div>
      {editor}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
  return (
    <div className="space-y-1">
      {datos.notas.map(n => (
        <div key={n.id} title="Nota de la venta en MercadoLibre: el comprador no la ve"
          className="group flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-2.5 py-1.5">
          <span className="flex shrink-0 items-center gap-1 text-amber-800">
            <IconoNota />
            <span className="text-[11px] font-semibold uppercase tracking-wide">Nota</span>
          </span>
          <p className="min-w-0 flex-1 truncate text-sm text-neutral-800" title={n.texto}>{n.texto}</p>
          <span className="shrink-0 text-[11px] text-neutral-400">{new Date(n.fecha).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit' })}</span>
          <span className="flex shrink-0 gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
            <button onClick={() => setEditando({ id: n.id, texto: n.texto })} className="rounded px-1.5 text-[11px] text-neutral-500 hover:bg-amber-100 hover:text-neutral-900">Editar</button>
            <button onClick={() => borrar(n)} className="rounded px-1.5 text-[11px] text-neutral-400 hover:bg-red-50 hover:text-red-600">Borrar</button>
          </span>
        </div>
      ))}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

function IconoNota() {
  return (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M8 13h8M8 17h5" />
    </svg>
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

/** Foto ampliada en la misma página: se cierra con la ✕, con Escape o tocando afuera. */
function VisorFoto({ url, nombre, onCerrar }: { url: string; nombre: string; onCerrar: () => void }) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', tecla)
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', tecla); document.body.style.overflow = antes }
  }, [onCerrar])
  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4" onClick={onCerrar} role="dialog" aria-label={nombre}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={nombre} onClick={e => e.stopPropagation()}
        className="max-h-[90vh] max-w-[95vw] object-contain rounded-lg shadow-2xl bg-white" />
      <button type="button" onClick={onCerrar} title="Cerrar (Esc)"
        className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/15 hover:bg-white/30 text-white text-2xl leading-10 text-center">×</button>
      <a href={url} download={nombre} onClick={e => e.stopPropagation()}
        className="absolute bottom-4 right-4 text-xs text-white/80 hover:text-white underline underline-offset-2">Descargar</a>
    </div>
  )
}

/** Recordatorios de pago de esta venta (lib/recordatoriosPago.ts): "Ya pagó, no recordar" o deshacerlo. */
function RecordatorioVenta({ pack, r, onCambio }: {
  pack: string; r: { enviados: number; detenido: string | null }; onCambio: (r: { enviados: number; detenido: string | null }) => void
}) {
  const [ocupado, setOcupado] = useState(false)
  const cambiar = async (detener: boolean) => {
    setOcupado(true)
    const res = await fetch('/api/mensajes/recordatorios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pack, detener }) })
    if (res.ok) onCambio({ ...r, detenido: detener ? 'manual' : null })
    setOcupado(false)
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-600">
      <span>Recordatorios de pago: {r.enviados} {r.enviados === 1 ? 'enviado' : 'enviados'}{r.detenido ? ' · detenidos' : ''}</span>
      {r.detenido === 'manual'
        ? <button onClick={() => cambiar(false)} disabled={ocupado} className="btn-secondary text-xs">Volver a recordar</button>
        : !r.detenido && <button onClick={() => cambiar(true)} disabled={ocupado} className="btn-secondary text-xs">Ya pagó, no recordar</button>}
    </div>
  )
}
