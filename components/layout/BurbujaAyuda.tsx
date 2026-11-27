'use client'
import { comun } from '@/lib/comun'
import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type ReactNode } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { nombrePantalla, sugerenciasDe, type Sugerencia } from '@/lib/ayudaSugerencias'
import { EVENTO_ABRIR_SOPORTE } from './ContactoDudas'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { avisarAyuda, EVENTO_ABRIR_AYUDA } from './AyudaNav'
import dynamic from 'next/dynamic'
import TicketsClientes, { borrarVolverTicket, leerVolverTicket } from './TicketsClientes'

// Burbuja "¿En qué te ayudo?" (30-10-2026), en todas las pantallas del Sistema:
//   · Preguntar: sugerencias de la pantalla con su respuesta ya escrita (gratis) y pregunta libre que responde la IA
//     con el manual (lib/ayuda.ts; costo de la plataforma, no créditos del cliente), con el video que sirva.
//   · Soporte: texto + hasta 3 capturas → bandeja única del dueño (Plataforma → Soporte) y su Telegram. Las
//     respuestas llegan aquí (punto rojo) y por Telegram si el usuario lo conectó.
// ?soporte=ID en la URL (link del Telegram) abre ese caso. El evento EVENTO_ABRIR_SOPORTE («Escríbenos aquí» de los
// avisos de prueba, ContactoDudas) la abre en Soporte con un mensaje nuevo.
// 19-11 (el dueño, casi no se usaba): el ícono sale solo en Aprendizaje (y sus manuales), salvo que la persona active
// «Ayuda en todo el sistema» ahí (users.ayuda_flotante, mig. 187). Una respuesta de Soporte sin leer lo muestra igual.
// 27-11 (el dueño): TICKETS ABIERTOS. Mientras el usuario tenga un caso sin resolver, la burbuja queda en todas las
// pantallas con su estado al lado («Caso #12 · esperando respuesta» / «● Soporte te respondió»). La ✕ del estado la
// oculta: si ya hay respuesta pregunta «¿Quedó resuelto?» (Sí = cierra el ticket; No = solo oculta). Vuelve a salir
// cuando el caso se mueve (respuesta nueva o el cliente escribe: cambia updated_at). Al dueño de la plataforma le
// muestra los casos de clientes sin responder (→ Plataforma → Soporte). Lo oculto se recuerda en este navegador.
// Pagos por aprobar del dueño (27-11): la misma tarjeta de Plataforma → Cobros, cargada solo cuando hace falta.
const CobrosPanel = dynamic(() => import('@/components/plataforma/CobrosPanel'), { ssr: false })
// Pago reportado del cliente (27-11): «en revisión» → «aprobado» / «no aprobado» en la cajita; lo ocultado se recuerda
// por pago y estado (vuelve a salir cuando el estado cambia). Al tocarla va a Mi plan, donde está el detalle.
interface Pago { id: number; estado: 'revision' | 'aprobado' | 'rechazado'; motivo: string | null; hasta: string | null }
const PAGO_KEY = 'pago_visto'
const leerPagoVisto = () => { try { return localStorage.getItem(PAGO_KEY) } catch { return null } }
const ddmm = (f: string) => f.slice(0, 10).split('-').reverse().slice(0, 2).join('/')
/** Ícono del estado del pago (círculo de color con trazo): reloj = en revisión, check = aprobado, X = no aprobado. */
function IconoPago({ estado }: { estado: Pago['estado'] }) {
  const fondo = estado === 'aprobado' ? 'bg-lime-500 text-white' : estado === 'rechazado' ? 'bg-red-500 text-white' : 'bg-amber-100 text-amber-700'
  return (
    <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${fondo}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        {estado === 'aprobado' ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : estado === 'rechazado' ? <path d="M7 7l10 10M17 7L7 17" />
          : <><circle cx="12" cy="12" r="8" strokeWidth="2.5" /><path d="M12 8v4l2.5 2" strokeWidth="2.5" /></>}
      </svg>
    </span>
  )
}
const OCULTO_KEY = 'soporte_oculto_at'
const leerOculto = () => { try { return localStorage.getItem(OCULTO_KEY) } catch { return null } }
const guardarOculto = (v: string) => { try { localStorage.setItem(OCULTO_KEY, v) } catch { /* sin almacenamiento */ } }
// 27-11 (el dueño): el botón de Ayuda pasó a la barra de arriba (AyudaNav, siempre visible); ya no hay botón flotante
// ni «Ayuda en todo el sistema». Abre en Soporte (lo que más se usa). Abajo solo queda la cajita del ticket abierto.

