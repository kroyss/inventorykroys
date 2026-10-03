import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { dbGlobal } from '@/lib/db'
import { soloDueno } from '@/lib/plataforma'
import { RONDA_ACTUAL, PUNTAJE_MAXIMO } from '@/lib/fundadores'

// GET /api/plataforma/fundadores → solicitudes de la ronda (mejor puntaje primero) y tandas.
export async function GET() {
  const { error } = await soloDueno()
  if (error) return error
  try {
    const db = dbGlobal()
    const [{ rows: solicitudes }, { rows: tandas }] = await Promise.all([
      db.query(
        `SELECT id, nombre, telegram, nick_ml, mensaje, ventas_mes, cuentas, despacho, dolor, inventario, herramientas, compromiso, puntaje, estado,
                tanda, sospechosa, ml_verificado, notas, created_at, revisada_at
         FROM fundadores_solicitudes WHERE ronda = $1
         ORDER BY CASE estado WHEN 'calificado' THEN 0 WHEN 'aprobado' THEN 1 WHEN 'rechazado' THEN 2 ELSE 3 END,
                  puntaje DESC, created_at`, [RONDA_ACTUAL]),
      db.query(
        `SELECT t.numero, t.cupos, t.abierta, to_char(t.inscribe_desde, 'YYYY-MM-DD') AS inscribe_desde,
              to_char(t.inscribe_hasta, 'YYYY-MM-DD') AS inscribe_hasta,
                (SELECT COUNT(*)::int FROM fundadores_solicitudes s WHERE s.tanda = t.numero AND s.estado = 'aprobado') AS tomados
         FROM fundadores_tandas t WHERE t.ronda = $1 ORDER BY t.numero`, [RONDA_ACTUAL]),
    ])
    return NextResponse.json({ solicitudes, tandas, maximo: PUNTAJE_MAXIMO })
  } catch (err) {
    return apiError(err)
  }
}
