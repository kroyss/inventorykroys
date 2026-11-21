import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { dbGlobal } from '@/lib/db'
import { ORGANIZACION_PLATAFORMA } from '@/lib/empresa'
import { soloDueno } from '@/lib/plataforma'
import { infoInventario } from '@/lib/pruebaInventario'

// Plataforma → ficha del cliente → «Prueba de Inventario» (21-11-2026, mig. 193).
//   GET  → { oferta, desde, hasta, quedan, conInventario, plan }
//   POST { oferta } → prende/apaga la OFERTA (el aviso arriba y el plan Completo en Mi plan). No toca una prueba ya
//        activada ni el módulo: eso lo decide el cliente (y el vencimiento).
const Body = z.object({ oferta: z.boolean() })

async function validar(params: Promise<{ id: string }>) {
  const { error } = await soloDueno()
  if (error) return { error }
  const { id } = await params
  if (!/^\d+$/.test(id)) return { error: NextResponse.json({ error: 'ID inválido' }, { status: 400 }) }
  if (Number(id) === ORGANIZACION_PLATAFORMA) return { error: NextResponse.json({ error: 'Es tu organización' }, { status: 400 }) }
  return { id: Number(id) }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const v = await validar(params)
  if ('error' in v) return v.error
  try {
    const i = await infoInventario(v.id)
    if (!i) return NextResponse.json({ error: 'Organización no encontrada' }, { status: 404 })
    return NextResponse.json({ oferta: i.oferta, desde: i.desde, hasta: i.hasta, quedan: i.quedan, conInventario: i.conInventario, plan: i.plan, interna: i.interna })
  } catch (err) {
    return apiError(err)
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const v = await validar(params)
  if ('error' in v) return v.error
  try {
    const b = Body.parse(await req.json().catch(() => ({})))
    const { rowCount } = await dbGlobal().query(`UPDATE organizaciones SET inventario_oferta = $2 WHERE id = $1`, [v.id, b.oferta])
    if (!rowCount) return NextResponse.json({ error: 'Organización no encontrada' }, { status: 404 })
    await dbGlobal().query(`INSERT INTO organizacion_eventos (organizacion_id, tipo, detalle) VALUES ($1, 'oferta_inventario', $2)`,
      [v.id, b.oferta ? 'Oferta de Inventario prendida' : 'Oferta de Inventario apagada'])
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message }, { status: 400 })
    return apiError(err)
  }
}
