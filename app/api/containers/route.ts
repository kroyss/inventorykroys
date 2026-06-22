import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { z } from 'zod'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'

const LIST_SQL = `
  SELECT c.id, c.code, c.name, c.status, c.origin_country, c.tracking_number,
         c.shipping_cost::float AS shipping_cost, c.eta, c.notes,
         c.created_at, c.updated_at,
         COUNT(io.id)::int                       AS order_count,
         COALESCE(SUM(io.total_usd),0)::float    AS total_usd,
         COALESCE(SUM(io.box_count),0)::int      AS total_boxes
  FROM import_containers c
  LEFT JOIN import_orders io ON io.container_id = c.id
  GROUP BY c.id
  ORDER BY c.updated_at DESC, c.id DESC
`

export async function GET(_: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (session.user.role !== 'admin') return forbidden()
  const { rows } = await db.query(LIST_SQL)
  return NextResponse.json(rows)
}

const CreateSchema = z.object({
  code:            z.string().max(60).optional(),
  name:            z.string().max(200).optional(),
  status:          z.enum(['ABIERTO', 'EN_TRANSITO', 'RECIBIDO', 'CERRADO']).default('ABIERTO'),
  origin_country:  z.string().optional(),
  tracking_number: z.string().optional(),
  shipping_cost:   z.number().nonnegative().optional(),
  eta:             z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes:           z.string().optional(),
})

export async function POST(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (session.user.role !== 'admin') return forbidden()

  try {
    const b = CreateSchema.parse(await req.json())
    let code = b.code?.trim()
    if (!code) {
      const { rows: [m] } = await db.query(`
        SELECT MAX(CAST(SUBSTRING(code FROM 13) AS INTEGER)) AS n
        FROM import_containers WHERE code ~ '^CONTENEDOR-[0-9]+$'
      `)
      code = `CONTENEDOR-${String((m.n ?? 0) + 1).padStart(4, '0')}`
    }
    const { rows: [row] } = await db.query(`
      INSERT INTO import_containers
        (code, name, status, origin_country, tracking_number, shipping_cost, eta, notes, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id
    `, [code, b.name ?? null, b.status, b.origin_country ?? null, b.tracking_number ?? null,
        b.shipping_cost ?? null, b.eta ?? null, b.notes ?? null, parseInt(session.user.id, 10)])
    return NextResponse.json({ id: row.id, code }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}
