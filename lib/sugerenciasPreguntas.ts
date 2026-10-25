// Respuestas sugeridas SIN IA (decisión del dueño, 2026-10-11): cada respuesta rápida tiene palabras
// que la activan y condiciones (precio para el envío gratis, stock); el sistema revisa los datos
// reales del producto y sugiere una sola respuesta, o ninguna (queda para el humano). Primero se
// envían con un clic; el automático se activa respuesta por respuesta cuando está probado.
import { plantillaAplica, type Plantilla } from '@/lib/preguntasTexto'

/** Sin acentos, minúsculas y espacios simples (para comparar palabras). */
export const normalizar = (t: string) =>
  t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s$]/g, ' ').replace(/\s+/g, ' ').trim()

/** Temas que reconoce el sistema y las palabras que los delatan (raíces: "envi" = envío, envían…). */
export const TEMAS: Record<string, { nombre: string; palabras: string[] }> = {
  disponible: { nombre: 'Disponibilidad', palabras: ['disponib', 'dispon', 'tiene', 'tienen', 'tienes', 'hay', 'queda', 'existencia', 'stock', 'en venta'] },
  envio:      { nombre: 'Envío', palabras: ['envi', 'mandan', 'manda', 'despach', 'zoom', 'tealca', 'mrw', 'llega', 'nacional', 'formulario'] },
  precio:     { nombre: 'Precio', palabras: ['precio', 'cuanto', 'cuesta', 'costo', 'bcv', 'dolar', 'tasa', 'bs'] },
  retiro:     { nombre: 'Retiro / entrega', palabras: ['retir', 'entrega', 'personal', 'ubic', 'direccion', 'donde estan', 'local', 'tienda fisica', 'delivery'] },
  factura:    { nombre: 'Factura', palabras: ['factura', 'fiscal', 'rif'] },
  garantia:   { nombre: 'Garantía', palabras: ['garant'] },
}

/** Si la pregunta tiene alguna de estas, depende del caso: siempre va al humano. */
export const RIESGO = ['compatib', 'sirve', 'funciona', 'medida', 'talla', 'modelo', 'tamano', 'color', 'pulgad',
  'voltio', 'watt', 'capacidad', 'incluye', 'trae', 'original', 'usad', 'reclam', 'devol', 'descuent', 'mayor',
  'cantidad', 'binance', 'usdt', 'cripto', 'zelle', 'cuantos', 'cuantas', 'kg', 'kilo', 'peso', 'ancho', 'largo',
  'alto', 'unidades', 'garantia de', 'factura a nombre',
  // otro transportista / modalidad: la respuesta estándar habla de ZOOM y TEALCA
  'mrw', 'cobro destino', 'cobro a destino', 'domesa', 'liberty',
  // preguntan si sirve para algo, o por OTRO producto ("¿de casualidad tienen un…?")
  'se puede', 'puedo', 'para que', 'sirve para', 'de casualidad', 'otro', 'otra', 'tienen un', 'tienen una',
  'tienes un', 'tienes una', 'tendran', 'tendras', 'consigo', 'busco', 'necesito']

const tiene = (t: string, palabra: string) =>
  palabra.includes(' ') ? t.includes(palabra) : new RegExp(`(^|\\s)${palabra}`).test(t)

export function temasDe(texto: string): string[] {
  const t = normalizar(texto)
  return Object.entries(TEMAS).filter(([, v]) => v.palabras.some(p => tiene(t, p))).map(([k]) => k)
}
export function riesgoDe(texto: string, permitidas: string[] = []): string | null {
  const t = normalizar(texto)
  if (/\d/.test(t)) return 'tiene números'
  return RIESGO.find(p => tiene(t, p) && !permitidas.some(x => normalizar(x) === p || normalizar(x).includes(p))) ?? null
}

/** Tema propio de una respuesta con palabras propias ("p:<id>"). */
const temaPropio = (p: Plantilla) => `p:${p.id ?? p.titulo}`
/** ¿La pregunta trae alguna de las palabras propias de la respuesta? */
const activaPropia = (p: Plantilla, t: string) => (p.palabras ?? []).some(w => w.trim() && tiene(t, normalizar(w)))

/** Temas que cubre una respuesta rápida: los suyos (disparadores) o, si no tiene, los de su texto. */
export function temasDePlantilla(p: Plantilla & { temas?: string[] | null }): string[] {
  const base = p.temas?.length ? p.temas : temasDe(`${p.titulo} ${p.texto}`)
  return p.palabras?.some(w => w.trim()) ? [...base, temaPropio(p)] : base
}

