import { NextRequest, NextResponse } from 'next/server'
import { sesionPublicaciones } from '@/lib/preguntasSesion'
import { subirFoto } from '@/lib/publicacionesML'

const MAX_MB = 10

// POST (multipart, campo "foto") → la sube a MercadoLibre y devuelve { id, url }. Queda en la publicación recién al guardar.
export async function POST(req: NextRequest, { params }: { params: Promise<{ item: string }> }) {
  const s = await sesionPublicaciones()
  if ('error' in s) return s.error
  const { item } = await params
  if (!/^M[A-Z]{2}\d{6,15}$/.test(item)) return NextResponse.json({ error: 'Publicación no válida' }, { status: 400 })
  const form = await req.formData().catch(() => null)
  const f = form?.get('foto')
  if (!(f instanceof File)) return NextResponse.json({ error: 'Falta la foto' }, { status: 400 })
  if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return NextResponse.json({ error: 'La foto tiene que ser JPG, PNG o WEBP' }, { status: 400 })
  if (f.size > MAX_MB * 1024 * 1024) return NextResponse.json({ error: `La foto pesa más de ${MAX_MB} MB` }, { status: 400 })
  try {
    return NextResponse.json(await subirFoto(s.db, item, f, f.name || 'foto.jpg'))
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'No se pudo subir la foto' }, { status: 502 })
  }
}
