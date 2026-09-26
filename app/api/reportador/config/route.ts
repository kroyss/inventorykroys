import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { autenticarEquipo, leerConfig, LIMITE_CARACTERES, problemasConfig } from '@/lib/reportador'

/** GET /api/reportador/config — cuentas y plantillas (se editan en Despachos, no en el equipo) */
export async function GET(req: NextRequest) {
  try {
    const auth = await autenticarEquipo(req)
    if ('error' in auth) return auth.error
    const config = await leerConfig(auth.db)
    return NextResponse.json({
      equipo: auth.equipo.nombre,
      limite: LIMITE_CARACTERES,
      ...config,
      problemas: problemasConfig(config),
    })
  } catch (err) {
    return apiError(err)
  }
}
