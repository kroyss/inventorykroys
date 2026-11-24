import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'

// POST /api/mensajes/pendiente-ia { pack_id } (24-11, mig 199): «Listo» en una conversación «Pendiente de la IA» que se
// resolvió sin escribir (si alguien del equipo escribe en ella, sale sola de Por atender).
const Body = z.object({ pack_id: z.string().regex(/^\d{5,25}$/) })

export async function POST(req: NextRequest) {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  const r = Body.safeParse(await req.json().catch(() => null))
  if (!r.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  try {
    await s.db.query(`UPDATE ml_conversaciones SET pendiente_ia_at = NULL WHERE pack_id = $1::bigint`, [r.data.pack_id])
    return NextResponse.json({ ok: true })
  } catch (err) {
    return apiError(err)
  }
}
