import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { autenticarEquipo, cuentaDe, leerConfig, SQL_PENDIENTE, SQL_REPORTABLE } from '@/lib/reportador'

/** GET /api/reportador/estado — pendientes por cuenta (para mostrar antes de reportar) */
export async function GET(req: NextRequest) {
  try {
    const auth = await autenticarEquipo(req)
    if ('error' in auth) return auth.error
    const { db } = auth
    const config = await leerConfig(db)

    const { rows } = await db.query(
      `SELECT e.remitente, e.reporte_estado
       FROM despacho_etiquetas e
       JOIN despacho_lotes l     ON l.id = e.lote_id
       JOIN despacho_jornadas j  ON j.id = l.jornada_id
       WHERE ${SQL_REPORTABLE} AND ${SQL_PENDIENTE}`)

    const pendientes: Record<string, number> = Object.fromEntries(config.cuentas.map(c => [c.nombre, 0]))
    let sinCuenta = 0, reintentos = 0
    for (const r of rows) {
      const c = cuentaDe(r.remitente, config.cuentas)
      if (c) pendientes[c.nombre]++
      else sinCuenta++
      if (r.reporte_estado) reintentos++
    }
    return NextResponse.json({ pendientes, sin_cuenta: sinCuenta, reintentos })
  } catch (err) {
    return apiError(err)
  }
}
