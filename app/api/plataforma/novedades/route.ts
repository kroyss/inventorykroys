import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { dbGlobal } from '@/lib/db'
import { soloDueno } from '@/lib/plataforma'
import { MODULOS } from '@/lib/modulos'

// Plataforma → Interno → Novedades (migración 095): escribir, publicar, despublicar y borrar.
const Novedad = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  titulo: z.string().trim().min(1).max(40),
  texto: z.string().trim().min(1).max(280),
  modulo: z.enum(Object.keys(MODULOS) as [string, ...string[]]).nullable(),
  enlace: z.string().trim().max(120).regex(/^\/[\w\-/?=&]*$/, 'El enlace es una dirección del sistema, como /mensajes').nullable(),
})

export async function GET() {
  const g = await soloDueno()
  if ('error' in g) return g.error
  try {
    const { rows } = await dbGlobal().query(
      `SELECT id, to_char(fecha, 'YYYY-MM-DD') AS fecha, titulo, texto, modulo, enlace, publicada_at
       FROM novedades ORDER BY (publicada_at IS NULL) DESC, fecha DESC, id DESC LIMIT 200`)
    return NextResponse.json({ novedades: rows })
  } catch (err) {
    return apiError(err)
  }
}

export async function POST(req: NextRequest) {
  const g = await soloDueno()
  if ('error' in g) return g.error
  try {
    const b = Novedad.parse(await req.json())
    const { rows: [n] } = await dbGlobal().query(
      `INSERT INTO novedades (fecha, titulo, texto, modulo, enlace) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [b.fecha, b.titulo, b.texto, b.modulo, b.enlace || null])
    return NextResponse.json({ ok: true, id: n.id })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message }, { status: 400 })
    return apiError(err)
  }
}

/** PUT { id, ...campos } edita · PUT { id, publicar: true|false } publica o la vuelve borrador. */
export async function PUT(req: NextRequest) {
  const g = await soloDueno()
  if ('error' in g) return g.error
  try {
    const body = await req.json()
    const id = z.number().int().positive().parse(body?.id)
    if (typeof body?.publicar === 'boolean') {
      await dbGlobal().query(
        `UPDATE novedades SET publicada_at = CASE WHEN $2 THEN COALESCE(publicada_at, NOW()) ELSE NULL END WHERE id = $1`,
        [id, body.publicar])
      return NextResponse.json({ ok: true })
    }
    const b = Novedad.parse(body)
    await dbGlobal().query(
      `UPDATE novedades SET fecha = $2, titulo = $3, texto = $4, modulo = $5, enlace = $6 WHERE id = $1`,
      [id, b.fecha, b.titulo, b.texto, b.modulo, b.enlace || null])
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message }, { status: 400 })
    return apiError(err)
  }
}

export async function DELETE(req: NextRequest) {
  const g = await soloDueno()
  if ('error' in g) return g.error
  try {
    const id = z.coerce.number().int().positive().parse(req.nextUrl.searchParams.get('id'))
    await dbGlobal().query(`DELETE FROM novedades WHERE id = $1`, [id])
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Falta el id' }, { status: 400 })
    return apiError(err)
  }
}
