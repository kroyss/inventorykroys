import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { getFinanceSession } from '@/lib/finance'
import { unauthorized, forbidden } from '@/lib/session'
import { currentYearMonth, COUNTRY_TZ } from '@/lib/tz'
import { puede } from '@/lib/permisos'
import { CLAVE_TABLA, costosEnviosML } from '@/lib/costosEnviosML'

// Finanzas → Costos ML (lib/costosEnviosML.ts). GET ?mes=YYYY-MM&factura=1 → guías del mes por cuenta con su costo según
// la tabla de ML, y (con factura=1) lo que ML facturó. PUT { tabla } → guarda la tabla de costos por peso.
const MES = /^\d{4}-\d{2}$/

export async function GET(req: NextRequest) {
  const { session, db } = await getFinanceSession()
  if (!session || !db) return unauthorized()
  if (!puede(session.user, 'ver_finanzas')) return forbidden()
  try {
    const sp = new URL(req.url).searchParams
    const m = sp.get('mes') ?? ''
    return NextResponse.json(await costosEnviosML(db, MES.test(m) ? m : currentYearMonth(COUNTRY_TZ.VE), sp.get('factura') === '1'))
  } catch (err) { return apiError(err) }
}

const Tabla = z.object({
  tabla: z.array(z.object({ maxKg: z.number().positive(), c1: z.number().min(0), c2: z.number().min(0), c3: z.number().min(0) })).min(1).max(40),
})

export async function PUT(req: NextRequest) {
  const { session, db } = await getFinanceSession()
  if (!session || !db) return unauthorized()
  if (!puede(session.user, 'ver_finanzas')) return forbidden()
  try {
    const p = Tabla.safeParse(await req.json())
    if (!p.success) return NextResponse.json({ error: p.error.message }, { status: 400 })
    const tabla = [...p.data.tabla].sort((a, b) => a.maxKg - b.maxKg)
    await db.query(
      `INSERT INTO app_settings (key, value) VALUES ($1, $2)
       ON CONFLICT (empresa_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [CLAVE_TABLA, JSON.stringify(tabla)])
    return NextResponse.json({ ok: true })
  } catch (err) { return apiError(err) }
}
