// Palabras aprendidas (2026-10-13): el sistema aprende solo qué palabras de las preguntas llevan a
// cada respuesta rápida, mirando lo que el vendedor YA hizo (sin configurar nada):
//   - el botón que tocó en cada pregunta (respuestas_origen.plantilla), o, en las respondidas a
//     mano, la respuesta rápida a la que se parece lo que escribió;
//   - una palabra se aprende si salió en MIN_VECES preguntas o más y en ≥ MIN_PCT de ellas se
//     respondió con la MISMA respuesta rápida ("ofertar" → Ofertas).
// Quedan aparte de las palabras escritas a mano (Plantilla.palabras) y se pueden quitar con la ✕:
// las quitadas no se vuelven a aprender. Se recalculan con la calibración (sugerenciasServidor.ts).
import { idPlantilla, type Plantilla } from '@/lib/preguntasTexto'
import { normalizar, parecido } from '@/lib/sugerenciasPreguntas'
import { VACIAS, generica } from '@/lib/propuestasRespuestas'

export const CLAVE_APRENDIDAS = 'preguntas_palabras_aprendidas'
export const CLAVE_QUITADAS = 'preguntas_palabras_quitadas'

const MIN_VECES = 3
const MIN_PCT = 0.8
const MAX_POR_RESPUESTA = 8
/** Respondida a mano: cuenta como esa respuesta rápida si se le parece así de mucho. */
const PARECIDO_USO = 0.6

export interface Aprendida { palabra: string; veces: number; pct: number; at: string }
export type Aprendidas = Record<string, Aprendida[]>
export type Quitadas = Record<string, string[]>

export interface PreguntaHist { id: string; texto: string; respuesta: string; item_titulo: string | null }

/** Palabras de una pregunta que pueden decir de qué se trata (sin saludos, temas que el sistema ya
 *  conoce, números ni palabras del título del producto: esas hablan del producto, no del tema). */
function palabrasDe(texto: string, titulo: string | null): string[] {
  const delTitulo = new Set(normalizar(titulo ?? '').split(' '))
  return [...new Set(normalizar(texto).split(' '))]
    .filter(w => w.length >= 4 && !/\d/.test(w) && !VACIAS.has(w) && !generica(w) && !delTitulo.has(w))
}

/** La respuesta rápida que se usó en una pregunta: el botón (si se tocó) o la más parecida. */
function usada(h: PreguntaHist, botones: Map<string, string>, plantillas: Plantilla[]): string | null {
  const b = botones.get(h.id)
  if (b) return b
  let mejor: string | null = null, max = PARECIDO_USO
  for (const p of plantillas) {
    const s = parecido(p.texto, h.respuesta)
    if (s >= max) { max = s; mejor = idPlantilla(p) }
  }
  return mejor
}

export function aprender(historial: PreguntaHist[], botones: Map<string, string>, plantillas: Plantilla[],
  quitadas: Quitadas, previas: Aprendidas): Aprendidas {
  const ids = new Set(plantillas.map(idPlantilla))
  const total = new Map<string, number>()
  const por = new Map<string, Map<string, number>>()
  for (const h of historial) {
    const u = usada(h, botones, plantillas)
    for (const w of palabrasDe(h.texto, h.item_titulo)) {
      total.set(w, (total.get(w) ?? 0) + 1)
      if (!u || !ids.has(u)) continue
      const m = por.get(w) ?? new Map<string, number>()
      m.set(u, (m.get(u) ?? 0) + 1)
      por.set(w, m)
    }
  }
  const ahora = new Date().toISOString()
  const out: Aprendidas = {}
  for (const [w, m] of por) {
    const [id, veces] = [...m].sort((a, b) => b[1] - a[1])[0]
    const pct = veces / (total.get(w) ?? veces)
    if (veces < MIN_VECES || pct < MIN_PCT) continue
    if (quitadas[id]?.includes(w)) continue
    const p = plantillas.find(x => idPlantilla(x) === id)
    if (p?.palabras?.some(x => normalizar(x) === w)) continue      // ya la escribió a mano
    const at = previas[id]?.find(a => a.palabra === w)?.at ?? ahora
    ;(out[id] ??= []).push({ palabra: w, veces, pct: Math.round(pct * 100), at })
  }
  for (const id of Object.keys(out)) out[id] = out[id].sort((a, b) => b.veces - a.veces).slice(0, MAX_POR_RESPUESTA)
  return out
}

/** Las respuestas rápidas con sus palabras aprendidas sumadas a las propias (para sugerir). */
export function conAprendidas(plantillas: Plantilla[], apr: Aprendidas): (Plantilla & { aprendidas?: string[] })[] {
  return plantillas.map(p => {
    const propias = (p.palabras ?? []).map(w => normalizar(w)).filter(Boolean)
    const a = (apr[idPlantilla(p)] ?? []).map(x => x.palabra).filter(w => !propias.includes(w))
    return a.length ? { ...p, palabras: [...(p.palabras ?? []), ...a], aprendidas: a } : p
  })
}
