import type { Pool } from 'pg'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { ErrorML, mlFetch } from '@/lib/ml'
import { registrarUso } from '@/lib/usoAcciones'

// Publicación pausada por falta de stock: MercadoLibre no deja responder sus preguntas ("Item must be
// active"). Desde la misma pregunta (admin): GET → stock actual y variantes · POST { cantidad, variante_id? }
// → cambia SOLO la cantidad (ML la reactiva al tener stock) y devuelve el estado con que quedó.
interface ItemML {
  status: string; sub_status?: string[]; available_quantity: number
  variations?: { id: number; available_quantity: number; attribute_combinations?: { name: string; value_name: string | null }[] }[]
}

async function datos(id: string) {
  const s = await sesionPreguntas(true)
  if ('error' in s) return { error: s.error } as const
  if (!/^\d+$/.test(id)) return { error: NextResponse.json({ error: 'Pregunta inválida' }, { status: 400 }) } as const
  const { rows: [q] } = await s.db.query(`SELECT conexion_id, item_id FROM ml_preguntas WHERE id = $1`, [id])
  if (!q) return { error: NextResponse.json({ error: 'Pregunta no encontrada' }, { status: 404 }) } as const
  return { s, q } as const
}

const leerItem = (db: Pool, q: { conexion_id: number; item_id: string }) =>
  mlFetch<ItemML>(db, q.conexion_id, `/items/${q.item_id}?attributes=status,sub_status,available_quantity,variations`)

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const d = await datos((await params).id)
  if ('error' in d) return d.error
  try {
    const it = await leerItem(d.s.db, d.q)
    return NextResponse.json({
      estado: it.status, disponible: it.available_quantity,
      variantes: (it.variations ?? []).map(v => ({
        id: String(v.id), disponible: v.available_quantity,
        nombre: (v.attribute_combinations ?? []).map(a => a.value_name ?? '—').join(' · ') || `Variante ${v.id}`,
      })),
    })
  } catch (err) { return apiError(err) }
}

const Body = z.object({ cantidad: z.number().int().min(1).max(99999), variante_id: z.string().regex(/^\d+$/).nullable().optional() })

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const d = await datos((await params).id)
  if ('error' in d) return d.error
  try {
    const { cantidad, variante_id } = Body.parse(await req.json())
    const ruta = variante_id ? `/items/${d.q.item_id}/variations/${variante_id}` : `/items/${d.q.item_id}`
    try {
      await mlFetch(d.s.db, d.q.conexion_id, ruta, { method: 'PUT', body: { available_quantity: cantidad } })
    } catch (e) {
      if (e instanceof ErrorML && (e.status === 403 || e.status === 401)) {
        return NextResponse.json({ error: 'Esta cuenta no dio permiso para cambiar publicaciones: reconéctala en Cuentas de MercadoLibre' }, { status: 403 })
      }
      if (e instanceof ErrorML) return NextResponse.json({ error: `MercadoLibre no aceptó el stock (${e.message})` }, { status: 502 })
      throw e
    }
    const it = await leerItem(d.s.db, d.q)
    // Lo que quedó: el estado de la publicación en sus preguntas y el stock en Stock.
    await d.s.db.query(`UPDATE ml_preguntas SET item_estado = $2 WHERE item_id = $1`, [d.q.item_id, it.status])
    await d.s.db.query(
      `UPDATE ml_stock_alertas SET disponible = $3, agotada_desde = NULL WHERE item_id = $1 AND variante_id = $2::bigint`,
      [d.q.item_id, variante_id ?? '0', cantidad])
    await registrarUso(d.s.db, 'stock', 1)
    return NextResponse.json({ estado: it.status })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Cantidad inválida (de 1 a 99.999)' }, { status: 400 })
    return apiError(err)
  }
}
