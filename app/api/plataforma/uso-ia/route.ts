import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { dbGlobal } from '@/lib/db'
import { soloDueno } from '@/lib/plataforma'
import { currentDate, currentYearMonth } from '@/lib/tz'

const MESES = 6

// GET /api/plataforma/uso-ia → consumo de IA por empresa en los últimos 6 meses (con el actual),
// separado por módulo, + el DETALLE del mes en curso (por día, modelo y usuario; migración 065) y
// el tope de borradores de cada empresa. Solo el dueño de la plataforma (funciones SECURITY
// DEFINER, migraciones 044 y 065).
export async function GET() {
  const { error } = await soloDueno()
  if (error) return error
  try {
    const [y, m] = currentYearMonth().split('-').map(Number)
    const meses = Array.from({ length: MESES }, (_, i) => {
      const d = new Date(Date.UTC(y, m - 1 - (MESES - 1 - i), 1))
      return d.toISOString().slice(0, 7)
    })
    const mesActual = meses[meses.length - 1]
    const [{ rows }, { rows: detalle }, { rows: empresas }] = await Promise.all([
      dbGlobal().query(
        `SELECT u.empresa_id, e.nombre AS empresa, u.mes, u.modulo, u.borradores,
                u.entrada::float AS entrada, u.salida::float AS salida, u.busquedas::float AS busquedas,
                u.costo::float AS costo
         FROM plataforma_uso_ia($1::date) u JOIN empresas e ON e.id = u.empresa_id
         ORDER BY e.nombre, u.mes, u.modulo`, [`${meses[0]}-01`]),
      dbGlobal().query(
        `SELECT empresa_id, to_char(dia, 'YYYY-MM-DD') AS dia, modulo, modelo, usuario, usos,
                entrada::float AS entrada, salida::float AS salida, busquedas::float AS busquedas, costo::float AS costo
         FROM plataforma_uso_ia_detalle($1::date) ORDER BY dia`, [`${mesActual}-01`]).catch(() => ({ rows: [] })),
      dbGlobal().query(
        `SELECT e.id, e.nombre, o.estado = 'propietario' AS propietario, e.ia_limite_mes AS limite
         FROM empresas e JOIN organizaciones o ON o.id = e.organizacion_id ORDER BY e.id`),
    ])
    const hoy = currentDate()
    const diasMes = new Date(Date.UTC(y, m, 0)).getUTCDate()
    return NextResponse.json({ meses, filas: rows, detalle, empresas, hoy, diasMes, diaHoy: Number(hoy.slice(8, 10)) })
  } catch (err) {
    return apiError(err)
  }
}
