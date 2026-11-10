import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { sesionMiIA } from '@/lib/miIASesion'
import { agregarCorreccionGeneral } from '@/lib/miIAPruebas'

// POST /api/mi-ia/nota { texto } (10-11, el dueño): una corrección general para la IA («si preguntan X, di Y»), escrita desde
// una respuesta que salió mal. Se suma a Mi IA → Información extra, sección «Correcciones de mi equipo» (va en todas las
// respuestas de Preguntas y Mensajes). Las de un producto van a Datos del producto (/api/preguntas/notas).
const Nota = z.object({ texto: z.string().trim().min(3).max(300) })

export async function POST(req: NextRequest) {
  const s = await sesionMiIA()
  if ('error' in s) return s.error
  try {
    const p = Nota.safeParse(await req.json())
    if (!p.success) return NextResponse.json({ error: 'Escribe la corrección (de 3 a 300 letras)' }, { status: 400 })
    const error = await agregarCorreccionGeneral(s.db, p.data.texto)
    if (error) return NextResponse.json({ error }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (err) { return apiError(err) }
}
