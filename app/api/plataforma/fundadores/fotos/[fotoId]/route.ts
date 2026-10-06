import { NextRequest, NextResponse } from 'next/server'
import { readFile, unlink } from 'fs/promises'
import { apiError } from '@/lib/apiError'
import { dbGlobal } from '@/lib/db'
import { soloDueno } from '@/lib/plataforma'

// GET /api/plataforma/fundadores/fotos/[fotoId] → la imagen · DELETE → la borra (archivo y fila).
async function foto(fotoId: string) {
  if (!/^\d+$/.test(fotoId)) return null
  const { rows: [f] } = await dbGlobal().query(`SELECT id, archivo, tipo FROM fundadores_fotos WHERE id = $1`, [fotoId])
  return f ?? null
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ fotoId: string }> }) {
  const { error } = await soloDueno()
  if (error) return error
  try {
    const f = await foto((await params).fotoId)
    if (!f) return NextResponse.json({ error: 'Foto no encontrada' }, { status: 404 })
    const data = await readFile(f.archivo)
    return new NextResponse(new Uint8Array(data), { headers: { 'Content-Type': f.tipo, 'Cache-Control': 'private, max-age=86400' } })
  } catch (err) {
    return apiError(err)
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ fotoId: string }> }) {
  const { error } = await soloDueno()
  if (error) return error
  try {
    const f = await foto((await params).fotoId)
    if (!f) return NextResponse.json({ error: 'Foto no encontrada' }, { status: 404 })
    await dbGlobal().query(`DELETE FROM fundadores_fotos WHERE id = $1`, [f.id])
    await unlink(f.archivo).catch(() => {})
    return NextResponse.json({ ok: true })
  } catch (err) {
    return apiError(err)
  }
}
