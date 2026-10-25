// Simulación (25-10): con las respuestas rápidas, palabras aprendidas y calibración REALES de una empresa,
// ¿cuántas de sus preguntas ya respondidas habrían salido con la respuesta "ya escrita" (sugerida) y, si no,
// por qué? Lee un JSON exportado de producción (no toca la base). Uso:
//   npx tsx scripts/sim-sugeridas.ts datos.json aprendidas.json [--recalibrar]   (recalibrar = con el código actual)
import { readFileSync } from 'fs'
import { leerPlantillas, idPlantilla } from '@/lib/preguntasTexto'
import { sugerir, respaldo, palabrasQueActivan, probable, equivale, calibrar, type Calibracion } from '@/lib/sugerenciasPreguntas'
import { conAprendidas } from '@/lib/palabrasAprendidas'

const d = JSON.parse(readFileSync(process.argv[2], 'utf-8'))
const apr = JSON.parse(readFileSync(process.argv[3], 'utf-8'))
const plantillas = conAprendidas(leerPlantillas(d.plantillas), apr)
const hechos = new Map<string, boolean | null>((d.hechos ?? []).map((h: { item_id: string; envio_gratis: boolean | null }) => [h.item_id, h.envio_gratis]))
const cal: Calibracion = process.argv.includes('--recalibrar')
  ? calibrar((d.preguntas as { texto: string; item_id: string; precio: number | null; respuesta: string }[])
      .map(p => ({ ...p, envioGratis: hechos.get(p.item_id) ?? null })), plantillas)
  : JSON.parse(d.cal).cal

const motivos = new Map<string, number>()
let total = 0, sugeridas = 0, sugeridasOk = 0, sinCal = 0, probables = 0
const ejemplos = new Map<string, string[]>()
for (const p of d.preguntas as { texto: string; item_id: string; precio: number | null; respuesta: string }[]) {
  total++
  const item = { precio: p.precio, stock: null, item_id: p.item_id, envioGratis: hechos.get(p.item_id) ?? null }
  const s = sugerir(p.texto, item, plantillas)
  let motivo: string
  if (s.tipo === 'sugerida') {
    const id = idPlantilla(s.plantilla)
    const r = respaldo(cal, id, s.temas)
    const palabras = s.temas.includes(`p:${id}`) ? palabrasQueActivan(s.plantilla, p.texto) : []
    if (r !== null || palabras.length) {
      sugeridas++
      if (equivale(s.plantilla.texto, p.respuesta)) sugeridasOk++
      continue
    }
    sinCal++
    motivo = `sugerida pero sin calibración suficiente (${s.temas.join('+')})`
  } else motivo = s.motivo.replace(/\(.*\)/, m => m.length > 25 ? '(…)' : m)
  if (probable(p.texto, item, plantillas, cal)) probables++
  // Agrupar "depende del caso (palabra)" por palabra
  motivos.set(motivo, (motivos.get(motivo) ?? 0) + 1)
  const ej = ejemplos.get(motivo) ?? []
  if (ej.length < 3) { ej.push(p.texto.slice(0, 80)); ejemplos.set(motivo, ej) }
}
console.log(`preguntas: ${total}`)
console.log(`con respuesta ya escrita (sugerida): ${sugeridas} (${Math.round(100 * sugeridas / total)}%), equivalentes a lo publicado: ${sugeridasOk}`)
console.log(`sin sugerida: ${total - sugeridas}; de esas con botón "probable" resaltado: ${probables}`)
console.log('--- motivos (sin sugerida) ---')
for (const [m, n] of [...motivos].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
  console.log(`${String(n).padStart(5)}  ${m}  ← ${ejemplos.get(m)!.join(' | ')}`)
}
