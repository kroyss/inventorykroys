import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { sesionMiIA } from '@/lib/miIASesion'
import { aprenderCorreccion } from '@/lib/miIAPruebas'

// POST /api/mi-ia/corregir (12-11, el dueño): «¿Cómo la hubieras respondido tú?» desde una respuesta de la IA (historial
// de Preguntas, IA automática de Preguntas y de Mensajes). La IA (Haiku, sin descontar créditos) separa lo que escribió el
// vendedor en un dato del producto (ml_item_notas) y/o una regla general (Mi IA → «Correcciones de mi equipo»), sin
// repetir lo ya anotado. Mismo aprendizaje que la prueba con 10 reales de Mi IA.
const Cuerpo = z.object({
  tipo: z.enum(['preguntas', 'mensajes']),
  item_id: z.string().regex(/^[A-Z]{3}\d+$/).nullish(),
  producto: z.string().max(300).nullish(),
  texto: z.string().max(3000),
  ia: z.string().max(3000),
  correccion: z.string().trim().min(3).max(800),
})

export async function POST(req: NextRequest) {
  const s = await sesionMiIA()
  if ('error' in s) return s.error
  try {
    const p = Cuerpo.safeParse(await req.json())
    if (!p.success) return NextResponse.json({ error: 'Escribe cómo la hubieras respondido (al menos 3 letras)' }, { status: 400 })
    const b = p.data
    const aprendido = await aprenderCorreccion(s.db, {
      tipo: b.tipo, itemId: b.item_id ?? null, producto: b.producto ?? null, texto: b.texto, ia: b.ia,
      correccion: b.correccion, usuarioId: s.session.user.id,
    })
    return NextResponse.json({ ok: true, aprendido })
  } catch (err) { return apiError(err) }
}
