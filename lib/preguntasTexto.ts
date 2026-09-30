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
// ML rechaza (o descarta en silencio) links externos y datos de contacto.
export function problemasDelTexto(t: string): string[] {
  const p: string[] = []
  const s = t.trim()
  if (!s) p.push('La respuesta está vacía')
  if (s.length > 2000) p.push('Pasa de 2000 caracteres (límite de MercadoLibre)')
  if (/https?:\/\/|www\.|\b[\w-]+\.(com|net|org|ve|co|ly|me|io|app|link)\b/i.test(s)) p.push('Tiene un link o una página web')
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(s)) p.push('Tiene un correo')
  if (/(\+?\d[\d\s().-]{8,}\d)/.test(s.replace(/\b\d{1,3}([.,]\d{3})+([.,]\d+)?\b/g, ''))) p.push('Parece tener un número de teléfono')
  if (/\b(whats\s*app|wasap|instagram|insta|facebook|telegram|tiktok)\b|(^|\s)@\w{3,}/i.test(s)) p.push('Menciona redes sociales o un usuario de contacto')
  return p
}
