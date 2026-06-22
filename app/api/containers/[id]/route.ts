import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { z } from 'zod'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'

// Órdenes que pertenecen al contenedor + las disponibles (sin contenedor) para asignar
const ORDERS_SQL = `
  SELECT io.id, io.order_number, io.status,
         io.total_usd::float AS total_usd, io.box_count,
         s.name AS supplier_name,
         io.container_id,
         (SELECT COUNT(*) FROM import_order_files f WHERE f.import_order_id = io.id)::int AS file_count
  FROM import_orders io
  LEFT JOIN suppliers s ON s.id = io.supplier_id
  WHERE io.container_id = $1 OR io.container_id IS NULL
  ORDER BY (io.container_id IS NULL), io.updated_at DESC
`

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (session.user.role !== 'admin') return forbidden()

  const { rows: [container] } = await db.query(
    `SELECT id, code, name, status, origin_country, tracking_number,
            shipping_cost::float AS shipping_cost, eta, notes, created_at, updated_at
     FROM import_containers WHERE id = $1`, [id]
  )
  if (!container) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const { rows } = await db.query(ORDERS_SQL, [id])
  const numId = parseInt(id, 10)
  return NextResponse.json({
    container,
    orders:    rows.filter(r => r.container_id === numId),
    available: rows.filter(r => r.container_id === null),
  })
}

const UpdateSchema = z.object({
  name:            z.string().nullable().optional(),
  status:          z.enum(['ABIERTO', 'EN_TRANSITO', 'RECIBIDO', 'CERRADO']).optional(),
  origin_country:  z.string().nullable().optional(),
  tracking_number: z.string().nullable().optional(),
  shipping_cost:   z.number().nonnegative().nullable().optional(),
  eta:             z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes:           z.string().nullable().optional(),
})

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (session.user.role !== 'admin') return forbidden()

  try {
    const b = UpdateSchema.parse(await req.json())
    const fields: [string, unknown][] = []
    for (const k of ['name', 'status', 'origin_country', 'tracking_number', 'shipping_cost', 'eta', 'notes'] as const) {
      if (b[k] !== undefined) fields.push([k, b[k]])
    }
    if (fields.length === 0) return NextResponse.json({ ok: true })
    const sets = fields.map(([c], i) => `${c} = $${i + 1}`).join(', ')
    const vals = fields.map(([, v]) => v); vals.push(id)
    await db.query(`UPDATE import_containers SET ${sets} WHERE id = $${vals.length}`, vals)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (session.user.role !== 'admin') return forbidden()
  try {
    // ON DELETE SET NULL desasigna las órdenes automáticamente
    await db.query(`DELETE FROM import_containers WHERE id = $1`, [id])
    return NextResponse.json({ ok: true })
  } catch (err) {
    return apiError(err)
  }
}
