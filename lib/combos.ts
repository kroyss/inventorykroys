// Combos (migración 098): cuántas unidades del producto trae una publicación de MercadoLibre.
// Por defecto 1. El título solo SUGIERE (lo confirma quien vincula): "Combo 4", "Pack de 6", "x4",
// "4 Rollos", "Kit 5 Unidades", "Lote de 10"… Números de medidas o potencias (10w, 20cm, 500ml) no cuentan.

const PATRONES: RegExp[] = [
  /\b(?:combo|pack|kit|lote|paquete|set|bulto|caja)\s*(?:de\s*|x\s*)?(\d{1,3})\b/i,
  /\b(\d{1,3})\s*(?:x\s*)?(?:unidades|unidad|unds?|uds?|u\.|piezas|pzas?|rollos|pares|paquetes|bolsas|cajas)\b/i,
  /(?:^|\s)x\s?(\d{1,3})(?:\s|$)/i,
  /(?:^|\s)(\d{1,3})\s?x(?:\s|$)/i,
]

/** Unidades que sugiere el título (2 a 200), o null si no parece combo. */
export function unidadesDelTitulo(titulo: string | null | undefined): number | null {
  if (!titulo) return null
  for (const r of PATRONES) {
    const m = r.exec(titulo)
    if (m) {
      const n = Number(m[1])
      if (n >= 2 && n <= 200) return n
    }
  }
  return null
}
