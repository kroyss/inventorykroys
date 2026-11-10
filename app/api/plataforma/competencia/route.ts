import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { dbGlobal } from '@/lib/db'
import { soloDueno } from '@/lib/plataforma'
import { cargarCompetencia, generarCompetencia } from '@/lib/iaCompetencia'

// Plataforma → Interno → Competencia (10-11, mig 161): nuestra IA contra el bot externo (Mercasist) de Gerardo y Urdaneta.
// Solo el dueño de la plataforma.
//   GET                                    → filas + resumen por empresa
//   POST { accion: 'cargar', dias }        → trae las preguntas respondidas fuera del sistema
//   POST { accion: 'generar' }             → genera nuestra respuesta para las siguientes 8 (la pantalla repite)
//   PATCH { id, marca, nota }              → Bien / Mal de nuestra respuesta
export async function GET() {
  const { error } = await soloDueno()
  if (error) return error
  try {
    const { rows } = await dbGlobal().query(
      `SELECT c.id, c.empresa_id, e.nombre AS empresa, c.fecha, c.item_titulo, c.item_permalink, c.pregunta, c.respuesta_ellos,
              c.segundos, c.respuesta_nuestra, c.decision, c.motivos, c.error, c.generada_at, c.marca, c.nota, c.costo::float AS costo
       FROM ia_competencia c JOIN empresas e ON e.id = c.empresa_id ORDER BY c.fecha DESC`)
    return NextResponse.json({ filas: rows })
  } catch (err) { return apiError(err) }
}

const Post = z.discriminatedUnion('accion', [
  z.object({ accion: z.literal('cargar'), dias: z.number().int().min(1).max(30) }),
  z.object({ accion: z.literal('generar') }),
])
export async function POST(req: NextRequest) {
  const { error } = await soloDueno()
  if (error) return error
  try {
    const b = Post.parse(await req.json())
    if (b.accion === 'cargar') return NextResponse.json({ nuevas: await cargarCompetencia(b.dias) })
    return NextResponse.json({ quedan: await generarCompetencia(8) })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}

const Patch = z.object({ id: z.number().int().positive(), marca: z.enum(['bien', 'mal']).nullable(), nota: z.string().trim().max(500).optional() })
export async function PATCH(req: NextRequest) {
  const { error } = await soloDueno()
  if (error) return error
  try {
    const b = Patch.parse(await req.json())
    await dbGlobal().query(
      `UPDATE ia_competencia SET marca = $2, nota = COALESCE($3, nota), marcada_at = NOW() WHERE id = $1`, [b.id, b.marca, b.nota ?? null])
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}
