import { NextResponse } from 'next/server'
import { cifrasRadar } from '@/lib/despegue'

// GET /api/radar/cifras → las cifras del Radar en vivo (públicas, guardadas 1 h; si el Radar no responde, las de respaldo).
// Las usa la ventanita «¿Qué es el Radar?» de Mi plan (12-11).
export async function GET() {
  const c = await cifrasRadar()
  return NextResponse.json({ cifras: c.slice(0, 3).map((x, i) => ({ n: x.n, d: ['productos', 'categorías', 'búsquedas en tendencia'][i] ?? x.d })) })
}
