import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { dbGlobal } from '@/lib/db'
import { soloDueno } from '@/lib/plataforma'
import { idDeYoutube, segundosDe, SQL_ORDEN_SERIE } from '@/lib/aprendizaje'

const Cambio = z.object({
  titulo: z.string().trim().min(2).max(120).optional(),
  descripcion: z.string().trim().max(500).nullable().optional(),
  url: z.string().trim().optional(),
  activo: z.boolean().optional(),
  mover: z.enum(['arriba', 'abajo']).optional(),
  serie: z.enum(['automatizaciones', 'inventario']).optional(),
  duracion: z.string().trim().max(10).optional(),   // "6:12"; vacío = sin duración
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
      // Intercambia el orden con el vecino de arriba o de abajo dentro de su serie.
      const { rows } = await db.query(
        `SELECT v.id, v.orden FROM aprendizaje_videos v
         WHERE v.serie = (SELECT serie FROM aprendizaje_videos WHERE id = $1) ORDER BY v.orden, v.id`, [id])
      const i = rows.findIndex(r => String(r.id) === id)
      const j = b.mover === 'arriba' ? i - 1 : i + 1
      if (i >= 0 && j >= 0 && j < rows.length) {
        await db.query(`UPDATE aprendizaje_videos SET orden = CASE id WHEN $1 THEN $3 WHEN $2 THEN $4 END WHERE id IN ($1, $2)`,
          [rows[i].id, rows[j].id, rows[j].orden, rows[i].orden])
        // Normaliza (0..n, por serie) para que no queden órdenes repetidos.
        await db.query(`UPDATE aprendizaje_videos v SET orden = x.n FROM (
          SELECT v.id, ROW_NUMBER() OVER (ORDER BY ${SQL_ORDEN_SERIE}, v.orden, v.id) - 1 AS n FROM aprendizaje_videos v) x WHERE x.id = v.id`)
      }
      return NextResponse.json({ ok: true })
    }
    let youtube: string | null = null
    if (b.url !== undefined) {
      youtube = idDeYoutube(b.url)
      if (!youtube) return NextResponse.json({ error: 'No reconozco ese link de YouTube' }, { status: 400 })
    }
    const duracion = b.duracion !== undefined ? segundosDe(b.duracion) : null
    if (Number.isNaN(duracion)) return NextResponse.json({ error: 'La duración va como 6:12 (minutos:segundos)' }, { status: 400 })
    const { rows: [antes] } = await db.query(`SELECT youtube_id FROM aprendizaje_videos WHERE id = $1`, [id])
    await db.query(
      `UPDATE aprendizaje_videos SET
         titulo = COALESCE($2, titulo),
         descripcion = CASE WHEN $3 THEN $4 ELSE descripcion END,
         youtube_id = COALESCE($5, youtube_id),
         activo = COALESCE($6, activo),
         serie = COALESCE($7, serie),
         -- cambia de serie: queda al final de la nueva
         orden = CASE WHEN $7 IS NOT NULL AND $7 <> serie THEN (SELECT COALESCE(MAX(orden), 0) + 1 FROM aprendizaje_videos) ELSE orden END,
         duracion_seg = CASE WHEN $8 THEN $9 ELSE duracion_seg END
       WHERE id = $1`,
      [id, b.titulo ?? null, b.descripcion !== undefined, b.descripcion ?? null, youtube, b.activo ?? null,
       b.serie ?? null, b.duracion !== undefined, duracion])
    // Video reemplazado: quien ya lo completó lo conserva; al resto se le reinicia el avance (los
    // segundos vistos y la duración eran del video anterior).
    if (youtube && youtube !== antes?.youtube_id) {
      await db.query(`DELETE FROM aprendizaje_progreso WHERE video_id = $1 AND completado_at IS NULL`, [id])
    }
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
