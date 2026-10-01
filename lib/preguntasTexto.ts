// ── Respuestas rápidas (app_settings `preguntas_plantillas`, JSON) ─────────
// Como las de MercadoLibre, con una condición opcional de precio del producto (USD):
// p. ej. "desde $3" → envío gratis; "menos de $3" → mínimo 2 unidades.
export interface Plantilla { titulo: string; texto: string; precio_desde?: number | null; precio_hasta?: number | null }

export function leerPlantillas(json: string | null | undefined): Plantilla[] {
  try {
    const v = JSON.parse(json ?? '[]')
    return Array.isArray(v) ? v.filter(p => p && typeof p.titulo === 'string' && typeof p.texto === 'string') : []
  } catch { return [] }
}

/** ¿La plantilla aplica a un producto de este precio? (sin precio conocido: aplica si no tiene condición) */
export function plantillaAplica(p: Plantilla, precio: number | null) {
  const desde = p.precio_desde ?? null, hasta = p.precio_hasta ?? null
  if (desde === null && hasta === null) return true
  if (precio === null) return false
  return (desde === null || precio >= desde) && (hasta === null || precio < hasta)
}

export function condicionPlantilla(p: Plantilla) {
  const d = p.precio_desde ?? null, h = p.precio_hasta ?? null
  if (d !== null && h !== null) return `productos de $${d} a menos de $${h}`
  if (d !== null) return `productos desde $${d}`
  if (h !== null) return `productos de menos de $${h}`
  return 'cualquier producto'
}

// ── Revisión del texto antes de enviarlo ───────────────────────────────────
// Dos niveles (corregido 2026-10-01 con la experiencia del dueño en MLV):
//   bloqueantes → correos, teléfonos, redes sociales: ML los borra; no se deja publicar.
//   avisos      → links que NO son de MercadoLibre: ML a veces los deja y a veces no (en la
//                 mensajería se rechazó Facebook, pasaron YouTube y Telegram). Se avisa,
//                 se puede publicar igual, y la relectura dice si ML la borró.
// Los links de MercadoLibre (artículo, listado, tienda) se permiten siempre.
const URL_RE = /(https?:\/\/[^\s]+|www\.[^\s]+|\b[\w-]+(\.[\w-]+)*\.(com|net|org|ve|co|ly|me|io|app|link)\b(\/[^\s]*)?)/gi
const ES_ML = /(^|\.|\/\/)(mercadolibre\.com(\.ve|\.co|\.ar|\.mx)?|mercadolibre\.co|meli\.la|mlstatic\.com)(\/|$|\b)/i

// `mensaje` = postventa (Mensajes): en MLV ahí SÍ se permiten teléfonos (pago móvil, etc.).
// Las preguntas son públicas y ML rechaza cualquier teléfono.
export function revisarTexto(t: string, tipo: 'pregunta' | 'mensaje' = 'pregunta'): { bloqueantes: string[]; avisos: string[] } {
  const bloqueantes: string[] = []
  const avisos: string[] = []
  const s = t.trim()
  if (!s) bloqueantes.push('La respuesta está vacía')
  if (s.length > 2000) bloqueantes.push('Pasa de 2000 caracteres (límite de MercadoLibre)')
  const urls = s.match(URL_RE) ?? []
  // Sin los links ni los códigos de publicación: así MLV-1011813036 no parece un teléfono.
  const sinUrls = s.replace(URL_RE, ' ').replace(/\bM[A-Z]{2}-?\d+\b/g, ' ')
  if (urls.some(u => !ES_ML.test(u))) avisos.push('Tiene un link que no es de MercadoLibre: puede que ML no lo deje publicar')
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(s)) bloqueantes.push('Tiene un correo')
  if (tipo === 'pregunta' && /(\+?\d[\d\s().-]{8,}\d)/.test(sinUrls.replace(/\b\d{1,3}([.,]\d{3})+([.,]\d+)?\b/g, ''))) bloqueantes.push('Parece tener un número de teléfono')
  if (/\b(whats\s*app|wasap|instagram|insta|facebook|telegram|tiktok)\b|(^|\s)@\w{3,}/i.test(sinUrls)) bloqueantes.push('Menciona redes sociales o un usuario de contacto')
  return { bloqueantes, avisos }
}

/** Lo que impide publicar (compatibilidad: los avisos no bloquean). */
export function problemasDelTexto(t: string, tipo: 'pregunta' | 'mensaje' = 'pregunta'): string[] {
  return revisarTexto(t, tipo).bloqueantes
}
