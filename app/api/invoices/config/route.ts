import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { currentDate, COUNTRY_TZ } from '@/lib/tz'
import { bcvRateFor, readInvoiceConfig } from '@/lib/invoicesServer'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// GET /api/invoices/config?date=YYYY-MM-DD → próximo número, IVA, calibración y la tasa BCV
// vigente para esa fecha (default hoy en Caracas). Lo usan admin y usuario.
export async function GET(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (session.user.country !== 'VE') return forbidden()

  try {
    const qd = req.nextUrl.searchParams.get('date') ?? ''
    const today = currentDate(COUNTRY_TZ.VE)
    const date = DATE_RE.test(qd) ? qd : today
    const [config, bcv] = await Promise.all([readInvoiceConfig(db), bcvRateFor(db, date)])
    return NextResponse.json({ ...config, today, date, rate: bcv?.rate ?? null, rate_date: bcv?.rate_date ?? null })
  } catch (err) {
    return apiError(err)
  }
}

// PUT /api/invoices/config (admin) → número inicial, IVA y corrimiento de impresión.
const PutSchema = z.object({
  start_number: z.number().int().positive().optional(),
  iva:          z.number().min(0).max(100).optional(),
  offset_x:     z.number().min(-30).max(30).optional(),
  offset_y:     z.number().min(-30).max(30).optional(),
})
const KEY: Record<keyof z.infer<typeof PutSchema>, string> = {
  start_number: 'factura_numero_inicial',
  iva:          'factura_iva',
  offset_x:     'factura_offset_x',
  offset_y:     'factura_offset_y',
}

export async function PUT(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (session.user.country !== 'VE' || session.user.role !== 'admin') return forbidden()

  try {
    const body = PutSchema.parse(await req.json())
    for (const [k, v] of Object.entries(body)) {
      if (v === undefined) continue
      await db.query(`
        INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, NOW())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
      `, [KEY[k as keyof typeof KEY], String(v)])
    }
    return NextResponse.json(await readInvoiceConfig(db))
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? err.message }, { status: 400 })
    return apiError(err)
  }
}
