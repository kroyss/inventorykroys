import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { mlFetch, ErrorML } from '@/lib/ml'

interface Variacion {
  id: number; available_quantity: number
  attribute_combinations?: { name?: string; value_name?: string | null }[]
}

// GET /api/preguntas/variantes?item=MLV… → variantes de la publicación (combinación y stock), leídas
// de ML al momento ("Ver variantes" en Preguntas, como en ML). De a una (/items/{id}?attributes=):
// en MLV el multiget responde 403.
export async function GET(req: NextRequest) {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  const item = req.nextUrl.searchParams.get('item') ?? ''
  if (!/^[A-Z]{3}\d+$/.test(item)) return NextResponse.json({ error: 'Publicación inválida' }, { status: 400 })
  try {
    const { rows: [q] } = await s.db.query(
      `SELECT conexion_id FROM ml_preguntas WHERE item_id = $1 ORDER BY fecha DESC LIMIT 1`, [item])
    if (!q) return NextResponse.json({ error: 'Publicación no encontrada' }, { status: 404 })
    const it = await mlFetch<{ variations?: Variacion[] }>(s.db, q.conexion_id, `/items/${item}?attributes=variations`)
    const vs = it.variations ?? []
    // Columnas: los atributos que combinan las variantes (Color, Talla…), en el orden de ML.
    const atributos = [...new Set(vs.flatMap(v => (v.attribute_combinations ?? []).map(a => a.name ?? '')))].filter(Boolean)
    const filas = vs.map(v => ({
      valores: atributos.map(n => v.attribute_combinations?.find(a => a.name === n)?.value_name ?? '—'),
      stock: v.available_quantity ?? 0,
    }))
    return NextResponse.json({ atributos, filas })
  } catch (err) {
    if (err instanceof ErrorML) return NextResponse.json({ error: `MercadoLibre: ${err.message}` }, { status: 502 })
    return apiError(err)
  }
}
