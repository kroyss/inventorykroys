'use client'
// Partes con interacción de la página /despegue (21-10-2026): medir el embudo, el botón de Telegram y la serie
// de YouTube (se carga recién al tocar play: la página abre rápido aun con mala conexión).
import { useEffect, useState } from 'react'
import { LINK_TELEGRAM, PLAYLIST_EMBED, PLAYLIST_PORTADA, PLAYLIST_URL } from '@/lib/despegue'

// Mismo id de navegador que la página de Fundadores (`ecd_nav`): la misma persona en las dos páginas.
function navegadorId() {
  try {
    let id = localStorage.getItem('ecd_nav')
    if (!id) { id = crypto.randomUUID(); localStorage.setItem('ecd_nav', id) }
    return id
  } catch { return undefined }
}

/** Anota un paso del embudo sin esperar respuesta: si falla, no afecta nada. ?vista=previa no cuenta. */
function medir(evento: 'vista' | 'video' | 'telegram') {
  try {
    const q = new URLSearchParams(window.location.search)
    if (q.get('vista') === 'previa') return
    const id = navegadorId()
    if (!id) return
    // El origen de la PRIMERA visita a esta página (el anuncio o red que la trajo).
    let o: { utm_source?: string; utm_campaign?: string; referrer?: string } = {}
    const guardado = localStorage.getItem('ecd_origen_despegue')
    if (guardado) o = JSON.parse(guardado)
    else {
      o = { utm_source: q.get('utm_source') ?? undefined, utm_campaign: q.get('utm_campaign') ?? undefined,
            referrer: document.referrer || undefined }
      localStorage.setItem('ecd_origen_despegue', JSON.stringify(o))
    }
    fetch('/api/despegue', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, keepalive: true,
      body: JSON.stringify({ navegador_id: id, evento, ...o }),
    }).catch(() => {})
  } catch { /* sin localStorage: no se mide */ }
}

export function MedirVista() {
  useEffect(() => { medir('vista') }, [])
  return null
}

const IconoTelegram = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" />
  </svg>
)

/** "Apartar mi cupo por Telegram": abre el chat con el mensaje ya escrito. */
export function BotonCupo({ texto = 'Apartar mi cupo por Telegram', grande = false, className = '' }: {
  texto?: string; grande?: boolean; className?: string
}) {
  return (
    <a href={LINK_TELEGRAM} target="_blank" rel="noreferrer" onClick={() => medir('telegram')}
      className={`inline-flex items-center justify-center gap-2 rounded-xl bg-lime-400 font-semibold text-neutral-950 shadow-[0_8px_30px_-8px_rgba(163,230,53,0.6)] transition hover:bg-lime-300 active:scale-[0.98] ${
        grande ? 'px-6 py-4 text-base' : 'px-5 py-3 text-sm'} ${className}`}>
      <IconoTelegram className={grande ? 'w-5 h-5' : 'w-4 h-4'} />
      {texto}
    </a>
  )
}

/** La serie de YouTube: portada con play; al tocarla se carga el reproductor (lista completa). */
export function VideoSerie() {
  const [play, setPlay] = useState(false)
  return (
    <div>
      <div className="relative aspect-video overflow-hidden rounded-2xl border border-white/10 bg-neutral-900 shadow-2xl">
        {play ? (
          <iframe src={`${PLAYLIST_EMBED}&autoplay=1`} title="Vendiendo en Mercado Libre desde Cero"
            className="absolute inset-0 h-full w-full" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
        ) : (
          <button type="button" onClick={() => { setPlay(true); medir('video') }}
            className="group absolute inset-0 h-full w-full" aria-label="Ver la serie: Vendiendo en Mercado Libre desde Cero">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={PLAYLIST_PORTADA} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-80 transition group-hover:opacity-100" />
            <span className="absolute inset-0 bg-gradient-to-t from-neutral-950/80 via-neutral-950/10 to-transparent" />
            <span className="absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-lime-400 text-neutral-950 shadow-xl transition group-hover:scale-110 sm:h-20 sm:w-20">
              <svg viewBox="0 0 24 24" className="ml-1 h-7 w-7 sm:h-8 sm:w-8" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
            </span>
            <span className="absolute bottom-3 left-4 right-4 text-left">
              <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-lime-400">Serie en YouTube · 5 episodios</span>
              <span className="block text-sm font-semibold text-white sm:text-base">Vendiendo en Mercado Libre desde Cero</span>
            </span>
          </button>
        )}
      </div>
      <a href={PLAYLIST_URL} target="_blank" rel="noreferrer"
        className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-lime-400 hover:text-lime-300">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
        Ver la lista completa en YouTube <span aria-hidden="true">↗</span>
      </a>
    </div>
  )
}
