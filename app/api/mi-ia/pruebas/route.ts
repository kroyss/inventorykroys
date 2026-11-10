import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { sesionMiIA } from '@/lib/miIASesion'
import { listarPruebas, marcarCaso } from '@/lib/miIAPruebas'

// Historial de pruebas de Mi IA (10-11, mig 164).
// GET ?tipo=preguntas|mensajes → las últimas 20 pruebas con sus marcas.
// POST { id, caso, marca, error?, correccion? } → guarda la marca; si trae corrección, la aprende (lib/miIAPruebas.ts).
const Tipo = z.enum(['preguntas', 'mensajes'])
const Marca = z.object({
  id: z.string().regex(/^\d+$/), caso: z.string().min(1).max(200), marca: z.enum(['bien', 'mal']).nullable(),
  error: z.string().max(20).nullable().optional(), correccion: z.string().trim().max(500).nullable().optional(),
})

export async function GET(req: NextRequest) {
  const s = await sesionMiIA()
  if ('error' in s) return s.error
  const t = Tipo.safeParse(req.nextUrl.searchParams.get('tipo'))
  if (!t.success) return NextResponse.json({ error: 'Tipo no válido' }, { status: 400 })
  try { return NextResponse.json({ pruebas: await listarPruebas(s.db, t.data) }) } catch (err) { return apiError(err) }
}

export async function POST(req: NextRequest) {
  const s = await sesionMiIA()
  if ('error' in s) return s.error
  try {
    const p = Marca.safeParse(await req.json())
    if (!p.success) return NextResponse.json({ error: 'Datos no válidos' }, { status: 400 })
    const m = await marcarCaso(s.db, p.data.id, p.data.caso, { marca: p.data.marca, error: p.data.error ?? null, correccion: p.data.correccion ?? null }, s.session.user.id)
    if (!m) return NextResponse.json({ error: 'No encontré esa prueba' }, { status: 404 })
    return NextResponse.json({ marca: m })
  } catch (err) { return apiError(err) }
}
