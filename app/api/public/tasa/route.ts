import { NextResponse } from 'next/server'
import { getPublicRates } from '@/lib/publicRates'

// Público, sin sesión — usado por /tasa (board de lectura para empleados)
// y por el botón "Actualizar" de esa página. Solo lee la última tasa
// cacheada, no dispara fetch a fuentes externas.
export async function GET() {
  return NextResponse.json(await getPublicRates())
}
