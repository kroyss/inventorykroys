// Respuestas rápidas de Mensajes (post-venta): botones en cada conversación que ponen un texto
// fijo para retocar antes de enviar. Sin variables (igual que las de Preguntas): el nombre de la
// tienda va escrito tal cual. Se guardan en app_settings.mensajes_plantillas (JSON).

export interface MensajeRapido { titulo: string; texto: string }

export function leerMensajesRapidos(json: string | null | undefined): MensajeRapido[] {
  try {
    const v = JSON.parse(json ?? '[]')
    return Array.isArray(v) ? v.filter(p => p && typeof p.titulo === 'string' && typeof p.texto === 'string') : []
  } catch { return [] }
}

/** Ejemplos para quien empieza, con el nombre de su cuenta de ML escrito (se revisan antes de guardar). */
export const MENSAJES_SUGERIDOS = (tienda: string | null | undefined): MensajeRapido[] => [
  { titulo: 'Gracias por la compra', texto: `¡Hola! Gracias por tu compra${tienda ? ` en ${tienda}` : ''}. Ya estamos preparando tu pedido. Cualquier duda, escríbenos por aquí.` },
  { titulo: 'Pago recibido', texto: '¡Hola! Recibimos tu pago. Preparamos tu pedido y te avisamos por aquí cuando salga.' },
  { titulo: 'Días de despacho', texto: 'Despachamos de lunes a viernes. Si pagas antes del mediodía, tu pedido sale el mismo día.' },
  { titulo: 'Garantía', texto: 'Tu producto tiene garantía. Si algo no funciona, escríbenos por aquí con una foto y lo resolvemos.' },
]
