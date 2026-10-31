import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { iaConfigurada } from '@/lib/ia'
import { AYUDA_TOPE_DIA, consultasDeHoy, preguntarAyuda } from '@/lib/ayuda'
import { cuentaValida, externoAutorizado, noAutorizado } from '@/lib/externo'

const Pedido = z.object({
  origen: z.literal('radar'),
  user_id: z.number().int().positive(),
  pregunta: z.string().trim().min(3, 'Escribe tu pregunta').max(800, 'La pregunta es muy larga (máx. 800 caracteres)'),
  pantalla: z.string().max(200).default(''),
  // Solo ids: el historial se lee de la base (lib/ayuda.ts). Un 'historial' con textos (pestaña vieja) se ignora.
  historial_ids: z.array(z.number().int().positive()).max(4).default([]),
})

// POST /api/externo/ayuda → la ayuda con IA del Radar (su manual: docs/ayuda/radar.md). Servidor a servidor.
export async function POST(req: Request) {
  if (!externoAutorizado(req)) return noAutorizado()
  let b: z.infer<typeof Pedido>
  try { b = Pedido.parse(await req.json()) } catch (err) {
    return NextResponse.json({ error: err instanceof z.ZodError ? err.issues[0]?.message : 'Pedido inválido' }, { status: 400 })
  }
  if (!iaConfigurada()) return NextResponse.json({ error: 'La ayuda con IA no está disponible ahora. Escríbenos a Soporte.' }, { status: 503 })
  try {
    if (!(await cuentaValida(b.user_id))) return NextResponse.json({ error: 'Cuenta no válida' }, { status: 403 })
    if (await consultasDeHoy(b.user_id) >= AYUDA_TOPE_DIA)
      return NextResponse.json({ error: `Llegaste a las ${AYUDA_TOPE_DIA} preguntas de hoy. Mañana puedes seguir, o escríbenos a Soporte.` }, { status: 429 })
    const r = await preguntarAyuda({ origen: 'radar', pregunta: b.pregunta, pantalla: b.pantalla, historialIds: b.historial_ids, userId: b.user_id, empresaId: null })
    return NextResponse.json(r)
  } catch (err) {
    return apiError(err)
  }
}
