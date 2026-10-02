import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { preguntasDeComprador } from '@/lib/preguntasComprador'

// GET /api/preguntas/comprador?id=COMPRADOR&excluir=PREGUNTA → sus preguntas anteriores (las 20 últimas).
export async function GET(req: NextRequest) {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  const u = new URL(req.url).searchParams
  const id = u.get('id') ?? '', excluir = u.get('excluir')
  if (!/^\d+$/.test(id) || (excluir && !/^\d+$/.test(excluir))) return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 })
  try {
    return NextResponse.json(await preguntasDeComprador(s.db, id, excluir))
  } catch (err) {
    return apiError(err)
  }
}
