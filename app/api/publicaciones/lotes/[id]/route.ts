import { NextRequest, NextResponse } from 'next/server'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { tiposPermitidos } from '@/lib/colaPermisos'
import { apiError } from '@/lib/apiError'

// Tareas en MercadoLibre (cola, lib/colaML.ts): GET → cada publicación de un lote con su resultado.
// DELETE → cancelar lo que falta. Solo lotes de las secciones que el usuario puede ver (Publicaciones / Promociones).
async function sesionLote(id: number) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return { error: unauthorized() } as const
  const { rows: [l] } = await db.query(`SELECT tipo FROM ml_pub_lotes WHERE id = $1`, [id])
  if (!l || !tiposPermitidos(session.user).includes(l.tipo)) return { error: forbidden() } as const
  return { db } as const
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id)
  try {
    const s = await sesionLote(id)
    if ('error' in s) return s.error
    const { rows } = await s.db.query(
      `SELECT i.item_id, i.estado, i.mensaje, i.datos, i.resultado, i.hecho_at, m.titulo, k.nickname AS cuenta
       FROM ml_pub_lote_items i LEFT JOIN ml_catalogo m ON m.item_id = i.item_id
       LEFT JOIN ml_conexiones k ON k.id = COALESCE(i.conexion_id, m.conexion_id)
       WHERE i.lote_id = $1
       ORDER BY CASE i.estado WHEN 'error' THEN 0 WHEN 'saltada' THEN 1 WHEN 'procesando' THEN 2 WHEN 'pendiente' THEN 3 ELSE 4 END, m.titulo
       LIMIT 3000`, [id])
    return NextResponse.json({ items: rows })
  } catch (err) { return apiError(err) }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id)
  try {
    const s = await sesionLote(id)
    if ('error' in s) return s.error
    await s.db.query(`UPDATE ml_pub_lote_items SET estado = 'saltada', mensaje = 'Cancelado', hecho_at = NOW() WHERE lote_id = $1 AND estado = 'pendiente'`, [id])
    await s.db.query(`UPDATE ml_pub_lotes SET estado = 'cancelado', terminado_at = NOW() WHERE id = $1 AND estado = 'en_curso'`, [id])
    return NextResponse.json({ ok: true })
  } catch (err) { return apiError(err) }
}
