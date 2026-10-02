import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { dbGlobal } from '@/lib/db'
import { soloDueno } from '@/lib/plataforma'
import { idDeYoutube } from '@/lib/aprendizaje'

const Cambio = z.object({
  titulo: z.string().trim().min(2).max(120).optional(),
  descripcion: z.string().trim().max(500).nullable().optional(),
  url: z.string().trim().optional(),
  activo: z.boolean().optional(),
  mover: z.enum(['arriba', 'abajo']).optional(),
})

// PUT /api/plataforma/aprendizaje/[id] → editar, activar/ocultar o mover un video · DELETE → borrarlo.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await soloDueno()
  if (error) return error
  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  try {
    const b = Cambio.parse(await req.json())
    const db = dbGlobal()
    if (b.mover) {
      // Intercambia el orden con el vecino de arriba o de abajo (orden de la lista completa).
      const { rows } = await db.query(`SELECT id, orden FROM aprendizaje_videos ORDER BY orden, id`)
      const i = rows.findIndex(r => String(r.id) === id)
      const j = b.mover === 'arriba' ? i - 1 : i + 1
      if (i >= 0 && j >= 0 && j < rows.length) {
        await db.query(`UPDATE aprendizaje_videos SET orden = CASE id WHEN $1 THEN $3 WHEN $2 THEN $4 END WHERE id IN ($1, $2)`,
          [rows[i].id, rows[j].id, j, i])
        // Normaliza el resto (0..n) para que no queden órdenes repetidos.
        await db.query(`UPDATE aprendizaje_videos v SET orden = x.n FROM (
          SELECT id, ROW_NUMBER() OVER (ORDER BY orden, id) - 1 AS n FROM aprendizaje_videos) x WHERE x.id = v.id`)
      }
      return NextResponse.json({ ok: true })
    }
    let youtube: string | null = null
    if (b.url !== undefined) {
      youtube = idDeYoutube(b.url)
      if (!youtube) return NextResponse.json({ error: 'No reconozco ese link de YouTube' }, { status: 400 })
    }
    await db.query(
      `UPDATE aprendizaje_videos SET
         titulo = COALESCE($2, titulo),
         descripcion = CASE WHEN $3 THEN $4 ELSE descripcion END,
         youtube_id = COALESCE($5, youtube_id),
         activo = COALESCE($6, activo)
       WHERE id = $1`,
      [id, b.titulo ?? null, b.descripcion !== undefined, b.descripcion ?? null, youtube, b.activo ?? null])
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message }, { status: 400 })
    return apiError(err)
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await soloDueno()
  if (error) return error
  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  try {
    await dbGlobal().query(`DELETE FROM aprendizaje_videos WHERE id = $1`, [id])
    return NextResponse.json({ ok: true })
  } catch (err) {
    return apiError(err)
  }
}
