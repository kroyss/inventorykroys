// Publicar una respuesta en MercadoLibre: lo usan el botón de cada pregunta, "Enviar las sugeridas"
// y las respuestas automáticas (lib/automaticasPreguntas.ts). Solo cuenta como publicada si al
// RELEERLA quedó ANSWERED con la respuesta ACTIVE (ML a veces acepta el envío y después lo descarta).
import type { Pool } from 'pg'
import { mlFetch, ErrorML } from '@/lib/ml'
import { registrarOrigen } from '@/lib/respuestasOrigen'
import { aprenderDeRespuesta } from '@/lib/sugerenciasServidor'

interface PreguntaML { status: string; answer?: { text: string; status: string; date_created: string } | null }

export type ResultadoPublicar =
  | { ok: true; publicada: boolean; estado: string; respuesta_estado: string | null; aviso: string | null }
  | { ok: false; status: number; codigo?: string; error: string }

export async function publicarRespuesta(db: Pool, id: string, texto: string, o: {
  usuarioId?: number | string | null; fuente?: string; base?: string; plantilla?: string | null
}): Promise<ResultadoPublicar> {
  const { rows: [q] } = await db.query(
    `SELECT conexion_id, estado, item_id, CASE WHEN COALESCE(item_moneda, 'USD') = 'USD' THEN item_precio::float END AS precio
     FROM ml_preguntas WHERE id = $1`, [id])
  if (!q) return { ok: false, status: 404, error: 'Pregunta no encontrada' }
  if (q.estado !== 'UNANSWERED') return { ok: false, status: 409, error: 'Esta pregunta ya no está sin responder' }
  try {
    await mlFetch(db, q.conexion_id, '/answers', { method: 'POST', body: { question_id: Number(id), text: texto.trim() } })
  } catch (e) {
    // Publicación pausada (casi siempre por quedarse sin stock): ML no deja responder hasta reactivarla.
    if (e instanceof ErrorML && /must be active/i.test(e.message)) {
      await db.query(`UPDATE ml_preguntas SET item_estado = 'paused' WHERE item_id = $1`, [q.item_id])
      return { ok: false, status: 409, codigo: 'item_inactivo',
        error: 'La publicación está pausada (sin stock): MercadoLibre no deja responder hasta que vuelva a tener stock. Repón el stock aquí abajo o elimina la pregunta.' }
    }
    if (e instanceof ErrorML) return { ok: false, status: 502, error: `MercadoLibre no aceptó la respuesta (${e.message})` }
    throw e
  }
  // Relectura: la verdad es lo que quedó publicado.
  const v = await mlFetch<PreguntaML>(db, q.conexion_id, `/questions/${id}?api_version=4`)
  await db.query(
    `UPDATE ml_preguntas
     SET estado = $2, respuesta = $3, respuesta_estado = $4, respuesta_fecha = $5,
         respondida_por = $6, sincronizada_at = NOW()
     WHERE id = $1`,
    [id, v.status, v.answer?.text ?? texto.trim(), v.answer?.status ?? null,
     v.answer?.date_created?.replace(/(\.\d{6})\d+/, '$1') ?? new Date().toISOString(), o.usuarioId ? Number(o.usuarioId) : null])
  const publicada = v.status === 'ANSWERED' && v.answer?.status === 'ACTIVE'
  await registrarOrigen(db, { modulo: 'preguntas', ref: id, fuente: o.fuente, base: o.base, texto, usuarioId: o.usuarioId,
    plantilla: o.plantilla, itemId: q.item_id })
  // Aprende de la publicación (envío gratis sí/no): lib/sugerenciasServidor.ts.
  if (publicada) await aprenderDeRespuesta(db, { itemId: q.item_id, precio: q.precio, texto, fuente: o.fuente, base: o.base, plantilla: o.plantilla })
  return { ok: true, publicada, estado: v.status, respuesta_estado: v.answer?.status ?? null,
    aviso: publicada ? null : `MercadoLibre la dejó en "${v.answer?.status ?? v.status}": revísala en MercadoLibre.` }
}
