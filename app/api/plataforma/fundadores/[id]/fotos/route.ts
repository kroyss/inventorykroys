import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { apiError } from '@/lib/apiError'
import { dbGlobal } from '@/lib/db'
import { soloDueno } from '@/lib/plataforma'
import { UPLOAD_DIR } from '@/lib/uploads'

const TIPOS: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }
const MAX = 5 * 1024 * 1024

// POST /api/plataforma/fundadores/[id]/fotos (multipart, campo "foto") → agrega una foto a la nota
// interna del postulante (migración 071). Solo el dueño de la plataforma.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await soloDueno()
  if (error) return error
  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  try {
    const form = await req.formData()
    const f = form.get('foto')
    if (!(f instanceof File)) return NextResponse.json({ error: 'Falta la foto' }, { status: 400 })
    const ext = TIPOS[f.type]
    if (!ext) return NextResponse.json({ error: 'Solo imágenes (PNG, JPG, WEBP o GIF)' }, { status: 400 })
    if (f.size > MAX) return NextResponse.json({ error: 'La foto pasa de 5 MB' }, { status: 400 })
    const { rows: [s] } = await dbGlobal().query(`SELECT id FROM fundadores_solicitudes WHERE id = $1`, [id])
    if (!s) return NextResponse.json({ error: 'Postulación no encontrada' }, { status: 404 })

    const dir = path.join(UPLOAD_DIR, 'fundadores', id)
    await mkdir(dir, { recursive: true })
    const archivo = path.join(dir, `${randomUUID()}.${ext}`)
    await writeFile(archivo, Buffer.from(await f.arrayBuffer()))
    const { rows: [r] } = await dbGlobal().query(
      `INSERT INTO fundadores_fotos (solicitud_id, archivo, tipo) VALUES ($1, $2, $3) RETURNING id`, [id, archivo, f.type])
    return NextResponse.json({ id: r.id })
  } catch (err) {
    return apiError(err)
  }
}
