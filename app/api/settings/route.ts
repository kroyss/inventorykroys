import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { z } from 'zod'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'

// Claves permitidas (parámetros de costos ML por país). Evita escrituras arbitrarias.
const ALLOWED = new Set([
  'ml_comision', 'ml_envio', 'ml_umbral',            // VE
  'ml_umbral_envio', 'ml_envio_bajo', 'ml_envio_alto', 'ml_reten', // CO
])

// GET /api/settings → { key: value, ... } del país de la sesión
export async function GET() {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (session.user.role !== 'admin') return forbidden()

  try {
    const { rows } = await db.query(`SELECT key, value FROM app_settings`)
    const out: Record<string, string> = {}
    for (const r of rows) out[r.key] = r.value
    return NextResponse.json(out)
  } catch (err) {
    return apiError(err)
  }
}

// PUT /api/settings → upsert de las claves enviadas (solo las permitidas)
export async function PUT(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (session.user.role !== 'admin') return forbidden()

  try {
    const body = z.record(z.string(), z.union([z.string(), z.number()])).parse(await req.json())
    const entries = Object.entries(body).filter(([k]) => ALLOWED.has(k))
    if (entries.length === 0) {
      return NextResponse.json({ error: 'Sin claves válidas' }, { status: 400 })
    }
    for (const [key, value] of entries) {
      await db.query(
        `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [key, String(value)]
      )
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}
