import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { refrescarNotasVentas } from '@/lib/notasML'

// POST /api/sales/por-confirmar/notas { numeros } → relee de ML las notas de esas ventas (las de la lista de Pagos ME /
// Por confirmar) cuya copia tiene más de 5 min y devuelve { notas: { numero: tieneNota } } de las releídas (12-11).
const Cuerpo = z.object({ numeros: z.array(z.string().regex(/^\d{1,18}$/)).max(300) })

export async function POST(req: NextRequest) {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  try {
    const { numeros } = Cuerpo.parse(await req.json().catch(() => ({})))
    return NextResponse.json({ notas: await refrescarNotasVentas(s.db, numeros) })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? err.message }, { status: 400 })
    return apiError(err)
  }
}
