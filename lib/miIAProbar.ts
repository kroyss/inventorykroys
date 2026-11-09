// Mi IA, Parte D (06-11): probar la IA con 10 preguntas REALES ya contestadas por el equipo, con Mi IA tal como quedó.
// Por cada una: la respuesta que dio la persona, la que daría la IA hoy y si saldría sola o iría a revisión (las mismas
// reglas que la respuesta automática, lib/iaAutomatica.ts). No publica nada ni toca la pregunta. No descuenta créditos
// del cliente (módulo 'simulacion'): es para que decida si la enciende.
import type { Pool } from 'pg'
import { armarContexto, datosCompatibilidad, datosPublicacion, pedirBorrador } from '@/lib/preguntas'
import { registrarUso, type LlamadaIA } from '@/lib/ia'
import { motivosRevisar } from '@/lib/iaAutomatica'

export const PRUEBA_N = 10

export interface CasoPrueba {
  id: string; pregunta: string; titulo: string | null; permalink: string | null
  tuya: string | null; ia: string; decision: 'sola' | 'revisar'; motivos: string[]; error?: string
}

export async function probarMiIA(db: Pool, country: string, usuarioId: number | string | null): Promise<CasoPrueba[]> {
  // Una por publicación (variedad), contestadas por una persona en los últimos 30 días.
  const { rows } = await db.query(
    `SELECT id::text, texto, item_titulo, item_permalink, respuesta FROM (
       SELECT DISTINCT ON (item_id) * FROM ml_preguntas
       WHERE estado = 'ANSWERED' AND respuesta IS NOT NULL AND fecha > NOW() - INTERVAL '30 days'
         AND COALESCE(ia_auto->>'publicada', 'false') <> 'true'
       ORDER BY item_id, fecha DESC) x
     ORDER BY fecha DESC LIMIT $1`, [PRUEBA_N])
  const llamadas: LlamadaIA[] = []
  const caso = async (q: { id: string; texto: string; item_titulo: string | null; item_permalink: string | null; respuesta: string | null }): Promise<CasoPrueba> => {
    const base = { id: q.id, pregunta: q.texto, titulo: q.item_titulo, permalink: q.item_permalink, tuya: q.respuesta }
    try {
      const c = await armarContexto(db, Number(q.id), country)
      const b = await pedirBorrador(c, false, undefined, false, true)
      llamadas.push(...b.llamadas)
      const motivos = motivosRevisar(b, c.item?.status ?? null, c.pregunta.texto, datosPublicacion(c), false, '', datosCompatibilidad(c))
      return { ...base, ia: b.respuesta, decision: motivos.length ? 'revisar' : 'sola', motivos }
    } catch (e) {
      return { ...base, ia: '', decision: 'revisar', motivos: ['Error de la IA'], error: (e instanceof Error ? e.message : String(e)).slice(0, 200) }
    }
  }
  // De a 4 en paralelo: ~10–20 s cada una.
  const out: CasoPrueba[] = []
  for (let i = 0; i < rows.length; i += 4) out.push(...await Promise.all(rows.slice(i, i + 4).map(caso)))
  if (llamadas.length) await registrarUso(db, 'simulacion', llamadas, usuarioId)
  return out
}
