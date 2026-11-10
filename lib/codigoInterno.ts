// 11-11: la IA devolvió una vez la etiqueta de su herramienta («<parameter name="respuesta">») en vez de la respuesta.
// Eso nunca se publica (en Modo Total habría salido): el borrador se pide de nuevo y, si sigue, lo revisa una persona.
export const CODIGO_INTERNO = /<\/?[a-z_]+[\s>]|<parameter|antml|\{\s*"respuesta"/i
/** Quita las etiquetas sueltas y deja el texto (a veces la respuesta viene bien, envuelta en la etiqueta). */
export const sinCodigo = (t: string) => t.replace(/<\/?(parameter|antml:[a-z_]+|invoke|function_calls)[^>]*>/gi, '').trim()
