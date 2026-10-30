import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { dbGlobal } from '@/lib/db'
import { soloDueno } from '@/lib/plataforma'
import { responderCaso } from '@/lib/soporte'

// POST /api/plataforma/casos-soporte/[id] { texto } → responder al cliente (le llega en la burbuja y por Telegram).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await soloDueno()
  if (error) return error
  const { id } = await params
  const b = await req.json().catch(() => null) as { texto?: string } | null
  const texto = (b?.texto ?? '').trim().slice(0, 4000)
  if (!texto) return NextResponse.json({ error: 'Escribe la respuesta' }, { status: 400 })
  try {
    await responderCaso(Number(id), texto, Number(session.user.id))
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof Error && err.message === 'Caso no encontrado') return NextResponse.json({ error: err.message }, { status: 404 })
    return apiError(err)
  }
}

// PUT /api/plataforma/casos-soporte/[id] { estado: 'resuelto' | 'abierto' }
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await soloDueno()
  if (error) return error
  const { id } = await params
  const b = await req.json().catch(() => null) as { estado?: string } | null
  if (b?.estado !== 'resuelto' && b?.estado !== 'abierto') return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
  try {
    await dbGlobal().query(`UPDATE soporte_casos SET estado = $2, updated_at = NOW() WHERE id = $1`, [Number(id), b.estado])
    return NextResponse.json({ ok: true })
  } catch (err) {
    return apiError(err)
  }
}
