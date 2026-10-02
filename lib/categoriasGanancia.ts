// Cómo se muestra una categoría de ganancia (profit_categories): nombre + porcentaje.
// Las empresas clientes tienen categorías nombradas solo con su % ("120%"); ahí se muestra una
// vez y no "120% 120.00%". Las de la plataforma tienen nombre propio ("ULTRA 120%"). La de 0%
// ("Sin asignación") va solo con el nombre.

const pct = (v: number | string | null | undefined) => {
  const n = Number(v ?? 0)
  return `${Number.isInteger(n) ? n : Math.round(n * 10) / 10}%`
}

export function etiquetaCategoria(nombre: string | null | undefined, porcentaje: number | string | null | undefined, separador = ' ') {
  const p = pct(porcentaje)
  const n = (nombre ?? '').trim()
  if (!n) return p
  if (/^\d+([.,]\d+)?\s*%$/.test(n) || Number(porcentaje ?? 0) === 0) return n
  return `${n}${separador}${p}`
}