const MAX_ADJUNTOS = 3
const MAX_MB = 5
const TIPOS = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
const HORARIO = 'Te respondemos de lunes a sábado, de 8am a 6pm (hora de Venezuela).'

interface Turno { id?: number; pregunta: string; respuesta: string; sabe: boolean; video?: { id: number; titulo: string } | null; util?: number; ia: boolean }
interface Mensaje { id: number; autor: 'cliente' | 'soporte'; texto: string; adjuntos: string[]; created_at: string }
interface Caso { id: number; estado: 'abierto' | 'respondido' | 'resuelto'; created_at: string; updated_at: string; nuevo: boolean; mensajes: Mensaje[] }
interface Video { id: number; titulo: string }

/** **negrita**, listas y saltos de línea (lo único que escribe la IA y las sugerencias). */
function Texto({ t }: { t: string }) {
  return <>{t.split('\n').map((linea, i) => {
    const partes: ReactNode[] = linea.split(/(\*\*[^*]+\*\*)/g).map((p, j) =>
      p.startsWith('**') && p.endsWith('**') ? <b key={j}>{p.slice(2, -2)}</b> : p)
    return linea.trim() ? <p key={i} className={/^\s*(\d+\.|-)\s/.test(linea) ? 'pl-3' : ''}>{partes}</p> : <div key={i} className="h-1.5" />
  })}</>
}

