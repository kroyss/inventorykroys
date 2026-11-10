// 11-11: la IA devolvió una vez la etiqueta de su herramienta («<parameter name="respuesta">») en vez de la respuesta.
// Eso nunca se publica (en Modo Total habría salido): el borrador se pide de nuevo y, si sigue, lo revisa una persona.
export const CODIGO_INTERNO = /<\/?[a-z_]+[\s>]|<parameter|antml|\{\s*"respuesta"/i
