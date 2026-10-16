import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { puede } from '@/lib/permisos'
import { unidadesDelTitulo } from '@/lib/combos'

// Publicaciones de ML vinculadas a un producto, por cuenta, con cuántas unidades trae cada una (combos,
// migración 098). La ficha del producto las muestra y deja corregir las unidades o quitar un vínculo.
async function sesion() {
  const { session, db } = await getSessionDb()
  if (!session || !db) return { error: unauthorized() } as const
  if (!puede(session.user, 'ver_productos')) return { error: forbidden() } as const
  return { db } as const
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await sesion()
  if ('error' in s) return s.error
  try {
    const id = z.coerce.number().int().positive().parse((await params).id)
    const { rows } = await s.db.query(
      `SELECT m.id, m.ml_account AS cuenta, m.ml_code AS codigo, m.unidades,
              COALESCE(c.titulo, m.titulo) AS titulo, c.permalink
       FROM product_ml_codes m
       LEFT JOIN LATERAL (SELECT titulo, permalink FROM ml_catalogo WHERE item_id = 'MLV' || split_part(m.ml_code, ':', 1)
                          OR item_id = 'MCO' || split_part(m.ml_code, ':', 1) LIMIT 1) c ON TRUE
       WHERE m.product_id = $1 AND m.is_active ORDER BY m.ml_account, m.unidades, m.id`, [id])
    return NextResponse.json({ publicaciones: rows.map(r => ({ ...r, sugeridas: r.unidades === 1 ? unidadesDelTitulo(r.titulo) : null })) })
  } catch (err) {
    return apiError(err)
  }
}

/** PUT { id, unidades } → corrige cuántas unidades trae esa publicación. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await sesion()
  if ('error' in s) return s.error
  try {
    const producto = z.coerce.number().int().positive().parse((await params).id)
    const b = z.object({ id: z.number().int().positive(), unidades: z.number().int().min(1).max(500) }).parse(await req.json())
    const { rowCount } = await s.db.query(`UPDATE product_ml_codes SET unidades = $3, combo_revisado = TRUE, updated_at = NOW() WHERE id = $1 AND product_id = $2`,
      [b.id, producto, b.unidades])
    return rowCount ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message }, { status: 400 })
    return apiError(err)
  }
}

/** DELETE ?vinculo=ID → quita el vínculo (esa publicación deja de ser este producto). */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await sesion()
  if ('error' in s) return s.error
  try {
    const producto = z.coerce.number().int().positive().parse((await params).id)
    const vinculo = z.coerce.number().int().positive().parse(req.nextUrl.searchParams.get('vinculo'))
    await s.db.query(`UPDATE product_ml_codes SET is_active = FALSE, updated_at = NOW() WHERE id = $1 AND product_id = $2`, [vinculo, producto])
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Falta el vínculo' }, { status: 400 })
    return apiError(err)
  }
}
