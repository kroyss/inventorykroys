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
