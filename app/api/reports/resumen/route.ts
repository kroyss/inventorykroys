import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { tieneModulo } from '@/lib/modulos'
import { puede } from '@/lib/permisos'
import { PERIODOS_METRICAS, resumenMetricas } from '@/lib/metricas'
import { resumenAtencion } from '@/lib/resumenAtencion'

// GET /api/reports/resumen?dias=7|30|90|365 → Reportes → Resumen (módulo metricas, mig 153).
export async function GET(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  const u = session.user
  if (!tieneModulo(u, 'metricas') || !puede(u, 'ver_reportes')) return forbidden()
  const n = Number(req.nextUrl.searchParams.get('dias'))
  const dias = (PERIODOS_METRICAS as readonly number[]).includes(n) ? n : 30
  const ml = tieneModulo(u, 'preguntas')
  try {
    const [r, atencion] = await Promise.all([
      resumenMetricas(db, dias, { inventario: tieneModulo(u, 'inventario'), ml }),
      ml && tieneModulo(u, 'atencion_ml') && puede(u, 'ver_preguntas') ? resumenAtencion(db, dias) : Promise.resolve(null),
    ])
    // Sin el permiso de costos no se ven costo ni ganancia (igual que en el Inicio).
    if (r.ventas && !puede(u, 'costos')) {
      for (const k of ['actual', 'anterior'] as const) r.ventas[k] = { ...r.ventas[k], costo: 0, comision: 0, ganancia: 0 }
    }
    return NextResponse.json({ ...r, atencion, verCostos: puede(u, 'costos'), moneda: u.country === 'CO' ? 'COP' : 'USD' })
  } catch (err) { return apiError(err) }
}
