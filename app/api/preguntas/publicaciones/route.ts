import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'

// GET /api/preguntas/publicaciones?cuenta=PIKEKE&q=bolsa grande → publicaciones ACTIVAS y con stock de
// esa cuenta cuyo título tiene todas las palabras (sin importar acentos). Es el "#bolsa" de las
// respuestas en Preguntas y Mensajes: se busca en ml_catalogo (ya sincronizado), no en ML.
const SIN_ACENTOS = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export async function GET(req: NextRequest) {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  const cuenta = req.nextUrl.searchParams.get('cuenta') ?? ''
  const palabras = SIN_ACENTOS(req.nextUrl.searchParams.get('q') ?? '')
    .split(/\s+/).map(p => p.replace(/[%_\\]/g, '')).filter(p => p.length >= 2).slice(0, 5)
  if (!cuenta || !palabras.length) return NextResponse.json([])
  try {
    const titulo = `translate(lower(m.titulo), 'áéíóúüñ', 'aeiouun')`
    const { rows } = await s.db.query(
      `SELECT m.item_id, m.titulo, m.precio::float, m.moneda, m.disponible, m.permalink, m.thumbnail
       FROM ml_catalogo m JOIN ml_conexiones x ON x.id = m.conexion_id
       WHERE x.nickname = $1 AND m.estado = 'active' AND COALESCE(m.disponible, 0) > 0 AND m.permalink IS NOT NULL
         AND ${titulo} LIKE ALL ($2::text[])
       ORDER BY (${titulo} LIKE $3) DESC, m.disponible DESC, m.titulo
       LIMIT 8`,
      [cuenta, palabras.map(p => `%${p}%`), `${palabras[0]}%`])
    return NextResponse.json(rows)
  } catch (err) {
    return apiError(err)
  }
}
