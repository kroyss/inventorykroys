// Número escrito a mano (10-11-2026, el dueño: en Publicaciones «36.45» se guardaba como 3.645). Acepta las dos formas:
//   - con coma: la coma es el decimal y los puntos son miles («1.234,56» → 1234.56);
//   - solo puntos: si separan grupos de 3 dígitos son miles («1.234», «12.500.000»); si no, el punto es decimal («36.45»).
export function leerNumero(s: string | number | null | undefined): number {
  let t = String(s ?? '').trim().replace(/\s/g, '').replace(/^(US\$|\$|Bs\.?)/i, '')
  if (!t) return NaN
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '')
  const n = Number(t)
  return Number.isFinite(n) ? n : NaN
}
