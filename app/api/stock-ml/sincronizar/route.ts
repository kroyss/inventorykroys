import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { sesionStockML } from '@/lib/preguntasSesion'
import { sincronizarPublicaciones } from '@/lib/stockML'

// POST /api/stock-ml/sincronizar → lee ya un lote de publicaciones vencidas (la pantalla
// repite hasta que no quede ninguna). Solo lee de ML.
export async function POST() {
  const s = await sesionStockML()
  if ('error' in s) return s.error
  try {
    return NextResponse.json(await sincronizarPublicaciones(s.db))
  } catch (err) {
    return apiError(err)
  }
}
