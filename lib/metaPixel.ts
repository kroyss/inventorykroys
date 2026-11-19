// Píxel de Meta (19-11-2026, el dueño: «que Meta aprenda quién se registra»). Conjunto de datos «El Comerciante
// Digital - Web» (cuenta publicitaria Rebaja Wow). SOLO en la página pública /registro: PageView al entrar y
// CompleteRegistration al crear la cuenta. Nunca dentro del sistema ni con datos personales (sin «advanced matching»:
// ni nombre, ni correo, ni teléfono). Con eso los anuncios pueden optimizar por registros en vez de por clics.
export const META_PIXEL_ID = '1198944175797777'

type Fbq = ((...a: unknown[]) => void) & { callMethod?: (...a: unknown[]) => void; queue: unknown[]; loaded: boolean; version: string; push: unknown }
declare global { interface Window { fbq?: Fbq; _fbq?: Fbq } }

/** Carga el píxel una vez y registra la visita (PageView). */
export function iniciarPixel() {
  if (typeof window === 'undefined' || window.fbq) return
  const f = function (...a: unknown[]) { if (f.callMethod) f.callMethod(...a); else f.queue.push(a) } as Fbq
  f.push = f; f.loaded = true; f.version = '2.0'; f.queue = []
  window.fbq = f; window._fbq = f
  const s = document.createElement('script')
  s.async = true; s.src = 'https://connect.facebook.net/en_US/fbevents.js'
  document.head.appendChild(s)
  f('init', META_PIXEL_ID)
  f('track', 'PageView')
}

/** Evento estándar del píxel (si está cargado). Espera un poco para que salga antes de cambiar de página. */
export function eventoPixel(nombre: 'CompleteRegistration'): Promise<void> {
  try { window.fbq?.('track', nombre) } catch {}
  return new Promise(r => setTimeout(r, window.fbq ? 400 : 0))
}
