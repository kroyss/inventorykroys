import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { DatosPresupuesto, sesionPresupuestos, totalDe } from '@/lib/presupuestos'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const s = await sesionPresupuestos()
  if ('error' in s) return s.error
  const id = Number((await params).id)
  try {
    const { rows: [p] } = await s.db.query(
      `SELECT p.id::int, p.numero, p.cliente, p.cliente_doc, p.cliente_contacto, p.items, p.descuento::float, p.total::float,
              p.moneda, p.validez_dias, p.notas, p.estado, p.sale_id, p.creado_at, s.ml_order_number AS venta
       FROM presupuestos p LEFT JOIN sales s ON s.id = p.sale_id WHERE p.id = $1`, [id])
    if (!p) return NextResponse.json({ error: 'No existe' }, { status: 404 })
    return NextResponse.json(p)
  } catch (err) { return apiError(err) }
}

// PUT → editar (mientras no se pasó a venta) o solo cambiar el estado ({ estado }).
const SoloEstado = z.object({ estado: z.enum(['borrador', 'enviado', 'rechazado']) }).strict()
export async function PUT(req: NextRequest, { params }: Ctx) {
  const s = await sesionPresupuestos()
  if ('error' in s) return s.error
  const id = Number((await params).id)
  const body = await req.json().catch(() => null)
  try {
    const { rows: [actual] } = await s.db.query(`SELECT sale_id FROM presupuestos WHERE id = $1`, [id])
    if (!actual) return NextResponse.json({ error: 'No existe' }, { status: 404 })
    if (actual.sale_id) return NextResponse.json({ error: 'Ya se pasó a venta: no se puede cambiar' }, { status: 409 })
    const e = SoloEstado.safeParse(body)
    if (e.success) {
      await s.db.query(`UPDATE presupuestos SET estado = $2, actualizado_at = NOW() WHERE id = $1`, [id, e.data.estado])
      return NextResponse.json({ ok: true })
    }
    const p = DatosPresupuesto.safeParse(body)
    if (!p.success) return NextResponse.json({ error: p.error.issues[0]?.message ?? p.error.message }, { status: 400 })
    const d = p.data
    await s.db.query(
      `UPDATE presupuestos SET cliente = $2, cliente_doc = $3, cliente_contacto = $4, items = $5, descuento = $6, total = $7,
         moneda = $8, validez_dias = $9, notas = $10, actualizado_at = NOW() WHERE id = $1`,
      [id, d.cliente, d.cliente_doc || null, d.cliente_contacto || null, JSON.stringify(d.items), d.descuento,
       totalDe(d.items, d.descuento), d.moneda, d.validez_dias, d.notas || null])
    return NextResponse.json({ ok: true })
  } catch (err) { return apiError(err) }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const s = await sesionPresupuestos()
  if ('error' in s) return s.error
  const id = Number((await params).id)
  try {
    const { rowCount } = await s.db.query(`DELETE FROM presupuestos WHERE id = $1 AND sale_id IS NULL`, [id])
    if (!rowCount) return NextResponse.json({ error: 'No se puede borrar (ya es venta o no existe)' }, { status: 409 })
    return NextResponse.json({ ok: true })
  } catch (err) { return apiError(err) }
}
