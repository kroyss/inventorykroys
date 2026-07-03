// Búsqueda por tokens: cada palabra del query debe aparecer en alguno de los
// campos provistos, en cualquier orden (no exige coincidencia consecutiva).
// Ej: "hub generic" y "hub 3.0" ambos matchean "HUB USB 3.0 GENERIC".
export function matchTokens(query: string, ...fields: (string | null | undefined)[]): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const hay = fields.filter(Boolean).join(' ').toLowerCase()
  return q.split(/\s+/).every(tok => hay.includes(tok))
}

// Distancia de Levenshtein (para tolerar errores de tipeo). Suficiente para
// palabras cortas (nombres de producto), sin depender de una librería externa.
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp = new Array(n + 1)
  for (let j = 0; j <= n; j++) dp[j] = j
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j]
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1])
      prev = tmp
    }
  }
  return dp[n]
}

// Tolerancia según el largo de la palabra: cortas exigen exactitud (evita
// falsos positivos tipo "5" ~ "6"), largas admiten 1-2 letras de diferencia.
function maxErrors(len: number): number {
  if (len <= 3) return 0
  if (len <= 6) return 1
  return 2
}

/**
 * Búsqueda tolerante a errores de tipeo: cada palabra del query debe aparecer,
 * exacta o con pocas letras de diferencia, en alguna palabra de los campos, en
 * cualquier orden. Ej: "expocion" matchea "exposición", "repetidr" matchea
 * "repetidor". Pensada para catálogos donde no siempre se recuerda el nombre
 * exacto del producto.
 */
export function matchFuzzy(query: string, ...fields: (string | null | undefined)[]): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const words = fields.filter(Boolean).join(' ').toLowerCase().split(/[^a-z0-9áéíóúñ]+/i).filter(Boolean)
  if (words.length === 0) return false
  return q.split(/\s+/).every(tok => {
    if (words.some(w => w.includes(tok))) return true
    const tol = maxErrors(tok.length)
    if (tol === 0) return false
    return words.some(w => Math.abs(w.length - tok.length) <= tol && levenshtein(tok, w) <= tol)
  })
}
