// Freno de compatibilidad con un vehículo o modelo (lib/iaAutomatica.ts → motivosRevisar).
// Antes: "Confirma compatibilidad con un vehículo" frenaba solo con una lista fija de marcas/modelos (Picanto sí, Corsa no).
// 09-11 (el dueño): (1) la pregunta también se detecta por su FORMA ("¿sirve / tienes disponible para un X?") cuando el
// producto o la pregunta son de vehículos; (2) si lo escrito en la publicación (descripción, ficha técnica, notas, fotos)
// dice que el producto es universal o sirve para cualquiera, eso respalda cualquier modelo que pregunten y no frena;
// (3) si la pregunta nombra un modelo y ese modelo está escrito en la publicación, tampoco frena.
// Sin dato escrito el freno queda igual: lo contesta una persona.

export const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Compatibilidad con un vehículo o modelo: la IA confirmó "sí para Kia Picanto" sin tenerlo.
export const VEHICULO = /\b(kia|toyota|chevrolet|chevy|ford|fiat|hyundai|mitsubishi|renault|nissan|mazda|honda|jeep|chery|volkswagen|vw|peugeot|suzuki|dodge|chrysler|daewoo|iveco|mercedes|bmw|audi|seat|jac|dongfeng|great wall|bera|empire|yamaha|bajaj|skygo|picanto|aveo|corolla|fiesta|optra|spark|cherokee|hilux|terios|yaris|corsa|sail|cruze|malibu|silverado|vitara|blazer|tahoe|explorer|ecosport|ranger|focus|fusion|palio|siena|jetta|accent|elantra|tucson|cerato|sportage|sorento|lancer|outlander|montero|samurai|wrangler|camry|rav4|fortuner|matiz|tiggo|sentra|tiida|versa|frontier)\b|\b(modelo|año)\s+(19|20)\d{2}\b|\b(19|20)\d{2}\b.*\b(carro|camioneta|moto|veh[ií]culo)\b/i
export const SIN_CONFIRMAR = /no (lo )?(tenemos|est[aá]) confirmad|verific|consult|no (es|son) compatible|no (sirve|aplica|funciona)/i

// La forma de la pregunta: "¿sirve para un X?", "¿tienes disponible para un X?", "¿funciona en mi X?" (X = cualquier palabra
// que no sea de las comunes que no son vehículo). Solo cuenta si el producto o la pregunta hablan de vehículos.
const PREGUNTA_PARA = /\b(sirv\w*|funcion\w*|compatible\w*|aplica\w*|disponible|tienes?|tienen|hay|queda\w*|entra\w*|viene\w*)\b[^?¿.!\n]{0,30}\bpara\s+(?:un|una|mi|mis|el|la|su|este|esta)\s+(?!regalo\b|casa\b|negocio\b|uso\b|oficina\b|hogar\b|taller\b|cocina\b|tienda\b|nino\b|nina\b|persona\b|cliente\b|reventa\b|obsequio\b|prueba\b|trabajo\b)([a-z0-9][\w-]{2,})/i
const CONTEXTO_VEHICULAR = /\b(carro|carros|auto|autos|vehiculos?|moto|motos|camionetas?|camion|camiones|automotriz|automovil\w*)\b/i

/** ¿La pregunta es de compatibilidad con un vehículo o modelo? `datos` = lo escrito en la publicación (da el contexto). */
export function preguntaDeVehiculo(pregunta: string, datos = '') {
  if (VEHICULO.test(pregunta)) return true
  const p = sinTildes(pregunta)
  return PREGUNTA_PARA.test(p) && CONTEXTO_VEHICULAR.test(p + ' ' + sinTildes(datos))
}

// Compatibilidad universal ESCRITA: "universal", "sirve para cualquier vehículo", "compatible con todos los carros"…
const UNIVERSAL = /\buniversal(?:es)?\b|compatible\w*\s+(?:con\s+)?(?:todos?|cualquier|toda)\b[^.\n]{0,50}|(?:sirve|sirven|funciona|funcionan|aplica|aplican|apto\w*|valid\w*)\s+(?:para|con|en)\s+(?:todos?|cualquier|toda)\b[^.\n]{0,50}|para\s+(?:todos?\s+(?:los\s+)?|cualquier\s+)(?:vehiculos?|carros?|autos?|motos?|camionetas?|modelos?|marcas?)/gi

/** ¿Lo escrito dice que sirve para cualquiera? Una negación justo antes ("no es universal", "no sirve para todos") no cuenta. */
export function esUniversal(texto: string) {
  const t = sinTildes(texto)
  for (const m of t.matchAll(UNIVERSAL)) {
    const antes = t.slice(Math.max(0, (m.index ?? 0) - 30), m.index ?? 0)
    if (/\b(no|ni|sin|nunca|tampoco|excepto|salvo)\b[^.\n]*$/.test(antes)) continue
    return true
  }
  return false
}

/** Lo que la pregunta nombra como vehículo o modelo (marcas/modelos conocidos y la palabra tras "para un/mi…"). */
function nombresDePregunta(pregunta: string) {
  const p = sinTildes(pregunta)
  const n = new Set<string>()
  for (const m of p.matchAll(new RegExp(VEHICULO.source, 'gi'))) if (!/^(modelo|ano)\b|^\d/.test(m[0])) n.add(m[0])
  const para = p.match(PREGUNTA_PARA)
  if (para?.[2]) n.add(para[2])
  return [...n]
}

/** ¿Lo escrito en la publicación respalda la compatibilidad que se pregunta?
 *  universal escrito → sí, sea cual sea el modelo · modelo nombrado y escrito (y el mismo año, si preguntan año) → sí. */
export function compatibilidadRespaldada(pregunta: string, datos: string) {
  if (!datos.trim()) return false
  if (esUniversal(datos)) return true
  const d = sinTildes(datos)
  const nombres = nombresDePregunta(pregunta)
  if (!nombres.length || !nombres.every(n => d.includes(n))) return false
  const anios = sinTildes(pregunta).match(/\b(?:19|20)\d{2}\b/g) ?? []
  return anios.every(a => d.includes(a))
}