const hora = (s: string) => new Date(s).toLocaleString('es-VE', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Caracas' })

export default function BurbujaAyuda() {
  const ruta = usePathname()
  const params = useSearchParams()
  const [abierta, setAbierta] = useState(false)
  const [pestana, setPestana] = useState<'preguntar' | 'soporte'>('soporte')
  const [turnos, setTurnos] = useState<Turno[]>([])
  const [pregunta, setPregunta] = useState('')
  const [pensando, setPensando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [casos, setCasos] = useState<Caso[] | null>(null)
  const casosRef = useRef<Caso[] | null>(null)
  useEffect(() => { casosRef.current = casos }, [casos])
  const [nuevos, setNuevos] = useState(0)
  const [dueno, setDueno] = useState<{ n: number; ultimo: string | null; id: number | null; pagos: number; ultimo_pago: string | null } | null>(null)
  const [pago, setPago] = useState<Pago | null>(null)
  const [pagoVisto, setPagoVisto] = useState<string | null>(null)
  useEffect(() => { setPagoVisto(leerPagoVisto()) }, [])
  const [oculto, setOculto] = useState<string | null>(null)
  const [ticketCli, setTicketCli] = useState<number | null>(null)   // dueño: el ticket de cliente a abrir
  const duenoRef = useRef<typeof dueno>(null)
  useEffect(() => { duenoRef.current = dueno }, [dueno])
  useEffect(() => { setOculto(leerOculto()) }, [])
  const confirm = useConfirm()
  const [casoAbierto, setCasoAbierto] = useState<number | null>(null)
  const [escribiendo, setEscribiendo] = useState(false)     // formulario de caso nuevo
  const [texto, setTexto] = useState('')
  const [archivos, setArchivos] = useState<File[]>([])
  const [enviando, setEnviando] = useState(false)
  const [videos, setVideos] = useState<Video[]>([])
  // Vuelta de «Ver como» desde un ticket: reabre ese ticket aquí (TicketsClientes guardó a dónde volver).
  useEffect(() => {
    if (!dueno) return
    const t = leerVolverTicket()
    if (!t) return
    borrarVolverTicket()
    setTicketCli(t.id); setCasoAbierto(null); setEscribiendo(false); setPestana('soporte'); setAbierta(true)
  }, [dueno])
  // El botón de arriba (AyudaNav) abre y cierra el panel; abre en Soporte.
  useEffect(() => {
    // 27-11: con UN caso abierto entra directo a ese caso (para responder, adjuntar o darlo por resuelto).
    const f = () => setAbierta(a => {
      if (!a) {
        setPestana('soporte'); setEscribiendo(false)
        const ab = (casosRef.current ?? []).filter(c => c.estado !== 'resuelto')
        setCasoAbierto(ab.length === 1 ? ab[0].id : null)
        const d = duenoRef.current
        setTicketCli(!ab.length && d?.n === 1 && !d.pagos ? d.id : null)
      }
      return !a
    })
    window.addEventListener(EVENTO_ABRIR_AYUDA, f)
    return () => window.removeEventListener(EVENTO_ABRIR_AYUDA, f)
  }, [])
  const fin = useRef<HTMLDivElement>(null)

  const cargarCasos = useCallback(async (fresco = true) => {
    const d = await comun<{ casos: typeof casos; nuevos: typeof nuevos; dueno?: typeof dueno; pago?: Pago | null }>('soporte', { fresco }).catch(() => null)
    if (d) { setCasos(d.casos); setNuevos(d.nuevos); setDueno(d.dueno ?? null); setPago(d.pago ?? null) }
  }, [])

  // Respuestas nuevas de soporte: al entrar y cada 3 minutos (solo con la pestaña a la vista).
  useEffect(() => {
    cargarCasos(false)
    const t = setInterval(() => { if (document.visibilityState === 'visible') cargarCasos() }, 3 * 60_000)
    return () => clearInterval(t)
  }, [cargarCasos])

  // Link de Telegram: ?soporte=ID abre ese caso.
  useEffect(() => {
    const id = Number(params.get('soporte'))
    if (id && !ruta.startsWith('/plataforma')) { setAbierta(true); setPestana('soporte'); setCasoAbierto(id) }
  }, [params, ruta])

  // «Escríbenos aquí» (avisos de la prueba): abre en Soporte con el mensaje nuevo listo.
  useEffect(() => {
    const abrir = () => { setAbierta(true); setPestana('soporte'); setCasoAbierto(null); setEscribiendo(true); cargarCasos() }
    window.addEventListener(EVENTO_ABRIR_SOPORTE, abrir)
    return () => window.removeEventListener(EVENTO_ABRIR_SOPORTE, abrir)
  }, [cargarCasos])

  // Los videos (para enlazar las sugerencias por título), una vez al abrir.
  useEffect(() => {
    if (!abierta || videos.length) return
    comun<{ videos: Video[] }>('aprendizaje')
      .then(d => d?.videos && setVideos(d.videos.map((v: Video) => ({ id: v.id, titulo: v.titulo })))).catch(() => {})
  }, [abierta, videos.length])

  useEffect(() => { fin.current?.scrollIntoView({ block: 'end' }) }, [turnos, pensando, casoAbierto, casos])

  // Al abrir un caso con respuesta nueva, se marca visto.
  useEffect(() => {
    const c = casos?.find(x => x.id === casoAbierto)
    if (!c?.nuevo) return
    fetch(`/api/soporte/${c.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'visto' }) })
      .then(() => cargarCasos()).catch(() => {})
  }, [casoAbierto, casos, cargarCasos])

  const pantalla = nombrePantalla(ruta)
  const sugerencias = sugerenciasDe(ruta)

  function usarSugerencia(s: Sugerencia) {
    const v = s.video ? videos.find(x => x.titulo.toLowerCase() === s.video!.toLowerCase()) ?? null : null
    setTurnos(t => [...t, { pregunta: s.pregunta, respuesta: s.respuesta, sabe: true, video: v, ia: false }])
  }

  async function preguntar() {
    const q = pregunta.trim()
    if (q.length < 3 || pensando) return
    setPensando(true); setError(null); setPregunta('')
    // Solo los ids de lo que respondió la IA: el servidor lee el historial de la base.
    const historial_ids = turnos.filter(t => t.ia && t.id).slice(-2).map(t => t.id!)
    const r = await fetch('/api/ayuda/preguntar', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pregunta: q, pantalla, historial_ids }) }).catch(() => null)
    const d = await r?.json().catch(() => null)
    setPensando(false)
    if (!r?.ok || !d) { setError(d?.error ?? 'No se pudo responder. Revisa tu conexión o escríbenos a Soporte.'); setPregunta(q); return }
    setTurnos(t => [...t, { id: d.id, pregunta: q, respuesta: d.respuesta, sabe: d.sabe, video: d.video, ia: true }])
  }

  async function votar(i: number, util: 1 | -1) {
    const t = turnos[i]
    if (!t.id || t.util) return
    setTurnos(ts => ts.map((x, j) => (j === i ? { ...x, util } : x)))
    fetch(`/api/ayuda/consultas/${t.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ util }) }).catch(() => {})
  }

  function aSoporte(desde?: string) {
    setPestana('soporte'); setCasoAbierto(null); setEscribiendo(true)
    if (desde) setTexto(`${desde}\n\n`)
  }

  function agregar(lista: File[]) {
    setError(null)
    const malos = lista.filter(f => !TIPOS.includes(f.type) || f.size > MAX_MB * 1024 * 1024)
    if (malos.length) setError(`«${malos[0].name || 'archivo'}»: solo imágenes (PNG, JPG) o PDF de hasta ${MAX_MB} MB`)
    setArchivos(a => [...a, ...lista.filter(f => !malos.includes(f))].slice(0, MAX_ADJUNTOS))
  }
  function pegar(e: ClipboardEvent) {
    const fotos = [...e.clipboardData.files].filter(f => f.type.startsWith('image/'))
    if (fotos.length) { e.preventDefault(); agregar(fotos) }
  }

  async function enviarSoporte(casoId?: number) {
    if ((!texto.trim() && !archivos.length) || enviando) return
    setEnviando(true); setError(null)
    const f = new FormData()
    f.append('texto', texto.trim()); f.append('pantalla', pantalla); f.append('navegador', navigator.userAgent)
    if (casoId) f.append('caso_id', String(casoId))
    archivos.forEach(a => f.append('archivos', a, a.name || 'captura.png'))
    const r = await fetch('/api/soporte', { method: 'POST', body: f }).catch(() => null)
    const d = await r?.json().catch(() => null)
    setEnviando(false)
    if (!r?.ok) { setError(d?.error ?? 'No se pudo enviar. Revisa tu conexión.'); return }
    setTexto(''); setArchivos([]); setEscribiendo(false)
    await cargarCasos()
    setCasoAbierto(d.id)
  }

  async function resolver(id: number) {
    await fetch(`/api/soporte/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'resuelto' }) }).catch(() => {})
    cargarCasos()
  }

  const caso = casos?.find(c => c.id === casoAbierto) ?? null

  const formulario = (casoId?: number) => (
    <div className="space-y-2">
      <textarea value={texto} onChange={e => setTexto(e.target.value)} onPaste={pegar} rows={casoId ? 2 : 5}
        placeholder={casoId ? 'Escribe tu respuesta… (Ctrl+V pega una captura)' : 'Cuéntanos qué pasó: qué hiciste y qué esperabas. Puedes pegar una captura con Ctrl+V.'}
        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-base sm:text-sm focus:outline-none focus:border-lime-600 focus:ring-2 focus:ring-lime-400/40" />
      {archivos.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {archivos.map((a, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700">
              📎 {a.name || 'captura'}
              <button onClick={() => setArchivos(x => x.filter((_, j) => j !== i))} className="text-neutral-400 hover:text-neutral-800" aria-label="Quitar">✕</button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <label className={`text-xs text-neutral-600 ${archivos.length >= MAX_ADJUNTOS ? 'opacity-40' : 'cursor-pointer hover:text-neutral-900'}`}>
          📎 Adjuntar captura ({archivos.length}/{MAX_ADJUNTOS})
          <input type="file" accept={TIPOS.join(',')} multiple className="hidden" disabled={archivos.length >= MAX_ADJUNTOS}
            onChange={e => { agregar([...(e.target.files ?? [])]); e.target.value = '' }} />
        </label>
        <button onClick={() => enviarSoporte(casoId)} disabled={enviando || (!texto.trim() && !archivos.length)} className="btn-primary text-sm">
          {enviando ? 'Enviando…' : 'Enviar'}
        </button>
      </div>
    </div>
  )

  // Tickets abiertos (27-11): los míos sin resolver, o (dueño) los de clientes por responder.
  const abiertos = (casos ?? []).filter(c => c.estado !== 'resuelto')
  const pendDueno = (dueno?.n ?? 0) + (dueno?.pagos ?? 0)
  const actividad = [...abiertos.map(c => c.updated_at), ...(dueno?.n ? [dueno.ultimo ?? ''] : []), ...(dueno?.pagos ? [dueno.ultimo_pago ?? ''] : [])]
    .map(x => (x ? new Date(x).toISOString() : '')).sort().at(-1) ?? null
  const hayTicket = (abiertos.length > 0 || pendDueno > 0) && !(oculto && actividad && new Date(oculto) >= new Date(actividad))
  const respondidos = abiertos.filter(c => c.estado === 'respondido')
  const estadoTicket = nuevos > 0 ? '● Soporte te respondió'
    : abiertos.length > 1 ? `${abiertos.length} casos abiertos`
    : abiertos.length === 1 ? `Caso #${abiertos[0].id} · ${abiertos[0].estado === 'respondido' ? 'respondido' : 'esperando respuesta'}`
    : pendDueno ? [dueno?.n ? `${dueno.n === 1 ? '1 ticket' : `${dueno.n} tickets`} sin responder` : '',
        dueno?.pagos ? `${dueno.pagos === 1 ? '1 pago' : `${dueno.pagos} pagos`} por aprobar` : ''].filter(Boolean).join(' · ') : ''
  // Pago del cliente: se muestra mientras no se haya ocultado ESE pago en ESE estado.
  const clavePago = pago ? `${pago.id}:${pago.estado}` : null
  const verPago = !!pago && pagoVisto !== clavePago
  const textoPago = !pago ? '' : pago.estado === 'revision' ? 'Tu pago está en revisión'
    : pago.estado === 'aprobado' ? `Pago aprobado${pago.hasta ? ` · activo hasta el ${ddmm(pago.hasta)}` : ''}` : 'Pago no aprobado · ver motivo'
  const marcarPago = useCallback(() => { if (!clavePago) return; try { localStorage.setItem(PAGO_KEY, clavePago) } catch { /* sin almacenamiento */ } setPagoVisto(clavePago) }, [clavePago])
  // En Mi plan ya se ve el resultado: aprobado o rechazado se da por visto.
  useEffect(() => { if (verPago && pago?.estado !== 'revision' && ruta.startsWith('/mi-plan')) marcarPago() }, [verPago, pago, ruta, marcarPago])
  const abrirTicket = () => {
    // Dueño: el ticket del cliente se abre aquí mismo, sin salir de la pantalla (27-11).
    if (!abiertos.length && pendDueno) { setTicketCli(dueno?.n === 1 && !dueno.pagos ? dueno.id : null); setCasoAbierto(null); setEscribiendo(false); setPestana('soporte'); setAbierta(true); return }
    setAbierta(true); setPestana('soporte'); setEscribiendo(false)
    setCasoAbierto(abiertos.length === 1 ? abiertos[0].id : null)
  }
  async function ocultarTicket() {
    const ocultar = () => { const v = new Date().toISOString(); guardarOculto(v); setOculto(v) }
    if (respondidos.length) {
      const c = respondidos[0]
      const si = await confirm({ title: `¿Quedó resuelto tu caso #${c.id}?`,
        message: 'Si dices que sí, se cierra el ticket. Si vuelve a pasar, escríbenos y se reabre.',
        confirmText: 'Sí, cerrar el ticket', cancelText: 'No, solo ocultar' })
      if (si) { await resolver(c.id); return }
    } else if (abiertos.length && !(await confirm({ title: 'Ocultar el aviso',
      message: 'Tu caso sigue abierto: te avisamos aquí apenas te respondamos.', confirmText: 'Ocultar' }))) return
    ocultar()
  }

  // El punto del botón de arriba: rojo = respuesta nueva o (dueño) tickets sin responder; verde = mi caso esperando.
  const pagoListo = verPago && pago?.estado !== 'revision'
  // 27-11 (el dueño): el punto es SOLO de tickets. El pago del cliente se ve en la cajita de abajo, nada más.
  const punto = nuevos > 0 || (!abiertos.length && pendDueno > 0) ? 'rojo' : abiertos.length ? 'verde' : null
  useEffect(() => { avisarAyuda(punto, abierta) }, [punto, abierta])

  return (
    <>
      {abierta && (
        <div role="dialog" aria-label="Ayuda"
          className="fixed z-[70] right-3 left-3 sm:left-auto top-16 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] sm:bottom-auto sm:w-[24rem] sm:h-[min(78vh,38rem)] flex flex-col rounded-2xl border border-neutral-200 bg-white shadow-2xl overflow-hidden">
          <div className="bg-neutral-900 text-white px-4 pt-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold">¿En qué te ayudo?</p>
              {pestana === 'preguntar' && turnos.length > 0 && (
                <button onClick={() => { setTurnos([]); setError(null) }} className="ml-auto mr-3 text-xs text-neutral-300 hover:text-white">↺ Empezar de nuevo</button>
              )}
              <button onClick={() => setAbierta(false)} className="text-neutral-400 hover:text-white text-lg leading-none" aria-label="Cerrar">✕</button>
            </div>
            <div className="mt-2 flex gap-1">
              {([['soporte', 'Soporte'], ['preguntar', 'Preguntar']] as const).map(([k, t]) => (
                <button key={k} onClick={() => { setPestana(k); setError(null) }}
                  className={`px-3 py-1.5 text-sm border-b-2 ${pestana === k ? 'border-lime-400 text-white font-semibold' : 'border-transparent text-neutral-400 hover:text-neutral-200'}`}>
                  {k === 'soporte' && dueno ? `Tickets${pendDueno ? ` (${pendDueno})` : ''}` : t}
                  {k === 'soporte' && (nuevos > 0 || (dueno && pendDueno > 0)) && <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-red-500 align-middle" />}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm">
            {pestana === 'preguntar' ? <>
              {turnos.length === 0 && (
                <p className="text-neutral-600">Pregúntame cómo se hace algo en el sistema. Te respondo con el manual y, si hay un video que lo explica, te lo dejo.</p>
              )}
              {turnos.map((t, i) => (
                <div key={i} className="space-y-1.5">
                  <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-neutral-900 px-3 py-1.5 text-white">{t.pregunta}</p>
                  <div className="max-w-[92%] rounded-2xl rounded-bl-sm bg-neutral-100 px-3 py-2 space-y-1 text-neutral-800">
                    <Texto t={t.respuesta} />
                    {t.video && (
                      <a href={`/aprendizaje/manual/automatizaciones?video=${t.video.id}`} className="mt-1.5 flex items-center gap-1.5 rounded-lg bg-white px-2 py-1.5 text-xs font-medium text-neutral-800 border border-neutral-200 hover:border-lime-400">
                        ▶ Video: {t.video.titulo}
                      </a>
                    )}
                    {!t.sabe && (
                      <button onClick={() => aSoporte(t.pregunta)} className="mt-1 text-xs font-medium text-lime-700 underline underline-offset-2">Escribir a Soporte</button>
                    )}
                  </div>
                  {t.ia && t.id && (
                    <div className="flex items-center gap-2 pl-1 text-xs text-neutral-400">
                      {t.util ? <span>{t.util === 1 ? '¡Gracias!' : 'Gracias, lo revisamos.'}</span> : <>
                        ¿Te sirvió?
                        <button onClick={() => votar(i, 1)} className="hover:text-neutral-800" aria-label="Sí">👍</button>
                        <button onClick={() => votar(i, -1)} className="hover:text-neutral-800" aria-label="No">👎</button>
                      </>}
                    </div>
                  )}
                </div>
              ))}
              {pensando && <p className="w-fit rounded-2xl bg-neutral-100 px-3 py-2 text-neutral-500">Buscando en el manual…</p>}
              {sugerencias.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{turnos.length ? 'Otras preguntas frecuentes' : 'Preguntas frecuentes de esta pantalla'}</p>
                  {sugerencias.map(s => (
                    <button key={s.pregunta} onClick={() => usarSugerencia(s)}
                      className={`block w-full text-left rounded-lg border border-neutral-200 px-3 py-1.5 hover:border-lime-400 hover:bg-lime-50 ${turnos.some(t => t.pregunta === s.pregunta) ? 'text-neutral-400' : 'text-neutral-700'}`}>
                      {s.pregunta}
                    </button>
                  ))}
                </div>
              )}
              {error && <p className="text-red-600 text-xs">{error}</p>}
            </> : caso ? <>
              <div className="flex items-center justify-between gap-2">
                <button onClick={() => setCasoAbierto(null)} className="py-1 text-xs text-neutral-500 hover:text-neutral-800">← Mis casos</button>
                {caso.estado === 'respondido' && (
                  <button onClick={() => resolver(caso.id)} className="rounded-full border border-lime-300 bg-lime-50 px-2.5 py-1 text-xs font-medium text-lime-800 hover:bg-lime-100">✓ Ya se resolvió</button>
                )}
              </div>
              <p className="text-xs text-neutral-500">Caso #{caso.id} · {caso.estado === 'resuelto' ? 'resuelto' : caso.estado === 'respondido' ? 'respondido' : 'esperando respuesta'}</p>
              {caso.mensajes.map(m => (
                <div key={m.id} className={m.autor === 'cliente' ? 'ml-auto max-w-[88%]' : 'max-w-[92%]'}>
                  <div className={`rounded-2xl px-3 py-2 space-y-1 ${m.autor === 'cliente' ? 'rounded-br-sm bg-neutral-900 text-white' : 'rounded-bl-sm bg-lime-50 border border-lime-200 text-neutral-800'}`}>
                    {m.autor === 'soporte' && <p className="text-[11px] font-semibold text-lime-800">Soporte</p>}
                    {m.texto && <Texto t={m.texto} />}
                    {m.adjuntos.map(a => (
                      <a key={a} href={`/api/soporte/adjunto?caso=${caso.id}&archivo=${encodeURIComponent(a)}`} target="_blank" rel="noreferrer"
                        className={`block text-xs underline underline-offset-2 ${m.autor === 'cliente' ? 'text-lime-300' : 'text-lime-800'}`}>📎 {a.endsWith('.pdf') ? 'PDF adjunto' : 'Captura'}</a>
                    ))}
                  </div>
                  <p className={`mt-0.5 text-[11px] text-neutral-400 ${m.autor === 'cliente' ? 'text-right' : ''}`}>{hora(m.created_at)}</p>
                </div>
              ))}
              {caso.estado === 'resuelto'
                ? <p className="text-xs text-neutral-500">Este caso está resuelto. Si vuelve a pasar, escríbenos aquí mismo y se reabre.</p>
                : caso.estado === 'abierto' && <p className="text-xs text-neutral-500">{HORARIO}</p>}
              {/* 27-11: la respuesta queda fija abajo, como un chat (en el celular no hay que bajar para escribir). */}
              <div className="sticky -bottom-3 -mx-4 -mb-3 space-y-2 border-t border-neutral-100 bg-white px-4 py-3">
                {formulario(caso.id)}
                {error && <p className="text-red-600 text-xs">{error}</p>}
              </div>
            </> : escribiendo || (casos && casos.length === 0 && !dueno) ? <>
              {casos && casos.length > 0 && <button onClick={() => setEscribiendo(false)} className="py-1 text-xs text-neutral-500 hover:text-neutral-800">← Mis casos</button>}
              <p className="font-medium text-neutral-800">Escribir a Soporte</p>
              <p className="text-xs text-neutral-500">{HORARIO} Junto con tu mensaje nos llega en qué pantalla estás, para ayudarte más rápido.</p>
              {formulario()}
              {error && <p className="text-red-600 text-xs">{error}</p>}
            </> : dueno ? <>
              {/* Dueño de la plataforma (27-11): pagos por aprobar y tickets de clientes; él no le escribe a soporte. */}
              {dueno.pagos > 0 && !ticketCli && <section className="space-y-1.5">
                <p className="font-medium text-neutral-800">Pagos por aprobar <span className="ml-1 text-xs font-semibold text-red-600">· {dueno.pagos}</span></p>
                <CobrosPanel modo="pendientes" compacto onCambio={() => cargarCasos()} />
              </section>}
              <TicketsClientes key={ticketCli ?? 0} inicial={ticketCli} onCambio={() => cargarCasos()} />
            </> : <>
              <div className="flex items-center justify-between">
                <p className="font-medium text-neutral-800">Mis casos</p>
                <button onClick={() => { setEscribiendo(true); setError(null) }} className="btn-primary text-xs">+ Escribir</button>
              </div>
              {!casos && <p className="text-neutral-500">Cargando…</p>}
              {casos?.map(c => {
                const ult = c.mensajes[c.mensajes.length - 1]
                return (
                  <button key={c.id} onClick={() => setCasoAbierto(c.id)}
                    className="block w-full text-left rounded-lg border border-neutral-200 px-3 py-2 hover:border-lime-400">
                    <span className="flex items-center justify-between gap-2 text-xs text-neutral-500">
                      <span>#{c.id} · {hora(c.updated_at)}</span>
                      <span className={c.nuevo ? 'font-semibold text-red-600' : c.estado === 'resuelto' ? 'text-neutral-400' : c.estado === 'respondido' ? 'text-lime-700' : ''}>
                        {c.nuevo ? '● respuesta nueva' : c.estado === 'resuelto' ? 'resuelto' : c.estado === 'respondido' ? 'respondido' : 'esperando respuesta'}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-neutral-800">{c.mensajes[0]?.texto || 'Captura'}</span>
                    {ult?.autor === 'soporte' && <span className="block truncate text-xs text-neutral-500">Soporte: {ult.texto}</span>}
                  </button>
                )
              })}
            </>}
            <div ref={fin} />
          </div>

          {pestana === 'preguntar' && (
            <div className="border-t border-neutral-100 p-3 space-y-1.5">
              <div className="flex gap-2">
                <input value={pregunta} onChange={e => setPregunta(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') preguntar() }}
                  maxLength={800} placeholder="Escribe tu pregunta…" disabled={pensando}
                  className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:border-lime-600 focus:ring-2 focus:ring-lime-400/40" />
                <button onClick={preguntar} disabled={pensando || pregunta.trim().length < 3} className="btn-primary text-sm">Preguntar</button>
              </div>
              <p className="text-[11px] text-neutral-400">
                No escribas contraseñas ni datos personales. Puede equivocarse: ¿no se resolvió? <button onClick={() => aSoporte()} className="underline underline-offset-2 hover:text-neutral-700">Escribe a Soporte</button>
              </p>
            </div>
          )}
        </div>
      )}

      {!abierta && ((hayTicket && estadoTicket) || verPago) && (
        <div className="fixed z-[70] right-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] md:bottom-5 flex flex-col items-end gap-2 [body:has([data-barra-fija])_&]:hidden">
          {verPago && (
            <div className={`flex h-9 max-w-[calc(100vw-1.5rem)] items-center rounded-full border bg-white pl-2 pr-1 shadow-lg text-xs ${pagoListo ? (pago?.estado === 'aprobado' ? 'border-lime-300' : 'border-red-300') : 'border-neutral-200'}`}>
              <a href="/mi-plan" onClick={() => { if (pagoListo) marcarPago() }}
                className={`flex min-w-0 items-center gap-2 font-medium hover:underline ${pago?.estado === 'aprobado' ? 'text-lime-800' : pago?.estado === 'rechazado' ? 'text-red-700' : 'text-neutral-700'}`}>
                {pago && <IconoPago estado={pago.estado} />}<span className="truncate">{textoPago}</span>
              </a>
              <button onClick={marcarPago} aria-label="Ocultar" title="Ocultar"
                className="ml-1 grid h-6 w-6 shrink-0 place-items-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700">✕</button>
            </div>
          )}
          {hayTicket && estadoTicket && (
            <div className={`flex h-9 max-w-[calc(100vw-1.5rem)] items-center rounded-full border bg-white pl-3 pr-1 shadow-lg text-xs ${nuevos > 0 || pendDueno > 0 ? 'border-red-300' : 'border-neutral-200'}`}>
              <button onClick={abrirTicket} className={`max-w-[16rem] truncate font-medium ${nuevos > 0 || pendDueno > 0 ? 'text-red-600' : 'text-neutral-700'} hover:underline`}>{estadoTicket}</button>
              <button onClick={ocultarTicket} aria-label="Ocultar" title="Ocultar"
                className="ml-1 grid h-6 w-6 shrink-0 place-items-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700">✕</button>
            </div>
          )}
        </div>
      )}
    </>
  )
}
