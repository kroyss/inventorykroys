import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { z } from 'zod'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'

const CreateSchema = z.object({
  name: z.string().min(1),
  contact: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  notes: z.string().optional(),
})

export async function GET(_: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()

  const { rows } = await db.query(`
    SELECT id, name, contact, phone, email, notes, is_active
    FROM suppliers
    WHERE is_active = TRUE
      AND (supplier_type = 'local' OR supplier_type IS NULL)
    ORDER BY name
  `)
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (session.user.role !== 'admin') return forbidden()

  try {
    const body = CreateSchema.parse(await req.json())
    const { rows } = await db.query(
      `INSERT INTO suppliers (name, contact, phone, email, notes, supplier_type, is_active)
       VALUES ($1, $2, $3, $4, $5, 'local', TRUE)
       RETURNING id, name, contact, phone, email, notes, is_active`,
      [body.name, body.contact ?? null, body.phone ?? null, body.email ?? null, body.notes ?? null]
    )
    return NextResponse.json(rows[0], { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}
