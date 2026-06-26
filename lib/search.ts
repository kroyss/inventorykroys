// Búsqueda por tokens: cada palabra del query debe aparecer en alguno de los
// campos provistos, en cualquier orden (no exige coincidencia consecutiva).
// Ej: "hub generic" y "hub 3.0" ambos matchean "HUB USB 3.0 GENERIC".
export function matchTokens(query: string, ...fields: (string | null | undefined)[]): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const hay = fields.filter(Boolean).join(' ').toLowerCase()
  return q.split(/\s+/).every(tok => hay.includes(tok))
}
