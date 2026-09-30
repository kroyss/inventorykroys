import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'

const Body = z.object({ item_id: z.string().regex(/^[A-Z]{3}\d+$/), texto: z.string().trim().min(3).max(500) })

// GET  /api/preguntas/notas?item_id=MLV…  → datos anotados de esa publicación
// POST /api/preguntas/notas { item_id, texto } → la IA los usa en las próximas preguntas
export async function GET(req: NextRequest) {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  const item = new URL(req.url).searchParams.get('item_id') ?? ''
  try {
    const { rows } = await s.db.query(
      `SELECT n.id, n.texto, n.created_at, u.full_name AS por
       FROM ml_item_notas n LEFT JOIN users u ON u.id = n.creada_por
       WHERE n.item_id = $1 ORDER BY n.created_at DESC`, [item])
    return NextResponse.json(rows)
  } catch (err) { return apiError(err) }
}

export async function POST(req: NextRequest) {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  try {
    const b = Body.parse(await req.json())
    await s.db.query(`INSERT INTO ml_item_notas (item_id, texto, creada_por) VALUES ($1, $2, $3)`,
      [b.item_id, b.texto, Number(s.session.user.id)])
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}
