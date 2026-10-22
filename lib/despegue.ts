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
/** Foto del sello "Caso real" (recorte de la cara en la miniatura del episodio 5: el recorte está calculado para ESTA imagen). */
export const PLAYLIST_PORTADA = 'https://i.ytimg.com/vi/HDb7QVVhOPA/hqdefault.jpg'

/**
 * Portada del reproductor = la que YouTube da HOY para la lista (su episodio más nuevo), por oEmbed, guardada 1 hora.
 * 21-10: estaba fija en el episodio 5 y al subir el 6 quedó vieja. Si YouTube no responde, la del episodio 5.
 */
export async function portadaSerie(): Promise<string> {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(PLAYLIST_URL)}`,
      { next: { revalidate: 3600 }, signal: AbortSignal.timeout(3000) })
    const j = r.ok ? await r.json() as { thumbnail_url?: string } : null
    return j?.thumbnail_url?.startsWith('https://i.ytimg.com/') ? j.thumbnail_url : PLAYLIST_PORTADA
  } catch {
    return PLAYLIST_PORTADA
  }
}

/** Pago único (21-10: sin cuotas). */
export const PRECIO = 99
export const PRECIO_DESPUES = 119

/** Las 8 semanas (grupo 1), como ETAPAS que sirven a quien empieza de cero (la construye) y a quien ya tiene
 *  cuenta (la revisa y la ajusta). El 27-12 es descanso navideño: sin reunión y con el Radar cerrado. */
export const SEMANAS: { n: number | null; fecha: string; tema: string }[] = [
  { n: 1, fecha: '2026-11-08', tema: 'Diagnóstico y qué vender: qué conviene vender o qué está fallando en tu cuenta' },
  { n: 2, fecha: '2026-11-15', tema: 'Publicaciones que venden: crear o corregir título, fotos y precio' },
  { n: 3, fecha: '2026-11-22', tema: 'El precio real: comisión, envío y cuánto te queda de verdad' },
  { n: 4, fecha: '2026-11-29', tema: 'De visitas a ventas: preguntas, mensajes y rapidez' },
  { n: 5, fecha: '2026-12-06', tema: 'MercadoEnvíos: activarlo y despachar sin errores' },
  { n: 6, fecha: '2026-12-13', tema: 'Reputación: subirla, cuidarla y manejar reclamos' },
  { n: 7, fecha: '2026-12-20', tema: 'Reponer y crecer en temporada' },
  { n: null, fecha: '2026-12-27', tema: 'Descanso navideño' },
  { n: 8, fecha: '2027-01-03', tema: 'Tu plan para los próximos meses' },
]

export interface GrupoDespegue {
  id: number; nombre: string; cupos: number; tomados: number
  inicio: string; aparta_hasta: string   // YYYY-MM-DD
  caso_inicio: string; caso_ventas: number  // el caso real (mig. 113): desde cuándo y cuántas ventas lleva
}

/** Días transcurridos entre dos fechas YYYY-MM-DD (el 15-09 al 21-10 = 36). */
export function diasEntre(desde: string, hasta: string) {
  const t = (x: string) => { const [a, m, d] = x.split('-').map(Number); return Date.UTC(a, m - 1, d) }
  return Math.max(0, Math.round((t(hasta) - t(desde)) / 86_400_000))
}

/** "casi una cada 2 días" / "más de una cada 2 días" / "más de una venta por día", con los números reales. */
export function ritmoVentas(dias: number, ventas: number): string | null {
  if (ventas <= 0 || dias <= 0) return null
  const cada = dias / ventas
  if (cada < 0.95) return 'más de una venta por día'
  if (cada <= 1.05) return 'una venta por día'
  const n = Math.round(cada)
  if (Math.abs(cada - n) < 0.05) return `una cada ${n} días`
  return cada > n ? `casi una cada ${n} días` : `más de una cada ${n} días`
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

// El Radar en números (21-10, de su base: 44.565 productos antes de la corrida de noviembre, 320 categorías, 2.514 búsquedas
// en tendencia, 1.143 con interés en Google Trends; la actividad se mide en todo el catálogo). Lo usan /despegue y /inicio.
export const RADAR_CIFRAS = [
  { n: '+45.000', d: 'productos de MercadoLibre Venezuela' },
  { n: '+320', d: 'categorías' },
  { n: '+2.500', d: 'búsquedas en tendencia: las que más crecen y las más populares' },
  { n: '+1.100', d: 'tendencias validadas con Google Trends' },
  { n: '+45.000', d: 'productos con su actividad medida: si suben o se apagan' },
]