/** ¿La respuesta promete envío gratis? (la de "mínimo 2 unidades… de lo contrario no" no). */
export const ofreceEnvioGratis = (p: Pick<Plantilla, 'texto'>) => {
  const t = normalizar(p.texto)
  return t.includes('gratis') && !/(minimo|no se activa|no tiene|no aplica|no califica|cobro)/.test(t)
}
/** La respuesta del vendedor dice que esa publicación NO tiene envío gratis. */
export const NIEGA_ENVIO = /(no tiene (opcion|opción) de env|por unidad no|no aplica (el )?env|no califica (para|al) env|no tiene env[ií]o gratis)/

/** envioGratis: lo aprendido de ESA publicación (ml_item_hechos): true confirmado, false no tiene. */
export interface ItemDatos { precio: number | null; stock: number | null; item_id?: string; envioGratis?: boolean | null }
export type Sugerencia =
  | { tipo: 'sugerida'; indice: number; plantilla: Plantilla; temas: string[]; sinConfirmar: boolean }
  | { tipo: 'humano'; motivo: string; temas: string[] }

/**
 * La respuesta rápida que corresponde, o por qué no hay (va al humano):
 *  - palabras de riesgo o números → humano;
 *  - sin tema reconocido → humano;
 *  - candidatas = respuestas cuyo tema cubre TODOS los de la pregunta, que aplican al precio de ESE
 *    producto (envío gratis desde $3 / menos de $3) y, si dicen "disponible", con stock > 0;
 *  - una sola (o la más justa, sin empate) → sugerida; varias empatadas o ninguna → humano.
 */
export function sugerir(pregunta: string, item: ItemDatos,
  plantillas: (Plantilla & { temas?: string[] | null; excluidos?: string[] | null })[]): Sugerencia {
  const tn = normalizar(pregunta)
  // Respuestas con palabras propias que la pregunta trae: suman su tema y esas palabras dejan de ser
  // "de riesgo" (una respuesta para "MRW, cobro a destino" se activa con "mrw").
  const propias = plantillas.filter(p => activaPropia(p, tn))
  const temas = [...temasDe(pregunta), ...propias.map(temaPropio)]
  const r = riesgoDe(pregunta, propias.flatMap(p => p.palabras ?? []))
  if (r) return { tipo: 'humano', motivo: `depende del caso (${r})`, temas }
  if (!temas.length) return { tipo: 'humano', motivo: 'no se reconoce el tema', temas }
  const candidatas = plantillas.map((p, indice) => ({ p, indice, cubre: temasDePlantilla(p) }))
    .filter(c => temas.every(t => c.cubre.includes(t)))
    .filter(c => !(c.p.excluidos ?? []).includes(item.item_id ?? ''))
    .filter(c => plantillaAplica(c.p, item.precio))
  if (!candidatas.length) return { tipo: 'humano', motivo: 'ninguna respuesta rápida cubre esto', temas }
  // Lo aprendido del producto: si ahí dijiste que no tiene envío gratis, no se ofrece.
  const sinNegar = candidatas.filter(c => !(item.envioGratis === false && ofreceEnvioGratis(c.p)))
  if (!sinNegar.length) return { tipo: 'humano', motivo: 'este producto no tiene envío gratis', temas }
  const conStock = sinNegar.filter(c => !c.cubre.includes('disponible') || item.stock === null || item.stock > 0)
  if (!conStock.length) return { tipo: 'humano', motivo: 'sin stock', temas }
  // La más justa: la que menos "temas especiales" (retiro, factura, garantía) agrega sin que los
  // pregunten; a igualdad, la que cubre menos temas de más. Disponible/envío/precio van juntos en la
  // respuesta estándar y no cuentan como de más.
  // El tema de sus palabras propias o aprendidas ("p:<id>") no es un tema especial: si la pregunta no las trae, no
  // castiga (25-10: con las palabras aprendidas, "Disponible + envío gratis" quedaba fuera en casi todo, 0,6% sugeridas).
  const costo = (cubre: string[]) =>
    cubre.filter(t => !temas.includes(t) && !t.startsWith('p:') && !['disponible', 'envio', 'precio'].includes(t)).length * 10 + cubre.length
      - cubre.filter(t => t.startsWith('p:') && temas.includes(t)).length * 5   // la de palabras propias que activó, primero
  conStock.sort((a, b) => costo(a.cubre) - costo(b.cubre))
  // Una respuesta que agrega un tema especial que NO preguntaron (p. ej. "Retiro" para "¿precio?")
  // no se sugiere: pasa cuando no se sabe el precio y las de envío gratis quedan fuera.
  if (costo(conStock[0].cubre) >= 10) return { tipo: 'humano', motivo: 'ninguna respuesta rápida cubre esto', temas }
  if (conStock.length > 1 && costo(conStock[0].cubre) === costo(conStock[1].cubre))
    return { tipo: 'humano', motivo: 'dos respuestas posibles', temas }
  const c = conStock[0]
  return { tipo: 'sugerida', indice: c.indice, plantilla: c.p, temas,
    sinConfirmar: ofreceEnvioGratis(c.p) && item.envioGratis !== true }
}

