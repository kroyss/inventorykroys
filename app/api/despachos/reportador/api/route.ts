import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized } from '@/lib/session'
import { reportadorForbidden } from '@/lib/despachos'
import { mlConfigurado } from '@/lib/ml'
import { pendientesApi, SIMULA_SIEMPRE } from '@/lib/reportadorApi'
import { iniciarCorrida, ultimaCorrida } from '@/lib/reportadorCorrida'

// Reportador por API (sin programa de escritorio). Corre EN SEGUNDO PLANO (lib/reportadorCorrida.ts):
//   GET  → pendientes por cuenta, cuentas conectadas, si este entorno solo simula y la última corrida
//   POST { simular } → arranca la corrida (o devuelve la que ya corre); el servidor la termina aunque
//                      se cierre la pantalla. La pantalla consulta el GET para ver el avance.
export async function GET() {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  const denied = reportadorForbidden(session)
  if (denied) return denied
  try {
    const p = await pendientesApi(db)
    const { rows: conexiones } = await db.query(`SELECT nickname, estado FROM ml_conexiones ORDER BY nickname`)
    const corrida = await ultimaCorrida(db)
    return NextResponse.json({ ...p, conexiones, corrida, soloSimula: SIMULA_SIEMPRE, mlListo: mlConfigurado() })
  } catch (err) {
    return apiError(err)
  }
}

const Body = z.object({ simular: z.boolean().default(true) })

export async function POST(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  const denied = reportadorForbidden(session)
  if (denied) return denied
  if (!mlConfigurado()) return NextResponse.json({ error: 'Falta configurar la app de MercadoLibre' }, { status: 503 })
  try {
    const b = Body.parse(await req.json().catch(() => ({})))
    const r = await iniciarCorrida(db, {
      empresaId: session.user.empresaId, country: session.user.country, userId: Number(session.user.id),
    }, b.simular)
    return NextResponse.json(r)
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    if (err instanceof Error && err.message.startsWith('Configuración del Reportador')) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    return apiError(err)
  }
}
