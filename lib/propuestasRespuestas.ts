// Paso 3 de las respuestas sugeridas (2026-10-11): proponer respuestas rápidas NUEVAS a partir de lo
// que el vendedor ya repite. Agrupa sus respuestas parecidas; las que repitió muchas veces y no se
// parecen a ninguna respuesta rápida existente se ofrecen con un clic ("Respondiste esto 40 veces…").
// Sin IA: solo sus propias palabras.
import { normalizar, parecido, temasDe, temasDePlantilla, TEMAS } from '@/lib/sugerenciasPreguntas'
import type { Plantilla } from '@/lib/preguntasTexto'

export interface Propuesta {
  texto: string                 // la respuesta que más repitió (tal cual)
  veces: number                 // cuántas respuestas del historial son de este grupo
  temas: string[]               // temas que la activan (los de las preguntas del grupo)
  palabras: string[]            // palabras propias sugeridas (frecuentes en esas preguntas)
  titulo: string
  ejemplos: string[]            // preguntas de ejemplo
}

const MIN_VECES = 8
const PARECIDO_GRUPO = 0.7
const MAX_GRUPOS = 500
// Palabras que no dicen nada del tema.
const VACIAS = new Set(('hola buenas buenos buen buena dias dia tardes tarde noches noche saludos gracias por favor para con que los las del una uno unos unas este esta esto ese esa eso como cual cuando donde quien tiene tienen tienes hay seria sera puede pueden puedo tengo quiero quisiera favor amigo amiga senor senora usted ustedes ser son esta estan mas muy tambien pero sin sobre hasta desde cada todo todos ellos ella el la lo le les mi mis su sus tu tus nos me te se si no ya aun alguna algun algo producto articulo publicacion gracias saludo').split(' '))
const generica = (w: string) => Object.values(TEMAS).some(t => t.palabras.some(p => !['zoom', 'tealca', 'mrw'].includes(p) && w.startsWith(p)))

/** El historial que se usa: solo lo reciente (las políticas cambian: el mínimo de envío gratis
 *  pasó de $5 a $3) — quien llama pasa las respuestas de los últimos ~90 días. */

export function proponer(historial: { texto: string; respuesta: string }[], plantillas: Plantilla[]): Propuesta[] {
  const grupos: { rep: string; respuestas: Map<string, number>; preguntas: string[] }[] = []
  for (const h of historial) {
    const r = h.respuesta.trim()
    const rn = normalizar(r)
    if (rn.length < 20) continue                                  // "buenas, si": no sirve sola
    if (/https?:|www\.|\d{3,}/.test(r)) continue                   // links o cifras: casos puntuales
    if (/(agotad|no tenemos|no hay|no contamos|sin stock)/.test(rn)) continue
    const g = grupos.find(x => parecido(x.rep, r) >= PARECIDO_GRUPO)
    if (g) { g.respuestas.set(r, (g.respuestas.get(r) ?? 0) + 1); g.preguntas.push(h.texto) }
    else if (grupos.length < MAX_GRUPOS) grupos.push({ rep: r, respuestas: new Map([[r, 1]]), preguntas: [h.texto] })
  }
  // Frecuencia de cada palabra en TODAS las preguntas (para ver qué distingue a un grupo).
  const frecuencia = new Map<string, number>()
  for (const h of historial) for (const w of new Set(normalizar(h.texto).split(' '))) frecuencia.set(w, (frecuencia.get(w) ?? 0) + 1)
  const total = Math.max(1, historial.length)
  const out: Propuesta[] = []
  for (const g of grupos) {
    const veces = g.preguntas.length
    if (veces < MIN_VECES) continue
    // La versión que más repitió (la más reciente a igualdad).
    const texto = [...g.respuestas.entries()].sort((a, b) => b[1] - a[1])[0][0]
    if (plantillas.some(p => parecido(p.texto, texto) >= 0.6)) continue  // ya la tiene como respuesta rápida
    const conteo = new Map<string, number>()
    for (const q of g.preguntas) for (const t of temasDe(q)) conteo.set(t, (conteo.get(t) ?? 0) + 1)
    const temas = [...conteo.entries()].filter(([, n]) => n >= veces * 0.4).map(([t]) => t)
    // Palabras propias: frecuentes en ESTE grupo y raras en el resto (lo que lo distingue: "mrw").
    const pal = new Map<string, number>()
    for (const q of g.preguntas) for (const w of new Set(normalizar(q).split(' ')))
      if (w.length >= 3 && !VACIAS.has(w) && !generica(w)) pal.set(w, (pal.get(w) ?? 0) + 1)
    const palabras = [...pal.entries()]
      .filter(([w, n]) => n >= Math.max(3, veces * 0.3) && (frecuencia.get(w) ?? 0) / total < 0.08)
      .sort((a, b) => b[1] - a[1]).slice(0, 3).map(([w]) => w)
    // Sin palabras propias y con temas que ya cubre otra respuesta rápida: es una variante de esa.
    if (!palabras.length && plantillas.some(p => temas.every(t => temasDePlantilla(p).includes(t)))) continue
    if (!temas.length && !palabras.length) continue                // sin cómo reconocer cuándo usarla
    const titulo = [...temas.map(t => TEMAS[t]?.nombre ?? t), ...palabras.map(w => w[0].toUpperCase() + w.slice(1))].slice(0, 3).join(' + ')
    out.push({ texto, veces, temas, palabras, titulo, ejemplos: [...new Set(g.preguntas)].slice(0, 4) })
  }
  return out.sort((a, b) => b.veces - a.veces).slice(0, 12)
}
