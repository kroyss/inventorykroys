import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { armarContexto, iaConfigurada, pedirBorrador } from '@/lib/preguntas'
import { cupoIA, mensajeCupoAgotado, registrarUso } from '@/lib/ia'

const Body = z.object({ web: z.boolean().optional() })

// POST /api/preguntas/[id]/borrador { web? } → la IA propone una respuesta (no publica nada).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  if (!iaConfigurada()) return NextResponse.json({ error: 'Falta configurar la IA en el servidor' }, { status: 503 })
  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'Pregunta inválida' }, { status: 400 })

  try {
    const { web } = Body.parse(await req.json().catch(() => ({})))
    const cupo = await cupoIA(s.db, s.session.user.empresaId)
    if (cupo.agotado) return NextResponse.json({ error: mensajeCupoAgotado(cupo.limite!), cupo }, { status: 429 })
    const ctx = await armarContexto(s.db, Number(id), s.session.user.country)
    const b = await pedirBorrador(ctx, !!web)
    await registrarUso(s.db, 'preguntas', b.llamadas, s.session.user.id)
    await s.db.query(
      `UPDATE ml_preguntas SET borrador = $2, borrador_confianza = $3, borrador_falta = $4,
                               borrador_web = $5, borrador_at = NOW()
       WHERE id = $1`, [id, b.respuesta, b.confianza, b.falta_dato, b.web])
    return NextResponse.json({
      borrador: { respuesta: b.respuesta, confianza: b.confianza, falta_dato: b.falta_dato, web: b.web },
      contexto: {
        vinculado: !!ctx.producto, stock: ctx.producto?.stock ?? null,
        ejemplos: ctx.mismoItem.length + ctx.parecidas.length, descripcion: !!ctx.descripcion,
      },
      cupo: { usados: cupo.usados + 1, limite: cupo.limite },
    })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    if (err instanceof Error && err.message.startsWith('IA ')) {
      return NextResponse.json({ error: `La IA no respondió: ${err.message}` }, { status: 502 })
    }
    return apiError(err)
  }
}