// ── Calibración con el historial del vendedor ───────────────────────────────
// Antes de sugerir nada, se prueba cada respuesta rápida contra lo que el vendedor YA respondió:
// para cada combinación (respuesta + temas de la pregunta), cuántas veces su respuesta real fue
// equivalente. Solo se sugieren las combinaciones que pasan el umbral: nada "a ciegas".

/** Clave de una combinación: respuesta rápida + temas que preguntaron. */
export const claveCal = (plantillaId: string, temas: string[]) => `${plantillaId}|${[...temas].sort().join('+')}`

const tokens = (t: string) => new Set(normalizar(t).split(' ').filter(w => w.length > 2))
/** Parecido por palabras (0–1) entre dos respuestas. */
export function parecido(a: string, b: string) {
  const A = tokens(a), B = tokens(b)
  let i = 0
  A.forEach(w => { if (B.has(w)) i++ })
  return A.size + B.size ? (2 * i) / (A.size + B.size) : 0
}
const NEGATIVA = /(agotad|no disponible|no tenemos|no hay|sin stock|no queda|no contamos)/
const CORTA_SI = /^(buen[oa]s?( dias| tardes| noches)?\s*)?(si|correcto|claro|asi es|exacto|disponible|si disponible|si aplica)(\s+(correcto|disponible|claro|a su orden|quedo a su orden))*\s*$/

/** ¿La respuesta real del vendedor equivale a la sugerida? */
export function equivale(sugerida: string, real: string) {
  const r = normalizar(real)
  if (NEGATIVA.test(r) || NIEGA_ENVIO.test(r)) return false
  return CORTA_SI.test(r) || parecido(sugerida, real) >= 0.3
}

export interface Calibracion { [clave: string]: { n: number; ok: number } }
export const UMBRAL_CAL = { minimo: 5, pct: 0.8 }   // probado 11-10: 7% de las preguntas, 93% equivalentes

export function calibrar(historial: { texto: string; respuesta: string; item_id: string; precio: number | null; envioGratis?: boolean | null }[],
  plantillas: Plantilla[]): Calibracion {
  const cal: Calibracion = {}
  for (const h of historial) {
    const s = sugerir(h.texto, { precio: h.precio, stock: null, item_id: h.item_id, envioGratis: h.envioGratis ?? null }, plantillas)
    if (s.tipo !== 'sugerida') continue
    const k = claveCal(s.plantilla.id ?? s.plantilla.titulo, s.temas)
    const c = (cal[k] ??= { n: 0, ok: 0 })
    c.n++
    if (equivale(s.plantilla.texto, h.respuesta)) c.ok++
  }
  return cal
}

/** ¿Esta combinación quedó probada en el historial? Devuelve el % de acierto o null. */
export function respaldo(cal: Calibracion, plantillaId: string, temas: string[]): number | null {
  const c = cal[claveCal(plantillaId, temas)]
  if (!c || c.n < UMBRAL_CAL.minimo || c.ok / c.n < UMBRAL_CAL.pct) return null
  return Math.round((100 * c.ok) / c.n)
}

/** Las palabras de la respuesta (propias o aprendidas) que trae la pregunta. */
export const palabrasQueActivan = (p: Plantilla, pregunta: string) => {
  const t = normalizar(pregunta)
  return (p.palabras ?? []).filter(w => w.trim() && tiene(t, normalizar(w))).map(w => normalizar(w))
}

/** Sin sugerencia segura: el botón MÁS PROBABLE para resaltarlo (no se escribe solo). Entre las que
 *  cubren los temas de la pregunta y aplican al precio, la de mejor acierto en el historial (≥ 50%,
 *  con al menos 3 casos) o la que activan sus palabras. Las palabras de riesgo no impiden resaltar. */
export function probable(pregunta: string, item: ItemDatos,
  plantillas: (Plantilla & { temas?: string[] | null; excluidos?: string[] | null })[], cal: Calibracion): string | null {
  const tn = normalizar(pregunta)
  const propias = plantillas.filter(p => activaPropia(p, tn))
  const temas = [...temasDe(pregunta), ...propias.map(temaPropio)]
  if (!temas.length) return null
  let mejor: string | null = null, puntaje = 0
  for (const p of plantillas) {
    if (!plantillaAplica(p, item.precio) || (p.excluidos ?? []).includes(item.item_id ?? '')) continue
    if (item.envioGratis === false && ofreceEnvioGratis(p)) continue
    const cubre = temasDePlantilla(p)
    if (!temas.every(t => cubre.includes(t))) continue
    const id = p.id ?? p.titulo
    const c = cal[claveCal(id, temas)]
    let pts = c && c.n >= 3 ? c.ok / c.n : 0
    if (propias.includes(p)) pts = Math.max(pts, 0.9)
    if (pts > puntaje) { puntaje = pts; mejor = id }
  }
  return puntaje >= 0.5 ? mejor : null
}
