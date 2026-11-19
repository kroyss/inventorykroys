'use client'
import { olvidar } from '@/lib/comun'
import { EVENTO_AYUDA_FLOTANTE } from '@/components/layout/BurbujaAyuda'
import { useEffect, useRef, useState } from 'react'
import { PageHeader } from '@/components/ui'
import Link from '@/components/ui/Link'
import { Nuevo, type ClaveNuevo } from '@/components/ui/Nuevo'

export interface Video {
  id: number; orden: number; titulo: string; descripcion: string | null; youtube_id: string
  serie: 'automatizaciones' | 'mercadoenvios' | 'inventario'; duracion_video: number | null
  nuevo?: boolean
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


/** Aprendizaje: videos en el orden recomendado, dentro de la web. Todos libres (28-10): el cliente llega con una
 *  necesidad concreta (p.ej. conectar MercadoEnvíos) y el candado lo frenaba; el orden queda como sugerencia. */
// 14-11: Manuales (formato nuevo). 18-11 (el dueño): también el de Automatizaciones, y «Abrir» como botón de verdad.
function TarjetaManual({ href, titulo, texto, color, nuevo }: { href: string; titulo: string; texto: string; color: string; nuevo?: ClaveNuevo }) {
  return (
    <Link href={href}
      className="group flex items-center gap-4 rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-sm transition hover:-translate-y-px hover:border-neutral-300 hover:shadow-md">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${color}`} aria-hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
          <path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2V5z" /><path d="M8 7h6M8 11h6" />
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-neutral-900">{titulo}{nuevo && <Nuevo clave={nuevo} />}</span>
        <span className="block text-sm text-neutral-500">{texto}</span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition group-hover:bg-neutral-700">
        Abrir
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" aria-hidden>
          <path d="M4 10h12M11 5l5 5-5 5" />
        </svg>
      </span>
    </Link>
  )
}

function Manuales({ inventario, automatizaciones }: { inventario: boolean; automatizaciones: boolean }) {
  if (!inventario && !automatizaciones) return null
  return (
    <section aria-label="Manuales" className="space-y-2">
      <h2 className="text-sm font-semibold text-neutral-700">Manuales</h2>
      <div className={`grid gap-3 ${inventario && automatizaciones ? 'lg:grid-cols-2' : ''}`}>
        {automatizaciones && <TarjetaManual href="/aprendizaje/manual/automatizaciones" titulo="Manual de Automatizaciones" color="bg-sky-100 text-sky-800" nuevo="manual_automatizaciones"
          texto="Cuentas de MercadoLibre, Preguntas, Mensajes, Calificaciones, Stock, Pagos ME, Despachos y Reportador, con videos de apoyo y buscador" />}
        {inventario && <TarjetaManual href="/aprendizaje/manual/inventario" titulo="Manual de Inventario" color="bg-lime-100 text-lime-800"
          texto="Primeros pasos, Inicio, Productos, Publicaciones, Ventas, Compras y Reportes, con capturas y buscador" />}
      </div>
    </section>
  )
}

export default function AprendizajeClient({ manualInventario = false, manualAutomatizaciones = false }: { manualInventario?: boolean; manualAutomatizaciones?: boolean }) {
  // 19-11 (el dueño): Aprendizaje queda solo con los Manuales; los videos viven dentro de su capítulo del manual.
  const [d, setD] = useState<{ agendar: string | null; conectar: boolean; inventario: boolean; ayudaFlotante: boolean } | null>(null)

  useEffect(() => {
    // Enlaces viejos a /aprendizaje?video=ID: abren ese video dentro del manual.
    const pedido = Number(new URLSearchParams(window.location.search).get('video'))
    if (pedido && manualAutomatizaciones) { window.location.replace(`/aprendizaje/manual/automatizaciones?video=${pedido}`); return }
    let vivo = true
    fetch('/api/aprendizaje', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(x => {
        if (!vivo || !x) return
        setD({ agendar: x.agendar ?? null, conectar: !!x.sinCuentas && !!x.esAdmin, inventario: !!x.inventario || !!x.exento, ayudaFlotante: !!x.ayudaFlotante })
      })
      .catch(() => {})
    return () => { vivo = false }
  }, [manualAutomatizaciones])

  return (
    <div className="space-y-5">
      <PageHeader title="Aprendizaje" subtitle="Manuales para sacarle todo el provecho al sistema: cada pantalla explicada, con capturas, buscador y videos de apoyo" />
      <Manuales inventario={manualInventario} automatizaciones={manualAutomatizaciones} />
      {d && <AyudaEnTodo activa={d.ayudaFlotante} onCambio={v => setD(x => x && { ...x, ayudaFlotante: v })} />}

      {d?.conectar && <PrimerosPasos agendar={d.agendar} manual={manualAutomatizaciones} />}
      {!d?.conectar && !manualInventario && !manualAutomatizaciones && d && <PrimerosPasos agendar={d.agendar} manual={false} />}

      {/* Inventario es OPCIONAL: las automatizaciones trabajan solas con MercadoLibre; a quien no lo tiene se le ofrece. */}
      {d && !d.inventario && !d.conectar && manualAutomatizaciones && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-5 py-4 shadow-sm">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-neutral-900">Siguiente paso (opcional): Inventario</p>
            <p className="text-sm text-neutral-600">
              Si además quieres llevar tu stock, compras, costos y ganancias en el sistema, escríbenos y te lo activamos.
              No es obligatorio: las automatizaciones funcionan sin él.
            </p>
          </div>
          {d.agendar && <a href={d.agendar} target="_blank" rel="noreferrer" className="btn-secondary text-sm">Quiero Inventario</a>}
        </div>
      )}
    </div>
  )
}

/** Video de YouTube incrustado que cuenta los segundos REALMENTE reproducidos (saltar no suma; a 2x
 *  cuenta igual), sigue desde donde quedó y guarda cada 5 s, al pausar y al cerrar/recargar la página. */
const VELOCIDADES = [1, 1.25, 1.5, 2]

export function Reproductor({ video, onAvance }: {
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
      olvidar('aprendizaje')
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
/** 19-11 (mig. 187): el ícono de Ayuda (preguntar con el manual + Soporte) sale aquí; con esto, en todas las pantallas. */
function AyudaEnTodo({ activa, onCambio }: { activa: boolean; onCambio: (v: boolean) => void }) {
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cambiar = async () => {
    const v = !activa
    setGuardando(true); setError(null); onCambio(v)
    const r = await fetch('/api/aprendizaje/ayuda', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ activa: v }) }).catch(() => null)
    setGuardando(false)
    if (!r?.ok) { onCambio(!v); setError((await r?.json().catch(() => null))?.error ?? 'No se pudo guardar. Intenta de nuevo.'); return }
    olvidar('aprendizaje')
    window.dispatchEvent(new CustomEvent(EVENTO_AYUDA_FLOTANTE, { detail: v }))
  }
  return (
    <section aria-label="Ayuda" className="flex items-center gap-4 rounded-xl border border-neutral-200 bg-white px-5 py-4 shadow-sm">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-neutral-900 text-lime-400" aria-hidden>
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-neutral-900">Ayuda en todo el sistema</p>
        <p className="text-sm text-neutral-500">
          El botón de Ayuda (abajo a la derecha: preguntas con el manual y Soporte) está siempre aquí en Aprendizaje.
          {activa ? ' Ahora también sale en todas las pantallas.' : ' Actívalo para tenerlo también en todas las pantallas.'}
        </p>
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      </div>
      <button type="button" role="switch" aria-checked={activa} aria-label="Ayuda en todo el sistema" onClick={cambiar} disabled={guardando}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${activa ? 'bg-lime-500' : 'bg-neutral-300'}`}>
        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${activa ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </section>
  )
}

function PrimerosPasos({ agendar, manual }: { agendar: string | null; manual: boolean }) {
  const pasos: { titulo: string; texto: string; link?: { href: string; label: string; externo?: boolean } }[] = [
    { titulo: 'Aprende primero', texto: manual
        ? 'Lee el Manual de Automatizaciones: cada capítulo trae su video. Tus días de prueba no corren mientras no conectes tu cuenta.'
        : 'Recorre el sistema con calma: tus días de prueba no corren mientras no conectes tu cuenta.',
      link: manual ? { href: '/aprendizaje/manual/automatizaciones', label: 'Abrir el manual →' } : undefined },
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
