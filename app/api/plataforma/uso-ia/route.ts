import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { dbGlobal } from '@/lib/db'
import { soloDueno } from '@/lib/plataforma'
import { currentYearMonth } from '@/lib/tz'

const MESES = 6

// GET /api/plataforma/uso-ia → consumo de IA por empresa en los últimos 6 meses (con el actual),
// separado por módulo. Solo el dueño de la plataforma (función SECURITY DEFINER, migración 044).
export async function GET() {
  const { error } = await soloDueno()
  if (error) return error
  try {
    const [y, m] = currentYearMonth().split('-').map(Number)
    const meses = Array.from({ length: MESES }, (_, i) => {
      const d = new Date(Date.UTC(y, m - 1 - (MESES - 1 - i), 1))
      return d.toISOString().slice(0, 7)
    })
    const { rows } = await dbGlobal().query(
      `SELECT u.empresa_id, e.nombre AS empresa, u.mes, u.modulo, u.borradores,
              u.entrada::float AS entrada, u.salida::float AS salida, u.busquedas::float AS busquedas,
              u.costo::float AS costo
       FROM plataforma_uso_ia($1::date) u JOIN empresas e ON e.id = u.empresa_id
       ORDER BY e.nombre, u.mes, u.modulo`, [`${meses[0]}-01`])
    return NextResponse.json({ meses, filas: rows })
  } catch (err) {
    return apiError(err)
  }
}
