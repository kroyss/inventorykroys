import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized } from '@/lib/session'
import { reportadorForbidden } from '@/lib/despachos'
import { mlConfigurado } from '@/lib/ml'
import { pendientesApi, reportarLote, SIMULA_SIEMPRE } from '@/lib/reportadorApi'

// Reportador por API (sin programa de escritorio).
//   GET  → pendientes por cuenta, cuentas conectadas y si este entorno solo simula
//   POST { simular, excluir } → procesa un lote chico; la pantalla repite hasta vaciar
export async function GET() {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  const denied = reportadorForbidden(session)
  if (denied) return denied
  try {
    const [p, { rows: conexiones }] = await Promise.all([
      pendientesApi(db),
      db.query(`SELECT nickname, estado FROM ml_conexiones ORDER BY nickname`),
    ])
    return NextResponse.json({ ...p, conexiones, soloSimula: SIMULA_SIEMPRE, mlListo: mlConfigurado() })
  } catch (err) {
    return apiError(err)
  }
}

const Body = z.object({
  simular: z.boolean().default(true),
  excluir: z.array(z.string().regex(/^\d+$/)).max(2000).default([]),
})

export async function POST(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  const denied = reportadorForbidden(session)
  if (denied) return denied
  if (!mlConfigurado()) return NextResponse.json({ error: 'Falta configurar la app de MercadoLibre' }, { status: 503 })
  try {
    const b = Body.parse(await req.json().catch(() => ({})))
    const r = await reportarLote(db, { simular: b.simular, limite: 8, excluir: b.excluir })
    return NextResponse.json(r)
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    if (err instanceof Error && err.message.startsWith('Configuración del Reportador')) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    return apiError(err)
  }
}
