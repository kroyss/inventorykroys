// Programa Despegue (21-10-2026, migración 112; página pública /despegue). 8 semanas para quien empieza en
// MercadoLibre: reunión semanal por Meet, Domingo de Radar (Pro solo ese día), 3 sesiones 1 a 1 y grupo de
// Telegram. Sin formulario: "Apartar mi cupo" abre el chat de Telegram y el cupo se aparta pagando (el dueño
// cobra por chat y sube `despegue_grupos.tomados` en Plataforma).

export const TELEGRAM_DESPEGUE = 'elcomerciantedigital'
export const MENSAJE_TELEGRAM = 'Hola, quiero apartar mi cupo en el Programa Despegue 🚀'
/** Abre el chat con el mensaje ya escrito (si la app de Telegram no lo pone, igual abre el chat). */
export const LINK_TELEGRAM = `https://t.me/${TELEGRAM_DESPEGUE}?text=${encodeURIComponent(MENSAJE_TELEGRAM)}`
export const COMUNIDAD_TELEGRAM = 'https://t.me/comerciantedigitalve'

/** Serie "Vendiendo en Mercado Libre desde Cero" (YouTube): la prueba real de la cuenta desde cero. */
export const PLAYLIST_ID = 'PLECJe7v2_uYU'
export const PLAYLIST_URL = `https://www.youtube.com/playlist?list=${PLAYLIST_ID}`
export const PLAYLIST_EMBED = `https://www.youtube-nocookie.com/embed/videoseries?list=${PLAYLIST_ID}&rel=0`
/** Portada del reproductor antes de tocar play (miniatura del episodio 5, "25 días vendiendo"). */
export const PLAYLIST_PORTADA = 'https://i.ytimg.com/vi/HDb7QVVhOPA/hqdefault.jpg'

export const PRECIO = 90
export const PRECIO_DESPUES = 120
export const CUOTA = 45

/** Las 8 semanas (grupo 1). El 27-12 es descanso navideño: sin reunión y con el Radar cerrado. */
export const SEMANAS: { n: number | null; fecha: string; tema: string }[] = [
  { n: 1, fecha: '2026-11-08', tema: 'Qué vender, con cuánto capital y desde dónde' },
  { n: 2, fecha: '2026-11-15', tema: 'Tus primeras publicaciones: título, fotos y precio' },
  { n: 3, fecha: '2026-11-22', tema: 'El precio real: comisión, envío y cuánto te queda' },
  { n: 4, fecha: '2026-11-29', tema: 'Primeras ventas: preguntas, mensajes y rapidez' },
  { n: 5, fecha: '2026-12-06', tema: 'MercadoEnvíos: activarlo y despachar' },
  { n: 6, fecha: '2026-12-13', tema: 'Reputación: calificaciones y reclamos' },
  { n: 7, fecha: '2026-12-20', tema: 'Reponer y crecer en temporada' },
  { n: null, fecha: '2026-12-27', tema: 'Descanso navideño' },
  { n: 8, fecha: '2027-01-03', tema: 'Tu plan para los próximos meses' },
]

export interface GrupoDespegue {
  id: number; nombre: string; cupos: number; tomados: number
  inicio: string; aparta_hasta: string   // YYYY-MM-DD
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
/** "domingo 8 de noviembre" (fecha de calendario, sin zona horaria). */
export function fechaLarga(iso: string) {
  const [a, m, d] = iso.split('-').map(Number)
  return `${DIAS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]} ${d} de ${MESES[m - 1]}`
}
/** "8 nov" */
export function fechaCorta(iso: string) {
  const [, m, d] = iso.split('-').map(Number)
  return `${d} ${MESES[m - 1].slice(0, 3)}`
}

// ── Visitas: copia de lo de Fundadores (app/api/fundadores/route.ts), aparte para no tocar lo que funciona ──
export const BOT = /bot|crawl|spider|preview|headless|externalhit|curl|python|wget/i
/** No se cuenta de nuevo la misma vista en 30 minutos (recargas) ni el mismo clic en 12 horas. */
export const REPETIDA = { vista: '30 minutes', video: '12 hours', telegram: '12 hours' } as const

/** De dónde llegó: el utm del anuncio; si no, el sitio que la mandó; si no, la app desde la que abrió. */
export function origenDe(v: { utm_source?: string; referrer?: string }, ua: string) {
  const utm = v.utm_source?.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 30)
  if (utm) return utm
  let host = ''
  try { host = v.referrer ? new URL(v.referrer).hostname.replace(/^www\./, '') : '' } catch { /* referrer raro */ }
  if (/instagram/.test(host)) return 'instagram'
  if (/facebook|fb\.|messenger/.test(host)) return 'facebook'
  if (/whatsapp|wa\.me/.test(host)) return 'whatsapp'
  if (/t\.me|telegram/.test(host)) return 'telegram'
  if (/youtube|youtu\.be/.test(host)) return 'youtube'
  if (/google/.test(host)) return 'google'
  if (host && !host.endsWith('elcomerciantedigital.com')) return host.slice(0, 40)
  if (/Instagram/.test(ua)) return 'instagram'
  if (/FBAN|FBAV|FB_IAB/.test(ua)) return 'facebook'
  if (/WhatsApp/i.test(ua)) return 'whatsapp'
  return 'directo'
}
