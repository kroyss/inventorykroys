// De dónde salió cada respuesta publicada (migración 062): IA, respuesta parecida, respuesta
// rápida o escrita por la persona, y si la editó. Solo se guarda, para medir y mejorar las ayudas.
import type { Pool } from 'pg'
import { z } from 'zod'

export const FUENTES = ['ia', 'parecida', 'rapida', 'sugerida', 'propia'] as const
export const OrigenRespuesta = z.object({
  fuente: z.enum(FUENTES).optional(),
  base: z.string().max(4000).optional(),
  plantilla: z.string().max(80).optional(),   // id de la respuesta rápida usada (rapida / sugerida)
})

// "Editada" ignora espacios, mayúsculas y puntuación final: cambiar solo eso no es corregir.
const normal = (t: string) => t.toLowerCase().replace(/\s+/g, ' ').replace(/[.!¡¿?\s]+$/g, '').trim()

/** ¿La publicada difiere de lo propuesto? (la misma regla que "editada"). */
export const fueEditada = (base: string | null | undefined, texto: string) => !!base && normal(base) !== normal(texto)

/** Guarda el origen de una respuesta. Nunca hace fallar la publicación. */
export async function registrarOrigen(db: Pool, o: {
  modulo: 'preguntas' | 'mensajes'; ref: string; fuente?: string; base?: string; texto: string; usuarioId?: number | string | null
  plantilla?: string | null; itemId?: string | null
}) {
  try {
    const fuente = o.fuente && o.fuente !== 'propia' && o.base?.trim() ? o.fuente : 'propia'
    const base = fuente === 'propia' ? null : o.base!.trim()
    await db.query(
      `INSERT INTO respuestas_origen (modulo, ref, fuente, editada, base, texto, usuario_id, plantilla, item_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [o.modulo, o.ref, fuente, base !== null && normal(base) !== normal(o.texto), base, o.texto.trim(),
       o.usuarioId ? Number(o.usuarioId) : null, ['rapida', 'sugerida'].includes(fuente) ? o.plantilla ?? null : null, o.itemId ?? null])
  } catch (e) { console.error('[respuestas_origen]', e) }
}
