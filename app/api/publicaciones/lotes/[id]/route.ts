import { NextRequest, NextResponse } from 'next/server'
import { sesionPublicaciones } from '@/lib/preguntasSesion'
import { apiError } from '@/lib/apiError'

// GET → el detalle de un lote (cada publicación con su resultado). DELETE → cancelar lo que falta.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await sesionPublicaciones()
  if ('error' in s) return s.error
  const id = Number((await params).id)
  try {
    const { rows } = await s.db.query(
      `SELECT i.item_id, i.estado, i.mensaje, i.datos, i.hecho_at, m.titulo, k.nickname AS cuenta
       FROM ml_pub_lote_items i LEFT JOIN ml_catalogo m ON m.item_id = i.item_id LEFT JOIN ml_conexiones k ON k.id = m.conexion_id
       WHERE i.lote_id = $1
       ORDER BY CASE i.estado WHEN 'error' THEN 0 WHEN 'saltada' THEN 1 WHEN 'procesando' THEN 2 WHEN 'pendiente' THEN 3 ELSE 4 END, m.titulo
       LIMIT 3000`, [id])
    return NextResponse.json({ items: rows })
  } catch (err) { return apiError(err) }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await sesionPublicaciones()
  if ('error' in s) return s.error
  const id = Number((await params).id)
  try {
    await s.db.query(`UPDATE ml_pub_lote_items SET estado = 'saltada', mensaje = 'Cancelado', hecho_at = NOW() WHERE lote_id = $1 AND estado = 'pendiente'`, [id])
    await s.db.query(`UPDATE ml_pub_lotes SET estado = 'cancelado', terminado_at = NOW() WHERE id = $1 AND estado = 'en_curso'`, [id])
    return NextResponse.json({ ok: true })
  } catch (err) { return apiError(err) }
}
