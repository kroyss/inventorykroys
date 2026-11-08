// VARIABLES EN LAS RESPUESTAS RÁPIDAS (07-11-2026, Fase 1.1 de docs/analisis-mercasist.md, idea tomada de Mercasist).
// Una respuesta rápida puede llevar {producto}, {precio}, {precio_bs}, {tasa_bcv} y (solo en Mensajes) {nombre}; al
// usarla se reemplazan con los datos de ESA pregunta o venta. Si falta un dato (sin tasa del día, sin precio en $,
// en Preguntas ML no da el nombre…) la variable queda escrita y el texto NO se puede publicar (revisarTexto la
// bloquea): así nunca sale a MercadoLibre un "{precio}" suelto, ni a mano ni por las automáticas.
// Archivo sin dependencias de servidor: lo usan las pantallas y el servidor.

export const VARIABLES = [
  { v: '{producto}', d: 'el título de la publicación' },
  { v: '{precio}', d: 'el precio de la publicación (en $)' },
  { v: '{precio_bs}', d: 'el precio × tasa BCV del día' },
  { v: '{tasa_bcv}', d: 'la tasa BCV del día' },
  { v: '{nombre}', d: 'el nombre del comprador (solo Mensajes)' },
] as const

const RE = /\{(producto|precio_bs|precio|tasa_bcv|nombre)\}/gi

export interface DatosVariables {
  producto?: string | null
  precio?: number | null        // en $ (si la publicación está en otra moneda, no se pasa)
  tasa?: number | null          // BCV del día
  nombre?: string | null
}

const dinero = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** ¿El texto usa alguna variable? */
export function tieneVariables(t: string) { RE.lastIndex = 0; return RE.test(t) }

/** Reemplaza las variables con los datos; las que no tienen dato quedan escritas y se listan en `faltan`. */
export function rellenarVariables(texto: string, d: DatosVariables): { texto: string; faltan: string[] } {
  const faltan = new Set<string>()
  const valor = (k: string): string | null => {
    switch (k) {
      case 'producto': return d.producto?.trim() || null
      case 'precio': return d.precio != null && d.precio > 0 ? dinero(d.precio) : null
      case 'tasa_bcv': return d.tasa != null && d.tasa > 0 ? dinero(d.tasa) : null
      case 'precio_bs': return d.precio != null && d.precio > 0 && d.tasa != null && d.tasa > 0 ? dinero(d.precio * d.tasa) : null
      case 'nombre': return d.nombre?.trim().split(/\s+/)[0] || null    // solo el primer nombre, como se saluda
      default: return null
    }
  }
  const out = texto.replace(RE, (m, k: string) => {
    const v = valor(k.toLowerCase())
    if (v === null) { faltan.add(m); return m }
    return v
  })
  return { texto: out, faltan: [...faltan] }
}

/** Variables que quedaron sin reemplazar (para bloquear la publicación). */
export function variablesSinDato(t: string): string[] {
  return [...new Set(t.match(RE) ?? [])]
}

/** La plantilla con datos de ejemplo: para revisar al GUARDARLA lo que MercadoLibre rechazaría (sin que la variable bloquee). */
export function conDatosDeEjemplo(t: string) {
  return rellenarVariables(t, { producto: 'Producto', precio: 10, tasa: 100, nombre: 'Ana' }).texto
}
