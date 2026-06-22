import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { z } from 'zod'
import { getFinanceSession } from '@/lib/finance'
import { unauthorized, forbidden } from '@/lib/session'

export async function GET(_: NextRequest) {
  const { session, db } = await getFinanceSession()
  if (!session || !db) return unauthorized()
  if (session.user.role !== 'admin') return forbidden()

  const { rows } = await db.query(`SELECT key, value FROM finance_settings`)
  const out: Record<string, string> = {}
  for (const r of rows) out[r.key] = r.value
  return NextResponse.json(out)
}

const PutSchema = z.object({
  cop_usd_rate: z.number().positive(),
})

export async function PUT(req: NextRequest) {
  const { session, db } = await getFinanceSession()
  if (!session || !db) return unauthorized()
  if (session.user.role !== 'admin') return forbidden()

  try {
    const b = PutSchema.parse(await req.json())
    await db.query(`
      INSERT INTO finance_settings (key, value, updated_at) VALUES ('cop_usd_rate', $1, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `, [String(b.cop_usd_rate)])
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}
