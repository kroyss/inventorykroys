import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { actualizarPromocionesEmpresa } from '@/lib/promocionesML'
import { sesionPromociones } from '@/lib/promocionesSesion'

export const maxDuration = 120

/** POST /api/promociones/actualizar → relee de MercadoLibre las campañas y precios de cada cuenta (solo lectura en ML). */
export async function POST() {
  const s = await sesionPromociones()
  if ('error' in s) return s.error
  try {
    const resultado = await actualizarPromocionesEmpresa(s.db)
    return NextResponse.json({ resultado })
  } catch (err) {
    return apiError(err)
  }
}
