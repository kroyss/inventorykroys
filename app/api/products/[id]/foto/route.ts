import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { puede } from '@/lib/permisos'
import { guardarFotoPropia, leerFotoPropia, quitarFotoPropia } from '@/lib/fotosProductos'

// Foto propia de un producto (13-11-2026, mig. 173). GET la muestra (cualquiera de la empresa) · PUT { imagen: dataURL }
// la cambia (ya achicada en el navegador a ~600 px) · DELETE vuelve a la de MercadoLibre. Cambiarla: quien ve Productos.
const MAX = 1_500_000
const Body = z.object({ imagen: z.string().regex(/^data:image\/(jpeg|webp);base64,/, 'Formato de imagen inválido').max(MAX * 1.4) })

async function sesion(id: string, cambiar: boolean) {
  if (!/^\d+$/.test(id)) return { error: NextResponse.json({ error: 'ID inválido' }, { status: 400 }) } as const
  const { session, db } = await getSessionDb()
  if (!session || !db) return { error: unauthorized() } as const
  if (cambiar && !puede(session.user, 'ver_productos')) return { error: forbidden() } as const
  return { db } as const
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await sesion((await params).id, false)
  if ('error' in s) return s.error
  try {
    const f = await leerFotoPropia(s.db, Number((await params).id))
    if (!f) return NextResponse.json({ error: 'Sin foto' }, { status: 404 })
    return new NextResponse(new Uint8Array(f.datos), { headers: { 'Content-Type': f.tipo, 'Cache-Control': 'private, max-age=31536000, immutable' } })
  } catch (err) {
    return apiError(err)
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const s = await sesion(id, true)
  if ('error' in s) return s.error
  try {
    const b = Body.parse(await req.json())
    const [cab, b64] = b.imagen.split(',')
    const datos = Buffer.from(b64, 'base64')
    if (datos.length > MAX) return NextResponse.json({ error: 'La foto es muy grande' }, { status: 400 })
    const ok = await guardarFotoPropia(s.db, Number(id), datos, cab.includes('webp') ? 'webp' : 'jpg')
    if (!ok) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return apiError(err)
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const s = await sesion(id, true)
  if ('error' in s) return s.error
  try {
    await quitarFotoPropia(s.db, Number(id))
    return NextResponse.json({ ok: true })
  } catch (err) {
    return apiError(err)
  }
}
