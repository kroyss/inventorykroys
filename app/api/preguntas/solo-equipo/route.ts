import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'

// Publicaciones que responde solo el equipo (mig 171, 12-11): la IA automática no responde sola en ellas.
// GET  /api/preguntas/solo-equipo            → [{ item_id, titulo, estado, link, imagen }, …]
// PUT  /api/preguntas/solo-equipo { item_id, solo } → marcar / desmarcar
const Cambio = z.object({ item_id: z.string().regex(/^[A-Z]{3}\d+$/), solo: z.boolean() })

export async function GET() {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  try {
    const { rows } = await s.db.query(
      `SELECT x.item_id, COALESCE(c.titulo, x.item_id) AS titulo, c.estado, c.permalink AS link, c.thumbnail AS imagen
       FROM ml_item_solo_equipo x LEFT JOIN ml_catalogo c ON c.item_id = x.item_id ORDER BY x.creado_at DESC`)
    return NextResponse.json(rows, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) { return apiError(err) }
}

export async function PUT(req: NextRequest) {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  try {
    const b = Cambio.parse(await req.json())
    if (b.solo) {
      await s.db.query(`INSERT INTO ml_item_solo_equipo (item_id, creado_por) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [b.item_id, Number(s.session.user.id)])
    } else {
      await s.db.query(`DELETE FROM ml_item_solo_equipo WHERE item_id = $1`, [b.item_id])
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}
