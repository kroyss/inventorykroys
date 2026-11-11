import { NextRequest, NextResponse } from 'next/server'
import { GET as avisos } from '@/app/api/avisos/route'
import { GET as novedades } from '@/app/api/novedades/route'
import { GET as aprendizaje } from '@/app/api/aprendizaje/route'
import { GET as soporte } from '@/app/api/soporte/route'
import { GET as cola } from '@/app/api/cola-ml/route'

// GET /api/comun?q=avisos,novedades,aprendizaje,soporte,cola (12-11, rapidez fase 1)
// Lo que piden TODAS las pantallas (menú, avisos, ayuda, cola de ML) en un solo pedido: antes eran 7–9 pedidos
// sueltos al abrir cada pantalla. Cada parte es el mismo GET de siempre (mismos permisos y respuesta), corridos
// en paralelo; si una falla, solo esa vuelve con su estado y las demás siguen. Lo junta components/../lib/comun.ts.
const PARTES = {
  avisos: () => avisos(),
  novedades: () => novedades(),
  aprendizaje: () => aprendizaje(),
  soporte: () => soporte(),
  cola: (req: NextRequest) => cola(new NextRequest(new URL('/api/cola-ml', req.url))),
} as const
type Parte = keyof typeof PARTES

export async function GET(req: NextRequest) {
  const pedidas = (req.nextUrl.searchParams.get('q') ?? '').split(',').filter((k): k is Parte => k in PARTES)
  const out: Record<string, { status: number; data: unknown }> = {}
  await Promise.all([...new Set(pedidas)].map(async k => {
    try {
      const r = await PARTES[k](req)
      out[k] = { status: r.status, data: r.ok ? await r.json() : null }
    } catch {
      out[k] = { status: 500, data: null }
    }
  }))
  return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' } })
}
