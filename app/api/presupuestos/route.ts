import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { requestConnection } from '@/lib/requestConnection'
import { DatosPresupuesto, sesionPresupuestos, totalDe } from '@/lib/presupuestos'

// GET → lista (últimos 300). POST → crear (número correlativo por empresa).
export async function GET() {
  const s = await sesionPresupuestos()
  if ('error' in s) return s.error
  try {
    const { rows } = await s.db.query(
      `SELECT p.id::int, p.numero, p.cliente, p.total::float, p.moneda, p.estado, p.validez_dias, p.creado_at, p.sale_id,
              jsonb_array_length(p.items) AS n_items, COALESCE(u.full_name, u.username) AS usuario, s.ml_order_number AS venta
       FROM presupuestos p LEFT JOIN users u ON u.id = p.creado_por LEFT JOIN sales s ON s.id = p.sale_id
       ORDER BY p.creado_at DESC LIMIT 300`)
    return NextResponse.json({ presupuestos: rows })
  } catch (err) { return apiError(err) }
}

export async function POST(req: NextRequest) {
  const s = await sesionPresupuestos()
  if ('error' in s) return s.error
  const p = DatosPresupuesto.safeParse(await req.json().catch(() => null))
  if (!p.success) return NextResponse.json({ error: p.error.issues[0]?.message ?? p.error.message }, { status: 400 })
  const d = p.data
  const db = await requestConnection(s.db)
  try {
    await db.query('BEGIN')
    await db.query(`LOCK TABLE presupuestos IN SHARE ROW EXCLUSIVE MODE`)
    const { rows: [n] } = await db.query(`SELECT COALESCE(MAX(numero), 0) + 1 AS n FROM presupuestos`)
    const { rows: [r] } = await db.query(
      `INSERT INTO presupuestos (numero, cliente, cliente_doc, cliente_contacto, items, descuento, total, moneda, validez_dias, notas, creado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id::int, numero`,
      [n.n, d.cliente, d.cliente_doc || null, d.cliente_contacto || null, JSON.stringify(d.items), d.descuento,
       totalDe(d.items, d.descuento), d.moneda, d.validez_dias, d.notas || null, Number(s.session.user.id) || null])
    await db.query('COMMIT')
    return NextResponse.json(r, { status: 201 })
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {})
    return apiError(err)
  }
}
