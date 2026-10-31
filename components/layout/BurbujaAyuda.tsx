'use client'
import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type ReactNode } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { nombrePantalla, sugerenciasDe, type Sugerencia } from '@/lib/ayudaSugerencias'

// Burbuja "¿En qué te ayudo?" (30-10-2026), en todas las pantallas del Sistema:
//   · Preguntar: sugerencias de la pantalla con su respuesta ya escrita (gratis) y pregunta libre que responde la IA
//     con el manual (lib/ayuda.ts; costo de la plataforma, no créditos del cliente), con el video que sirva.
//   · Soporte: texto + hasta 3 capturas → bandeja única del dueño (Plataforma → Soporte) y su Telegram. Las
//     respuestas llegan aquí (punto rojo) y por Telegram si el usuario lo conectó.
// ?soporte=ID en la URL (link del Telegram) abre ese caso.

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
  const [pestana, setPestana] = useState<'preguntar' | 'soporte'>('preguntar')
  const [turnos, setTurnos] = useState<Turno[]>([])
  const [pregunta, setPregunta] = useState('')
  const [pensando, setPensando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [casos, setCasos] = useState<Caso[] | null>(null)
  const [nuevos, setNuevos] = useState(0)
  const [casoAbierto, setCasoAbierto] = useState<number | null>(null)
  const [escribiendo, setEscribiendo] = useState(false)     // formulario de caso nuevo
  const [texto, setTexto] = useState('')
  const [archivos, setArchivos] = useState<File[]>([])
  const [enviando, setEnviando] = useState(false)
  const [videos, setVideos] = useState<Video[]>([])
  const fin = useRef<HTMLDivElement>(null)

  const cargarCasos = useCallback(async () => {
    const d = await fetch('/api/soporte', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).catch(() => null)
    if (d) { setCasos(d.casos); setNuevos(d.nuevos) }
  }, [])

  // Respuestas nuevas de soporte: al entrar y cada 3 minutos (solo con la pestaña a la vista).
  useEffect(() => {
    cargarCasos()
    const t = setInterval(() => { if (document.visibilityState === 'visible') cargarCasos() }, 3 * 60_000)
    return () => clearInterval(t)
  }, [cargarCasos])

  // Link de Telegram: ?soporte=ID abre ese caso.
  useEffect(() => {
    const id = Number(params.get('soporte'))
    if (id) { setAbierta(true); setPestana('soporte'); setCasoAbierto(id) }
  }, [params])

  // Los videos (para enlazar las sugerencias por título), una vez al abrir.
  useEffect(() => {
    if (!abierta || videos.length) return
    fetch('/api/aprendizaje', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null))
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
      <textarea value={texto} onChange={e => setTexto(e.target.value)} onPaste={pegar} rows={casoId ? 3 : 5}
        placeholder={casoId ? 'Escribe tu respuesta… (Ctrl+V pega una captura)' : 'Cuéntanos qué pasó: qué hiciste y qué esperabas. Puedes pegar una captura con Ctrl+V.'}
        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:border-lime-600 focus:ring-2 focus:ring-lime-400/40" />
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

  return (
    <>
      {abierta && (
        <div role="dialog" aria-label="Ayuda"
          className="fixed z-[70] right-3 left-3 sm:left-auto bottom-[calc(4.75rem+env(safe-area-inset-bottom))] md:bottom-20 sm:w-[24rem] h-[min(78vh,38rem)] flex flex-col rounded-2xl border border-neutral-200 bg-white shadow-2xl overflow-hidden">
          <div className="bg-neutral-900 text-white px-4 pt-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold">¿En qué te ayudo?</p>
              {pestana === 'preguntar' && turnos.length > 0 && (
                <button onClick={() => { setTurnos([]); setError(null) }} className="ml-auto mr-3 text-xs text-neutral-300 hover:text-white">↺ Empezar de nuevo</button>
              )}
              <button onClick={() => setAbierta(false)} className="text-neutral-400 hover:text-white text-lg leading-none" aria-label="Cerrar">✕</button>
            </div>
            <div className="mt-2 flex gap-1">
              {([['preguntar', 'Preguntar'], ['soporte', 'Soporte']] as const).map(([k, t]) => (
                <button key={k} onClick={() => { setPestana(k); setError(null) }}
                  className={`px-3 py-1.5 text-sm border-b-2 ${pestana === k ? 'border-lime-400 text-white font-semibold' : 'border-transparent text-neutral-400 hover:text-neutral-200'}`}>
                  {t}{k === 'soporte' && nuevos > 0 && <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-red-500 align-middle" />}
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
                      <a href={`/aprendizaje?video=${t.video.id}`} className="mt-1.5 flex items-center gap-1.5 rounded-lg bg-white px-2 py-1.5 text-xs font-medium text-neutral-800 border border-neutral-200 hover:border-lime-400">
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
              <button onClick={() => setCasoAbierto(null)} className="text-xs text-neutral-500 hover:text-neutral-800">← Mis casos</button>
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
              {formulario(caso.id)}
              {caso.estado === 'respondido' && (
                <button onClick={() => resolver(caso.id)} className="btn-secondary text-xs">✓ Ya se resolvió</button>
              )}
              {error && <p className="text-red-600 text-xs">{error}</p>}
            </> : escribiendo || (casos && casos.length === 0) ? <>
              {casos && casos.length > 0 && <button onClick={() => setEscribiendo(false)} className="text-xs text-neutral-500 hover:text-neutral-800">← Mis casos</button>}
              <p className="font-medium text-neutral-800">Escribir a Soporte</p>
              <p className="text-xs text-neutral-500">{HORARIO} Junto con tu mensaje nos llega en qué pantalla estás, para ayudarte más rápido.</p>
              {formulario()}
              {error && <p className="text-red-600 text-xs">{error}</p>}
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

      {/* Solo un ícono de mensaje (menos invasivo); al pasar el cursor dice "Ayuda". */}
      <button onClick={() => setAbierta(a => !a)} aria-expanded={abierta} title={abierta ? 'Cerrar' : 'Ayuda'} aria-label={abierta ? 'Cerrar ayuda' : 'Ayuda'}
        className={`fixed z-[70] right-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] md:bottom-5 grid place-items-center h-12 w-12 rounded-full border border-neutral-900 bg-neutral-900 text-lime-400 shadow-lg hover:border-lime-400 ${abierta ? '' : '[body:has([data-barra-fija])_&]:hidden'}`}>
        {abierta
          ? <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
          : <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>}
        {!abierta && nuevos > 0 && <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-red-500 ring-2 ring-white" />}
      </button>
    </>
  )
}
