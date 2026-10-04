'use client'
import { useEffect, useRef, useState } from 'react'
import { PageHeader } from '@/components/ui'

interface Video {
  id: number; orden: number; titulo: string; descripcion: string | null; youtube_id: string
  visto_seg: number; duracion_seg: number; posicion_seg: number; completado: boolean
}

// API de YouTube (iframe), lo mínimo que se usa.
interface YTPlayer { getCurrentTime(): number; getDuration(): number; getPlayerState(): number; setPlaybackRate(r: number): void; destroy(): void }
declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, o: object) => YTPlayer; PlayerState: { PLAYING: number; ENDED: number; PAUSED: number } }
    onYouTubeIframeAPIReady?: () => void
  }
}
let apiYoutube: Promise<void> | null = null
function cargarApiYoutube() {
  if (window.YT?.Player) return Promise.resolve()
  apiYoutube ??= new Promise<void>(ok => {
    const previo = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => { previo?.(); ok() }
    const s = document.createElement('script')
    s.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(s)
  })
  return apiYoutube
}

const COMPLETO = 0.8
const pct = (v: Video) => (v.duracion_seg > 0 ? Math.min(100, Math.round(v.visto_seg / v.duracion_seg * 100)) : 0)

/** Aprendizaje: videos en orden (el siguiente se habilita al completar el anterior), dentro de la web. */
export default function AprendizajeClient() {
  const [videos, setVideos] = useState<Video[] | null>(null)
  const [agendar, setAgendar] = useState<string | null>(null)
  const [actual, setActual] = useState<number | null>(null)

  useEffect(() => {
    let vivo = true
    fetch('/api/aprendizaje', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!vivo || !d) return
        setVideos(d.videos); setAgendar(d.agendar)
        // Abre en el primer video sin terminar.
        setActual(a => a ?? (d.videos.find((v: Video) => !v.completado) ?? d.videos[0])?.id ?? null)
      })
      .catch(() => {})
    return () => { vivo = false }
  }, [])

  if (!videos) return <PageHeader title="Aprendizaje" subtitle="Cargando…" />
  if (videos.length === 0) {
    return <div className="space-y-5"><PageHeader title="Aprendizaje" subtitle="Por dónde empezar" />
      <PrimerosPasos agendar={agendar} hayVideos={false} /></div>
  }

  const hechos = videos.filter(v => v.completado).length
  const total = videos.length
  const primeroPendiente = videos.findIndex(v => !v.completado)
  const habilitado = (i: number) => primeroPendiente === -1 || i <= primeroPendiente
  const v = videos.find(x => x.id === actual) ?? videos[0]
  const idx = videos.indexOf(v)
  const siguiente = videos[idx + 1]

  // Avance que reporta el reproductor (se refleja al instante en la lista).
  const avance = (id: number, visto: number, duracion: number, completado: boolean) =>
    setVideos(vs => vs && vs.map(x => (x.id === id
      ? { ...x, visto_seg: Math.max(x.visto_seg, visto), duracion_seg: duracion, completado: x.completado || completado } : x)))

  return (
    <div className="space-y-5">
      <PageHeader title="Aprendizaje" subtitle="Videos cortos para sacarle todo el provecho al sistema, en orden" />

      {/* Progreso total */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm px-5 py-4">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-medium text-neutral-800">Tu avance</span>
          <span className="text-neutral-500"><b className="text-neutral-900 num">{hechos}</b> de {total} videos · {Math.round(hechos / total * 100)}%</span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-neutral-100 overflow-hidden">
          <div className="h-full bg-lime-500 transition-[width] duration-500" style={{ width: `${hechos / total * 100}%` }} />
        </div>
        {hechos === total && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 bg-lime-50 border border-lime-300 rounded-lg px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-neutral-900">¡Completaste el curso! 🎉</p>
              <p className="text-sm text-neutral-600">Ya puedes agendar tu sesión de configuración.</p>
            </div>
            {agendar && <a href={agendar} target="_blank" rel="noreferrer" className="btn-primary text-sm">Agendar mi configuración</a>}
          </div>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* Reproductor */}
        <section className="space-y-3 min-w-0">
          <Reproductor key={v.id} video={v} onAvance={avance} />
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">{idx + 1}. {v.titulo}</h2>
            {v.descripcion && <p className="text-sm text-neutral-600 mt-1 whitespace-pre-line">{v.descripcion}</p>}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span className={v.completado ? 'text-emerald-700 font-medium' : 'text-neutral-500'}>
              {v.completado ? '✓ Visto' : `Visto ${pct(v)}% · se completa al llegar al ${COMPLETO * 100}%`}
            </span>
            {siguiente && (
              <button disabled={!v.completado} onClick={() => setActual(siguiente.id)}
                title={v.completado ? undefined : 'Termina este video para pasar al siguiente'}
                className="btn-primary text-sm disabled:opacity-40">Siguiente →</button>
            )}
          </div>
        </section>

        {/* Lista */}
        <ol className="bg-white rounded-xl border border-neutral-200 shadow-sm divide-y divide-neutral-100 self-start">
          {videos.map((x, i) => {
            const libre = habilitado(i)
            const activo = x.id === v.id
            return (
              <li key={x.id}>
                <button disabled={!libre} onClick={() => setActual(x.id)}
                  title={libre ? undefined : 'Primero termina el video anterior'}
                  className={`w-full text-left px-4 py-3 flex items-center gap-3 ${activo ? 'bg-lime-50/70' : libre ? 'hover:bg-neutral-50' : 'opacity-50 cursor-not-allowed'}`}>
                  <span className={`grid place-items-center w-7 h-7 shrink-0 rounded-full text-xs font-semibold ${
                    x.completado ? 'bg-lime-500 text-white' : activo ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-500'}`}>
                    {x.completado ? '✓' : libre ? i + 1 : '🔒'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-neutral-900 truncate">{x.titulo}</span>
                    {!x.completado && x.visto_seg > 0 && (
                      <span className="mt-1 block h-1 rounded-full bg-neutral-100 overflow-hidden">
                        <span className="block h-full bg-lime-400" style={{ width: `${pct(x)}%` }} />
                      </span>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}

/** Video de YouTube incrustado que cuenta los segundos REALMENTE reproducidos (saltar no suma; a 2x
 *  cuenta igual), sigue desde donde quedó y guarda cada 5 s, al pausar y al cerrar/recargar la página. */
const VELOCIDADES = [1, 1.25, 1.5, 2]

function Reproductor({ video, onAvance }: {
  video: Video; onAvance: (id: number, visto: number, duracion: number, completado: boolean) => void
}) {
  const caja = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YTPlayer | null>(null)
  const [velocidad, setVelocidad] = useState(1)
  const avanceRef = useRef(onAvance)
  useEffect(() => { avanceRef.current = onAvance }, [onAvance])
  // Lo de antes se toma UNA vez al montar: el avance de este mismo video no debe recrear el reproductor.
  const inicial = useRef({ visto: video.visto_seg, completado: video.completado, posicion: video.posicion_seg, duracion: video.duracion_seg })

  const cambiarVelocidad = (v: number) => {
    setVelocidad(v)
    try { playerRef.current?.setPlaybackRate(v) } catch { /* todavía no cargó */ }
  }

  useEffect(() => {
    let player: YTPlayer | null = null
    let visto = inicial.current.visto    // lo ya visto antes (en el servidor)
    let ultimo = -1, guardado = -1, completado = inicial.current.completado
    let vivo = true

    const cuerpo = () => {
      if (!player) return null
      const duracion = Math.round(player.getDuration() || 0)
      if (duracion <= 0) return null
      return { video_id: video.id, visto_seg: Math.floor(visto), duracion_seg: duracion,
               posicion_seg: Math.floor(player.getCurrentTime?.() ?? 0) }
    }
    const guardar = async () => {
      const b = cuerpo()
      if (!b) return
      const clave = b.visto_seg * 100000 + b.posicion_seg
      if (clave === guardado) return
      guardado = clave
      const r = await fetch('/api/aprendizaje/progreso', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b),
      }).catch(() => null)
      const d = r?.ok ? await r.json().catch(() => null) : null
      if (d?.completado) completado = true
      if (vivo) avanceRef.current(video.id, b.visto_seg, b.duracion_seg, completado)
    }
    // Al recargar (F5) o cerrar la pestaña: se manda igual (sendBeacon no espera respuesta).
    const alSalir = () => {
      const b = cuerpo()
      if (b) navigator.sendBeacon?.('/api/aprendizaje/progreso', new Blob([JSON.stringify(b)], { type: 'application/json' }))
    }
    const alOcultar = () => { if (document.visibilityState === 'hidden') alSalir() }
    window.addEventListener('pagehide', alSalir)
    document.addEventListener('visibilitychange', alOcultar)

    // Sigue desde donde quedó (si no lo terminó y no está al final).
    const { posicion, duracion: durAntes } = inicial.current
    const desde = !inicial.current.completado && posicion > 3 && (!durAntes || posicion < durAntes - 5) ? posicion : 0

    let tick: ReturnType<typeof setInterval> | undefined
    let cuenta = 0
    cargarApiYoutube().then(() => {
      if (!vivo || !caja.current || !window.YT) return
      const el = document.createElement('div')
      caja.current.appendChild(el)
      player = new window.YT.Player(el, {
        videoId: video.youtube_id,
        host: 'https://www.youtube-nocookie.com',
        width: '100%', height: '100%',
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1, ...(desde ? { start: Math.floor(desde) } : {}) },
        events: {
          onStateChange: (e: { data: number }) => {
            const S = window.YT!.PlayerState
            if (e.data === S.PAUSED || e.data === S.ENDED) guardar()
          },
        },
      })
      playerRef.current = player
      tick = setInterval(() => {
        if (!player || !window.YT) return
        const t = player.getCurrentTime?.() ?? 0
        if (player.getPlayerState?.() === window.YT.PlayerState.PLAYING) {
          const d = t - ultimo
          if (ultimo >= 0 && d > 0 && d <= 2.5) visto += d    // avance normal (hasta 2x): un salto no suma
          const duracion = player.getDuration() || 0
          if (duracion > 0) visto = Math.min(visto, duracion)
          if (++cuenta % 5 === 0) guardar()
        }
        ultimo = t
      }, 1000)
    })

    return () => {
      vivo = false
      window.removeEventListener('pagehide', alSalir)
      document.removeEventListener('visibilitychange', alOcultar)
      if (tick) clearInterval(tick)
      playerRef.current = null
      guardar().finally(() => { try { player?.destroy() } catch { /* ya no está */ } })
    }
  }, [video.id, video.youtube_id])

  return (
    <div className="space-y-2">
      <div ref={caja} className="aspect-video w-full overflow-hidden rounded-xl bg-neutral-900 [&>*]:w-full [&>*]:h-full" />
      <div className="flex items-center gap-1.5 text-xs text-neutral-500">
        Velocidad:
        {VELOCIDADES.map(v => (
          <button key={v} onClick={() => cambiarVelocidad(v)}
            className={`px-2 py-0.5 rounded-full border ${velocidad === v ? 'bg-neutral-900 text-white border-neutral-900' : 'border-neutral-300 hover:border-neutral-500'}`}>
            {v}x
          </button>
        ))}
      </div>
    </div>
  )
}

/** Los primeros pasos, en orden (lo primero que ve un cliente nuevo). Sin videos todavía, es la guía. */
function PrimerosPasos({ agendar, hayVideos }: { agendar: string | null; hayVideos: boolean }) {
  const pasos: { titulo: string; texto: string; link?: { href: string; label: string; externo?: boolean } }[] = [
    { titulo: 'Aprende primero', texto: hayVideos
        ? 'Mira los videos de esta página, en orden. Tus días de prueba no corren mientras no conectes tu cuenta.'
        : 'Los videos cortos aparecerán en esta página. Mientras tanto, recorre Automatizaciones con calma: tus días de prueba no corren mientras no conectes tu cuenta.' },
    { titulo: 'Conecta tu cuenta de MercadoLibre', texto: 'Con la cuenta PRINCIPAL abierta en este navegador. Desde ese día empiezan tus días de prueba.',
      link: { href: '/conectar', label: 'Conectar ahora →' } },
    { titulo: 'Escribe tus políticas', texto: 'Envíos, garantía, horarios y formas de pago: con eso la IA responde tus preguntas como tú.',
      link: { href: '/preguntas', label: 'Ir a Preguntas →' } },
    { titulo: 'Agenda tu configuración', texto: 'Te acompañamos 1 a 1 a dejar todo listo: Despachos, Reportador y Calificaciones.',
      link: agendar ? { href: agendar, label: 'Agendar por Telegram →', externo: true } : undefined },
  ]
  return (
    <ol className="bg-white rounded-xl border border-neutral-200 shadow-sm divide-y divide-neutral-100">
      {pasos.map((p, i) => (
        <li key={p.titulo} className="flex gap-4 px-5 py-4">
          <span className="shrink-0 w-7 h-7 rounded-full bg-lime-100 text-lime-900 text-sm font-semibold flex items-center justify-center num">{i + 1}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-neutral-900">{p.titulo}</p>
            <p className="text-sm text-neutral-600">{p.texto}</p>
            {p.link && (p.link.externo
              ? <a href={p.link.href} target="_blank" rel="noreferrer" className="inline-block mt-1 text-sm font-medium text-lime-800 hover:underline">{p.link.label}</a>
              : <a href={p.link.href} className="inline-block mt-1 text-sm font-medium text-lime-800 hover:underline">{p.link.label}</a>)}
          </div>
        </li>
      ))}
    </ol>
  )
}
