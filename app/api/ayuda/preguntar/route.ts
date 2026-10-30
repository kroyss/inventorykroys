import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { apiError } from '@/lib/apiError'
import { unauthorized } from '@/lib/session'
import { iaConfigurada } from '@/lib/ia'
import { AYUDA_TOPE_DIA, consultasDeHoy, preguntarAyuda } from '@/lib/ayuda'

const Pedido = z.object({
  pregunta: z.string().trim().min(3, 'Escribe tu pregunta').max(800, 'La pregunta es muy larga (máx. 800 caracteres)'),
  pantalla: z.string().max(200).default(''),
  historial: z.array(z.object({ pregunta: z.string().max(800), respuesta: z.string().max(2000) })).max(4).default([]),
})

// POST /api/ayuda/preguntar → la IA responde con el manual (lib/ayuda.ts). Costo de la plataforma, con tope diario.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return unauthorized()
  let b: z.infer<typeof Pedido>
  try { b = Pedido.parse(await req.json()) } catch (err) {
    return NextResponse.json({ error: err instanceof z.ZodError ? err.issues[0]?.message : 'Pedido inválido' }, { status: 400 })
  }
  if (!iaConfigurada()) return NextResponse.json({ error: 'La ayuda con IA no está disponible ahora. Escríbenos a Soporte.' }, { status: 503 })
  try {
    const userId = Number(session.user.id)
    if (await consultasDeHoy(userId) >= AYUDA_TOPE_DIA)
      return NextResponse.json({ error: `Llegaste a las ${AYUDA_TOPE_DIA} preguntas de hoy. Mañana puedes seguir, o escríbenos a Soporte.` }, { status: 429 })
    const r = await preguntarAyuda({ pregunta: b.pregunta, pantalla: b.pantalla, historial: b.historial, userId,
      empresaId: session.user.soporte?.empresaId ?? session.user.empresaId ?? null })
    return NextResponse.json(r)
  } catch (err) {
    return apiError(err)
  }
}
