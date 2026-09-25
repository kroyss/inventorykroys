import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'

// Borrador de "Facturar venta": se autoguarda mientras se llena el formulario.
// El contenido lo define el form (lib/invoices → InvoiceDraft); acá solo se valida la forma
// general y el tamaño, porque la validación real ocurre al emitir (POST /api/invoices).

type Params = { params: Promise<{ saleId: string }> }

async function ctx({ params }: Params) {
  const { saleId } = await params
  if (!/^\d+$/.test(saleId)) return { error: NextResponse.json({ error: 'ID inválido' }, { status: 400 }) }
  const { session, db } = await getSessionDb()
  if (!session || !db) return { error: unauthorized() }
  if (session.user.country !== 'VE') return { error: forbidden() }
  return { saleId, session, db }
}

// GET → { data, updated_at, updated_by } o null si no hay borrador
export async function GET(_: NextRequest, p: Params) {
  const c = await ctx(p)
  if (c.error) return c.error
  try {
    const { rows: [d] } = await c.db.query(`
      SELECT d.data, d.updated_at, u.username AS updated_by
      FROM invoice_drafts d LEFT JOIN users u ON u.id = d.updated_by
      WHERE d.sale_id = $1
    `, [c.saleId])
    return NextResponse.json(d ?? null)
  } catch (err) {
    return apiError(err)
  }
}

// PUT { data } → upsert
export async function PUT(req: NextRequest, p: Params) {
  const c = await ctx(p)
  if (c.error) return c.error
  try {
    const raw = await req.text()
    if (raw.length > 50_000) return NextResponse.json({ error: 'Borrador demasiado grande' }, { status: 400 })
    const { data } = z.object({ data: z.record(z.string(), z.unknown()) }).parse(JSON.parse(raw))
    const { rows: [sale] } = await c.db.query(`SELECT id FROM sales WHERE id = $1`, [c.saleId])
    if (!sale) return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 })
    const { rows: [d] } = await c.db.query(`
      INSERT INTO invoice_drafts (sale_id, data, updated_by, updated_at) VALUES ($1, $2, $3, NOW())
      ON CONFLICT (sale_id) DO UPDATE SET data = EXCLUDED.data, updated_by = EXCLUDED.updated_by, updated_at = NOW()
      RETURNING updated_at
    `, [c.saleId, JSON.stringify(data), parseInt(c.session.user.id, 10)])
    return NextResponse.json({ ok: true, updated_at: d.updated_at })
  } catch (err) {
    if (err instanceof z.ZodError || err instanceof SyntaxError) {
      return NextResponse.json({ error: 'Borrador inválido' }, { status: 400 })
    }
    return apiError(err)
  }
}

// DELETE → descartar el borrador
export async function DELETE(_: NextRequest, p: Params) {
  const c = await ctx(p)
  if (c.error) return c.error
  try {
    await c.db.query(`DELETE FROM invoice_drafts WHERE sale_id = $1`, [c.saleId])
    return NextResponse.json({ ok: true })
  } catch (err) {
    return apiError(err)
  }
}
