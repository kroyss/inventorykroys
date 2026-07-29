// Búsqueda por tokens: cada palabra del query debe aparecer en alguno de los
// campos provistos, en cualquier orden (no exige coincidencia consecutiva).
// Ej: "hub generic" y "hub 3.0" ambos matchean "HUB USB 3.0 GENERIC".
export function matchTokens(query: string, ...fields: (string | null | undefined)[]): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const hay = fields.filter(Boolean).join(' ').toLowerCase()
  return q.split(/\s+/).every(tok => hay.includes(tok))
}

/**
 * Fechas en varios formatos para meterlas en el "pajar" de búsqueda, y que
 * encontrar una orden por fecha funcione se escriba como se escriba:
 * "29/07", "29/07/26", "29/07/2026" o "2026-07-29".
 */
export function dateTokens(value: string | Date | null | undefined): string {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  if (isNaN(d.getTime())) return ''
  const dd   = String(d.getDate()).padStart(2, '0')
  const mm   = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = String(d.getFullYear())
  return `${dd}/${mm}/${yyyy.slice(-2)} ${dd}/${mm}/${yyyy} ${yyyy}-${mm}-${dd}`
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
  // El query se parte con los MISMOS separadores que los campos: si no, buscar
  // "29/07" o "hdmi-rca" queda como un solo pedazo que nunca coincide con las
  // palabras sueltas ("29", "07"). Así cada parte se busca por separado.
  return q.split(/[^a-z0-9áéíóúñ]+/i).filter(Boolean).every(tok => {
    if (words.some(w => w.includes(tok))) return true
    // Si el término tiene números es un identificador (contenedor, tracking,
    // código, fecha): ahí NO se tolera diferencia, o buscar CONTENEDOR376
    // traería el 375. La tolerancia queda para las palabras.
    const tol = /\d/.test(tok) ? 0 : maxErrors(tok.length)
    if (tol === 0) return false
    return words.some(w => Math.abs(w.length - tok.length) <= tol && levenshtein(tok, w) <= tol)
  })
}
