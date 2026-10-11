// Pasos 2 y 4 de las respuestas sugeridas (2026-10-11):
//   - estado de cada respuesta rápida: usos y "sin cambios" (respuestas_origen), y el semáforo
//     Con clic → Lista para automática (LISTA_USOS usos con ≥ LISTA_PCT sin cambios) → Automática;
//   - el automático: el cron publica solas las sugeridas cuya respuesta rápida el vendedor activó.
//     Nunca se activa sola (el sistema solo la ofrece), se pausa toda junta, y no publica si la
//     respuesta promete envío gratis en un producto sin confirmar.
import type { Pool } from 'pg'
import { idPlantilla } from '@/lib/preguntasTexto'
import { plantillasDe, sugeridasPara } from '@/lib/sugerenciasServidor'
import { publicarRespuesta } from '@/lib/responderPregunta'

export const LISTA_USOS = 30
export const LISTA_PCT = 0.95
const DIAS_USO = 90
const MAX_POR_PASADA = 20

export interface EstadoPlantilla {
  id: string
  usos: number                  // con clic (rápida o sugerida) en los últimos DIAS_USO días
  sin_cambios: number
  automaticas: number           // publicadas solas
  estado: 'clic' | 'lista' | 'automatica'
}

export async function estadoPlantillas(db: Pool): Promise<EstadoPlantilla[]> {
  const plantillas = await plantillasDe(db)
  const { rows } = await db.query(
    `SELECT plantilla,
            COUNT(*) FILTER (WHERE fuente IN ('rapida', 'sugerida'))::int AS usos,
            COUNT(*) FILTER (WHERE fuente IN ('rapida', 'sugerida') AND NOT editada)::int AS sin_cambios,
            COUNT(*) FILTER (WHERE fuente = 'automatica')::int AS automaticas
     FROM respuestas_origen
     WHERE modulo = 'preguntas' AND plantilla IS NOT NULL AND fecha > NOW() - make_interval(days => $1)
     GROUP BY plantilla`, [DIAS_USO])
  const m = new Map(rows.map(r => [r.plantilla as string, r]))
  return plantillas.map(p => {
    const id = idPlantilla(p)
    const r = m.get(id)
    const usos = r?.usos ?? 0, sin_cambios = r?.sin_cambios ?? 0
    const lista = usos >= LISTA_USOS && sin_cambios / usos >= LISTA_PCT
    return { id, usos, sin_cambios, automaticas: r?.automaticas ?? 0, estado: p.auto ? 'automatica' : lista ? 'lista' : 'clic' }
  })
}

export async function automaticasPausadas(db: Pool) {
  const { rows: [r] } = await db.query(`SELECT value FROM app_settings WHERE key = 'preguntas_auto_pausa'`)
  return r?.value === 'true'
}

/** Lo llama el cron después de sincronizar: publica las sugeridas de respuestas automáticas. */
export async function responderAutomaticas(db: Pool) {
  const plantillas = await plantillasDe(db)
  const autos = new Set(plantillas.filter(p => p.auto).map(idPlantilla))
  if (!autos.size || await automaticasPausadas(db)) return null
  const { rows } = await db.query(
    `SELECT id::text, texto, item_id, item_precio::float, item_moneda, item_estado FROM ml_preguntas
     WHERE estado = 'UNANSWERED' ORDER BY fecha LIMIT 200`)
  const sug = await sugeridasPara(db, rows)
  let publicadas = 0, fallas = 0
  for (const [id, s] of sug) {
    if (publicadas + fallas >= MAX_POR_PASADA) break
    if (!autos.has(s.plantilla) || s.sin_confirmar) continue
    try {
      const r = await publicarRespuesta(db, id, s.texto, { fuente: 'automatica', base: s.texto, plantilla: s.plantilla })
      if (r.ok && r.publicada) publicadas++; else fallas++
    } catch (e) {
      fallas++
      console.error('[respuesta automatica]', id, e instanceof Error ? e.message : e)
    }
  }
  return publicadas || fallas ? { publicadas, fallas } : null
}
