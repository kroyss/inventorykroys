import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { CLAVE_FRENOS, leerFrenos, normalizarFrenos } from '@/lib/iaFrenos'
import { problemasDelTexto } from '@/lib/preguntasTexto'

// GET/PUT /api/ia-frenos → horario, tope por comprador y frase de escape de la IA automática (lib/iaFrenos.ts).
// Lo editan Preguntas → IA automática y Mensajes → IA (mismo guardado: valen para los dos).
export async function GET() {
  const s = await sesionPreguntas('automatizaciones_config')
  if ('error' in s) return s.error
  try { return NextResponse.json(await leerFrenos(s.db)) } catch (err) { return apiError(err) }
}

const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida')
const Body = z.object({
  horario: z.object({ dias: z.array(z.number().int().min(0).max(6)).min(1, 'Elige al menos un día').max(7), desde: HHMM, hasta: HHMM })
    .refine(h => h.desde !== h.hasta, 'La hora de inicio y la de fin no pueden ser iguales').nullable(),
  tope: z.number().int().min(1, 'El tope mínimo es 1').max(50),
  escape: z.string().trim().max(200).nullable(),
  escapePreguntas: z.string().trim().max(350).nullable().optional(),
})

export async function PUT(req: NextRequest) {
  const s = await sesionPreguntas('automatizaciones_config')
  if ('error' in s) return s.error
  try {
    const p = Body.safeParse(await req.json().catch(() => null))
    if (!p.success) return NextResponse.json({ error: p.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    if (p.data.escape) {
      const malo = problemasDelTexto(p.data.escape, 'mensaje')
      if (malo.length) return NextResponse.json({ error: `La frase de escape: ${malo.join(' · ')}` }, { status: 400 })
    }
    if (p.data.escapePreguntas) {
      const malo = problemasDelTexto(p.data.escapePreguntas, 'pregunta')
      if (malo.length) return NextResponse.json({ error: `La frase para Preguntas: ${malo.join(' · ')}` }, { status: 400 })
    }
    const v = normalizarFrenos(p.data)
    await s.db.query(
      `INSERT INTO app_settings (key, value) VALUES ($1, $2)
       ON CONFLICT (empresa_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, [CLAVE_FRENOS, JSON.stringify(v)])
    return NextResponse.json(v)
  } catch (err) { return apiError(err) }
}
