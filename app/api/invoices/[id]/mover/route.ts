import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { facturasHabilitadas } from '@/lib/modulos'
import { requestConnection } from '@/lib/requestConnection'
import { sqlFacturaIncluye } from '@/lib/invoicesServer'

// PUT /api/invoices/[id]/mover → la factura se hizo en la venta equivocada (27-10, pedido del dueño): pasa a otra
// venta sin cambiar número ni lo impreso. La venta de antes queda sin factura (y se puede eliminar si era BORRADOR).
// Si los productos de la factura no coinciden con los de la venta nueva, avisa y pide confirmar.
// Queda anotado en invoices.correcciones (tipo "mover": de qué venta a cuál, quién y por qué).
const Schema = z.object({
  sale_id:   z.number().int().positive(),
  motivo:    z.string().trim().min(1, 'Indica por qué la mueves'),
  confirmar: z.boolean().optional(),
})

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (!facturasHabilitadas(session.user)) return forbidden()

  let body: z.infer<typeof Schema>
  try {
    body = Schema.parse(await req.json())
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? err.message }, { status: 400 })
    return apiError(err)
  }

  const client = await requestConnection(db)
  try {
    await client.query('BEGIN')
    const { rows: [inv] } = await client.query(
      `SELECT i.id, i.invoice_number, i.status, i.sale_id, s.ml_order_number AS orden
       FROM invoices i LEFT JOIN sales s ON s.id = i.sale_id WHERE i.id = $1 FOR UPDATE OF i`, [id])
    if (!inv) { await client.query('ROLLBACK'); return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 }) }
    if (inv.status !== 'EMITIDA') {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Esta factura está anulada: no se puede mover' }, { status: 409 })
    }
    if (inv.sale_id === body.sale_id) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'La factura ya está en esa venta' }, { status: 400 })
    }
    const { rows: [venta] } = await client.query(
      `SELECT id, ml_order_number AS orden, customer_name FROM sales WHERE id = $1 FOR UPDATE`, [body.sale_id])
    if (!venta) { await client.query('ROLLBACK'); return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 }) }
    const { rows: [otra] } = await client.query(
      `SELECT invoice_number FROM invoices i WHERE i.status = 'EMITIDA' AND i.id <> $1 AND ${sqlFacturaIncluye('i', '$2')} LIMIT 1`,
      [id, body.sale_id])
    if (otra) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: `La venta ${venta.orden} ya tiene la factura #${otra.invoice_number}` }, { status: 409 })
    }

    // ¿Lo facturado coincide con lo que tiene la venta nueva? (por producto y cantidad)
    if (!body.confirmar) {
      const { rows: dif } = await client.query(
        `WITH f AS (SELECT product_id, SUM(quantity)::float AS q FROM invoice_items WHERE invoice_id = $1 AND product_id IS NOT NULL GROUP BY 1),
              v AS (SELECT product_id, SUM(quantity)::float AS q FROM sale_items WHERE sale_id = $2 GROUP BY 1)
         SELECT COALESCE(p.code, '#' || x.product_id) AS codigo, COALESCE(f.q, 0) AS factura, COALESCE(v.q, 0) AS venta
         FROM (SELECT product_id FROM f UNION SELECT product_id FROM v) x
         LEFT JOIN f ON f.product_id = x.product_id LEFT JOIN v ON v.product_id = x.product_id
         LEFT JOIN products p ON p.id = x.product_id
         WHERE COALESCE(f.q, 0) <> COALESCE(v.q, 0)`, [id, body.sale_id])
      if (dif.length) {
        await client.query('ROLLBACK')
        return NextResponse.json({
          requiereConfirmar: true,
          diferencias: dif.map(d => `${d.codigo}: factura ${d.factura} · venta ${d.venta}`),
        }, { status: 409 })
      }
    }

    const registro = {
      fecha: new Date().toISOString(), usuario: session.user.name ?? null, usuario_id: parseInt(session.user.id, 10),
      tipo: 'mover', motivo: body.motivo, de_venta: inv.orden ?? inv.sale_id, a_venta: venta.orden,
    }
    // Si la venta nueva ya estaba agrupada en esta misma factura, pasa a ser la principal.
    await client.query(`DELETE FROM invoice_sales WHERE invoice_id = $1 AND sale_id = $2`, [id, body.sale_id])
    await client.query(
      `UPDATE invoices SET sale_id = $2, correcciones = correcciones || $3::jsonb WHERE id = $1`,
      [id, body.sale_id, JSON.stringify([registro])])
    await client.query('COMMIT')
    return NextResponse.json({ ok: true, de: inv.orden, a: venta.orden, deId: inv.sale_id })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    return apiError(err)
  }
}
