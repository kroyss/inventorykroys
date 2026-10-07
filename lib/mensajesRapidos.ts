// Respuestas rápidas de Mensajes (post-venta): botones en cada conversación que ponen un texto
// con los datos de ESA venta ({comprador}, {producto}, {tienda}, {guia}, {transportista}). Se guardan en
// app_settings.mensajes_plantillas (JSON); son distintas a las de Preguntas (pre-venta).

export interface MensajeRapido { titulo: string; texto: string }

export function leerMensajesRapidos(json: string | null | undefined): MensajeRapido[] {
  try {
    const v = JSON.parse(json ?? '[]')
    return Array.isArray(v) ? v.filter(p => p && typeof p.titulo === 'string' && typeof p.texto === 'string') : []
  } catch { return [] }
}

export const VARIABLES_MENSAJE = [
  { v: '{comprador}', que: 'nombre del comprador' },
  { v: '{producto}', que: 'lo que compró' },
  { v: '{tienda}', que: 'la cuenta de MercadoLibre de la venta' },
  { v: '{guia}', que: 'número de guía (si ya tiene etiqueta impresa)' },
  { v: '{transportista}', que: 'ZOOM o TEALCA (si ya tiene etiqueta impresa)' },
] as const

export interface DatosVenta {
  comprador?: string | null; producto?: string | null; tienda?: string | null; guia?: string | null; transportista?: string | null
}

/** Pone los datos de la venta. `faltan` = variables sin dato en esta venta (no se debe usar así). */
export function llenarMensaje(texto: string, d: DatosVenta) {
  const faltan: string[] = []
  const valores: Record<string, string | null | undefined> = {
    '{comprador}': d.comprador, '{producto}': d.producto, '{tienda}': d.tienda, '{guia}': d.guia, '{transportista}': d.transportista,
  }
  const lleno = texto.replace(/\{(comprador|producto|tienda|guia|transportista)\}/g, v => {
    const x = valores[v]?.trim()
    if (!x) { if (!faltan.includes(v)) faltan.push(v); return v }
    return x
  })
  return { texto: lleno, faltan }
}

/** "Juan Pérez" → "Juan" (saludo natural); sin nombre usa el nick. */
export const primerNombre = (nombre: string | null | undefined, nick: string | null | undefined) =>
  nombre?.trim().split(/\s+/)[0] || nick?.trim() || null

export const DESCRIPCION_FALTA: Record<string, string> = {
  '{comprador}': 'el nombre del comprador', '{producto}': 'el producto', '{tienda}': 'la cuenta de MercadoLibre',
  '{guia}': 'la guía (todavía no tiene etiqueta impresa)', '{transportista}': 'el transportista (todavía no tiene etiqueta impresa)',
}

/** Ejemplos para quien empieza (se revisan y guardan desde el editor). */
export const MENSAJES_SUGERIDOS: MensajeRapido[] = [
  { titulo: 'Gracias por la compra', texto: '¡Hola {comprador}! Gracias por tu compra en {tienda}. Ya estamos preparando tu {producto}. Cualquier duda, escríbenos por aquí.' },
  { titulo: 'Pago recibido', texto: '¡Hola {comprador}! Recibimos tu pago. Preparamos tu pedido y te avisamos por aquí cuando salga.' },
  { titulo: 'Ya salió', texto: '¡Hola {comprador}! Tu pedido ya salió por {transportista}. Tu número de guía es {guia}. ¡Gracias por tu compra!' },
  { titulo: 'Días de despacho', texto: 'Despachamos de lunes a viernes. Si pagas antes del mediodía, tu pedido sale el mismo día.' },
]
