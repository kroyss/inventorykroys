import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { mlFetch, ErrorML } from '@/lib/ml'
import { problemasDelTexto } from '@/lib/preguntas'

const Body = z.object({ texto: z.string().min(1).max(2000) })

interface PreguntaML { status: string; answer?: { text: string; status: string; date_created: string } | null }

// POST /api/preguntas/[id]/responder { texto } → publica la respuesta en MercadoLibre.
// Solo cuenta como publicada si al RELEERLA quedó ANSWERED con la respuesta ACTIVE
// (ML a veces acepta el envío y después lo descarta sin avisar).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'Pregunta inválida' }, { status: 400 })

  try {
    const { texto } = Body.parse(await req.json())
    const problemas = problemasDelTexto(texto)
    if (problemas.length) {
      return NextResponse.json({ error: 'MercadoLibre rechazaría esta respuesta', problemas }, { status: 422 })
    }
    const { rows: [q] } = await s.db.query(`SELECT conexion_id, estado FROM ml_preguntas WHERE id = $1`, [id])
    if (!q) return NextResponse.json({ error: 'Pregunta no encontrada' }, { status: 404 })
    if (q.estado !== 'UNANSWERED') return NextResponse.json({ error: 'Esta pregunta ya no está sin responder' }, { status: 409 })

    try {
      await mlFetch(s.db, q.conexion_id, '/answers', { method: 'POST', body: { question_id: Number(id), text: texto.trim() } })
    } catch (e) {
      if (e instanceof ErrorML) {
        return NextResponse.json({ error: `MercadoLibre no aceptó la respuesta (${e.message})` }, { status: 502 })
      }
      throw e
    }

    // Relectura: la verdad es lo que quedó publicado.
    const v = await mlFetch<PreguntaML>(s.db, q.conexion_id, `/questions/${id}?api_version=4`)
    await s.db.query(
      `UPDATE ml_preguntas
       SET estado = $2, respuesta = $3, respuesta_estado = $4, respuesta_fecha = $5,
           respondida_por = $6, sincronizada_at = NOW()
       WHERE id = $1`,
      [id, v.status, v.answer?.text ?? texto.trim(), v.answer?.status ?? null,
       v.answer?.date_created?.replace(/(\.\d{6})\d+/, '$1') ?? new Date().toISOString(), Number(s.session.user.id)])
    const publicada = v.status === 'ANSWERED' && v.answer?.status === 'ACTIVE'
    return NextResponse.json({
      publicada, estado: v.status, respuesta_estado: v.answer?.status ?? null,
      aviso: publicada ? null : `MercadoLibre la dejó en "${v.answer?.status ?? v.status}": revísala en MercadoLibre.`,
    })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}
