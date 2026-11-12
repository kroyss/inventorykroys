import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { conEmpresa, dbGlobal } from '@/lib/db'
import { cupoIA } from '@/lib/ia'
import type { Country } from '@/lib/types'
import { soloDueno } from '@/lib/plataforma'
import { currentDate } from '@/lib/tz'

// 12-11 (el dueño): el consumo se mide desde que salió Mi IA (06-11); lo de antes eran otros modelos y otro diseño.
export const IA_MEDIR_DESDE = '2026-11-06'

// GET /api/plataforma/uso-ia → consumo de IA de cada empresa desde IA_MEDIR_DESDE, por día, módulo, modelo y usuario
// (migración 065), y los créditos de cada empresa. Solo el dueño de la plataforma (funciones SECURITY DEFINER).
export async function GET() {
  const { error } = await soloDueno()
  if (error) return error
  try {
    const [{ rows: detalle }, { rows: empresas }] = await Promise.all([
      dbGlobal().query(
        `SELECT empresa_id, to_char(dia, 'YYYY-MM-DD') AS dia, modulo, modelo, usuario, usos,
                entrada::float AS entrada, salida::float AS salida, busquedas::float AS busquedas, costo::float AS costo
         FROM plataforma_uso_ia_detalle($1::date) ORDER BY dia`, [IA_MEDIR_DESDE]),
      dbGlobal().query(
        `SELECT e.id, e.nombre, e.country, o.estado = 'propietario' AS propietario, e.ia_limite_mes AS limite
         FROM empresas e JOIN organizaciones o ON o.id = e.organizacion_id ORDER BY e.id`),
    ])
    // Créditos: los mismos que ve el cliente (cupoIA). Clientes (mig. 156): usados desde el cambio a saldo, de todo lo
    // recibido (prueba + primer plan + recargas); la propietaria, del mes.
    // De a UNA empresa con conEmpresa (devuelve la conexión al terminar con ella). NUNCA dbEmpresa en un
    // bucle: retiene una conexión por empresa hasta el final del request y con más empresas que
    // conexiones del pool (10) trababa la copia entera (13-10: "Interno no sirve", Plataforma paralizada).
    for (const e of empresas) {
      const c = await conEmpresa(e.id, e.country as Country, db => cupoIA(db, e.id)).catch(() => null)
      e.creditos = c?.usados ?? null
      if (c) e.limite = c.limite
    }
    const hoy = currentDate()
    const dias = Math.round((Date.parse(hoy) - Date.parse(IA_MEDIR_DESDE)) / 864e5) + 1
    return NextResponse.json({ desde: IA_MEDIR_DESDE, dias, detalle, empresas })
  } catch (err) {
    return apiError(err)
  }
}
